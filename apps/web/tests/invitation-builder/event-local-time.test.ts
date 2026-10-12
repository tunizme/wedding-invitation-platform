import { validateWeddingData } from '../../src/features/invitations/wedding-data.schema';
import { describe, expect, it } from 'vitest';
import {
  eventIsoTime,
  eventLocalTime,
} from '../../src/features/invitations/event-local-time';
describe('declared event time zone input', () => {
  it('projects an instant and writes the event zone without depending on browser time zone', () => {
    expect(eventLocalTime('2027-01-10T03:00:00Z', 'Asia/Ho_Chi_Minh')).toBe(
      '2027-01-10T10:00:00',
    );
    expect(
      validateWeddingData({
        schemaVersion: 1,
        events: {
          ceremony: {
            datetime: eventIsoTime('2027-01-10T10:00', 'Asia/Ho_Chi_Minh'),
            timeZone: 'Asia/Ho_Chi_Minh',
          },
        },
      }).valid,
    ).toBe(true);
    expect(eventIsoTime('2027-01-10T10:00', 'Asia/Ho_Chi_Minh')).toBe(
      '2027-01-10T10:00:00+07:00',
    );
    expect(eventIsoTime('2027-01-10T10:00', 'America/New_York')).toBe(
      '2027-01-10T10:00:00-05:00',
    );
  });
  it('rejects DST gaps and repeated times instead of silently choosing an instant', () => {
    expect(() => eventIsoTime('2027-03-14T02:30', 'America/New_York')).toThrow(
      /không tồn tại/,
    );
    expect(() => eventIsoTime('2027-11-07T01:30', 'America/New_York')).toThrow(
      /lặp lại/,
    );
  });
  it('supports half-hour zones and rejects invalid calendar values or unknown zones', () => {
    expect(eventIsoTime('2027-01-10T10:00', 'Asia/Kolkata')).toBe(
      '2027-01-10T10:00:00+05:30',
    );
    expect(() => eventIsoTime('2027-02-30T10:00', 'Asia/Ho_Chi_Minh')).toThrow(
      /chưa hợp lệ/,
    );
    expect(() => eventIsoTime('2027-01-10T10:00', 'Invalid/Zone')).toThrow(
      /Múi giờ/,
    );
    expect(eventIsoTime('', 'Asia/Ho_Chi_Minh')).toBe('');
  });
});
