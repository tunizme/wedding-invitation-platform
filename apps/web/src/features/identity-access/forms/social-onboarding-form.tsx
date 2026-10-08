'use client';

import { useEffect, useState } from 'react';
import { ApiError, iamRequest, type AccessSession } from '../api/client';
import { sessionStore } from '../session/store';
import { authFlowMessage, reserveIntent } from '../session/auth-context-flow';
import { adoptIfCurrent } from '../session/refresh-coordinator';
import {
  clearPendingIntent,
  observeServerState,
  readSelector,
  selectorStore,
} from '../session/auth-selector';

interface OnboardingState {
  contextId: string;
  provider: 'GOOGLE' | 'FACEBOOK';
  status: 'PENDING_EMAIL' | 'PENDING_VERIFICATION';
  emailCandidate: string | null;
  expiresAt: string;
  csrfToken: string;
}

export function SocialOnboardingForm() {
  const [proof, setProof] = useState<string | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState<AccessSession | null>(null);

  useEffect(() => {
    const readProof = () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        'token',
      );
      if (!token) return;
      setProof(token);
      window.history.replaceState(null, '', window.location.pathname);
    };
    readProof();
    window.addEventListener('hashchange', readProof);
    void iamRequest<OnboardingState>('/auth/social-onboarding', {
      cookieAuth: true,
    })
      .then((value) => {
        setState(value);
        setEmail(value.emailCandidate ?? '');
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof ApiError && [401, 409].includes(reason.status)
            ? 'Phiên xác minh không còn hiệu lực. Vui lòng đăng nhập lại với nhà cung cấp.'
            : 'Không thể tải phiên xác minh. Vui lòng thử đăng nhập lại.',
        );
      });
    return () => window.removeEventListener('hashchange', readProof);
  }, []);

  async function submitEmail() {
    if (!state || pending) return;
    setPending(true);
    setError('');
    try {
      await iamRequest('/auth/social-onboarding/email', {
        method: 'POST',
        body: { email },
        cookieAuth: true,
        csrfToken: state.csrfToken,
      });
      setState({
        ...state,
        status: 'PENDING_VERIFICATION',
        emailCandidate: email.trim(),
      });
      setNotice('Đã gửi hướng dẫn xác minh email.');
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : 'Không thể gửi email.',
      );
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    if (!state || pending) return;
    setPending(true);
    try {
      await iamRequest('/auth/social-onboarding/verifications', {
        method: 'POST',
        cookieAuth: true,
        csrfToken: state.csrfToken,
      });
      setNotice('Đã gửi hướng dẫn xác minh email.');
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Không thể gửi lại email.',
      );
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!state || !proof || pending) return;
    setPending(true);
    setError('');
    try {
      const store = await selectorStore();
      const selected = await readSelector(store);
      if (
        selected.state !== 'SELECTED' ||
        selected.contextId !== state.contextId
      )
        throw new ApiError(409, 'SUPERSEDED');
      const reserved = await reserveIntent(store, 'ONBOARDING_COMPLETE');
      const admissionVersion = sessionStore.version();
      const result = await iamRequest<AccessSession>(
        '/auth/social-onboarding/verifications/confirm',
        {
          method: 'POST',
          body: { proof },
          cookieAuth: true,
          csrfToken: state.csrfToken,
          auth: { contextId: reserved.contextId, intentId: reserved.intentId },
          expectProtocol: true,
        },
      );
      const recorded = await observeServerState(
        store,
        reserved.contextId,
        result.contextRevision ?? reserved.revision,
        result.sessionTag ?? null,
        undefined,
        reserved.attemptId,
      );
      if (!recorded) throw new ApiError(409, 'SUPERSEDED');
      await clearPendingIntent(store, reserved.attemptId);
      setProof(null);
      if (
        !(await adoptIfCurrent(
          store,
          result,
          {
            contextId: reserved.contextId,
            sessionTag: result.sessionTag ?? '',
            contextRevision: result.contextRevision ?? reserved.revision,
          },
          admissionVersion,
        ))
      )
        throw new ApiError(409, 'SUPERSEDED');
      setCompleted(result);
    } catch (reason) {
      setProof(null);
      setError(
        authFlowMessage(reason) ??
          (reason instanceof ApiError && reason.status === 400
            ? 'Liên kết xác minh không còn hiệu lực. Vui lòng bắt đầu lại.'
            : reason instanceof ApiError && [401, 409].includes(reason.status)
              ? 'Phiên xác minh không còn hiệu lực. Vui lòng đăng nhập lại.'
              : 'Không thể hoàn tất xác minh.'),
      );
    } finally {
      setPending(false);
    }
  }

  if (completed) return <p>Đã đăng nhập với {completed.user.email}.</p>;
  if (error && !state)
    return (
      <div>
        <p role="alert">{error}</p>
        <a href="/login">Bắt đầu lại</a>
      </div>
    );
  if (!state) return <p>Đang tải…</p>;

  return (
    <section>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p>{notice}</p> : null}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
      </label>{' '}
      <button
        type="button"
        onClick={() => void submitEmail()}
        disabled={pending}
      >
        Gửi email xác minh
      </button>{' '}
      {state.status === 'PENDING_VERIFICATION' ? (
        <button type="button" onClick={() => void resend()} disabled={pending}>
          Gửi lại
        </button>
      ) : null}{' '}
      {proof ? (
        <button type="button" onClick={() => void confirm()} disabled={pending}>
          Hoàn tất xác minh
        </button>
      ) : null}
      {error ? <a href="/login">Bắt đầu lại</a> : null}
    </section>
  );
}
