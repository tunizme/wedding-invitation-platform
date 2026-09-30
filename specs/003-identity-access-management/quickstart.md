# Quickstart Validation: Feature 2 — Identity & Access Management

## Purpose

Guide này là acceptance/run guide cho implementation tương lai. Nó không thay thế [OpenAPI contract](./contracts/identity-access.openapi.yaml), [authorization contract](./contracts/authorization.md) hoặc [data model](./data-model.md), và không chứa production secret.

## Prerequisites

- Foundation prerequisites trong repository README: Node.js 24, pinned pnpm, Docker Compose v2.
- PostgreSQL và Mailpit local ports còn trống.
- Local environment templates đã được implementation cập nhật và copy đúng scope.
- Google/Facebook test app credentials chỉ cần cho real-provider validation; automated local tests dùng controlled adapters.
- Production-like security validation cần HTTPS domains cùng site cho frontend/API.

## Local configuration contract

Backend template phải fail fast và liệt kê tên field thiếu, không echo value. Tối thiểu gồm:

- Public/trust: `FRONTEND_PUBLIC_ORIGIN`, `API_PUBLIC_ORIGIN`, exact trusted/CORS origin.
- JWT: issuer, audience, active key ID, private signing key, current/previous public verification keys.
- Credential protection: refresh HMAC key/version, CSRF/challenge HMAC keys và transient AES-GCM key/version.
- Google: client ID/secret, exact callback URI.
- Facebook: app ID/secret, exact callback URI, pinned Graph API version.
- Email: local SMTP/Mailpit or production Resend transport, sender identity, bounded provider timeout.
- Cookie/TTL/rate/retention settings trong safe validated bounds.

Frontend chỉ nhận API base URL và fixed UI routes. Không `NEXT_PUBLIC_*` value nào chứa secret, provider credential, JWT key hoặc mail key.

## Fresh database and infrastructure

```bash
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm infra:up
pnpm --filter @wedding/api migration:run
pnpm --filter @wedding/api migration:show
```

Expected:

- PostgreSQL và Mailpit healthy; database chỉ bind loopback trong local.
- Foundation migration rồi IAM migration đều applied trên database trống.
- Re-running `migration:run` không tạo schema drift.
- `synchronize` và `migrationsRun` vẫn false.
- Schema có đúng IAM tables/constraints; không có template/invitation/order/payment placeholder.

