# Tasks: Frontend Foundation & Reliability

**Input**: `specs/005-frontend-foundation-reliability/` — [spec](spec.md), [plan](plan.md), [research](research.md), [data model](data-model.md), [quickstart](quickstart.md), [contracts](contracts/session-boundaries.md).

**Branch**: `master`; feature identity `005-frontend-foundation-reliability`.

**Status**: In progress — full prototype mapping and improved Admin authoring approved 2026-10-11. Historical T001–T101 checkpoint FULL PASS at `run-XjtXMT`; new T102–T114 require their own visual and functional acceptance.

**Tests**: Spec explicitly yêu cầu independent tests, viewport/keyboard verification và measurable SC-001–009; tasks gồm regression tests chứng minh các outcomes này. Viết regression cases trước fix; chỉ yêu cầu failing reproduction khi current behavior thật sự sai, không fabricate failure cho static risk hoặc rewrite existing passing tests.

## Format / Path Conventions

`- [ ] Tnnn [P?] [USn?] Action with exact file paths`.

- `[P]` chỉ tasks khác files, có thể làm song song **sau dependencies đã hoàn tất**; không có nghĩa ignore prerequisites hoặc approval.
- Paths relative repository root. Existing source paths có thể relocate dưới `(product)` ở T029; sau đó update import paths theo new ownership nhưng giữ URLs/params/behavior.
- New paths trong tasks là future outputs, không instructions tạo empty placeholders. Không new application/backend contracts, DTO fields, migrations, styling framework, Customer design controls hoặc deployment.
- Mỗi task có FR/SC trace. Audit references chính: F01→US1, F02/F11→US2, F05 foundations→US3, F10→US4; F14 chỉ adopted feedback. Deferred findings theo spec, không mark resolved.

## Approval / Analysis Gates

