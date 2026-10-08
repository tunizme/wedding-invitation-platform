# Quickstart Validation: IAM Auth Transition Reliability (CSP-1)

## Purpose

Guide này là acceptance/run guide cho implementation CSP-1 hiện có. Nó không thay thế [HTTP contract](contracts/auth-context.openapi.yaml), [browser-state contract](contracts/browser-state.md), [handoff](contracts/frontend-handoff.md) hoặc [data model](data-model.md). Runner hỗ trợ cumulative setup/foundation/US1/US2/US3/US4/all; chỉ evidence của checkpoint đã chạy thành công mới được claim PASS. Kết quả và phạm vi đã verify ở [validation-results.md](validation-results.md).

Contract hiện hành là `auth-context.openapi.yaml`; `contracts/auth-transitions.md` từ planning được giữ làm lịch sử, không phải contract của implementation CSP-1 này.

## Prerequisites

- Prerequisites của [003 quickstart](../003-identity-access-management/quickstart.md): Node 24, pinned pnpm, Docker Compose v2, PostgreSQL test riêng qua `IAM_TEST_DATABASE_URL`.
- Playwright đã có trong `apps/web`; cài browser engines Chromium, Firefox, WebKit bằng lệnh Playwright hiện có của project (không thêm dependency mới).
- Không cần provider credentials: OAuth browser cases dùng test-only adapter injection (R08). Real-provider staging check của 003 vẫn là evidence riêng.
- Production-like cookie checks (`__Host-`/`__Secure-`) cần HTTPS sibling domains cùng site, như 003.

### Linux browser execution

Runner nhận diện cả pnpm JavaScript entry và executable native trên Linux/Windows. Khi host thiếu thư viện WebKit (ví dụ Fedora), có thể dùng server Playwright Docker cùng version với client. Máy nhà đã có image `wedding-builder-playwright:1.63.0`:

```bash
docker run --rm --network host --init --shm-size=1g \
  wedding-builder-playwright:1.63.0 run-server \
  --host 127.0.0.1 --port 33100 --path /auth-transition
```

Trong terminal khác, đặt `AUTH_TRANSITION_BROWSER_WS=ws://127.0.0.1:33100/auth-transition` cùng `IAM_TEST_DATABASE_URL` khi chạy checkpoint. Bốn project vẫn chạy đủ: Chromium, Firefox, WebKit, Chromium không Web Locks. Server Docker có thể giữ chạy để reuse giữa các lượt; chỉ dừng khi không còn cần. Các API test dùng chung một schema trong mỗi lượt phải chạy với `--maxWorkers=1`.

`configureApplication()` cho test harness dùng cùng middleware/CORS/validation với production. Khi chạy harness từ CLI, Nest shutdown hooks đóng application; signal handler của harness chỉ đóng provider để không đóng pool PostgreSQL hai lần.

### Reuse a warm local test server

Local preference: keep the 006 API/web and Playwright server running between development test runs. The current background supervisor PID is saved in `.artifacts/auth-transition/persistent-server.pid`; its startup log is `.artifacts/auth-transition/persistent-server.log`. Connection settings live in ignored `.artifacts/auth-transition/persistent.env`, outside committed configuration.

```bash
pnpm validate:auth-transition:reuse --phase US1
```

This runs the normal fixed-inventory checkpoint against the existing API/web/browser server. Unit/API integration checks still get their normal isolation; each browser test gets a fresh context and unique fixture users. The delivery proxy starts and stops with the browser suite. The shared warm schema retains fixture data across runs and is dropped only when its owning supervisor exits. Use one browser run at a time because the proxy port and rate-limit reset endpoint are shared.

Web changes reload through Next dev. Restart the warm stack after backend or migration changes so browser tests execute current code. Stop the supervisor gracefully (SIGINT to the PID in the PID file), allowing its owned API/web processes to exit and its owned schema to be dropped. Keep `wedding-auth-transition-browser` for reuse; `docker stop wedding-auth-transition-browser` stops it when desired, and `docker start wedding-auth-transition-browser` resumes it. This browser container uses `unless-stopped`; API/web background processes persist for the current machine session and do not auto-start after a reboot.

To start a new warm stack, run `IAM_TEST_DATABASE_URL=... AUTH_TRANSITION_WITH_WEB=1 node scripts/auth-transition-stack.mjs` in a long-lived terminal or background supervisor. Start the browser server with the Docker command above (reuse the named container if it exists). Set the six connection variables shown in `.artifacts/auth-transition/persistent.env` to match the selected ports. The original `pnpm validate:auth-transition` command continues to own a fresh temporary stack unless external connection variables are supplied.

