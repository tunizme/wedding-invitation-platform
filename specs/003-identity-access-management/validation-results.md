# IAM validation results

## 2026-09-26 — Setup and Foundational continuation

Completed T008–T022 on top of the existing T001–T007 changes. Feature 003 is **not complete**. US1–US10 and Polish remain unchecked; no registration/login/social/profile/Admin endpoint or UI is claimed by this evidence.

Environment: Node.js 24.21.0, pinned workspace dependencies, PostgreSQL 17 local port 55432, isolated `iam_test_*` schemas. No real provider credentials or production accounts were used.

| Check | Result | Scope |
| --- | --- | --- |
| Requirements checklist | 16/16 checked | Read-only gate; markers unchanged |
| `pnpm validate:iam --phase setup` | PASS | 18 design contract checks, 14 runner/scope tests, scope scan |
| `pnpm validate:iam --phase foundation` | PASS | 39 tests across 5 files: design, security, PostgreSQL IAM schema, baseline migration lifecycle, health |
| API unit tests | 18/18 PASS | Existing foundation tests plus security primitives |
| API lint/typecheck/build | PASS | Standalone backend checks |
| Frontend lint/typecheck | PASS | Standalone frontend checks |
| Frontend build | PASS with public API URL configured | First run lacked required public configuration; configured rerun passed |
| Workspace format and scope | PASS | No invitation/payment/VNPay implementation |
| Compiled API startup smoke | PASS | Ephemeral keys, temporary schema, public liveness/readiness, credentialed exact-origin CORS; app closed after checks |

Security coverage includes password whitespace/case/Unicode and explicit bounds, Argon2id 19MiB/2/1, authenticated context-bound AES-GCM, opaque credential hashing, RS256 algorithm/type/kid/issuer/audience/claims/hard-expiry checks, immutable verified principal, default authentication and role denial, strict DTO rejection, CSRF context separation/Origin rejection, concurrent DB limiter and five-attempt challenge limit, session isolation, transactional revocation rollback and residual Access Token validity.

Schema coverage includes all ten tables, normalized unique email, password/login-method consistency, nonnegative credential versions, pending-only onboarding uniqueness, reset snapshot and owner/purpose constraints, explicit migration reapplication and rollback preserving the foundation history. Migration review matched the documented U3 pending-context uniqueness and U4 version/snapshot invariants; this is scoped implementation review, not a claim of a new independent full-spec analysis.

Tests were first run against missing runtime/schema and failed as expected. A later concurrency regression caught TypeORM's UPDATE result shape incorrectly allowing exhausted proof attempts; the query now returns a SELECT result from an atomic UPDATE CTE, and only five of eight concurrent attempts succeed.

The runner drops its own temporary schema in finally. Database-wide pg_trgm is installed in public if absent and retained; no existing application tables or volumes are deleted. IAM down migrations are restricted to disposable test schemas. No deploy, publish, commit or external message was performed.

## Remaining evidence

- T032 onward: recovery, login/refresh, social onboarding, authorization slices, Google/Facebook, profile, Admin and retention.
- HTTP contract and browser coverage for those actual flows; current OpenAPI tests validate design fixtures only.
- Google/Facebook real test-app runs, production-like HTTPS cookie/multi-tab tests, full-stack container/remote CI execution for the final feature, performance and usability measurements.
- Detailed mapping of all 72 FR and 65 acceptance scenarios remains T098. This document does not claim full coverage or release readiness.

## 2026-09-26 — US1 completed (T023–T031)

Scope: local registration only. Total progress is 31/104 tasks; US2 onward remains open. The earlier Foundational-only coverage description above is historical.

| Check | Result |
| --- | --- |
| US1 checkpoint | PASS: 53 API tests across 8 files + 2 registration UI tests |
| API unit regression | PASS: 21/21 |
| Frontend complete suite | PASS: 7/7 |
| Runner/scope regression | PASS: 14/14 |
| Independent API/web lint, typecheck, build | PASS; frontend build supplied required public API URL |
| Format / scope / diff whitespace | PASS |
| Compiled API → SMTP → Mailpit | PASS: captured proof matches SHA-256 hash, 24h expiry, ACTIVE only after acceptance, ciphertext cleared, no session |

T023 HTTP tests compare new/duplicate 202, validate responses against actual OpenAPI schemas, reject unknown/invalid fields, check safe 422/429 and Retry-After, enforce Origin, and assert no session cookie. The contract now explicitly documents registration's Origin/JSON guard and 403 response.

