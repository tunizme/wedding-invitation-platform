# Tasks: Cinelove capabilities and 500px canvas

Input: approved spec.md, plan.md, research.md, data-model.md, contracts/editor.md and quickstart.md.

## Phase 1: Setup

- [x] T001 Record approved scope, clarification answers, design research and interfaces in specs/008-cinelove-editor/.
- [x] T002 Verify project ignores and installed Next/UI UX Pro Max guidance in apps/web/AGENTS.md and docs/design/MASTER.md.

## Phase 2: Foundation

- [x] T003 Add editor-document schema parity/conversion rejection tests in apps/api/test/unit/invitation-builder/editor-document.spec.ts and apps/web/tests/invitation-builder/editor-document.test.ts.
- [x] T004 Implement strict editor-document document/content/scene contracts, independent validators/resolvers and version dispatch in apps/api/src/modules/invitation-builder/domain/ and apps/web/src/features/invitation-builder/document/ per FR-001/002.
- [x] T005 Add migration/schema compatibility and new media/interaction tables in apps/api/src/infrastructure/database/migrations/20261012000100-ExpandedInvitationEditor.ts per FR-001/005/007.

Verification: owning app typechecks/unit tests, bounded Vitest runs; no live DB mutations.

## Phase 3: US1 — Admin authors500 (P1)

Independent acceptance: create/save/reopen/publish500; fresh editor-document/content2 data; conflict/recovery protected.

- [x] T006 [US1] Implement the single500 new-template default and duplication handling in apps/api/src/modules/invitation-builder/application/template-draft.service.ts per FR-002.
- [x] T007 [US1] Implement scaled renderer/capture and thumbnail metadata compatibility in apps/web/src/features/invitation-builder/renderer/ and apps/api/src/modules/invitation-builder/publication/ per FR-002/009.
- [x] T008 [US1] Add validated command/history/group/clipboard/align/distribute/snap operations in apps/web/src/features/invitation-builder/editor/editor-commands.ts per FR-003.
- [x] T009 [US1] Implement contextual editor/properties/library and500 default dispatch in apps/web/src/features/invitation-builder/editor/invitation-editor.tsx and template-pages.tsx per FR-003.
- [x] T010 [US1] Implement owner-scoped serialized autosave/recovery/logout purge in apps/web/src/features/invitation-builder/editor/draft-recovery.ts and invitation-editor.tsx per FR-004.
- [x] T011 [US1] Verify old-authoring rejection, capture and save-account/conflict races in apps/web/tests/invitation-builder/ and apps/api/test/contract/invitation-builder/ per SC-002/003/005.

Verification: bounded web/API tests and owned browser tests; cleanup browser contexts.

## Phase 4: US2 — Libraries and customer content (P1)

Independent acceptance: admin media/preset pilot -> customer content -> public widgets.

- [x] T012 [US2] Add audio validation/reference tests in apps/api/test/unit/invitation-builder/ and integration tests for preset-only references in apps/api/test/integration/invitation-builder/ per FR-005.
- [x] T013 [US2] Extend durable uploads/writes/request boundaries and references for audio and media in apps/api/src/modules/invitation-assets/ and common/http/request-boundaries.ts per FR-005.
- [x] T014 [US2] Implement admin versioned preset library with reference protection in apps/api/src/modules/invitation-builder/application/editor-preset.service.ts and http/editor-preset.controller.ts per FR-005.
- [x] T015 [US2] Add multi-file progress/internal stock/audio/preset UI in apps/web/src/features/invitation-builder/editor/asset-library.tsx per FR-005.
- [x] T016 [US2] Implement advanced widgets and binding-derived content fields in apps/web/src/features/invitation-builder/renderer/content-widgets.tsx and features/invitations/customer-invitation-form.tsx per FR-006.
- [x] T017 [US2] Verify content2/asset ownership and media widget rendering in apps/api/test/contract/invitation-builder/ and apps/web/tests/invitation-builder/ per SC-001/004.

Verification: PostgreSQL isolated fixtures release connections/drop only owned test schema; unit tests and browsers bounded.

## Phase 5: US3 — Guest interactions (P1)

Independent acceptance: submit/retry/moderate/owner read, privacy and availability enforced.

