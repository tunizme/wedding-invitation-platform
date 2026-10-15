'use client';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import type {
  ResolvedAdvanced,
  CustomField,
} from '../document/editor-document';
import type { RenderContext, WeddingEvent, TextStyle } from '../document/types';
import { textStyle } from './primitives';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import carouselStyles from './carousel.module.css';
import { AssetImage } from './asset-image';

const labels = {
  vi: {
    next: 'Ảnh sau',
    previous: 'Ảnh trước',
    pause: 'Tạm dừng',
    resume: 'Tiếp tục',
    play: 'Phát video',
    send: 'Gửi phản hồi',
    sent: 'Đã ghi nhận phản hồi.',
    preview: 'Bản xem trước — không gửi dữ liệu',
    remind: 'Thêm vào lịch',
    guest: 'Khách mời',
  },
  en: {
    next: 'Next image',
    previous: 'Previous image',
    pause: 'Pause',
    resume: 'Resume',
    play: 'Play video',
    send: 'Submit response',
    sent: 'Your response was received.',
    preview: 'Preview — no data is submitted',
    remind: 'Add to calendar',
    guest: 'Guest',
  },
};
export async function publicInteraction(
  path: string,
  body?: unknown,
  key?: string,
  method = 'POST',
) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error('Không thể kết nối. Vui lòng thử lại.');
  const response = await fetch(base.replace(/\/$/, '') + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'Bạn gửi quá nhanh. Vui lòng thử lại sau.'
        : 'Không thể ghi nhận. Giữ nguyên dữ liệu và thử lại.',
    );
  return response.json();
}
const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const motionSnapshot = () => window.matchMedia(motionQuery).matches;

