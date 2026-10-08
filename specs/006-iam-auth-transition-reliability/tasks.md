---
description: 'Task list cho feature 006 IAM Auth Transition Reliability (CSP-1)'
---

# Tasks: IAM Auth Transition Reliability

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md) (R12 = selected protocol CSP-1), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md), constitution v2.0.0.

**Prerequisites**: Plan Phase 0/1, task generation và implementation đã hoàn tất; project owner authorize merge vào source hiện tại và tiếp tục validation ngày 2026-10-08. Full auth-transition gate PASS tại `.artifacts/auth-transition/run-05WyjJ/`. Final handoff/re-analysis được theo dõi ở T071; feature 005 vẫn có consumer-alignment gate riêng.

**Tests**: Bắt buộc theo FR-013 và SC-007 (actual browser/contract evidence, không mock-only). Viết test trước, xác nhận fail đúng hành vi còn thiếu, rồi mới implement. Browser tests chạy trên Chromium, Firefox, WebKit và variant không Web Locks; mọi browser case bắt đầu với cookie jar và IndexedDB trống.

**Organization**: Protocol core (context, binding, intent, slot, ledger, selector, transport) nằm ở Foundational vì cả bốn story phụ thuộc. Mỗi story sau đó là slice backend + frontend + tests độc lập.

## Format và path conventions

- `- [ ] T### [P?] [USn?] mô tả kèm file path`. `[P]` = khác file, không phụ thuộc task chưa xong trong cùng phase.
- Đường dẫn tính từ repository root: API `apps/api/`, frontend `apps/web/`, tooling `scripts/`. File mới là đích dự kiến.
- Wire names, cookie names, numeric bounds lấy từ [contracts/auth-context.openapi.yaml](contracts/auth-context.openapi.yaml), [contracts/browser-state.md](contracts/browser-state.md) và [data-model.md](data-model.md); không tự đổi. Nếu cần đổi contract hoặc business/security rule: dừng, cập nhật design artifacts và xin review.
- Trước mọi task frontend: đọc `apps/web/AGENTS.md` và installed Next.js guides liên quan trong `apps/web/node_modules/next/dist/docs/`.

## Verification protocol

Runner `pnpm validate:auth-transition --phase setup|foundation|US1|US2|US3|US4|all` được tạo ở T004. Budgets: setup 5 phút, foundation/contract 10 phút, story có browser cases 20 phút, compat 15 phút, all 60 phút; mỗi budget gồm 30s cleanup reserve. Runner fail khi thiếu engine/suite/case trong registry cố định, khi timeout hoặc cleanup fail; không `passWithNoTests`, không skipped PASS. PostgreSQL dùng `IAM_TEST_DATABASE_URL` và schema `iam_test_<hex>` riêng mỗi run (giống 003), teardown trong `finally` chỉ drop schema của chính run và dừng proxy/browser/process group của chính run. Artifacts không chứa token, cookie value, proof, password, HAR, trace hoặc screenshot có secret.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Validator, harness và runner trước khi viết protocol code.

**Independent Test**: OpenAPI 006 hợp lệ; runner `--phase setup` pass và từ chối phase sau khi thiếu test files; delivery proxy và OAuth harness tự kiểm được.

- [x] T001 Mở rộng `apps/api/scripts/validate-iam-contract.cjs` để validate thêm `specs/006-iam-auth-transition-reliability/contracts/auth-context.openapi.yaml` (OpenAPI 3.1 + JSON Schema 2020-12, cùng dependency đã pin của 003) với fixtures: `AccessSession` thiếu `authProtocol`/`sessionTag`/`contextRevision` bị từ chối, `ReserveIntentRequest` có field lạ bị từ chối, `EmptyRequest` có property bị từ chối; ghi kết quả vào `specs/006-iam-auth-transition-reliability/quickstart.md`.
- [x] T002 [P] Tạo owned loopback delivery proxy giữ downstream response headers sau upstream commit và release theo lệnh, giữ nguyên từng `Set-Cookie`, status, Origin/CORS, redirects, tại `apps/web/tests/auth-transition/support/delivery-proxy.ts` kèm self-test `apps/web/tests/auth-transition/support/delivery-proxy.test.ts`; proxy không log header values.
- [x] T003 [P] Tạo test-only OAuth harness inject deterministic provider adapter qua verification port hiện có, giữ real controllers/state/binding/claim/redirect/onboarding, tại `apps/api/test/fixtures/identity-access/oauth-browser-harness.ts`; không đăng ký vào production module, không cần provider secrets.
- [x] T004 Tạo runner `scripts/auth-transition-validate.mjs` và `scripts/tests/auth-transition-validate.test.mjs` với phases setup|foundation|US1|US2|US3|US4|all, registry file/case cố định, budgets và cleanup theo Verification protocol; thêm script `validate:auth-transition` vào `package.json` root.
- [x] T005 [P] Tạo Playwright config riêng cho IAM browser suite tại `apps/web/playwright.auth-transition.config.ts` (projects chromium, firefox, webkit, chromium-no-web-locks qua init script xóa `navigator.locks`; testDir `apps/web/tests/auth-transition`; fresh context mỗi test; không trace/HAR/screenshot).
- [x] T006 Viết và chạy measurement A5 tại `apps/web/tests/auth-transition/a5-cookie-limits.spec.ts` trên API 003 hiện tại (chưa có route 006; phép đo chỉ phụ thuộc giới hạn cookie của browser và header limit của Node/proxy, không phụ thuộc route): đo số cookie per host trước eviction và Cookie header size API chấp nhận trên mỗi engine; cookie thử dùng tên/độ dài tương đương `__Host-wa_cb_<uuid>`/`__Secure-wa_s_<tag>` (~85 byte) trên một route GET public; ghi giá trị engine/version vào `specs/006-iam-auth-transition-reliability/research.md` (mục R12 numeric bounds). Nếu WebKit < 50, cập nhật `CAP_NAMES` trong `specs/006-iam-auth-transition-reliability/contracts/browser-state.md` (nguồn chính) và bảng numeric bounds của research R12 trước Phase 2.

**Checkpoint**: `pnpm validate:auth-transition --phase setup` (5 phút).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, cookie/binding/slot primitives, context provisioning, intent CAS, capacity ledger, lock hierarchy, IndexedDB selector và transport. Mọi story phụ thuộc phase này.

**⚠️ CRITICAL**: Không story nào bắt đầu trước khi checkpoint này pass.

**Independent Test**: Migration lifecycle sạch; provision/confirm/reserve/capacity/group/lock tests pass trên PostgreSQL thật; selector unit tests chứng minh CAS/re-check; không route003 nào đổi hành vi ngoài phạm vi task.

### Tests — viết trước implementation

- [x] T007 [P] Viết integration tests migration/schema cho `auth_contexts`, `auth_intents`, `auth_cookie_names` và column mới (FK, unique `slot_tag`, enum `SUPERSEDED`, `down` chỉ trong test schema) tại `apps/api/test/integration/identity-access/auth-context-schema.spec.ts`.
- [x] T008 [P] Viết contract tests provision/confirm/reserve theo OpenAPI 006 (Origin, JSON, `EmptyRequest`, cookie attributes `__Host-wa_cb_<id>`/dev names, exactly-one cookie parse, `STALE_REVISION` kèm `currentRevision`, `CAPACITY_EXHAUSTED` trước emit, `CONTEXT_UNAVAILABLE`, 429 cho provision/confirm/reserve khi vượt limit) tại `apps/api/test/contract/identity-access/auth-context.spec.ts`.
- [x] T009 [P] Viết integration tests intent CAS (P01-b: stale reserve không supersede newer; accept supersede RESERVED cũ; một RESERVED per context), group merge/join (IDB-only reset không tạo group mới) và capacity ledger (value-exact ack; không release theo TTL/terminal intent/probe; release khi ack + absent) tại `apps/api/test/integration/identity-access/auth-context.spec.ts`.
- [x] T010 [P] Viết integration test lock hierarchy chạy song song provision, reserve, session issue, account-wide revocation và group merge trên cùng user/context, xác nhận không deadlock và L0 không bao giờ acquire sau lock khác, tại `apps/api/test/integration/identity-access/auth-context-locks.spec.ts`.
- [x] T011 [P] Viết unit tests (Vitest + jsdom, không thêm dependency) cho logic selector qua port `SelectorStore` in-memory có transaction semantics tuần tự: snapshot `expectedRevision` trong cùng transaction, re-check attempt sau network, CAS max revision, record vắng mặt = UNSELECTED, không lưu field secret, tại `apps/web/tests/identity-access/auth-selector.test.ts`. Hành vi IndexedDB thật (transaction serialization giữa hai tab, `close` khi xóa site data, IDB không mở được) kiểm bằng Playwright tại `apps/web/tests/auth-transition/selector-idb.spec.ts`.
- [x] T012 [P] Viết unit tests transport: headers `X-Auth-Context`/`X-Auth-Intent`/`X-Auth-Session-Tag`, bỏ qua response thiếu `authProtocol = 2`, phân loại `NOT_DISPATCHED`/`COMPLETED`/`UNCERTAIN` (body parse failure sau headers = UNCERTAIN), caller signal kết hợp chứ không thay deadline 15s, tại `apps/web/tests/identity-access/auth-transport.test.ts`.

