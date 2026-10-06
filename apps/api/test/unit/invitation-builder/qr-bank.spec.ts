import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBankQrPayload, verifyBankQrPayload } from '../../../src/modules/invitation-builder/domain/qr-bank';

const fixtures = resolve(__dirname, '../../../../../specs/004-invitation-builder/contracts/fixtures');
const read = <T>(file: string) => JSON.parse(readFileSync(resolve(fixtures, file), 'utf8')) as T;
function independentCrc(input: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function readTlv(payload: string) {
  const fields: Record<string, string> = {};
  for (let cursor = 0; cursor < payload.length;) {
    const tag = payload.slice(cursor, cursor + 2), length = Number(payload.slice(cursor + 2, cursor + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(length)) throw new Error('Invalid TLV');
    cursor += 4;
    fields[tag] = payload.slice(cursor, cursor + length);
    if (fields[tag].length !== length) throw new Error('Truncated TLV');
    cursor += length;
  }
  return fields;
}

describe('VietQR static account transfer profile', () => {
  it('matches the reviewed static no-amount vector and retains leading zeroes', () => {
    const golden = read<{input: {bin: string; account: string; recipientName: string; message: string}; payload: string}>('qr-static.json');
    const payload = createBankQrPayload(golden.input);
    expect(payload).toBe(golden.payload);
    expect(payload).toContain('000123456789');
    expect(payload).not.toMatch(/540\d/);
    expect(verifyBankQrPayload(payload)).toBe(true);
  });

  it('independently validates the official dynamic amount example without treating it as producer output', () => {
    const example = read<{payload: string; profile: string}>('qr-provider-dynamic.json');
    expect(example.profile).toBe('provider-dynamic-amount-example');
    expect(verifyBankQrPayload(example.payload)).toBe(true);
    const prefix = example.payload.slice(0, -4);
    expect(example.payload.slice(-4)).toBe(independentCrc(prefix));
    const fields = readTlv(example.payload);
    expect(fields['01']).toBe('12');
    expect(fields['54']).toBe('79000');
    expect(fields['53']).toBe('704');
    expect(fields['58']).toBe('VN');
    expect(fields['38']).toContain('A000000727');
    expect(() => createBankQrPayload({ bin: '970436', account: '000123456789', recipientName: 'NGUYEN MINH ANH' })).not.toThrow();
  });

  it.each([
    { bin: '123456', account: '123456', recipientName: 'NGUYEN MINH ANH' },
    { bin: '970436', account: '12345x', recipientName: 'NGUYEN MINH ANH' },
    { bin: '970436', account: '123456', recipientName: 'A' },
    { bin: '970436', account: '123456', recipientName: 'NGUYEN MINH ANH', message: 'Mừng cưới' },
    { bin: '970436', account: '123456', recipientName: 'NGUYEN MINH ANH', message: 'x'.repeat(26) },
  ])('rejects values outside the reviewed bank profile', (input) => {
    expect(() => createBankQrPayload(input)).toThrow();
  });
});
