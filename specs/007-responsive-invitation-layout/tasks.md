# Tasks: Responsive Invitation Layout (Feature 007)

**Input**: Design artifacts trong `specs/007-responsive-invitation-layout/`.
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts](contracts/) và [quickstart.md](quickstart.md).
**Status**: Remediation đã chốt ngày2026-10-11 theo user approval;74 task IDs giữ nguyên, chưa implementation/runtime verification.
**Tests**: Có test tasks vì spec/plan/contracts yêu cầu corpus parity, DB migration, publication races, browser matrix và accessibility. Tests phải đặt sau tooling/fixtures; viết regression assertions trước sửa behavior, chạy relevant failing cases rồi implement, không để tests mirror implementation.
**Organization**: Stories P1 theo dependency US1→US4→US2, sau đó US3(P2). US4 đặt trước US2 vì Customer publish cần trusted publication2. Không đổi priorities hoặc IDs trong spec.

## Format and paths

Mỗi task dùng `- [ ] Tnnn [P?] [USn?] mô tả + file path`. `[P]` chỉ cho sibling tasks có output files khác nhau và prerequisites đã hoàn tất. Không ngụ ý tất cả tasks có `[P]` trong các phase khác nhau chạy đồng thời. Paths mới là vị trí dự kiến để tạo, paths hiện có phải giữ behavior1. All relative paths resolve from repo root; dùng absolute paths khi thao tác files theo skill.

`validation.md`, `baseline.md`, `analysis.md`, fixture corpus, runner và v2 modules dưới đây là outputs của implementation, không phải files đã có ở bước tasks. Không gọi runner tương lai trước T003. Production parity đã chốt: Customer preview/public bắt buộc, Admin preview/public kiểm tại authoring gate; demo/popup ui-prototype không là production acceptance. Không tự mở route mới.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Chốt baseline, tooling và môi trường kiểm chứng trước khi thêm tests/code. Không khởi tạo lại app hoặc nâng dependency không cần thiết.

**Gate**: `timeout 600s node --test scripts/tests/responsive-validate.test.mjs` và `pnpm exec prettier --check specs/007-responsive-invitation-layout/*.md`; không có application fixtures ở phase này. Runner unit tests phải dùng fake processes/resources và đóng chúng trong finally.

- [X] T001 Ghi baseline Git/working-tree của004/005/006 và versions vào `specs/007-responsive-invitation-layout/baseline.md`; inventory xác nhận production Customer editor/public/Admin preview, prototype-only demo/popup; không discard thay đổi hoặc tự mở discovery/demo routes (plan A, FR008).
- [X] T002 Review checklist và phạm vi/contracts theo `specs/007-responsive-invitation-layout/checklists/requirements.md`, chạy cross-artifact analyze read-only, sau đó lưu bản tóm tắt đã review bằng bước ghi tài liệu riêng vào `specs/007-responsive-invitation-layout/analysis.md` trước coding; xử lý CRITICAL/HIGH và ghi design review cần thiết, đọc relevant installed Next docs theo `apps/web/AGENTS.md` trước web code (constitution workflow).
- [X] T003 Xây `scripts/responsive-validate.mjs` và `scripts/responsive-cases.json` với phase prototype/contracts/persistence/rendering/publication/authoring/all, selectors --story US1/US2 cho rendering, run ID, owned resources, redaction và cleanup finally; prototype/contracts10min, story/render/persistence/publication/authoring15min, all45min. Bare rendering chạy cả US1/US2; phase/subset thiếu case hoặc prerequisite phải fail rõ. Persistence manifest không chứa publication/capture tests (plan B/G).
- [X] T004 Kiểm runner bằng `scripts/tests/responsive-validate.test.mjs`: timeout/exit failures, thiếu env/browser/DB, không có case, cleanup chỉ resources owned bởi run và redaction; unit tests không gọi network/DB thật (phụ thuộc T003).
- [X] T005 Cấu hình `apps/web/playwright.responsive.config.ts` cho Chromium/Firefox/WebKit và host artifact isolation; thêm exact dev-only Vite8.3.0 vào `apps/web/package.json`/`pnpm-lock.yaml` (version reuse đã pin ở prototype), giữ Playwright version; config runner loopback test host riêng, không dùng trusted capture/global hoặc require build/run ui-prototype (plan B/G).
- [X] T006 Tạo `apps/web/e2e/responsive-host/index.html`, `mount.tsx`, `vite.config.ts` và smoke host với stub adapter; test-only host accepts injected adapter/synthetic context/width, không Next route hoặc production build entry. Thêm `apps/api/test/fixtures/invitation-builder/responsive-seed.ts`, `apps/web/e2e/invitation-builder/responsive-fixtures.ts` với isolated DB/MinIO seeds/cleanup và intercepted RSVP requests. Host smoke gate chạy sau T005 provisioning, hoàn thành trước T007; không infra reset (plan A/B/C).

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Prototype để chốt contract rồi triển khai schema/resolver độc lập ở hai app; tất cả stories phụ thuộc phase này.

**Gate**: `node scripts/responsive-validate.mjs --phase prototype`≤10min do runner quản lý, sau đó `node scripts/responsive-validate.mjs --phase contracts`≤10min. Corpus thuần JSON; browser contexts/server fixture được đóng trong finally. Prototype chỉ dùng local fixture, chưa là API/publication compatibility evidence.

