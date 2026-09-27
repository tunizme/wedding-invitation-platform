# Tasks: Identity & Access Management

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts](contracts/), [quickstart.md](quickstart.md) và constitution v2.0.0.

**Phạm vi**: Feature 2 của roadmap, thư mục `003-identity-access-management`. Setup, Foundational, US1–US5 và US9 đã triển khai và kiểm chứng; tiến độ từng task bên dưới là nguồn theo dõi hiện hành. Evidence nằm trong validation-results.md. Theo clarification hiện hành, LOCAL **phải xác minh email trước login**; xác minh email local và Forgot Password **thuộc phạm vi**.

**Tests**: Spec yêu cầu unit/integration và kiểm thử provider thật. Viết test trước implementation, xác nhận thất bại đúng hành vi còn thiếu, sau đó làm pass. Contract tests kiểm tra cả request, response và safe errors.

**Organization**: Mỗi user story là một slice gồm backend, frontend, security và tests; ưu tiên P1 → P2 → P3. US9 được đưa trước các story P2. Authentication/authorization cơ bản có ngay ở Foundational, không chờ US9 mới bảo vệ API.

## Format và path conventions

- Task có ID tuần tự; `[P]` chỉ các task khác file có thể thực hiện song song sau khi dependency của phase hoàn tất.
- `[USn]` ánh xạ user story trong spec, không đánh lại số theo thứ tự phase.
- Đường dẫn tính từ repository root: API `apps/api/`, frontend `apps/web/`, tooling `scripts/`.
- File mới được nêu là đích triển khai dự kiến, không phải khẳng định đang tồn tại.
- T001 chuẩn bị validator; T002–T004 kiểm chứng design đã đồng bộ trước code; không thay đổi phạm vi đã clarify. Nếu phát hiện cần đổi business rule, dừng xin quyết định thay vì tự sửa spec.

## Verification protocol

Runner `pnpm validate:iam` đã được tạo và kiểm chứng ở T007. Mỗi checkpoint dưới đây chỉ chạy sau khi prerequisites của phase hoàn tất. Runner trả nonzero khi test thiếu, timeout hoặc failure; không để watch mode/chờ vô hạn. Mỗi phase chạy tests của slice và regression dependency; phase `all` chạy toàn bộ automated checks đã định nghĩa, không thay evidence provider/browser/usability thực tế.

PostgreSQL dùng schema/database disposable riêng từng run, không tác động database người dùng. Teardown trong `finally` đóng connection, worker và test server, xóa đúng schema tạm đã tạo, dừng container do run sở hữu; không xóa persistent volume. Browser/provider tests dùng test account, logout và đóng browser sau mỗi run. Test provider thật giới hạn 15 phút mỗi lượt; thiếu credentials hoặc cấu hình phải ghi blocked, không coi mock là evidence thay thế.

## Phase 1: Setup

**Goal**: Đồng bộ design và tooling trước code.

**Independent Test**: OpenAPI và Setup fixtures hợp lệ; discovery configuration được kiểm tra mà không yêu cầu implementation tests chưa tạo pass; không dùng passWithNoTests để che thiếu tests.

- [X] T001 Chuẩn bị parser/validator OpenAPI 3.1 và JSON Schema 2020-12 trong apps/api/package.json và pnpm-lock.yaml; pin dev dependencies tương thích Node24/CommonJS, ghi lệnh validation và Setup fixture expectations trong specs/003-identity-access-management/quickstart.md trước khi chạy T002.
- [X] T002 Kiểm chứng schema AdminCustomer object đóng đầy đủ bằng valid/missing-timestamp/secret-field fixtures, proof-bound 409 ONBOARDING_CANNOT_COMPLETE và conditional logout security trong specs/003-identity-access-management/contracts/identity-access.openapi.yaml và specs/003-identity-access-management/research.md; validate bằng OpenAPI/JSON Schema validator.
- [X] T003 Kiểm chứng CSRF HMAC(context type, ID, server-side seed) ổn định sau reload/rotation, logout no-active-session 204 sau Origin check và hard expiry Access Token 15 phút; rà soát specs/003-identity-access-management/research.md và specs/003-identity-access-management/data-model.md.
- [X] T004 Rà soát canonical lock order User→Sessions→Credentials→Challenges và outbox unique lease owner/reclaim/crash recovery, nullable ciphertext, generation/stale delivery và TTL proof ≤ onboarding trong specs/003-identity-access-management/plan.md và specs/003-identity-access-management/data-model.md trước migration.
- [X] T005 Pin dependency IAM theo plan trong apps/api/package.json và pnpm-lock.yaml; kiểm tra Node24/CommonJS/Argon2 compatibility; validator đã được chuẩn bị trước design validation.
- [X] T006 Cấu hình contract project và test:contract/test:iam scripts trong apps/api/vitest.config.ts và apps/api/package.json; phát hiện thiếu tests thay vì false pass.
- [X] T007 Tạo scripts/iam-validate.mjs và scripts/tests/iam-validate.test.mjs với --phase setup|foundation|US1…US10|all, timeout, schema PostgreSQL riêng và teardown finally; thêm validate:iam vào package.json.
- [X] T008 Cập nhật scripts/scope-check.mjs và scripts/tests/scope-check.test.mjs cho phép IAM đã phê duyệt, giữ chặn invitation/payment/VNPay; điều chỉnh assertion cấm User của foundation trong apps/api/test/integration/migrations.integration.spec.ts khi migration xuất hiện.
- [X] T009 Ghi runner/prerequisites trong specs/003-identity-access-management/quickstart.md; đọc apps/web/AGENTS.md và docs Next.js đã cài ở apps/web/node_modules/next/dist/docs trước frontend implementation.

