import { describe, expect, it } from 'vitest';
import { parseGuestCsv } from '../../src/features/invitations/guest-csv';
describe('guest CSV import', () => {
  it('keeps Vietnamese accents, quoted commas, embedded newlines and duplicate names', () => {
    expect(
      parseGuestCsv(
        '\uFEFFname,group\r\n"Cô Mai, chú Nam","Gia đình"\r\n"Cô ""Mai""",Bạn bè\r\n"Cô Mai, chú Nam",Khác',
      ),
    ).toEqual([
      { name: 'Cô Mai, chú Nam', group: 'Gia đình' },
      { name: 'Cô "Mai"', group: 'Bạn bè' },
      { name: 'Cô Mai, chú Nam', group: 'Khác' },
    ]);
    expect(parseGuestCsv('Tên,Nhóm\n"An\nBình",Nhà gái')[0].name).toBe(
      'An\nBình',
    );
  });
  it('rejects malformed input before uploading any rows', () => {
    for (const text of [
      'wrong,header\nAn,A',
      'name,group\n"An,A',
      'name,group\n,Nhà gái',
      'name,group\nAn,A,extra',
      'name,group\n"An"bad,A',
    ])
      expect(() => parseGuestCsv(text)).toThrow();
  });
});