**B01 — APPROVED (2026-10-06).** Project owner chấp thuận component alias `--color-control-border: var(--color-primary)` cho enabled platform inputs khi border là sole meaningful boundary. MASTER và downstream docs đã đồng bộ; T035 documentation task complete, evidence tại [verification](verification.md#b01--design-approval). Baseline border/white/height/radius/type/focus giữ theo approved scope. Runtime contrast/state evidence vẫn required ở T036/T037/T047/T060; không waive bằng label/focus ring.

B01 resolution does not waive analysis.006 prerequisite has final verified evidence (`run-Lt4lxU`, browser208/208; IAM all PASS). T001 must align005 consumers/compatibility with actual006 subscribe/snapshot/end-admission APIs, immutable slots/server intent/IDB refresh lease and original-session clear semantics, then re-run analysis.005 adds no coordinator/backend/migration. Unresolved mandatory/CRITICAL/HIGH findings still block code;005 private-state acceptance is separate.

T001 U1-B feasibility research và T035 B01 resolution là governance/documentation work MAY thực hiện trước application implementation entry; U1-A policy đã chốt không thay required reviewed outcomes/evidence của U1-B. T035 là governance/documentation resolution: MAY hoàn tất ngay khi nhận explicit approval, trước T001 hoặc các phases application code; vị trí trong US3 thể hiện requirement ownership, không buộc làm code US1/US2 trước mới xử lý blocker. Sau resolution phải re-run analysis gate. Không lấy task generation hoặc elapsed time làm approval.

## Phase 1: Setup — Existing Project / Evidence Baseline

**Goal**: Xác nhận authority, contract source và verification prerequisites; không khởi tạo lại project.

- [x] T001 Review checklist/analysis và U1-B capability gaps trong `specs/005-frontend-foundation-reliability/research.md` + `contracts/session-boundaries.md`; review completed/verified `specs/006-iam-auth-transition-reliability/spec.md` feature handoff cho authoritative context, bounded recovery và late cookie effects. Ghi dependency/contract/evidence status trong `verification.md`; nếu handoff chưa đủ giữ BLOCKED, không mark complete bằng spec approval. Đồng bộ actual consumers/compatibility/task prerequisites rồi re-run 005 analysis trước code. Governance/docs work được phép trước application gate; không tự authorize backend/code/migrations hoặc waive required scenarios. (FR-001–005, FR-024, FR-025; SC-001–003, SC-009)
- [x] T002 Lập acceptance manifest trong `specs/005-frontend-foundation-reliability/verification.md`: map FR-001–025/SC-001–009 tới task IDs, selected audit findings, ten adopted URLs và six viewport cases; ghi baseline revision/dirty state và deferred findings. (FR-024, FR-025; SC-009)
- [x] T003 Recheck tooling/config và installed Next CSS/font/layout/output docs theo `apps/web/AGENTS.md`; xác nhận Node24/pnpm12.3.4/Playwright1.63.0 và CSS Modules/native dialog approach trong `specs/005-frontend-foundation-reliability/quickstart.md`, không install alternate frameworks. (FR-006, FR-008, FR-025)
- [x] T004 Đối chiếu actual IAM/invitation/assets/publication controllers/DTOs và clients với `specs/005-frontend-foundation-reliability/contracts/compatibility.md`; record missing capability bằng BLOCKED, giữ Customer data-only/authorization/CAS/idempotency và no new API. (FR-005, FR-014, FR-020–024)
- [x] T005 Chốt executable acceptance registry/staging và disposable test setup trong `specs/005-frontend-foundation-reliability/quickstart.md`: explicit test env, owned resources, budgets10/20/15/45min,30s cleanup reserve, no skipped required suites; chạy bounded preflight và lưu sanitized result trong `specs/005-frontend-foundation-reliability/verification.md`. (FR-024, FR-025; SC-009)

**Checkpoint**: `timeout 60s pnpm scope:check` và documentation/contract review; read-only, không provision resources. Approval/analysis state phải truthful trước Phase2.

## Phase 2: Foundational — Verification Infrastructure

**Goal**: Tooling cho independent stories; application-specific tests/fixtures giữ ở owning apps.

- [x] T006 Tạo `scripts/frontend-validate.mjs` + root `package.json` script `validate:frontend`: selectors unit/browser/package/all, optional `--through US1|US2|US3|US4` cho non-all phases, fixed dependency-closure manifests/test-case filtering, full coverage mặc định, explicit PARTIAL reports và all reject through; strict missing-suite fail, budgets/cleanup/reuse builder `withOwnedResources`/`freePort`, no root business logic/reset. Package-through-US1 fail before provisioning. (FR-024, FR-025; SC-009)
- [x] T007 Tạo fixture extension trong `apps/api/test/fixtures/invitation-builder/frontend-seed.spec.ts` và `apps/api/test/fixtures/invitation-builder/frontend-seed.config.ts`, reuse existing fixture helpers để seed disposable Customer A/B/Admin A/B/private resources/published scene; registry trong `scripts/frontend-validate.mjs` chạy existing migrations trên owned schema, no backend business/schema changes, no secrets/private seed in reports. (FR-001–008, FR-020–023)
- [x] T008 Tạo `apps/web/playwright.frontend.config.ts` và `apps/web/e2e/frontend-foundation/helpers.ts`: dedicated testDir, explicit runner URLs/seed ownership, locale/timezone, retries0/worker1/test≤30s, Chromium/Firefox/WebKit critical matrix, owned browser contexts và safe delayed-response/peer-transition helpers; giữ existing builder config. (FR-016, FR-019, FR-024)
- [x] T009 Thêm tests cho selector grammar/default full coverage/fixed through-closure/PARTIAL report/all+through rejection/package-through-US1 rejection, missing files/cases, prerequisites/timeouts/signals/cleanup/no-secret reports trong `scripts/tests/frontend-validate.test.mjs`; run foundational gate và record evidence trong `specs/005-frontend-foundation-reliability/verification.md`. (FR-024, FR-025; SC-009)

**Checkpoint**: `timeout 300s node --test scripts/tests/frontend-validate.test.mjs`. Runner self-tests dùng fakes/owned scratch, không shared infra. Phases dùng resource thật chỉ run sau required suites có mặt. `all` MUST giữ complete acceptance registry, không được PASS khi stories chưa có suites.

## Phase 3: US1 — Dữ liệu riêng đúng người dùng hiện tại (P1 / MVP)

**Goal**: Zero cross-account private state/retries/continuations, valid edits không mất khi token renewal.

**Independent test**: Account A→B cùng role và A→B→A khi list/form/mutations pending; B reload fail; logout/login; renewal cùng principal/resource. Không old records/draft/status/assets/pages/navigation hoặc request replay với B, renewal giữ local edits.

### Regression Tests

- [x] T010 [P] [US1] Extend `apps/web/tests/identity-access/session.test.tsx` cho stable identity epoch/null/context-tag transitions và same-owner renewal. Reuse verified006 transition/admission/outcome regressions; add005 private lifetime assertions without replacing actual-cookie evidence. Preserve NOT_DISPATCHED/COMPLETED/UNCERTAIN and no uncertain replay. (FR-001–003, FR-005; SC-001–002)
- [x] T011 [P] [US1] Extend `apps/web/tests/invitation-builder/client.test.ts` và thêm `apps/web/tests/identity-access/request-scope.test.ts` cho stale401, same-owner single retry, captured operation scope/body parsing, cancellation + timeout, no A payload retry với B; preserve path/security contracts. (FR-002, FR-003, FR-005)
- [x] T012 [P] [US1] Tạo `apps/web/e2e/frontend-foundation/principal-isolation.spec.ts` cho real account/peer/logout/A→B→A/delayed private data/drafts/renewal và auth-cookie races refresh A pending→login B/logout A pending→login B/stale login-onboarding/password completion; subsequent reload/renew kiểm actual current session/cookie behavior theo U1 policy, include Admin/Customer và request/navigation assertions. Thêm actual-browser006 refresh lease/intent contention/queued cancellation, timeout trước/sau dispatch, tab close, no-Web-Locks và OAuth callback gần auth writers; unresolved required boundary phải BLOCKED, không skip để PASS. (FR-001–003, FR-005; SC-001–002)

### Implementation

- [x] T013 [US1] Implement consistent frontend identity epoch trong `apps/web/src/features/identity-access/session/store.ts`: increment account/role/status/null/admitted context/sessionTag transitions, stable token/profile renewal, preserve existing subscribe/get consumers và no backend DTO field. (FR-001, FR-003)
- [x] T014 [US1] Tạo `apps/web/src/features/identity-access/session/operation-scope.ts` cho captured principal/resource lifetime, generation/admission và combined timeout/cancellation; cleanup hooks hỗ trợ dirty/blob/timers, no token key/persistence. Depends T013. (FR-001–003, FR-005)
- [x] T015 [US1] Integrate verified006 auth-transition coordinator in `apps/web/src/features/identity-access/session/refresh-coordinator.ts` with005 captured principal/resource operation fences before dispatch, refresh/retry, parsed result/error and caller continuation. Preserve server-authoritative context/intent, immutable slots, transactional admission and IDB refresh lease/single-flight. Consume actual login/onboarding/OAuth integrations; no second coordinator, exclusive cookie-writer lock or refreshUnderLock ownership handle. Depends T014 and T001 verified handoff/alignment/re-analysis. (FR-002, FR-003, FR-005, FR-014)
- [x] T016 [US1] Fence builder requests/upload logical operations trong `apps/web/src/features/invitation-builder/api/client.ts`; support captured caller scope, guard before refresh/retry/return/error, combine timeout/signal và preserve allowlists/credentials/idempotency. Depends T014–015. (FR-002, FR-003, FR-005, FR-020)
- [x] T017 [US1] Scope Customer list/picker/form lifetimes trong `apps/web/src/features/invitations/customer-pages.tsx`, `apps/web/src/features/invitations/customer-invitation-form.tsx`, `apps/web/src/features/invitations/api.ts` và `apps/web/src/features/identity-access/session/navigation-guard.ts`; reset private state on identity/resource, fence save→publish→poll→reload/navigation, dispose dirty work; keep data-only/CAS/pinned design. (FR-001–003, FR-021–023)
- [x] T018 [US1] Scope profile/password mutations in `apps/web/src/features/identity-access/forms/profile-form.tsx`; preserve edits on same-context/tag renewal and prevent stale profile patch/clear/feedback in B. Consume existing006 authenticated password transport, target account-wide revocation and original-session clear semantics; parsed completion is not necessarily success, dispatched uncertainty never automatic replay. No singleton-cookie lock or parallel auth transport. Verify newer identity and meaningful re-login state through browser reload/renew. (FR-001–003, FR-005, FR-014)
- [x] T019 [US1] Scope Admin customer list/detail/filter/pagination/lock-unlock continuations trong `apps/web/src/features/identity-access/admin/customer-management.tsx`; no prior-admin records hoặc cursor/status restore on failed new load, preserve confirmation/auth semantics. (FR-001–003, FR-005, FR-014)
- [x] T020 [US1] Scope Admin template list/create/editor lifetimes trong `apps/web/src/features/invitation-builder/editor/template-pages.tsx` và `apps/web/src/features/invitation-builder/editor/template-editor.tsx`; keep same-owner edits on renewal, discard old owner/resource effects và preserve authoring tools. (FR-001–003, FR-008, FR-022)
- [x] T021 [US1] Fence save/enqueue/poll/onChanged chains và timers trong `apps/web/src/features/invitation-builder/editor/publication-controls.tsx`, truyền owner scope từ `apps/web/src/features/invitation-builder/editor/template-editor.tsx`; không start next request sau owner disposal, không redesign uncertain-publish recovery. (FR-002, FR-003, FR-007, FR-022)
- [x] T022 [US1] Fence asset search/more/upload/preview callbacks và dispose Blob URLs trong `apps/web/src/features/invitation-builder/assets/asset-library.tsx` và `apps/web/src/features/invitation-builder/assets/use-asset-preview.ts`; pages/asset selection phải thuộc same owner/query generation. (FR-001–003, FR-020)
- [x] T023 [US1] Kiểm và bổ sung epoch/operation propagation cho existing good RSVP scope trong `apps/web/src/features/invitations/rsvp-management.tsx` và `apps/web/src/features/invitations/rsvp-owner-api.ts`; extend `apps/web/tests/invitation-builder/rsvp.test.tsx`, không rewrite working semantics hoặc đổi controlVersion. (FR-001–003, FR-005)
- [x] T024 [US1] Extend scope/auth-transition regressions ở `apps/web/tests/identity-access/profile.test.tsx`, `login.test.tsx`, `social-onboarding.test.tsx`, `admin.test.tsx`, `apps/web/tests/invitation-builder/customer-form.test.tsx`, `publication-controls.test.tsx`, `asset-preview.test.tsx`; wire fixed US1 phase/through manifests và owned startup trong `scripts/frontend-validate.mjs`. Store tests không thay actual-cookie browser evidence. (FR-001–003, FR-005, FR-014, FR-024)
- [x] T025 [US1] Run unit/browser --through US1 checkpoints, complete private-state/renewal/auth-cookie reload matrix và record PARTIAL scope/command/result/cleanup/FR-SC evidence trong `specs/005-frontend-foundation-reliability/verification.md`; U1 cần real browser behavior, static risk không reproduce vẫn phải satisfied-outcome evidence. Chỉ close U1 khi reviewed required cookie boundaries/recovery có evidence đạt current contracts, actual verified 006 handoff và artifacts đồng bộ; scope/backend proposal approval alone không đủ; store-only PASS, lock release và successful refresh không đủ proof. (FR-024; SC-001–002, SC-009)

**Checkpoint**: `pnpm validate:frontend --phase unit --through US1` ≤10min; `pnpm validate:frontend --phase browser --through US1` ≤20min với fixed US1 closure. Owned process/schema/prefix cleanup theo quickstart. Early report MUST ghi partial feature coverage; không chạy/claim `all` PASS.

## Phase 4: US2 — Invitation độc lập với product session (P1)

**Goal**: Public/capture không session chrome/effects; standalone package phục vụ required faces, truthful failures.

**Independent test**: Direct anonymous và product-authenticated→same published version, isolated capture và actual standalone Docker command; all required faces load, injected font/image failure không ready/false publish.

### Regression Tests

- [x] T026 [P] [US2] Tạo `apps/web/e2e/frontend-foundation/surface-isolation.spec.ts` và `apps/web/tests/frontend-foundation/surface-boundaries.test.tsx` cho direct load/product→public→product, no email/logout/refresh/peer/dirty effects và preserved product auth/navigation/unavailable visibility. (FR-004, FR-005, FR-008; SC-003)
- [x] T027 [P] [US2] Tạo `apps/web/e2e/frontend-foundation/packaged-fonts.spec.ts` và `scripts/tests/frontend-package.test.mjs` cho manifest/all16 invitation WOFF2 bytes/hash/MIME + face-specific Vietnamese/Latin/400/700/normal/italic ready, actual standalone/no source mount và blocked face/image failure. (FR-006–008; SC-004)

### Implementation

- [x] T028 [US2] Chuyển channel/listeners/navigation guard sang explicit provider lifecycle trong `apps/web/src/features/identity-access/session/refresh-coordinator.ts` và `apps/web/src/features/identity-access/session/session-provider.tsx`; start/stop idempotent, no module-level session effects, pending work lifecycle fence; không logout do public navigation. Depends US1 coordinator fences. (FR-004, FR-005)
- [x] T029 [US2] Minimal root `apps/web/src/app/layout.tsx`, thêm `apps/web/src/app/(product)/layout.tsx`, relocate existing product pages + `(auth)` group dưới `(product)` và fix relative imports; giữ `apps/web/src/app/i/[slug]/page.tsx`, `apps/web/src/app/internal/invitation-renderer/page.tsx`, `apps/web/src/app/api/health/route.ts` ngoài product. Assert tất cả existing URLs/params/redirects giữ nguyên, không redesign root page. (FR-004, FR-005, FR-008)
- [x] T030 [US2] Thêm public copy trong runner stage `apps/web/Dockerfile` cạnh standalone server; giữ `.next/static`, existing manifest/files/hash/licenses, không sửa renderer fallback/IDs hoặc deploy. (FR-006, FR-008)
- [x] T031 [US2] Implement actual Docker standalone package lifecycle trong `scripts/frontend-validate.mjs`: root-context image build, owned tag/container/free port/API config, static inventory/browser execution, bounded build/start/readiness và owned container/tag cleanup; no developer source mounts/cache prune. Depends T027/T030. (FR-006, FR-024; SC-004)
- [x] T032 [US2] Register/reuse font-readiness/asset-failure/renderer-fit và API publication-races evidence trong `scripts/frontend-validate.mjs`, extend `apps/web/e2e/frontend-foundation/packaged-fonts.spec.ts` để validate old published snapshot remains sau actual font/image failure; không đổi backend readiness/business rules để PASS. (FR-007, FR-008; SC-004)
- [x] T033 [US2] Register isolation/package suites trong `scripts/frontend-validate.mjs`, update package run prerequisites/evidence trong `specs/005-frontend-foundation-reliability/quickstart.md`; differentiate `next start` regression và production image evidence. (FR-024, FR-025)
- [x] T034 [US2] Run browser/package --through US2 checkpoints và relevant existing builder US4≤25min, record explicit PARTIAL coverage/same-version/no-chrome/font/readiness/failure/cleanup trong `specs/005-frontend-foundation-reliability/verification.md`; package stage chưa require future platform-font assertions. (FR-004–008, FR-024; SC-003–004)

**Checkpoint**: `pnpm validate:frontend --phase browser --through US2`, `pnpm validate:frontend --phase package --through US2`, `pnpm validate:builder --story US4`. Package covers existing invitation fonts lúc này; T039/T046 bổ sung platform-font checks sau adoption, không claim chúng đã có.

## Phase 5: US3 — Account screens cùng platform language (P2)

**Goal**: Ten URLs FR-011 dùng foundations đúng MASTER, giữ journeys/contracts, keyboard/mobile/feedback usable.

**Independent test**: Complete existing account/Admin customer journeys tại six widths/keyboard/200% text zoom, all control states/errors/milestones; same template scene không bị platform typography/geometry pollution.

### Approval Gate

- [x] T035 [US3] **B01 approved, documentation complete 2026-10-06**: đã ghi explicit approval và narrow input-boundary rule vào `docs/design/MASTER.md`, đồng bộ `specs/005-frontend-foundation-reliability/plan.md`, `research.md`, `contracts/platform-ui.md` và approval evidence trong `verification.md`. Hoàn tất documentation scope; runtime contrast/state acceptance thuộc các verification tasks còn unchecked. (FR-017, FR-025; SC-005–006)

### Regression Tests

- [x] T036 [P] [US3] Tạo `apps/web/tests/frontend-foundation/platform-controls.test.tsx` cho visible labels/helper/errors/native semantics/ref forwarding/default-hover-focus-disabled-busy/status/live feedback; contrast mapping theo actual approved B01 outcome, no fabricated server field details. (FR-009, FR-010, FR-012, FR-013, FR-017, FR-018)
- [x] T037 [P] [US3] Tạo `apps/web/e2e/frontend-foundation/account-journeys.spec.ts` + `apps/web/e2e/frontend-foundation/template-style-isolation.spec.ts` cho ten URLs, six widths/keyboard/reduced-motion/long Vietnamese/field-general errors/milestones và computed template font/palette/geometry invariance. (FR-008–018; SC-005–006)

### Implementation

- [x] T038 [US3] Tạo `apps/web/src/ui/platform/tokens.css` và `apps/web/src/ui/platform/platform-page.module.css`: map toàn baseline MASTER, only needed role aliases, scoped containers/density/focus/reduced motion; no global body/generic element reset hoặc alternate theme. (FR-008, FR-009, FR-015, FR-018)
- [x] T039 [US3] Vendor licensed Cormorant Garamond500 và Be Vietnam Pro400/500/600/700 normal vào `apps/web/src/ui/platform/fonts/`, thêm `manifest.json`, licenses và `apps/web/src/ui/platform/fonts.ts` dùng `next/font/local/display:swap`; record authoritative provenance/checksums/real Vietnamese-Latin coverage, no runtime/build font download, no invitation registry change. (FR-006, FR-008, FR-009)
- [x] T040 [US3] Implement `apps/web/src/ui/platform/button.tsx`, `field.tsx`, `feedback.tsx` và `controls.module.css` sau T035/T038–039; forward native semantics/refs, approved outlined control/focus/disabled/busy/validation/status/alert patterns, role-safe warning text/decorative accent, no default toast dependency. (FR-009, FR-010, FR-012, FR-013, FR-017, FR-018)
- [x] T041 [US3] Implement `apps/web/src/ui/platform/platform-page.tsx` cho sans application headings, reading/editorial widths/adaptive gutters, visible focus và logical hierarchy; typography classes chỉ platform subtrees, no inherited reset/font on canvases. Depends T038–040. (FR-008, FR-009, FR-015, FR-016)
- [x] T042 [US3] Adopt shared controls/layout trong `apps/web/src/features/identity-access/forms/login-form.tsx`, `register-form.tsx`, `social-login-buttons.tsx` và corresponding `apps/web/src/app/(product)/(auth)/login/page.tsx`, `register/page.tsx`; keep actual validation/generic messaging/social URLs/password paste/autocomplete. (FR-009–018)
- [x] T043 [US3] Adopt `apps/web/src/features/identity-access/forms/recovery-forms.tsx`, `social-onboarding-form.tsx` và `apps/web/src/app/(product)/(auth)/verify-email/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `social-onboarding/page.tsx`, `oauth-result/page.tsx`; preserve proofs/history cleanup/cookie/provider journeys và persistent success/next action. (FR-009–018)
- [x] T044 [US3] Adopt `apps/web/src/features/identity-access/forms/profile-form.tsx`, `apps/web/src/features/identity-access/admin/customer-management.tsx` và `apps/web/src/app/(product)/account/page.tsx`, `admin/customers/page.tsx`, `admin/customers/[customerId]/page.tsx`; preserve US1 scopes/typed edits, LOCAL/social/profile patch/lock-unlock confirmation/pagination, responsive semantic rows/status. (FR-009–018)
- [x] T045 [US3] Apply shared platform controls/scoped typography cho product-only chrome trong `apps/web/src/features/identity-access/session/session-provider.tsx`; accessible wrapping/keyboard focus trên mobile, no new marketplace navbar/workspace redesign và no bleed into renderer descendants. (FR-004, FR-008–010, FR-015–018)
- [x] T046 [US3] Extend account proof/profile/Admin Vitest journeys hiện có dưới `apps/web/tests/identity-access/`, register new controls/journeys/style suites trong `scripts/frontend-validate.mjs` và bổ sung platform local-font package assertions vào `apps/web/e2e/frontend-foundation/packaged-fonts.spec.ts`. (FR-006, FR-008–018, FR-024)
- [x] T047 [US3] Run unit/browser/package --through US3 gates với adopted screens, review computed contrast/token/font/style isolation/text zoom, record PARTIAL scope/approval/deviations/cleanup trong `specs/005-frontend-foundation-reliability/verification.md`; no B01 PASS khi pending. (FR-024, FR-025; SC-005–006)

**Checkpoint**: planned `pnpm validate:frontend --phase unit --through US3`≤10min, `--phase browser --through US3`≤20min và `--phase package --through US3`≤15min gates; reports PARTIAL. Text zoom actual/manual evidence với viewport/content case theo quickstart; không deviceScaleFactor substitute. Không claim entire renderer/product WCAG compliant.

## Phase 6: US4 — Admin Media Library accessible (P2)

**Goal**: Complex media task giữ editing context, complete modal lifecycle và mobile Full-screen Sheet.

**Independent test**: Open từ TemplateEditor/BindingPanel, Tab/Shift+Tab/Escape/search/upload/filter/more/select/close; trigger removed/account switch/pending upload; desktop/mobile, no background interaction/stale design mutation.

### Regression Tests

- [x] T048 [P] [US4] Tạo `apps/web/tests/frontend-foundation/modal-surface.test.tsx` cho idempotent show/close/cancel, name/initial/fallback focus wiring và cleanup; test-double cho JSDOM rõ ràng, không claim native containment/inert PASS từ unit tests. (FR-018, FR-019)
- [x] T049 [P] [US4] Tạo `apps/web/e2e/frontend-foundation/media-library.spec.ts` cho cả triggers, real native dialog focus/inert/Escape/return/select/remount, six widths/mobile, authorized query/filter/mine/upload/more/errors và stale owner/query selection suppression. (FR-016, FR-019–023; SC-007–008)

### Implementation

- [x] T050 [US4] Implement `apps/web/src/ui/platform/modal-surface.tsx`: native showModal/close/cancel lifecycle, heading/initial focus, explicit close, surviving trigger/fallback return, dispose owner work; no nested modal/custom competing trap. (FR-018, FR-019)
- [x] T051 [US4] Implement `apps/web/src/ui/platform/modal-surface.module.css`: ≥768px right Drawer widthmin720/available width, <768px100dvh Full-screen Sheet, reachable header/close, scrollable body, approved depth/radius/spacing/reduced motion; no page overflow/shrunken desktop overlay. Depends T038/T050. (FR-009, FR-016–019)
- [x] T052 [US4] Migrate `apps/web/src/features/invitation-builder/assets/asset-library.tsx` sang ModalSurface/shared approved controls, preserve US1 owner/query fences và existing search/filter/mine/pagination/upload/select/type-limit behavior/local progress-error-retry; no backend capability additions. Depends T040/T050–051. (FR-012, FR-013, FR-019, FR-020)
- [x] T053 [US4] Wire trigger refs/close/select/fallback focus tại `apps/web/src/features/invitation-builder/editor/template-editor.tsx` và `binding-panel.tsx`; không platform font inheritance vào canvas, no stale upload callback after close/owner switch, preserve Admin authoring tools. (FR-008, FR-019, FR-020, FR-022)
- [x] T054 [US4] Extend data-only restriction regressions trong `apps/web/tests/invitation-builder/customer-form.test.tsx`, `bindings.test.ts` và `apps/web/e2e/frontend-foundation/media-library.spec.ts`: no Customer Admin-library/style/layout/binding/section/crop controls/payload changes, pinned design/authored gap unchanged; timeline data order không layer reorder. (FR-021–023; SC-008)
- [x] T055 [US4] Extend existing `apps/web/tests/invitation-builder/assets.test.tsx` và `binding-panel.test.tsx`, register US4 native-browser suite và matrix trong `scripts/frontend-validate.mjs`; verify asset search/more/upload failure recovery, both entry owners và allowed Admin actions. (FR-019, FR-020, FR-022, FR-024)
- [x] T056 [US4] Run unit/browser --through US4 gates và relevant builder compatibility evidence, record PARTIAL selected-scope/lifecycle/authorization/Customer restriction/cleanup trong `specs/005-frontend-foundation-reliability/verification.md`; no JSDOM-only native/cookie claim. (FR-024; SC-007–008)

**Checkpoint**: `pnpm validate:frontend --phase unit --through US4`, `pnpm validate:frontend --phase browser --through US4`; reports PARTIAL, relevant existing builder US4≤25min report reuse nếu still matches latest changed surfaces, rerun khi new changes invalidate evidence.

## Phase 7: Polish / Cross-Cutting Verification

**Goal**: All accepted stories integrate without changing scope/business behavior; truthful final evidence.

- [x] T057 Bổ sung applicable frontend runner/contract/browser/package checks vào `.github/workflows/ci.yml` với disposable config và bounded cleanup, retain existing IAM/backend/builder checks và app independence; không deploy/publish hoặc tự bật merge protection. (FR-024, FR-025; SC-009)
- [x] T058 Finalize fixed full/through manifests, test-case filtering/dependency dedup/owned health trong `scripts/frontend-validate.mjs` và `scripts/tests/frontend-validate.test.mjs`; default phases full coverage, all≤45min reject through/require every suite-platform-font evidence, missing cases/files/timeouts/cleanup fail, no completion-state discovery downgrade hoặc cumulative IAM/builder repeat inside45min. (FR-024, FR-025; SC-009)
- [x] T059 Run `pnpm validate:frontend --phase all`≤45min, `pnpm validate:iam --phase US10`≤15min, `pnpm validate:builder --story US4`≤25min và applicable independent API checks theo `specs/005-frontend-foundation-reliability/quickstart.md`; save sanitized commands/results/cleanup/source revision trong `specs/005-frontend-foundation-reliability/verification.md`. No acceptance skip, no deployment. (FR-005–008, FR-014, FR-020–025; SC-001–009)
- [x] T060 Review complete six-width/keyboard/text-zoom200%/long-Vietnamese/reduced-motion/contrast/template isolation evidence tại `specs/005-frontend-foundation-reliability/verification.md`; record browser/viewport/manual cases và check MASTER Final Design Check, preserve B01 approval reference. (FR-008–018, FR-025; SC-005–006)
- [x] T061 Update `docs/frontend/AUDIT.md` và `specs/005-frontend-foundation-reliability/verification.md` với evidence-linked satisfied/unreproduced/deferred/blocked status cho F01/F02/F05 foundations/F10/F11 và adopted feedback; giữ out-of-scope backlog, no whole-product/release-ready claim. (FR-024, FR-025; SC-009)
- [x] T062 Đồng bộ final commands/ownership/cleanup trong `specs/005-frontend-foundation-reliability/quickstart.md`, recheck tasks trace/authority/links/format và run final `speckit-analyze`; ghi readiness trong `verification.md`, không mark unchecked tasks complete hoặc silently alter MASTER/004 contracts. (FR-024, FR-025; SC-009)

**Checkpoint**: T059 supplies bounded integration evidence; T062 documentation format/link/trace check≤60s, read-only analysis. No infra resets/volume deletion/unrelated process stops; final tests PASS không che cleanup failure.

## Dependencies / Execution Order

### Phase Graph

```text
006 verified IAM handoff → 005 artifact update/re-analysis → T001–005
                                               ↓
                                           T006–009
                                               ↓
                                             US1
                                               ↓
                                             US2
                                               ↓
                                 B01 approval → US3
                                               ↓
                                             US4
                                               ↓
                                         T057–062
```

US2 coordinator/layout integration depends US1 scope fixes. US3 adoption depends US1 reliability + US2 relocated ownership. US4 reusable controls depend US3 primitives/approved boundary; Admin media behavior independently testable sau dependencies. US4 reliability fencing ở T022 thuộc US1, visual/dialog lifecycle thuộc US4. Không che cross-story dependencies bằng label “independent”.

### Within-phase Dependencies

| Phase      | Required order                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup      | T001→T002→T003→T004→T005; approval/analysis blockers recorded before code                                                                      |
| Foundation | T006→T007→T008→T009; no browser command before fixtures/config/runner                                                                          |
| US1        | T010–012 có thể song song sau foundation; T013→T014→T015→T016; T017–023 theo IDs để tránh shared-editor conflicts; T024→T025 sau fixes         |
| US2        | T026/T027 song song sau US1; T028→T029; T030→T031; T032–034 sau associated tests/lifecycle/package work                                        |
| US3        | T035 approval trước affected implementation; T036/T037 song song sau foundation + approved expectation; T038→T039→T040→T041→T042–045→T046→T047 |
| US4        | T048/T049 song song sau shared controls; T050→T051→T052→T053→T054→T055→T056                                                                    |
| Polish     | All selected stories→T057→T058→T059→T060→T061→T062                                                                                             |

Test definition tasks precede fixes, test execution checkpoints sau tooling/dependencies/fix. Font/style assertions chỉ require platform assets sau T039; stages không skip expected files.

### Staged Verification Registry

T006 định nghĩa full manifest và fixed dependency closures US1→US2→US3→US4 từ acceptance requirements, không dựa task completion hoặc discovered files. Unit/browser/package mặc định full-phase coverage; optional --through chọn explicit closure và report coverage: PARTIAL/selected stories/required suites/missing coverage. Through US4 vẫn PARTIAL; all reject through và luôn full feature. Package-through-US1 fail trước provisioning; US2 package chỉ Noto/output, US3+ thêm platform assets. T024/T033/T046/T055 wire suites/case filters theo fixed manifests, không thu hẹp expectations để PASS. Missing required case/file fail; T058 kiểm full registry/deduplication. Unit không provision DB/Docker; resource-backed phases dùng owned fixtures. Quickstart là CLI contract; phased commands cùng closure phải có deterministic required coverage.

### Parallel Examples (không tự dispatch agents)

| Story | Parallel tasks sau prerequisites                                    | Shared-file restriction                                                          |
| ----- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| US1   | T010 session tests, T011 client tests, T012 browser principal suite | Implementation T015/T020/T021 còn shared coordinator/editor files nên sequential |
| US2   | T026 surface tests + T027 package tests                             | T028 coordinator/T029 route relocation không chạy concurrently với US1 mutations |
| US3   | T036 controls tests + T037 account/style browser tests              | T042–045 shared primitives/provider/profile ownership nên integration sequential |
| US4   | T048 dialog unit + T049 media browser tests                         | T052/T053/T054 shared library/editor/customer files tránh concurrent edits       |

Chỉ nine tasks gắn `[P]` theo các pairs/groups trên. Parallel execution không authorization cho missing dependencies, API additions hoặc design override.

## Implementation Strategy

**MVP**: Setup + foundation + US1. Complete identity/renewal outcomes và owned-browser evidence trước mở rộng visual adoption; không deploy tự động. US2 là increment tiếp theo cho public/package integrity; US3 sau explicit boundary approval; US4 sau shared primitives. Mỗi story có isolated fixture/test outcomes nhưng dependency graph phải được tôn trọng.

Không Customer Design panel/free-position/section controls; Admin authoring giữ riêng. No catalog/dashboard/editor expansion, schema/mobile reflow, autosave/publish recovery redesign, new business endpoints/dependencies/migrations. Nếu actual backend thiếu capability, record BLOCKED theo MASTER thay vì invent.

## Task Summary / Requirement Coverage

| Group               | Tasks    | Count |
| ------------------- | -------- | ----: |
| Setup               | T001–005 |     5 |
| Foundation          | T006–009 |     4 |
| US1 (P1/MVP)        | T010–025 |    16 |
| US2 (P1)            | T026–034 |     9 |
| US3 (P2)            | T035–047 |    13 |
| US4 (P2)            | T048–056 |     9 |
| Polish              | T057–062 |     6 |
| Convergence Phase8  | T063–075 |    13 |
| Convergence Phase9  | T076–082 |     7 |
| Convergence Phase10 | T083     |     1 |
| Convergence Phase11 | T084–085 |     2 |
| Total               | T001–085 |    85 |

| Requirements | Primary implementation / evidence                     |
| ------------ | ----------------------------------------------------- |
| FR-001–003   | T010–025; SC-001–002                                  |
| FR-004–005   | T015–016/T026–029/T034/T045/T059; SC-003              |
| FR-006–008   | T027/T030–034/T037–039/T046–047/T059–060; SC-004–005  |
| FR-009–011   | T036–047; SC-005                                      |
| FR-012–015   | T036–047/T052; SC-005–006                             |
| FR-016–018   | T035–047/T048–056/T060; SC-006–007                    |
| FR-019–020   | T022/T048–056; SC-007                                 |
| FR-021–023   | T004/T017/T020–023/T049/T053–056/T059; SC-008         |
| FR-024–025   | T001–009/T025/T033–034/T035/T046–047/T055–062; SC-009 |

Historical T001–T062 checkpoint: all62 tasks giữ sequential ID/required story label ở story phases/exact file path; 24 tasks checked (T001–T011, T013–T024, T035), 38 tasks còn unchecked. US1 unit checkpoint PASS / PARTIAL; browser/package/final acceptance chưa hoàn tất. Không checkbox ngoài task format. Không `.specify/extensions.yml`, before/after implementation hooks skipped; Git branch giữ `master`.

## Phase 8: Convergence

**Scope**: US1–US3 assessed 2026-10-09 against current source, spec and plan; US4 implementation and final full-feature polish are outside this convergence pass. Findings: 1 missing, 9 partial, 3 contradicts; 12 HIGH, 1 MEDIUM; no confirmed CRITICAL constitution violation. Reviewed 24 functional requirements (FR-001–018, FR-020–025), scoped portions of 8 success criteria (SC-001–006, SC-008–009), 19 acceptance scenarios, 10 plan decisions and 5 constitution core principles. Static assessment does not establish browser/runtime acceptance.

Existing task IDs, completion states and historical summaries above remain unchanged under the append-only convergence contract. These tasks refine remaining work, including unchecked T012/T025/T026/T027/T032/T034/T047; they do not replace or waive those gates. Docker/browser/package execution remains explicitly deferred by the user until a suitable machine is available. Implement runnable code/test-definition fixes first; never invent runtime PASS or narrow fixed acceptance coverage.

- [x] T063 [US1] **HIGH / F1** Create `apps/web/e2e/frontend-foundation/principal-isolation.spec.ts` with the complete T012 real-browser matrix: same-role/different-role/peer/logout/A→B→A transitions, stale success/error/pagination/navigation, Customer and Admin drafts, same-owner renewal without reload, refresh/logout/login/onboarding/password/OAuth races and subsequent cookie reload/renew; reuse verified006 fixtures/evidence only where they prove the exact current boundary. Add fixed cases to `scripts/frontend-cases.json` and keep the required US1 suite in `scripts/frontend-validate.mjs`; execution may remain deferred with explicit evidence. Complete the previously unbuilt T012 scope per FR-001–003, FR-005, US1/AC1–7, SC-001–002 (missing).
- [x] T064 [US1] **HIGH / F2** Make successful JSON body parsing in `apps/web/src/features/invitation-builder/api/client.ts` obey the same operation cancellation/deadline race as blob/error parsing; add `apps/web/tests/invitation-builder/client.test.ts` cases with headers received and stalled JSON parsing, caller abort, scope disposal and the 15s deadline, asserting prompt rejection and no stale result/retry. Preserve credentials, allowlists and one same-owner retry per FR-002, FR-005, plan: bounded logical requests, T016 (partial).
- [x] T065 [US1] **HIGH / F3** Propagate a captured mounted principal/resource lifetime from `apps/web/src/features/invitations/rsvp-management.tsx` through `apps/web/src/features/invitations/rsvp-owner-api.ts` and `getInvitation` calls; dispose scopes on resource replacement/unmount and fence every refresh/retry/result continuation while retaining existing generation/CAS/controlVersion semantics. Extend `apps/web/tests/invitation-builder/rsvp.test.tsx` for resource switch/unmount during a delayed401, no old-resource retry and same-owner renewal preservation per FR-001–003, FR-005, plan: owner disposal and continuation fencing, T023 (partial).
- [x] T066 [US3] **HIGH / F4** Place the session chrome emitted by `apps/web/src/features/identity-access/session/session-provider.tsx` inside the scoped token/local-font provider in `apps/web/src/app/(product)/layout.tsx`, so `session-chrome.module.css` and shared Buttons resolve approved palette, spacing, focus and Be Vietnam Pro variables. Preserve public/capture isolation and avoid applying inherited platform typography to canvases. Add structural regression coverage in `apps/web/tests/frontend-foundation/surface-boundaries.test.tsx` and authenticated computed-style checks in `apps/web/e2e/frontend-foundation/account-journeys.spec.ts` per FR-008–010, FR-016–018, plan: product-only chrome, T045 (contradicts).
- [x] T067 [US3] **HIGH / F5** Separate known local password-validation errors from general operation failures in `apps/web/src/features/identity-access/forms/register-form.tsx` and `recovery-forms.tsx`; pass known field errors to the corresponding shared Field so visible text, aria-invalid and aria-describedby identify the password input, clear/update them appropriately, and retain safe generic server messaging. Extend `apps/web/tests/identity-access/register.test.tsx` and `verification.test.tsx` plus account browser assertions per FR-012, FR-014, US3/AC2, T042–043 (contradicts).
- [x] T068 [US3] **HIGH / F6** Remove the blanket HTTP400→incorrect-current-password interpretation in `apps/web/src/features/identity-access/forms/profile-form.tsx`; use a specific password error only when the existing contract explicitly identifies it, otherwise show truthful general recovery without fabricated field/business details. Add `apps/web/tests/identity-access/profile.test.tsx` cases distinguishing generic400, known rejection, uncertain response and social-only rejection; preserve original-session clear and newer-owner fences per FR-012, FR-014, US3/AC2, T018/T044 (contradicts).
- [x] T069 [US2] **HIGH / F7** Extend `apps/web/e2e/frontend-foundation/surface-isolation.spec.ts` and relevant unit lifecycle coverage to exercise actual client-side product→public→product navigation with a document-preservation assertion, pending-refresh cleanup, peer/dirty-listener disposal and preserved product admission; cover isolated capture, absence of private email/chrome and same-version anonymous/authenticated template output with controlled time. Keep unavailable visibility truthful and register fixed cases in `scripts/frontend-cases.json` per FR-004–005, FR-008, US2/AC1–2/5–6, SC-003, T026 (partial).
- [x] T070 [US2] **HIGH / F8** Complete T032 in `apps/web/e2e/frontend-foundation/packaged-fonts.spec.ts` and `scripts/frontend-validate.mjs`: inject required font and image failures into actual preview/capture/publication validation, assert not-ready/failed operation rather than scene presence, and verify the previous published snapshot/revision remains authoritative. Register or reuse exact current font-readiness/renderer-fit/API-publication-race evidence and fixed case IDs; make owned standalone API origins/fixtures support these operations without changing business/readiness contracts per FR-007–008, US2/AC4, SC-004, T027/T032 (partial).
- [x] T071 [US3] **HIGH / F9** Expand `apps/web/e2e/frontend-foundation/account-journeys.spec.ts` beyond route headings: complete existing login/register/verify/recovery/reset/social-result-onboarding/profile/password/Admin search-pagination-confirmed lock-unlock flows with appropriate authorized fixtures, field/general failures, pending/busy states and persistent milestones/next actions. Exercise essential keyboard actions, visible unobscured focus and reduced motion at all six planned widths; demonstrate actual representative text/control enlargement to200% with computed-size evidence and long Vietnamese/multiline-error content, rather than only changing root font-size while controls use fixed px sizes. Register fixed cases and document any unavailable capability as BLOCKED per FR-011–018, US3/AC1–4/6, SC-005–006, T037/T046 (partial).
- [x] T072 [US3] **HIGH / F10** Replace the self-comparison-only coverage in `apps/web/e2e/frontend-foundation/template-style-isolation.spec.ts` with controlled same-scene expectations across public output, isolated capture and authenticated Admin canvas/preview under platform foundations. Assert actual authored text fonts/weights/colors, element positions/sizes/transforms, canvas palette and pinned revision/design identity, not only the outer workarea; cover current Admin authoring controls and retain data-only Customer boundaries. Add fixed case IDs per FR-008, FR-021–023, US3/AC5, US2/AC6, SC-005/SC-008 scoped compatibility, T037 (partial).
- [x] T073 [US2] **HIGH / F11** Disambiguate the successful-login assertion in `apps/web/e2e/frontend-foundation/helpers.ts`: `LoginForm` success status and `SessionProvider` navigation both render the same exact email, so target the intended session navigation/status explicitly. Review authenticated callers for similarly ambiguous selectors and confirm the helper works with both visible regions before running acceptance suites; do not conceal duplicates with arbitrary first-match selection per FR-014, FR-024, plan: real-browser journeys, T026/T037 (partial).
- [x] T074 [US3] **HIGH / F13** After T063–T073/T075 and their relevant unit checks, complete the still-open T025/T034/T047 acceptance on a machine with Docker daemon and explicit disposable PostgreSQL/MinIO targets: run bounded browser --through US1/US2/US3, package --through US2/US3 and relevant builder US4 compatibility command; review actual rendered B01/control-state contrast, all six widths/keyboard/text zoom/long Vietnamese/reduced-motion/template isolation. Record sanitized commands, fixed-case/platform evidence, PARTIAL scope and owned cleanup in `specs/005-frontend-foundation-reliability/verification.md`; update task states only for verified work. Until that environment is available retain explicit DEFERRED/NOT RUN outcomes; local unit/build/test discovery is not acceptance per FR-024–025, SC-001–006, SC-008–009 scoped outcomes (partial).
- [x] T075 [US3] **MEDIUM / F12** Strengthen face-specific assertions in `apps/web/e2e/frontend-foundation/packaged-fonts.spec.ts`: require non-empty loaded FontFace results and expected loaded family/weight/style for each invitation and platform face with Vietnamese/Latin text, verify the intended local asset response rather than only an aggregate resource count, and include a missing-face negative control that fails the readiness assertion. Preserve pinned manifests/licenses/IDs and scoped stage expectations in `scripts/frontend-cases.json` per FR-006, FR-009, US2/AC3, T027/T046 (partial).

## Phase 9: Convergence

**Scope**: Re-assessment of current US1–US3 implementation against spec, plan and tasks, 2026-10-09. Checked 24 scoped functional requirements (FR-001–018, FR-020–025), 19 acceptance scenarios, scoped portions of 8 success criteria (SC-001–006, SC-008–009), 10 plan decisions and 5 constitution core principles. Findings: 5 partial, 2 contradicts; 5 HIGH, 2 MEDIUM; no confirmed CRITICAL constitution violation. No application code or existing task state is changed by this convergence pass. US4 implementation is outside this assessment. Prior checked test-definition tasks do not establish runtime acceptance. Docker-dependent gates remain deferred by the user; T080 continues the existing T074 gate after the new fixes, rather than waiving it.

- [x] T076 [US2] **HIGH / F1** Fix `apps/api/test/fixtures/invitation-builder/frontend-seed.spec.ts` so its representative document/sample data/hash are supplied when the immutable design revision is first INSERTed. Current code creates `f.revision(...)` and then UPDATEs `template_design_revisions`, which is always rejected by `template_revision_immutable` in `apps/api/src/infrastructure/database/migrations/20261001000100-InvitationBuilderCore.ts`; this blocks every resource-backed frontend gate before browser execution. Extend the owning fixture helper in `apps/api/test/fixtures/invitation-builder/database.ts` if appropriate, preserving its existing defaults and callers, revision identity/hash consistency and thumbnail/asset references. Add PostgreSQL-backed fixture validation; do not disable triggers, alter production migrations or relax immutability to seed tests. Trace T007/T027/T032/T070, FR-006–008, plan: immutable pinned design and owned verification fixtures (contradicts).
- [x] T077 [US1] **HIGH / F2** Complete remaining T012/T063 browser definitions in `apps/web/e2e/frontend-foundation/principal-isolation.spec.ts`: prove a valid unsaved Customer invitation draft survives actual same-owner renewal without navigation/reload; exercise old-resource completion/navigation after resource replacement; and explicitly establish a renewal is queued before canceling its owner/resource, then assert no old operation dispatch/retry/admission after cancellation. Current coverage proves profile/Admin renewal, queue expiry and tab-close recovery, but does not establish those remaining Customer/resource/queued-cancellation boundaries. Reuse exact existing 006 contention/cancellation evidence only where it proves the current boundary, with required fixed cases in `scripts/frontend-cases.json` and the runner registry; keep dispatched cookie delivery semantics and unresolved outcomes honest. Trace FR-001–003, FR-005, US1/AC2/5/6, SC-001–002, plan: principal/resource lifetime (partial).
- [x] T078 [US3] **HIGH / F3** Expand `apps/web/e2e/frontend-foundation/account-journeys.spec.ts` and its fixed inventory to cover essential keyboard actions/focus/reduced motion across all six planned widths for the existing account journeys and authorized Admin search/pagination/confirmation/detail controls, with actual 200% enlargement and representative visible long Vietnamese/multiline feedback. Current six-width keyboard loop only exercises forgot-password; other journeys use default-width pointer interaction, and the route-heading loop visits Admin content anonymously. Assert useful authorized content and completed/recoverable outcomes, not just headings, root font-size or long text entered in an email input. Cover pending/busy/error states without inventing backend capabilities and keep unavailable capabilities explicitly BLOCKED. Trace T037/T046/T071, FR-011–018, US3/AC1–4/6, SC-005–006 (partial).
- [x] T079 [US3] **HIGH / F4** Finish semantic persistent feedback in `apps/web/src/features/identity-access/forms/social-onboarding-form.tsx`: current `if (!state)` loading and confirmed completion return plain paragraphs, and completion offers no relevant next action. Use the existing scoped platform status treatment with appropriate semantics and an existing product destination for the confirmed account; review OAuth-result success in `apps/web/src/app/(product)/(auth)/oauth-result/page.tsx` for the same next-action obligation. Preserve all proof handling, current-intent/epoch/session-tag checks and newer-owner fences. Extend owning unit/browser tests to assert semantic loading/success, persistent milestone, reachable next action and absence of stale success after owner change. Trace T043/T071, FR-010–014, FR-018, US3/AC6, SC-005–006 (partial).
- [x] T080 [US3] **HIGH / F7** After T076–T079/T081–T082 code/test-definition checks, execute the existing T025/T034/T047/T074 acceptance gates on the user-designated Docker-capable machine with explicit disposable PostgreSQL/MinIO targets. Run browser closures US1/US2/US3, package closures US2/US3 and existing builder US4 compatibility/renderer-fit coverage; record exact required-case outcomes, publication evidence, rendered contrast/control states, six-width keyboard/text enlargement/template isolation and owned cleanup in `specs/005-frontend-foundation-reliability/verification.md`. Until the environment is available retain DEFERRED/NOT RUN and do not equate unit/build/discovery or completed test-definition checkboxes with acceptance. Trace FR-024–025, SC-001–006 and scoped SC-008–009, plan: staged acceptance registry (partial).
- [x] T081 [US3] **MEDIUM / F5** Restore the T008 per-case limit of 30s in `apps/web/e2e/frontend-foundation/account-journeys.spec.ts` and `principal-isolation.spec.ts`: the route/viewport loop currently overrides it to120s and the dispatched-timeout case to60s. Split independent route/viewport cases and bound timeout observations using the unchanged existing IAM deadline and actual dispatch evidence; do not shorten production deadlines, replace the required uncertainty scenario with a mock, or silently waive the test contract. Update `scripts/frontend-cases.json` for the resulting fixed cases and add a runner/config guard against future unauthorized per-case overrides. Trace T008/T009, FR-024, plan: bounded reproducible verification (contradicts).
- [x] T082 [US3] **MEDIUM / F6** Complete platform-specific face identity checks in `apps/web/e2e/frontend-foundation/packaged-fonts.spec.ts`: sans loads currently validate nonempty/status/weight/style but not expected loaded family, and the editorial face validates only status/weight. Resolve the intended next/font family from the scoped variables, assert family/weight/normal style for every required sans/editorial face with Vietnamese/Latin samples, and retain the missing-face negative control plus pinned local asset byte/hash assertions. Do not accept a loaded fallback as the intended platform face; keep package-through-US2 independent of US3 font expectations. Trace T027/T039/T075, FR-006, FR-009, US2/AC3, SC-004–005 (partial).

## Phase 10: Convergence

**Scope**: US1–US3 reassessment after Phase 9 implementation, 2026-10-09. Checked 24 scoped FRs (FR-001–018, FR-020–025), 19 acceptance scenarios, scoped portions of 8 success criteria (SC-001–006, SC-008–009), 10 plan decisions and 5 constitution core principles. No additional application-code defect is confirmed by this pass. One HIGH partial finding remains: required runtime acceptance is not established by the recorded unit/build/discovery checks. This is a continuation of T025/T034/T047/T074/T080, not an additional independent suite or a waiver. Docker-dependent execution remains explicitly deferred by the user. Existing task text/states and application code are unchanged; US4 implementation is outside scope.

- [x] T083 [US3] **HIGH / F1** Complete the existing T080 acceptance work on the user-designated Docker-capable machine with explicit disposable PostgreSQL/MinIO targets: first prove the current immutable frontend seed succeeds against PostgreSQL, then run the documented browser closures through US1/US2/US3, package closures through US2/US3 and existing builder US4 compatibility coverage. Review actual fixed-case results across Chromium/Firefox/WebKit, same-owner draft preservation and queued cancellation, public/capture isolation, standalone face identity/hash/readiness and publication failure retention, authorized account/Admin keyboard journeys at all six widths with 200% text, rendered contrast/control states and pinned template compatibility. Record sanitized commands, required-case outcomes and owned cleanup in `specs/005-frontend-foundation-reliability/verification.md`; reconcile the existing dependent acceptance tasks only from actual evidence. Until the designated environment is available retain DEFERRED/NOT RUN, avoid repeated local unit/discovery runs as a substitute, and do not claim US1–US3 acceptance or full-feature completion. Trace FR-024–025, SC-001–006 and scoped SC-008–009, plan: staged acceptance registry (partial).

## Phase 11: Convergence

**Scope**: Full005 assessment2026-10-10:25 FRs,9 buildable SCs,24 acceptance scenarios,9 edge cases,10 plan decisions and5 constitution core principles. Findings:2 HIGH partial gaps; missing0/contradicts0/unrequested0; no confirmed CRITICAL constitution violation. Existing task text/states, spec/plan and application code are unchanged by this append-only assessment. US3 runtime414/414 and owned cleanup PASS; full/US4 WebKit storage failures are retained as failed evidence. Final acceptance is not yet established.

- [x] T084 [US3] **HIGH / F1** Add a reachable existing account-management next action to the confirmed login milestone in `apps/web/src/features/identity-access/forms/login-form.tsx`; current success shows only a heading/email despite FR-013 requiring a relevant next action. Keep the link inside confirmed current-session success, preserve generic failure/proof/identity fences, and introduce no backend capability or new visual language. Add owning regression coverage in `apps/web/tests/identity-access/login.test.tsx`, register its fixed US3 case in `scripts/frontend-cases.json`, and complete the action by keyboard at all six widths in the existing `apps/web/e2e/frontend-foundation/keyboard-journeys.spec.ts` login journey. Trace FR-013–014, US3/AC6, SC-005–006, plan: persistent feedback and existing account journeys (partial).
- [x] T085 **HIGH / F2** After T084, complete the existing T056/T059–T062 final acceptance on current source: retain full fixed manifests/retries0/deadlines, investigate the recorded WebKit storage-recovery failures with sanitized native IndexedDB events, and run the bounded full frontend gate with no concurrent browser acceptance workload. Verify the exact US4 dependency-closure case set, standalone fonts/publication/health and owned cleanup; run its staged checkpoint if full evidence does not cover the required closure. Reuse still-matching IAM/auth-transition/builder compatibility evidence, record full source/commands/results and MASTER review in `specs/005-frontend-foundation-reliability/verification.md`, synchronize current audit/quickstart/handoff/task status, then run read-only final analyze and whole-feature converge. Do not rewrite failed reports, extend storage deadlines, replay auth or claim PASS from diagnostics. Trace FR-024–025, SC-001–009, plan: bounded fixed acceptance and truthful evidence (partial).

## Phase 12 — Approved prototype extension setup

Baseline T001–T085 giữ checked và evidence riêng. Các tasks dưới đây chỉ đóng sau actual implementation/verification.

- [x] T086 Đồng bộ scope US5–US7, requirement trace, contracts và quality review trong specs/005-frontend-foundation-reliability/{spec,plan,research,data-model,quickstart}.md và contracts/product-experience.md; chọn active feature005 trong .specify/feature.json.

## Phase 13 — US5 Product identity/navigation (P1, first increment)

Independent test: anonymous home, Customer/Admin avatar keyboard/logout, branding/footer, public/capture isolation; FR-026/031, SC-010–012.

- [x] T087 [US5] Viết regression trước code cho homepage và avatar/session actions/role boundaries trong apps/web/tests/foundation-page.test.tsx và apps/web/tests/frontend-foundation/product-shell.test.tsx.
- [x] T088 [US5] Implement product shell/header/footer/avatar scoped CSS theo prototype trong apps/web/src/ui/product/product-shell.tsx và product-shell.module.css; preserve SessionProvider lifecycles và dirty logout trong apps/web/src/features/identity-access/session/session-provider.tsx.
- [x] T089 [US5] Implement homepage editorial/local artwork và branding metadata/favicon trong apps/web/src/app/(product)/page.tsx, apps/web/src/ui/product/home.module.css, apps/web/src/app/layout.tsx và apps/web/public/branding/.
- [x] T090 [US5] Chạy targeted tests, typecheck/lint và product/public boundary regressions; ghi kết quả thực trong specs/005-frontend-foundation-reliability/verification.md.

## Phase 14 — US6 Catalog/demo/workspace (P1)

Independent test: real Customer catalog→popup→demo→create pinned revision, sidebar/profile; FR-027/028/030/031, SC-010–012.

- [x] T091 [US6] Viết tests popup lifecycle, stale revision/assets, create recovery và demo preview trong apps/web/tests/invitation-builder/template-owner.test.tsx và apps/web/e2e/frontend-foundation/product-experience.spec.ts.
- [x] T092 [US6] Add scoped revision reader và gallery cards/popup/QR using protected assets trong apps/web/src/features/invitations/api.ts và customer-pages.tsx; keep filters/cursors/current published revision.
- [x] T093 [US6] Add real template demo route/opening/shared renderer preview trong apps/web/src/app/(product)/templates/[id]/demo/page.tsx và apps/web/src/features/invitations/template-demo.tsx; mobile390 popup/adaptive900 demo.
- [x] T094 [US6] Add owner-scoped overview/sidebar/list/account composition trong apps/web/src/ui/product/account-workspace.tsx, apps/web/src/app/(product)/overview/page.tsx và apps/web/src/features/invitations/customer-pages.tsx; truthful loaded-page statistics/profile persistence.
- [x] T095 [US6] Verify catalog/demo/workspace với real backend, keyboard/viewport/owner switch; record evidence trong specs/005-frontend-foundation-reliability/verification.md.

## Phase 15 — US7 Customer editor and existing flows (P1)

Independent test: form→preview→save→publish→public, conflict/dirty navigation; FR-029–031, SC-010–012.

- [x] T096 [US7] Add regression cho accordion/tab edit retention, field alignment, version/conflict/publication recovery trong apps/web/tests/invitation-builder/customer-form.test.tsx và apps/web/e2e/frontend-foundation/product-editor.spec.ts.
- [x] T097 [US7] Apply centered accordion720px và toolbar edit/preview/mobile390 trong apps/web/src/features/invitations/customer-invitation-form.tsx và customer-invitation-form.module.css; preserve owner guards/data-only payloads.
- [x] T098 [US7] Integrate media/save/publish/share recovery UI với existing actual clients trong apps/web/src/features/invitations/customer-invitation-form.tsx; autosave chỉ khi serialized/version-fenced và tested, không replay uncertain operations.
- [x] T099 [US7] Align RSVP/Admin/auth platform composition qua existing primitives trong apps/web/src/features/invitations/rsvp-management.tsx và apps/web/src/app/(product)/; preserve all existing capabilities.
- [x] T100 [US7] Run real-backend editor/publication/RSVP and owner-transition acceptance trong apps/web/e2e/frontend-foundation/product-editor.spec.ts; record actual evidence trong specs/005-frontend-foundation-reliability/verification.md.

## Phase 16 — Extension final verification

- [x] T101 Run independent web checks, frontend acceptance/package and affected IAM/builder compatibility gates theo specs/005-frontend-foundation-reliability/quickstart.md; analyze/converge extension and record limitations/cleanup in verification.md.

Dependencies: T086→T087→T088→T089→T090→T091→T092→T093→T094→T095→T096→T097→T098→T099→T100→T101. Không parallel mutations trên shared files; test-only independent suites có thể chạy đồng thời. First delivery US5 không được coi là toàn extension complete.


## Phase 17 — Complete prototype mapping scope and design inventory

- [x] T102 Build screen/control prototype→production mapping and visual acceptance matrix in docs/frontend/PROTOTYPE-PARITY.md per FR032/036, US10/AC1.
- [x] T103 Review expanded spec/plan/tasks against MASTER and constitution; record analysis before implementation in verification.md per FR032–036.

## Phase 18 — Parallel UI implementation

- [ ] T104 [P] [US9] Implement styled real Admin template list/new metadata flow in template-pages.tsx and scoped CSS with loading/error/empty/duplicate/create recovery per FR034.
- [ ] T105 [P] [US9] Complete improved legacy and responsive authoring workspace and contextual panels in invitation-builder/editor with preserved engine contracts per FR035.
- [ ] T106 [P] [US8] Map Customer editor media/date/publication success interactions using existing scoped clients in customer-invitation-form.tsx and CSS per FR033.
- [ ] T107 [US8] Complete homepage/shell/auth/account/gallery/workspace composition and supported controls mapping per FR032, retaining real IAM/data boundaries.
- [ ] T108 [US8] Complete Admin customer management and owner RSVP visual mapping in existing features/routes per FR032/034.
- [ ] T109 [US8/US9] Add necessary regression tests for changed interactions, retained input/owner/version/recovery and guided Admin creation per FR033–035.

## Phase 19 — Iterative prototype parity and final acceptance

- [ ] T110 [US10] Capture paired actual/prototype screen views390/1440, inspect and record named differences in PROTOTYPE-PARITY.md per SC013.
- [ ] T111 [US10] Remediate every unintended mapped visual/interaction gap and repeat comparison until none remains per FR036/SC013; preserve explicit contract differences.
- [ ] T112 [US10] Register/run expanded real-backend browser acceptance plus independent web checks/package and affected IAM/builder compatibility per SC014/015.
- [ ] T113 [US10] Analyze/converge expanded spec/plan/tasks, record final screenshot/source/cleanup evidence and limitations per FR036.
- [ ] T114 Restart actual manual-test FE/BE with verified Admin/Customer credentials and provide routes after validated final source.

Dependencies: T102→T103→parallel T104/T105/T106; root T107/T108 disjoint files; T109→T110→T111→T112→T113→T114. Historical T001–T101 markers/evidence retained. Functional PASS alone does not close visual tasks.
