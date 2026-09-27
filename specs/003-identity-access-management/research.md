# Phase 0 Research: Feature 2 — Identity & Access Management

## Password hashing và password input

**Decision**: Dùng `argon2` với Argon2id v19, baseline `memoryCost=19456 KiB`, `timeCost=2`, `parallelism=1`, `hashLength=32` và salt ngẫu nhiên do library tạo. Benchmark trên production container nhỏ nhất và tăng cost hướng tới khoảng 250 ms/hash nhưng không thấp hơn baseline. Lưu PHC encoded string; rehash opportunistically khi parameters tăng. Password dài 8–128 Unicode code points, kiểm thêm bounded UTF-8 byte length, không trim/normalize/change case/truncate.

**Rationale**: Argon2id là lựa chọn mới ưu tiên và profile 19 MiB/2/1 là OWASP minimum. Giới hạn 128 code points ngăn input DoS nhưng vượt minimum 64 characters; explicit rejection tránh silent truncation.

**Alternatives considered**: BCrypt bị loại cho hệ thống mới vì giới hạn 72 bytes dễ tạo truncation hazard. scrypt chỉ là fallback khi Argon2 native deployment không khả dụng. Pepper cho password chưa dùng ở MVP vì rotation/recovery cost; refresh/challenge HMAC key vẫn tách riêng.