**Checkpoint**: `pnpm validate:iam --phase setup` — timeout 5 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 2: Foundational

**Goal**: Security, schema, session issue/revoke tối thiểu dùng chung trước login/reset.

**Independent Test**: Empty/baseline DB migration, crypto/JWT/guards/config/limiter pass; không có domain module ngoài IAM.

### Tests — viết trước implementation

- [X] T010 [P] Viết unit tests config/JWT algorithm/issuer/audience/kid/expiry/password nguyên văn trong apps/api/test/unit/identity-access/security.spec.ts.
- [X] T011 [P] Viết PostgreSQL schema/constraints/session revocation tests trong apps/api/test/integration/identity-access/foundation.spec.ts với cleanup schema riêng.

### Implementation

- [X] T012 Tạo IAM entities theo data-model tại apps/api/src/modules/identity-access/domain/entities.ts và module apps/api/src/modules/identity-access/identity-access.module.ts; đăng ký entities ở apps/api/src/infrastructure/database/data-source.ts.
- [X] T013 Tạo explicit migration apps/api/src/infrastructure/database/migrations/20260926000100-IdentityAccess.ts cho 10 IAM tables, constraints/FKs/indexes/pg_trgm; giữ baseline, synchronize=false và migrationsRun=false; rollback chỉ disposable DB.
- [X] T014 Thêm server-only keys/key versions/origins/TTL/rate/provider enablement trong apps/api/src/config/identity-access.environment.ts và apps/api/.env.example; production fail-fast, local/test không cần real provider secrets.
- [X] T015 Triển khai Argon2id parameters theo research, random credentials/hash/AES-GCM envelope tại apps/api/src/modules/identity-access/infrastructure/credential-crypto.ts; password 8–128 Unicode code points, UTF-8 ≤512 bytes, không truncate.
- [X] T016 Triển khai RS256 signer/verifier TTL900, session issue/revoke và lock transaction helper tại apps/api/src/modules/identity-access/auth/access-token.service.ts, apps/api/src/modules/identity-access/auth/session.service.ts và apps/api/src/modules/identity-access/infrastructure/transactions.ts để US2 reset không phải chờ login UI.
- [X] T017 Đặt protected-route auth mặc định, public decorator và role guards tại apps/api/src/modules/identity-access/authorization/auth.guard.ts và apps/api/src/modules/identity-access/authorization/roles.guard.ts; immutable principal chỉ lấy từ verified JWT.
- [X] T018 Triển khai strict DTO rejection, safe Problem Details và header/body/query redaction tại apps/api/src/common/errors/problem.filter.ts, apps/api/src/common/logging/redaction.ts và apps/api/src/main.ts.
- [X] T019 Triển khai DB rate limiter atomic upsert, HMAC subjects, trusted-proxy rule, unknown-proof IP fallback và Retry-After tại apps/api/src/modules/identity-access/infrastructure/rate-limit.service.ts theo thresholds research.
- [X] T020 Triển khai host-only cookie writer/clearer, exact Origin/CORS và CSRF HMAC theo context type/ID/server-side seed và versioned key, no extra binding cookie tại apps/api/src/modules/identity-access/auth/browser-security.service.ts; login có Origin/JSON check chống login CSRF.
- [X] T021 Tạo safe typed frontend REST client tại apps/web/src/features/identity-access/api/client.ts; thông báo tiếng Việt, không persist tokens, frontend build độc lập.
- [X] T022 Wire module/config/guards vào apps/api/src/app.module.ts; giữ public health và thêm ephemeral IAM key fixtures cho existing CI jobs trong .github/workflows/ci.yml.

**Checkpoint**: `pnpm validate:iam --phase foundation` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 3: User Story 1 — Local registration (P1)

**Goal**: Tạo Customer LOCAL chưa verified, không session, generic response.

**Independent Test**: Email case/concurrency chỉ một user; duplicate không overwrite password; verification mail gửi qua outbox.

### Tests — viết trước implementation

- [X] T023 [P] [US1] Viết contract POST /auth/registrations cho 202 mới/trùng, 422/429 và no secret tại apps/api/test/contract/identity-access/registration.spec.ts.
- [X] T024 [P] [US1] Viết integration concurrent email/dots/+tag/hash nguyên văn/rollback/outbox failure tại apps/api/test/integration/identity-access/registration.spec.ts.
- [X] T025 [P] [US1] Viết form/loading/error/generic-success tests tại apps/web/tests/identity-access/register.test.tsx.

### Implementation

- [X] T026 [US1] Thêm Mailpit local/test loopback service và safe ports trong compose.yaml, .env.example và scripts/infra.mjs; shutdown giữ DB volume.
- [X] T027 [US1] Tạo challenge enqueue/outbox và SMTP/Resend adapters tại apps/api/src/modules/identity-access/verification/challenge.service.ts và apps/api/src/modules/identity-access/infrastructure/email-sender.ts; TTL24h và encrypted payload, không mail network trong transaction.
- [X] T028 [US1] Triển khai outbox worker lease/reclaim/bounded retry/idempotency tại apps/api/src/modules/identity-access/infrastructure/email-outbox.worker.ts; conditional finalize đúng fresh lease owner/deadline, generation và proof/context eligibility; failure giữ proof cũ; test crash-after-claim/acceptance, reclaim, stale delivery và consumed-proof không resurrect.
- [X] T029 [US1] Triển khai normalize/hash/unique-conflict mapping và User+challenge+outbox transaction tại apps/api/src/modules/identity-access/application/register-local.service.ts; duplicate không overwrite existing credential.
- [X] T030 [US1] Expose register controller/DTO/limiter tại apps/api/src/modules/identity-access/auth/registration.controller.ts; generic 202 giống nhau và không session Set-Cookie.
- [X] T031 [US1] Tạo apps/web/src/app/(auth)/register/page.tsx và apps/web/src/features/identity-access/forms/register-form.tsx; kết thúc ở verification instruction giống nhau cho mới/trùng.