- [X] T007 Tạo synthetic pilot tại `apps/web/e2e/invitation-builder/fixtures/responsive-pilot.json`, adapter thử `apps/web/src/features/invitation-builder/renderer/v2/prototype.tsx` và mount adapter vào independent host `apps/web/e2e/responsive-host/mount.tsx` đã smoke-tested T006; hero/info/Image grid/RSVP reuse content logic, preview/public contexts local test, không gửi scene2 vào trusted v1 capture/API (plan A, FR001/007).
- [X] T008 Viết/chạy `apps/web/e2e/invitation-builder/responsive-prototype.spec.ts` qua `scripts/responsive-validate.mjs --phase prototype`≤10min sau T007: host767/768/900/1440, text zoom200%, long content và public RSVP state/focus resize dùng intercepted requests; evidence trong `specs/007-responsive-invitation-layout/baseline.md`, finally close owned host/browser (FR001–004/011/014).
- [X] T009 Xác minh prototype tuân frozen nested wire/merge/scene fields và dual-global handshake trong `specs/007-responsive-invitation-layout/contracts/document-v2.md`, `contracts/rendering-publication.md`, `data-model.md`; không dời quyết định còn thiếu vào schema implementation. Nếu prototype cho thấy cần đổi contract, cập nhật artifacts và analyze lại trước corpus T010, không mở scope (phụ thuộc T008).
- [X] T010 Tạo shared JSON corpus tại `specs/007-responsive-invitation-layout/contracts/fixtures/manifest.json`, `valid-v2.json`, `invalid-v2.json` và `resolution-v2.json`: strict shape, IDs/order/roles,40section/200node/30widget/bytes, override allowlist, missing optional/fallback, union assets và scene pairs; giữ v1 corpus004 là regression oracle (phụ thuộc T009, FR008/013).
- [X] T011 [P] Định nghĩa web document/scene1|2 discriminated types trong `apps/web/src/features/invitation-builder/document/types.ts` và Zod/semantic schema trong `document/schema-v2.ts`, `document/schema.ts`; giữ validator1 chặt và WeddingData1, từ chối unknown version/keys/pairs (phụ thuộc T010, FR001/008).
- [X] T012 [P] Định nghĩa API document/scene1|2 types trong `apps/api/src/modules/invitation-builder/domain/document.types.ts`, AJV schema trong `domain/document-schema-v2.ts` và dispatch/semantic validation trong `domain/document.validator.ts`; không import runtime web, giữ WeddingData1 (phụ thuộc T010, FR001/008).
- [X] T013 Thêm corpus schema tests độc lập tại `apps/web/tests/invitation-builder/schema-v2.test.ts` và `apps/api/test/unit/invitation-builder/schema-v2.spec.ts`; kiểm old v1 cases, limits/malformed/IDs/roles/allowed overrides, version mismatch và unknown fields (phụ thuộc T011/T012, FR008).
- [X] T014 [P] Implement resolver v2 trong `apps/web/src/features/invitation-builder/document/resolve-design-v2.ts`, dispatch tại `document/resolve-design.ts`; resolve bindings một lần, giữ IDs/order/both rules, prune hidden/optional/empty sections, trả full scene/asset union/issues/hasVisibleRsvp (phụ thuộc T013, FR007/009/013).
- [X] T015 [P] Implement resolver v2 trong `apps/api/src/modules/invitation-builder/domain/resolve-design-v2.ts` và dispatch `domain/resolve-design.ts` theo cùng corpus và existing binding semantics; metadata khớp scene contract (phụ thuộc T013, FR007/009/013).
- [X] T016 Thêm resolver tests trong `apps/web/tests/invitation-builder/resolve-v2.test.ts` và `apps/api/test/unit/invitation-builder/resolve-v2.spec.ts`, xuất kết quả bằng test adapters và so equality tại `scripts/tests/responsive-parity.test.mjs`; kiểm IDs/order/content/issues/assets/asOf, không root runtime business package (phụ thuộc T014/T015, FR007/013).
- [X] T017 Widen draft/revision/job/invitation TS entity fields thành supported unions trong `apps/api/src/modules/invitation-builder/domain/entities.ts`, `publication/entities.ts`, `apps/api/src/modules/invitations/domain/entities.ts`; document hash/version metadata lấy từ validated input và không làm mất scene2 fields, chưa enable writers trước persistence gate (phụ thuộc T016, FR008/009).
- [X] T018 Chạy contracts gate bằng `scripts/responsive-validate.mjs --phase contracts`, ghi case-level parity/legacy/limits evidence vào `specs/007-responsive-invitation-layout/validation.md`; kiểm runner cleanup và giới hạn10min, gate chỉ pass khi tất cả required corpus cases thực thi (phụ thuộc T017).

## Phase 3: User Story 1 — Xem thiệp thích ứng theo container (Priority: P1)

**Goal**: Renderer2 production có flow/grid, đúng widths, nội dung intrinsic và widget state ổn định. Không cần Admin editor mới để kiểm story này.

**Independent Test**: Scene2 fixture đã resolve trong independent test host T006 ở cả preview/public modes; đo actual host width360/375/390/430/767/768/900/1024/1440, geometry±1px, nội dung/RSVP state/focus và accessibility. Fixture không được gọi là snapshot đã publish thật trước US4.

**Gate**: `node scripts/responsive-validate.mjs --phase rendering --story US1`≤15min; US2 subset chỉ chạy tại phase5. Cleanup browser contexts/processes owned bởi runner; không DB write khi dùng local render fixture.

