'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { iamRequest } from '../../../features/identity-access/api/client';
import { sessionStore } from '../../../features/identity-access/session/store';
import { bootstrapSession } from '../../../features/identity-access/session/refresh-coordinator';
import {
  clearPendingIntent,
  observeServerState,
  readSelector,
  selectorStore,
  type SelectorStore,
} from '../../../features/identity-access/session/auth-selector';

export default function OAuthResultPage() {
  const started = useRef(false);
  const [status, setStatus] = useState<
    'loading' | 'success' | 'error' | 'superseded'
  >('loading');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('result');
    const intentId = params.get('intent');
    window.history.replaceState(null, '', '/oauth-result');
    if (result === 'superseded') {
      queueMicrotask(() => setStatus('superseded'));
      return;
    }
    if (result !== 'success' || !intentId) {
      queueMicrotask(() => setStatus('error'));
      return;
    }

    let origin:
      | { store: SelectorStore; contextId: string; attemptId: string }
      | undefined;
    void (async () => {
      const store = await selectorStore();
      const selected = await readSelector(store);
      if (
        selected.state !== 'SELECTED' ||
        !selected.contextId ||
        selected.pendingIntent?.kind !== 'OAUTH' ||
        selected.pendingIntent.intentId !== intentId
      ) {
        setStatus('superseded');
        return;
      }

      origin = {
        store,
        contextId: selected.contextId,
        attemptId: selected.pendingIntent.attemptId,
      };

      // Confirming the existing binding reads the context's current slot tag.
      // The subsequent refresh verifies the actual cookie and acknowledges its emission.
      const confirmed = await iamRequest<{
        authProtocol: 2;
        contextId: string;
        revision: number;
        sessionTag: string | null;
      }>(`/auth/contexts/${selected.contextId}/confirm`, {
        method: 'POST',
        body: {},
        cookieAuth: true,
        auth: { contextId: selected.contextId },
        expectProtocol: true,
      });
      const synchronized = await observeServerState(
        store,
        selected.contextId,
        confirmed.revision,
        confirmed.sessionTag,
        undefined,
        selected.pendingIntent.attemptId,
      );
      if (!synchronized) {
        setStatus('superseded');
        return;
      }
      if (!confirmed.sessionTag) {
        setStatus('error');
        return;
      }
      await clearPendingIntent(store, selected.pendingIntent.attemptId);
      const scope = {
        contextId: selected.contextId,
        attemptId: selected.pendingIntent.attemptId,
        sessionTag: confirmed.sessionTag,
      };
      const session = await bootstrapSession(true, scope);
      // Decide and publish in the same selector transaction. A response/page
      // for A must never turn B's valid admission into A's success feedback.
      await store.transact((record) => {
        if (
          record?.state !== 'SELECTED' ||
          record.contextId !== scope.contextId ||
          record.attemptId !== scope.attemptId ||
          record.sessionTag !== scope.sessionTag
        ) {
          setStatus('superseded');
        } else {
          const admission = sessionStore.admission();
          setStatus(
            session &&
              sessionStore.get() === session &&
              admission?.contextId === scope.contextId &&
              admission.sessionTag === scope.sessionTag &&
              admission.contextRevision >= record.revision
              ? 'success'
              : 'error',
          );
        }
        return { result: undefined };
      });
    })().catch(async () => {
      if (!origin) {
        setStatus('error');
        return;
      }
      const { store, contextId, attemptId } = origin;
      await store
        .transact((record) => {
          setStatus(
            record?.contextId === contextId && record.attemptId === attemptId
              ? 'error'
              : 'superseded',
          );
          return { result: undefined };
        })
        .catch(() => setStatus('error'));
    });
  }, []);

  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Kết quả đăng nhập</h1>
      {status === 'loading' && <p role="status">Đang hoàn tất đăng nhập…</p>}
      {status === 'success' && <p role="status">Đăng nhập thành công.</p>}
      {status === 'superseded' && (
        <>
          <p role="status">
            Yêu cầu đăng nhập đã được thay thế bởi thao tác mới hơn.
          </p>
          <Link href="/login">Quay lại đăng nhập</Link>
        </>
      )}
      {status === 'error' && (
        <>
          <p role="alert">Không thể hoàn tất đăng nhập. Vui lòng thử lại.</p>
          <Link href="/login">Quay lại đăng nhập</Link>
        </>
      )}
    </main>
  );
}
