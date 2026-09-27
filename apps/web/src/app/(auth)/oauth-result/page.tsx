'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { bootstrapSession } from '../../../features/identity-access/session/refresh-coordinator';

export default function OAuthResultPage() {
  const started = useRef(false);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading',
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const result = new URLSearchParams(window.location.search).get('result');
    window.history.replaceState(null, '', '/oauth-result');
    if (result !== 'success') {
      queueMicrotask(() => setStatus('error'));
      return;
    }
    void bootstrapSession().then((session) => {
      setStatus(session ? 'success' : 'error');
    });
  }, []);

  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Kết quả đăng nhập</h1>
      {status === 'loading' && <p role="status">Đang hoàn tất đăng nhập…</p>}
      {status === 'success' && <p role="status">Đăng nhập thành công.</p>}
      {status === 'error' && (
        <>
          <p role="alert">Không thể hoàn tất đăng nhập. Vui lòng thử lại.</p>
          <Link href="/login">Quay lại đăng nhập</Link>
        </>
      )}
    </main>
  );
}