- [X] T019 [P] [US1] Viết render/legacy regression tests tại `apps/web/tests/invitation-builder/responsive-renderer.test.tsx` cho version dispatch, stable IDs/order, intrinsic content và decoration semantics, dùng corpus T010 (FR001/008/011).
- [X] T020 [P] [US1] Viết `apps/web/e2e/invitation-builder/responsive-renderer.spec.ts` dùng independent host T006: viewport/container tách biệt, matrix360/375/390/430/767/768/900/1024/1440,767↔768,0-width→open/orientation, zoom200%, reduced motion/44px targets, delayed/broken resources/long content/Image counts và variants; intercepted public RSVP giữ state/focus/no duplicate, không dùng capture-only global (FR002/004/010/011/014, SC001/002/005).
- [X] T021 [US1] Tách nguyên renderer/measurement1 vào `apps/web/src/features/invitation-builder/renderer/v1/invitation-renderer-v1.tsx` và dispatch tại `renderer/invitation-renderer.tsx`; giữ geometry/Craft-free/public widget behavior1, reject pair unsupported (phụ thuộc T019/T020, FR008).
- [X] T022 [US1] Xây named container host adaptive/mobile tại `apps/web/src/features/invitation-builder/renderer/invitation-viewport.tsx` và `renderer/v2/responsive.module.css`: host ngoài cap480, breakpoint768 inclusive, max900, mobile host390, intrinsic height, không transform scale2 (phụ thuộc T021, FR002/003/004).
- [X] T023 [US1] Implement section/grid renderer tại `apps/web/src/features/invitation-builder/renderer/v2/section-renderer.tsx` và `renderer/v2/invitation-renderer-v2.tsx`; default/inherited styles đúng contract, content presets/padding/gap/minHeight, stable keys và đọc/tab order không đổi (phụ thuộc T022, FR001/002/007/011).
- [X] T024 [US1] Thêm leaf flow/artwork frames tại `apps/web/src/features/invitation-builder/renderer/v2/leaf-renderer.tsx`, `renderer/v2/responsive.module.css` và intrinsic branches tại `renderer/primitives.tsx`; image aspectRatio/alt, clip artwork layer riêng, aria-hidden/pointer-events:none cho decoration, không clip text/control (phụ thuộc T023, FR001/004/014).
- [X] T025 [US1] Reuse widget logic với intrinsic v2 content adapter tại `apps/web/src/features/invitation-builder/renderer/v2/widget-content.tsx` và `renderer/widgets/rsvp.tsx`, `renderer/widgets/timeline.tsx`, `renderer/widgets/qr-bank.tsx`; giữ v1 markup sizing, form errors/QR target usable, không height100% cho v2 content và không remount do resize (phụ thuộc T024, FR004/007/011/014).
- [X] T026 [US1] Implement DOM-flow readiness/measurement tại `apps/web/src/features/invitation-builder/renderer/measure-v2.ts` và dispatch `renderer/measure.ts`; font/img/background decode, settled frames, root/section/content/control horizontal overflow/clipping, max measured12000, section/layout diagnostics, decoration clipping allowed (phụ thuộc T025, FR010).
- [X] T027 [US1] Nâng preview diagnostics trong `apps/web/src/features/invitation-builder/renderer/scene-preview.tsx` để remeasure container sau width/assets/font change có cancellation/deadline, giữ v1 path và không resolve/remount widget vì resize (phụ thuộc T026, FR010/011).
- [X] T028 [US1] Thay prototype mount bằng production resolver/shared renderer trong `apps/web/e2e/responsive-host/mount.tsx`, `apps/web/src/features/invitation-builder/renderer/invitation-renderer.tsx` và `apps/web/e2e/invitation-builder/responsive-prototype.spec.ts`; xóa adapter thử T007 sau khi không còn references, host test-only giữ synthetic data và modes độc lập capture protocol (phụ thuộc T027, FR007).
- [X] T029 [US1] Integrate adaptive v2 branch vào `apps/web/src/features/invitations/public-invitation-view.tsx` và scene-pair consumption tại `apps/web/src/app/i/[slug]/page.tsx`; giữ historical v1 scale branch, public layout tự tăng height, không session chrome hoặc desktop data duplicate (phụ thuộc T028, FR002/007/008).
- [X] T030 [US1] Chạy T019/T020 bằng `scripts/responsive-validate.mjs --phase rendering --story US1`≤15min; ghi rect/state/accessibility/v1 evidence tại `specs/007-responsive-invitation-layout/validation.md`, independent host cleanup finally, không chạy US2 tests chưa implement hoặc coi đây là real publication evidence (phụ thuộc T029, SC001/002/004/005).

## Phase 4: User Story 4 — Publish an toàn và giữ thiệp cũ (Priority: P1)

**Goal**: Persistence/capture/publication chấp nhận supported v1/v2, chỉ commit v2 sau cả390/900 pass, giữ pinning/asset authorization và legacy output.

**Independent Test**: Dùng fixture template/revision được seed bằng real API/DB, không phụ thuộc authoring UI3 hoặc Customer UI2; seed v1 trước upgrade, publish v1/v2 rồi kiểm public scene/assets/races.

**Gate**: `node scripts/responsive-validate.mjs --phase persistence` và `--phase publication`, mỗi phase≤15min; capture≤30s total, job≤90s. Finally dọn run-owned database rows/objects/staged thumbnails và processes, không revert shared DB hoặc infra reset.

