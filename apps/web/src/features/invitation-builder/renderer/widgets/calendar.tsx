const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
function dateParts(datetime: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(datetime));
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}
export function CalendarWidget({
  datetime,
  timeZone,
  accentColor = '#AABBCCFF',
}: {
  datetime: string;
  timeZone: string;
  accentColor: string;
}) {
  let parts: ReturnType<typeof dateParts>;
  try {
    parts = dateParts(datetime, timeZone);
  } catch {
    return <p role="alert">Ngày giờ sự kiện không hợp lệ.</p>;
  }
  const year = Number(parts.year),
    month = Number(parts.month),
    day = Number(parts.day);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (first + 6) % 7,
    count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array.from(
    { length: Math.ceil((offset + count) / 7) * 7 },
    (_, i) => {
      const date = i - offset + 1;
      return date > 0 && date <= count ? date : null;
    },
  );
  return (
    <section aria-label="Lịch sự kiện" style={{ color: 'inherit' }}>
      <h3>
        {new Intl.DateTimeFormat('vi-VN', {
          month: 'long',
          year: 'numeric',
          timeZone,
        }).format(new Date(datetime))}
      </h3>
      <div
        role="grid"
        aria-label={`Lịch tháng ${month}/${year}`}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}
      >
        {WEEKDAYS.map((weekday) => (
          <span role="columnheader" key={weekday}>
            {weekday}
          </span>
        ))}
        {cells.map((value, index) => (
          <span
            role="gridcell"
            aria-current={value === day ? 'date' : undefined}
            key={index}
            style={value === day ? { backgroundColor: accentColor } : undefined}
          >
            {value ?? ''}
          </span>
        ))}
      </div>
    </section>
  );
}
