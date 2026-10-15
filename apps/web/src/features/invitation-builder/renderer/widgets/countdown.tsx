'use client';
import { useEffect, useState } from 'react';
import styles from './widget-designs.module.css';
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
  locale = 'vi',
  datetime,
  timeZone,
  asOf,
  label,
  endedLabel,
  live = false,
  validationState,
  layout = 'horizontal',
  gap = 4,
  frameColor,
  design,
}: {
  layout?: 'horizontal' | 'vertical';
  gap?: number;
  frameColor?: string;
  design?: 'boxed';
  locale?: 'vi' | 'en';
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
  if (design === 'boxed') {
    const units = [
      [
        value.days,
        locale === 'vi' ? 'ngày' : 'days',
        locale === 'vi' ? 'Ngày' : 'Days',
      ],
      [
        value.hours,
        locale === 'vi' ? 'giờ' : 'hours',
        locale === 'vi' ? 'Giờ' : 'Hours',
      ],
      [
        value.minutes,
        locale === 'vi' ? 'phút' : 'minutes',
        locale === 'vi' ? 'Phút' : 'Minutes',
      ],
      [
        value.seconds,
        locale === 'vi' ? 'giây' : 'seconds',
        locale === 'vi' ? 'Giây' : 'Seconds',
      ],
    ];
    return (
      <section
        aria-label={label || (locale === 'vi' ? 'Đếm ngược' : 'Countdown')}
        data-time-zone={timeZone}
        data-countdown-design="boxed"
        className={styles.countdown}
        style={{
          gridTemplateColumns:
            layout === 'vertical' ? '1fr' : 'repeat(4, minmax(0, 1fr))',
          gap,
        }}
      >
        {units.map(([number, text, accessibleLabel]) => (
          <div
            key={text}
            aria-label={String(accessibleLabel)}
            className={styles.countdownUnit}
            style={{ backgroundColor: frameColor ?? '#000000FF' }}
          >
            <span>
              {number} {text}
            </span>
          </div>
        ))}
      </section>
    );
  }
  return (
    <section aria-label={label} data-time-zone={timeZone}>
      <span>{label}</span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: layout === 'vertical' ? '1fr' : 'repeat(4, 1fr)',
          gap,
          ...(frameColor
            ? {
                // Frame each unit via its children's outline.
                ['--countdown-frame' as string]: frameColor,
              }
            : {}),
        }}
      >
        <div
          aria-label={locale === 'vi' ? 'Ngày' : 'Days'}
          style={
            frameColor
              ? {
                  border: `1px solid ${frameColor}`,
                  borderRadius: 6,
                  padding: 4,
                }
              : undefined
          }
        >
          <span>{locale === 'vi' ? 'Ngày' : 'Days'}</span>
          <strong>{String(value.days).padStart(4, '0')}</strong>
        </div>
        <div
          aria-label={locale === 'vi' ? 'Giờ' : 'Hours'}
          style={
            frameColor
              ? {
                  border: `1px solid ${frameColor}`,
                  borderRadius: 6,
                  padding: 4,
                }
              : undefined
          }
        >
          <span>{locale === 'vi' ? 'Giờ' : 'Hours'}</span>
          <strong>{String(value.hours).padStart(2, '0')}</strong>
        </div>
        <div
          aria-label={locale === 'vi' ? 'Phút' : 'Minutes'}
          style={
            frameColor
              ? {
                  border: `1px solid ${frameColor}`,
                  borderRadius: 6,
                  padding: 4,
                }
              : undefined
          }
        >
          <span>{locale === 'vi' ? 'Phút' : 'Minutes'}</span>
          <strong>{String(value.minutes).padStart(2, '0')}</strong>
        </div>
        <div
          aria-label={locale === 'vi' ? 'Giây' : 'Seconds'}
          style={
            frameColor
              ? {
                  border: `1px solid ${frameColor}`,
                  borderRadius: 6,
                  padding: 4,
                }
              : undefined
          }
        >
          <span>{locale === 'vi' ? 'Giây' : 'Seconds'}</span>
          <strong>{String(value.seconds).padStart(2, '0')}</strong>
        </div>
      </div>
    </section>
  );
}