- [X] T031 [P] [US4] Viết `apps/api/test/integration/invitation-builder/responsive-migration.spec.ts` và `responsive-reference-races.spec.ts`: seed v1 trước upgrade, direct SQL valid/invalid versions+scene pairs, preserve bytes/hash/revision, guarded down refuse v2, nested draft/revision/job/fallback refs giữ assets và race delete không xóa retained assets; persistence-only tests không gọi capture/finalizer/job worker (FR008/009/013).
- [X] T032 [P] [US4] Viết `apps/api/test/contract/invitation-builder/responsive-publication.spec.ts`: window.invitationRenderer legacy exact report1, window.invitationRendererV2 advertised protocol2/supported pairs/strict request-report keys, unsupported and stale hash/width/correlation/rect, versioned candidates/scenes, sanitized diagnostics và old-public preservation; chạy ở publication gate sau T039–T044 (FR008/009/010).
- [X] T033 [P] [US4] Viết `apps/api/test/integration/invitation-builder/responsive-publication-races.spec.ts` cho pipeline v2 hoàn chỉnh: desktop fail/readiness/lease/CAS/retry/deadline/asset deletion/unpublish/stale commit; tests thuộc --phase publication, không --phase persistence (FR009/010/013).
- [X] T034 [US4] Tạo migration mới `apps/api/src/infrastructure/database/migrations/20261011000100-ResponsiveInvitationDocuments.ts` nới CHECK draft/revision/candidate/published_scene cho đúng versions/pairs và JSON metadata; giữ data1/type/bytes/status/immutable triggers, guarded down preflight refuse v2 trước DDL, không sửa migrations004 lịch sử (phụ thuộc T031–T033, FR008/009).
- [X] T035 [US4] Widen strict Admin draft/create input và candidate persistence tại `apps/api/src/modules/invitation-builder/http/input.ts`, `application/template-draft.service.ts`, `publication/publication.service.ts`; validate union trước save/hash, CAS/idempotency preserved, unsupported version fail closed (phụ thuộc T034, FR008/009).
- [X] T036 [US4] Bổ sung nested retained-ref traversal ở `apps/api/src/modules/invitation-assets/application/asset-reference.service.ts` cho section backgrounds/artwork/leaves/binding fallback; dùng union reachable layouts và giữ lock/delete race protections, không dựa thumbnail mobile (phụ thuộc T035, FR013).
- [X] T037 [US4] Bổ sung resolved v2 asset allowlist tại `apps/api/src/modules/invitations/domain/visible-scene-assets.ts` và consumers `apps/api/src/modules/invitation-assets/http/public-assets.controller.ts`, `apps/api/src/modules/invitation-builder/http/template-catalog.controller.ts`; exclude hidden/pruned/unused nodes và preserve owner/current-release rules (phụ thuộc T036, FR013).
- [X] T038 [US4] Chạy `scripts/responsive-validate.mjs --phase persistence`≤15min chỉ với migration/reference races T031 và validator/ref checks T034–T037; không chạy T032/T033/capture/finalization chưa implement. Ghi upgrade/constraints/retention/direct SQL snapshots/guarded-down/cleanup tại `specs/007-responsive-invitation-layout/validation.md`, v2 publication vẫn chưa enable cho đến T047 (phụ thuộc T037).
- [X] T039 [US4] Implement dual globals trong `apps/web/src/features/invitation-builder/renderer/capture-harness.tsx`, `apps/web/src/app/internal/invitation-renderer/page.tsx`: keep exact window.invitationRenderer version1 request/report1; add window.invitationRendererV2 protocolVersion2/supportedScenePairs/render với strict request/report2 theo contract, correlation UUID và width390/900; both capture-only, không thay test host T006 (phụ thuộc T038, FR008/009/010).
- [X] T040 [US4] Extend `apps/api/src/modules/invitation-builder/publication/chromium-renderer.ts`: scene1 dùng legacy global, scene2 yêu cầu V2 global/protocol/pair; verify strict report/hash/correlation/width/rootRect/captureRect, validate390+900 state variants trong30s tổng, fail unknown/no-V2 thay vì fallback; keep origin/method/asset guards (phụ thuộc T039, FR009/010).
- [X] T041 [US4] Update worker issue sanitation/deadline/fencing tại `apps/api/src/modules/invitation-builder/publication/publication.worker.ts`: preserve sectionIdUUID/layout, cap100, aggregate both widths trước success, không reset deadline từng pass, giữ heartbeat/lease/retry/staged cleanup (phụ thuộc T040, FR009/010).
- [X] T042 [US4] Update template finalizer `apps/api/src/modules/invitation-builder/publication/template-publication.service.ts` và invitation finalizer `apps/api/src/modules/invitations/application/invitation-publication.service.ts` để ghi version từ candidate/scene đã validate và đầy đủ scene2, atomic CAS commit sau hai widths; preserve pinned immutable design/current publicVersion/no-store (phụ thuộc T041, FR008/009/012).
- [X] T043 [US4] Giữ thumbnail mobile390×520 normal frozen state và cover precedence trong `apps/api/src/modules/invitation-builder/publication/chromium-renderer.ts`, `publication/template-publication.service.ts`, `publication/publication-cleanup.worker.ts`; desktop capture chỉ evidence, short content fill background, failed jobs dọn staging không thay current cover (phụ thuộc T042, FR015).
- [X] T044 [US4] Update public/revision projections tại `apps/api/src/modules/invitations/http/public-invitation.controller.ts`, `apps/api/src/modules/invitation-builder/http/template-catalog.controller.ts` và contract docs `specs/007-responsive-invitation-layout/contracts/http-compatibility.md`; preserve REST routes/v1 shapes, supported pair metadata, current-release asset policy và reject unknown (phụ thuộc T043, FR007/008/009/013).
- [X] T045 [US4] Thêm trusted-capture và real public compatibility browser cases tại `apps/web/e2e/invitation-builder/responsive-publication.spec.ts` và `apps/web/e2e/invitation-builder/compatibility.spec.ts`; publish seed1/2 qua API, assert full layout snapshot/old release denial/unpublish/pinning và failure old-snapshot preservation (phụ thuộc T044, FR008–010/012/013).
- [X] T046 [US4] Benchmark full390/900 functional variants, slow-ready resource cases và retry tại `scripts/responsive-validate.mjs --phase publication`; ghi capture30s/lease45s/job90s timings trong `specs/007-responsive-invitation-layout/validation.md`; nếu vượt budget, fail và review measured redesign, không âm thầm tăng deadline (phụ thuộc T045, FR010/plan E).
- [X] T047 [US4] Chạy tests T031–T033/T045 và toàn publication gate, ghi PASS/FAIL compatibility/atomicity/refs/cleanup trong `specs/007-responsive-invitation-layout/validation.md`; chỉ mở v2 publication khi mọi required case pass (phụ thuộc T046, SC004/006).