**Checkpoint**: `pnpm validate:iam --phase US1` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 4: User Story 2 — Verification và recovery (P1)

**Goal**: LOCAL phải verified trước login; Forgot Password/reset thuộc feature này.

**Independent Test**: Proof expiry/replay/wrong-purpose fail; reset revoke seeded sessions mà không auto-login.

### Tests — viết trước implementation

- [X] T032 [P] [US2] Viết contract bốn request/confirm email-verifications/password-resets endpoints tại apps/api/test/contract/identity-access/verification.spec.ts.
- [X] T033 [P] [US2] Viết integration proof replay/concurrent consumption/resend failure/stale delivery và reset revoke tại apps/api/test/integration/identity-access/verification.spec.ts.
- [X] T034 [P] [US2] Viết fragment extraction, resend/forgot/reset và no-auto-login UI tests tại apps/web/tests/identity-access/verification.test.tsx.

### Implementation

- [X] T035 [US2] Triển khai request/confirm verification và reset tại apps/api/src/modules/identity-access/verification/local-verification.service.ts và apps/api/src/modules/identity-access/verification/password-reset.service.ts; chỉ verified LOCAL nhận reset proof, generic response cho ineligible account.
- [X] T036 [US2] Snapshot bigint User.credential_version vào PASSWORD_RESET challenge dưới User lock; completion yêu cầu equality, tăng version đúng một lần cùng hash update/consume/invalidate siblings/revoke sessions, không tự unlock; outbox từ chối activate stale snapshot. Kiểm thử concurrent reset (một winner), reset/change-password, delayed delivery và rollback tại apps/api/test/integration/identity-access/recovery-races.spec.ts; version/snapshot không public, opportunistic rehash không tăng version.
- [X] T037 [US2] Expose controllers và rate limits tại apps/api/src/modules/identity-access/verification/verification.controller.ts; proof body không log, no-store và safe errors.
- [X] T038 [US2] Tạo apps/web/src/app/(auth)/verify-email/page.tsx, apps/web/src/app/(auth)/forgot-password/page.tsx và apps/web/src/app/(auth)/reset-password/page.tsx; clear fragment, no-referrer/no third-party scripts và login lại sau thành công.

**Checkpoint**: `pnpm validate:iam --phase US2` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 5: User Story 3 — Local login (P1)

**Goal**: Login verified ACTIVE LOCAL và cấp một session độc lập.

**Independent Test**: Đúng credential tạo phiên; sai/LOCKED/unverified không tạo; response/cookie/expiry đúng.

### Tests — viết trước implementation

- [X] T039 [P] [US3] Viết contract login 200/401/403/422/429, cookie và safe profile tại apps/api/test/contract/identity-access/login.spec.ts.
- [X] T040 [P] [US3] Viết integration dummy hash/non-enumeration/unverified/LOCKED/session isolation/login-reset races tại apps/api/test/integration/identity-access/login.spec.ts.
- [X] T041 [P] [US3] Viết login form và memory-only token tests tại apps/web/tests/identity-access/login.test.tsx.

### Implementation

- [X] T042 [US3] Triển khai apps/api/src/modules/identity-access/auth/local-login.service.ts: normalize, dummy verify khi user thiếu, recheck credential dưới lock, issue session/Access Token và optional hash upgrade.
- [X] T043 [US3] Expose POST login với Origin/limiter và safe AccessSession response tại apps/api/src/modules/identity-access/auth/login.controller.ts.
- [X] T044 [US3] Tạo apps/web/src/features/identity-access/session/store.ts và apps/web/src/app/(auth)/login/page.tsx; hướng dẫn unverified chỉ sau đúng password, không token URL/storage.

**Checkpoint**: `pnpm validate:iam --phase US3` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 6: User Story 4 — Refresh và logout (P1)

**Goal**: Rotation/reuse, absolute 14d và logout đúng phạm vi.

**Independent Test**: Concurrent refresh không branch; reuse revoke family; logout expired Access Token/missing cookie idempotent; logout-all revoke toàn bộ.

### Tests — viết trước implementation

- [X] T045 [P] [US4] Viết contract csrf/refresh/logout/logout-all cùng Origin/CSRF matrix tại apps/api/test/contract/identity-access/session.spec.ts.
- [X] T046 [P] [US4] Viết PostgreSQL integration rotation/reuse/concurrency/14d/logout isolation tại apps/api/test/integration/identity-access/session.spec.ts; assert revoke commit trước error response.
- [X] T047 [P] [US4] Viết frontend multi-request/multi-tab/lost-response/no-loop/logout-memory tests tại apps/web/tests/identity-access/session.test.tsx.

### Implementation