T024/T028 PostgreSQL evidence: concurrent normalized duplicate requests create one user/outbox; dots/+tag and password whitespace/Unicode are preserved; duplicate password never overwrites; outbox insert failure rolls back user creation. Sender can acquire User/Challenge/Outbox locks NOWAIT during delivery, proving the mail call does not retain transaction locks. Tests cover expired lease reclaim, stale lease-owner rejection, acceptance-before-finalize crash/retry with the same idempotency key/proof, older delivery after newer activation, consumed-proof non-resurrection, failed resend preserving an older active proof, and five-attempt terminal cleanup.

T025 UI checks cover pending/disabled submission, unchanged password, generic verification instructions and Vietnamese safe errors. Resend adapter tests use controlled fetch doubles; SDK serialization/idempotency is retained while the bounded transport suppresses raw provider error logging. No external email was sent. Mailpit local capture is real SMTP evidence, not Resend production evidence.

The initial US1 checkpoint attempt could not connect while infrastructure image download was still in progress; rerun passed after PostgreSQL started. Test-first runs failed on the missing controller/services/form before implementation. API/web builds and final checkpoints are green.

The integration CI job now selects US1 and still uses a disposable schema; all four jobs remain separate. Remote CI and final-feature full-stack/browser/provider/performance checks remain future evidence, not implied by local PASS.


## 2026-09-26 — US2/T032 contract tests authored (RED)

Scope: T032 only; T033–T038 remain open. Added 53 HTTP contract cases in
`apps/api/test/contract/identity-access/verification.spec.ts` for request/confirm
email verification and password reset. The suite imports the real IdentityAccessModule,
including global guards, with PostgreSQL and ephemeral fixture keys. Only the email
worker is disabled; no controller/service/limiter responses are mocked.

Coverage specifies generic 202 across missing/unverified/verified/locked/social accounts,
strict 422 payload validation, empty 204 without cookies or automatic login, generic 400
for invalid/expired/consumed/revoked/undelivered/wrong-purpose proofs and replay,
429 with Retry-After for normalized email/IP/known challenge/unknown proof quotas,
no-store, actual OpenAPI response schema validation, and safe errors without secret echoes.
Session revocation and concurrency assertions remain the integration tasks T033/T036.

Verification: API typecheck, targeted ESLint/Prettier and diff whitespace checks pass.
Regression: all 18 existing design contract tests and 21 API unit tests pass.
The database-backed run executes all 53 cases and fails all 53 with HTTP 404 because
T035–T037 endpoints have not been implemented. This is expected test-first RED evidence,
not a US2 checkpoint PASS. An initial database availability failure required starting
local infrastructure; an initial seed SQL parameter typing error was fixed before the
confirmed RED run. The runner cleans its disposable schema in finally on failure.
No skipped/todo tests or assertions accepting 404 were added.

Reproduce this slice before the remaining US2 test files exist, from repository root:

```bash
node --input-type=module <<'JS'
import { withTestSchema, runCommand } from './scripts/iam-validate.mjs';
await withTestSchema({
  databaseUrl: process.env.IAM_TEST_DATABASE_URL,
  run: (env) => runCommand('pnpm', [
    '--filter', '@wedding/api', 'test:contract',
    'test/contract/identity-access/verification.spec.ts',
  ], { env: { ...process.env, ...env }, timeoutMs: 120000 }),
});
JS
```

Set `IAM_TEST_DATABASE_URL` to the explicit local test PostgreSQL target first.
The full `pnpm validate:iam --phase US2` remains pending until T033–T038 are ready.
No extension hooks are configured (`.specify/extensions.yml` absent).


## 2026-09-26 — US2/T033 and T034 tests authored (RED)

Scope: test-first tasks T033/T034 only. T035–T038 are still open; no runtime
verification/recovery handlers or UI pages were added by these tasks.

- T033: 18 PostgreSQL integration cases in
  `apps/api/test/integration/identity-access/verification.spec.ts`. Both purposes
  cover encrypted enqueue/hash/TTL, activation only after acceptance, replay,
  concurrent consumption (one winner), expiry, wrong-purpose rejection, failed
  resend preserving an active proof, out-of-order delivery, and pending sibling
  invalidation after successful completion. Reset additionally checks exact password
  replacement, all owner sessions revoked with PASSWORD_RESET, another user's session
  preserved, no new session/cookie, and no reset proof/outbox for ineligible accounts.
  Production module/guards/services/DB are used; only background delivery is disabled.
  Tests explicitly drive the real outbox worker with a controlled sender/finalization.
