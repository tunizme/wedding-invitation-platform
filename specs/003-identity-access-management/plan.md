# Implementation Plan: Feature 2 — Identity & Access Management

**Branch**: `003-identity-access-management` | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-identity-access-management/spec.md`, including clarification session 2026-09-26.

**Revision status**: Analysis gần nhất xác nhận 12 findings ban đầu đã xử lý và không còn CRITICAL/HIGH; tại thời điểm đó còn U3/U4 MEDIUM và I9/I10 LOW. Cả 4 remediation đã được người dùng phê duyệt và cập nhật vào tài liệu ở lượt này; chờ re-analysis xác nhận, không tự đóng findings. Chưa có implementation, migration hoặc runtime evidence.

## Summary

Xây dựng bounded module Identity & Access Management trong NestJS modular monolith và các flow tương ứng trong Next.js. Backend sở hữu local authentication, email verification/reset, Google OIDC, Facebook Login, session/refresh rotation, profile, authorization/ownership primitives và Admin Customer management. PostgreSQL là source of truth cho identity, proof, OAuth transaction, session/token history, rate limits, email outbox và audit; mọi thay đổi schema dùng explicit TypeORM migration. Access Token là RS256 JWT 15 phút giữ trong frontend memory; Refresh Token opaque nằm trong host-only HttpOnly cookie, rotate một lần và có absolute session lifetime 14 ngày. Production target là frontend/API khác origin nhưng cùng site; exact CORS allowlist, Origin validation và session-bound CSRF token bảo vệ cookie-authenticated mutations.

## Technical Context

**Language/Version**: TypeScript 5.9 trên Node.js 24 LTS; frontend Next.js 16/React 19; backend NestJS 11 CommonJS hiện có

**Primary Dependencies**: Existing `@nestjs/config`, `@nestjs/swagger`, `@nestjs/typeorm`, TypeORM 0.3.x, `pg`, class-validator; add `@nestjs/jwt`/`jsonwebtoken` cho Access Token, `argon2` cho Argon2id password hashing, `google-auth-library` cho Google OIDC code/PKCE/ID-token validation, native `fetch`/`node:crypto` cho Facebook và opaque credentials, Resend official Node SDK cho production email, Nodemailer + Mailpit cho local/integration email, cookie parsing support phù hợp NestJS 11

**Storage**: PostgreSQL 17.x; explicit migration tạo User, ExternalIdentity, AuthSession, RefreshCredential, AuthChallenge, OAuthTransaction, PendingSocialOnboarding, AuthRateLimitBucket, EmailOutbox và AdminAuditEvent; raw password/provider token/Refresh Token/proof không persisted ở dạng rõ

**Testing**: Vitest unit; Supertest + PostgreSQL thật cho integration/contract/concurrency/migration; React Testing Library cho frontend; controlled provider/email doubles trong automated tests; Mailpit integration; Google/Facebook test app smoke tests ở test environment trước release

**Target Platform**: Evergreen browsers; Linux API/container; local macOS/Linux/WSL2 với Docker Compose; production HTTPS với frontend và API là sibling subdomains hoặc same-origin proxy dưới cùng registrable domain

**Project Type**: Web application monorepo với Next.js frontend và versioned NestJS REST API độc lập

**Performance Goals**: Login/refresh/profile p95 dưới 500 ms trong integration environment không tính thời gian user/provider; provider callback và email-provider call có timeout tối đa 10 giây; Admin search/filter trả trang đầu dưới 2 giây trên 100.000 Customer; cleanup/outbox xử lý bounded batch tối đa 1.000 rows/lần

**Constraints**: Access Token TTL 15 phút và không blacklist; absolute session lifetime 14 ngày; strict first-writer-wins refresh (concurrent reuse revokes session); account có đúng một login method; LOCAL phải verified trước login; Facebook email hợp lệ sau callback verification được tin cậy để tạo account/session ngay, chỉ thiếu/email không hợp lệ mới onboarding; không provider token persistence; no token in URL; no account linking; no invitation/template/order/payment module; no microservice/broker/Redis; `synchronize: false`, `migrationsRun: false`; exact-origin credentialed CORS; production cookie Secure/HttpOnly/SameSite=Lax

**Scale/Scope**: 100.000 Customer target cho Admin query; một API modular monolith và PostgreSQL instance ở MVP; 10 user journeys, 72 functional requirements, 3 login methods, 2 roles, 2 account statuses; horizontal scale chỉ được bật khi DB-backed outbox/rate limiting và singleton-free behavior đã được load-tested

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Constitution v2.0.0 là authority. Không có exception được phê duyệt. Kết quả Pre-Research bên dưới là lịch sử review; Post-Design là trạng thái hiện tại sau analysis, không phải bằng chứng implementation đã pass. Task graph đã đặt validator setup trước validation. Các findings cũ đã được remediation trong tài liệu nhưng chưa tự đánh dấu closed: cần analysis độc lập xác nhận theo Delivery Workflow §2.

| Gate | Pre-Research | Post-Design | Evidence |
|------|--------------|-------------|----------|
| Scope discipline | PASS | PASS | Chỉ IAM, provider/email integration cần cho IAM; không tạo module template/invitation/order/payment hoặc link/unlink |
| Hai application độc lập | PASS | PASS | Web chỉ gọi versioned REST; API giữ toàn bộ secret/business rules; mỗi app giữ scripts/build/test riêng |
| Modular monolith, không distributed architecture | PASS | PASS | Một `IdentityAccessModule`; PostgreSQL email outbox là internal table/worker, không broker/microservice |
| Explicit database evolution | PASS | PENDING RE-ANALYSIS | Outbox lifecycle/lock order đã đồng bộ và qua review (U2, I4); bổ sung partial uniqueness và credential version (U3/U4) chờ re-analysis trước migration |
| Reproducible developer experience | PASS | PENDING RE-ANALYSIS | T001 chuẩn bị validator trước T002 validation; Setup checkpoint đã đồng bộ và qua review C1 |
| Versioned public contracts | PASS | PENDING RE-ANALYSIS | AdminCustomer, conditional logout và conflict semantics đã đồng bộ, review I1/I3/I6 hoàn tất; không phải runtime contract evidence |
| Secure configuration và secret hygiene | PASS | PENDING RE-ANALYSIS | Hard JWT expiry, CSRF bootstrap và outbox lifecycle đã đồng bộ, review I2/U1/U2 hoàn tất; giữ server-only secrets/redaction |
| Verifiable quality | PASS | PENDING RE-ANALYSIS | Audit, acceptance preconditions, measurement protocol và checklist đã qua review I5/A1/I7/I8; follow-up U3/U4/I9/I10 chờ re-analysis |
| CI không tự deploy/publish | PASS | PASS | Plan chỉ mở rộng validation; không deploy, publish hoặc tuyên bố release-ready |

### Design gate notes

- PostgreSQL-backed email outbox/rate-limit buckets làm tăng schema nhưng tránh broker/Redis, giữ transaction và non-enumerating response trong một deployable; phù hợp modular-monolith constraint.
- Production same-site là deployment prerequisite của feature, không hard-code hostname. Nếu deployment dùng unrelated sites, plan phải được sửa và security validation chạy lại trước implementation/release.
- Admin audit retention 2 năm và security-record cleanup là product default của plan; privacy/legal review trước production MAY rút ngắn retention nhưng không được xóa credential history trước khi reuse-detection window kết thúc.

## Project Structure

### Documentation (this feature)

```text
specs/003-identity-access-management/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   ├── identity-access.openapi.yaml
│   └── authorization.md
└── tasks.md                         # Đã đồng bộ dependency/validation; chờ re-analysis
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── src/
│   │   ├── common/
│   │   │   ├── errors/              # RFC 9457 mapping and safe error codes
│   │   │   └── logging/             # request correlation and sensitive-data redaction
│   │   ├── config/                  # IAM/provider/email/key/cookie config validation
│   │   ├── infrastructure/database/
│   │   │   └── migrations/          # explicit IAM migration(s)
│   │   └── modules/identity-access/
│   │       ├── identity-access.module.ts
│   │       ├── domain/              # entities, enums, policies, ports
│   │       ├── application/         # use cases and transaction orchestration
│   │       ├── auth/                # local login, JWT guard, session/refresh/logout
│   │       ├── verification/        # local verify, reset, social email verification
│   │       ├── oauth/               # Google/Facebook adapters and callback flows
│   │       ├── profile/             # me/profile/change-password
│   │       ├── authorization/       # principal, role and reusable ownership contract
│   │       ├── admin/               # Customer list/detail/lock/unlock and audit
│   │       └── infrastructure/      # TypeORM repositories, email adapters/outbox worker
│   └── test/
│       ├── unit/identity-access/
│       ├── integration/identity-access/
│       └── contract/identity-access/
└── web/
    ├── src/
    │   ├── app/
    │   │   ├── (auth)/              # register, verify, login, forgot/reset, OAuth result
    │   │   ├── account/             # profile and change password
    │   │   └── admin/customers/     # list/detail/lock/unlock
    │   └── features/identity-access/
    │       ├── api/                 # typed REST client; credentials include where required
    │       ├── session/             # memory-only Access Token and single-flight refresh
    │       ├── forms/               # auth/profile/admin interaction logic
    │       └── authorization/       # UI visibility only, never backend authority
    └── tests/identity-access/