- [X] T048 [US4] Triển khai apps/api/src/modules/identity-access/auth/refresh.service.ts với User→Session→Credential locks, one successor và reuse revoke commit trước 401; không grace window hoặc raw refresh storage.
- [X] T049 [US4] Expose csrf/refresh/logout/logout-all tại apps/api/src/modules/identity-access/auth/session.controller.ts; CSRF bootstrap sau reload, current logout dùng refresh credential và cookie clear đúng path kể cả khi thiếu/hỏng.
- [X] T050 [US4] Triển khai apps/web/src/features/identity-access/session/refresh-coordinator.ts: single-flight mỗi tab và coordination giữa tabs, retry API tối đa một lần, không tự retry refresh; lost response yêu cầu login.
- [X] T051 [US4] Wire bootstrap/logout controls ở apps/web/src/features/identity-access/session/session-provider.tsx và apps/web/src/app/layout.tsx; không chặn public UI khi API down.
- [X] T052 [US4] Thêm reset/logout-all/refresh race và hard expiry15m tests ở apps/api/test/integration/identity-access/revocation-races.spec.ts; giữ Access Token residual lifetime như spec, không blacklist.

**Checkpoint**: `pnpm validate:iam --phase US4` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 7: User Story 5 — Social onboarding (P1)

**Goal**: Pending context chưa phải Customer; chỉ tạo account/session sau verified email.

**Independent Test**: Controlled provider response đủ test onboarding độc lập; conflict/replay/expiry không partial account.

### Tests — viết trước implementation

- [X] T053 [P] [US5] Viết contract GET onboarding và POST email/resend/confirm với cookie/CSRF tại apps/api/test/contract/identity-access/social-onboarding.spec.ts.
- [X] T054 [P] [US5] Viết integration identity/email races, expiry/binding/proof replay/mail failure và atomic User+Identity+Session tại apps/api/test/integration/identity-access/social-onboarding.spec.ts.
- [X] T055 [P] [US5] Viết onboarding email/resend/expired/conflict UI tests tại apps/web/tests/identity-access/social-onboarding.test.tsx.

### Implementation

- [X] T056 [US5] Tạo provider identity port apps/api/src/modules/identity-access/domain/provider-identity.port.ts và fake tại apps/api/test/fixtures/identity-access/provider.fake.ts; fake chỉ test, không public onboarding bypass.
- [X] T057 [US5] Triển khai pending lifecycle/browser binding/CSRF tại apps/api/src/modules/identity-access/oauth/social-onboarding.service.ts; partial uniqueness chỉ PENDING_EMAIL/PENDING_VERIFICATION. Fresh verified OAuth callback resolve identity trước, lock/recheck observed context, expire/cancel context cũ và revoke proofs rồi tạo context mới; concurrent loser rollback/safe restart, không thay winner hoặc revive consumed context. Test expiry-before-cleanup, missing binding, restart/restart và restart/completion tại apps/api/test/integration/identity-access/social-onboarding.spec.ts; đổi email invalidate proofs cũ.
- [X] T058 [US5] Triển khai apps/api/src/modules/identity-access/application/complete-social-onboarding.service.ts: recheck unique email/providerSubject, social password null, verified timestamp, atomic identity/session/proof consumption; conflict rollback toàn bộ.
- [X] T059 [US5] Expose onboarding endpoints tại apps/api/src/modules/identity-access/oauth/social-onboarding.controller.ts; giới hạn resend/attempt, không tiết lộ existing provider và không Customer access trước verify.
- [X] T060 [US5] Tạo apps/web/src/app/(auth)/social-onboarding/page.tsx và apps/web/src/features/identity-access/forms/social-onboarding-form.tsx; thành công nhận phiên ngay; thiếu binding/expired hoặc restart-race result hướng dẫn fresh OAuth, không reuse cookie/proof cũ hoặc auto-retry vô hạn; test old-cookie/proof rejection trong apps/web/tests/identity-access/social-onboarding.test.tsx.

**Checkpoint**: `pnpm validate:iam --phase US5` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 8: User Story 9 — Role và ownership (P1)

**Goal**: Hoàn thiện policy và matrix trước P2/P3; guards đã có từ Foundation.

**Independent Test**: Forged role/userId/ownerId/cross-owner denied bằng IAM policy; không domain module giả.

### Tests — viết trước implementation

- [X] T061 [P] [US9] Viết unit Guest/CUSTOMER/ADMIN và ownership matrix tại apps/api/test/unit/identity-access/authorization.spec.ts.
- [X] T062 [P] [US9] Viết integration guard bindings/protected IAM operations với seeded principals tại apps/api/test/integration/identity-access/authorization.spec.ts; không production test endpoint.

### Implementation

- [X] T063 [US9] Hoàn thiện immutable principal và ownership policy tại apps/api/src/modules/identity-access/authorization/principal.ts và apps/api/src/modules/identity-access/authorization/ownership.policy.ts; ADMIN không mặc nhiên bypass resource policy.
- [X] T064 [US9] Export guards/principal/policy tại apps/api/src/modules/identity-access/identity-access.module.ts và ghi dependency resource chưa có trong specs/003-identity-access-management/contracts/authorization.md.
- [X] T065 [US9] Tạo frontend visibility helper apps/web/src/features/identity-access/authorization/capabilities.ts và tests apps/web/tests/identity-access/authorization.test.tsx; API luôn là authority.

**Checkpoint**: `pnpm validate:iam --phase US9` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 9: User Story 6 — Google login (P2)

**Goal**: Google code/PKCE/nonce flow, subject-first và cookie handoff.