- T034: 18 React Testing Library cases in
  `apps/web/tests/identity-access/verification.test.tsx`. Real page discovery fails
  explicitly while T038 pages are absent, without unresolved imports, skipped tests,
  or dummy UI implementations. Cases specify fragment extraction/removal before POST,
  no query-string proof fallback, malformed/missing proof handling, StrictMode duplicate
  prevention, resend/forgot generic instructions, pending and 429 retry states, exact
  reset password, invalid-proof/network errors, no automatic retry, and login links
  without automatic authentication or token storage.

Validation results:

| Check | Result |
| --- | --- |
| T033 PostgreSQL run | RED: 18/18 fail at expected HTTP 202 vs actual 404; fixture/bootstrap works |
| T034 UI run | RED: 18/18 fail explicitly on missing verify-email/forgot-password/reset-password pages |
| API and web typecheck | PASS |
| Targeted API/web ESLint and Prettier | PASS |
| Existing frontend regression (new RED suite excluded explicitly) | PASS: 7/7 |
| Existing API unit regression | PASS: 21/21 |
| Scope and diff whitespace | PASS |

The initial sandboxed database attempt was denied; the approved rerun used local
PostgreSQL port 55432 and a disposable schema, cleaned in finally even on test failure.
UI discovery typing was corrected to use the existing Vitest ImportMeta declaration,
without adding dependencies. Assertions after the expected missing-route/page failure
remain unexercised until implementation; these runs do not establish recovery correctness.
Credential-version cross-operation races/rollback remain T036. Real browser security
headers and usability remain separate evidence, not claimed by jsdom tests.

Run T033 using the T032 `withTestSchema` command above, replacing `test:contract` with
`test:integration` and the file with `test/integration/identity-access/verification.spec.ts`.
Run T034 with `pnpm --filter @wedding/web test tests/identity-access/verification.test.tsx`.
The complete US2 checkpoint is still pending T035–T038, including T036 recovery-races tests.
Pre/post extension hooks: none (`.specify/extensions.yml` absent).


## 2026-09-26 — US2 completed (T035–T038)

Scope: local email verification and password recovery. T001–T038 are complete;
login/session/social/profile/admin stories remain pending. Earlier RED entries are
historical test-first evidence; the current US2 suites are GREEN.

Implemented all four request/confirm endpoints with exact Origin/JSON protection,
strict payload validation, generic 202 for ineligible accounts, safe 400/422/429,
Retry-After, no-store and no session issuance. OpenAPI now documents Origin and 403
for these operations. Proof attempt counters commit separately from business
transactions so failed consumption does not erase rate-limit attempts.

Verification/reset consumption follows User → Sessions (reset only) → Challenges,
rechecks purpose/state/expiry/owner after locks, consumes once and revokes siblings,
including pending delivery. Reset enqueue snapshots the exact bigint credential version;
completion rechecks equality, increments once, updates hash, and revokes all owner
sessions atomically without unlocking the account. Other users' sessions survive.
Outbox reset delivery uses the reset-password fragment URL and 30-minute email copy;
stale-version activation remains rejected under the owner lock.

T036 added six PostgreSQL race/rollback tests, first observed RED (404), then GREEN:
versions above Number.MAX_SAFE_INTEGER, two proofs/one winner, actual PostgreSQL lock
wait behind a credential-version writer, delayed delivery, transaction rollback,
locked-account reset, and hash-only rehash compatibility. Password-change and
opportunistic rehash are controlled database mutations using the documented lock
protocol because the public implementations belong to T086/T042. These tests do not
claim those future endpoints are implemented.

Frontend now has /verify-email, /forgot-password and /reset-password. Client forms
clear fragments with replaceState, retain proof only in component memory, require
explicit verification/reset submission, prevent double submits, show Vietnamese safe
errors and generic email instructions, and link to login after success without
creating a session. Referrer-Policy/noindex metadata and headers apply to recovery
pages; CSP limits script sources to self (inline Next bootstrap permitted, eval only
in development). There are no third-party scripts in the rendered pages. The existing
UI test mount helper now awaits fragment initialization before interacting; assertions
were retained. The login page itself remains the US3 slice.