## Phase 5: User Story 2 — Customer data-only với preview nhất quán (Priority: P1)

**Goal**: Customer chọn pinned revision2, chỉnh data1, xem mobile preview và publish ra shared responsive output.

**Independent Test**: Seed published revision2 bằng US4 fixtures, dùng Customer flow hiện có để create/save/publish/guest RSVP; không cần Admin UI3. So Customer preview/public cùng width/data/asOf/assets; mode-specific controls được phân biệt. UI-prototype demo/popup không thuộc nghiệm thu production.

**Gate**: `node scripts/responsive-validate.mjs --phase rendering --story US2`≤15min (flag phải được runner T003 hỗ trợ); real API/DB seed và finally cleanup run-owned users/invitations/objects/browser resources.

- [X] T048 [P] [US2] Viết Customer regression tests tại `apps/web/tests/invitation-builder/responsive-customer.test.tsx`: preview390 trên desktop, no device selector, data-only payload, stale owner/session response guards, conflict retains input và pinned revision preservation (FR003/006/011).
- [X] T049 [P] [US2] Viết HTTP role/data-only tests tại `apps/api/test/contract/invitation-builder/responsive-customer.spec.ts`: Customer/non-owner/Anonymous/Admin policies, reject design/style/binding fields, revision pinning và draft/public separation cho both versions (FR006/008/009).
- [X] T050 [P] [US2] Viết `apps/web/e2e/invitation-builder/responsive-customer.spec.ts` với real create/edit/autosave/publish/public RSVP, production Customer preview↔public rect/content/order parity ở360/375/390 cùng data/asOf/assets. Assert preview390 desktop/no device selector, failed publish giữ public/keyboard/zoom; mobile-popup test host wrapper kiểm policy riêng, không thay mandatory production surface (FR003/006/007/011/014, SC003/005/007).
- [X] T051 [US2] Update frontend wire unions và validation consumption trong `apps/web/src/features/invitation-builder/api/client.ts`, `apps/web/src/features/invitations/api.ts`; support revision/design/scene2, preserve request lifetime/ownership guards, reject unknown pairs rõ ràng, không silently fallback (phụ thuộc T048–T050, FR006/008).
- [X] T052 [US2] Integrate mobile host vào `apps/web/src/features/invitations/customer-invitation-form.tsx` và `renderer/scene-preview.tsx`; cap390 kể cả desktop, reuse shared renderer/data1 resolver, giữ autosave/conflict/navigation/session lifetime và không expose design/device controls (phụ thuộc T051, FR003/006/007).
- [X] T053 [US2] Assert production Customer preview/public use shared viewport+renderer qua `apps/web/src/features/invitations/customer-pages.tsx` và `apps/web/e2e/invitation-builder/responsive-customer.spec.ts`; cấu hình mobile-popup fixture trong `apps/web/e2e/responsive-host/mount.tsx` tối đa390 và keyboard containment khi wrapper mở. Không sửa platform modal design hoặc tạo production catalog/detail/demo/popup mới; prototype-only discovery ngoài acceptance (phụ thuộc T052, FR002/003/007/015).
- [X] T054 [US2] Preserve v2 pinned data-only lifecycle trong `apps/api/src/modules/invitations/application/invitation.service.ts` và `http/invitation.controller.ts`; supported validated design from pinned revision, data1 draft updates only, conflicts/ownership/public snapshot behavior unchanged (phụ thuộc T053, FR006/009).
- [X] T055 [US2] Extend `apps/web/e2e/invitation-builder/responsive-customer.spec.ts` với same-width same-asOf asset-ready Customer preview/public DOM parity ở360/375/390 và failure cases; bắt buộc cả hai production surfaces, không skip/unavailable thành PASS; mode-specific RSVP actions assert riêng, preview state simulation tương ứng khi so form geometry (phụ thuộc T054, FR007/SC003).
- [X] T056 [US2] Chạy tests T048–T050 và US2 gate bằng `scripts/responsive-validate.mjs --phase rendering --story US2`, ghi data-only/parity/conflict/keyboard/pinning evidence trong `specs/007-responsive-invitation-layout/validation.md`; rerun impacted existing Customer/session tests theo baseline (phụ thuộc T055, SC003/005/007).

## Phase 6: User Story 3 — Admin section/responsive authoring (Priority: P2)

**Goal**: Admin tạo/chỉnh section2, kiểm390/900, publish; conversion thủ công không đổi revision/snapshot đã có.

**Independent Test**: Admin journey create→section/grid/artwork/binding edit→undo/redo→save/reload→preview→publish với real API; không phụ thuộc Customer UI nhưng gate dùng một Customer invitation để chứng minh conversion không repin.

**Gate**: `node scripts/responsive-validate.mjs --phase authoring`≤15min; seed isolated fixtures, cleanup run-owned drafts/revisions/invitations/assets và browser/processes. Layout selector chỉ dành Admin.