### Implementation

- [x] T013 Tạo explicit migration `apps/api/src/infrastructure/database/migrations/20261007000100-AuthTransitionContexts.ts` theo [data-model.md](data-model.md): 3 bảng mới, column `auth_sessions.context_id`/`slot_tag`, `oauth_transactions.intent_id`, `pending_social_onboardings.context_id`, revocation reason `SUPERSEDED`, indexes; `down` chỉ chấp nhận NODE_ENV=test và schema `iam_test_<hex>` như migration 003.
- [x] T014 Thêm entities `AuthContext`, `AuthIntent`, `AuthCookieName` và column mới vào `apps/api/src/modules/identity-access/domain/entities.ts`; đăng ký trong `apps/api/src/infrastructure/database/data-source.ts`.
- [x] T015 [P] Thêm config server-only: binding HMAC key/version (dùng lại cơ chế key-version của refresh digest), `CAP_NAMES`, `CAP_BYTES`, binding Max-Age provisional/confirmed, intent expiry, outcome retention, với fail-fast validation trong `apps/api/src/config/identity-access.environment.ts` và `apps/api/.env.example`; cập nhật wrapper test `apps/api/scripts/with-test-iam.cjs` để cấp key ngẫu nhiên.
- [x] T016 [P] Thêm `lockContexts(manager, ids)` (sorted, một statement) và `lockCookieNames(manager, groupId, names)` (sorted) vào `apps/api/src/modules/identity-access/infrastructure/transactions.ts`, kèm comment ràng buộc L0 đầu tiên / L∞ cuối cùng.
- [x] T017 Mở rộng `apps/api/src/modules/identity-access/auth/browser-security.service.ts`: tạo name binding/slot (prefix production `__Host-`/`__Secure-`, dev không prefix), `readExactlyOne(request, name)` fail closed khi duplicate/malformed, liệt kê binding names co-present (không đọc value của name khác), write/clear binding và slot với đúng attributes trong [browser-state §1](contracts/browser-state.md#1-cookie-table); giữ API003 cho `oauth`/`ob`/legacy.
- [x] T018 Tạo `apps/api/src/modules/identity-access/context/cookie-ledger.service.ts`: tính `N(G)`, capacity check `CAP_NAMES`/`CAP_BYTES`, ghi `unresolved_set` khi emit, ack value-exact bằng digest, observe present/absent, release theo rule data-model, group merge (survivor `min(id)`), quyết định cleanup clears theo browser-state §1.
- [x] T019 Tạo `apps/api/src/modules/identity-access/context/auth-context.service.ts`: provision (group từ bindings co-present, capacity check trước emit, PROVISIONAL), confirm (exactly-one binding, digest verify, `confirmed_seq`, ACTIVE, re-emit long Max-Age), verify binding cho request, `last_seen_at` throttle; mọi transaction lock L0 → … → L∞.
- [x] T020 Tạo `apps/api/src/modules/identity-access/context/auth-intent.service.ts`: reserve với expected-revision CAS (accept tăng revision, supersede RESERVED cũ, capacity check cho establish kinds, LOGOUT capture `target_session_id` từ `expectedSessionTag`), `assertCurrent(manager, intent)` dùng trong mọi execute commit, mark COMMITTED/FAILED, expiry.
- [x] T021 Sửa `apps/api/src/modules/identity-access/auth/session.service.ts`: `issue(manager, userId, {contextId})` sinh `slot_tag` random 128-bit, revoke session hiện hành của context với `SUPERSEDED`, set `current_session_id`; giữ lockUsers/lockSessions order và TTL003; `revokeAll` không đổi.
- [x] T022 Tạo `apps/api/src/modules/identity-access/context/auth-context.controller.ts` cho `POST /auth/contexts`, `POST /auth/contexts/{contextId}/confirm`, `POST /auth/contexts/{contextId}/intents` theo OpenAPI 006 (Origin, JSON, no-store; rate limit qua `RateLimitService`: `AUTH_CONTEXT_PROVISION` theo IP, `AUTH_CONTEXT_CONFIRM` và `AUTH_INTENT_RESERVE` theo contextId, threshold/window cấu hình trong `apps/api/src/config/identity-access.environment.ts` cùng cơ chế `IAM_RATE_<ACTION>` của 003; 429 kèm Retry-After); đăng ký providers/controller trong `apps/api/src/modules/identity-access/identity-access.module.ts`.
- [x] T023 [P] Tạo selector module `apps/web/src/features/identity-access/session/auth-selector.ts` theo [data-model — selector](data-model.md#shared-selector--indexeddb-mới-006-sở-hữu) và [browser-state §3](contracts/browser-state.md#3-shared-selector-indexeddb): open DB `wedding-auth`, short readwrite transactions, attempt create/re-check, CAS revision, `refreshLease`, `recoveryReason`, detect `STORAGE_UNAVAILABLE` và `close`. Tách interface `SelectorStore` (adapter IndexedDB thật + adapter in-memory dùng cho test) trong cùng file.
- [x] T024 Sửa `apps/web/src/features/identity-access/api/client.ts`: thêm auth headers từ selector, check `authProtocol = 2`, trả operation knowledge `NOT_DISPATCHED`/`COMPLETED`/`UNCERTAIN`, giữ deadline 15s và kết hợp caller signal; thêm client functions provision/confirm/reserve.
- [x] T025 Tạo `apps/web/src/features/identity-access/session/auth-context-flow.ts`: provisioning flow F1 (explicit action only, re-check trước confirm và trước commit SELECTED) và reserve flow F2 (retry `STALE_REVISION` tối đa 2 lần chỉ khi attempt còn current, trong R06 budget).
- [x] T026 Sửa `apps/web/src/features/identity-access/session/store.ts` và `apps/web/src/features/identity-access/session/session-provider.tsx`: admission chỉ theo [browser-state §4](contracts/browser-state.md#4-admission-rules); phát admission/end-admission events kèm reason; page load không tự provision; selector vắng mặt → không private admission.

**Checkpoint**: `pnpm validate:auth-transition --phase foundation` (10 phút) + `pnpm validate:iam --phase all` để xác nhận003 chưa regress ngoài các assertion sẽ đổi có chủ đích ở US1/US4.

---

## Phase 3: User Story 1 - Account mới không bị auth operation cũ thay thế (Priority: P1) 🎯 MVP

**Goal**: Login/refresh/logout/password/logout-all chạy dưới context + intent + slot, nên response trễ của account A không thể restore A hoặc xóa phiên B, kể cả nhiều tab và không Web Locks.

**Independent Test**: Quickstart B1–B5: giữ response của A qua delivery proxy, hoàn tất login B, release A, reload/renew → actual API principal vẫn là B trên cả bốn browser projects.

### Tests for User Story 1 ⚠️

- [x] T027 [P] [US1] Viết contract tests login/refresh/csrf/logout/logout-all/`/me/password` theo OpenAPI 006 (headers bắt buộc, `AccessSession` mới, `SUPERSEDED`, `CREDENTIAL_MISSING`, clear chỉ slot của `sid`, body allowlists003 không đổi) tại `apps/api/test/contract/identity-access/auth-transition-session.spec.ts`.
- [x] T028 [P] [US1] Viết integration tests: login execute với intent superseded/revision lệch không tạo session; refresh tag lệch không rotate; historical slot không được parse; consumed value trong current slot → REFRESH_REUSE revoke family; late A refresh commit trước B chỉ install slot A và A đã `SUPERSEDED`; logout-all/password revoke theo003 và không chạm slot khác, tại `apps/api/test/integration/identity-access/auth-transition-session.spec.ts`.
- [x] T029 [P] [US1] Viết browser tests B1 (provision race), B2 (late refresh), B3 (late logout), B4 (pending password/onboarding completion của context cũ), B15 (hai lần login ẩn danh A/B chồng nhau trong cùng context; giữ reserve/execute của A qua delivery proxy) tại `apps/web/tests/auth-transition/us1-late-effects.spec.ts`, kiểm actual API principal sau reload/renew.
- [x] T030 [P] [US1] Viết browser test B5 chạy lại B1–B3 và B15 trên project `chromium-no-web-locks` và kiểm IDB refresh lease (hai tab refresh tuần tự, không token branch) tại `apps/web/tests/auth-transition/us1-no-web-locks.spec.ts`.
- [x] T031 [P] [US1] Viết unit tests frontend login/logout flow (provision → reserve → execute, LOGOUT pending chặn auto-admission, local logout end session khi network fail) tại `apps/web/tests/identity-access/auth-transition-session.test.tsx`.

### Implementation for User Story 1

- [x] T032 [US1] Sửa `apps/api/src/modules/identity-access/auth/local-login.service.ts` và `apps/api/src/modules/identity-access/auth/login.controller.ts`: yêu cầu binding + `X-Auth-Context` + `X-Auth-Intent`; password verify ngoài transaction; commit lock Context → users → sessions, `assertCurrent`, `issue` với context, ledger emit slot; credential errors giữ generic003.
- [x] T033 [US1] Sửa `apps/api/src/modules/identity-access/auth/refresh.service.ts`: tìm session theo `context.current_session_id` + expected tag, đọc exactly-one slot cookie của session đó, giữ strict rotation/REFRESH_REUSE003, lock Context trước users/sessions, ledger ack value đã trình và ghi emission mới.
- [x] T034 [US1] Sửa `apps/api/src/modules/identity-access/auth/session.controller.ts`: `GET /auth/csrf` và `POST /auth/refresh` theo context/slot; `POST /auth/logout` dưới intent LOGOUT (revoke captured session, clear chỉ slot đó, null `current_session_id` nếu current); `POST /auth/logout-all` clear chỉ slot của JWT `sid`; response refresh re-emit binding.
- [x] T035 [P] [US1] Sửa `apps/api/src/modules/identity-access/profile/profile.controller.ts`: sau password change chỉ clear slot của session `request.principal.sessionId`, bỏ clear singleton `wedding_rt`; không đổi `change-password.service.ts` business rules.
- [x] T036 [US1] Sửa `apps/web/src/features/identity-access/session/refresh-coordinator.ts`: single-flight bằng `selector.refreshLease` (20s), Web Locks chỉ là optimization, gửi `X-Auth-Session-Tag`, admission qua CAS revision, `SUPERSEDED`/`CREDENTIAL_MISSING` → end admission thay vì clear-and-retry; không retry refresh.
- [x] T037 [US1] Sửa `apps/web/src/features/identity-access/forms/login-form.tsx` và logout entry points dùng `auth-context-flow.ts` (provision khi cần → reserve LOCAL_LOGIN/LOGOUT → execute), giữ MASTER feedback và generic credential errors.
- [x] T038 [US1] Đăng ký US1 cases (T027–T031) vào registry của `scripts/auth-transition-validate.mjs` và chạy checkpoint.

**Checkpoint**: `pnpm validate:auth-transition --phase US1` (20 phút). US1 là MVP: current account đúng qua delayed responses trên mọi engine.

---

## Phase 4: User Story 2 - Nhận biết và recover operation chưa rõ outcome (Priority: P1)

**Goal**: Operation knowledge trung thực, outcome lookup read-only, recovery có deadline cho storage reset/unavailable, credential missing và capacity exhausted.

**Independent Test**: Quickstart B6–B11: timeout trước/sau dispatch, tab close lúc pending, reset/unavailable IndexedDB, đầy capacity, mất current slot → đúng `NOT_DISPATCHED`/`UNCERTAIN`/recovery state trong 30s, không false success, không replay mutation, không fallback account cũ.

### Tests for User Story 2 ⚠️

- [x] T039 [P] [US2] Viết contract tests `GET /auth/contexts/{contextId}/intents/{intentId}` (read-only, không Set-Cookie, không credential, 404 cho intent lạ/hết retention, binding bắt buộc) tại `apps/api/test/contract/identity-access/auth-intent-outcome.spec.ts`.
- [x] T040 [P] [US2] Viết integration tests capacity: đủ `CAP_NAMES` unresolved → provision/reserve/execute đều `CAPACITY_EXHAUSTED` trước emit; held headers sau cleanup không vượt cap (C2); intent terminal/TTL không release, tại `apps/api/test/integration/identity-access/auth-capacity.spec.ts`.
- [x] T041 [P] [US2] Viết browser tests B6 (timeout trước/sau dispatch/sau commit, body parse failure), B7 (đóng tab khi pending rồi mở lại) tại `apps/web/tests/auth-transition/us2-uncertain.spec.ts`.
- [x] T042 [P] [US2] Viết browser tests B8 (xóa IndexedDB lúc verification và lúc SELECTED, tab cũ cached context), B9 (IndexedDB không mở được, server healthy, rồi khôi phục và fresh login), B10 (capacity exhausted, IDB reset không bypass), B11 (mất current slot, stale slots còn) tại `apps/web/tests/auth-transition/us2-recovery.spec.ts`.
- [x] T043 [P] [US2] Viết unit tests recovery UI: mỗi `recoveryReason` hiển thị thông điệp/next action theo [browser-state §7](contracts/browser-state.md#7-recovery-states-copy-theo-master-không-thêm-design-language), public content vẫn render, không spinner vô hạn; thông báo nằm trong live region `role="status"` (lỗi chặn dùng `role="alert"`), next action là button/link có tên truy cập được, focus chuyển tới thông báo khi admission bị end, không chỉ dựa vào màu, theo `docs/design/MASTER.md`, tại `apps/web/tests/identity-access/auth-recovery.test.tsx`.

### Implementation for User Story 2

- [x] T044 [US2] Thêm outcome lookup vào `apps/api/src/modules/identity-access/context/auth-context.controller.ts` và `auth-intent.service.ts` (read-only transaction, không ledger emission, trả `IntentOutcome`), retention 24h.
- [x] T045 [US2] Tạo `apps/web/src/features/identity-access/session/operation-recovery.ts`: persist `pendingIntent`, tối đa 2 probes trong budget 30s (mỗi probe ≤ 15s), unknown giữ `UNCERTAIN`, zero automatic auth-mutation retry; reconcile khi tab mở lại.
- [x] T046 [US2] Xử lý `CAPACITY_EXHAUSTED`, `CREDENTIAL_MISSING`, `CONTEXT_UNAVAILABLE`, `STORAGE_RESET`, `STORAGE_UNAVAILABLE` trong `apps/web/src/features/identity-access/session/store.ts` và `auth-context-flow.ts`: chuyển `RECOVERY_REQUIRED`, end admission, không scan cookie hoặc dùng cached context.
- [x] T047 [US2] Tạo recovery surface theo MASTER (không design language mới) tại `apps/web/src/features/identity-access/session/auth-recovery-notice.tsx` và gắn vào layout auth hiện có; copy theo browser-state §7; đáp ứng các tiêu chí a11y trong T043; đọc `docs/design/MASTER.md` trước khi làm.
- [x] T048 [US2] Đăng ký US2 cases (T039–T043) vào `scripts/auth-transition-validate.mjs` và chạy checkpoint.

**Checkpoint**: `pnpm validate:auth-transition --phase US2` (20 phút).

---

## Phase 5: User Story 3 - OAuth và onboarding tuân current auth context (Priority: P1)

**Goal**: OAuth start gắn với intent đã reserve, callback/onboarding chỉ establish session khi intent vẫn current; giữ full-navigation và mọi security của003.

**Independent Test**: Quickstart B12–B13 với OAuth harness: callback cũ tới sau login B hoặc sau logout không admit account cũ; returning user và first-time onboarding hoàn tất; state invalid/reused bị reject; late reserve A không supersede OAuth B.

### Tests for User Story 3 ⚠️

- [x] T049 [P] [US3] Viết contract tests OAuth start `intent` query (intent invalid/superseded/đã start → 303 `result=superseded`, không oauth cookie), callback redirects (`success&intent`, `/social-onboarding`, `superseded`), onboarding confirm headers tại `apps/api/test/contract/identity-access/auth-transition-oauth.spec.ts`.
- [x] T050 [P] [US3] Viết integration tests: callback final commit với intent superseded không tạo session/user; pre-cutover transaction (`intent_id` null) bị reject; onboarding completion dưới intent mới, completion cũ in-flight bị supersede; existing state/PKCE/nonce/binding rejections giữ nguyên, tại `apps/api/test/integration/identity-access/auth-transition-oauth.spec.ts`.
- [x] T051 [P] [US3] Viết browser tests B12 (callback cũ sau B/logout; current returning user; first-time onboarding; invalid/reused state) và B13 (late reserve A sau reserve OAuth B trước callback) dùng harness T003 tại `apps/web/tests/auth-transition/us3-oauth.spec.ts`.

### Implementation for User Story 3

- [x] T052 [US3] Sửa `apps/api/src/modules/identity-access/oauth/oauth.controller.ts` và `apps/api/src/modules/identity-access/oauth/oauth-transaction.service.ts`: start yêu cầu `intent` query + binding của `intent.context_id`, intent OAUTH RESERVED chưa started, lưu `intent_id`; callback truyền intent vào final commit; superseded → fail path003 + redirect `oauth-result?result=superseded`.
- [x] T053 [US3] Sửa `apps/api/src/modules/identity-access/application/resolve-social-identity.service.ts`: `resolveClaimed` lock Context đầu tiên, `assertCurrent`, issue session với context, ghi `pending_social_onboardings.context_id` khi vào onboarding; giữ advisory subject → identities → users order.
- [x] T054 [US3] Sửa `apps/api/src/modules/identity-access/application/complete-social-onboarding.service.ts` và `apps/api/src/modules/identity-access/oauth/social-onboarding.controller.ts`: completion dưới intent `ONBOARDING_COMPLETE` cùng context của onboarding; lock Context → onboarding → challenges → users → sessions; body proof003 không đổi.
- [x] T055 [US3] Sửa `apps/web/src/features/identity-access/forms/social-login-buttons.tsx`: reserve OAUTH bằng fetch rồi full-page navigate tới start với `intent`; sửa `apps/web/src/features/identity-access/forms/social-onboarding-form.tsx` để reserve `ONBOARDING_COMPLETE` trước confirm.
- [x] T056 [US3] Sửa `apps/web/src/app/(auth)/oauth-result/page.tsx`: xử lý `result=superseded`; với `success` chỉ admit sau khi selector context khớp intent và refresh thành công (refresh = ack slot emission); không đọc code/state từ URL.
- [x] T057 [US3] Đăng ký US3 cases (T049–T051) vào `scripts/auth-transition-validate.mjs` và chạy checkpoint.

**Checkpoint**: `pnpm validate:auth-transition --phase US3` (20 phút).

---

## Phase 6: User Story 4 - Giữ existing IAM behavior và frontend handoff (Priority: P2)

**Goal**: 003 regressions xanh (chỉ đổi assertion có chủ đích), same-account renewal giữ unsaved edits, coordinated cutover/rollback an toàn, handoff có evidence cho 005.

**Independent Test**: `pnpm validate:iam --phase all` pass với các assertion đã cập nhật có trace; B14 cutover pass; same-account renewal giữ edits; handoff và005 docs cập nhật.

### Tests for User Story 4 ⚠️

- [x] T058 [P] [US4] Viết integration tests cutover: legacy refresh/logout/csrf thiếu `X-Auth-Context` → 401 + clear chỉ `wedding_rt`; legacy session (`context_id` null) không bao giờ current; rollback drill revoke sessions có `context_id` rồi re-cutover → `CREDENTIAL_MISSING`, tại `apps/api/test/integration/identity-access/auth-cutover.spec.ts`.
- [x] T059 [P] [US4] Viết browser test B14 (legacy session → một lần fresh login; legacy refresh response giữ trong proxy rồi release không ảnh hưởng session mới; không legacy fallback) tại `apps/web/tests/auth-transition/us4-cutover.spec.ts`.
- [x] T060 [P] [US4] Viết unit test same-principal renewal giữ valid unsaved edits (refresh cùng `sessionTag` không phát end-admission) tại `apps/web/tests/identity-access/auth-renewal.test.tsx`.

### Implementation for User Story 4

- [x] T061 [US4] Implement cutover behavior trong `apps/api/src/modules/identity-access/auth/session.controller.ts` (nhánh legacy thiếu header) và rollback command test-only/ops tại `apps/api/src/modules/identity-access/context/auth-cutover.command.ts` (revoke sessions có `context_id`; destructive, document data-loss impact).
- [x] T062 [US4] Cập nhật các assertion003 bị CSP-1 đổi có chủ đích (singleton `wedding_rt`, `AccessSession` shape, logout-all/password clear cookie, login/refresh headers) trong `apps/api/test/contract/identity-access/session.spec.ts`, `login.spec.ts`, `profile.spec.ts`, `apps/api/test/integration/identity-access/session.spec.ts`, `revocation-races.spec.ts`, `full-flow.spec.ts`, `apps/web/tests/identity-access/session.test.tsx`, `login.test.tsx`; mỗi thay đổi ghi trace FR-003/FR-014 trong comment test; không xóa assertion để pass. Lập bảng allowlist trong `specs/006-iam-auth-transition-reliability/validation-results.md` (file, test name, hành vi 003 cũ, hành vi mới, FR trace); assertion 003 nào đổi mà không có trong allowlist làm T070 FAIL.
- [x] T063 [US4] Thêm ghi chú "Superseded by 006 CSP-1" ở đầu `specs/003-identity-access-management/contracts/identity-access.openapi.yaml` (chỉ trong `info.description`, không sửa schema/route của 003) trỏ tới `specs/006-iam-auth-transition-reliability/contracts/auth-context.openapi.yaml`; `apps/api/scripts/validate-iam-contract.cjs` kiểm cả hai file, và contract tests runtime dùng schema 006 cho các route bị đổi.
- [x] T064 [US4] Cập nhật smoke `pnpm validate:iam:mail` (login/refresh/logout qua context + intent) trong `scripts/iam-mail-smoke.mjs` để003 mail smoke không regress.
- [x] T065 [US4] Cập nhật005 consumer docs: `specs/005-frontend-foundation-reliability/contracts/session-boundaries.md` (IAM Dependency Boundary, U1-B trỏ tới handoff 006 và trạng thái evidence) — chỉ sau khi US1–US3 checkpoints pass; không đánh dấu U1-B resolved khi chưa có validation-results.
- [x] T066 [US4] Đăng ký US4 cases (T058–T060) và phase compat vào `scripts/auth-transition-validate.mjs` và chạy checkpoint.

**Checkpoint**: `pnpm validate:auth-transition --phase US4` (15 phút) + `pnpm validate:iam --phase all`. Chạy lại `a5-cookie-limits.spec.ts` với route 006 thật để xác nhận số đo Phase 1 không đổi; lệch thì ghi vào validation-results và review `CAP_NAMES`.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Retention, secret hygiene, toàn bộ validation và evidence.

- [x] T067 [P] Mở rộng `apps/api/src/modules/identity-access/infrastructure/retention.worker.ts` và `apps/api/test/integration/identity-access/retention.spec.ts`: PROVISIONAL > 1h → RETIRED, ACTIVE idle 30 ngày → RETIRED, terminal intents > 24h xóa; batch bounded, `SKIP LOCKED`; **không** xóa ledger rows `unresolved_set` của group còn context ACTIVE.
- [x] T068 [P] Mở rộng `apps/api/test/integration/identity-access/secret-hygiene.spec.ts`: logs/responses/outcome/selector không chứa binding secret, refresh value, CSRF, proof, password, cookie value; access log không ghi `Cookie`/`Set-Cookie`.
- [x] T069 [P] Thêm production-like cookie checks (`__Host-`/`__Secure-`, host-only, Path, SameSite=Lax, không trong `document.cookie`/storage) vào mục deployment-shape của `specs/006-iam-auth-transition-reliability/quickstart.md`.
- [x] T070 Chạy `pnpm validate:auth-transition --phase all` (60 phút) và `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm scope:check`, `pnpm health`; đối chiếu diff test 003 với allowlist T062; ghi kết quả B1–B15 theo engine/version, giá trị A5, chi phí cutover vào `specs/006-iam-auth-transition-reliability/validation-results.md`. Thất bại ghi FAIL kèm output, không đánh dấu task xong.
- [x] T071 Cập nhật `specs/006-iam-auth-transition-reliability/contracts/frontend-handoff.md` với capability thực tế đã verify và limitations, rồi chuyển cho005 re-run `speckit-analyze`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: không phụ thuộc. T006 (A5) phải xong trước T015 vì có thể đổi `CAP_NAMES`.
- **Foundational (Phase 2)**: phụ thuộc Setup; chặn mọi story. Trong phase: T013 → T014 → (T015, T016, T017 song song) → T018 → T019 → T020 → T021 → T022; frontend T023 → T024 → T025 → T026.
- **US1 (Phase 3)**: sau Foundational. MVP.
- **US2 (Phase 4)**: sau Foundational. Browser cases dùng login flow của US1 (T037) để tạo session; backend capacity/outcome độc lập.
- **US3 (Phase 5)**: sau Foundational. Browser B12 dùng login B của US1 làm newer transition.
- **US4 (Phase 6)**: sau US1–US3 (cập nhật assertion003 và005 docs cần toàn bộ hành vi mới).
- **Polish (Phase 7)**: sau mọi story.

### User Story Dependencies

- **US1 (P1)**: chỉ Foundational.
- **US2 (P1)**: Foundational; browser tests cần US1 login/refresh để tạo trạng thái ban đầu.
- **US3 (P1)**: Foundational; B12 cần US1 login để có session B.
- **US4 (P2)**: US1, US2, US3.

### Within Each User Story

- Tests viết trước và phải fail đúng hành vi thiếu.
- Backend service → controller → frontend flow → registry/checkpoint.
- Không đánh dấu story xong khi checkpoint chưa pass trên cả bốn browser projects.

### Parallel Opportunities

- Setup: T002, T003, T005 song song sau T001.
- Foundational tests T007–T012 song song; T015/T016/T017 song song; frontend T023 song song với backend T018–T022.
- Mỗi story: mọi test task [P] song song; T035 song song với T032–T034.
- Sau Foundational, backend US2 (T044) và US3 (T052–T054) có thể làm song song với US1 nếu có người; browser checkpoints của US2/US3 chờ T037.

---

## Parallel Example: User Story 1

```bash
# Tests US1 cùng lúc:
Task: "Contract tests session routes in apps/api/test/contract/identity-access/auth-transition-session.spec.ts"
Task: "Integration tests late effects in apps/api/test/integration/identity-access/auth-transition-session.spec.ts"
Task: "Browser B1–B4 in apps/web/tests/auth-transition/us1-late-effects.spec.ts"
Task: "Browser B5 in apps/web/tests/auth-transition/us1-no-web-locks.spec.ts"
Task: "Frontend flow unit tests in apps/web/tests/identity-access/auth-transition-session.test.tsx"

# Implementation song song khác file:
Task: "Password response clears only sid slot in apps/api/src/modules/identity-access/profile/profile.controller.ts"
Task: "Local login under intent in apps/api/src/modules/identity-access/auth/local-login.service.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Outcome contract tests in apps/api/test/contract/identity-access/auth-intent-outcome.spec.ts"
Task: "Capacity integration tests in apps/api/test/integration/identity-access/auth-capacity.spec.ts"
Task: "Browser B6–B7 in apps/web/tests/auth-transition/us2-uncertain.spec.ts"
Task: "Browser B8–B11 in apps/web/tests/auth-transition/us2-recovery.spec.ts"
```

## Parallel Example: User Story 3

```bash
Task: "OAuth contract tests in apps/api/test/contract/identity-access/auth-transition-oauth.spec.ts"
Task: "OAuth integration tests in apps/api/test/integration/identity-access/auth-transition-oauth.spec.ts"
Task: "Browser B12–B13 in apps/web/tests/auth-transition/us3-oauth.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup (gồm A5 measurement).
2. Phase 2 Foundational — chặn mọi story.
3. Phase 3 US1 → chạy `--phase US1`. **Dừng và kiểm**: current account đúng qua delayed responses trên Chromium/Firefox/WebKit/no-Web-Locks.
4. Không deploy: feature chưa có cutover (US4); MVP chỉ là checkpoint kỹ thuật trong môi trường test.

### Incremental Delivery

1. Setup + Foundational → protocol core sẵn sàng.
2. US1 → late-effect safety.
3. US2 → truthful uncertainty và recovery.
4. US3 → OAuth/onboarding.
5. US4 → 003 compatibility, cutover, handoff. Chỉ sau US4 + Polish mới đủ điều kiện coordinated cutover.

### Notes

- Không task nào được tự đổi003 security semantics (strict rotation, reuse revocation, TTL, Origin/CSRF, body allowlists).
- Destructive commands (rollback T061, migration `down`) chỉ chạy trong schema test hoặc với runbook đã document.
- Commit sau mỗi task hoặc nhóm logic; dừng ở mỗi checkpoint để kiểm story độc lập.

## Phase 8: Convergence

- [x] T072 Resolve the pre-existing `secret-hygiene` failure (assertion expects `setHeader('Cache-Control', 'no-store')` in `apps/api/src/main.ts`): fix `apps/api/src/main.ts` or the assertion in `apps/api/test/integration/identity-access/secret-hygiene.spec.ts` per 003 intent and record it in the T062 allowlist per Constitution V (contradicts)
- [x] T073 Bring pre-existing unformatted builder/assets/publication files to `prettier --check` compliance (or document them as out-of-scope with owner) so `pnpm format:check` in T070 can pass per Constitution V (contradicts)
- [x] T074 Make `scripts/iam-validate.mjs` spawn pnpm via `npm_execpath` (as `scripts/auth-transition-validate.mjs` does) so the 003 baseline `validate:iam` runs on Windows per Constitution III (partial)
- [x] T075 Represent unknown late-arriving slot owners explicitly in `apps/api/src/modules/identity-access/context/cookie-ledger.service.ts` (nullable owner for unknown SLOT rows via a new migration, not the zero UUID) with a test in `apps/api/test/integration/identity-access/auth-context.spec.ts` per FR-006 (partial)
- [x] T076 Report `EXPIRED` for intents past `expires_at` in the outcome lookup of `apps/api/src/modules/identity-access/context/auth-intent.service.ts` and cover it in `apps/api/test/contract/identity-access/auth-intent-outcome.spec.ts` per FR-005 (partial)
- [x] T077 Add the 429 response to `confirmAuthContext` in `specs/006-iam-auth-transition-reliability/contracts/auth-context.openapi.yaml` and re-run `apps/api/scripts/validate-iam-contract.cjs` per contracts/T022 (partial)
- [x] T078 Document the rationale for `configureApplication()` in `apps/api/src/main.ts` and the `observations()` capability of `apps/web/tests/auth-transition/support/delivery-proxy.ts` in `specs/006-iam-auth-transition-reliability/quickstart.md` per plan: Integration (unrequested)

## Phase 9: Convergence

**Scope**: Phase 1–3 (T001–T038). Findings F1–F9 from the scoped assessment; existing Phase 8 tasks remain unchanged. This phase does not claim completion of Phase 4–7.

- [x] T079 CRITICAL — Propagate the phase deadline and cancellation signal from `scripts/auth-transition-validate.mjs` through migration/readiness/startup in `scripts/auth-transition-stack.mjs`; replace the successful 10-second stop timeout with bounded process-tree termination, escalation and verified exit, and fail the checkpoint on cleanup failure. Add runner lifecycle tests for hung startup, interruption and a child that ignores SIGTERM; preserve the 30s cleanup reserve and drop only the owned test schema per Constitution III; T004 / Verification protocol (contradicts)
- [x] T080 CRITICAL — Fence all late refresh success/error effects in `apps/web/src/features/identity-access/session/refresh-coordinator.ts` against the original selected context/session and the current selector: a rejected old CAS, SUPERSEDED, stale 401 or network failure must not clear an already-admitted B or put its selector into recovery; re-check pending LOGOUT before admitting a refresh result. Add deferred-response unit cases in `apps/web/tests/identity-access/auth-transition-session.test.tsx` and extend B2 in `apps/web/tests/auth-transition/us1-late-effects.spec.ts` to assert B remains admitted before reload as well as after renewal per FR-003, FR-012; US1/AC1; T026, T036 (contradicts)
- [x] T081 CRITICAL — Scope local end-admission effects of `logoutCurrent()`, `logoutAll()` in `apps/web/src/features/identity-access/session/refresh-coordinator.ts` and password completion in `apps/web/src/features/identity-access/forms/profile-form.tsx` to the originating context/session; end the originating local admission when logout is initiated and preserve a newer B when A completes or fails later, including peer notifications and selector updates. Add same-tab/peer-admitted-B deferred completion tests and extend B3/B4 to assert live admission before reload while preserving original-account revocation rules per FR-003, FR-010, FR-012; US1/AC2, US1/AC4; T031, T037 (contradicts)
- [x] T082 Invalidate the closed shared IndexedDB adapter in `apps/web/src/features/identity-access/session/auth-selector.ts` and notify end-admission on `versionchange` before explicitly closing, as well as on unexpected close; keep old network results unable to re-admit the abandoned context and permit an explicit action to reopen restored storage without cookie fallback. Extend `apps/web/src/features/identity-access/session/session-provider.tsx` and `apps/web/tests/auth-transition/selector-idb.spec.ts` with a live-tab reset assertion before navigation and explicit fresh-login after storage restoration per FR-001, FR-008; T023, T026 (partial)
- [x] T083 Keep the 15s request deadline and combined caller cancellation active through response body consumption in `apps/web/src/features/identity-access/api/client.ts`, cleaning them up only when the complete operation settles; add deterministic tests in `apps/web/tests/identity-access/auth-transport.test.ts` for headers arriving promptly but a body stalling, and caller abort during body read, both yielding UNCERTAIN within the deadline per FR-007; plan: R06 request deadline; T012, T024 (partial)
- [x] T084 Classify non-2xx body parse failures after dispatch as UNCERTAIN in `apps/web/src/features/identity-access/api/client.ts` instead of swallowing the parse error and returning COMPLETED; retain safe status-based messaging and no automatic mutation replay, and add unreadable/truncated 4xx and 5xx body cases to `apps/web/tests/identity-access/auth-transport.test.ts` per FR-004; T012, T024 (contradicts)
- [x] T085 Enforce a fixed required case/project inventory for setup, foundation and US1 in `scripts/auth-transition-validate.mjs`, consuming fresh test reports rather than checking only file existence and process exit status; reject missing cases, missing browser projects, skipped/todo/interrupted required cases and empty suites before reporting PASS. Add negative runner tests in `scripts/tests/auth-transition-validate.test.mjs` without requiring future Phase 4–7 cases in a US1 run per FR-013, SC-007 (Phase 1–3 evidence slice); T004, T038 / Verification protocol (partial)
- [x] T086 Complete the required foundation concurrency evidence: extend `apps/api/test/integration/identity-access/auth-context-locks.spec.ts` to overlap co-present group merge/join with provision, reserve, context session issue and account-wide revocation on shared groups/users, assert L0-first/L-infinity-last acquisition and ledger/group invariants, and extend `apps/web/tests/auth-transition/selector-idb.spec.ts` to assert actual two-tab IndexedDB transaction serialization and attempt/revision CAS. Run these on PostgreSQL and all four browser projects per T010, T011; plan: lock hierarchy and shared transactional selector (partial)
- [x] T087 Implement cleanup target selection in `apps/api/src/modules/identity-access/context/cookie-ledger.service.ts` and integrate its clear emissions into the Phase 1–3 auth response writers: clear only revoked/superseded session slots or eligible retired/older empty bindings under browser-state section 1, never current slots/bindings or the latest confirmed group binding. Preserve unresolved emissions until value-exact acknowledgement and subsequent absence; add capacity-reclamation and cleanup-before-late-header tests in `apps/api/test/integration/identity-access/auth-context.spec.ts` and the browser delivery-proxy suite per T018; plan: CSP-1 F6; FR-003, FR-006 (missing)

## Phase 10: Convergence

**Scope**: Follow-up assessment of Phase 1–3 (T001–T038 and T079–T087). Existing Phase 8 findings T075/T077 remain tracked there; no duplication or claim of Phase 4–7 completion. F1 was reproduced in memory against the current production flow/selector modules; F2/F3 are evidenced by current control flow and the group-membership interleaving.

- [x] T088 CRITICAL — Fence recovery mutations in `apps/web/src/features/identity-access/session/auth-context-flow.ts` by the originating provisioning/reservation attempt and context snapshot, with the guard applied atomically in `apps/web/src/features/identity-access/session/auth-selector.ts`: late `CAPACITY_EXHAUSTED`, `CONTEXT_UNAVAILABLE` or `BINDING_INVALID` from provision, confirm or reserve must not replace a newer selected B with RECOVERY_REQUIRED or remove B's session tag. Preserve recovery for errors whose attempt is still current, and classify stale errors as superseded. Add deferred-error tests in `apps/web/tests/identity-access/auth-transition-session.test.tsx` for all three network stages and a real two-tab delayed-error case in `apps/web/tests/auth-transition/us1-late-effects.spec.ts` asserting live B and renewal on all four projects; register required cases in `scripts/auth-transition-cases.json` per FR-001–003, FR-012; US1/AC1–3; T025; T080 (contradicts)
- [x] T089 HIGH — Enforce the planned 5s refresh queue deadline in `apps/web/src/features/identity-access/session/refresh-coordinator.ts` independently of the 20s lease expiry; stop waiting without dispatch when the queue budget expires and preserve truthful NOT_DISPATCHED knowledge rather than implying a completed renewal. Before returning a peer/cached session while queued, re-check its context/tag/revision and pending LOGOUT against the current selector; never return stale A after B selection or a pending logout. Keep strict rotation/no automatic refresh replay. Add fake-clock queue-expiry and deferred-selector/peer-admission tests in `apps/web/tests/identity-access/auth-transition-session.test.tsx`, and register them in `scripts/auth-transition-cases.json` per plan: Performance / bounds (queue 5s, lease 20s); FR-004, FR-007, FR-008, FR-012; T024, T036 (contradicts)
- [x] T090 HIGH — Make group locking in `apps/api/src/modules/identity-access/context/auth-context.service.ts` stable when a concurrent merge/join changes group membership between the initial member snapshot and L0 acquisition: do not continue with a newly observed group while holding only the old group's member locks, and do not acquire missing L0 rows after business/ledger locks or in an inconsistent order. Use bounded transaction restart/revalidation or an equivalent proven serialization strategy without changing authority/capacity semantics. Extend `apps/api/test/integration/identity-access/auth-context-locks.spec.ts` with deterministic PostgreSQL barriers that pause after membership discovery, commit a competing merge/join, then resume bind/issue/cleanup; assert full group lock coverage, no implicit out-of-order context UPDATE locking, L0-first/L-infinity-last and ledger/group invariants. Register the required case in `scripts/auth-transition-cases.json` per plan: Context-first / ledger-last lock hierarchy and group-observed emission accounting; FR-001, FR-002, FR-006; T010, T018, T086 (partial)

## Phase 11: Convergence

- [x] T091 MEDIUM — Add an accessible named control for CAPACITY_EXHAUSTED recovery that reveals actionable site-data reset instructions without automatically deleting browser data; verify the control and instructions in `apps/web/src/features/identity-access/session/auth-recovery-notice.tsx` and `apps/web/tests/identity-access/auth-recovery.test.tsx` per FR-006, FR-015, T043, US2/AC9–10 (partial).
- [x] T092 HIGH — Enforce presence of `expectedSessionTag` for LOGOUT reservations in `apps/api/src/modules/identity-access/context/auth-context.controller.ts` and `specs/006-iam-auth-transition-reliability/contracts/auth-context.openapi.yaml`, preserving explicit null and captured-target semantics. Add contract/integration evidence that omitted fields are rejected and null/stale captured tags cannot revoke a newer live session; register cases in `scripts/auth-transition-cases.json` per FR-010, FR-011, plan: CSP-1 F4 and ReserveIntentRequest (partial).
- [x] T093 HIGH — Document the exact invocation and confirmation phrase for `AuthCutoverCommand`, session-loss/re-login impact, coordinated traffic stop, retained additive schema and verification/re-cutover steps in `docs/iam-operations.md` and 006 quickstart per Constitution III, FR-014, T061 (partial).
- [x] T094 MEDIUM — Keep owned Next test stack generated output/config out of application source and formatting checks: use an owned TypeScript configuration or restore only generated config mutations safely, ignore `.next-auth-transition-*` build output, and verify cleanup does not overwrite concurrent source edits in `scripts/auth-transition-stack.mjs`, `apps/web/next.config.ts` and ignore files per T004/T070, Constitution III and plan: owned disposable validation resources.
- [x] T095 MEDIUM — Extend A5 browser measurement to verify accepted cookie-header bounds against a real 006 provisioning route with actual Origin/CORS and protocol response, keeping synthetic-cookie values out of reports and restoring a fresh cookie jar. Record engine/version numeric results in validation-results after all-project execution per T066, SC-007 and plan: A5 numeric capacity verification (partial).

## Phase 12: Convergence

- [x] T096 HIGH — Preserve Context-first locking in retention: avoid acquiring auth_context rows after onboarding/challenge/OAuth/session/intent locks and implicit foreign-key updates during deletion; bound cleanup with SKIP LOCKED and maintain unresolved ledger accounting. Add PostgreSQL regression coverage for expired intent pointers, aged context-bound session pointers and concurrent reserve/cleanup in `apps/api/src/modules/identity-access/infrastructure/retention.worker.ts` and `apps/api/test/integration/identity-access/retention.spec.ts`, register cases in `scripts/auth-transition-cases.json` per T067, FR-001/FR-006 and plan: Context-first lock hierarchy (contradicts).

## Phase 13: Convergence

- [x] T097 HIGH — Acquire the complete sorted destination/superseded user set before any account lock in every context-bound session establishment path. Prevent opposing account switches across independent contexts from locking users in opposite order; cover local/social/onboarding issuance and add deterministic PostgreSQL regression evidence, register cases in `scripts/auth-transition-cases.json` per FR-002/FR-011 and plan: Context-first lock hierarchy (partial).

## Phase 14: Convergence

- [x] T098 MEDIUM — Replace proposed quickstart phase commands with the implemented cumulative `setup|foundation|US1|US2|US3|US4|all` commands, actual budgets, evidence requirements and separate IAM compatibility invocation in `specs/006-iam-auth-transition-reliability/quickstart.md` per T004/T066, FR-014/FR-016 and Constitution III: runnable developer workflows (partial).

## Phase 15: Convergence

- [x] T099 HIGH — Complete the claimed OAuth transaction before cookie-ledger settlement in `apps/api/src/modules/identity-access/application/resolve-social-identity.service.ts`, so no business row lock is acquired after L-infinity. Add regression evidence for callback business/ledger order and retain atomic callback/session completion per FR-009/FR-011 and plan: Context-first, ledger-last lock hierarchy (partial).

## Phase 16: Convergence

- [x] T100 HIGH — Remove context-less singleton-cookie login fallback from `apps/api/src/modules/identity-access/auth/login.controller.ts`; require both context and intent headers for session establishment, preserve Origin/body/rate-limit/credential policies and adapt the 003 login contract fixture to CSP-1 with full safe-session assertions. Add missing-header rejection evidence and assertion allowlist trace per T032, FR-002/FR-014 and contract: required bound login (contradicts).

## Phase 17: Convergence

- [x] T101 MEDIUM — Scope the final IAM integration invocation in `scripts/iam-validate.mjs` to identity-access plus shared migration/readiness suites. Do not invoke builder suites outside their required owned storage/scratch harness; retain the complete IAM regression and 006 transition runner coverage, document the runner boundary and rerun `validate:iam --phase all` per T066, FR-011 and Constitution II/III: app-owned reproducible validation (partial).

## Phase 18: Convergence

- [x] T102 MEDIUM — Make B2's delivery acknowledgement reliable on remote Firefox by observing the originating page fetch completion for the captured old session tag across navigation, rather than relying on a Playwright response event. Retain actual held committed headers, live newer admission, bounded cookie count and reload/renew assertions in `apps/web/tests/auth-transition/us1-late-effects.spec.ts`; rerun four-project evidence and all checkpoint per T027, FR-013 and SC-001 (partial).

## Phase 19: Convergence

- [x] T103 MEDIUM — Keep social login buttons disabled until client hydration installs their handlers, and wait for the enabled action before starting OAuth in the browser fixture. Prevent an early WebKit click on server-rendered markup from silently losing the user's explicit login action; cover server-rendered disabled state and existing real reservation/full-navigation journeys in `apps/web/src/features/identity-access/forms/social-login-buttons.tsx` and related tests per FR-009/FR-015, US3/AC3 and plan: supported full-navigation OAuth (partial).

## Phase 20: Convergence

**Assessment (2026-10-08):** Present implementation checked against FR-001–016, SC-001–007, 23 acceptance scenarios, CSP-1 plan decisions and constitution2.0.0. Existing full-gate PASS evidence remains valid for its registered cases, but does not cover the gaps below. F1/F2 were reproduced with the production modules and a sequential selector adapter delaying transaction-result delivery while B is selected/admitted; F3 was reproduced with a rejected fetch. F4/F5 follow directly from current subscription/error/deadline paths. No application code, spec, plan or existing task was changed by this assessment.

- [x] T104 CRITICAL — Fence in-memory session admission after asynchronous selector reads/CAS in `apps/web/src/features/identity-access/session/refresh-coordinator.ts` (`adoptIfCurrent`, peer acceptance, refresh and local-login admission) against intervening session/selector transitions. Reproduction: capture selected A in a selector transaction, select/admit B before delivering that transaction result, then deliver the peer A snapshot; current code leaves selector B but restores A in `sessionStore`. Prevent stale continuations from overwriting newer admission without treating repeated asynchronous reads as an atomic fence. Add deterministic delayed-selector-result regressions in `apps/web/tests/identity-access/auth-transition-session.test.tsx`, register cases in `scripts/auth-transition-cases.json`, and verify actual two-tab admission plus reload/renew on all four browser projects per FR-001/FR-003/FR-012, US1/AC1–3, SC-001 and plan: shared-selector admission rules (contradicts).
- [x] T105 CRITICAL — Fence local recovery/end-admission effects in `apps/web/src/features/identity-access/session/auth-context-flow.ts` by the originating session/attempt through transaction-result delivery, not only inside `requireRecovery`. Reproduction: A's CAPACITY_EXHAUSTED recovery transaction commits, B is selected/admitted before its result reaches the caller, then A's unconditional `sessionStore.clear` removes B although the selector is SELECTED B. Cover CAPACITY_EXHAUSTED/CREDENTIAL_MISSING/CONTEXT_UNAVAILABLE/BINDING_INVALID and related storage-failure continuations; preserve recovery for the actual current context and preserve B for stale work. Add delayed recovery-result regressions to `apps/web/tests/identity-access/auth-transition-session.test.tsx`, register required cases and rerun four-project preservation evidence per FR-003/FR-008/FR-012, US1/AC1–3, T088 and plan: context-scoped recovery (contradicts).
- [x] T106 HIGH — Preserve truthful operation knowledge in the refresh failure path of `apps/web/src/features/identity-access/session/refresh-coordinator.ts`. A rejected fetch or unreadable response currently becomes CREDENTIAL_MISSING despite transport reporting UNCERTAIN, causing a false credential-loss explanation. Distinguish confirmed credential/binding/context rejection from NOT_DISPATCHED and UNCERTAIN; end or defer private admission safely with persistent unresolved feedback and bounded read-only reconciliation/next action, without automatic refresh replay or asserting that the cookie was lost. Cover CSRF-fetch failure, dispatched refresh timeout/lost/unreadable response and confirmed missing-credential rejection in `apps/web/tests/identity-access/auth-transition-session.test.tsx` and the browser uncertainty suite; register cases per FR-004/FR-006/FR-007/FR-015, US2/AC2/6 and SC-002/SC-006 (partial).
- [x] T107 HIGH — Make uncertain-operation feedback reactive after the recovery surface has mounted in `apps/web/src/features/identity-access/session/auth-recovery-notice.tsx` and existing login/logout/logout-all entry points in `refresh-coordinator.ts`, `session-provider.tsx` and `forms/login-form.tsx`. The notice currently reads pendingIntent only once at mount, filters LOGOUT from session notifications, and logout/logout-all swallow failures without publishing operation knowledge; an already-mounted page therefore lacks persistent remote-outcome-unknown feedback/next action after a failed logout. Keep local logout immediate, distinguish confirmed remote revocation from unresolved outcomes, scope feedback/probes to the originating context so newer B is not affected, and clear stale notices when resolved/superseded. Add UI regressions mounting the notice before dispatch and real browser lost-response logout/logout-all cases, retain zero automatic mutation replay, and register required cases per FR-005/FR-006/FR-010/FR-015, US2/AC2/4–6 and SC-002/SC-006 (partial).
- [x] T108 HIGH — Bound selector transaction acquisition/completion and its callers in `apps/web/src/features/identity-access/session/auth-selector.ts` and `refresh-coordinator.ts`. IndexedDbSelectorStore.open has a timeout, but transact waits indefinitely for read/complete/error/abort, and coordinatedRefresh awaits acquireRefreshLease before checking the 5s queue deadline. A stalled/blocked transaction can therefore bypass documented queue/recovery budgets and leave auth UI pending indefinitely. Propagate remaining operation budgets, reject/invalidate safely on timeout, and prevent a timed-out transaction or late callback from subsequently committing selector/admission changes; do not release cookie-delivery capacity or silently fall back to legacy/single-tab storage. Add stalled-read/commit/queued-transaction regression coverage in selector/session tests and actual browser contention where feasible, register cases and verify bounded persistent recovery per FR-007/FR-008, US2/AC6/8, SC-006 and plan: queue5s/request15s/recovery30s (partial).


## Phase 21: Convergence

**Assessment (2026-10-08):** Reassessed FR-001–016, SC-001–007, 23 acceptance scenarios, 12 plan decision groups and five constitution principles against present source and registered evidence. Four gaps were reproduced read-only with production TypeScript modules: F1 uses two sequential adapters sharing one selector while keeping per-connection authority generations, matching the IndexedDB adapter's generation ownership; F2 rejects logout reservation with UNCERTAIN; F3 expires the refresh lease queue before dispatch; F4 returns a parsed COMPLETED refresh rejection. These reproductions are module/adapter evidence, not new actual-browser evidence. Prior PASS reports remain evidence for their registered cases. This assessment only appends tasks; it does not modify application code or previous artifacts/tasks.

- [X] T109 CRITICAL — Make admission fencing in `apps/web/src/features/identity-access/session/auth-selector.ts` and `refresh-coordinator.ts` valid across independent IndexedDB connections/tabs, including delayed transaction-result delivery. The adapter's `authorityGeneration` increments only for its own writes: after connection A captures SELECTED A, connection B can select B before A receives the read result; A's unchanged local generation and unchanged in-memory version still permit peer A admission although the shared selector is B. Do not rely on a per-connection counter, repeated asynchronous reads, or timely peer messages as an atomic cross-tab authority fence. Cover peer/local-login/refresh admission using deterministic separate-connection delayed-result tests in `apps/web/tests/identity-access/auth-transition-session.test.tsx`, plus real two-tab paused-delivery and reload/renew evidence on all four supported browser projects; register required cases in `scripts/auth-transition-cases.json`. Preserve no-Web-Locks correctness, strict rotation and no automatic mutation replay per FR-001/FR-003/FR-008/FR-012/FR-013, US1/AC1–3, SC-001 and plan: shared-selector admission rules; T104 (contradicts).
- [X] T110 HIGH — Publish scoped persistent operation knowledge for failures during provisioning/confirmation/intent reservation in `apps/web/src/features/identity-access/session/auth-context-flow.ts`, `refresh-coordinator.ts`, `auth-recovery-notice.tsx` and existing local/social/onboarding callers. Lost LOGOUT reservation currently leaves pending LOGOUT without an intent ID, while `logoutCurrent` ignores every AuthFlowError and only emits the initial local LOGOUT notice; an already-mounted notice receives no uncertainty event. Social-start failures likewise offer generic retry feedback. Distinguish NOT_DISPATCHED, parsed rejection and UNCERTAIN at these setup stages; provide a truthful accessible next action even when no context/intent ID is known, never fabricate an outcome lookup or replay the mutation, and fence stale feedback against newer B. Add mounted-before-action regressions and real-browser lost provision/confirm/reserve cases, including logout reservation and social start, in the existing session/recovery/browser suites; register cases and update verified handoff evidence per FR-004/FR-005/FR-006/FR-009/FR-010/FR-015, US2/AC2/4–6, SC-002/SC-006; T107 (partial).
- [X] T111 HIGH — Finish bounded refresh-queue recovery in `apps/web/src/features/identity-access/session/refresh-coordinator.ts`, `session-provider.tsx` and `auth-recovery-notice.tsx`. QUEUE_TIMEOUT currently throws NOT_DISPATCHED after 5s without publishing a recovery reason or notification, and SessionProvider swallows the rejection; full-navigation bootstrap therefore ends without persistent explanation/next action. Publish truthful scoped NOT_DISPATCHED feedback when the queue budget expires, preserve any newer admission and valid peer-renewed session, and provide an explicit bounded route to resolution without automatic refresh replay. Add queue-expiry UI tests starting with no in-memory session and an already-mounted notice, plus actual browser lease-contention/deadline recovery evidence on all supported projects; register required cases per FR-004/FR-006/FR-007/FR-008/FR-015, US2/AC6/8, SC-003/SC-006 and plan: queue5s/request15s/recovery30s; T089/T108 (partial).
- [X] T112 HIGH — Correct refresh error knowledge mapping in `apps/web/src/features/identity-access/session/refresh-coordinator.ts`: a dispatched refresh with a parsed COMPLETED rejection, such as CSRF_INVALID/403, currently becomes OPERATION_UNCERTAIN. Use confirmed-failure feedback for completed rejections, retain dedicated credential/context/superseded handling, and reserve uncertainty for a dispatched outcome that cannot be established. Preserve safe admission handling, context scoping and zero mutation replay. Add production-flow regressions for parsed 403/429/5xx responses, contrasting NOT_DISPATCHED and timeout/lost/unreadable responses, and accessible recovery assertions in the existing session/recovery suites; include actual browser rejection evidence, register cases and update validation/handoff after verification per FR-004/FR-007/FR-015, US2/AC1–2/6, SC-002/SC-006; T106 (partial).


## Phase 22: Convergence

**Assessment (2026-10-08):** Checked 16 functional requirements, seven success criteria, 23 acceptance scenarios, 12 plan decision groups and five constitution principles against present source. Two gaps were reproduced read-only using production modules/components: an admitted A survives bootstrap observing RECOVERY_REQUIRED or pending LOGOUT; an OAuth-result page for superseded intent A displays success using subsequently admitted B. These are module/component reproductions, not new actual-browser evidence. Existing passing browser reports cover their registered cases, not these interleavings. This assessment only appends tasks.

- [X] T113 CRITICAL — End held private admission when refresh/bootstrap observes shared selector state that invalidates that admission in `apps/web/src/features/identity-access/session/refresh-coordinator.ts` and its existing session/provider consumers. The early return for pendingIntent/recoveryReason currently bypasses admission clearing: with A already admitted, another selector connection can enter RECOVERY_REQUIRED or reserve LOGOUT, then `bootstrapSession(true)` returns null without a request while A remains in `sessionStore`. Scope withdrawal to the observed admission/context and fence delayed continuations so newer B survives; preserve valid peer-renewed admission and the selected-state NOT_DISPATCHED queue feedback semantics from T111 instead of treating every recoveryReason as equivalent invalidation. Do not rely on timely peer notification as the authority fence. Add deterministic preexisting-admission regressions for recovery and pending logout, including delayed-result/newer-B preservation, in `apps/web/tests/identity-access/auth-transition-session.test.tsx`; register required cases in `scripts/auth-transition-cases.json` and verify actual two-tab recovery/logout observation plus reload/renew on all four supported browser projects. Update verified handoff evidence per FR-001/FR-003/FR-006/FR-008/FR-010/FR-012/FR-013, US1/AC1–3, SC-001 and plan: shared-selector admission rules (contradicts).
- [X] T114 HIGH — Fence OAuth-result confirmation, selector synchronization, refresh/admission and displayed outcome by the originating OAuth intent in `apps/web/src/app/(auth)/oauth-result/page.tsx` and its existing selector/session helpers. Reproduction: OAuth A passes the initial pending-intent check, B completes login while A's confirm request is pending, then confirm returns B's current revision/tag; unguarded `observeServerState` followed by `bootstrapSession(true)` makes A's result page display success from B. Preserve B and report A as superseded; do not infer originating-operation success from the presence of any admitted session. Retain valid current OAuth returning-user/onboarding full-navigation flows, bounded recovery and no automatic mutation replay. Add actual-component deferred-confirmation and deferred-refresh regressions plus real two-tab delayed OAuth confirmation/new-login-B browser coverage on all four supported projects; register cases in `scripts/auth-transition-cases.json` and update verified handoff evidence per FR-002/FR-004/FR-009/FR-012/FR-015, US3/AC1, SC-002/SC-004 and T056 (partial).


## Phase 23: Convergence

**Assessment (2026-10-08):** The Phase22 implementation pass ran against all204 browser cases:203 passed; B11 on Chromium without Web Locks failed while establishing login B, before cookie deletion. A read-only production-module reproduction confirmed a source-level interleaving: pause bootstrap A's CSRF/refresh, complete B's login response, commit B's pending-intent clear while the selector still carries tag A, then deliver/admit refresh A before B's selector synchronization. B subsequently reports SUPERSEDED although the selector chooses B and B is not admitted. This assessment checked the same46 requirement/acceptance items,12 plan groups and five constitution principles; T113–T114 remain awaiting final validation, and their implemented fixes are not duplicated as new tasks. Only this section is appended.

- [X] T115 HIGH — Preserve B's local-login admission fence through selector synchronization in `apps/web/src/features/identity-access/session/refresh-coordinator.ts`. `loginLocal` currently clears its pending intent before `observeServerState` installs B's tag/revision, allowing an older refresh A with the reservation's revision to synchronize/admit A in that gap; A increments the local admission version and causes B's final adoption to reject as SUPERSEDED despite successful server acceptance of B. Install B's scoped selector authority before releasing its pending fence, or use an equivalent atomic transition, so old A cannot become admissible between those steps. Preserve attempt CAS, newer-session protection, strict refresh rotation and zero automatic mutation replay. Add deterministic delayed pending-clear/old-refresh regressions in `apps/web/tests/identity-access/auth-transition-session.test.tsx`, register the required case in `scripts/auth-transition-cases.json`, and reproduce the overlap with real HTTP/IndexedDB/cookies and reload/renew on all four supported browser projects. Rerun B11 and the affected transition/quality gates and update verified handoff evidence per FR-003/FR-012/FR-013, US1/AC1–3, SC-001/SC-003 and plan: F2 intent execution/shared-selector admission; T109 (partial).


## Phase 24: Convergence

**Assessment (2026-10-08):** The implemented T113-T115 fixes remain awaiting final validation; the Phase23 auth-transition run was deliberately interrupted after a new backend gap was reproduced in a disposable PostgreSQL schema. A successful outcome lookup co-presenting two binding groups merged auth_context group membership without moving the losing group's ledger rows. Seven unresolved names became orphaned from current group accounting, and a subsequent provision accepted a new emission despite combined capacity already being exhausted. The reproduction uses production services/PostgreSQL and prints only booleans/counts, not credentials. Checked the same46 requirement/acceptance items,12 plan groups and five constitution principles. This assessment only appends a task.

- [X] T116 CRITICAL - Make auth-intent outcome lookup genuinely read-only in `apps/api/src/modules/identity-access/context/auth-intent.service.ts` and `auth-context.service.ts`. The current `outcome` calls `bind`, whose `lockGroups` updates group membership and whose activity path updates last_seen_at; outcome deliberately skips ledger settlement, leaving unresolved rows in the former group and allowing future emissions to bypass the combined cap. Verify and lock the requested bound context for a consistent receipt without changing context/group/activity/ledger state, acknowledging cookies, releasing capacity or emitting Set-Cookie. Retain atomic context-plus-ledger group merging for mutating auth operations and the Context-first/ledger-last lock hierarchy. Add production PostgreSQL and HTTP-contract regressions for co-present groups, hidden unresolved emissions, valid/expired/missing receipts, unchanged activity/group/ledger snapshots, subsequent CAPACITY_EXHAUSTED rejection, and normal mutating group merge. Register required cases in `scripts/auth-transition-cases.json`; rerun affected contract/integration and actual-browser outcome/capacity/recovery evidence on all four supported projects, IAM compatibility and quality gates, then update verified handoff evidence per FR-005/FR-006/FR-013, US2/AC2-4/9, SC-002/SC-006 and plan: read-only reconciliation, group-observed emission accounting and L-proof; T009/T044 (contradicts).