| Check | Result |
| --- | --- |
| `pnpm validate:iam --phase US2` | PASS: 135 API tests / 11 files + 20 UI tests / 2 files |
| API complete unit suite | PASS: 22/22 |
| Frontend complete suite | PASS: 25/25 |
| Independent API/web lint and typecheck | PASS |
| Independent API/web production builds | PASS; frontend public API URL supplied |
| Workspace format, scope and diff whitespace | PASS |
| Compiled API + local SMTP/Mailpit | PASS: register → 24h verification proof → confirm → seed session → 30m reset mail → reset → revoke session → replay denied |
| Built web HTTP smoke | PASS: three routes 200, no-referrer header/meta, script CSP and no external script URLs |

The Mailpit smoke now covers recovery as well as registration. Test credentials/proofs
are never printed; only messages addressed to the run's random recipient are deleted.
Database runs clean their own disposable schemas on success/failure; the temporary web
smoke server on port 3100 was stopped. No database volume or unrelated mail was removed.

At US2 completion the backend integration CI job selected US2; after US4 it selects US4.
Remote CI, real browser behavior,
Resend production delivery, and usability evidence were not run or inferred from these
local checks. No extension hooks were configured (`.specify/extensions.yml` absent).

## 2026-09-26 — US3 completed (T039–T044)

Scope: verified ACTIVE LOCAL login and one independent session per successful
authentication. T001–T044 are complete. Refresh rotation, logout, reload bootstrap,
social authentication and later stories remain pending. The initial test-first runs
failed on the missing login endpoint/page; the current US3 suites are GREEN.

`POST /api/v1/auth/login` requires the exact frontend Origin and JSON, normalizes only
the email, preserves the password exactly, and applies independent IP/email limits.
Unknown email, wrong password, social-only identity and LOCKED user share the same 401.
An unverified LOCAL user receives 403 guidance only after the password matches. The
service performs a real Argon2 verification against a synthetic hash for unknown users,
then locks and re-reads the user and credential before issuing a session. A concurrent
password reset therefore invalidates an observed old password. Eligible older Argon2
hashes are upgraded without changing `credential_version`.

Every successful login creates a separate 14-day session, returns a 15-minute RS256
Access Token and session-bound CSRF token, and sets the host-only HttpOnly refresh
cookie. The response contains only the documented safe profile. The `/login` form keeps
the AccessSession in module memory, blocks duplicate submits, retains an existing session
after failed login, and never writes tokens to browser storage, URLs, or visible content.

| Check | Result |
| --- | --- |
| Test-first API run | RED: 18/18 login cases failed on the missing route; the PostgreSQL fixture and assertions executed |
| Test-first UI run | RED: login page import missing as expected |
| `pnpm validate:iam --phase US3` | PASS: 153 API tests / 13 files + 26 UI tests / 3 files |
| API unit suite | PASS: 22/22 |
| Frontend complete suite | PASS: 31/31 |
| Independent API/web lint and typecheck | PASS |
| Independent API/web production builds | PASS; `/login` generated as a static route |
| Workspace format, scope and diff whitespace | PASS |
| Compiled API + PostgreSQL + local SMTP/Mailpit | PASS: register → verify → reset/revoke/replay denial → login/cookie/JWT/session |

The database suites use disposable schemas and clean them in `finally`. The Mailpit
smoke deletes only messages for its random recipient and never prints credentials,
proofs or tokens. Remote CI, a real browser run, production Resend and usability evidence
were not run or inferred. Reload session bootstrap and refresh behavior belong to US4.
No extension hooks were configured (`.specify/extensions.yml` absent).

## 2026-09-26 — US4 completed (T045–T052)

Scope: refresh rotation, CSRF bootstrap, current/all-session logout and frontend session
recovery. T001–T052 are complete. Social onboarding and later stories remain pending.
The initial test-first checkpoint had eight expected 404 failures for the missing session
routes, while the UI suite failed discovery of the missing coordinator/provider.

Refresh credentials now rotate under the canonical User → Sessions → Credential lock
order. The predecessor remains as consumed history, exactly one generation successor is
inserted, CSRF remains stable, and the immutable 14-day session boundary is retained.
Presenting a consumed credential revokes the family with `REFRESH_REUSE`; the service
returns 401 only after that transaction commits. Concurrent refresh creates one successor
and the losing replay revokes the family, with no grace window or recoverable raw token.

`GET /auth/csrf`, `POST /auth/refresh`, `POST /auth/logout` and
`POST /auth/logout-all` implement the documented cookie, Origin, CSRF and bearer matrix.
Logout without an active resolvable session clears the cookie idempotently. Active logout
requires its context-bound CSRF token and revokes only that family; logout-all revokes all
families owned by the bearer principal. Reset/logout-all/refresh races finish with the
aggregate revocation intact. Already-issued Access Tokens retain only their cryptographic
residual lifetime and expire exactly at 900 seconds; no blacklist was added.

