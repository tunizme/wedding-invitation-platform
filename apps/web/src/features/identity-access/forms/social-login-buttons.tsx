function oauthStart(provider: 'google' | 'facebook'): string | undefined {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) return undefined;
  try {
    const parsed = new URL(base);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return `${base.replace(/\/$/, '')}/auth/oauth/${provider}/start`;
  } catch {
    return undefined;
  }
}

export function SocialLoginButtons() {
  const google = oauthStart('google');
  const facebook = oauthStart('facebook');
  if (!google || !facebook) return null;
  return (
    <div aria-label="Đăng nhập mạng xã hội" style={{ marginTop: '1rem' }}>
      <a href={google} rel="noreferrer">
        Tiếp tục với Google
      </a>
      {' · '}
      <a href={facebook} rel="noreferrer">
        Tiếp tục với Facebook
      </a>
    </div>
  );
}