## Automated quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @wedding/api test:integration
pnpm build
pnpm scope:check
```

Integration suite dùng PostgreSQL thật. Provider/email doubles phải kiểm tra protocol adapter boundary nhưng không gọi production account. Mọi command có timeout/cleanup và failure chỉ rõ component.

## Slice 1 — Local registration

Validate qua UI hoặc `POST /api/v1/auth/registrations`:

1. Register email mới với password ≥8 ký tự.
2. Xác nhận response 202 generic, User CUSTOMER/ACTIVE/LOCAL được tạo một lần, chưa có session.
3. Register cùng email với khác case/whitespace và hai requests đồng thời.
4. Xác nhận response ngoài giống nhau, đúng một User, email chỉ trim+lowercase; dot/+tag được giữ.
5. Inspect application/access/audit logs: không password/hash/proof/body secret.

## Slice 2 — Local verification and password recovery

1. Đọc verification message trong Mailpit; URL dùng fragment và không xuất proof trong server access log.
2. Confirm proof một lần: email verified; lần hai/hết hạn/wrong-purpose bị từ chối.
3. Login trước verification bị chặn; sau verification thành công.
4. Forgot Password cho email tồn tại/không tồn tại/social/unverified trả cùng external response.
5. Reset proof hợp lệ đổi password, revoke mọi session và không auto-login; used/expired proof không đổi state.
6. Simulate email failure/resend: challenge mới thất bại không làm mất proof cũ còn hợp lệ.
7. Crash worker sau claim/sau provider acceptance/trước finalize; reclaim dùng owner token mới, stale worker không finalize. Proof consumed/revoked/expired không active lại; stale email không revoke proof mới hơn. Check nullable ciphertext cleanup và social proof expiry ≤ onboarding expiry.

Recovery race validation (Slice 2): issue two reset proofs at one credential_version; concurrent completion permits only one password update. Reset proof issued before password change is rejected afterward. Delayed mail cannot activate a stale snapshot; rollback leaves version/password/sessions unchanged. Opportunistic rehash keeps version unchanged. Neither version nor snapshot appears in public responses.

## Slice 3 — Local login and session bootstrap

1. Login LOCAL verified/ACTIVE trả Access Token 15 phút, CSRF token, refresh cookie HttpOnly; password/hash không có trong response.
2. Unknown email, wrong password và LOCKED account có safe non-enumerating result; không session mới.
3. Reload frontend: Access Token không ở local/session storage; app dùng refresh cookie → CSRF bootstrap → refresh.
4. Tamper JWT algorithm/type/issuer/audience/kid/expiry/claims và xác nhận 401; valid token trước exp pass, tại/sau exp fail, không cộng 30 giây.

## Slice 4 — Refresh, logout and revocation

1. Refresh hợp lệ consume generation N, set N+1, giữ absolute expiry ban đầu.
2. Dùng lại generation N: toàn session family bị revoke; N+1 không dùng tiếp được.
3. Gửi hai refresh đồng thời: không có token branch; strict policy có thể buộc login lại. Frontend single-flight không tự loop/retry refresh.
4. Logout current khi Access Token hết hạn vẫn revoke đúng session; lặp lại logout là business-success.
5. Logout-all chỉ với bearer auth revoke mọi session.
6. Sau logout/password change/reset/lock, Access Token cũ có thể còn hiệu lực tối đa 15 phút; không test immediate blacklist.
7. Thiếu/sai Origin bị 403. Refresh và active-session logout thiếu/sai CSRF bị 403. Logout thiếu/hỏng/unresolvable cookie hoặc revoked/expired session với allowed Origin trả 204 và clear cookie mà không cần CSRF; không tác động session khác.
8. Reload/multi-tab lấy cùng context-bound CSRF token; refresh rotation giữ seed, wrong-context token bị từ chối. Kiểm thử old-key retention và new context seed.

## Slice 5 — Social onboarding

Using controlled provider responses:

1. Missing/untrusted email tạo PendingSocialOnboarding, không User/session.
2. Submit email, deliver/confirm proof, then atomically create User + ExternalIdentity + Session.
3. Competing email/identity completion leaves no partial User/Identity/Session.
4. Expired/replayed onboarding cookie/proof, cancelled provider and delivery failure fail closed.
5. Email collision sau valid proof/binding trả 409 ONBOARDING_CANNOT_COMPLETE, không phân biệt email/identity conflict hoặc tiết lộ provider. Invalid proof không tiết lộ uniqueness result.

Onboarding restart validation (Slice 5): restart via a fresh verified OAuth callback after expiry but before cleanup, and after losing browser binding. Confirm fresh context ID/binding/CSRF seed, old context EXPIRED/CANCELLED and old proofs unusable. Race two callbacks that observed the same context: at most one replacement commits; loser gets a safe restart-required result. Race restart versus completion: existing identity takes precedence when completion wins; replaced context cannot complete when restart wins. Retained terminal records must not block the partial unique index.

## Slice 6 — Google

Automated adapter matrix:

- State/browser binding/PKCE/nonce/signature/issuer/audience/azp/expiry failures.
- Valid `sub` + `email_verified=true` creates one GOOGLE Customer and session.
- Existing `(GOOGLE,sub)` returns same User even if provider email changes.
- false/missing email_verified enters platform verification.
- Duplicate email blocks without link; LOCKED identity cannot login.

Staging real-provider check before release:

1. Use Google test app with exact HTTPS callback.
2. Complete one first login and one repeat login.
3. Cancel/deny once and test wrong/expired state.
4. Record pass/fail, app/config version and timestamp; never record code/token/secret.

## Slice 7 — Facebook

Automated adapter matrix:

- Invalid/expired token, app ID mismatch, debug-token/user-ID mismatch, missing email, permission denial/cancel and Graph version error.
- New FACEBOOK identity có email hợp lệ tạo Customer/session ngay; không chuyển qua onboarding.
- Missing hoặc invalid Facebook email mới vào platform email verification trước khi tạo Customer/session.
- Existing `(FACEBOOK,providerSubject)` logs into same User; changed/missing email does not create another User.
- Provider token is absent from persistence and logs after callback.

Staging real-provider validation mirrors Google and records pinned Graph API version. Provider doubles do not replace this gate.

## Slice 8 — Profile and password change

1. GET profile exposes safe fields only.
2. PATCH changes only displayName/phoneNumber; attempts to send email/role/status/emailVerified/passwordHash/identity cannot mutate them.
3. LOCAL correct current password changes hash, revokes all sessions and clears cookie.
4. Wrong current password leaves password/sessions unchanged.
5. GOOGLE/FACEBOOK account gets explicit not-applicable result and no LOCAL credential.

## Slice 9 — Role and ownership

Run the matrix in [authorization.md](./contracts/authorization.md):

- Guest denied protected endpoints.
- CUSTOMER denied Admin endpoints.
- Forged request role/userId/ownerId never changes principal or ownership decision.
- CUSTOMER A cannot read/mutate Customer B data.
- No template/invitation/order/payment module is introduced just to simulate ownership.

## Slice 10 — Admin Customer management

1. Seed ADMIN through documented operational mechanism, never public registration.
2. List 100.000 Customer fixture rows: cursor pagination/search/status filter returns first page under 2 seconds and does not duplicate/skip due offset behavior.
3. Detail excludes password hash, token, provider secret/code.
4. Lock Customer atomically changes status, revokes all sessions and appends audit.
5. Unlock appends audit but old sessions remain revoked.
6. Self/other-ADMIN target, role change, delete and profile edit are rejected/not exposed.
7. Repeated lock/unlock vẫn có audit NO_CHANGE với previous=new, requested action và request ID; transition có CHANGED. Audit failure rollback; lock luôn bảo đảm revoke target sessions.

## Security and log inspection

Search application, proxy, CI and Mailpit-test logs after all flows. None may contain:

- clear password or password hash;
- Access/Refresh/CSRF token;
- verification/reset/onboarding proof or full proof link;
- OAuth state, nonce, PKCE verifier, authorization code or provider token;
- Google/Facebook/client/mail/JWT/encryption secret.

OAuth callback access logging must drop/redact query strings. Request-body logging must be disabled/redacted on credential/proof endpoints. Safe security events contain request ID, event type, provider/category and result only.

## Deployment-shape security validation

Against production-like HTTPS sibling domains, verify:

- refresh/onboarding/OAuth cookies are host-only, Secure, HttpOnly, SameSite=Lax and correctly scoped;
- credentialed CORS accepts exact frontend origin only and never wildcard;
- untrusted or missing Origin fails on browser-auth mutations requiring Origin; missing/invalid CSRF fails on refresh, active-session logout and onboarding mutations. Logout without an active session accepts allowed Origin, clears its cookie and returns 204 without revoking another session; see Slice 4 and the conditional logout security in the OpenAPI contract;
- OAuth redirects cannot leave allowlist and carry no internal token/code;
- browser storage contains no Access/Refresh Token after login, refresh or OAuth;
- provider/email/RSA/encryption keys are backend-only and startup rejects placeholder/missing values.

If target domains are unrelated sites, stop: update plan/security contract instead of changing SameSite to None without design review.

## Retention, cleanup and database health

Run cleanup in dry-run/controlled test mode with expired fixtures. Confirm bounded batches, configured retention, outbox ciphertext clearing and no deletion of refresh history before session reuse window closes. Observe duration/failure/row metrics and PostgreSQL autovacuum/bloat for high-churn tables.

Automated coverage is `retention.spec.ts`. It creates only expired fixtures in the runner-owned
schema, verifies FK deletion order, the 1,000-row upper bound, expired challenge/outbox/onboarding
terminalization, stale OAuth crash recovery with an in-flight grace window, terminal ciphertext
cleanup, structured rollback/failure metrics and preservation of session/refresh history still
inside the reuse window. Production cleanup is not a manual SQL run; use the application worker
and its safe metrics.

## Production-like browser procedure

This check must run against HTTPS frontend/API sibling domains under the same registrable domain,
with test provider accounts and browser developer tools or an approved browser automation trace.
Use fresh browser profiles and retain only sanitized assertions, never cookies/tokens/callback URLs.

1. Register, verify and login. Confirm refresh cookie is host-only, `Secure`, `HttpOnly`,
   `SameSite=Lax`, correct Path, and absent from `document.cookie`, localStorage, sessionStorage,
   IndexedDB and Cache Storage. Confirm Access Token disappears after reload and is restored only
   through CSRF bootstrap/refresh into memory.
2. From the exact frontend origin, verify credentialed CORS and refresh. Repeat with missing and
   hostile Origin, wildcard expectations, missing/wrong-context CSRF and a cross-site page; all
   protected mutations must fail without changing session state.
3. Open two tabs, force concurrent business requests and one refresh rotation. Confirm one
   cross-tab refresh result, no token branch, no retry loop and safe login fallback after a lost
   response.
4. Run Google and Facebook first/repeat/rejected handoffs. Confirm provider code/state never reach
   frontend history/storage/log evidence; redirects are fixed and the internal refresh/onboarding
   cookie performs the handoff.
5. Logout with active, expired and missing credentials. Confirm active logout requires CSRF,
   no-session logout with allowed Origin is idempotent, and another session is untouched.
6. Export a sanitized result matrix with browser/version, frontend/API origins, timestamp and
   PASS/FAIL per assertion. Delete the test profile and log out provider accounts.

If the domains are not same-site or HTTPS, stop and revise the approved security design; do not
silently switch production cookies to `SameSite=None`.

## Phase 13 all-phase validation

```bash
POSTGRES_PORT=55432 pnpm infra:up
pnpm build:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local \
  node apps/api/scripts/with-test-iam.cjs pnpm validate:iam --phase all
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local \
  pnpm validate:iam:mail