function Album({
  element,
  context,
  carousel,
  locale,
}: {
  element: ResolvedAdvanced;
  context: RenderContext;
  carousel: boolean;
  locale: 'vi' | 'en';
}) {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hovered, setHovered] = useState(false),
    ids = element.content.assetIds ?? [],
    t = labels[locale],
    c = element.content,
    layout = carousel
      ? c.carouselLayout === 'feature'
        ? 'feature'
        : 'stack'
      : 'classic',
    stage = useRef<HTMLDivElement>(null);
  const durationMs =
      (c.durationSec ?? (layout === 'classic' ? 1.5 : 0.65)) * 1000,
    delayMs = (c.delaySec ?? 0) * 1000;
  const reduced = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    () => true,
  );
  // Autoplay only on the published page; editor, preview and capture stay static.
  const autoplay =
    carousel && !!c.autoplay && ids.length > 1 && context.mode === 'public';
  useEffect(() => {
    if (!autoplay || paused || hovered || reduced) return;
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % ids.length),
      delayMs + durationMs + 2500,
    );
    return () => clearTimeout(timer);
  }, [
    autoplay,
    paused,
    hovered,
    reduced,
    index,
    ids.length,
    delayMs,
    durationMs,
  ]);
  if (!ids.length) return <p>{element.content.label}</p>;
  return (
    <div
      className={layout !== 'classic' ? carouselStyles.carousel : undefined}
      data-carousel-layout={carousel ? layout : undefined}
      onKeyDown={(event) => {
        if (!carousel || !['ArrowLeft', 'ArrowRight'].includes(event.key))
          return;
        event.preventDefault();
        setPaused(true);
        setIndex(
          (i) =>
            (i + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) %
            ids.length,
        );
      }}
      onFocusCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(true);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {layout !== 'classic' ? (
        <div
          ref={stage}
          className={carouselStyles.stage}
          data-layout={layout}
          style={
            {
              '--carousel-duration': `${durationMs}ms`,
              '--carousel-delay': `${delayMs}ms`,
            } as CSSProperties
          }
        >
          {ids.map((id, i) => {
            const current = index % ids.length;
            let offset = (i - current + ids.length) % ids.length;
            if (layout === 'feature' && offset > ids.length / 2)
              offset -= ids.length;
            if (
              (layout === 'stack' && offset > 2) ||
              (layout === 'feature' && Math.abs(offset) > 1)
            )
              return null;
            return (
              <div
                key={`${id}:${i}`}
                className={carouselStyles.card}
                data-active={offset === 0}
                data-offset={offset}
                aria-hidden={offset !== 0}
              >
                <div className={carouselStyles.cardImage}>
                  <AssetImage
                    source={context.assetUrls[id]}
                    alt={offset === 0 ? `${c.label} ${i + 1}` : ''}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          ref={stage}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: carousel ? '1fr' : 'repeat(2,minmax(0,1fr))',
            gap: 8,
            overflow: 'auto',
          }}
        >
          {(carousel ? [ids[index % ids.length]] : ids).map((id, i) => (
            <AssetImage
              key={id + ':' + i}
              source={context.assetUrls[id]}
              alt={
                element.content.label +
                ' ' +
                (carousel ? (index % ids.length) + 1 : i + 1)
              }
              style={{
                width: '100%',
                height: carousel ? '100%' : 140,
                objectFit: 'cover',
              }}
            />
          ))}
        </div>
      )}
      {carousel && (
        <nav
          aria-label={element.content.label}
          className={
            layout !== 'classic' ? carouselStyles.navigation : undefined
          }
        >
          <button
            type="button"
            aria-label={t.previous}
            className={layout !== 'classic' ? carouselStyles.arrow : undefined}
            disabled={ids.length < 2 || context.mode === 'capture'}
            onClick={() => setIndex((i) => (i + ids.length - 1) % ids.length)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span
            className={
              layout !== 'classic' ? carouselStyles.counter : undefined
            }
            aria-live={
              autoplay && !paused && !hovered && !reduced ? 'off' : 'polite'
            }
          >
            {' '}
            {layout === 'classic'
              ? `${(index % ids.length) + 1}/${ids.length}`
              : `${String((index % ids.length) + 1).padStart(2, '0')} / ${String(ids.length).padStart(2, '0')}`}{' '}
          </span>
          <button
            type="button"
            aria-label={t.next}
            className={layout !== 'classic' ? carouselStyles.arrow : undefined}
            disabled={ids.length < 2 || context.mode === 'capture'}
            onClick={() => setIndex((i) => (i + 1) % ids.length)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          {autoplay && (
            <button
              type="button"
              className={
                layout !== 'classic' ? carouselStyles.pause : undefined
              }
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? t.resume : t.pause}
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
export function validateFormAnswers(
  fields: CustomField[],
  answers: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const f of fields) {
    const v = answers[f.id];
    if (
      f.required &&
      (v === undefined || v === '' || (Array.isArray(v) && !v.length))
    ) {
      errors.push(f.label);
      continue;
    }
    if (v === undefined || v === '') continue;
    if (f.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(f.label);
    } else if (f.type === 'multiselect') {
      if (
        !Array.isArray(v) ||
        v.some((x) => typeof x !== 'string' || !f.options.includes(x))
      )
        errors.push(f.label);
    } else if (
      typeof v !== 'string' ||
      v.length > 1000 ||
      (f.type === 'select' && !f.options.includes(v)) ||
      (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ||
      (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v))
    )
      errors.push(f.label);
  }
  return errors;
}
function CustomForm({
  element,
  context,
  locale,
}: {
  element: ResolvedAdvanced;
  context: RenderContext;
  locale: 'vi' | 'en';
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [receipt, setReceipt] = useState(false),
    [attempt, setAttempt] = useState<{ key: string; body: string } | null>(
      null,
    ),
    fields = element.content.fields ?? [],
    t = labels[locale];
  const update = (id: string, v: unknown) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    setAttempt(null);
  };
  return (
    <form
      data-measure-content
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || receipt) return;
        if (context.mode !== 'public' || !context.invitation) {
          setMessage(t.preview);
          return;
        }
        const errors = validateFormAnswers(fields, answers);
        if (errors.length) {
          setMessage('Kiểm tra: ' + errors.join(', '));
          return;
        }
        const body = JSON.stringify({ answers });
        const request =
          attempt?.body === body ? attempt : { key: crypto.randomUUID(), body };
        setAttempt(request);
        setBusy(true);
        setMessage('');
        try {
          await publicInteraction(
            `/public/invitations/${context.invitation.slug}/forms/${element.id}/responses`,
            { answers },
            request.key,
          );
          setReceipt(true);
          setMessage(t.sent);
        } catch (c) {
          setMessage(c instanceof Error ? c.message : 'Lỗi kết nối');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{element.content.label}</h3>
      <fieldset
        disabled={busy || receipt}
        style={{ border: 0, padding: 0, display: 'grid', gap: 8 }}
      >
        {fields.map((f) => (
          <label key={f.id}>
            {f.label}
            {f.required ? ' *' : ''}
            {f.type === 'textarea' ? (
              <textarea
                value={String(answers[f.id] ?? '')}
                maxLength={1000}
                onChange={(e) => update(f.id, e.target.value)}
              />
            ) : f.type === 'select' ? (
              <select
                value={String(answers[f.id] ?? '')}
                onChange={(e) => update(f.id, e.target.value)}
              >
                <option value="">—</option>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : f.type === 'multiselect' ? (
              <select
                multiple
                value={(answers[f.id] as string[]) ?? []}
                onChange={(e) =>
                  update(
                    f.id,
                    [...e.target.selectedOptions].map((o) => o.value),
                  )
                }
              >
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type}
                value={String(answers[f.id] ?? '')}
                maxLength={1000}
                onChange={(e) =>
                  update(
                    f.id,
                    f.type === 'number' && e.target.value !== ''
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            )}
          </label>
        ))}
        <button type="submit">{busy ? '…' : t.send}</button>
      </fieldset>
      {message && <p role={receipt ? 'status' : 'alert'}>{message}</p>}
    </form>
  );
}
const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};
function GuestName({
  label,
  mode,
  verifiedName,
  style,
}: {
  label: string;
  mode: RenderContext['mode'];
  verifiedName?: string;
  style?: TextStyle;
}) {
  const name = useSyncExternalStore(
    subscribe,
    () =>
      (new URLSearchParams(window.location.search).has('g')
        ? ''
        : new URLSearchParams(window.location.search)
            .get('guest')
            ?.slice(0, 120)) ?? '',
    () => '',
  );
  return (
    <div
      data-guest-name
      data-measure-content
      style={style ? textStyle(style) : undefined}
    >
      {mode === 'public' && (verifiedName || name)
        ? verifiedName || name
        : label}
    </div>
  );
}
function Reminder({
  element,
  locale,
  mode,
}: {
  element: ResolvedAdvanced;
  mode: RenderContext['mode'];
  locale: 'vi' | 'en';
}) {
  const event = (
    element.content as typeof element.content & { event?: WeddingEvent }
  ).event;
  const date = new Date(event?.datetime ?? '');
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  const clean = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/[,;]/g, (x) => '\\' + x);
  // All-day dates belong to the event's time zone, not its UTC instant.
  let localDay: Date | null = null;
  if (Number.isFinite(date.getTime())) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: event?.timeZone ?? 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const part = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value);
      localDay = new Date(
        Date.UTC(part('year'), part('month') - 1, part('day')),
      );
    } catch {
      // Invalid event time zones cannot produce a trustworthy calendar file.
    }
  }
  const ics =
    Number.isFinite(date.getTime()) && localDay
      ? [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Tiem Lam Thiep//Invitation//VI',
          'BEGIN:VEVENT',
          `UID:${element.id}@tiemlamthiep`,
          `DTSTAMP:${stamp(date)}`,
          ...(element.content.allDay
            ? [
                `DTSTART;VALUE=DATE:${stamp(localDay).slice(0, 8)}`,
                `DTEND;VALUE=DATE:${stamp(new Date(localDay.getTime() + 86400000)).slice(0, 8)}`,
              ]
            : [
                `DTSTART:${stamp(date)}`,
                `DTEND:${stamp(new Date(date.getTime() + 3600000))}`,
              ]),
          `SUMMARY:${clean(element.content.label)}`,
          ...(element.content.description
            ? [`DESCRIPTION:${clean(element.content.description)}`]
            : []),
          `LOCATION:${clean(element.content.location || (event?.venue?.address ?? ''))}`,
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n')
      : '';
  return ics ? (
    <a
      href={'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics)}
      download="loi-moi.ics"
      tabIndex={mode === 'public' ? 0 : -1}
      onClick={(event) => {
        if (mode !== 'public') event.preventDefault();
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: '8px 16px',
        borderRadius: 3,
        textDecoration: 'none',
        fontSize: element.content.fontSize ?? 14,
        background: element.content.buttonColor,
        color: element.content.textColor,
      }}
    >
      {element.content.label || labels[locale].remind}
    </a>
  ) : (
    <span>{element.content.label}</span>
  );
}
export function AdvancedWidget({
  element,
  context,
  locale,
}: {
  element: ResolvedAdvanced;
  context: RenderContext;
  locale: 'vi' | 'en';
}) {
  const [video, setVideo] = useState(false),
    c = element.content;
  switch (element.type) {
    case 'Album':
    case 'Carousel':
      return (
        <Album
          element={element}
          context={context}
          carousel={element.type === 'Carousel'}
          locale={locale}
        />
      );
    case 'YouTube':
      return video && context.mode !== 'capture' ? (
        <iframe
          title={c.label}
          src={`https://www.youtube-nocookie.com/embed/${c.videoId}`}
          allow="fullscreen; picture-in-picture"
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      ) : (
        <button
          type="button"
          disabled={context.mode === 'capture'}
          onClick={() => setVideo(true)}
          style={{ width: '100%', height: '100%', position: 'relative' }}
        >
          {c.posterId ? (
            <AssetImage
              source={context.assetUrls[c.posterId]}
              alt={c.label}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            c.label
          )}
          <span>{labels[locale].play}</span>
        </button>
      );
    case 'Contact':
      return (
        <a
          href={`tel:${c.phone?.replace(/[ ()-]/g, '')}`}
          tabIndex={context.mode === 'public' ? 0 : -1}
          onClick={(event) => {
            if (context.mode !== 'public') event.preventDefault();
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            fontSize: c.fontSize ?? 16,
            gap: 8,
            padding: '8px 16px',
            borderRadius: 8,
            textDecoration: 'none',
            ...(c.buttonColor ? { background: c.buttonColor } : {}),
            ...(c.textColor ? { color: c.textColor } : {}),
          }}
        >
          {c.showIcon !== false && (
            <svg
              aria-hidden="true"
              width={c.iconSize ?? 18}
              height={c.iconSize ?? 18}
              style={{ color: c.iconColor ?? 'currentColor', flexShrink: 0 }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
            </svg>
          )}
          {c.label}
        </a>
      );
    case 'Reminder':
      return <Reminder element={element} locale={locale} mode={context.mode} />;
    case 'GuestName':
      return (
        <GuestName
          label={c.label}
          mode={context.mode}
          verifiedName={context.guestName}
          style={c.textStyle}
        />
      );
    case 'CustomForm':
      return <CustomForm element={element} context={context} locale={locale} />;
  }
}