- [x] T018 [US3] Add transaction/idempotency/ownership/rate tests in apps/api/test/integration/invitation-builder/interactions.spec.ts per FR-007.
- [x] T019 [US3] Implement wishes/likes/forms/public availability and moderation audit in apps/api/src/modules/invitation-interactions/ per FR-007.
- [x] T020 [US3] Implement guest controls and owner/admin moderation and owner-only form UI in apps/web/src/features/invitations/interaction-pages.tsx and invitation-builder/renderer/content-widgets.tsx per FR-007.
- [x] T021 [US3] Verify retry/unpublish/schema-change/concurrent-like and private-reader behavior in apps/api/test/contract/invitation-builder/ and apps/web/e2e/invitation-builder/invitation-editor.spec.ts per SC-004.

Verification: bounded isolated PostgreSQL/browser tests; no live submissions.

## Phase 6: US4 — Presentation (P2)

Independent acceptance: effects/music/locale/sharing publish with static capture and motion alternatives.

- [x] T022 [US4] Implement envelope/effects/particles/music/autoscroll/toolbar/reduced-motion in apps/web/src/features/invitation-builder/renderer/invitation-presentation.tsx per FR-008.
- [x] T023 [US4] Implement published-only metadata/locale and static capture states in apps/web/src/app/i/[slug]/page.tsx and invitation-builder/renderer/ per FR-008/009.
- [x] T024 [US4] Verify vi/en labels/autoplay/pause/reduced-motion/off-origin capture in apps/web/tests/invitation-builder/ and apps/web/e2e/invitation-builder/invitation-editor.spec.ts per SC-006.

Verification: bounded cross-browser suite; owned browser contexts cleaned.

## Phase 7: Cross-cutting verification

- [x] T025 Run independent lint/typecheck/test/build, migration/contracts/health and complete fresh-data pilot; record evidence and operational defaults in specs/008-cinelove-editor/quickstart.md per SC-001..006.

## Dependencies & Execution Order

T001/002 -> T003..005 -> US1 -> US2 -> US3 -> US4 -> T025. Within stories, tests precede code and validation follows integration. [P] is intentionally omitted for implementation: shared interfaces require sequential integration. Independent web/API validation commands may run concurrently after edits settle.

## Parallel Examples

US1: independent web/API schema tests. US2: frontend media unit suite and backend storage unit suite. US3: PostgreSQL integration must own a distinct schema; frontend mock tests can run alongside. US4: isolated Chromium/Firefox/WebKit contexts after shared renderer changes settle. No shared-file concurrent edits.

## Implementation Strategy

Deliver full-stack500 foundation first, then libraries/content, interactions and presentation. The single editor is always used; version selectors and creation fallback flags are removed. Validate each story before proceeding; full approved scope remains required and incomplete tasks stay unchecked.

## Phase 8: Convergence

- [x] T026 Complete the real admin/customer/publication/guest/owner browser pilot with fresh editor-document/content2 data at 320/375/390/500/desktop in apps/web/e2e/invitation-builder/invitation-editor.spec.ts and scripts/responsive-product.mjs per SC-001/002/003/004 and T011/017/021/024/025 (partial).
- [x] T027 Verify and protect scoped recovery deletion, expiry, blocked storage and save serialization races in apps/web/src/features/invitation-builder/editor/draft-recovery.ts, invitation-editor.tsx and apps/web/tests/invitation-builder/ per FR-004/SC-005 (partial).
- [x] T028 Provide mobile tool/property drawers with keyboard and focus restoration in apps/web/src/features/invitation-builder/editor/invitation-editor.tsx and invitation-editor.module.css per FR-003/SC-006 and ui-ux-pro-max responsive guidance (partial).
- [x] T029 Complete local font/library discovery and per-file upload feedback, and record the concrete Cinelove capability comparison in specs/008-cinelove-editor/quickstart.md per FR-005/US2/AC1 (partial).
- [x] T030 Document configuration ownership, the single-editor default and independent bounded verification evidence in apps/api/src/config/, example environment files and specs/008-cinelove-editor/quickstart.md per plan: single-editor creation and Constitution III/V (partial).

Scope revision (2026-10-12): the user removed existing-data preservation and conversion acceptance. T025/T026 now gate the fresh editor-document/content2 pilot. Phase9 supersedes this earlier revision: old editor/conversion entry points are removed and the local invitation database/media are explicitly reset while accounts remain.

## Phase 9: Single-editor scope revision