The root SessionProvider renders public content before bootstrap completes. The frontend
uses a per-tab single-flight promise plus Web Locks and BroadcastChannel coordination,
retries a failed business request at most once, never routes refresh/CSRF failures back
through refresh, and clears memory on logout or a lost rotation response. Tokens remain
memory-only.

| Check | Result |
| --- | --- |
| Test-first API checkpoint | RED: 8/8 new route tests failed with expected 404 |
| Test-first UI run | RED: missing refresh coordinator/session provider imports |
| `pnpm validate:iam --phase US4` | PASS: 164 API tests / 16 files + 34 UI tests / 4 files |
| API unit suite | PASS: 22/22 |
| Frontend complete suite | PASS: 39/39 |
| Independent API/web lint and typecheck | PASS |
| Independent API/web production builds | PASS |
| Workspace format, scope and diff whitespace | PASS |
| Compiled API + PostgreSQL + local SMTP/Mailpit | PASS: register → verify → reset → login → refresh rotation → logout |

The CI integration job now selects US4. Database runs use disposable schemas and clean
them in `finally`; the Mailpit smoke deletes only its random recipient's messages and
does not print credentials or tokens. Remote CI, real-browser multi-tab behavior,
production Resend and usability evidence were not run or inferred. No extension hooks
were configured (`.specify/extensions.yml` absent).

## 2026-09-26 — US5 completed (T053–T060)

Scope: bounded social onboarding after a verified provider identity response. T001–T060
are complete. Provider-specific Google/Facebook OAuth start and callback flows remain
US6/US7. The controlled provider fake lives only under `apps/api/test`; there is no
public endpoint that accepts a caller-supplied provider identity or bypasses OAuth.

Pending contexts now use a hashed browser binding, separate CSRF seed and 30-minute
expiry without creating a User or session. A fresh callback resolves ExternalIdentity
first, records the observed pending context, locks and rechecks it, materializes
EXPIRED/CANCELLED state, revokes old proofs and creates a fresh ID/binding/seed. Two
restarts that observed the same context produce one winner; restart versus completion
also produces one terminal winner without replacing or reviving it.

Email submission and resend create encrypted, purpose-bound social verification outbox
items whose proof expiry cannot exceed the context expiry. Changing email invalidates
older proofs. Delivery failure leaves no partial Customer. Completion rechecks binding,
context, proof, email uniqueness and provider-subject uniqueness under locks, then creates
the social User (`password_hash=NULL`), ExternalIdentity, first session, consumes/revokes
proofs and marks onboarding complete in one transaction. Conflicts roll back every new
row and return only the generic 409 contract.

The four onboarding endpoints enforce the HttpOnly binding cookie, exact Origin and
context-bound CSRF matrix. The frontend clears proof fragments, keeps proof/session only
in memory, supports email and explicit resend, accepts the new session after successful
completion, and sends expired/old binding/proof cases to a fresh provider login without
automatic retry.

| Check | Result |
| --- | --- |
| Test-first API run | RED: service/completion modules missing as expected |
| Test-first UI run | RED: social-onboarding page missing as expected |
| `pnpm validate:iam --phase US5` | PASS: 176 API tests / 18 files + 39 UI tests / 5 files |
| API unit suite | PASS: 22/22 |
| Frontend complete suite | PASS: 44/44 |
| OpenAPI design validator | PASS: 14/14 |
| Independent API/web lint and typecheck | PASS |
| Independent API/web production builds | PASS; `/social-onboarding` generated statically |
| Workspace format, scope and diff whitespace | PASS |
| Existing compiled Mailpit flow | PASS after social outbox/template extension |

The CI integration job now selects US5. PostgreSQL tests use disposable schemas and
clean them in `finally`. Automated provider tests use only the controlled fake; no real
Google/Facebook account, production Resend, real-browser or usability evidence is
claimed. No extension hooks were configured (`.specify/extensions.yml` absent).

## 2026-09-26 — Phase 14 convergence completed (T105–T106)

The runtime now preserves the approved proof-bound conflict contract: both email and
provider-subject uniqueness conflicts return the same safe 409 Problem Details response
with code `ONBOARDING_CANNOT_COMPLETE`. The exception carries only that allowlisted
public code; the global filter still discards exception messages and database details.

