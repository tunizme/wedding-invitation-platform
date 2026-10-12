# Chuẩn bị 005 song song với implementation 006

Current status2026-10-08: preparation below is historical.006 dependency is now verified; T001–004 resume/setup complete and entry gate opened after consumer alignment/re-analysis. See [verification](verification.md#resume--t001-consumer-alignment-2026-10-08).

Ngày: 2026-10-07. Phạm vi: review và documentation; application entry vẫn BLOCKED.

## Baseline và quyền sở hữu

HEAD tại review: `c763ef5f0fd0f0adeb706807b50ff629f1003ddf`, branch `master`. Working tree có tracked modifications và untracked implementation/artifacts 006, specs 005 và design docs. HEAD không đại diện đầy đủ snapshot đang review. Đây là quan sát tại thời điểm review; session 006 tiếp tục thay đổi code.

Tài liệu này là output riêng của session chuẩn bị 005. Không sửa spec/tasks/contracts 006, application code, package scripts, lockfile hoặc runtime resources. Không tick T001–T005: dependency chưa hoàn tất và setup tasks vẫn phải đi theo thứ tự đã định nghĩa trong [tasks](tasks.md).

## Preflight đã thực hiện

| Check                                  | Kết quả                  |
| -------------------------------------- | ------------------------ |
| `node --version`                       | v24.21.0                 |
| `pnpm --version`                       | 12.3.4                   |
| Installed Next / React / Playwright    | 16.3.5 / 19.3.0 / 1.63.0 |
| `timeout 60s pnpm scope:check`         | PASS, exit 0             |
| Application/browser/package acceptance | NOT RUN                  |

Plan ghi Next16/React19.2; cần đồng bộ installed/locked versions tại T003 sau handoff. Không thay dependency để khớp mô tả cũ.

Đã đọc installed Next guides: `01-app/01-getting-started/{11-css,13-fonts,03-layouts-and-pages}.md` và `01-app/03-api-reference/05-config/01-next-config-js/output.md` dưới `apps/web/node_modules/next/dist/docs/`. CSS Modules có local class scope; global CSS cần tránh rò style qua navigation. Local fonts áp class vào đúng subtree. Root giữ html/body; product provider có lifecycle riêng. Standalone không tự copy public/.next/static; cần packaged evidence thực tế sau T030–034. Đây là review local installed docs, không phải runtime proof.

## Checklist bàn giao 006 cho T001

- Actual contract/API/store events và revision bàn giao; phân biệt design proposal với implemented export.
- Admission gồm context/session/revision/principal; end-admission reasons và cách subscribe/cleanup.
- Same-principal/session renewal giữ edits; account/resource transition loại private subtree ngay khi snapshot đổi.
- NOT_DISPATCHED/COMPLETED/UNCERTAIN và next-action semantics; bounded recovery, không replay mutation tự động.
- Browser evidence cho late refresh/logout/password/login/onboarding responses, tab close/context loss, no-Web-Locks, OAuth stale callback; reload/renew phải xác nhận actual current identity.
- Contract/integration evidence bảo toàn CSRF, rotation/reuse/revocation/role/ownership; migration/cutover/rollback và limitations đã review.
- Commands, sanitized results, coverage, cleanup, failures/residuals; không dùng existing checked tasks hoặc source presence để suy runtime PASS.
- Sau handoff: cập nhật consumers trong session-boundaries/compatibility, tasks prerequisites và verification; chạy speckit-analyze, không còn unresolved mandatory/CRITICAL/HIGH trước code.

Nguồn: [006 frontend handoff](../006-iam-auth-transition-reliability/contracts/frontend-handoff.md), [005 dependency matrix](verification.md). T001/U1-B vẫn BLOCKED.

## Bản đồ vùng sửa sau handoff

| Vùng hiện có                                                                                                                                       | Owner / công việc 005                                          | Tránh conflict                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| identity-access/session/{store,session-provider,refresh-coordinator}.tsx hoặc .ts; api/client.ts                                                   | 006 sở hữu protocol; 005 consume admission và private lifetime | Không thêm selector/coordinator hoặc auth headers riêng; đọc lại actual exports |
| app/layout.tsx; app/(auth)/oauth-result/page.tsx; login/profile forms                                                                              | 006 đang sửa; 005 lifecycle và visual adoption sau US1         | Không relocate/restyle khi 006 còn implementation                               |
| identity-access/admin/customer-management.tsx; forms/{register-form,recovery-forms,social-onboarding-form,social-login-buttons}.tsx                | 005 scoped state và adoption                                   | Preserve generic messaging, native form semantics và existing contracts         |
| invitations/{customer-pages,customer-invitation-form,rsvp-management}.tsx và API clients                                                           | 005 principal/resource fences                                  | No Customer design mutations; same-owner renewal giữ drafts                     |
| invitation-builder/assets/{asset-library.tsx,use-asset-preview.ts}; editor/{template-editor,binding-panel,publication-controls,template-pages}.tsx | 005 fences rồi Drawer/Sheet                                    | Dispose uploads/pagination/Blob URLs; giữ Admin authoring và publish contracts  |
| app/i/[slug], app/internal/invitation-renderer; renderer/font-registry.ts và fonts.css                                                             | 005 isolation/package regression                               | Giữ pinned design, geometry/font/palette/readiness                              |
| src/ui/platform/ (chưa tồn tại)                                                                                                                    | Future T038–041 output                                         | Không tạo placeholder/application code trước entry gate                         |
| package.json, scripts/, test configs, shared infra                                                                                                 | Có overlap orchestration 006                                   | Runner 005 chỉ tạo sau setup; dùng owned resources, không reset shared infra    |

## Mapping UI đã duyệt để implementation tiêu thụ

Authority duy nhất: [MASTER](../../docs/design/MASTER.md), [platform UI contract](contracts/platform-ui.md). Không chọn lại visual direction.

| Primitive / asset       | Mapping và acceptance cần giữ                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button/action link      | Primary/hover MASTER, white text, radius8, khoảng46px; action dùng button, navigation dùng link; focus/disabled/busy                                |
| Field/TextField         | White, height44, radius8; meaningful input border dùng approved B01 `--color-control-border: var(--color-primary)`; label/helper/error associations |
| StatusBadge             | Text + semantic treatment, 24–26px/radius6/12px-500; warning text Espresso; không color-only                                                        |
| InlineAlert/LocalStatus | Persistent recovery/milestone, đúng live-region semantics; không false success                                                                      |
| PlatformPage            | Be Vietnam Pro; padding16/24/32; account reading720/Admin1120; typography chỉ chrome/controls                                                       |
| ModalSurface            | Native dialog; Drawer >=768px, Sheet <768px; contained/return focus, Escape, removed-trigger fallback                                               |
| Local font assets       | Be Vietnam Pro normal400/500/600/700; Cormorant normal500 editorial-only; future provenance/license/hash/Vietnamese coverage review                 |
| CSS ownership           | Tokens theo MASTER + CSS Modules; không body reset/font hoặc generic selectors tác động canvas                                                      |

## Acceptance inventory chuẩn bị cho T002

Ten adopted URLs: `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/social-onboarding`, `/oauth-result`, `/account`, `/admin/customers`, `/admin/customers/[customerId]`.

Six viewport cases: 360, 375, 390, 430, 768, 1440px. Keyboard, visible/unobscured focus, 200% text zoom, long Vietnamese/error content, reduced motion. Critical browser matrix Chromium/Firefox/WebKit theo quickstart; viewport/device scale không thay thế text zoom.

Audit: F01 private state, F02 packaging, F05 foundations, F10 library, F11 public isolation; F14 chỉ adopted feedback. Deferred F03/F04/F06/F07/F08/F09/F12/F13 và F14 ngoài scope. Không whole-product compliance/release-ready claim.

Bảng sau trích task references, đã expand các ranges như FR-001–003. Đây là draft trace inventory; còn cần đối chiếu từng scenario/suite/evidence và actual contracts để hoàn tất T002.

| Requirement / criterion | Tasks tham chiếu requirement                                                                                                 | Runtime evidence |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| FR-001                  | T001, T002, T007, T010, T012, T013, T014, T017, T018, T019, T020, T022, T023, T024                                           | NOT RUN          |
| FR-002                  | T001, T002, T007, T010, T011, T012, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023, T024                         | NOT RUN          |
| FR-003                  | T001, T002, T007, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023, T024                   | NOT RUN          |
| FR-004                  | T001, T002, T007, T026, T028, T029, T034, T045                                                                               | NOT RUN          |
| FR-005                  | T001, T002, T004, T007, T010, T011, T012, T014, T015, T016, T018, T019, T023, T024, T026, T028, T029, T034, T059             | NOT RUN          |
| FR-006                  | T002, T003, T007, T027, T030, T031, T034, T039, T046, T059                                                                   | NOT RUN          |
| FR-007                  | T002, T007, T021, T027, T032, T034, T059                                                                                     | NOT RUN          |
| FR-008                  | T002, T003, T007, T020, T026, T027, T029, T030, T032, T034, T037, T038, T039, T041, T045, T046, T053, T059, T060             | NOT RUN          |
| FR-009                  | T002, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T051, T060                                           | NOT RUN          |
| FR-010                  | T002, T036, T037, T040, T042, T043, T044, T045, T046, T060                                                                   | NOT RUN          |
| FR-011                  | T002, T037, T042, T043, T044, T046, T060                                                                                     | NOT RUN          |
| FR-012                  | T002, T036, T037, T040, T042, T043, T044, T046, T052, T060                                                                   | NOT RUN          |
| FR-013                  | T002, T036, T037, T040, T042, T043, T044, T046, T052, T060                                                                   | NOT RUN          |
| FR-014                  | T002, T004, T015, T018, T019, T024, T037, T042, T043, T044, T046, T059, T060                                                 | NOT RUN          |
| FR-015                  | T002, T037, T038, T041, T042, T043, T044, T045, T046, T060                                                                   | NOT RUN          |
| FR-016                  | T002, T008, T037, T041, T042, T043, T044, T045, T046, T049, T051, T060                                                       | NOT RUN          |
| FR-017                  | T002, T035, T036, T037, T040, T042, T043, T044, T045, T046, T051, T060                                                       | NOT RUN          |
| FR-018                  | T002, T036, T037, T038, T040, T042, T043, T044, T045, T046, T048, T050, T051, T060                                           | NOT RUN          |
| FR-019                  | T002, T008, T048, T049, T050, T051, T052, T053, T055                                                                         | NOT RUN          |
| FR-020                  | T002, T004, T007, T016, T022, T049, T052, T053, T055, T059                                                                   | NOT RUN          |
| FR-021                  | T002, T004, T007, T017, T049, T054, T059                                                                                     | NOT RUN          |
| FR-022                  | T002, T004, T007, T017, T020, T021, T049, T053, T054, T055, T059                                                             | NOT RUN          |
| FR-023                  | T002, T004, T007, T017, T049, T054, T059                                                                                     | NOT RUN          |
| FR-024                  | T001, T002, T004, T005, T006, T008, T009, T024, T025, T031, T033, T034, T046, T047, T055, T056, T057, T058, T059, T061, T062 | NOT RUN          |
| FR-025                  | T001, T002, T003, T005, T006, T009, T033, T035, T047, T057, T058, T059, T060, T061, T062                                     | NOT RUN          |
| SC-001                  | T001, T002, T010, T012, T025, T059                                                                                           | NOT RUN          |
| SC-002                  | T001, T002, T010, T012, T025, T059                                                                                           | NOT RUN          |
| SC-003                  | T001, T002, T026, T034, T059                                                                                                 | NOT RUN          |
| SC-004                  | T002, T027, T031, T032, T034, T059                                                                                           | NOT RUN          |
| SC-005                  | T002, T035, T037, T047, T059, T060                                                                                           | NOT RUN          |
| SC-006                  | T002, T035, T037, T047, T059, T060                                                                                           | NOT RUN          |
| SC-007                  | T002, T049, T056, T059                                                                                                       | NOT RUN          |
| SC-008                  | T002, T049, T054, T056, T059                                                                                                 | NOT RUN          |
| SC-009                  | T001, T002, T005, T006, T009, T025, T057, T058, T059, T061, T062                                                             | NOT RUN          |

## Lệnh bàn giao cho session implement 005

Sau 006 verified handoff, đọc preparation.md và actual 006 handoff/evidence; thực hiện T001–T005 theo thứ tự, đồng bộ consumer contracts và re-run speckit-analyze trước application code. Giữ MASTER/B01, Customer data-only, renderer và auth security contracts. Không lấy preparation/preflight PASS làm feature acceptance PASS. Sau entry gate mới thực hiện foundation → US1 → US2 → US3 → US4 → final verification.

Nếu tách worktree, trước hết đưa required untracked artifacts vào snapshot/commit có chủ đích cùng session 006; worktree từ HEAD hiện tại không có những artifacts đó. Không tự commit toàn bộ dirty working tree của session khác.