## Baseline regression (003 không đổi)

```bash
POSTGRES_PORT=55432 pnpm infra:up
pnpm build:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local \
  node apps/api/scripts/with-test-iam.cjs pnpm validate:iam --phase all
```

Expected: toàn bộ 003 gates pass, trừ những assertion 003 bị CSP-1 thay đổi có chủ đích. Mỗi assertion bị đổi (singleton `wedding_rt`, `AccessSession` shape, logout-all/password clear cookie) phải được cập nhật trong cùng task, có trace tới FR của 006; không xóa assertion để làm pass.

## Migration lifecycle

```bash
pnpm --filter @wedding/api migration:run
pnpm --filter @wedding/api migration:show
```

Expected: migration 006 tạo `auth_contexts`, `auth_intents`, `auth_cookie_names` và các column trong [data model](data-model.md#column-bổ-sung-trên-existing003-tables); re-run không drift; `down` chỉ chạy trong schema test `iam_test_<hex>` (giống 003). `synchronize`/`migrationsRun` vẫn false.

## Implemented cumulative phase runner

| Phase | Command | Budget | Nội dung bổ sung vào các phase trước |
| --- | --- | --- | --- |
| setup | `pnpm validate:auth-transition --phase setup` | ≤5 phút | OpenAPI, proxy/runner/stack self-tests và browser suite self-check |
| foundation | `pnpm validate:auth-transition --phase foundation` | ≤10 phút | PostgreSQL schema/context/lock/harness tests, selector/transport unit và IDB browser tests |
| US1 | `pnpm validate:auth-transition --phase US1` | ≤20 phút | Session transition contracts/integration và delayed-cookie/no-Web-Locks browser cases |
| US2 | `pnpm validate:auth-transition --phase US2` | ≤20 phút | Outcome/capacity contracts, recovery unit và uncertainty/storage/pressure browser cases |
| US3 | `pnpm validate:auth-transition --phase US3` | ≤20 phút | OAuth/onboarding contract/integration và full-navigation browser cases |
| US4 | `pnpm validate:auth-transition --phase US4` | ≤15 phút | Cutover/rollback integration, browser cutover và renewal unit |
| all | `pnpm validate:auth-transition --phase all` | ≤60 phút | Retention/secret hygiene, A5 browser measurement và root format/lint/typecheck/test/build/scope checks |

Budgets lấy từ `scripts/auth-transition-validate.mjs`: setup300s, foundation600s, US1/US2/US3 mỗi1200s, US4 900s, all3600s; mỗi budget gồm30s cleanup reserve. Đây là cumulative checkpoints: US3 chạy setup→US3, không chỉ riêng OAuth. `contract`, `browser`, `compat` không phải supported phase selectors.

Full003/IAM compatibility vẫn là invocation riêng trong [baseline regression](#baseline-regression-003-không-đổi): `pnpm validate:iam --phase all`. Health là check riêng `pnpm health` với `WEB_PORT`/`API_PORT` của stack đang chạy; auth-transition all không tự claim IAM toàn bộ hoặc health PASS.

Runner phải fail khi thiếu engine/suite/case trong registry cố định hoặc cleanup fail; không skipped PASS, không `passWithNoTests`. Runner chỉ drop schema và dừng proxy/process group do chính nó tạo; external warm API/web/browser server được giữ chạy.

`scripts/auth-transition-cases.json` giữ inventory tên case cố định; browser case phải có đủ bốn project. Mỗi run tạo `.artifacts/auth-transition/run-*` và reports chỉ chứa file, tên case, project, trạng thái; không serialize credentials, lỗi hoặc attachments. Exit code0 chưa đủ: thiếu case/project, skipped/todo/interrupted/failed, suite rỗng hoặc report chưa complete đều fail. Deadline/cancellation áp dụng cả startup, migration, readiness và test process; cleanup phải xác nhận process tree đã thoát trong reserve.

## Contract validation evidence

```bash
node --test --test-isolation=none --test-timeout=30000 apps/api/scripts/validate-iam-contract.cjs
```

Evidence T001 (2026-10-07, Node 24.21.0): 21/21 pass — 14 check 003 không đổi + 7 check 006 (OpenAPI 3.1 validate, mọi schema compile, `AccessSession` đầy đủ được chấp nhận và thiếu `authProtocol`/`sessionTag`/`contextRevision` bị từ chối, `ReserveIntentRequest` từ chối field lạ, `EmptyRequest` từ chối property). Đây là design validation, chưa phải runtime evidence. Latest contract validation có22/22 cases: thêm LOGOUT `expectedSessionTag` presence check (omitted bị reject, explicit `null` được chấp nhận). HTTP/runtime evidence vẫn phải lấy từ checkpoints, không suy từ schema PASS.

## Contract acceptance checks (covered by cumulative checkpoints)

1. OpenAPI `contracts/auth-context.openapi.yaml` parse và validate (cùng validator stack của 003).
2. Provisioning: tạo PROVISIONAL, cookie provisional đúng attributes; confirm với cookie duplicate/missing/sai value bị từ chối; confirm đúng → ACTIVE, `confirmed_seq` được gán.
3. Reserve: `expectedRevision` sai → `STALE_REVISION` không đổi state; đúng → revision+1, intent cũ SUPERSEDED.
4. Execute: login/onboarding/OAuth final commit với intent superseded hoặc revision lệch → `SUPERSEDED`, không session, không cookie.
5. Refresh: tag lệch → `SUPERSEDED` không rotate; slot missing/duplicate → `CREDENTIAL_MISSING`; consumed value trong current slot → REFRESH_REUSE revoke family; historical slot của session khác không được parse.
6. Logout-all và `/me/password`: revoke theo 003 và chỉ clear slot của JWT `sid`.
7. Capacity: tạo đủ `CAP_NAMES` unresolved names → mọi emission tạo name mới bị `CAPACITY_EXHAUSTED` trước khi emit; TTL trôi qua, intent terminal và outcome probe không release; trình đúng value thì ack; quan sát absent sau ack thì release.
8. Group: provisioning có binding cũ co-present join group cũ; request trình bindings của hai group thì merge; IDB-only reset không tạo group mới.
9. Lock hierarchy: chạy song song login, refresh, logout-all, password change và OAuth final commit trên cùng user/context → không deadlock; serialization retry vẫn giữ security semantics.
10. Outcome lookup: read-only, không Set-Cookie, không credential trong body; intent không tồn tại → 404.
11. Log inspection: không binding secret, refresh value, CSRF, proof, password hoặc cookie value trong logs.

## Browser acceptance matrix (covered by cumulative checkpoints)

Chạy trên Chromium, Firefox, WebKit, cộng một variant Chromium với Web Locks bị tắt. **Mọi case bắt đầu với cookie jar và IndexedDB trống**; không pre-seed cookie để che initialization gaps. Delivery proxy là owned loopback reverse proxy giữ response headers **sau** upstream commit thật, release theo lệnh (R08). Không dùng `route.fulfill` hoặc API request context thay cho browser cookie delivery/reload/renew evidence; negative callback status checks có thể dùng request context chia sẻ cùng cookie jar.

| ID | Scenario | Expected |
| --- | --- | --- |
| B1 | Hai tab cùng provision; giữ response tab 1, tab 2 select và login B, rồi release tab 1 | Selector và server current vẫn B qua reload/renew (US1.3, P01-a) |
| B2 | Refresh A committed và bị giữ; login B confirmed; release A; reload | Account B; slot A có thể install nhưng không được dùng (US1.1, P02-a) |
| B3 | Logout A bị giữ; login B; release | B còn session; không claim remote logout A nếu chưa confirmed (US1.2) |
| B4 | Password change/onboarding completion của context cũ pending; login mới hoàn tất | Session mới không bị clear/replace; revocation 003 áp đúng account (US1.4) |
| B5 | Lặp lại B1–B3 không có Web Locks | Guarantees giữ nguyên (US1.5, FR-008) |
| B6 | Timeout trước dispatch, sau dispatch, sau commit; body parse failure sau headers | `NOT_DISPATCHED`/`UNCERTAIN` đúng; không auto replay; recovery kết thúc trong 30s (US2.1–2, US2.6) |
| B7 | Đóng tab khi request pending; mở lại | Xác định current context qua outcome probe hoặc recovery state; không restore A (US2.4) |
| B8 | Xóa IndexedDB lúc verification và lúc đang SELECTED; tab cũ giữ cached context | Private admission end; không restore từ cookie; fresh login tạo isolated context (US2.7) |
| B9 | IndexedDB không mở được, server healthy | Public experience còn; recovery có next action trong deadline; khôi phục storage rồi fresh login thành công (US2.8) |
| B10 | Làm đầy capacity bằng held responses; thử login mới và IDB reset | `CAPACITY_EXHAUSTED` trước dispatch; reset không bypass; headers tới sau cleanup không vượt cap (US2.9, C2) |
| B11 | Xóa current slot cookie, giữ stale slots | `CREDENTIAL_MISSING`, không fallback account cũ (US2.10) |
| B12 | OAuth callback cũ tới sau login B hoặc sau logout; current callback returning user và first-time onboarding; state invalid/reused | Không overwrite/admit account cũ; current journeys hoàn tất; invalid state bị reject (US3) |
| B13 | Late reserve A sau reserve OAuth B, trước callback B | Callback B thành công; A không supersede B (R10 refinement 3) |
| B14 | Cutover: legacy session → fresh login; giữ legacy refresh response trong flight rồi release | Một lần đăng nhập lại; response legacy không ảnh hưởng session mới; không legacy fallback (US4.4) |
| B15 | Hai tab cùng context đã SELECTED, không có session; tab 1 bắt đầu login A (giữ response reserve), tab 2 login B hoàn tất; release reserve/execute của A | Current account là B qua reload/renew; A nhận `STALE_REVISION`/`SUPERSEDED`, không retry thành intent mới (US1.3, P01-b) |

Mỗi case kiểm actual API principal sau reload/renew, không chỉ store state. Artifacts không chứa token, cookie value, proof, HAR, trace hoặc screenshot có secret.

## A5 — cookie limit verification

Checkpoint `all` chạy A5 trên cả bốn browser projects: bulk-set250 synthetic cookies và đo số còn trong cookie store/số browser gửi, tăng Cookie header trên health route, rồi đo credentialed `POST /auth/contexts` protocol2 từ frontend Origin thật qua CORS. Ghi số đo theo engine/version; đây là sampled retention/header evidence, không universal quota guarantee hoặc kiểm chứng absolute cookie retention. Health route có thể quan sát431 trực tiếp; actual cross-origin route có thể chỉ trả network/CORS-hidden status0, không được ghi thành observed431. Nếu sampled WebKit retention <50 thì review giảm `CAP_NAMES` theo công thức trong [research R12](research.md#proposed-numeric-bounds-planning-values-chưa-runtime-verified); kết quả lớn hơn không tự tăng protocol caps8 names/2048bytes.

## Production-like cookie deployment-shape checks

Run against HTTPS frontend/API sibling hosts under the same site, with production cookie configuration enabled. Complete one explicit context provision/confirm and one login, then inspect response headers and browser storage:

- Binding names use `__Host-wa_cb_<context-id>` with `Path=/`; session names use `__Secure-wa_s_<tag>` with `Path=/api/v1/auth`. Both are `Secure`, `HttpOnly`, `SameSite=Lax`, and have no `Domain` attribute.
- The browser stores the binding and session cookies as host-only cookies on the API host. They do not appear in `document.cookie`, localStorage, sessionStorage, or IndexedDB.
- Confirm re-emits the same binding value with the confirmed lifetime; login/refresh set only the intended slot, and cleanup clears only eligible retired slots/bindings.

Record browser engine/version and the inspected cookie attributes in `validation-results.md`; do not paste cookie values into evidence.

## Compatibility và cutover acceptance checks

1. 003 regression (xem baseline).
2. Legacy routes sau cutover: thiếu `X-Auth-Context` → 401 và chỉ clear `wedding_rt`.
3. OAuth transaction pre-cutover → callback fail path, không session.
4. Rollback drill trong schema test: revoke sessions có `context_id`; re-cutover → `CREDENTIAL_MISSING` → recovery. Production runbook, exact command and session-loss impact: [IAM operations — CSP-1 auth cutover rollback](../../../docs/iam-operations.md#csp-1-auth-cutover-rollback). Stop all API traffic/admission first and retain the additive 006 schema.
5. `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm scope:check`, `pnpm health`.

## Cleanup

```bash
pnpm infra:down
```

Runner tự drop schema riêng và dừng owned proxy/API/web processes. Warm external servers/browser container được giữ chạy. `infra:down` chỉ dùng khi muốn dừng hạ tầng dùng chung, không cần giữa các lượt test; không xóa PostgreSQL volume.

## Handoff evidence

Sau khi `--phase all` pass, ghi `validation-results.md` cho 006: browser/version, kết quả B1–B15 theo engine, giá trị A5, chi phí cutover. Gửi [frontend handoff](contracts/frontend-handoff.md) cho 005 re-analysis. Mock-only hoặc store-only evidence không đóng required cases (SC-007).