Social onboarding contract coverage now exhausts email and resend limits and checks
`Retry-After`. Known proofs persist exactly five attempts before rejection, while unknown
proofs use the IP fallback bucket. These denial paths leave User and AuthSession empty.
PostgreSQL integration coverage independently verifies the persisted known-proof count.

| Check | Result |
| --- | --- |
| Test-first checkpoint | RED: both valid uniqueness-conflict cases returned `CANNOT_COMPLETE`; 179/181 API tests passed |
| `pnpm validate:iam --phase US5` | PASS: 181 API tests / 18 files + 39 UI tests / 5 files |
| API lint and typecheck | PASS |
| API production build | PASS |
| OpenAPI design validator | PASS: 14/14 |
| Workspace format, scope and diff whitespace | PASS |

No extension hooks were configured (`.specify/extensions.yml` absent).

## 2026-09-26 — US9 completed (T061–T065)

Access-token verification now creates a closed immutable principal containing the
verified user, session, role, token ID and token lifetime under domain-facing names.
Role and authentication guards plus `OwnershipPolicy` are exported from the IAM module.
Ownership defaults to owner-only; ADMIN access requires an explicit resource policy
opt-in. Existing logout-all integration proves forged body/query authority cannot change
the principal whose sessions are revoked.

Frontend capability checks cover Guest, CUSTOMER and ADMIN visibility while remaining a
UX-only helper. The authorization contract explicitly records that no owned business
resource module exists yet, so no placeholder table, controller or production test route
was introduced. The guard probe exists only in the integration test module.

| Check | Result |
| --- | --- |
| Test-first checkpoint | RED: principal/ownership modules missing and verified principal still exposed raw `sub`; 182/186 API tests passed |
| `pnpm validate:iam --phase US9` | PASS: 186 API tests / 20 files + 46 UI tests / 6 files |
| Complete frontend suite | PASS: 51/51 |
| Independent API/web lint and typecheck | PASS |
| Independent API/web production builds | PASS |

The CI integration job now selects US9. The web build uses the documented
`NEXT_PUBLIC_API_BASE_URL`; the session coordinator creates `BroadcastChannel` only in a
browser context. PostgreSQL validation uses a disposable schema. No extension hooks were
configured (`.specify/extensions.yml` absent).

## 2026-09-26 — US6 completed (T066–T074)

Google login now uses a persisted ten-minute one-time transaction. The public state and
short-lived HttpOnly browser cookie carry separate random secrets whose SHA-256 digests
are stored. The nonce is stored only as a digest, and the PKCE verifier is stored only in
an AES-256-GCM envelope. Callback processing locks and changes PENDING to PROCESSING
before any Google request, so a replay or concurrent callback cannot perform a second
exchange. Terminal rows clear the encrypted verifier.

The Google adapter uses the official library with Authorization Code, PKCE S256, nonce,
`openid email profile`, `access_type=online`, the exact configured client and callback,
and bounded provider calls. It validates the signed ID token plus issuer, audience,
authorized party, expiry, issued-at time and nonce. Only a fully validated
`email_verified=true` claim is trusted; provider tokens remain callback-local and are
discarded after claim extraction.

Identity resolution queries `provider + subject` before email and serializes first-time
creation per provider subject. Existing ACTIVE users keep the same account even when the
provider email changes. A new verified, unused email creates one passwordless CUSTOMER,
identity and session atomically. Email collisions do not link or duplicate an account;
missing or untrusted email evidence enters the existing bounded onboarding flow. The
callback sets an internal HttpOnly refresh/onboarding cookie and redirects only to fixed
frontend routes without provider code or internal tokens. The result page erases its
safe result query and obtains the Access Token through CSRF bootstrap plus refresh into
memory.

| Check | Result |
| --- | --- |
| Test-first API run | RED: Google adapter, transaction and resolver modules missing as expected |
| Test-first UI run | RED: OAuth result page missing as expected |
| `pnpm validate:iam --phase US6` | PASS: 203 API tests / 22 files + 49 UI tests / 7 files |
| Independent API/web lint and typecheck | PASS |
| API/web production builds | PASS; `/oauth-result` generated statically |
| Workspace format, script tests, scope and diff whitespace | PASS |
| Google real test app — first login | **PASS**: browser reached fixed `/oauth-result?result=success`; database recorded one CONSUMED transaction, one GOOGLE User, one ExternalIdentity and one session, with one distinct linked User. No PII or credential was captured. |
| Google real test app — repeat login | **PASS**: same test account reached the fixed success result again; database recorded two CONSUMED transactions and two sessions while retaining exactly one GOOGLE User, one ExternalIdentity and one distinct linked User. |
| Google real test app — cancel/deny | **PASS**: browser returned the expected safe failure and aggregate User/Identity/session counts did not increase. |
| Google real test app — rejected state | **PASS**: modified-state flow returned the expected safe rejection and created no additional User, ExternalIdentity or session. No callback URL or query value was retained. |