**Independent Test**: Signed-response doubles cover claims/callback; same sub dùng cùng user; provider thật trước release.

### Tests — viết trước implementation

- [X] T066 [P] [US6] Viết OAuth start/callback allowlist/state/redirect contract tại apps/api/test/contract/identity-access/google.spec.ts.
- [X] T067 [P] [US6] Viết signature/issuer/audience/azp/nonce/PKCE/expiry/email trust và callback concurrency integration tại apps/api/test/integration/identity-access/google.spec.ts.
- [X] T068 [P] [US6] Viết OAuth result/bootstrap/no token URL UI tests tại apps/web/tests/identity-access/google.test.tsx.

### Implementation

- [X] T069 [US6] Triển khai OAuthTransaction10m, state+browser binding, encrypted PKCE, atomic claim trước network và fixed redirect keys tại apps/api/src/modules/identity-access/oauth/oauth-transaction.service.ts.
- [X] T070 [US6] Triển khai Google adapter scopes openid/email/profile, online code S256 và nonce tại apps/api/src/modules/identity-access/oauth/google.adapter.ts; verify claims theo research, bounded timeout, discard provider tokens.
- [X] T071 [US6] Triển khai apps/api/src/modules/identity-access/application/resolve-social-identity.service.ts: lookup provider+subject trước email, kiểm tra user ACTIVE, create trusted email atomically hoặc chuyển US5; collision không link/duplicate.
- [X] T072 [US6] Expose start/callback tại apps/api/src/modules/identity-access/oauth/oauth.controller.ts; replay/cancel fail closed, set cookie rồi redirect cố định và redact callback query trước log.
- [X] T073 [US6] Tạo Google button apps/web/src/features/identity-access/forms/social-login-buttons.tsx và apps/web/src/app/(auth)/oauth-result/page.tsx; bootstrap CSRF+refresh.
- [X] T074 [US6] Kiểm thử Google test app thật first/repeat/cancel/rejected flow; lưu sanitized evidence tại specs/003-identity-access-management/validation-results.md; thiếu credentials ghi blocked thay vì pass.

**Checkpoint**: `pnpm validate:iam --phase US6` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 10: User Story 7 — Facebook login (P2)

**Goal**: Facebook OAuth tạo account/session ngay khi trả email hợp lệ; platform email verification chỉ fallback khi email thiếu hoặc không hợp lệ.

**Independent Test**: debug_token/me app/user/expiry match; new subject + valid email tạo session và redirect result ngay; missing email vào onboarding; repeat subject không re-onboard; LOCKED denied.

### Tests — viết trước implementation

- [X] T075 [P] [US7] Viết Facebook start/callback error contract tại apps/api/test/contract/identity-access/facebook.spec.ts.
- [X] T076 [P] [US7] Viết integration invalid/app mismatch/user mismatch/expiry/valid-email direct session/missing-email onboarding/denial/outage và repeat identity tại apps/api/test/integration/identity-access/facebook.spec.ts.
- [X] T077 [P] [US7] Viết Facebook button/direct-result/missing-email onboarding/error UI tests tại apps/web/tests/identity-access/facebook.test.tsx.

### Implementation

- [X] T078 [US7] Triển khai apps/api/src/modules/identity-access/oauth/facebook.adapter.ts với code exchange/debug_token/me/appsecret_proof, scopes public_profile/email và timeout; verify Graph version/support từ official docs trước pin, không tự giả định OIDC/PKCE.
- [X] T079 [US7] Wire FACEBOOK trong apps/api/src/modules/identity-access/oauth/oauth.controller.ts và apps/api/src/modules/identity-access/application/resolve-social-identity.service.ts; valid returned email được trusted theo business policy để tạo session ngay, missing/invalid email mới onboarding, existing identity không re-onboard, provider tokens không persist.
- [X] T080 [US7] Thêm Facebook button trong apps/web/src/features/identity-access/forms/social-login-buttons.tsx và nối result/onboarding UI.
- [X] T081 [US7] Chạy Facebook test app thật success/repeat/rejection; ghi Graph version và sanitized evidence vào specs/003-identity-access-management/validation-results.md; không thay real evidence bằng mock.

**Checkpoint**: `pnpm validate:iam --phase US7` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 11: User Story 8 — Profile và password change (P2)

**Goal**: Safe profile self-service và đổi LOCAL password.

**Independent Test**: Privileged fields/cross-owner denied, social-only không thêm LOCAL; password change revoke mọi session.

### Tests — viết trước implementation

- [X] T082 [P] [US8] Viết GET/PATCH me và POST me/password contract, null/length/forbidden-field/not-applicable tại apps/api/test/contract/identity-access/profile.spec.ts.
- [X] T083 [P] [US8] Viết integration principal ownership/wrong password unchanged/social credential null/change-reset-refresh races tại apps/api/test/integration/identity-access/profile.spec.ts.
- [X] T084 [P] [US8] Viết profile/change-password UI tests tại apps/web/tests/identity-access/profile.test.tsx.

### Implementation

- [X] T085 [US8] Triển khai safe projection/self-only update tại apps/api/src/modules/identity-access/profile/profile.service.ts và apps/api/src/modules/identity-access/profile/profile.controller.ts; chỉ displayName/phoneNumber, không identity/privilege mutation.
- [X] T086 [US8] Triển khai current password/recheck và atomic hash change/credential_version increment đúng một lần/revoke all/invalidate stale reset proofs kể cả pending delivery tại apps/api/src/modules/identity-access/profile/change-password.service.ts; cookie clear cùng path, rollback không đổi version/password/session và không trả version qua API.
- [X] T087 [US8] Tạo apps/web/src/app/account/page.tsx và apps/web/src/features/identity-access/forms/profile-form.tsx; phone chưa verified, social-only not-applicable, success clear memory và login lại.

