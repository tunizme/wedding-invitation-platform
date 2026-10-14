'use client';
import { useEffect, useRef, useState } from 'react';
import {
  RsvpWidget,
  rsvpUncertainMessage,
  rsvpUnavailableMessage,
  rsvpRateLimitMessage,
  rsvpRetryMessage,
  rsvpFieldMessages,
  type RsvpFieldErrors,
} from '../invitation-builder/renderer/widgets/rsvp';
import {
  getPublicRsvpState,
  submitPublicRsvp,
  PublicRsvpError,
  type RsvpPayload,
  type RsvpState,
} from './rsvp-api';
function validateFields(payload: RsvpPayload): RsvpFieldErrors {
  const errors: RsvpFieldErrors = {};
  if ([...payload.name].length < 1 || [...payload.name].length > 120)
    errors.name = rsvpFieldMessages.name;
  if (
    payload.attendance === 'ATTENDING' &&
    (!Number.isInteger(payload.partySize) ||
      payload.partySize < 1 ||
      payload.partySize > 20)
  )
    errors.partySize = rsvpFieldMessages.partySize;
  if ([...payload.message].length > 1000)
    errors.message = rsvpFieldMessages.message;
  return errors;
}
export function PublicRsvp({
  locale = 'vi',
  slug,
  title,
  closedLabel = 'Đã đóng xác nhận',
  successLabel = 'Cảm ơn bạn đã phản hồi',
  nameLabel,
  submitLabel,
  buttonColor,
  buttonTextColor,
}: {
  locale?: 'vi' | 'en';
  slug: string;
  title: string;
  closedLabel?: string;
  successLabel?: string;
  nameLabel?: string;
  submitLabel?: string;
  buttonColor?: string;
  buttonTextColor?: string;
}) {
  const [name, setName] = useState(''),
    [attendance, setAttendance] =
      useState<RsvpPayload['attendance']>('ATTENDING'),
    [partySize, setPartySize] = useState('1'),
    [message, setMessage] = useState('');
  const [state, setState] = useState<RsvpState | null>(null),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false),
    [error, setError] = useState(''),
    [fieldErrors, setFieldErrors] = useState<RsvpFieldErrors>({}),
    [uncertain, setUncertain] = useState(false),
    [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(0);
  const pending = useRef<{ key: string; payload: RsvpPayload } | null>(null),
    sending = useRef(false),
    stateGeneration = useRef(0);
  useEffect(() => {
    let live = true;
    let polling = false;
    const poll = async () => {
      if (polling || document.visibilityState === 'hidden') return;
      polling = true;
      const generation = stateGeneration.current;
      try {
        const next = await getPublicRsvpState(slug);
        if (live && generation === stateGeneration.current) setState(next);
      } catch {
        if (live && generation === stateGeneration.current) setState(null);
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 30000);
    const focus = () => {
      void poll();
    };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [slug]);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const edited = () => {
    pending.current = null;
    setUncertain(false);
    setError('');
  };
  const submit = async () => {
    if (sending.current || retryAt > Date.now()) return;
    const payload: RsvpPayload = {
      name: name.trim(),
      attendance,
      partySize: attendance === 'DECLINED' ? 0 : Number(partySize),
      message: message.trim(),
    };
    const errors = validateFields(payload);
    setFieldErrors(errors);
    setError('');
    if (Object.keys(errors).length) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      // A persisted-but-lost receipt must remain replayable even after closure/unpublish.
      if (!pending.current) {
        const current = await getPublicRsvpState(slug);
        stateGeneration.current++;
        setState(current);
        if (!current.open || !current.available) return;
        pending.current = { key: crypto.randomUUID(), payload };
      }
      const attempt = pending.current;
      const receipt = await submitPublicRsvp(
        slug,
        attempt.key,
        attempt.payload,
      );
      if (
        !receipt ||
        typeof receipt.receiptId !== 'string' ||
        typeof receipt.acceptedAt !== 'string'
      )
        throw new PublicRsvpError(0, 'NETWORK_ERROR');
      setSuccess(true);
      setUncertain(false);
      pending.current = null;
    } catch (caught) {
      const failure = caught instanceof PublicRsvpError ? caught : null;
      if (!failure || failure.status === 0 || failure.status >= 500) {
        setUncertain(!!pending.current);
        setError(rsvpUncertainMessage);
      } else {
        pending.current = null;
        setUncertain(false);
        if (failure.code === 'RSVP_CLOSED' || failure.status === 404) {
          stateGeneration.current++;
          setState({ open: false, available: false });
          setError('Thiệp đã ngừng nhận phản hồi.');
        } else if (failure.status === 429) {
          setRetryAt(Date.now() + failure.retryAfter * 1000);
          setNow(Date.now());
          setError(rsvpRateLimitMessage(failure.retryAfter));
        } else
          setError(
            'Chưa gửi được phản hồi. Vui lòng kiểm tra thông tin và thử lại.',
          );
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const closed = !!state && (!state.open || !state.available);
  return (
    <RsvpWidget
      locale={locale}
      title={title}
      closedLabel={closedLabel}
      successLabel={successLabel}
      nameLabel={nameLabel}
      submitLabel={submitLabel}
      buttonColor={buttonColor}
      buttonTextColor={buttonTextColor}
      mode="public"
      displayState={
        success
          ? 'success'
          : closed && !uncertain
            ? 'closed'
            : busy
              ? 'submitting'
              : error || Object.keys(fieldErrors).length
                ? 'error'
                : 'open'
      }
      disabled={(!state && !uncertain) || retryAt > now}
      uncertain={uncertain}
      error={error}
      fieldErrors={fieldErrors}
      status={!state && !uncertain ? rsvpUnavailableMessage : undefined}
      retryLabel={
        retryAt > now
          ? rsvpRetryMessage(Math.ceil((retryAt - now) / 1000))
          : undefined
      }
      onSubmit={() => void submit()}
      onNewResponse={() => {
        setSuccess(false);
        setError('');
        pending.current = null;
      }}
      form={{
        name,
        attendance,
        partySize,
        message,
        change: (field, value) => {
          edited();
          const values = {
            name,
            attendance,
            partySize,
            message,
            [field]: value,
          };
          const next = validateFields({
            name: values.name.trim(),
            attendance: values.attendance as RsvpPayload['attendance'],
            partySize:
              values.attendance === 'DECLINED' ? 0 : Number(values.partySize),
            message: values.message.trim(),
          });
          setFieldErrors((previous) => {
            const updated = { ...previous };
            if (field === 'attendance') delete updated.partySize;
            else if (previous[field]) {
              if (next[field]) updated[field] = next[field];
              else delete updated[field];
            }
            return updated;
          });
          if (field === 'name') setName(value);
          else if (field === 'attendance')
            setAttendance(value as RsvpPayload['attendance']);
          else if (field === 'partySize') setPartySize(value);
          else setMessage(value);
        },
      }}
    />
  );
}