The CI integration job now selects US6. Automated Google tests use a controlled OAuth
client and signed-response boundary; the separate real-provider run covers first login,
repeat login, cancel/deny and rejected state for FR-064/SC-012. No credentials,
authorization codes, provider tokens or account data were printed or stored in this
evidence. No extension hooks were configured (`.specify/extensions.yml` absent).

## 2026-09-27 — US7 automated implementation complete; T081 blocked (T075–T080)

Facebook login now reuses the persisted ten-minute state/browser-binding transaction
without sending or storing Facebook nonce/PKCE material. The adapter pins Meta Graph API
`v26.0`, confirmed against the official Meta Graph API changelog on 2026-09-27, requests
only `public_profile,email`, exchanges the authorization code with the exact callback,
and bounds every provider request to ten seconds.

After exchange, the adapter validates `debug_token` validity, app ID, user ID and expiry,
then requires `/me.id` to match the debugged user ID. The `/me` request carries an
HMAC-SHA256 `appsecret_proof`. Returned email is normalized but always marked untrusted,
so a new FACEBOOK subject enters platform email verification even when Facebook returns
an email. An existing subject resolves before email and receives a new internal session
without re-onboarding; LOCKED remains denied. Provider access tokens stay callback-local
and are not passed to persistence or returned to the frontend.

The shared controller now allowlists enabled Google and Facebook independently and keeps
the same one-use state, browser cookie, fixed redirects, denial/replay handling and safe
errors. The login page exposes the fixed Facebook start route; the existing bounded
onboarding and memory-only OAuth result UI handle the two possible outcomes. The CI IAM
integration selection now runs US7.

| Check | Result |
| --- | --- |
| Test-first API run | RED: Facebook adapter module missing as expected |
| `pnpm validate:iam --phase US7` | PASS: 216 API tests / 24 files + 52 UI tests / 8 files |
| Workspace format, API/web lint and typecheck | PASS |
| API/web production builds | PASS; `/oauth-result` and `/social-onboarding` generated statically |
| Scope and diff whitespace | PASS |
| Facebook real test app — first/repeat/rejection | **BLOCKED**: no Facebook app ID, app secret or test-account credentials are available in this workspace; no mock result is recorded as provider evidence. |

T081 remains unchecked until the documented staging run completes first login, repeat
login and rejection against a real Facebook test app using Graph API `v26.0`. No
extension hooks were configured (`.specify/extensions.yml` absent).

## 2026-09-27 — Facebook email trust policy supersedes prior US7 behavior

Product policy now accepts a syntactically valid email returned by Facebook after the
backend has validated code exchange, `debug_token` app/user/expiry and matching `/me`
identity. Such a first login must create the FACEBOOK Customer and session immediately
and redirect to the fixed OAuth result. Missing or invalid Facebook email remains bound
to the existing platform onboarding and email-verification fallback. Identity-first
resolution, collision denial, LOCKED denial and provider-token non-persistence are
unchanged.

The previous US7 evidence above remains an accurate historical result for the superseded
rule, but is no longer evidence that the current requirement passes. Updated contract,
integration and frontend tests are committed to the new behavior. The focused web suite
passes 4/4 and both application typechecks pass. `pnpm validate:iam --phase US7` is
intentionally RED at 215/216 API tests: the sole failure proves the current Facebook
adapter still returns `emailVerified: false`. T079 is reopened until implementation is
updated; no real-provider result is inferred from this test-first checkpoint.

### T079 implementation completion

The Facebook adapter now sets `emailVerified=true` only when `/me` returns a syntactically
valid normalized email after the existing token validity, app ID, expiry and matching
debug-token/profile user checks have passed. A missing or invalid email remains null and
unverified, preserving the bounded social-onboarding fallback. The shared resolver still
resolves an existing provider subject first, blocks LOCKED users and rejects email
collisions without linking; provider tokens remain callback-local.

| Check | Result |
| --- | --- |
| `pnpm validate:iam --phase US7` | PASS: 216 API tests / 24 files + 53 UI tests / 8 files |
| API lint and typecheck | PASS |