**Checkpoint**: `pnpm validate:iam --phase US8` — timeout 10 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 12: User Story 10 — Admin Customer management (P3)

**Goal**: Admin list/detail/lock/unlock và audit.

**Independent Test**: CUSTOMER denied; lock revoke tất cả, unlock không restore; ADMIN target denied; query100k đạt2s.

### Tests — viết trước implementation

- [ ] T088 [P] [US10] Viết bốn Admin operations contract/search/filter/pagination/safe detail tại apps/api/test/contract/identity-access/admin.spec.ts.
- [ ] T089 [P] [US10] Viết role/target/audit rollback/lock-login-refresh-reset races và repeated-request audit CHANGED/NO_CHANGE, audit-failure rollback integration tại apps/api/test/integration/identity-access/admin.spec.ts.
- [ ] T090 [P] [US10] Viết Admin list/detail/lock/unlock/unauthorized UI tests tại apps/web/tests/identity-access/admin.test.tsx.

### Implementation

- [ ] T091 [US10] Tạo bootstrap ADMIN operational command tại apps/api/src/modules/identity-access/admin/bootstrap-admin.command.ts và procedure docs/iam-operations.md; hidden password input, không CLI password/default secret, không ngầm promote existing Customer, ghi rõ verified-email provisioning.
- [ ] T092 [US10] Triển khai keyset q/filter-bound cursor CUSTOMER query và safe detail tại apps/api/src/modules/identity-access/admin/customer-query.service.ts; test100k rows/2s tại apps/api/test/integration/identity-access/admin-performance.spec.ts.
- [ ] T093 [US10] Triển khai actor/target UUID-order locks, status/revoke/audit atomic tại apps/api/src/modules/identity-access/admin/customer-status.service.ts; target chỉ CUSTOMER, audit cả no-op với requested action/previous-new status/outcome/request ID, lock luôn revoke toàn bộ; unlock không hồi sinh session.
- [ ] T094 [US10] Expose role-guarded Admin routes tại apps/api/src/modules/identity-access/admin/customer.controller.ts; không delete/change-role/edit-profile.
- [ ] T095 [US10] Tạo apps/web/src/app/admin/customers/page.tsx và apps/web/src/app/admin/customers/[customerId]/page.tsx với search/filter/cursor/loading/empty/error/confirmation.
- [ ] T096 [US10] Kiểm thử bootstrap idempotency/privilege rejection/no secret trên disposable DB tại apps/api/test/integration/identity-access/bootstrap-admin.spec.ts.

**Checkpoint**: `pnpm validate:iam --phase US10` — timeout 15 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Phase 13: Polish & Cross-Cutting Concerns

**Goal**: Cross-flow evidence, vận hành và regression; security đã gắn từng slice.

**Independent Test**: Toàn critical flow, migration, browser security và independent CI có bằng chứng.

- [ ] T097 Triển khai retention worker bounded batches/FK order/history safety/ciphertext cleanup tại apps/api/src/modules/identity-access/infrastructure/retention.worker.ts và tests apps/api/test/integration/identity-access/retention.spec.ts.
- [ ] T098 Bổ sung full-flow registration→verify→login→refresh→profile→reset→Admin lock/unlock tại apps/api/test/integration/identity-access/full-flow.spec.ts; map72 FR/65 scenarios trong specs/003-identity-access-management/validation-results.md.
- [ ] T099 Kiểm thử browser thật HTTPS same-site cookie/CORS/CSRF/multi-tab/OAuth handoff/memory-only storage; ghi procedure và actual evidence trong specs/003-identity-access-management/quickstart.md và specs/003-identity-access-management/validation-results.md.
- [ ] T100 Kiểm tra app/proxy/tracing/callback/body logs và frontend bundle secret hygiene tại apps/api/test/integration/identity-access/secret-hygiene.spec.ts; sửa redaction/no-store tại apps/api/src/common/logging/redaction.ts.
- [ ] T101 Đo p95 login/refresh/profile dưới 500ms, Admin search SC-010 và usability SC-002/003/013 theo protocol end-to-end đã xác nhận, tối thiểu 20 người riêng biệt mỗi flow, không loại mail/provider waiting; ghi sample size/môi trường/provider timing/results vào specs/003-identity-access-management/validation-results.md; không suy ra usability pass từ unit tests.
- [ ] T102 Cập nhật .github/workflows/ci.yml, compose.yaml và docs/ci.md cho contract/integration/ephemeral keys/Mailpit cleanup; giữ bốn jobs độc lập, không deploy/publish.
- [ ] T103 Hoàn thiện README.md, docs/iam-operations.md và specs/003-identity-access-management/quickstart.md về domain/key rotation/old-key retention/mail failure/bootstrap/retention/rollback warning và commands thực tế.
- [ ] T104 Chạy format/lint/typecheck/unit/contract/PostgreSQL integration/build/scope/health cùng empty/baseline migration qua scripts/iam-validate.mjs; lưu kết quả và limitations vào specs/003-identity-access-management/validation-results.md.

**Checkpoint**: `pnpm validate:iam --phase all` — timeout 30 phút; áp dụng cleanup theo Verification protocol. Chỉ đánh dấu hoàn tất khi đạt Independent Test và lưu evidence liên quan.

