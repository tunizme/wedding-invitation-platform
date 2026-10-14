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
  locale = 'vi',
  datetime,
  timeZone,
  accentColor = '#AABBCCFF',
  variant = 'classic',
}: {
  locale?: 'vi' | 'en';
  datetime: string;
  timeZone: string;
  accentColor: string;
  /** classic: tinted day; minimal: ring around the day; filled: round solid day. */
  variant?: 'classic' | 'minimal' | 'filled';
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
    <section
      aria-label={locale === 'vi' ? 'Lịch sự kiện' : 'Event calendar'}
      style={{ color: 'inherit' }}
    >
      <h3>
        {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
          month: 'long',
          year: 'numeric',
          timeZone,
        }).format(new Date(datetime))}
      </h3>
      <div
        role="grid"
        aria-label={`${locale === 'vi' ? 'Lịch tháng' : 'Calendar'} ${month}/${year}`}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}
      >
        {(locale === 'vi'
          ? WEEKDAYS
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        ).map((weekday) => (
          <span role="columnheader" key={weekday}>
            {weekday}
          </span>
        ))}
        {cells.map((value, index) => (
          <span
            role="gridcell"
            aria-current={value === day ? 'date' : undefined}
            key={index}
            style={
              value === day
                ? variant === 'minimal'
                  ? { boxShadow: `inset 0 0 0 2px ${accentColor}` }
                  : variant === 'filled'
                    ? { backgroundColor: accentColor, borderRadius: '50%' }
                    : { backgroundColor: accentColor }
                : undefined
            }
          >
            {value ?? ''}
          </span>
        ))}
      </div>
    </section>
  );
}
