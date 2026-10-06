'use client';
import { useEffect, useState } from 'react';
function remaining(datetime: string, asOf: string) {
  const target = new Date(datetime).getTime(),
    now = new Date(asOf).getTime();
  if (!Number.isFinite(target) || !Number.isFinite(now) || target <= now)
    return null;
  let seconds = Math.floor((target - now) / 1000);
  const days = Math.min(9999, Math.floor(seconds / 86_400));
  seconds %= 86_400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return { days, hours, minutes, seconds };
}
export function CountdownWidget({
  datetime,
  timeZone,
  asOf,
  label,
  endedLabel,
  live = false,
  validationState,
}: {
  datetime: string;
  timeZone: string;
  asOf: string;
  label: string;
  endedLabel: string;
  live?: boolean;
  validationState?: 'worst-case' | 'expired';
}) {
  const [clock, setClock] = useState(asOf);
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      setClock(new Date().toISOString());
      if (Date.now() >= new Date(datetime).getTime() && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    if (Date.now() < new Date(datetime).getTime())
      timer = setInterval(tick, 1000);
    tick();
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      if (timer !== undefined) clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [live, datetime]);
  const value =
    validationState === 'worst-case'
      ? { days: 9999, hours: 23, minutes: 59, seconds: 59 }
      : validationState === 'expired'
        ? null
        : remaining(datetime, live ? clock : asOf);
  if (value === null) return <p role="status">{endedLabel}</p>;
  return (
    <section aria-label={label} data-time-zone={timeZone}>
      <span>{label}</span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 4,
        }}
      >
        <div aria-label="Ngày">
          <span>Ngày</span>
          <strong>{String(value.days).padStart(4, '0')}</strong>
        </div>
        <div aria-label="Giờ">
          <span>Giờ</span>
          <strong>{String(value.hours).padStart(2, '0')}</strong>
        </div>
        <div aria-label="Phút">
          <span>Phút</span>
          <strong>{String(value.minutes).padStart(2, '0')}</strong>
        </div>
        <div aria-label="Giây">
          <span>Giây</span>
          <strong>{String(value.seconds).padStart(2, '0')}</strong>
        </div>
      </div>
    </section>
  );
}
