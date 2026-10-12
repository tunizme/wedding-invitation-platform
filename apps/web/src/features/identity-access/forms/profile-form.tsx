'use client';

import { Button } from '../../../ui/platform/button';
import { Field } from '../../../ui/platform/field';
import { InlineAlert, LocalStatus } from '../../../ui/platform/feedback';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../session/operation-scope';

import Link from 'next/link';
import styles from './profile-form.module.css';
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

function OwnedProfileForm({
  onPasswordChanged,
}: {
  onPasswordChanged: () => void;
}) {
  const lifetime = useOperationLifetime('ProfileForm');
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  const ownerEpoch = sessionStore.identityEpoch();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadedEpoch, setLoadedEpoch] = useState<number | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const profileSubmitting = useRef(false);
  const passwordSubmitting = useRef(false);

  const signedIn = session !== null;
  useEffect(() => {
    let active = true;
    if (!signedIn) return;
    const scope = lifetime.capture();
    void authenticatedRequest<UserProfile>('/me', { scope })
      .then((value) => {
        if (active && lifetime.isActive()) setProfile(value);
      })
      .catch((cause: unknown) => {
        if (active && lifetime.isActive())
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Không thể tải hồ sơ lúc này.',
          );
      })
      .finally(() => {
        if (active && lifetime.isActive()) setLoadedEpoch(ownerEpoch);
      });
    return () => {
      active = false;
      scope.dispose();
    };
  }, [ownerEpoch, lifetime, signedIn]);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

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
        scope,
        body: {
          displayName: displayName || null,
          phoneNumber: phoneNumber || null,
        },
      });
      if (!scope.isActive()) return;
      setProfile(updated);
      const current = sessionStore.get();
      if (current) sessionStore.set({ ...current, user: updated });
      setMessage('Đã cập nhật hồ sơ. Số điện thoại chưa được xác minh.');
    } catch (cause) {
      if (!scope.isActive()) return;
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Không thể cập nhật hồ sơ lúc này.',
      );
    } finally {
      if (!scope.isActive()) return;
      profileSubmitting.current = false;
      setProfilePending(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

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
        scope,
        body: { currentPassword, newPassword },
        cookieAuth: true,
      });
      if (!scope.isActive()) return;
      setCurrentPassword('');
      setNewPassword('');
      if (
        originatingSession?.sessionTag &&
        sessionStore.get()?.sessionTag &&
        originatingSession.sessionTag !== sessionStore.get()?.sessionTag
      )
        return;
      clearLocalSession(originatingSession);
      if (!sessionStore.get()) onPasswordChanged();
      setProfile(null);
      setMessage('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
    } catch (cause) {
      if (!scope.isActive()) return;
      if (
        cause instanceof ApiError &&
        cause.code === 'PASSWORD_CHANGE_NOT_APPLICABLE'
      )
        setError('Tài khoản mạng xã hội không sử dụng mật khẩu LOCAL.');
      else
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Không thể đổi mật khẩu lúc này.',
        );
    } finally {
      if (!scope.isActive()) return;
      passwordSubmitting.current = false;
      setPasswordPending(false);
    }
  }

  if (session && loadedEpoch !== ownerEpoch)
    return <p role="status">Đang tải hồ sơ…</p>;
  if (!session && !message)
    return (
      <p>
        Vui lòng <Link href="/login">đăng nhập</Link> để xem hồ sơ.
      </p>
    );

  return (
    <div className={styles.profile}>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {message && <LocalStatus tone="success">{message}</LocalStatus>}
      {profile && session ? (
        <>
          <section aria-labelledby="account-details">
            <h2 id="account-details">Thông tin tài khoản</h2>
            <p className={styles.readonly}>Email: {profile.email}</p>
            <p>Phương thức đăng nhập: {profile.loginMethod}</p>
            <form
              onSubmit={updateProfile}
              style={{ display: 'grid', gap: '1rem' }}
            >
              <Field
                id="profile-display-name"
                label="Tên hiển thị"
                name="displayName"
                maxLength={100}
                defaultValue={profile.displayName ?? ''}
                disabled={profilePending}
              />
              <Field
                id="profile-phone-number"
                label="Số điện thoại (chưa xác minh)"
                name="phoneNumber"
                type="tel"
                maxLength={32}
                defaultValue={profile.phoneNumber ?? ''}
                disabled={profilePending}
              />
              <Button type="submit" busy={profilePending}>
                {profilePending ? 'Đang lưu…' : 'Lưu hồ sơ'}
              </Button>
            </form>
          </section>

          <section aria-labelledby="password-change">
            <h2 id="password-change">Đổi mật khẩu</h2>
            {profile.loginMethod === 'LOCAL' ? (
              <form
                onSubmit={changePassword}
                style={{ display: 'grid', gap: '1rem' }}
              >
                <Field
                  id="current-password"
                  label="Mật khẩu hiện tại"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={passwordPending}
                />
                <Field
                  id="new-password"
                  label="Mật khẩu mới"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={passwordPending}
                />
                <Button type="submit" busy={passwordPending}>
                  {passwordPending ? 'Đang đổi…' : 'Đổi mật khẩu'}
                </Button>
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

export function ProfileForm() {
  const owner = usePrivateOwner('ProfileForm');
  // Epoch at which this tab's own password change ended the session. The owned
  // form unmounts with its private state, so the confirmation lives here.
  const [changedAtEpoch, setChangedAtEpoch] = useState<number | null>(null);
  if (owner)
    return (
      <OwnedProfileForm
        key={owner}
        onPasswordChanged={() =>
          setChangedAtEpoch(sessionStore.identityEpoch())
        }
      />
    );
  if (changedAtEpoch === sessionStore.identityEpoch())
    return (
      <div>
        <p role="status">Đã đổi mật khẩu. Vui lòng đăng nhập lại.</p>
        <Link href="/login">Đăng nhập lại</Link>
      </div>
    );
  return (
    <p>
      Vui lòng <Link href="/login">đăng nhập</Link> để xem hồ sơ.
    </p>
  );
}
