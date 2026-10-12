'use client';

import { Button } from '../../../ui/platform/button';
import Link from 'next/link';
import { Field } from '../../../ui/platform/field';
import { InlineAlert, LocalStatus } from '../../../ui/platform/feedback';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError, iamRequest, type AccessSession } from '../api/client';
import { sessionStore } from '../session/store';
import { useOperationLifetime } from '../session/operation-scope';
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
  const lifetime = useOperationLifetime('SocialOnboardingForm');
  const [initialLifetime] = useState(() => lifetime);
  const [initialEpoch] = useState(sessionStore.identityEpoch);
  const epoch = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.identityEpoch,
    () => 0,
  );
  const [proof, setProof] = useState<string | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState<AccessSession | null>(null);

  useEffect(() => {
    const scope = initialLifetime.capture();
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
        if (!scope.isActive()) return;
        setState(value);
        setEmail(value.emailCandidate ?? '');
      })
      .catch((reason: unknown) => {
        if (!scope.isActive()) return;
        setError(
          reason instanceof ApiError && [401, 409].includes(reason.status)
            ? 'Phiên xác minh không còn hiệu lực. Vui lòng đăng nhập lại với nhà cung cấp.'
            : 'Không thể tải phiên xác minh. Vui lòng thử đăng nhập lại.',
        );
      });
    return () => {
      scope.dispose();
      window.removeEventListener('hashchange', readProof);
    };
  }, [initialLifetime]);

  async function submitEmail() {
    if (epoch !== initialEpoch) return;
    const scope = lifetime.capture();
    if (!scope.isActive()) return;
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
      if (!scope.isActive()) return;
      setState({
        ...state,
        status: 'PENDING_VERIFICATION',
        emailCandidate: email.trim(),
      });
      setNotice('Đã gửi hướng dẫn xác minh email.');
    } catch (reason) {
      if (!scope.isActive()) return;
      setError(
        reason instanceof ApiError ? reason.message : 'Không thể gửi email.',
      );
    } finally {
      if (!scope.isActive()) return;
      setPending(false);
    }
  }

  async function resend() {
    if (epoch !== initialEpoch) return;
    const scope = lifetime.capture();
    if (!scope.isActive()) return;
    if (!state || pending) return;
    setPending(true);
    try {
      await iamRequest('/auth/social-onboarding/verifications', {
        method: 'POST',
        cookieAuth: true,
        csrfToken: state.csrfToken,
      });
      if (!scope.isActive()) return;
      setNotice('Đã gửi hướng dẫn xác minh email.');
    } catch (reason) {
      if (!scope.isActive()) return;
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Không thể gửi lại email.',
      );
    } finally {
      if (!scope.isActive()) return;
      setPending(false);
    }
  }

  async function confirm() {
    if (epoch !== initialEpoch) return;
    const scope = lifetime.capture();
    if (!state || !proof || pending) return;
    setPending(true);
    setError('');
    try {
      const store = await selectorStore();
      if (!scope.isActive()) return;
      const selected = await readSelector(store);
      if (!scope.isActive()) return;
      if (
        selected.state !== 'SELECTED' ||
        selected.contextId !== state.contextId
      )
        throw new ApiError(409, 'SUPERSEDED');
      const reserved = await reserveIntent(store, 'ONBOARDING_COMPLETE');
      if (!scope.isActive()) return;
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
      if (scope.isActive()) setProof(null);
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
      if (
        sessionStore.get()?.user.id === result.user.id &&
        sessionStore.get()?.sessionTag === result.sessionTag
      )
        setCompleted(result);
    } catch (reason) {
      if (!scope.isActive()) return;
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
      if (!scope.isActive()) return;
      setPending(false);
    }
  }

  if (
    completed &&
    sessionStore.get()?.user.id === completed.user.id &&
    sessionStore.get()?.sessionTag === completed.sessionTag
  )
    return (
      <div>
        <LocalStatus tone="success">
          Đã đăng nhập với {completed.user.email}.
        </LocalStatus>
        <Link href="/account">Đi đến tài khoản</Link>
      </div>
    );
  if (epoch !== initialEpoch)
    return (
      <InlineAlert tone="error">
        Phiên xác minh đã thay đổi. Vui lòng bắt đầu lại.
      </InlineAlert>
    );
  if (error && !state)
    return (
      <div>
        <InlineAlert tone="error">{error}</InlineAlert>
        <a href="/login">Bắt đầu lại</a>
      </div>
    );
  if (!state) return <LocalStatus tone="info">Đang tải…</LocalStatus>;

  return (
    <section>
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {notice ? <LocalStatus tone="info">{notice}</LocalStatus> : null}
      <Field
        id="social-onboarding-email"
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
      />{' '}
      <Button
        type="button"
        onClick={() => void submitEmail()}
        disabled={pending}
      >
        Gửi email xác minh
      </Button>{' '}
      {state.status === 'PENDING_VERIFICATION' ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => void resend()}
          disabled={pending}
        >
          Gửi lại
        </Button>
      ) : null}{' '}
      {proof ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => void confirm()}
          disabled={pending}
        >
          Hoàn tất xác minh
        </Button>
      ) : null}
      {error ? <a href="/login">Bắt đầu lại</a> : null}
    </section>
  );
}