- [x] T031 Remove selectable legacy layouts, conversion UI/endpoint and creation fallback flags; enforce500 template creation/save/duplication per FR-010.
- [x] T032 Add a local-only destructive invitation/media reset command and execute it while preserving accounts per FR-011 and Constitution III.
- [x] T033 Verify single-editor UI and rejection contracts plus real fresh-data browser pilot; update operational/parity evidence per FR-010/SC-007.

- [x] T034 Match the supplied Cinelove new-blank layout, collapsible panels, floating zoom, background palettes and upload dropzone; verify desktop/mobile usability per FR-012/SC-008.

## Phase 10: Source cleanup

- [x] T035 Remove obsolete editor implementations and version-based runtime dispatch; rename current modules and symbols by function, retaining immutable migration history and persisted schema identifiers per FR-013.
- [x] T036 Verify document rejection, editor/publication flows, typecheck, lint and relevant tests after cleanup; record evidence per SC-009.

## Phase 11: Cinelove parity gap closure (2026-10-13)

Source: browser survey of cinelove.me/editor/new-blank vs feature 008. Scope rule: **premium/paid Cinelove features are excluded** (envelope/intro effects, falling/particle effects, album/YouTube/custom form/guest-name/QR Box multi-account, advanced RSVP fields, own-music upload, watermark, plans, "Thư viện thiệp"). Library seed data copies Cinelove's category taxonomy and counts only; artwork/audio are original or generated placeholders (FR-005 forbids foreign artwork). Order: T037 -> T038..T041 -> T042..T046 -> T047.

### US5 — Editor operations (P1)

- [x] T037 [US5] Add failing tests then implement: cut (Ctrl+X), right-click context menu (copy/cut/paste/duplicate/delete/z-order/lock), text strikethrough (`TextStyle`, API+web parity), triangle shape, and colour-picker controls replacing hex text fields in apps/web/src/features/invitation-builder/editor/{invitation-editor,properties-panel,editor-commands}.tsx and api/web editor-document validators per FR-014.
- [x] T038 [US5] (height stepper, locate/delete by ID in Lớp, per-side border `border.position`, separate `textStyle.textShadow`) Add canvas-height −/+ stepper and numeric input (500–16000), per-side border position/width, separate text shadow, and "Tìm phần tử theo ID" locate/delete action in the editor header/properties per FR-014.
- [x] T039 [US5] Add whole-page preset entrance animations (None, Fade In All, Slide Up All, Scale In All, Flip In All, Slide Up Mix, Fade In Mix) in the Hiệu ứng tab with preview; schema field `settings.pageAnimation`, honours reduced motion, per FR-014/FR-008.

### US6 — Widget configuration parity (P1, free widgets only)

- [ ] T040 [US6] (Calendar `variant`; Countdown `layout`/`gap`/`frameColor`; "show 2 days" and date/time picker not done: the date comes from the bound event) Calendar: pick date, "show 2 days", style variants, theme colour; Countdown: time picker, horizontal/vertical layout, gap, frame/background colours, in content-widgets.tsx + properties per FR-015.
- [ ] T041 [US6] (Contact `showIcon`/`buttonColor`/`textColor`; Reminder `description`/`location`/`allDay`; Map unchanged: address and coordinates already come from the bound venue) Call button: icon visibility/size/colour, button/text/background colour; Map: address-or-coordinates input with coordinates precedence; Reminder: description, location, all-day vs timed, end date, event image, UTC+7 note, per FR-015.
- [ ] T042 [US6] (RSVP `nameLabel`/`submitLabel`/`buttonColor`/`buttonTextColor`) RSVP form: field labels (title, name, attendance, submit), form colour set (text, background, input border, submit button/text); fixed fields stay free-tier (no transport/side fields), per FR-015.
- [x] T043 [US6] Carousel: transition effects (Zoom/Switch/Overlap/Fade), duration (s), delay (s), autoplay with pause control honouring reduced motion, per FR-015/SC-006.

### US7 — Library taxonomy and seed data (P1)