- [X] T057 [P] [US3] Viết section commands/history/round-trip tests tại `apps/web/tests/invitation-builder/section-authoring.test.tsx`: IDs/references/order invariants, undo/redo, typed mobile/desktop overrides, image alt/aspectRatio và locked/hidden/optional metadata (FR005/012).
- [X] T058 [P] [US3] Viết API draft/duplicate tests tại `apps/api/test/contract/invitation-builder/responsive-authoring.spec.ts`: version1/2 save/reload, unsupported data, Admin-only, duplicate remaps IDs toàn graph, stale editVersion conflict và không mutate immutable revision (FR005/008/012).
- [X] T059 [P] [US3] Viết `apps/web/e2e/invitation-builder/responsive-authoring.spec.ts`: section/grid/artwork/property/binding/sample edits, keyboard/undo/save/reload/conflict/publish/manual conversion và old pinning; mandatory Admin preview↔public same-data/asOf/assets parity ở390/900 sau readiness, no prototype demo dependency (FR005/007/012/014, SC007).
- [X] T060 [US3] Thêm v2 state/history/commands tại `apps/web/src/features/invitation-builder/editor/section-commands.ts` và `editor/section-adapter.ts`; strict import/export schema2, UUID generation/remap, add/remove/reorder section/leaf, undo/redo và dirty state; keep Craft adapter1 independent (phụ thuộc T057–T059, FR005).
- [X] T061 [US3] Thêm version dispatch/create-v1-or-v2 entry tại `apps/web/src/features/invitation-builder/editor/template-pages.tsx` và `editor/template-editor.tsx`, mount new `editor/section-editor.tsx` cho v2, preserve existing v1 Craft/Moveable editor và owner/session guards (phụ thuộc T060, FR005/008).
- [X] T062 [US3] Implement section tree/reorder keyboard và contextual flow/grid controls tại `apps/web/src/features/invitation-builder/editor/section-panel.tsx`, `editor/section-properties-panel.tsx`; expose allowed presets/gap/padding/minHeight/columns và mobile/desktop inspection390/900 chỉ Admin (phụ thuộc T061, FR005/014).
- [X] T063 [US3] Implement role-specific intrinsic leaf/style/artwork panels trong `apps/web/src/features/invitation-builder/editor/section-properties-panel.tsx` và `editor/section-artwork-controls.tsx`; type/property matrix/override allowlist, artwork section geometry/input fields accessible, no absolute controls cho flow text/widgets (phụ thuộc T062, FR001/005/014).
- [X] T064 [US3] Adapt bindings/sample data/asset preview/publication controls tại `apps/web/src/features/invitation-builder/editor/binding-panel.tsx`, `sample-data-panel.tsx`, `publication-controls.tsx` và `editor/section-editor.tsx` để dùng scene2/shared preview; giữ data1 catalog/asset scope, display sanitized layout/section issues, không customer album/audio fields (phụ thuộc T063, FR005/007/010/013).
- [X] T065 [US3] Implement duplicate2/remap và Admin save/conflict round-trip trong `apps/api/src/modules/invitation-builder/application/template-draft.service.ts` và `apps/web/src/features/invitation-builder/editor/section-adapter.ts`; source schema preserved, pinned revisions không sửa, stale save retains local changes (phụ thuộc T064, FR005/008/012).
- [X] T066 [US3] Author pilot2 bằng UI thật và xuất synthetic checked fixture vào `specs/007-responsive-invitation-layout/contracts/fixtures/pilot-v2.json`; hero/information/Image grid/RSVP, meaningful image alt, defaults balance390/900, publish qua real pipeline và không seed customer-facing catalog mặc định (phụ thuộc T065, FR001/005/009).
- [X] T067 [US3] Thực hiện manual conversion của một mẫu v1 vào separate draft2 theo `specs/007-responsive-invitation-layout/conversion-guide.md`; reuse authorized assets/data/bindings, explicit section composition/review, publish new revision và kiểm old invitation remains pinned, không y-coordinate inference hoặc bulk migration (phụ thuộc T066, FR012).
- [X] T068 [US3] Chạy tests T057–T059 và authoring gate bằng `scripts/responsive-validate.mjs --phase authoring`, ghi keyboard/save/reload/undo/conflict/duplicate/manual-conversion evidence trong `specs/007-responsive-invitation-layout/validation.md`; verify artwork không cover content khi names/errors dài (phụ thuộc T067, SC007).

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Hoàn tất evidence/regression/docs cho toàn release slice. Không deploy hoặc tuyên bố production readiness ngoài scope.

**Gate**: `node scripts/responsive-validate.mjs --phase all`≤45min và applicable independent checks trong quickstart. Cleanup report bắt buộc dù fail; không dừng service/DB người dùng hoặc xóa dữ liệu shared.

