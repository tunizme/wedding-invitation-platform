# IAM Operations

## Bootstrap the first ADMIN

The ADMIN bootstrap is an explicit, local operational command. It does not expose an HTTP route,
does not promote an existing Customer, and never accepts a password in command-line arguments or
from an environment variable.

Prerequisites:

- Apply the committed database migrations to the target database first.
- Configure `DATABASE_URL` and the server-only IAM keys exactly as for the API process.
- Use a private interactive terminal. The password prompts require a TTY and do not echo input.
- Confirm operational authorization to create an ADMIN whose email is already controlled by the
  intended operator. Bootstrap marks that email verified at provisioning time; it does not send a
  verification message.

Run from the repository root:

```sh
pnpm --filter @wedding/api bootstrap:admin -- --email admin@example.com
```

Enter and confirm the password only at the hidden prompts. The password follows the same 8–128
Unicode code-point and 512-byte limit as LOCAL accounts. Do not put it in shell history, CI command
arguments, deployment manifests, tickets, or logs.

The command has these outcomes:

- A new normalized email creates one verified, ACTIVE, LOCAL ADMIN.
- Repeating the command for that ADMIN is a no-op and does not replace its password.
- An email already owned by a Customer fails with `ADMIN_BOOTSTRAP_EMAIL_IN_USE`; the Customer is
  never promoted implicitly.
- Invalid configuration, a non-interactive terminal, mismatched passwords, or a database failure
  fails closed without printing the password or hash.

After provisioning, sign in through the normal LOCAL login flow. Store no bootstrap password in
the repository. Lock/unlock operations are limited to Customer targets, revoke all target refresh
sessions on lock, never restore sessions on unlock, and append an audit record in the same database
transaction.

## Key rotation and old-key retention

Rotate by adding a new positive version to every applicable server-only key map, setting
`IAM_KEY_VERSION`/`IAM_JWT_KID` to the new active version, and restarting instances in a controlled
rollout. Do not replace a map with only the new key:

- retain JWT public verification keys through the maximum 15-minute Access Token lifetime;
- retain refresh HMAC and CSRF keys through the maximum 14-day session lifetime;
- retain AES-GCM keys while any retryable email outbox or live OAuth transaction still references
  the old `encryption_key_version`;
- confirm old-version reference counts are zero before removing a key. Terminal outbox/OAuth
  ciphertext is cleared immediately and the retention worker provides a defensive cleanup pass.

Never log key maps or pass them through `NEXT_PUBLIC_*`. A missing historical key fails closed; do
not “repair” it by changing stored key versions.

## Mail failure and outbox recovery

Mail delivery is outside database transactions. Inspect only safe status/count fields in
`email_outbox` and `auth_challenges`; never print/decrypt payloads during diagnosis. Retryable rows
retain encrypted payload and use bounded retry. Expired leases are reclaimed with a new owner;
stale workers cannot finalize. Accepted or terminal rows clear ciphertext. A failed resend keeps
the previous ACTIVE proof usable, while a consumed/revoked proof is never resurrected.

For local diagnosis, use Mailpit and `pnpm validate:iam:mail`. In production, verify Resend sender
authorization, send-only credential scope and provider availability. Do not manually mark an
outbox row delivered or activate a challenge. Restore provider connectivity and let the worker
retry, or use the ordinary resend flow.

## Retention worker

`RetentionWorker` starts with the API, runs in bounded batches (default/max 1,000 rows per table)
and reports duration, terminalized/deleted counts, ciphertext cleanup counts and a safe failure
category. Expired active/pending challenges and their nonterminal outbox rows are terminalized
before FK-ordered deletion; expired pending onboarding records are materialized as `EXPIRED`.
Expired OAuth requests are terminalized with ciphertext clearing, while a claimed callback keeps a
one-minute in-flight grace window before crash recovery can reclaim it. A failed cleanup transaction
emits only empty rolled-back counts and safe timing/status metadata, then rethrows for scheduler
retry. The
default policy is OAuth 24h after terminal state; expired/cancelled onboarding 7d; completed
onboarding, challenges, session/refresh history and outbox metadata 30d; rate buckets 24h after
window expiry; Admin audit 730d. Environment overrides are accepted only inside validated bounds.

Deletion follows FK order: outbox → challenge → onboarding and refresh credential → session.
Session history is retained until 30 days after the later of absolute expiry/revocation, preserving
the refresh-reuse window. Audit retention changes require privacy/legal review before production.
Monitor PostgreSQL autovacuum/bloat for high-churn tables; do not run ad-hoc unbounded deletes.

## Migration and rollback warning

Apply migrations after PostgreSQL readiness and before API startup. Runtime synchronization and
automatic migration-on-boot remain disabled. `migration:revert` for IAM is intentionally accepted
only with `NODE_ENV=test` and a runner-owned `iam_test_<32 hex>` schema. Production rollback means
deploying a reviewed forward migration or restoring through the approved database recovery plan;
never edit migration history or drop IAM tables to recover an application release.

## CSP-1 auth cutover rollback

Use this only when rolling the application back from the context-bound CSP-1 auth protocol.
Coordinate a maintenance window and stop all API traffic/admission across the fleet before running
the command; otherwise an active instance could issue a new context-bound session during rollback.
Keep the additive 006 schema and migration history in place while deploying the reviewed legacy
application version. Do not run `migration:revert` or remove cookie/intent ledgers as part of this
application rollback.

The command revokes every active session with a non-null `context_id`, clears those contexts'
`current_session_id`, and reports the number of sessions affected. This destroys active login state
for those sessions; affected users must sign in again. It does not delete accounts or retained
protocol ledgers. Verify that the command reports the expected count, legacy traffic is healthy,
and no CSP-1 API instance is still accepting traffic before ending maintenance. If CSP-1 is later
re-enabled, old selectors point at revoked sessions and must enter `CREDENTIAL_MISSING` recovery;
users sign in explicitly to create new sessions.

Run from the repository root with the same `DATABASE_URL` as the API, after the coordinated traffic
stop:

```sh
pnpm --filter @wedding/api exec ts-node src/modules/identity-access/context/auth-cutover.command.ts REVOKE_CONTEXT_SESSIONS
```

The exact confirmation argument `REVOKE_CONTEXT_SESSIONS` is mandatory. The command refuses to
run without it. Review the affected-session count in the command output and API/database health
before restoring traffic.
