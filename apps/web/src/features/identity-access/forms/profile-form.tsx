'use client';

import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { ApiError, type UserProfile } from '../api/client';
import {
  authenticatedRequest,
  clearLocalSession,
} from '../session/refresh-coordinator';
import { sessionStore } from '../session/store';

export function ProfileForm() {
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  const accessToken = session?.accessToken;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadedToken, setLoadedToken] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const profileSubmitting = useRef(false);
  const passwordSubmitting = useRef(false);

  useEffect(() => {
    let active = true;
    if (!accessToken) return;
    void authenticatedRequest<UserProfile>('/me')
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Không thể tải hồ sơ lúc này.',
          );
      })
      .finally(() => {
        if (active) setLoadedToken(accessToken);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || profileSubmitting.current) return;
    profileSubmitting.current = true;
    setProfilePending(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('displayName') ?? '').trim();
    const phoneNumber = String(form.get('phoneNumber') ?? '').trim();
    try {
      const updated = await authenticatedRequest<UserProfile>('/me', {
        method: 'PATCH',
        body: {
          displayName: displayName || null,
          phoneNumber: phoneNumber || null,
        },
      });
      setProfile(updated);
      const current = sessionStore.get();
      if (current) sessionStore.set({ ...current, user: updated });
      setMessage('Đã cập nhật hồ sơ. Số điện thoại chưa được xác minh.');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Không thể cập nhật hồ sơ lúc này.',
      );
    } finally {
      profileSubmitting.current = false;
      setProfilePending(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSubmitting.current) return;
    passwordSubmitting.current = true;
    setPasswordPending(true);
    setError('');
    setMessage('');
    const originatingSession = sessionStore.get();
    try {
      await authenticatedRequest<void>('/me/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
        cookieAuth: true,
      });
      setCurrentPassword('');
      setNewPassword('');
      if (
        originatingSession?.sessionTag &&
        sessionStore.get()?.sessionTag &&
        originatingSession.sessionTag !== sessionStore.get()?.sessionTag
      )
        return;
      clearLocalSession(originatingSession);
      setProfile(null);
      setMessage('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.code === 'PASSWORD_CHANGE_NOT_APPLICABLE'
      )
        setError('Tài khoản mạng xã hội không sử dụng mật khẩu LOCAL.');
      else if (cause instanceof ApiError && cause.status === 400)
        setError('Mật khẩu hiện tại không đúng.');
      else
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Không thể đổi mật khẩu lúc này.',
        );
    } finally {
      passwordSubmitting.current = false;
      setPasswordPending(false);
    }
  }

  if (session && loadedToken !== accessToken)
    return <p role="status">Đang tải hồ sơ…</p>;
  if (!session && !message)
    return (
      <p>
        Vui lòng <Link href="/login">đăng nhập</Link> để xem hồ sơ.
      </p>
    );

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {profile && session ? (
        <>
          <section aria-labelledby="account-details">
            <h2 id="account-details">Thông tin tài khoản</h2>
            <p>Email: {profile.email}</p>
            <p>Phương thức đăng nhập: {profile.loginMethod}</p>
            <form
              onSubmit={updateProfile}
              style={{ display: 'grid', gap: '1rem' }}
            >
              <label htmlFor="profile-display-name">Tên hiển thị</label>
              <input
                id="profile-display-name"
                name="displayName"
                maxLength={100}
                defaultValue={profile.displayName ?? ''}
                disabled={profilePending}
              />
              <label htmlFor="profile-phone-number">
                Số điện thoại (chưa xác minh)
              </label>
              <input
                id="profile-phone-number"
                name="phoneNumber"
                type="tel"
                maxLength={32}
                defaultValue={profile.phoneNumber ?? ''}
                disabled={profilePending}
              />
              <button type="submit" disabled={profilePending}>
                {profilePending ? 'Đang lưu…' : 'Lưu hồ sơ'}
              </button>
            </form>
          </section>

          <section aria-labelledby="password-change">
            <h2 id="password-change">Đổi mật khẩu</h2>
            {profile.loginMethod === 'LOCAL' ? (
              <form
                onSubmit={changePassword}
                style={{ display: 'grid', gap: '1rem' }}
              >
                <label htmlFor="current-password">Mật khẩu hiện tại</label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={passwordPending}
                />
                <label htmlFor="new-password">Mật khẩu mới</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={passwordPending}
                />
                <button type="submit" disabled={passwordPending}>
                  {passwordPending ? 'Đang đổi…' : 'Đổi mật khẩu'}
                </button>
              </form>
            ) : (
              <p>Tài khoản mạng xã hội không sử dụng mật khẩu LOCAL.</p>
            )}
          </section>
        </>
      ) : null}
      {!session && message ? <Link href="/login">Đăng nhập lại</Link> : null}
    </div>
  );
}
