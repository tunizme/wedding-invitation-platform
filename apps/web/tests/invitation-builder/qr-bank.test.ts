import { describe, expect, it } from 'vitest';
import { createBankQrPayload } from '../../src/features/invitation-builder/document/qr-bank';

describe('browser bank QR payload parity', () => {
  it('matches the static/no-amount reviewed vector and keeps account digits as text', () => {
    expect(createBankQrPayload({ bin: '970436', account: '000123456789', recipientName: 'NGUYEN MINH ANH', message: 'Mung cuoi' })).toBe('00020101021138560010A0000007270126000697043601120001234567890208QRIBFTTA53037045802VN62130809Mung cuoi63041061');
  });
  it('does not encode an amount and rejects unrepresentable values', () => {
    const payload = createBankQrPayload({ bin: '970436', account: '123456789012', recipientName: 'NGUYEN MINH ANH' });
    const fields: string[] = [];
    for (let cursor = 0; cursor < payload.length - 8;) {
      const tag = payload.slice(cursor, cursor + 2), length = Number(payload.slice(cursor + 2, cursor + 4));
      fields.push(tag);
      cursor += 4 + length;
    }
    expect(fields).not.toContain('54');
    expect(() => createBankQrPayload({ bin: '970436', account: '123456', recipientName: 'NGUYEN MINH ANH', message: 'Mừng cưới' })).toThrow();
  });
});