## Dependencies & Execution Order

### Phase dependencies

Thứ tự mặc định: Setup → Foundational → US1 → US2 → US3 → US4 → US5 → US9 → US6 → US7 → US8 → US10 → Polish.

| Phase/story | Dependency tối thiểu | Lý do |
| --- | --- | --- |
| Setup | Không | Đồng bộ design và tạo tooling |
| Foundational | Setup | Schema, crypto, guards, session issue/revoke, cookie/CSRF |
| US1 | Foundational | Registration + mail/outbox |
| US2 | US1 | Tái sử dụng challenge/outbox; session revoke đã có ở Foundational |
| US3 | US2 | Chỉ LOCAL verified được login |
| US4 | US3 | Session issue đã có, bổ sung rotation và kết thúc phiên |
| US5 | US2, US4 | Email proof + cấp phiên ngay khi hoàn tất onboarding |
| US9 | US4 | Kiểm tra authorization trên protected IAM operations đã tồn tại |
| US6 | US5, US9 | Pending onboarding + resolver + bảo vệ API |
| US7 | US6 | Dùng chung OAuth transaction/controller/resolver, thêm Facebook adapter |
| US8 | US4, US9 | Self-service principal + revoke; social-only dùng seeded fixture |
| US10 | US8, US9 | Safe account projection và ADMIN boundary |
| Polish | Tất cả story | Cross-flow regression và release evidence |

Foundational chặn mọi implementation user story. Hai task test đầu Foundational có thể viết song song sau Setup; implementation còn lại theo thứ tự. Migration chung khai báo các entity có quan hệ chặt, nhưng hành vi từng entity vẫn được triển khai/test tại story sở hữu.

### Trong mỗi story

1. Viết contract/integration/frontend tests trên fixture đã xác định.
2. Triển khai service/transaction trước controller; nối frontend sau contract.
3. Chạy checkpoint độc lập bằng seeded state, không phụ thuộc test của story khác đã chạy trước.
4. Không dùng test-only provider/endpoint trong production; social fixture không cần thêm module template/thiệp/đơn hàng/thanh toán.
5. Tests viết song song không đồng nghĩa chạy green trước implementation. Mọi task không đánh dấu `[P]` thực hiện tuần tự nếu chưa chứng minh được độc lập.

### Parallel examples theo user story

Mỗi dòng dưới đây là một nhóm có thể giao song song để **viết tests** trong các file riêng, sau dependency của story. Không chạy toàn bộ các nhóm đồng thời khi dependency chưa hoàn tất.

| Story | Task song song | Phân chia |
| --- | --- | --- |
| US1 | T023 + T024 + T025 | Contract / integration / frontend |
| US2 | T032 + T033 + T034 | Contract / integration / frontend |
| US3 | T039 + T040 + T041 | Contract / integration / frontend |
| US4 | T045 + T046 + T047 | Contract / integration / frontend |
| US5 | T053 + T054 + T055 | Contract / integration / frontend |
| US9 | T061 + T062 | Unit policy / integration guard matrix |
| US6 | T066 + T067 + T068 | Contract / integration / frontend |
| US7 | T075 + T076 + T077 | Contract / integration / frontend |
| US8 | T082 + T083 + T084 | Contract / integration / frontend |
| US10 | T088 + T089 + T090 | Contract / integration / frontend |

Hai nhánh US5 và US9 có thể được phân công sau US4 nhưng phải phối hợp phần module wiring chung. Không đánh dấu implementation Google/Facebook song song vì cùng sửa OAuth controller/resolver; không đánh dấu các thay đổi package/CI/quickstart song song.

## Traceability và phạm vi kiểm chứng

| Phạm vi | Slice chịu trách nhiệm chính |
| --- | --- |
| Identity, một phương thức, role/status, external identity riêng | Foundational, US1, US5, US6, US7, US9 |
| Local registration, email verification, Forgot Password | US1, US2 |
| Password hashing, no enumeration, login | Foundational, US1, US2, US3 |
| JWT, absolute session expiry, rotation/reuse, logout | Foundational, US3, US4 |
| OAuth state/binding/replay/allowlist, trusted email, collision | US5, US6, US7 |
| Profile allowlist, đổi mật khẩu, no LOCAL for social-only | US8 |
| Backend role/ownership, no frontend authority | Foundational, US9, US10 |
| Admin list/detail/lock/unlock/audit/bootstrap | US10 |
| Mail failure, concurrency, privacy, cookie/CSRF | Trong từng slice, regression ở Polish |
| Migration empty/foundation baseline, independent CI | Foundational, Polish |
| SC-001 / SC-004 / SC-014 | US1 / US5 / US2–US3 |
| SC-005 / SC-006 / SC-007 | US1–US3 + secret hygiene / US4 / US2, US4, US8, US10 |
| SC-008 / SC-009 / SC-010 | US9 / US8 / US10 |
| SC-002 / SC-003 / SC-013 | Usability evidence ở Polish; Google/Facebook real-provider runs |
| SC-011 / SC-012 | Browser deployment-shape checks và toàn bộ release evidence |

Contract coverage gồm 23 operations: registration (1), local verification/reset (4), login (1), CSRF/refresh/logout/logout-all (4), social onboarding (4), OAuth start/callback dùng chung hai provider (2), profile/password (3), Admin (4). Contract tests từng slice phải đối chiếu bản OpenAPI đã sửa ở T002, không tự sinh endpoint linking/unlinking.