pnpm infra:down
```

The all runner checks required files, uses one random disposable schema, runs contract/integration
and frontend regression, format/lint/typecheck/unit/build/scope/health, and always drops only its
own schema. Provider, production-like browser and 20-participant usability evidence remain separate
and must never be inferred from this automated PASS.

## Full-stack smoke and cleanup

```bash
pnpm smoke:local
pnpm health
pnpm infra:down
```

Expected: existing frontend/backend/PostgreSQL health remains green; Mailpit lifecycle is documented; shutdown cleans processes/containers without deleting the database volume unless the explicitly guarded destructive reset command is chosen.

## Design validation và phase runner

Validator design đã được chuẩn bị tại `apps/api/scripts/validate-iam-contract.cjs`: `@apidevtools/swagger-parser` 13.1.0 kiểm tra OpenAPI 3.1, `js-yaml` 4.3.2 parse YAML và `ajv` 8.18.0 + `ajv-formats` 3.0.1 compile Schema Objects theo JSON Schema 2020-12. Node 24/CommonJS; dependencies pin trong API manifest/lockfile. Chạy từ repository root, không cần database hoặc provider credentials:

```bash
node --test --test-isolation=none --test-timeout=30000 apps/api/scripts/validate-iam-contract.cjs
```

Expected: toàn bộ document và component schemas hợp lệ; AdminCustomer đầy đủ được chấp nhận, thiếu từng timestamp hoặc thêm secret/unknown field bị từ chối; 409 onboarding ràng buộc valid proof/browser binding; logout mô tả cả active-session protection và no-active-session cleanup. Đây là design fixtures, chưa chứng minh runtime authentication/security. Validator không truy cập external references qua mạng. Không yêu cầu user-story implementation tests chưa tạo phải pass và không dùng passWithNoTests để che thiếu test bắt buộc.

Evidence 2026-09-26: T001 hoàn tất trên Node 24.21.0/CommonJS. T002 pass 14/14 kiểm tra sau khi quote description của response `204` tại `POST /admin/customers/{customerId}/lock`; trước đó dấu phẩy trong YAML flow mapping tạo property thừa. Đây chưa phải evidence runtime IAM hoặc migration.

Runner T007 đã có: `pnpm validate:iam --phase setup|foundation|US1…US10|all`. Timeout Setup 5 phút; Foundation/story 10 phút (US10 15 phút); all 30 phút. Setup kiểm tra tooling/schema fixtures/discovery; phase sau kiểm tra danh sách test bắt buộc rồi chạy slice và regression dependency theo thứ tự tasks (US9 trước US6). Thiếu file test trả nonzero trước khi kết nối database; không coi một phase chưa triển khai là pass.

Phase có database yêu cầu `IAM_TEST_DATABASE_URL` trỏ tới PostgreSQL dành cho kiểm thử, với quyền tạo schema; không tự fallback sang `DATABASE_URL`. Runner không khởi động hoặc sở hữu container: người chạy chuẩn bị PostgreSQL trước. Mỗi lượt tạo `iam_test_<random UUID>`, cấu hình cả TypeORM schema và connection search_path; `IAM_TEST_SCHEMA` chỉ hợp lệ trong NODE_ENV=test. Teardown finally chỉ drop schema vừa tạo và đóng control connection; không đụng public schema hoặc persistent volume. Child processes có timeout/abort và cleanup process group trên Linux; tests phải đóng connections/workers/test servers ở hooks riêng. Không truyền production credentials vào runner.

```bash
pnpm validate:iam --phase setup
node --test --test-isolation=none --test-timeout=30000 scripts/tests/iam-validate.test.mjs
# Sau khi đã triển khai tests/runtime của phase và cấp IAM_TEST_DATABASE_URL:
pnpm validate:iam --phase foundation
```

Evidence T007 (2026-09-26): PostgreSQL local cổng 55432 chạy baseline migration lifecycle 3/3 trong schema riêng; kiểm tra current_schema đúng và cleanup sau success/intentional failure, không còn hai schema tạm sau run. Đây không phải evidence migration IAM (chưa được tạo). Setup runner pass; Foundation từ chối hai runtime test files chưa có đúng như expected negative check. Real-provider checks tối đa 15 phút/lượt, logout/đóng browser sau run; thiếu credentials ghi blocked, không dùng automated Setup thay thế.

### Dependency và discovery evidence

Dependency gate T005: `node --test --test-isolation=none --test-timeout=30000 apps/api/scripts/validate-iam-dependencies.cjs` kiểm tra CommonJS và native Argon2id roundtrip; pass 2/2 trên Node 24.21.0. `pnpm peers check` pass. Resend pin 6.28.0 để không cần ngoại lệ minimum release age; không bật lifecycle scripts cho dependency mới. Hash benchmark production vẫn thuộc T101.

Contract project T006: `pnpm --filter @wedding/api test:contract`. `test:iam` chọn unit/contract/integration dưới identity-access; runner ở T007 kiểm tra file bắt buộc theo phase trước khi gọi test để không để Setup fixtures che thiếu runtime tests. Vitest `passWithNoTests=false`.

Kết quả cuối T007: Setup pass 18 contract checks + 11 runner tests + 2 scope tests; API unit 9/9; API typecheck/lint/format và formatter cho runner/scripts đều pass. PostgreSQL kiểm thử đã dừng sau validation, giữ nguyên container/volume. T008 trở đi chưa thực hiện.

## Usability evidence

Áp dụng protocol đã xác nhận trong spec: tối thiểu 20 người dùng riêng biệt mỗi flow; SC-002 end-to-end registration gồm verification/mail tới login screen, 95% trong 2 phút; SC-003 chọn provider tới Customer session, trong đó Facebook email hợp lệ đi thẳng còn missing/invalid email tính cả onboarding/mail, 95% trong 90 giây và hai provider đánh giá riêng; SC-013 đúng next step không được gợi ý, ít nhất 90%. Ghi denominator, total/provider/mail/UI timing, failures và môi trường. Không loại lượt chậm/lỗi tùy ý hoặc nới ngưỡng để pass. Evidence thực tế chỉ được tạo khi thực thi; unit tests không thay usability hoặc real-provider checks.

### Setup continuation — T008–T009 (2026-09-26)

Scope scanner cho phép authentication/authorization theo spec 003 và tiếp tục chặn invitation editor/payment provider/VNPay. Regression test xác nhận IAM được phép nhưng nội dung chứa cả IAM và payment vẫn bị chặn. Migration lifecycle kiểm tra từng bảng ngoài phạm vi trong `current_schema()`, cho phép bảng IAM khi migration xuất hiện.

Evidence: `pnpm validate:iam --phase setup` pass 18 contract checks và 14 runner/scope tests; PostgreSQL 17 local cổng 55432 pass migration lifecycle 3/3 trong schema riêng qua `withTestSchema`, cleanup thành công. Sandbox cần quyền kết nối localhost để chạy PostgreSQL tests.

Đã đọc `apps/web/AGENTS.md` và installed Next.js guide `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`: pages/layouts mặc định Server Components; form/session/browser logic đặt trong Client Components; provider keys chỉ thuộc backend. Đọc thêm guide liên quan khi triển khai từng frontend slice. Ignore files và ESLint global ignores đã bao phủ build/dependencies/coverage/secrets; packages private nên không cần npmignore.

Prerequisites cho Foundation: T010/T011 phải tồn tại trước chạy checkpoint, `IAM_TEST_DATABASE_URL` trỏ PostgreSQL test được chỉ định; runner không dùng DATABASE_URL làm fallback. Provider credentials không cần cho automated Foundation; real-provider/browser/usability vẫn là evidence riêng.

### Foundational implementation — T010–T022 (2026-09-26)

`pnpm validate:iam --phase foundation` hiện bao gồm design/security/schema và regression migration/health. Cấp `IAM_TEST_DATABASE_URL` trỏ PostgreSQL test. Migration cài extension database-wide `pg_trgm` vào public nếu chưa có, giữ lại extension khi cleanup; các bảng/dữ liệu test nằm trong schema tạm. Dùng database test riêng, không production hoặc database chứa dữ liệu người dùng. Extension đã có được resolve theo namespace thực tế; không đặt extension trong schema tạm để tránh cleanup làm mất dependency của run khác.

Startup thường yêu cầu đầy đủ key server-only trong `apps/api/.env.example`; không tự tạo fallback keys. Cho local/CI disposable, chạy từ root:

```bash
node apps/api/scripts/with-test-iam.cjs pnpm dev:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam --phase foundation
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1 pnpm build:web
```

Wrapper cấp key ngẫu nhiên chỉ trong environment của child, không in/lưu secret, tắt providers và dùng NODE_ENV=test. Key mất khi restart: chỉ dùng cho test/disposable local sessions. Không chạy wrapper trên production. Compose profile ci dùng wrapper tương tự; runtime image mặc định vẫn fail-fast khi thiếu production keys. CI giữ bốn jobs độc lập.

IAM migration `down` chỉ chấp nhận NODE_ENV=test và schema `iam_test_<32 hex>` do runner tạo; không dùng rollback này trên dữ liệu thật. Foundation baseline được giữ lại khi rollback IAM.

Default trust proxy=false: limiter chỉ lấy socket peer address, không tin X-Forwarded-For. Production reverse proxy cần một thay đổi cấu hình được kiểm chứng trước khi tin proxy headers. `IAM_RATE_<ACTION>` chỉ được giảm threshold trong khoảng 1..default; windows và TTL theo contract được giữ cố định. CSRF giữ seed/key version của context; giữ old keys trong maps khi rotate.

Evidence chi tiết: [validation-results.md](validation-results.md). Foundation PASS không chứng minh registration/login/social/admin đã tồn tại; phase tiếp theo là US1, T023.

### US1 — local registration (T023–T031, 2026-09-26)

Implemented `POST /api/v1/auth/registrations` and frontend `/register`. Requests require the exact configured frontend Origin and JSON. Unknown fields/invalid input return safe 422; Origin/content-type denial returns 403 (documented in OpenAPI); rate limits return 429 with Retry-After. New and duplicate normalized emails return the same 202 body and no session cookie. Duplicate requests do not overwrite credentials or enqueue another registration email.

```bash
# Use 55432 if the default PostgreSQL port is occupied.
POSTGRES_PORT=55432 pnpm infra:up
pnpm build:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam --phase US1
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam:mail
```

Mailpit SMTP defaults to 127.0.0.1:1025 and its inbox to http://127.0.0.1:8025; root `MAILPIT_SMTP_PORT`/`MAILPIT_HTTP_PORT` override published ports, and backend `IAM_SMTP_PORT`/smoke `IAM_TEST_MAILPIT_URL` must match. Compose API uses service host `mailpit`. Image is pinned to [Mailpit v1.31.2](https://github.com/axllent/mailpit/releases/tag/v1.31.2), per the [official Docker documentation](https://mailpit.axllent.org/docs/install/docker/). Both published ports bind loopback. No relay is configured. Normal infra shutdown retains the PostgreSQL volume.

The mail smoke requires the API build, PostgreSQL and Mailpit. It creates a disposable schema, starts the compiled API with ephemeral keys, submits one registration, checks the captured proof against its hash/24h expiry, and verifies no session and cleared ciphertext. It deletes only messages addressed to that run's random test recipient, closes the app, then drops its own schema. Maximum child runtime is 60 seconds. It never prints the proof/message body.

Outbox: one message per cycle, 1-second idle interval, 30-second fresh lease, provider timeout at most 10 seconds, five send attempts with bounded exponential backoff (maximum 900 seconds). Reclaim uses a new lease owner. Resend idempotency keys stay stable across retries; SMTP may deliver duplicates. Finalization locks owner → challenges → outbox, checks live lease, proof/context eligibility and generation, and clears ciphertext only on accepted/terminal delivery. Failed resend preserves an older active proof. Production uses Resend with `IAM_EMAIL_FROM` and `IAM_RESEND_API_KEY`; SMTP is rejected in production. The test wrapper forces local SMTP and never inherits external mail transport.

The frontend only shows generic verification instructions. `/verify-email` and actual proof confirmation remain US2/T032–T038; US1 does not claim the account can log in yet. No Resend live-account run or real-browser usability result is claimed.


### US2 — local verification and recovery (T032–T038, 2026-09-26)

Implemented POST `/auth/email-verifications`, `/auth/email-verifications/confirm`,
`/auth/password-resets`, and `/auth/password-resets/confirm` under `/api/v1`.
All require the exact frontend Origin and JSON, return no-store, and never auto-login.
Request responses are generic 202; confirmation returns bodyless 204 or safe errors.
Verified LOCAL accounts (including locked accounts) can reset; reset never unlocks.
Every successful reset revokes the owner's sessions and consumes/invalidates reset proofs
atomically with the password/version update. Refresh credential history is retained;
the revoked parent session makes those credentials unusable.

The pages `/verify-email`, `/forgot-password`, `/reset-password` use Vietnamese forms.
Open the email fragment link, confirm verification or enter a new password, then follow
the login link. At completion of US2, the login page was still pending; US3 below now
implements that flow.
Proofs are cleared from the address bar and never saved to browser storage. Reloading a
cleared link requires reopening the email or requesting a new link. Recovery pages send
no-referrer and restrict script sources to self; no third-party resources are added.

```bash
# PostgreSQL + Mailpit local; use the explicit disposable-test target.
pnpm build:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam --phase US2
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam:mail
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1 pnpm build:web
```

`validate:iam:mail` now confirms the registration proof, seeds a test session, requests
and captures a real SMTP reset email in Mailpit, checks its 30-minute expiry, confirms
password replacement/session revocation and rejects replay. The 60-second bound and
recipient-specific cleanup remain in force. Real production Resend and browser/usability
checks are separate. See validation-results.md for current evidence and limitations.

### US3 — local login (T039–T044, 2026-09-26)

Verified ACTIVE LOCAL users can sign in at `/login`. The API requires the configured
frontend Origin and JSON, accepts the password exactly as typed, and returns a safe
AccessSession while setting the HttpOnly refresh cookie. Unknown users, incorrect
passwords, LOCKED users and social-only identities receive the same generic credential
error. Verification guidance appears only when a LOCAL password is correct.

The frontend keeps the Access Token and CSRF token only in module memory. It does not
place either token in localStorage, sessionStorage, cookies managed by JavaScript, URLs,
or rendered success text. A page reload currently clears the memory session; CSRF
bootstrap, refresh rotation and reload recovery are part of US4.

```bash
# PostgreSQL + Mailpit local; use the disposable IAM database target.
pnpm build:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam --phase US3
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam:mail
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1 pnpm build:web
```

The US3 checkpoint covers response/cookie/error contracts, dummy Argon2 verification,
lock/recheck behavior, session isolation, reset races, optional hash upgrade, and the
login form's memory-only handling. The compiled Mailpit smoke additionally logs in with
the replacement password after reset and verifies the cookie, JWT, safe profile and
active database session. Real browser and usability checks remain separate evidence.

### US4 — refresh and logout (T045–T052, 2026-09-26)

The root session provider bootstraps from the host-only refresh cookie by fetching a
stable CSRF token and rotating once for a new AccessSession. Refresh uses strict
first-writer-wins rotation: a consumed-token replay revokes the complete family. The
14-day absolute session expiry never moves, while Access Tokens remain valid for exactly
15 minutes and are not blacklisted after server-side session revocation.

Frontend requests share one refresh flight per tab and coordinate across tabs with Web
Locks and BroadcastChannel. A business request receives at most one retry. Refresh itself
is never retried, and a lost rotation response clears memory and requires login. Public
content renders while bootstrap is pending or the API is unavailable. Current logout
clears local memory even on network failure; logout-all uses the current bearer token.

```bash
pnpm build:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam --phase US4
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam:mail
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1 pnpm build:web
```

The US4 checkpoint covers the Origin/CSRF matrix, cookie clearing, rotation history,
reuse revocation commit, concurrent refresh, logout isolation, 14-day absolute expiry,
reset/logout-all races and 15-minute hard Access Token expiry. The compiled smoke extends
the existing email/recovery/login flow through CSRF bootstrap, refresh and logout. Real
browser multi-tab and usability checks remain separate evidence.

### US5 — social onboarding (T053–T060, 2026-09-26)

US5 implements the pending flow consumed by a verified OAuth callback. It does not expose
a test/bypass endpoint for creating provider identities. Google and Facebook start,
exchange and callback wiring belong to US6 and US7; until those slices are implemented,
`/social-onboarding` can only be exercised through controlled integration fixtures.

A pending context is not a Customer and receives no Access or Refresh Token. It is bound
to an HttpOnly onboarding cookie and separate CSRF token for 30 minutes. Submitting or
changing an email sends a purpose-bound proof and invalidates older proofs. Successful
confirmation atomically creates the social User, ExternalIdentity and first session;
email/provider conflicts, expiry, replay and delivery failure create no partial account.

```bash
pnpm build:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam --phase US5
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam:mail
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1 pnpm build:web
```

The US5 checkpoint uses a controlled provider port fake and real PostgreSQL to cover
expiry before cleanup, missing/old binding, restart races, restart versus completion,
email changes, terminal mail failure, email/provider conflicts, proof replay and atomic
User + ExternalIdentity + Session creation. Real provider validation remains mandatory
evidence for US6/US7 and is not inferred from this checkpoint.

### US9 — role and ownership policy (T061–T065, 2026-09-26)

The verified Access Token is projected into a closed immutable principal with `userId`,
`sessionId`, role, token ID and issued/expiry instants. Request body, query and path
fields never replace these values. Role metadata remains enforced by backend guards.

`OwnershipPolicy` accepts only a persisted owner key supplied by the resource module.
The owner is allowed, another Customer and Guest are denied, and ADMIN is denied unless
the resource policy explicitly opts in. No template, invitation, order or payment module
currently exists, so US9 records that dependency instead of creating a placeholder.
Frontend capability helpers only control visibility and never authorize an API request.

```bash
pnpm build:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local pnpm validate:iam --phase US9
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1 pnpm build:web
```

The checkpoint covers the Guest/CUSTOMER/ADMIN matrix, immutable principal projection,
forged role/userId/ownerId rejection, ADMIN opt-in ownership semantics, global guard
bindings and principal-scoped logout-all. The integration-only probe controller is
declared in the test file and is not included in the production module.
