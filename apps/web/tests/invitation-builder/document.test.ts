import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateTemplateDesign } from '../../src/features/invitation-builder/document/schema';
import { validateWeddingData } from '../../src/features/invitations/wedding-data.schema';
import { canonicalJson } from '../../src/features/invitation-builder/document/validation-helpers';

const directory = resolve(
  import.meta.dirname,
  '../../../../specs/004-invitation-builder/contracts/fixtures',
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
describe('web document and WeddingData contract', () => {
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
  it('normalizes optional null/whitespace fields but still rejects unknown null keys', () => {
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
  it('never puts supplied values or arbitrary field names into safe issues', () => {
    const result = validateWeddingData({
      schemaVersion: 1,
      events: { 'private-sentinel': { datetime: 'account-sentinel' } },
    });
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result)).not.toContain('sentinel');
  });
});