Detailed mapping 72 FR và 65 acceptance scenarios được ghi trong `validation-results.md` khi thực thi; đây không phải tuyên bố đã kiểm chứng. Không được yêu cầu Access Token bị thu hồi tức thì sau logout/lock/password change. Backend giữ hard expiry tối đa 15 phút; refresh bị thu hồi theo transaction tương ứng.

## Implementation Strategy

### MVP first

US1 riêng chỉ là demo đăng ký/gửi email, chưa phải IAM dùng được. MVP local đề xuất: Setup + Foundational + **US1, US2, US3, US4, US9**, cùng các kiểm tra cross-cutting áp dụng cho các slice này. Chưa được tuyên bố Feature 2 hoàn tất khi thiếu social/profile/Admin hoặc provider evidence.

### Incremental delivery

1. Hoàn tất và review design validation T002–T004 trước migration/code.
2. Dựng shared primitives tối thiểu, sau đó local registration → verification/recovery → login → lifecycle phiên.
3. Kiểm chứng authorization sớm; phát triển onboarding độc lập qua test-only provider fixture.
4. Tích hợp Google rồi Facebook, kiểm thử thật trên môi trường thử nghiệm.
5. Bổ sung profile/password và Admin; mỗi slice phải pass checkpoint trước giao tiếp.
6. Hoàn thành regression, performance/usability và vận hành; dừng nếu release evidence còn blocked.

## Notes

- Không account linking/unlinking, thêm password cho social-only, MFA, đổi email, upload avatar, xóa account, blacklist Access Token hoặc module nghiệp vụ mới.
- Ownership cho tài nguyên nghiệp vụ chưa tồn tại là dependency được ghi rõ; unit policy không được mô tả thành kiểm thử tích hợp resource chưa có.
- Thông số bảo mật, rate limits, TTL và validation bounds lấy từ research/contract đã reconciliation, không âm thầm thay đổi khi triển khai.
- Production domain/provider configuration cần kiểm chứng trên môi trường dự kiến; không commit secret hoặc đưa proof/token vào evidence.
- Giữ thay đổi hiện có của người dùng; chỉ cập nhật task đã hoàn thành sau khi có evidence thực tế.

## Phase 14: Convergence

- [X] T105 Trả stable Problem Details code `ONBOARDING_CANNOT_COMPLETE` cho cả email và provider-identity uniqueness conflict sau khi social proof/browser binding hợp lệ, đồng thời thêm contract assertions ngăn quay lại code 409 chung, per US5/AC5 và plan: error contract (contradicts).
- [X] T106 Bổ sung contract/integration tests cho social onboarding email/resend rate limit, known-proof attempt limit và unknown-proof IP fallback; kiểm tra 429/`Retry-After`, không tạo Customer/session và không tiết lộ account, per US5/AC4, FR-030 và FR-063 (partial).

---

## Phase 15: Convergence

**Mục đích**: Khép các khoảng trống triển khai và kiểm chứng được phát hiện khi hội tụ Phase 1–11 với đặc tả, kế hoạch, danh sách task và hiến chương hiện tại.

- [X] T107 Giữ proof email social onboarding đang `ACTIVE` khi yêu cầu gửi lại đến cùng email còn chờ xử lý hoặc thất bại; chỉ thu hồi proof cũ sau khi delivery thay thế hoàn tất thành công, vẫn vô hiệu hóa ngay khi candidate email thay đổi, đồng thời bổ sung integration coverage cho resend thất bại, delivery cũ và thay thế thành công trong `apps/api/src/modules/identity-access/oauth/social-onboarding.service.ts` và `apps/api/test/integration/identity-access/social-onboarding.spec.ts`, per US5/AC4, `spec.md` Edge Cases về email proof và `plan.md` email outbox delivery invariants (contradicts)
- [X] T108 Fail closed khi `ExternalIdentity.provider` không khớp với `User.login_method` được liên kết, không cấp session hoặc tạo account thay thế, đồng thời bổ sung integration coverage cho quan hệ linked-user bị thiếu hoặc không nhất quán trong `apps/api/src/modules/identity-access/application/resolve-social-identity.service.ts` và `apps/api/test/integration/identity-access/google.spec.ts`, per FR-002, BR-004 và `spec.md` Edge Cases về tính toàn vẹn social identity (partial)
- [X] T109 Đảm bảo thay đổi khi resolve OAuth và chuyển `OAuthTransaction` đã claim từ `PROCESSING` sang `CONSUMED` diễn ra trong cùng transaction cho các kết quả existing-session, new-account và onboarding; bổ sung kiểm thử inject lỗi finalization để chứng minh không còn `User`, `ExternalIdentity`, `Session` hoặc onboarding context mồ côi trong `apps/api/src/modules/identity-access/oauth/oauth.controller.ts`, `apps/api/src/modules/identity-access/oauth/oauth-transaction.service.ts` và các OAuth integration suite, per BR-004 và `plan.md` cross-cutting transaction rules (partial)
- [X] T110 Thực thi các luồng đăng nhập lần đầu, đăng nhập lặp lại và provider từ chối bằng Facebook test app thật theo chính sách direct-email/fallback hiện tại; sau đó ghi lại evidence đã loại bỏ dữ liệu nhạy cảm và phiên bản Graph API được kiểm thử, không chứa secret, trong `specs/003-identity-access-management/validation-results.md`, per T081, FR-064 và SC-012 (missing)