- [X] T069 Wire responsive runner/case reporting và required CI checks trong `scripts/responsive-validate.mjs`, `scripts/responsive-cases.json`, `.github/workflows/ci.yml`; đưa đúng prerequisites→tests→cleanup, run both app checks/real PostgreSQL/browsers, preserve existing CI scope và không deploy/publish externally (plan G/constitution V).
- [X] T070 Chạy targeted frontend/API format/lint/typecheck/unit/build, PostgreSQL contract/integration, health/script checks và impacted builder/frontend/auth-transition regression qua `scripts/responsive-validate.mjs`; ghi exact commands/env ownership/redacted outcomes tại `specs/007-responsive-invitation-layout/validation.md`, không coi fixture-only tests là full-stack PASS (FR008/quickstart).
- [X] T071 Chạy all gate với pilot thật trên Chromium/Firefox/WebKit và width360/375/390/430/767/768/900/1024/1440, verify SC001–SC007 và budgets/cleanup; ghi evidence + uncovered cases tại `specs/007-responsive-invitation-layout/validation.md`, sửa regression trước kết luận hoàn thành (phụ thuộc T070).
- [X] T072 [P] Sau evidence PASS, cập nhật runtime support/limitations và commands trong `docs/frontend/UI-DESIGN.md`, `README.md`, `specs/007-responsive-invitation-layout/quickstart.md`; phân biệt legacy scale và v2 flow, album tĩnh/binding hiện có, không đổi `docs/design/MASTER.md` (phụ thuộc T071, FR015).
- [X] T073 [P] Ghi readers-before-writers rollout, compatible binary rollback, guarded DB down và existing current-release/no-store policy trong `specs/007-responsive-invitation-layout/rollout.md`; không thực hiện deploy/downgrade hoặc thêm cache framework (phụ thuộc T071, FR008/009/013).
- [X] T074 Đối chiếu completed tasks/evidence với mọi FR/SC trong `specs/007-responsive-invitation-layout/tasks.md` và `validation.md`, rerun cross-artifact analyze read-only, rồi cập nhật `analysis.md` bằng bước ghi tài liệu riêng, ghi unresolved findings/blockers nếu có; chỉ đánh dấu task hoàn tất khi có evidence, không thay proposed MASTER decisions thành approved tự động (phụ thuộc T072/T073).

## Dependencies & Execution Order

```text
Setup T001–T006
  → Foundation T007–T018 (prototype → contract freeze → validators/resolvers/parity)
    → US1 T019–T030 (production renderer2)
      → US4 T031–T047 (migration/refs → capture → atomic publication)
        → US2 T048–T056 (data-only Customer + same-width surface parity)
          → US3 T057–T068 (Admin authoring + manual conversion)
            → Polish T069–T074 (CI/regression/evidence/docs)
```

- T001→T002→T003→T004; sau T004, T005→T006 sequential; T006 host smoke chờ provisioning T005; phase1 gate chờ cả hai và host smoke PASS. T007 chỉ bắt đầu sau setup.
- Foundation: T007→T008→T009→T010; T011/T012 song song; T013 chờ cả hai; T014/T015 song song; T016→T017→T018. Schema1 regressions gate trước story tasks.
- US1: T019/T020 song song sau foundation; T021 chờ tests; T022→T023→T024→T025→T026→T027→T028→T029→T030. CSS/module shared writes phải sequential.
- US4: T031/T032/T033 song song sau US1; T034 chờ tests; T035→T036→T037→T038→T039→T040→T041→T042→T043→T044→T045→T046→T047. T038 chỉ chạy T031 migration/reference races; T032/T033 publication cases chờ T044 và chạy tại T047. T038 không kiểm capture/finalization.
- US2: T048/T049/T050 song song sau US4; T051 chờ tests; T052→T053→T054→T055→T056.
- US3: T057/T058/T059 song song sau US2 trong recommended sequence; T060 chờ tests; T061→T062→T063→T064→T065→T066→T067→T068.
- US3 thực tế chỉ cần foundation+US1+US4 để authoring/publish; US2 không phải hard prerequisite của Admin UI. Tuy nhiên không chạy implementation stories đồng thời vì cùng sửa template services/preview/panels; có thể chuẩn bị test files khác nhau khi prerequisite fixtures sẵn.
- Polish: T069→T070→T071; T072/T073 song song sau PASS evidence; T074 chờ cả hai. Full evidence sau tất cả story checkpoints.

### Plan phases ↔ task phases

| Plan | Tasks | Output |
| --- | --- | --- |
| A baseline/prototype | T001/T002/T007/T008 | baseline, prototype width/state evidence |
| B contracts/tooling | T003–T006/T009–T018 | runnable runner, fixtures, frozen contract, parity |
| C persistence | T031–T038 | real PostgreSQL upgrade, refs, constraints |
| D shared render/surfaces | T019–T030/T048–T056 | intrinsic renderer, adaptive/mobile hosts, parity |
| E publication | T039–T047 | trusted two-width gate, atomic scenes, legacy support |
| F authoring/customer pilot | T048–T068 | Customer data flow, Admin pilot/conversion |
| G evidence/docs | T069–T074 | CI/regression, verification, docs/rollout |

Plan C and D are reordered into renderer-first → publication4 to make stories testable; renderer uses local fixtures until persistence/capture pass. No release writer enables before T038/T047.

## Parallel execution examples

These examples describe independent work allocation; task generation does not spawn agents or run implementation.

| Story / phase | Parallel task set | Prerequisite and join |
| --- | --- | --- |
| Setup | Không song song T005/T006 | Provision Vite/browser ở T005 trước smoke host T006; hoàn thành trước T007 |
| Foundation | T011 web schema + T012 API schema | T010 corpus frozen; join T013 |
| Foundation | T014 web resolver + T015 API resolver | T013 pass; join T016 parity |
| US1 | T019 unit regression + T020 browser matrix | T018 pass; join before renderer changes T021 |
| US4 | T031 migration tests + T032 publication contract tests + T033 races | T030 pass; join before migration T034 |
| US2 | T048 frontend tests + T049 API role tests + T050 Customer E2E | T047 pass; join T051 |
| US3 | T057 command tests + T058 API authoring tests + T059 Admin E2E | shared prerequisites and fixtures pass; join T060 |
| Polish | T072 runtime docs + T073 rollout guide | T071 evidence PASS; join T074 |