This automated checkpoint validates the revised business policy but does not replace any
required real-provider evidence.

## 2026-09-27 — US8 profile and password change completed (T082–T087)

Authenticated users can now read a closed safe profile and update only `displayName`
and `phoneNumber`. The controller rejects empty updates, unknown or privileged fields,
whitespace-only values, oversized values and malformed password input. Profile lookup
and mutation derive the owner exclusively from the verified bearer principal; request
body and query identifiers never select another account.

LOCAL password change verifies the current password before work and rechecks it after
locking User → Sessions → PASSWORD_RESET Challenges. Success updates the hash, increments
`credential_version` exactly once, revokes every active session with
`PASSWORD_CHANGE`, invalidates active and pending reset proofs, and clears the refresh
cookie. A wrong password and transaction failure leave the hash, version, sessions and
proofs unchanged. GOOGLE/FACEBOOK accounts return the stable safe code
`PASSWORD_CHANGE_NOT_APPLICABLE` and never gain a LOCAL credential. The per-principal
password-change limiter returns 429 with `Retry-After` after five attempts per 15 minutes.

The `/account` route fetches the authoritative profile through the memory-only bearer
session, labels phone numbers as unverified, exposes no privileged inputs, and broadcasts
a local logout after successful password change so the user must sign in again.

| Check | Result |
| --- | --- |
| `pnpm validate:iam --phase US8` | PASS: 235 API tests / 26 files + 56 UI tests / 9 files |
| API/web lint and typecheck | PASS |
| API/web production builds | PASS; `/account` generated statically |
| Diff whitespace | PASS |

PostgreSQL validation used a disposable schema and the runner cleaned it in `finally`.
No extension hooks were configured (`.specify/extensions.yml` absent).

## 2026-09-27 — Phase 15 convergence implementation (T107–T109)

Social-onboarding resend now keeps an older `ACTIVE` proof valid while a same-email
replacement is pending or fails. The older proof is revoked only when the newer delivery
is accepted; changing the candidate email still invalidates all prior proofs immediately.
Integration coverage verifies terminal resend failure, successful replacement and stale
out-of-order delivery.

Existing social identities now fail closed when their provider disagrees with the linked
User login method or the linked User is missing. No replacement account or session is
created for either integrity failure.

OAuth identity resolution and the claimed transaction transition to `CONSUMED` now share
one database transaction for existing-user login, direct account creation and bounded
onboarding. Injected finalization failures verify rollback of session, account, identity,
last-authentication and onboarding changes.

| Check | Result |
| --- | --- |
| `pnpm validate:iam --phase US5` | PASS: 184 API tests / 18 files + 39 UI tests / 5 files |
| `pnpm validate:iam --phase US6` | PASS: 211 API tests / 22 files + 49 UI tests / 7 files |
| `pnpm validate:iam --phase US7` | PASS: 224 API tests / 24 files + 53 UI tests / 8 files |
| `pnpm validate:iam --phase US8` | PASS: 243 API tests / 26 files + 56 UI tests / 9 files |
| API format, lint and typecheck | PASS |

### T110 Facebook real-provider completion

The earlier blocked T081/T110 record is superseded by a same-day run against the configured
Facebook test app through the real browser, callback and Graph endpoints. The application
used the exact local callback, pinned Graph API `v26.0`, and the current direct-email policy;
the test identity returned an eligible email and therefore did not enter fallback onboarding.

| Real-provider flow | Sanitized result |
| --- | --- |
| First login | PASS: one FACEBOOK User, one ExternalIdentity, one session and one `CONSUMED` OAuth transaction were created; no pending onboarding remained. |
| Repeat login | PASS: User and ExternalIdentity counts remained 1; sessions increased 1→2 and `CONSUMED` OAuth transactions increased 1→2; no duplicate account or onboarding context was created. |
| Provider rejection | PASS: a real callback rejected by the provider token endpoint ended as `FAILED` with safe code `FACEBOOK_TOKEN_EXCHANGE`; User/Identity/onboarding counts did not increase and no session was created by the rejected event. |

The validation retained only aggregate counts, terminal status, safe failure category and
Graph version. It did not retain or print the Facebook account, email, provider subject,
authorization code, access token, app ID, app secret, state or browser-binding value.
This completes T110 and supplies Facebook evidence for FR-064/SC-012; automated adapter
coverage continues to validate the missing/invalid-email fallback policy separately.
