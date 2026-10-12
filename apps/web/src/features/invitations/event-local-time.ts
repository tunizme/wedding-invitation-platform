/** Calendar values are interpreted in the event's declared IANA zone. */
export function eventLocalTime(iso: string, timeZone: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const part = (type: string) =>
      parts.find((entry) => entry.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
  } catch {
    return '';
  }
}

export function eventIsoTime(local: string, timeZone: string): string {
  if (!local) return '';
  const canonical = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)
    ? local + ':00'
    : local;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(canonical))
    throw new Error('Ngày và giờ chưa hợp lệ.');
  const calendar = Date.parse(canonical + 'Z');
  if (
    !Number.isFinite(calendar) ||
    new Date(calendar).toISOString().slice(0, 19) !== canonical
  )
    throw new Error('Ngày và giờ chưa hợp lệ.');
  const candidates = new Set<number>();
  // Sample both sides of a transition rather than assuming the browser zone or
  // the offset at UTC midnight. Reject repeated/gap wall times explicitly.
  for (const delta of [-48, -24, -6, 0, 6, 24, 48]) {
    const instant = calendar + delta * 3_600_000;
    const wall = eventLocalTime(new Date(instant).toISOString(), timeZone);
    if (!wall) throw new Error('Múi giờ IANA chưa hợp lệ.');
    const offset = Date.parse(wall + 'Z') - instant;
    const candidate = calendar - offset;
    if (
      eventLocalTime(new Date(candidate).toISOString(), timeZone) === canonical
    )
      candidates.add(candidate);
  }
  if (candidates.size !== 1)
    throw new Error(
      candidates.size
        ? 'Giờ này lặp lại khi đổi giờ mùa hè. Hãy nhập ISO với độ lệch múi giờ cụ thể.'
        : 'Giờ này không tồn tại trong múi giờ đã chọn.',
    );
  const offsetMinutes = (calendar - [...candidates][0]) / 60_000;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  return `${canonical}${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}