Parallelize writing tests in separate files, not running tests against the same DB fixture namespace or shared process without isolation. Tasks modifying the same service/module/CSS are deliberately sequential.

## Requirement traceability

| Requirement | Main implementation / verification tasks |
| --- | --- |
| FR001 section/intrinsic content | T007–T016, T023–T026, T063/T066 |
| FR002 adaptive widths | T008, T020/T022/T023/T029/T030/T053/T071 |
| FR003 mobile popup/Customer | T022/T048/T050/T052/T053/T056 |
| FR004 sizing/usable controls | T020/T024/T025/T030/T071 |
| FR005 Admin design | T009–T013, T035, T057–T066/T068 |
| FR006 Customer data-only/pinning | T048–T056 |
| FR007 shared renderer/parity | T014–T016/T028/T029/T044/T051–T056 |
| FR008 legacy/version support | T001/T010–T018/T019/T021/T029/T031–T035/T042/T044/T045/T047/T051/T058/T061/T070 |
| FR009 full snapshot/publication | T014–T017/T031–T035/T039–T047/T049/T054/T066 |
| FR010 readiness/diagnostics | T020/T026/T027/T032/T033/T039–T047/T064 |
| FR011 state/identity | T008/T019/T020/T023/T025/T027/T048/T050/T056 |
| FR012 conversion/new revision | T042/T045/T057–T059/T065/T067/T068 |
| FR013 nested refs/authorization | T010/T014–T016/T031/T033/T036–T038/T044/T045/T064/T073 |
| FR014 accessibility | T008/T020/T024/T025/T050/T059/T062/T063/T068/T071 |
| FR015 cover/platform boundaries | T029/T043/T053/T072 |

| Success criterion | Primary evidence |
| --- | --- |
| SC001 widths±1px | T020/T030/T071 |
| SC002 overflow/content fixtures | T020/T026/T030/T071 |
| SC003 same-width surface parity | T050/T055/T056/T071 |
| SC004 v1 compatibility | T001/T031/T045/T047/T070/T071 |
| SC005 RSVP resize state/no duplicate | T020/T030/T050/T056/T071 |
| SC006 failed publication preservation | T032/T033/T045–T047/T050/T071 |
| SC007 Admin/Customer keyboard journeys | T050/T056/T059/T068/T071 |

## Implementation strategy

**MVP demo slice**: Setup + foundation + US1, using local resolved pilot fixture to prove responsive900/reflow/state. This is a renderer demonstration, not a production release or completed007.

**Minimum public delivery slice**: US1+US4+US2 with seeded reviewed pilot revision; verifies compatibility, canonical publication and Customer data flow. If Admin authoring is deferred for a smaller delivery, record explicit scope decision; do not mark full feature007 complete.

**Complete feature007**: All four stories plus cross-cutting evidence/docs. Add authoring3 and manual conversion after trusted publication is operational. Readers/validators/migration precede v2 writer exposure; rollback preserves v2 read support. No automatic repin, bulk conversion, album-data/audio features, MASTER edits or hosting deployment.

At each checkpoint run bounded verification, fix failures and attach evidence before checking tasks off. Use existing project-owned infra and safe env configuration; never log secrets or erase unrelated working-tree changes. A gate failure does not waive deadline/compatibility/design review obligations.

## Generated task summary

| Category | Count |
| --- | ---: |
| Setup | 6 |
| Foundation | 12 |
| US1 (P1) | 12 |
| US4 (P1) | 17 |
| US2 (P1) | 9 |
| US3 (P2) | 12 |
| Polish | 6 |
| **Total** | **74** |

All74 tasks initially unchecked;17 tasks marked `[P]`. Before implementation, run `speckit-analyze` and review mandatory checklist/CRITICAL/HIGH findings. This tasks generation does not execute tests or implementation.

## Phase 8: Convergence

Assessment2026-10-11 after implement: requirements/spec/plan/tasks and constitution inspected against current source; no git comparison used. Initial polish evidence/docs remain governed by T070–T074. Additional gaps:

- [X] T075 [US4] Fix capture2 resolved-scene validation in `apps/web/src/features/invitation-builder/renderer/capture-protocol-v2.ts`: authored1MiB applies to candidate documents, not repeated resolved WeddingData1 widget content. Validate strict scene2 structure/semantics without conflating authored aggregate byte budget; retain per-content/schema/finite/count bounds and rejection of unknown fields. Add an independently resolved valid candidate whose repeated widget content exceeds1MiB and verify handshake validation succeeds while malformed payloads still reject (FR007/009/010; gap partial, HIGH).
- [X] T076 [US3] Complete real Admin keyboard/text200% evidence in `apps/web/e2e/invitation-builder/responsive-authoring.spec.ts`: create/author/reorder/history/save/reload/preview/publish through focused keyboard actions with enlarged text; assert usable controls and no horizontal overflow. Run all three browsers and retain Customer keyboard200% public RSVP evidence in the all gate (FR014, SC007; gap partial, HIGH).

## Phase 9: Convergence

- [X] T077 [US3] Fence manual-conversion source selection in `apps/web/src/features/invitation-builder/editor/section-editor.tsx`: cancel/dispose the previous source request on selection change and reject late result/error by selection generation, including A→B→A; retain owner lifetime guards. Verify delayed source A cannot replace source B or expose a copy action for stale content (FR012, US3/AC3, plan: owner/session reuse; partial, HIGH).


Execution complete2026-10-11:77/77 tasks checked, including convergence remediation T075–T077. Final responsive all, auth/frontend regressions, app quality/build, real PostgreSQL/storage/health and owned cleanup evidence: [validation.md](validation.md).