**Sources**: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [node-argon2](https://www.npmjs.com/package/argon2)

## Access Token và key rotation

**Decision**: Dùng `@nestjs/jwt`/`jsonwebtoken` tương thích NestJS 11 CommonJS. Ký RS256 bằng RSA key tối thiểu 2048-bit; header có `typ=at+jwt`, configured `kid`; claims chỉ gồm `iss`, `aud`, `sub`, `sid`, `role`, `jti`, `iat`, `exp`. TTL 15 phút. Verify pin RS256, exact issuer/audience/type, required claims và configured key allowlist; hard expiry: `exp=iat+900`, từ chối khi `now>=exp`, không positive expiration leeway. Đồng bộ clock máy chủ; tolerance cho timestamp khác không được kéo dài expiration. Giữ current private key và current/previous public keys trong controlled rotation window.

**Rationale**: Asymmetric verification tách signing authority, hỗ trợ safe key rotation và future service separation mà không đổi token contract. Không đưa email/profile/status vào token; account lock được phép có propagation delay tối đa TTL theo spec.

**Alternatives considered**: HS256 đơn giản hơn nhưng coupling signing/verification secret. `jose` v6 là ESM-only, bị loại vì không đổi module system CommonJS chỉ cho IAM.

**Sources**: [Nest authentication](https://docs.nestjs.com/security/authentication), [RFC 8725 JWT Best Current Practices](https://www.rfc-editor.org/info/rfc8725/), [RFC 9068 JWT Access Token Profile](https://www.rfc-editor.org/info/rfc9068/)

## Refresh Token rotation, reuse và concurrency

**Decision**: Refresh Token là 32 random bytes base64url, lưu `HMAC-SHA-256(token, refresh pepper)` 32-byte digest với key version. AuthSession có immutable `absolute_expires_at=login+14d`; RefreshCredential giữ full generation history đến sau session expiry/revocation. Rotation transaction lock User → Session → Credential, consume predecessor và insert đúng một successor. Presented consumed/revoked token atomically revokes entire session family.

Concurrent refresh dùng strict first-writer-wins: request đầu rotate; request thứ hai đợi row lock, thấy reuse và revoke session theo FR-039. Frontend bắt buộc single-flight refresh promise, mỗi API request retry tối đa một lần và không tự retry chính refresh request; lost refresh response yêu cầu login lại.

**Rationale**: Lưu history mới phát hiện rotated-token replay; row locks và unique `(session_id,generation)` ngăn branch. Strict policy tuân thủ yêu cầu reuse revokes chain mà không lưu raw successor hoặc tạo grace window mơ hồ.

**Alternatives considered**: Chỉ lưu current hash không phát hiện old-token reuse. Grace window/idempotent replay cần recoverable raw successor/cache và làm yếu strict reuse. DPoP/mTLS quá phức tạp cho browser MVP.

**Sources**: [RFC 9700 §4.14.2](https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2), [PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html), [TypeORM transactions](https://typeorm.io/docs/advanced-topics/transactions/)

## Cookie, CORS, CSRF và frontend session

**Decision**: Production deployment constraint là frontend/API cùng site (sibling subdomains hoặc same-origin proxy), có thể khác origin. Refresh cookie host-only tên `__Secure-wedding_rt`, `HttpOnly`, `Secure`, `SameSite=Lax`, không `Domain`, `Path=/api/v1/auth`, Max-Age không vượt absolute expiry. Local dùng tên không prefix, `Secure=false` trên localhost, cùng SameSite/Path. CORS dùng exact origin allowlist, credentials=true, explicit methods/headers, `Vary: Origin`, không wildcard.

Cookie-authenticated unsafe operations cần cả exact Origin validation và session-bound synchronizer CSRF token trong `X-CSRF-Token`. CSRF dùng HMAC-SHA-256 với versioned server key trên length-prefixed tuple `(context_type,context_id,csrf_seed)`; seed ngẫu nhiên server-side không phải browser credential, không lưu raw token/hash song song. Session/onboarding domain-separated; rotation/reload giữ seed, key cũ được giữ khi context còn được hỗ trợ. Bootstrap xác thực refresh/onboarding credential trước derivation. Credentialed `GET /auth/csrf` trả token ổn định trong JSON với no-store; frontend giữ memory và gửi header constant-time validated. Access Token chỉ trả JSON và giữ memory, không local/session storage. Sau OAuth callback, backend set refresh cookie, redirect fixed frontend path không token/code; frontend lấy CSRF rồi refresh để bootstrap Access Token.

Logout-current: Origin hợp lệ luôn bắt buộc. Missing/malformed/unresolvable credential hoặc session đã revoked/expired: clear cookie đúng path, 204, không cần CSRF và không tác động session khác. Session active: cần CSRF hợp lệ trước revoke; không cần Access Token. Đây là security có điều kiện, không phải public mutation bỏ bảo vệ.

**Rationale**: SameSite là defense-in-depth chứ không thay CSRF control. Host-only cookie tránh sibling takeover; synchronizer token hoạt động với frontend/API host khác nhau. `__Host-` không dùng vì yêu cầu `Path=/`, trái narrow cookie path.

**Alternatives considered**: Double-submit readable cookie làm tăng cookie-injection risk; localStorage làm Access Token dễ bị XSS theft; cross-site unrelated domains phụ thuộc third-party cookie và không được target trong plan này.

**Sources**: [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)

## Google OIDC

**Decision**: Dùng official `google-auth-library` phù hợp CommonJS. Backend confidential client chạy Authorization Code với scopes đúng `openid email profile`, `access_type=online`, random state, PKCE S256 và nonce. Validate exact redirect/client, signature/JWKS, issuer, audience/azp, exp/iat và nonce. ProviderSubject là `sub`, không phải email. Chỉ Google `email_verified=true` sau full ID-token validation là trusted ownership evidence; false/missing/absent đi qua platform social email verification. Không request/store Google refresh token; discard provider tokens sau claim extraction.

**Rationale**: Google chỉ rõ `sub` ổn định còn email có thể đổi/không unique; server flow và official library hỗ trợ PKCE/token validation mà không buộc chuyển ESM.

**Alternatives considered**: Frontend-supplied ID token và email-as-identity bị loại. `openid-client` v6 có protocol abstraction tốt nhưng ESM-only; không đổi backend module system trong feature này.

**Sources**: [Google OIDC server flow](https://developers.google.com/identity/openid-connect/openid-connect), [Google OIDC reference](https://developers.google.com/identity/openid-connect/reference), [google-auth-library](https://github.com/googleapis/google-auth-library-nodejs), [OIDC Core](https://openid.net/specs/openid-connect-core-1_0-18.html)

## Facebook Login

**Decision**: Dùng backend OAuth 2 Authorization Code flow, scopes `public_profile,email`, fixed HTTPS callback, random state + browser binding; không giả định OIDC nonce/PKCE khi Meta chưa document cho web flow. Pin Graph API `v26.0` trong validated config. Exchange server-side; `/debug_token` phải valid, đúng app_id/expiry/user_id; `/me?fields=id,name,picture,email` với appsecret_proof phải trả cùng user ID. App-scoped `id` là ProviderSubject. Theo business policy ngày 2026-09-27, email Facebook hợp lệ sau toàn bộ kiểm tra này được đánh dấu verified để new identity tạo account/session ngay; thiếu hoặc email không hợp lệ mới qua platform verification. Provider token chỉ sống trong callback memory.

**Rationale**: Meta mô tả quyền `email` là địa chỉ email chính nhưng không cung cấp claim `email_verified` tương đương Google. Product owner chấp nhận trade-off và đặt trust policy tại platform sau khi backend đã xác minh token/app/user/expiry; state, exact redirect, confidential exchange và introspection vẫn bảo vệ identity flow.

**Alternatives considered**: Bắt buộc mọi Facebook identity xác minh lại email đã bị thay thế vì tăng ma sát; xem Facebook là OIDC và speculative PKCE vẫn bị loại đến khi official provider contract hỗ trợ.

**Sources**: [Meta manual flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/), [Meta login security](https://developers.facebook.com/docs/facebook-login/security/), [Meta token debugging](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/debugging/), [Meta Graph versioning](https://developers.facebook.com/docs/graph-api/guides/versioning/)

## OAuth transaction và social onboarding

**Decision**: OAuthTransaction persisted TTL 10 phút với hashed state/binding, hashed nonce và AES-256-GCM encrypted PKCE verifier; callback atomically claim PENDING→PROCESSING trước network exchange, không giữ DB transaction khi gọi provider, và không cho retry callback đã claim. State và short-lived HttpOnly transaction cookie đều phải match. Redirect lưu allowlisted key, không arbitrary URL. PendingSocialOnboarding tách riêng, TTL 30 phút; completion transaction rechecks email/identity uniqueness và atomically tạo User + ExternalIdentity + Session + first RefreshCredential.

**Rationale**: Persisted one-time state cho expiry/replay/concurrent callback, còn separate onboarding cho phép email verification mà không tạo partial Customer. Encryption chỉ áp dụng transient verifier cần recover để exchange; authorization code/provider token không persisted.

**Alternatives considered**: Stateless signed state không có atomic single-use. Redis bị loại vì foundation không có và PostgreSQL đủ. Internal handoff code/token trong redirect bị loại; cookie bootstrap không cần URL credential.

**Sources**: [RFC 9700 OAuth Security BCP](https://datatracker.ietf.org/doc/html/rfc9700), [OWASP OAuth2](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)

## Verification/reset proof và email delivery

**Decision**: Proof là 32 random bytes base64url, store SHA-256 digest, purpose-bound và atomic single-use. TTL: local email verification 24 giờ, password reset 30 phút, social onboarding/verification 30 phút. Link dùng configured frontend origin và URL fragment (`#token=...`); page dùng `Referrer-Policy: no-referrer`, không third-party resource, rồi POST token body. Local verification/reset không auto-login; reset revokes all sessions. Social verification success atomically creates account/session.

Email có application port. Production adapter dùng Resend official Node SDK và send-only key/domain; local/integration dùng Nodemailer SMTP tới Mailpit; tests dùng fake. PostgreSQL outbox giữ request/delivery state và encrypted transient delivery payload, worker bounded batches dùng `FOR UPDATE SKIP LOCKED` trong short claim transaction với fresh lease_owner và deadline; reclaim sau expiry, finalize conditional trên lease còn hợp lệ. Network ngoài transaction; payload/key metadata nullable và xóa sau acceptance/terminal failure. Challenge chỉ ACTIVE sau accepted delivery và recheck context, expiry, generation, consumed/revoked state; stale delivery không hồi sinh proof hoặc revoke proof mới hơn. Failed resend giữ older active challenge. SMTP có thể gửi lặp; không cam kết exactly-once delivery. Idempotency key = purpose + challenge ID + template version.

**Rationale**: Fragment giảm access-log/referrer leak. Outbox tách public response latency khỏi provider, hỗ trợ generic/non-enumerating timing và recoverable delivery mà không thêm broker/microservice.

**Alternatives considered**: JWT/plaintext proof bị loại. Direct synchronous email call tạo timing/reliability gap. SES/SMTP-only production khả thi nhưng tăng AWS surface hoặc thiếu provider idempotency; Resend được cô lập sau port.

**Sources**: [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP Email Verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html), [Resend Node](https://resend.com/nodejs), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Mailpit](https://mailpit.axllent.org/docs/)

## Email uniqueness và concurrent writes

**Decision**: Persist đúng một normalized `users.email varchar(254)` sau trim+lowercase, `UNIQUE(email)` và check `email=lower(btrim(email))`; không loại dot/+tag, không dùng `citext`. Application validate trước, DB unique constraint là concurrency arbiter. Identity unique `(provider,provider_subject)` và một identity/user. Transaction conflict rollback toàn aggregate và map generic response.

**Rationale**: Unique constraint chặn race mà check-then-insert không chặn. Persist normalized value tránh hai source of truth.

**Alternatives considered**: `citext`, dual original/normalized columns và service-only uniqueness bị loại vì extension/complexity/race không cần thiết.

**Sources**: [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [PostgreSQL expression indexes](https://www.postgresql.org/docs/current/indexes-expressional.html), [PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html)

## Rate limiting

**Decision**: Dùng PostgreSQL `auth_rate_limit_buckets`, keyed bằng HMAC của IP/email/session + action + fixed window để giữ đúng behavior khi nhiều API replicas mà không Redis. Defaults: register 5/IP/giờ và 3/email/ngày; login 10/IP/15 phút và 5/email/15 phút; verify/reset request 5/IP/giờ và 3/email/giờ; proof completion 5/challenge; OAuth start 20/IP/10 phút; refresh 60/session/phút. Response 429 có `Retry-After` nhưng không tiết lộ account existence. Thresholds là validated server config trong safe bounds.

**Rationale**: In-memory limiter không nhất quán giữa replicas; PostgreSQL đã là required dependency. HMAC subject tránh lưu raw email/IP trong limiter.

**Alternatives considered**: Redis bị loại vì thêm infrastructure ngoài scope. Process-local `@nestjs/throttler` chỉ phù hợp một replica và không đạt commercial scale consistency.

**Sources**: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [PostgreSQL INSERT/ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)

## Admin search, audit và retention

**Decision**: Admin list dùng keyset `(created_at DESC,id DESC)`, default 20/max 100, opaque cursor bound filter. Case-insensitive substring search email/display name dùng `pg_trgm` GIN indexes created bằng raw migration; base index `(role,status,created_at DESC,id DESC)`. Lock/unlock state transition, session revocation và immutable audit insert cùng transaction. Mỗi accepted request ghi audit với requested action, previous/new status, outcome CHANGED/NO_CHANGE và request ID; no-op vẫn có audit, không giả lập transition. Audit failure rollback; lock bảo đảm revoke toàn bộ session kể cả NO_CHANGE.

Retention: OAuth transactions 24 giờ sau terminal; pending onboarding 7 ngày after expiry và 30 ngày after completion; challenges 30 ngày after terminal; sessions/refresh credentials 30 ngày after absolute expiry/revocation; outbox delivery metadata 30 ngày, ciphertext cleared immediately after accepted send; rate buckets 24 giờ after window; Admin audit 2 năm. Cleanup bounded 1.000 rows/run, observable and retryable.

**Rationale**: Keyset ổn định dưới concurrent changes; trigram đáp ứng substring at 100k; audit immutable và transactionally consistent. Retention giữ reuse evidence qua session lifetime nhưng giới hạn operational/PII data.

**Alternatives considered**: Offset pagination dễ skip/duplicate; unindexed `%q%` không đạt target. Indefinite credential/audit retention bị loại vì data minimization.

**Sources**: [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html), [PostgreSQL routine vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html), [TypeORM indices](https://typeorm.io/docs/advanced-topics/indices/)

## REST errors và HTTP semantics

**Decision**: Versioned `/api/v1` contract dùng OpenAPI 3.1. Errors là `application/problem+json` theo RFC 9457 với safe stable `code` và correlation `requestId`. Generic public flows dùng 202; successful bodyless commands dùng 204; 401 cho missing/invalid auth, 403 cho authenticated role/ownership denial, 422 validation, 429 + Retry-After. Public registration/login/verification request/Forgot Password không dùng status để tiết lộ existence. Ngoại lệ: onboarding completion sau proof/browser-binding verification hợp lệ trả 409 `ONBOARDING_CANNOT_COMPLETE` khi uniqueness conflict; không phân biệt email/identity conflict hoặc tiết lộ provider/account ID. Invalid proof bị từ chối trước uniqueness result.

**Rationale**: Stable machine codes không cần expose internal exception; standard status/problem format cải thiện contract tests và frontend handling.

**Alternatives considered**: Custom per-controller errors gây drift. 409 ở public registration bị loại vì enumeration; ngoại lệ proof-bound onboarding completion dùng generic error theo spec.

**Sources**: [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html), [RFC 9110 HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html), [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.1.html)

## Reconciliation sau analysis

### Setup design review — T002–T004 (2026-09-26)

- T002: OpenAPI 3.1 document validation và 13 schema/semantic fixtures pass (14/14 tổng cộng) qua command trong quickstart. Đã quote description response Admin lock để YAML không parse dấu phẩy thành properties thừa. AdminCustomer đóng, timestamps bắt buộc; onboarding 409 chỉ sau valid proof/binding; logout có security theo nhánh.
- T003: Research, plan và data model thống nhất HMAC length-prefixed context/ID/server-side seed, giữ seed/key qua reload/rotation, giữ old key khi context còn hiệu lực và domain separation session/onboarding. Logout no-active-session chỉ clear cookie sau exact Origin check; active session cần CSRF. JWT hard expiry tại `iat+900`, không expiry leeway. Đây là review design; runtime assertions thuộc T010/T016/T020/T045–T047.
- T004: Plan/data model thống nhất Users → Sessions → RefreshCredentials → Challenges → Audit/Outbox, UUID order trong cùng loại. Social completion chỉ insert User mới; không fallback lock/link User hiện hữu. Outbox claim ngắn với fresh lease token, network ngoài transaction; finalize owner → challenge → outbox với lease/generation/eligibility recheck. Ciphertext/key được clear khi terminal; stale delivery không resurrect proof hoặc revoke generation mới; social proof không vượt context expiry. Runtime crash/race tests thuộc T028/T033/T036/T060; chưa coi review này là evidence chạy database.

### Follow-up decisions — U3/U4

**Decision**: Onboarding uses partial uniqueness for PENDING_EMAIL/PENDING_VERIFICATION only; retained terminal contexts do not prevent restart. Only a fresh verified OAuth callback may replace a pending context, transactionally invalidating old binding/proofs and inserting a fresh context. Materialize expiry during restart, not cleanup. Recheck the observed context after locking; concurrent losers fail safely rather than replacing the winner. Existing ExternalIdentity always takes precedence. Full transitions and race rules are canonical in data-model.md.

**Rationale**: Restart works before the 7-day retention cleanup without reviving consumed contexts or accepting stale browser proof.

**Alternatives considered**: Reusing the old context ID and unconditional provider/subject uniqueness were rejected because they complicate stale-proof isolation or block new onboarding.

**Decision**: User has nonnegative bigint credential_version (default 0); PASSWORD_RESET challenge snapshots it under User lock. Completion requires equality; password reset/change atomically increments once, updates hash, invalidates reset proofs and revokes sessions. Outbox never activates a reset proof for an outdated version. Opportunistic rehash does not increment. Timestamp remains audit-only; version fields are not exposed publicly.

**Rationale**: A counter gives an explicit concurrency boundary independent of timestamp precision. Tests must cover concurrent reset/change, delayed mail and rollback.

**Alternatives considered**: Timestamp-as-version and implicit inference from the hash were rejected in favor of an explicit counter/snapshot invariant.

**Decision**: Người dùng chọn toàn bộ Recommend; canonical lock matrix nằm ở data-model.md: Users → Sessions → RefreshCredentials → Challenges → Audit/Outbox, với social insert-only exception và short outbox claim tách finalize. AdminCustomer dùng object đóng đầy đủ, không mở rộng closed UserProfile bằng allOf. Usability dùng protocol end-to-end đã xác nhận trong spec/quickstart.

**Rationale**: Một nguồn lock order, contract có fixtures kiểm chứng, hard expiry và recoverable outbox giải quyết các mâu thuẫn trước implementation.

**Alternatives considered**: Không chọn grace expiry, encrypted CSRF token storage, no-op audit omission hoặc measurement loại thời gian mail/provider.
