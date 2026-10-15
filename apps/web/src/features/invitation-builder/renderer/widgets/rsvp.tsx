'use client';
import { useId, type CSSProperties } from 'react';
import styles from './widget-designs.module.css';
export type RsvpDisplayState =
  'open' | 'error' | 'validation-error' | 'submitting' | 'success' | 'closed';
export type RsvpFieldErrors = Partial<
  Record<'name' | 'partySize' | 'message', string>
>;
export const rsvpFieldMessages = {
  name: 'Tên cần 1–120 ký tự sau khi bỏ khoảng trắng ở hai đầu.',
  partySize: 'Số người phải là số nguyên từ 1 đến 20, gồm bạn.',
  message: 'Lời nhắn tối đa 1000 ký tự.',
};
export const rsvpUncertainMessage =
  'Chưa xác định được kết quả. Thử gửi lại để kiểm tra cùng lượt phản hồi.';
export const rsvpUnavailableMessage =
  'Đang kiểm tra trạng thái nhận phản hồi. Hãy thử lại khi có kết nối.';
export function rsvpRateLimitMessage(seconds: number) {
  return `Bạn đã gửi nhiều lượt. Thử lại sau ${seconds} giây.`;
}
export function rsvpRetryMessage(seconds: number) {
  return `Có thể thử lại sau ${seconds} giây.`;
}
type FormValues = {
  name: string;
  attendance: 'ATTENDING' | 'DECLINED';
  partySize: string;
  message: string;
  change: (
    field: 'name' | 'attendance' | 'partySize' | 'message',
    value: string,
  ) => void;
};
/** The live form and trusted capture use the same markup and dimensions. */
export function RsvpWidget({
  locale = 'vi',
  title,
  displayState,
  mode,
  closedLabel = 'Đã đóng xác nhận',
  successLabel = 'Cảm ơn bạn đã phản hồi',
  onSubmit,
  form,
  onNewResponse,
  disabled = false,
  error,
  status,
  retryLabel,
  uncertain = false,
  fieldErrors,
  design,
  attendanceLabel,
  inputBorderColor,
  nameLabel,
  submitLabel,
  buttonColor,
  buttonTextColor,
}: {
  locale?: 'vi' | 'en';
  /** Optional authored overrides of the form's name label, submit text and button colours. */
  design?: 'invitation';
  attendanceLabel?: string;
  inputBorderColor?: string;
  nameLabel?: string;
  submitLabel?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  title: string;
  displayState: RsvpDisplayState;
  mode: 'editor' | 'preview' | 'capture' | 'public';
  closedLabel?: string;
  successLabel?: string;
  onSubmit?: () => void;
  form?: FormValues;
  onNewResponse?: () => void;
  disabled?: boolean;
  error?: string;
  status?: string;
  retryLabel?: string;
  uncertain?: boolean;
  fieldErrors?: RsvpFieldErrors;
}) {
  const errorId = useId(),
    heading = <h3 style={{ margin: '0 0 8px', lineHeight: 1.2 }}>{title}</h3>;
  const statusStyle = { margin: '8px 0', fontSize: 14, lineHeight: '20px' };
  if (displayState === 'closed')
    return (
      <section aria-label={title}>
        {heading}
        <p role="status" style={statusStyle}>
          {closedLabel}
        </p>
      </section>
    );
  if (displayState === 'success')
    return (
      <section aria-label={title}>
        {heading}
        <p role="status" style={statusStyle}>
          {successLabel}
        </p>
        <button
          type="button"
          disabled={mode !== 'public'}
          onClick={onNewResponse}
        >
          {locale === 'vi' ? 'Gửi phản hồi mới' : 'Send another response'}
        </button>
      </section>
    );
  if (mode !== 'public' && mode !== 'capture' && design !== 'invitation')
    return (
      <section aria-label={title}>
        {heading}
        <button type="button" disabled>
          {locale === 'vi' ? 'Gửi xác nhận (xem trước)' : 'Send RSVP (preview)'}
        </button>
      </section>
    );
  const inert = mode !== 'public',
    fieldsDisabled = inert || displayState === 'submitting',
    labelStyle = { display: 'block' },
    fieldStyle = {
      display: 'block',
      boxSizing: 'border-box' as const,
      width: '100%',
      fontSize: 14,
      minHeight: 28,
    };
  const fields =
    fieldErrors ??
    (mode === 'capture' && displayState === 'validation-error'
      ? rsvpFieldMessages
      : {});
  const fieldError = (field: keyof RsvpFieldErrors) =>
    fields[field] ? (
      <p
        id={`${errorId}-${field}`}
        style={{ ...statusStyle, margin: '4px 0' }}
        role="alert"
      >
        {fields[field]}
      </p>
    ) : null;
  const errorText =
    error ?? (displayState === 'error' ? rsvpUncertainMessage : '');
  const retry =
    retryLabel ??
    (mode === 'capture' && displayState === 'error'
      ? rsvpRetryMessage(600)
      : '');
  return (
    <section
      aria-label={title}
      className={design === 'invitation' ? styles.rsvp : undefined}
      style={
        {
          '--rsvp-input-border': inputBorderColor ?? '#DEDEDEFF',
        } as CSSProperties
      }
    >
      {heading}
      <form
        aria-label={title}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!inert) onSubmit?.();
        }}
      >
        <label style={labelStyle}>
          {nameLabel || (locale === 'vi' ? 'Tên khách mời' : 'Guest name')}
          <input
            style={fieldStyle}
            required
            name="guestName"
            value={form?.name ?? ''}
            disabled={fieldsDisabled}
            aria-invalid={fields.name ? true : undefined}
            aria-describedby={fields.name ? `${errorId}-name` : undefined}
            onChange={(event) => form?.change('name', event.target.value)}
          />
        </label>
        {fieldError('name')}
        {design === 'invitation' ? (
          <fieldset className={styles.attendance} disabled={fieldsDisabled}>
            <legend>
              {attendanceLabel ||
                (locale === 'vi' ? 'Bạn sẽ tham dự chứ?' : 'Will you attend?')}
            </legend>
            {(['ATTENDING', 'DECLINED'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name={`${errorId}-attendance`}
                  value={value}
                  checked={(form?.attendance ?? 'ATTENDING') === value}
                  onChange={() => form?.change('attendance', value)}
                />
                {value === 'ATTENDING'
                  ? locale === 'vi'
                    ? 'Có, tôi sẽ tham dự'
                    : 'Yes, I will attend'
                  : locale === 'vi'
                    ? 'Tôi bận, rất tiếc không thể tham dự'
                    : 'Sorry, I cannot attend'}
              </label>
            ))}
          </fieldset>
        ) : (
          <label style={labelStyle}>
            {locale === 'vi' ? 'Tham dự' : 'Attendance'}
            <select
              style={fieldStyle}
              value={form?.attendance ?? 'ATTENDING'}
              disabled={fieldsDisabled}
              onChange={(event) =>
                form?.change('attendance', event.target.value)
              }
            >
              <option value="ATTENDING">
                {locale === 'vi' ? 'Có tham dự' : 'Attending'}
              </option>
              <option value="DECLINED">
                {locale === 'vi' ? 'Không tham dự' : 'Not attending'}
              </option>
            </select>
          </label>
        )}
        {form?.attendance !== 'DECLINED' && (
          <div>
            <label style={labelStyle}>
              {locale === 'vi'
                ? 'Số người (gồm bạn)'
                : 'Party size (including you)'}
              <input
                style={fieldStyle}
                type="number"
                min="1"
                max="20"
                value={form?.partySize ?? '1'}
                disabled={fieldsDisabled}
                aria-invalid={fields.partySize ? true : undefined}
                aria-describedby={
                  fields.partySize ? `${errorId}-partySize` : undefined
                }
                onChange={(event) =>
                  form?.change('partySize', event.target.value)
                }
              />
            </label>
            {fieldError('partySize')}
          </div>
        )}
        <label style={labelStyle}>
          {locale === 'vi' ? 'Lời nhắn' : 'Message'}
          <textarea
            style={{ ...fieldStyle, height: 40, resize: 'none' }}
            value={form?.message ?? ''}
            disabled={fieldsDisabled}
            aria-invalid={fields.message ? true : undefined}
            aria-describedby={fields.message ? `${errorId}-message` : undefined}
            onChange={(event) => form?.change('message', event.target.value)}
          />
        </label>
        {fieldError('message')}
        <button
          style={{
            marginTop: 8,
            minHeight: 28,
            ...(buttonColor
              ? { background: buttonColor, border: 0, borderRadius: 6 }
              : {}),
            ...(buttonTextColor ? { color: buttonTextColor } : {}),
          }}
          type="submit"
          disabled={fieldsDisabled || disabled}
        >
          {displayState === 'submitting'
            ? locale === 'vi'
              ? 'Đang gửi…'
              : 'Sending…'
            : uncertain
              ? locale === 'vi'
                ? 'Thử gửi lại'
                : 'Retry'
              : submitLabel ||
                (locale === 'vi' ? 'Gửi phản hồi' : 'Send response')}
        </button>
      </form>
      {status && (
        <p style={statusStyle} role="status">
          {status}
        </p>
      )}
      {errorText && (
        <p id={errorId} style={statusStyle} role="alert">
          {errorText}
        </p>
      )}
      {retry && (
        <p style={statusStyle} role="status">
          {retry}
        </p>
      )}
    </section>
  );
}