compose.yaml                          # add Mailpit local/test service only
```

**Structure Decision**: Giữ hai workspace/deployable hiện có. Backend thêm đúng một bounded `IdentityAccessModule` với internal sub-boundaries và chỉ export authenticated principal/guards/ownership policy cần cho future resource modules. Frontend giữ route/UI và memory-only session state trong feature folder, không chứa provider secret hoặc authorization authority. Không tạo shared package vì contract reuse thực tế chưa có.

## Phase 0: Research Decisions

Research được tổng hợp tại [research.md](./research.md). Analysis phát hiện các mâu thuẫn và thiếu chi tiết; không còn coi toàn bộ technical unknown là resolved. Các nội dung reconciliation dưới đây đã được đưa vào research/data model/contract; trạng thái nhất quán cuối cùng cần được kiểm tra lại bằng analysis.

Các decision bắt buộc gồm Argon2id parameters, RS256 token validation/key rotation, opaque refresh rotation/reuse semantics, same-site cookie/CORS/CSRF contract, Google/Facebook provider validation, Resend/Mailpit delivery, proof TTL, PostgreSQL constraints/locks, outbox/rate limit behavior, retention và Admin keyset pagination.

## Phase 1: Design Decisions

- [data-model.md](./data-model.md) định nghĩa fields, constraints, relationships, transaction lock order, lifecycle và retention.
- [identity-access.openapi.yaml](./contracts/identity-access.openapi.yaml) định nghĩa versioned REST surface, cookie/header/bearer security, safe response và error semantics.
- [authorization.md](./contracts/authorization.md) định nghĩa trust boundary cho principal/role/ownership và dependency contract với future resource modules.
- [quickstart.md](./quickstart.md) định nghĩa runnable validation từ migration trống qua local/social/session/admin/security flows, gồm cleanup và provider staging evidence.

### Cross-cutting transaction rules

1. Mọi use case thay đổi credential/status dùng TypeORM transactional manager duy nhất.
2. Lock order cho aggregate đã tồn tại: `users` (UUID order) → `auth_sessions` (UUID order) → `refresh_credentials` → `auth_challenges` → audit/outbox writes. Chỉ lấy các lock cần cho operation; không đảo thứ tự giữa các use case. Data model phải trở thành nguồn canonical của matrix này sau reconciliation.
3. Không giữ DB transaction mở trong provider/email network call. OAuth transaction được claim trước exchange; email đi qua outbox.
4. Unique constraints là arbiter cuối cho concurrent registration/identity/onboarding; conflict rollback toàn aggregate và map sang safe response.
5. Lock, password change/reset và logout-all revoke session trong cùng transaction với state/credential change.

| Operation | Lock order / exception |
|-----------|------------------------|
| Password reset/change | User → Sessions → Challenges; credential update, proof invalidation và revoke atomic |
| Refresh | User → Session → Credential; reuse revocation phải commit trước khi trả error |
| Logout current | Lookup để xác định user/session, sau đó lock User → Session → Credential khi cần và recheck; lookup không thay thế kiểm tra trong transaction |
| Admin lock/unlock | Actor/target Users theo UUID → target Sessions khi cần; status/revoke/audit atomic |
| Social completion | Onboarding → Challenge → insert User/Identity/Session mới; uniqueness conflict rollback, không chuyển sang lock/link existing User |
| Outbox finalize | Owner User hoặc Onboarding → Challenges → Outbox; recheck lease và proof state; không giữ row lock của claim trong network call |

Các row cùng loại được lock theo thứ tự ổn định. Deadlock/serialization retry phải bounded; không replay network side effect. Integration tests phải bao phủ reset–refresh, reset–change-password, lock–login và resend–completion.

### Access Token hard expiry — I2

- `exp = iat + 900` giây; từ chối khi `now >= exp`, không positive expiry leeway. Bỏ quyết định cộng 30 giây tolerance vào expiration trong research.
- Đồng bộ clock máy chủ là prerequisite vận hành; tolerance cho timestamp khác, nếu có, không được kéo dài hiệu lực qua `exp`.
- Test ngay trước, tại và sau `exp`. Không blacklist, không yêu cầu immediate Access Token revocation sau logout/lock/password change; refresh revocation giữ nguyên.

### Cookie, CSRF bootstrap và logout — U1, I3

Giữ deployment same-site, exact-origin credentialed CORS, host-only HttpOnly/Secure refresh cookie và Access Token trong memory. CSRF token được tái tạo bằng HMAC với versioned server key trên tuple có encoding không nhập nhằng: context discriminator (`session` hoặc `onboarding`), context ID và `csrf_seed`. Seed là 32 random bytes server-side, không phải browser credential, không yêu cầu cookie binding mới. Bootstrap xác thực current refresh/onboarding credential trước derivation. Session và onboarding dùng domain separation; không dùng refresh token đang rotation làm seed để tránh vô hiệu hóa CSRF giữa các tab.

- Data model dùng `csrf_seed` và `csrf_key_version` cho cả session/onboarding; không lưu `csrf_token_hash` hoặc giữ hai nguồn kiểm chứng.
- Bootstrap trả cùng token trong cùng context, `Cache-Control: no-store`, không rotate token mỗi GET. Chỉ frontend origin được phép đọc; mutation kiểm tra Origin và CSRF constant-time.
- Session refresh giữ seed/key version; new login/new onboarding có seed mới. OAuth/onboarding browser binding vẫn riêng biệt. Retain old key khi context còn được hỗ trợ; kiểm thử reload, multi-tab, wrong-context và key rotation.

| Logout credential state | Required behavior |
|-------------------------|-------------------|
| Thiếu, malformed hoặc không nhận diện session | Kiểm tra Origin hợp lệ, clear cookie đúng path và trả 204; không tác động session khác |
| Session nhận diện được nhưng đã revoked/expired | Kiểm tra Origin hợp lệ, clear cookie và trả 204 |
| Session còn active | Origin + context-bound CSRF hợp lệ mới revoke session và clear cookie; trả 204 |

Origin không được phép vẫn bị từ chối. Access Token không phải prerequisite của logout-current. OpenAPI phải thể hiện security có điều kiện và response/error matrix; không bắt cookie/CSRF vô điều kiện cho nhánh no-session, cũng không mô tả toàn bộ operation là bỏ bảo vệ.

### Email outbox delivery invariants — U2

- Bổ sung processing state, `lease_owner`, `lease_expires_at` và challenge generation/sequence theo owner/purpose. Claim trong transaction ngắn; reclaim lease hết hạn; chỉ owner còn lease hợp lệ được finalize.
- Cho phép `payload_ciphertext` và encryption metadata null sau success/terminal failure; giữ encrypted payload trong retry chưa kết thúc. Không lưu proof rõ hoặc ghi vào log.
- Network ngoài transaction, retry cùng idempotency key. Không cam kết exactly-once email delivery; SMTP retry có thể gửi lặp nhưng proof consumption vẫn single-use.
- Finalize phải recheck owner/context, lease, generation và challenge state. Không activate proof consumed/revoked, context completed/expired hoặc proof đã hết hạn; stale delivery không revoke proof mới hơn đã active.
- Resend thất bại giữ proof active trước đó; successful completion invalidate sibling proofs kể cả pending delivery. Social proof expiry không muộn hơn onboarding expiry.
- Test crash sau claim, sau provider acceptance trước finalize, và completion xảy ra trước finalize. Bounded worker batch/retry/cleanup và no-network-under-lock áp dụng từ slice registration, không đợi Polish.

### Response schema và error semantics — I1, I6

- `AdminCustomer` là object đóng với toàn bộ safe profile fields cộng `createdAt`/`updatedAt`; không `allOf` để mở rộng `UserProfile` có `additionalProperties:false`. Validation fixtures phải chứng minh valid object pass, missing timestamp và secret/unknown fields fail.
- Public registration/login/verification request/Forgot Password không dùng response để phân biệt account existence.
- Social onboarding completion được trả 409 cho uniqueness conflict **sau** proof/browser-binding verification hợp lệ, dùng một code chung `ONBOARDING_CANNOT_COMPLETE`. Không phân biệt email với identity conflict, không account ID/provider detail, không link/partial account/session. Research phải ghi ngoại lệ này thay vì cấm 409 tuyệt đối.
- Invalid proof phải bị từ chối trước khi public response có thể tiết lộ kết quả uniqueness lookup; contract tests kiểm tra thứ tự này.

### Admin audit semantics — I5

Giữ nghĩa chặt của FR-059/SC-010: mỗi lock/unlock được chấp nhận đều ghi actor, target, timestamp, requested action, previous/new status, outcome `CHANGED` hoặc `NO_CHANGE` và request ID. No-op không giả lập state transition nhưng vẫn có audit. Lock thành công bảo đảm mọi Refresh Token của target đã revoked; unlock không restore session. Audit insert cùng transaction với operation; audit failure rollback. Đồng bộ research/data model và tests repeated lock/unlock, không âm thầm thu hẹp spec thành chỉ audit state transition.

### Acceptance và usability protocol — I8, A1

US3 successful login chỉ áp dụng cho LOCAL ACTIVE, `email_verified=true` và credential đúng. Spec Independent Test/scenario đã ghi đủ precondition; tests tách riêng unverified và LOCKED denial.

**Đã xác nhận**: người dùng chọn toàn bộ Recommend; protocol đã được ghi trong spec và quickstart:

| Criterion | Confirmed measurement boundary |
|-----------|-------------------------------|
| SC-002 | Bắt đầu nhập registration form → login screen sau verification thành công, gồm email delivery và thao tác người dùng; giữ ngưỡng 95% trong 2 phút |
| SC-003 | Chọn provider → frontend có Customer session; Facebook email hợp lệ đi thẳng, thiếu/email không hợp lệ gồm platform onboarding/verification; giữ ngưỡng 95% trong 90 giây |
| SC-013 | Sau lỗi, người dùng xác định đúng bước tiếp theo không có gợi ý từ người điều phối; giữ ngưỡng 90% |

Tối thiểu 20 lượt với người dùng riêng biệt cho mỗi flow; Google/Facebook báo cáo riêng, ghi total và provider/email/UI breakdown, không tùy ý loại lượt chậm/lỗi. Áp dụng protocol/sample size đã xác nhận trong spec/quickstart; Facebook phải báo cáo riêng direct-email flow và missing-email onboarding fallback. T101 chỉ ghi evidence thực tế, không suy ra usability pass từ unit tests.

### Validation ordering và checklist — C1, I7

1. Tách parser/validator setup khỏi dependency task hiện tại và đặt trước bước chạy schema validation. Sửa task graph/ID/references, không chỉ thêm ghi chú trong plan.
2. Reconcile design và validate OpenAPI bằng fixtures hợp lệ/không hợp lệ; sau đó mới cho phép migration/code implementation.
3. Setup checkpoint kiểm tra tooling, contract schema fixtures và test-discovery configuration, không yêu cầu user-story implementation tests chưa được tạo phải pass. Không dùng `passWithNoTests` để che thiếu tests bắt buộc.
4. Mỗi phase phải có bounded command và teardown cho đúng tài nguyên disposable do run tạo; không xóa database/volume người dùng. `pnpm validate:iam` còn là runner dự kiến trong tasks, không phải command hiện có đã được kiểm chứng.
5. Review lại checklist theo clarification hiện hành: A1/A3 đã xác nhận; A2 đã thay thế bằng verified-before-login và local verification/Forgot Password trong scope. Checked checklist không phải evidence implementation pass.
6. Chạy lại cross-artifact analysis sau đồng bộ; unresolved HIGH/CRITICAL tiếp tục chặn implementation.

### Reconciliation tracking — kết quả review và follow-up

| Findings | Artifact đã đồng bộ ngoài plan | Điều kiện kiểm tra lại |
|----------|--------------------------------------|-----------------------|
| C1 | tasks.md, quickstart.md | Tooling trước validation, Setup fixtures và dependency graph nhất quán |
| I1, I3, I6 | contracts/identity-access.openapi.yaml, research.md, tasks.md | Valid/invalid schema fixtures và security/error matrix thống nhất |
| I2, U1 | research.md, data-model.md, tasks.md; contract descriptions nếu cần | Hard expiry, CSRF bootstrap/context/key lifecycle có test cases |
| U2, I4 | data-model.md, research.md, tasks.md | Lease/crash/proof lifecycle và canonical lock matrix không mâu thuẫn |
| I5 | data-model.md, research.md, tasks.md | No-op có audit outcome, không false transition |
| A1, I8 | spec.md, quickstart.md, tasks.md | Protocol usability được xác nhận; verified precondition rõ ràng |
| I7 | checklists/requirements.md | Review bản hiện hành, không còn ghi assumptions đã clarify là pending |

Bảng trên là 12 findings ban đầu đã được analysis gần nhất xác nhận xử lý ở mức tài liệu. Follow-up U3/U4/I9/I10 đã remediation nhưng chờ analysis mới; không tự đánh dấu implementation task hoàn tất hoặc suy ra runtime pass. Spec và constitution vẫn có authority cao hơn plan; scope/acceptance change cần được xác nhận trước khi đồng bộ.

### Follow-up remediation — U3/U4/I9/I10

- **U3**: PendingSocialOnboarding dùng partial unique index trên provider/subject chỉ cho PENDING_EMAIL/PENDING_VERIFICATION, không điều kiện thời gian động. Fresh verified OAuth callback resolve identity trước; transaction lock/recheck observed context, EXPIRED/CANCELLED context cũ và revoke proofs rồi tạo context mới với ID/binding/CSRF seed/expiry mới. Concurrent loser không tự thay winner; completion rechecks context dưới lock. Canonical lifecycle/race rules ở data-model.md; T057/T060 và quickstart có restart-before-cleanup, missing-binding và concurrency tests.
- **U4**: User.credential_version là bigint nonnegative default 0; PASSWORD_RESET challenge có snapshot bắt buộc, purpose khác null. Tạo proof dưới User lock; completion yêu cầu equality. Reset/change tăng version đúng một lần cùng hash update, invalidate reset proofs và revoke sessions; rollback atomic. Outbox không activate stale snapshot; opportunistic rehash không tăng version, timestamp chỉ phục vụ audit, version không public. T036/T086 và quickstart bao phủ các race.
- **I9**: Quickstart đã giới hạn CSRF-denial check theo operation/nhánh và dẫn chiếu logout no-active-session exception; Origin protection vẫn bắt buộc như contract.
- **I10**: Gate evidence phân biệt kết quả design review với runtime validation. Trạng thái PENDING RE-ANALYSIS dành cho follow-up vừa sửa, không phủ nhận việc 12 findings cũ đã được review. Không tự chuyển gate sang runtime PASS.

Bốn mục trên chỉ là tài liệu đã sửa. Chạy lại analysis trước khi coi follow-up đã đóng; U3/U4 phải được thống nhất trước migration và các slice onboarding/recovery. Không thay đổi scope hoặc public API.

### Configuration ownership

- Backend-only: access-token RSA keys/key IDs, issuer/audience, refresh/challenge HMAC/encryption keys, versioned CSRF HMAC keys, provider IDs/secrets/redirect URIs, Graph API version, Resend/SMTP credentials, email sender, trusted frontend/API origins, cookie flags, TTL/rate/retention limits.
- Frontend-public: API base URL và fixed UI paths only; không provider secret, mail key, JWT key hoặc cookie material.
- Root/local orchestration: Mailpit ports/profile and safe local values only.
- Production startup fails khi origins/redirects không HTTPS, CORS wildcard đi với credentials, cookie không Secure, keys/secrets thiếu/placeholder hoặc provider/email configuration không khớp enabled capabilities.

## Complexity Tracking

Không đề xuất architectural exception. C1 được xử lý bằng thứ tự validator setup trước validation trong task graph; không dùng Complexity Tracking để miễn trừ workflow. PostgreSQL email outbox, rate-limit buckets và token-history table là complexity trực tiếp phục vụ non-enumeration, reliable delivery, multi-request concurrency và reuse detection; lease, context binding và audit outcome phục vụ các invariant IAM đã có, không tạo deployable hoặc infrastructure service mới ngoài Mailpit local-only.
