import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateTemplateDesign } from '../../../src/modules/invitation-builder/domain/document.validator';
import { validateWeddingData } from '../../../src/modules/invitations/domain/wedding-data.validator';
import {
  canonicalHash,
  canonicalJson,
} from '../../../src/modules/invitation-builder/domain/validation-helpers';

const directory = resolve(
  __dirname,
  '../../../../../specs/004-invitation-builder/contracts/fixtures',
);
const fixture = (file: string): unknown =>
  JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
const manifest = fixture('manifest.json') as {
  cases: {
    id: string;
    file: string;
    kind: string;
    expected: { valid?: boolean };
  }[];
};
describe('API document and WeddingData contract', () => {
  for (const entry of manifest.cases.filter((value) =>
    ['design', 'wedding'].includes(value.kind),
  )) {
    it(entry.id, () => {
      const result = (
        entry.kind === 'design' ? validateTemplateDesign : validateWeddingData
      )(fixture(entry.file));
      expect(
        result.valid,
        result.valid ? '' : JSON.stringify(result.issues),
      ).toBe(entry.expected.valid);
    });
  }
  it('normalizes optional null fields but rejects unknown fields even when null', () => {
    expect(
      validateWeddingData({
        schemaVersion: 1,
        bride: { name: '  Ánh  ' },
        events: { ceremony: null },
        bank: { account: '  ' },
      }),
    ).toEqual({
      valid: true,
      value: { schemaVersion: 1, bride: { name: 'Ánh' }, events: {}, bank: {} },
    });
    expect(
      validateWeddingData({ schemaVersion: 1, 'private-sentinel': null }).valid,
    ).toBe(false);
  });
  it('counts Unicode code points and rejects non-finite/prototype values', () => {
    expect(
      validateWeddingData({
        schemaVersion: 1,
        bride: { name: '💐'.repeat(120) },
      }).valid,
    ).toBe(true);
    expect(
      validateWeddingData({
        schemaVersion: 1,
        bride: { name: '💐'.repeat(121) },
      }).valid,
    ).toBe(false);
    expect(
      validateWeddingData({
        schemaVersion: 1,
        events: { ceremony: { venue: { latitude: NaN } } },
      }).valid,
    ).toBe(false);
    expect(
      validateWeddingData(
        JSON.parse('{"schemaVersion":1,"__proto__":{"leak":true}}'),
      ).valid,
    ).toBe(false);
    expect(() => canonicalJson({ value: Infinity })).toThrow();
  });
  it('rejects nonexistent local dates, offset mismatches and offset-only zones', () => {
    for (const event of [
      { datetime: '2027-02-30T10:00:00+07:00', timeZone: 'Asia/Ho_Chi_Minh' },
      { datetime: '2027-07-04T10:00:00-05:00', timeZone: 'America/New_York' },
      { datetime: '2027-03-14T02:30:00-05:00', timeZone: 'America/New_York' },
      { datetime: '2027-01-10T10:00:00+07:00', timeZone: '+07:00' },
    ])
      expect(
        validateWeddingData({ schemaVersion: 1, events: { ceremony: event } })
          .valid,
      ).toBe(false);
  });
  it('canonicalizes object keys, preserves array order and never leaks field values', () => {
    expect(canonicalHash({ b: [1, 2], a: 1 })).toBe(
      canonicalHash({ a: 1, b: [1, 2] }),
    );
    expect(canonicalHash({ b: [2, 1], a: 1 })).not.toBe(
      canonicalHash({ a: 1, b: [1, 2] }),
    );
    const result = validateWeddingData({
      schemaVersion: 1,
      events: { 'private-sentinel': { datetime: 'account-sentinel' } },
    });
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result)).not.toContain('sentinel');
  });
});
