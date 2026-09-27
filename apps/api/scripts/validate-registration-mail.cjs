const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { DataSource } = require('typeorm');
const { createApplication } = require('../dist/main');
const {
  SessionService,
} = require('../dist/modules/identity-access/auth/session.service');
const {
  AccessTokenService,
} = require('../dist/modules/identity-access/auth/access-token.service');
const {
  CredentialCrypto,
} = require('../dist/modules/identity-access/infrastructure/credential-crypto');

async function main() {
  if (
    process.env.NODE_ENV !== 'test' ||
    !/^iam_test_[a-f0-9]{32}$/.test(process.env.IAM_TEST_SCHEMA ?? '')
  )
    throw new Error('Disposable schema required');
  const mailpit = process.env.IAM_TEST_MAILPIT_URL ?? 'http://127.0.0.1:8025';
  const url = new URL(mailpit);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Local Mailpit required');
  const email = `iam-${randomUUID()}@example.test`;
  const search = `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;
  const get = async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('Mailpit unavailable');
    return r.json();
  };
  const app = await createApplication();
  try {
    const db = app.get(DataSource);
    await db.runMigrations();
    await app.listen(0, '127.0.0.1');
    const response = await fetch(
      `${await app.getUrl()}/api/v1/auth/registrations`,
      {
        method: 'POST',
        headers: {
          Origin: process.env.FRONTEND_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password: '  Smoke Password 🔒  ' }),
        signal: AbortSignal.timeout(10000),
      },
    );
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('set-cookie'), null);
    let messages = [];
    for (let attempt = 0; attempt < 60; attempt++) {
      messages = (await get(search)).messages;
      if (messages.length) break;
      await delay(250);
    }
    assert.equal(messages.length, 1);
    const message = await get(`${mailpit}/api/v1/message/${messages[0].ID}`);
    const proof = message.Text.match(/#token=([A-Za-z0-9_-]{43})/)[1];
    let row;
    for (let attempt = 0; attempt < 20; attempt++) {
      [row] = await db.query(
        'SELECT c.status,c.token_hash,c.created_at,c.expires_at,o.payload_ciphertext FROM auth_challenges c JOIN email_outbox o ON o.challenge_id=c.id WHERE c.email=$1',
        [email],
      );
      if (row?.status === 'ACTIVE') break;
      await delay(100);
    }
    assert.equal(row.status, 'ACTIVE');
    assert.equal(row.payload_ciphertext, null);
    assert.deepEqual(
      row.token_hash,
      createHash('sha256').update(proof).digest(),
    );
    assert.equal(row.expires_at - row.created_at, 86400000);
    assert.equal(
      (await db.query('SELECT count(*) FROM auth_sessions'))[0].count,
      '0',
    );
    const post = (path, body) =>
      fetch(`${awaitBase}/api/v1/auth/${path}`, {
        method: 'POST',
        headers: {
          Origin: process.env.FRONTEND_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    const awaitBase = await app.getUrl();
    const verified = await post('email-verifications/confirm', { proof });
    assert.equal(verified.status, 204);
    assert.equal(verified.headers.get('set-cookie'), null);
    const [user] = await db.query(
      'SELECT id,email_verified_at FROM users WHERE email=$1',
      [email],
    );
    assert.ok(user.email_verified_at);
    assert.equal(
      (await db.query('SELECT count(*) FROM auth_sessions'))[0].count,
      '0',
    );
    const sessions = app.get(SessionService);
    await db.transaction((manager) => sessions.issue(manager, user.id));
    const resetRequest = await post('password-resets', { email });
    assert.equal(resetRequest.status, 202);
    assert.equal(resetRequest.headers.get('set-cookie'), null);
    let resetMessage;
    for (let attempt = 0; attempt < 60; attempt++) {
      const found = (await get(search)).messages.find(
        (m) => m.Subject === 'Đặt lại mật khẩu của bạn',
      );
      if (found) {
        resetMessage = await get(`${mailpit}/api/v1/message/${found.ID}`);
        break;
      }
      await delay(250);
    }
    assert.ok(resetMessage);
    assert.match(resetMessage.Text, /30 phút/);
    assert.match(resetMessage.Text, /\/reset-password#token=/);
    const resetProof = resetMessage.Text.match(/#token=([A-Za-z0-9_-]{43})/)[1];
    let resetRow;
    for (let attempt = 0; attempt < 20; attempt++) {
      [resetRow] = await db.query(
        "SELECT c.status,c.token_hash,c.created_at,c.expires_at,o.payload_ciphertext FROM auth_challenges c JOIN email_outbox o ON o.challenge_id=c.id WHERE c.email=$1 AND c.purpose='PASSWORD_RESET'",
        [email],
      );
      if (resetRow?.status === 'ACTIVE') break;
      await delay(100);
    }
    assert.equal(resetRow.status, 'ACTIVE');
    assert.equal(resetRow.payload_ciphertext, null);
    assert.equal(resetRow.expires_at - resetRow.created_at, 1800000);
    assert.deepEqual(
      resetRow.token_hash,
      createHash('sha256').update(resetProof).digest(),
    );
    const newPassword = '  Smoke replacement 🔐  ';
    const resetResponse = await post('password-resets/confirm', {
      proof: resetProof,
      newPassword,
    });
    assert.equal(resetResponse.status, 204);
    assert.equal(resetResponse.headers.get('set-cookie'), null);
    const [updated] = await db.query(
      'SELECT password_hash,credential_version FROM users WHERE id=$1',
      [user.id],
    );
    assert.equal(updated.credential_version, '1');
    assert.ok(
      await app
        .get(CredentialCrypto)
        .verifyPassword(updated.password_hash, newPassword),
    );
    assert.equal(
      (
        await db.query(
          'SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL',
        )
      )[0].count,
      '0',
    );
    assert.equal(
      (
        await post('password-resets/confirm', {
          proof: resetProof,
          newPassword,
        })
      ).status,
      400,
    );
    const login = await post('login', { email, password: newPassword });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /^wedding_rt=[A-Za-z0-9_-]+/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Path=\/api\/v1\/auth/i);
    assert.match(cookie, /SameSite=Lax/i);
    const loginBody = await login.json();
    assert.equal(loginBody.tokenType, 'Bearer');
    assert.equal(loginBody.expiresIn, 900);
    assert.match(loginBody.csrfToken, /^[A-Za-z0-9_-]+$/);
    assert.equal(loginBody.user.id, user.id);
    assert.equal(loginBody.user.email, email);
    assert.equal(loginBody.user.emailVerified, true);
    assert.equal(loginBody.user.loginMethod, 'LOCAL');
    assert.equal(loginBody.user.role, 'CUSTOMER');
    assert.equal(loginBody.user.status, 'ACTIVE');
    assert.deepEqual(
      Object.keys(loginBody.user).sort(),
      [
        'avatarUrl',
        'displayName',
        'email',
        'emailVerified',
        'id',
        'loginMethod',
        'phoneNumber',
        'role',
        'status',
      ].sort(),
    );
    assert.equal(loginBody.passwordHash, undefined);
    assert.equal(loginBody.refreshToken, undefined);
    assert.equal(
      app.get(AccessTokenService).verify(loginBody.accessToken).sub,
      user.id,
    );
    assert.equal(
      (
        await db.query(
          'SELECT count(*) FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
          [user.id],
        )
      )[0].count,
      '1',
    );
    const loginCookie = cookie.match(/^([^;]+)/)[1];
    const csrfResponse = await fetch(`${awaitBase}/api/v1/auth/csrf`, {
      headers: { Cookie: loginCookie },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(csrfResponse.status, 200);
    const csrfBody = await csrfResponse.json();
    assert.equal(csrfBody.csrfToken, loginBody.csrfToken);
    const refreshed = await fetch(`${awaitBase}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        Origin: process.env.FRONTEND_ORIGIN,
        Cookie: loginCookie,
        'X-CSRF-Token': csrfBody.csrfToken,
      },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(refreshed.status, 200);
    const refreshedBody = await refreshed.json();
    assert.equal(refreshedBody.csrfToken, csrfBody.csrfToken);
    app.get(AccessTokenService).verify(refreshedBody.accessToken);
    const refreshedCookie = refreshed.headers.get('set-cookie');
    assert.match(refreshedCookie, /^wedding_rt=[A-Za-z0-9_-]+/);
    assert.notEqual(refreshedCookie.match(/^([^;]+)/)[1], loginCookie);
    const logout = await fetch(`${awaitBase}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: process.env.FRONTEND_ORIGIN,
        Cookie: refreshedCookie.match(/^([^;]+)/)[1],
        'X-CSRF-Token': refreshedBody.csrfToken,
      },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal(
      (
        await db.query(
          'SELECT count(*) FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
          [user.id],
        )
      )[0].count,
      '0',
    );
    console.log(
      'Registration -> verification -> reset -> login -> refresh rotation -> logout: PASS',
    );
  } finally {
    await app.close();
    const ids = (await get(search)).messages.map((message) => message.ID);
    if (ids.length) {
      const response = await fetch(`${mailpit}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: ids }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Test mail cleanup failed');
    }
  }
}
main().catch(() => {
  console.error(
    'Registration Mailpit smoke failed (credentials and message content omitted).',
  );
  process.exitCode = 1;
});