- [ ] T044 [US7] Add category to stock assets and presets (migration + API filter + admin tagging), category chips and "Xem thêm" sections in asset-library.tsx; preset categories Tất cả/Ảnh/Thông tin/Lịch trình/Lời mời/Khác per FR-016.
- [x] T045 [US7] Music library: categories (Tất cả/Nhạc ngoại/V-POP), duration display, non-destructive trim (start/end) stored on the reference, music-icon style (6 variants) and icon colour in the Âm nhạc tab and public toolbar, per FR-016.
- [x] T046 [US7] (implemented with CC0/public-domain Openverse media instead of generated placeholders: `apps/api/scripts/library-fetch-open.cjs` -> `.artifacts/library-seed/manifest.json` with licence/source per item; `pnpm --filter @wedding/api library:seed:local -- --seed-library`; 166 rows seeded: 141 stock/19 categories, 8 backgrounds, 17 audio/2 categories; local dev data lives in bucket `builder-test-frontend` under `development/` because SeaweedFS `volume.max 16` cannot allocate a new bucket) Local seed command (`pnpm --filter @wedding/api library:seed:local`, local-only, idempotent, rejects production): stock taxonomy (Yếu tố đám cưới, Văn hóa Việt, Nhân vật, Hoa cưới, Chữ hỷ, Trái tim, Kết hợp chữ, Số và chữ cái, Trang trí không gian, Chúc mừng sinh nhật, Mặt trời, Lễ hội nổi bật, Ngôi sao, Mẹ và bé, Biểu tượng lưu đồ, Bản đồ, Hình dạng, Khung viền, Đường phân cách) with generated original SVG assets; preset set per category; music categories with generated royalty-free tones; stored via the durable asset path per FR-016/FR-011.

### Verification

- [ ] T047 (done 2026-10-13: pilot 3/3 Chromium/Firefox/WebKit, web 523/523 + new schema tests, API unit 87/87, builder integration 131/133 with 2 MinIO-policy tests failing on SeaweedFS by design; also fixed line shape rendering, Effects/Settings split; WebKit mobile drawer focus fixed via explicit `returnFocusRef` + pointerdown fallback in `ui/platform/modal-surface.tsx`; three-browser pilot 3/3, web 523/523, API unit 87/87, typecheck/lint pass; remaining: re-verify after T038/T040–T042 and update quickstart.md parity table) Re-run independent web/API unit, contract/integration and Chromium/Firefox/WebKit pilot on the Windows runtime (`.artifacts/local/test-env.ps1`); fix the open WebKit mobile drawer focus-restoration failure (invitation-editor.spec.ts:101); update quickstart.md parity table and evidence per SC-010.


## Phase 12: Session integration and follow-up (2026-10-13, Linux)

- [x] T048 Import the 50-file session overlay into the existing working tree, retain pre-existing source cleanup, and save a pre-merge archive, tracked diff, status and SHA-256 manifest. Apply AssetLibraryCategories to the local development database.
- [x] T049 Repair carousel focus/hover/reduced-motion handling and cancel interrupted animations; export all-day reminders using the event time zone. Add contact/reminder/carousel regression tests.
- [x] T050 Make the element context menu keyboard-operable, return focus without clearing selection, clamp it to the viewport and disable cut/delete for locked elements. Verify cut/paste and saved Phase 11 widget options in Chromium/Firefox/WebKit.
- [x] T051 Preserve a zero countdown gap, send preset category filters on every API page, translate sample-photo labels and display template covers through authenticated, scoped blob requests.
- [x] T052 Fix strict API lint findings, add independent API validation tests for optional presentation fields, replace stale resolver-script references with native500 FE/API parity, and record merge/test evidence and actual remaining scope in quickstart.md.

### Remaining scope (unchecked tasks above are partial, not unimplemented)

- T040: calendar second-day display and direct date/time controls are absent; dates currently come from bound sample/customer events.
- T041: contact icon size/color and reminder end date/event image are absent; map address/coordinates remain in bound event data. The all-day time-zone bug is fixed in T049.
- T042: name/submit labels and submit colors exist; attendance label and remaining input/form colors still need configuration.
- T044: category schema/API filtering and chips exist; an administrator tagging UI and grouped “Xem thêm” sections still need completion. Preset server-side filtering is fixed in T051.
- T047 / SC-010: the expanded pilot verifies menu/cut/paste and persistence of six widget types. It does not yet demonstrate every FR-014..016 item (notably music trim/icon playback and all page animations), nor replace screenshot review of the final effects/layers panels.
- Header/account-menu visual alignment remains pending. Template cover thumbnails and Vietnamese sample-photo labels are completed in T051.
- T046 delivered a local Openverse CC0/Public Domain importer rather than the originally described generated assets/preset set. The downloaded media and source-machine database were not included in the session overlay. Catalog completeness and original preset generation remain separate follow-up work; historical row counts are not evidence of data seeded on this machine.
