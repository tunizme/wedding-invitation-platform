# Implementation Plan: Frontend Foundation & Reliability

**Branch**: `master` (actual Git branch, giữ nguyên) | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Feature identity**: `005-frontend-foundation-reliability`. `setup-plan.sh --json` trả identity này trong `BRANCH` từ active feature directory; không tạo Git branch mới.

**Input**: `specs/005-frontend-foundation-reliability/spec.md`.

**Status**: In progress — full prototype mapping and improved Admin authoring approved 2026-10-11. Historical T001–T101 checkpoint FULL PASS at `run-XjtXMT`; new T102–T114 require their own visual and functional acceptance.

## Summary

Feature xử lý private state theo principal/resource, public/capture session isolation, packaged fonts và shared platform foundations. Initial visual adoption giới hạn existing account journeys/Admin customer management; Admin media library dùng accessible Drawer/Full-screen Sheet. CSS Modules và local fonts thực thi MASTER, không thêm visual language/styling framework.

Customer chỉ sửa actual invitation data; MUST NOT sửa layout/style/binding, fonts/colors, section order/visibility hoặc crop/geometry. Preserve Admin authoring, pinned TemplateDesign, shared renderer và backend behavior của 004. Initial baseline đã hoàn tất; extension US5–US7 dưới đây bổ sung các surfaces được duyệt.

## Technical Context

| Item                 | Decision                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language/Version     | Node24, pnpm12.3.4, TypeScript5.9; Next16, React19.3.0 / Next16.3.5 theo installed/locked project                                                                                 |
| Primary Dependencies | Existing React/Next/Zod/Craft.js/Moveable/qrcode; CSS Modules, `next/font/local`, native dialog. Không thêm Tailwind/shadcn/Radix/animation framework                             |
| Storage              | Existing Nest11/TypeORM/PostgreSQL và S3/MinIO; frontend session/drafts in memory. No database migration/new persisted fields                                                     |
| Testing              | Vitest/Testing Library; Playwright1.63.0 với frontend config riêng; existing IAM/builder runners + disposable PostgreSQL/MinIO                                                    |
| Target Platform      | Web/Docker standalone; Chromium/Firefox/WebKit; 360/375/390/430/768/1440px, keyboard, 200% text zoom, reduced motion                                                              |
| Project Type         | Independently owned Next frontend + Nest modular monolith REST backend; root scripts orchestration only                                                                           |
| Performance Goals    | Interaction không bị motion trì hoãn; scoped async admission; no runtime/build external font fetch; bounded requests/gates theo contracts/quickstart. Không invent throughput/SLA |
| Constraints          | MASTER, practical WCAG AA, template CSS isolation, existing auth/ownership/CSRF/CAS/idempotency; no Customer design controls                                                      |
| Scale/Scope          | Existing Customer/Admin private-screen reliability; FR-011 account visual adoption; existing Admin library lifecycle. Không claim toàn product compliant                          |

Đọc installed Next guides theo `apps/web/AGENTS.md` trước future code changes. Research đã kiểm CSS Modules/fonts/standalone docs; implementation MUST kiểm guide tương ứng khi thay layout/font/build.

## Constitution Check

| Gate                 | Before Phase 0                                | After Phase 1                                                                                                                                                           |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Scope discipline  | PASS: FR-001–025 + explicit deferred findings | PASS: trace matrix, no speculative APIs/features                                                                                                                        |
| II. App independence | PASS: web owns UI/runtime                     | PASS: no cross-app runtime imports; app-owned fixtures, root orchestration                                                                                              |
| III. Reproducible DX | PASS: pinned tooling/runners                  | PASS at design level: bounded gates/prerequisites/cleanup; chưa runtime verify                                                                                          |
| IV. DB evolution     | PASS: no schema change                        | PASS: no new migration; future test runs existing migrations on owned disposable schema                                                                                 |
| V. Quality/config    | PASS: requirements checklist19/19 reviewed    | PASS at planning: app/contract/browser/package evidence planned; no secrets/private payloads logged                                                                     |
| Implementation entry | PASS cho planning                             | 006 verified; T001 consumer alignment/re-analysis PASS; implementation entry OPEN. Unchecked mandatory hoặc unresolved CRITICAL/HIGH findings MUST block implementation |

Không constitution exception/complexity waiver. Artifact completion không đồng nghĩa product PASS, release-ready hoặc deployment approval. `.specify/extensions.yml` không tồn tại; before/after plan hooks skipped.

## Architecture / Workstreams

### 1. Scoped lifetimes và requests — US1

Frontend session store thêm `identityEpoch`. Private owner key = account authorization context + epoch + resource, không token. Request generation xử lý query/reload/pagination. Extend reference `RsvpManagement`, giữ behavior đang đúng. Owner disposal loại records/drafts/status/cursors/assets/Blob URLs/timers/dirty registrations; renewed token cùng owner giữ local edits.

Review mọi private lifetime ở Profile, Admin customers, Customer invitation list/picker/form, Admin template list/create/editor, publication controls, asset library/preview và RSVP. Remove stale subtree ngay lúc session snapshot đổi, không chờ effect cleanup. Clients fence logical request qua 401; caller fence xuyên save→publish→poll→reload, kể cả catch/finally/navigation và request tiếp theo. Coordinator không để pending refresh/logout/password/profile completion overwrite account mới. [Session contract](contracts/session-boundaries.md) là acceptance boundary.

Auth transitions consume verified006 CSP-1 coordinator: server context/intent authority, immutable session slots, transactional IndexedDB selector and bounded refresh lease/single-flight. No second coordinator/exclusive cookie writer lock/internal ownership handle. Read `subscribe` + `get/admission` snapshots and end-admission events; `version()` includes renewal and is not stable identity epoch. Password/logout-all retain account-wide target revocation/original-session clear; OAuth full navigation is server-bound to its originating intent. Three knowledge outcomes and existing bounded read-only recovery remain006-owned;005 adds principal/resource fences. Final006 browser208/208 plus HTTP/PostgreSQL/security evidence satisfy dependency feasibility; historical baseline005 full runtime acceptance PASS is recorded in verification.md; the approved extension has its separate final gate.

Verification selectors `unit/browser/package` default require full-feature phase coverage; optional `--through US1|US2|US3|US4|US5|US6|US7` chọn explicit dependency closure với report `coverage: PARTIAL`. `all` reject `--through`, luôn require full manifest. Stage expectations không tự đổi theo files đã implement; missing required suites fail. Chi tiết selection và commands ở quickstart.

### 2. Product/public boundary và package — US2

Minimal root; URL-preserving `(product)` layout mount SessionProvider. Existing `(auth)` chuyển dưới product group; `/i/[slug]`, `/internal/invitation-renderer`, health ở ngoài. Không đổi URLs/dynamic params/redirects/auth rules. Existing root Foundation page có thể thuộc product group, không redesign nội dung.

Coordinator chuyển module-level BroadcastChannel initialization sang explicit provider start/stop; navigation guard cũng product lifecycle. Direct public load không import product session runtime; product→public cleanup ngăn lingering effects. Không logout chỉ vì mở invitation.

Docker runner copy `apps/web/public` cạnh standalone server. Package gate riêng kiểm actual fonts/readiness, không coi `next start` là standalone evidence. Keep Noto IDs/manifest/hash/licenses, pinned renderer và failed-publication behavior. [Compatibility contract](contracts/compatibility.md).

### 3. Foundations / initial adoption — US3

CSS variables mapping từ MASTER + CSS Modules; shared Button, Field/TextField, StatusBadge, InlineAlert/LocalStatus, PlatformPage và ModalSurface. No global body/font/reset hoặc generic descendant selectors ảnh hưởng canvas. Platform typography classes chỉ trên chrome/control subtrees; local fonts ở web-owned `src/ui/platform/fonts/`, licensed provenance/checksum review trong future asset task. Be Vietnam Pro normal400/500/600/700; Cormorant normal500 chỉ editorial role. Không đổi invitation font registry.

Adopt `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/social-onboarding`, `/oauth-result`, `/account`, `/admin/customers`, `/admin/customers/[customerId]`. Preserve generic registration/recovery, proofs, autocomplete/password managers, LOCAL/social distinctions, profile patch fields và lock/unlock confirmation. Provider controls dùng platform styling nhưng không trở thành new marketplace navbar/workspace toolbar. [UI contract](contracts/platform-ui.md).

### 4. Admin library — US4

Native modal dialog, right Drawer ≥768px và Full-screen Sheet <768px. Header/name/close reachable, scrollable content; existing search/filter/mine/upload/more/select giữ authorized behavior. Test TemplateEditor và BindingPanel triggers, containment/inert/Escape/selection/return focus/safe fallback. Owner/generation guard ngăn old upload/more chọn ảnh vào newer account/design. Không Customer access Admin library, không Admin canvas/mobile authoring redesign.

## IAM Dependency / Implementation Entry

[006 IAM Auth Transition Reliability](../006-iam-auth-transition-reliability/spec.md) là explicit prerequisite cho application implementation của 005. 006 is completed/verified: final `.artifacts/auth-transition/run-Lt4lxU/`, IAM all and owned production health PASS. Actual exports/contracts/limitations are recorded in the006 frontend handoff and005 session/compatibility contracts. T001 resolves historical lock/singleton-writer assumptions and re-analysis before application entry.005 owns principal/resource disposal and adoption; it adds no IAM protocol, backend contract or migration. Dependency is not circular and acceptance remains feature-specific.

## Project Structure

### Documentation (this feature)

```text
specs/005-frontend-foundation-reliability/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/requirements.md
└── contracts/
    ├── session-boundaries.md
    ├── platform-ui.md
    └── compatibility.md
```

`tasks.md` contains101 implementation/governance/verification tasks:85 historical baseline tasks and16 approved extension tasks. Current completion and remaining acceptance tasks are tracked there and in verification.md. Analysis/remediation alone does not complete application acceptance.

### Source Code (implemented ownership)

```text
apps/web/
├── src/app/layout.tsx                        # minimal root
├── src/app/(product)/layout.tsx              # provider; URLs unchanged
├── src/app/(product)/(auth)/...              # existing auth pages relocate
├── src/app/(product)/...                     # existing product pages relocate
├── src/app/i/[slug]/page.tsx                  # outside product
├── src/app/internal/invitation-renderer/...  # outside product
├── src/features/identity-access/{session,forms,admin,api}/
├── src/features/invitations/
├── src/features/invitation-builder/{api,assets,editor,renderer}/
├── src/ui/platform/                          # scoped tokens/primitives/fonts
├── tests/{identity-access,invitation-builder,frontend-foundation}/
├── e2e/frontend-foundation/
├── playwright.frontend.config.ts
├── public/fonts/invitation-builder/          # existing, unchanged assets
└── Dockerfile                               # standalone public copy
scripts/frontend-validate.mjs                 # frontend orchestration
scripts/tests/frontend-validate.test.mjs
apps/api/test/fixtures/invitation-builder/    # app-owned fixture reuse
```

Tree records implemented ownership; it does not authorize empty placeholders. Backend application code/contracts MUST giữ nguyên; fixture support không new business capability.

## Requirement / Audit / Verification Trace

| Work package                         | Requirements       | Audit             | Evidence / success criteria                                              |
| ------------------------------------ | ------------------ | ----------------- | ------------------------------------------------------------------------ |
| Epoch/owner/disposal                 | FR-001, FR-003     | F01               | account switch/logout/A→B→A/renewal, SC-001–002                          |
| Clients/coordinator/operation chains | FR-002, FR-005     | F01               | stale401/completion/continuation/navigation/password/profile, SC-001–002 |
| Surface/lifecycle isolation          | FR-004             | F11               | direct+client navigation, no chrome/refresh, SC-003                      |
| Package/fonts/truthfulness           | FR-006–007         | F02               | standalone hashes/readiness/injected failures/prior snapshot, SC-004     |
| Template CSS/output compatibility    | FR-008             | F02/F05 boundary  | same scene geometry/fonts/palette unchanged, SC-003–005                  |
| Tokens/primitives/adoption           | FR-009–011, FR-015 | F05 foundations   | all ten routes/control states, SC-005                                    |
| Forms/feedback/account semantics     | FR-012–014         | F14 in-scope      | associations/generic errors/milestones, SC-005–006                       |
| Responsive/a11y/motion               | FR-016–018         | F05/F10           | widths/keyboard/text zoom/contrast + R06 approval, SC-006                |
| Library/asset behavior               | FR-019–020         | F10               | both triggers/lifecycle/upload/query/pagination, SC-007                  |
| Customer/Admin/optional behavior     | FR-021–023         | 004               | zero Customer design mutation, Admin tools preserved, SC-008             |
| Authority/evidence/gates             | FR-024–025         | selected findings | tasks trace, analysis and honest outcome reports, SC-009                 |

## Implementation Notes / Open Questions

### B01 — APPROVED: Functional input boundary

**Approval:** 2026-10-06, project owner: “cứ xử lí như bạn đề xuất”, chấp thuận narrow proposal ở previous response. Authority nằm tại [MASTER](../../docs/design/MASTER.md#approved-change-b01--functional-input-boundary); evidence tại [verification](verification.md#b01--design-approval).

Enabled platform input có border là sole meaningful boundary MUST dùng `--color-control-border: var(--color-primary)`. Baseline `--color-border` vẫn `#E5DCCE` cho decorative borders/dividers; white background, height44/radius8/type/focus giữ nguyên. Không blanket recoloring các controls khác hoặc thay template design. B01/I1 authority conflict resolved; actual rendered contrast/state evidence is tracked at T036/T037/T047/T060 and verification.md; approval alone does not establish runtime PASS.

Warning/placeholder/accent giữ role-safe compositions tại [research R06](research.md). Approval chỉ documentation/design rule, không authorize application/backend implementation hoặc waive U1-B gate. Missing backend capability vẫn phải record BLOCKED theo MASTER.

### U1 — Verified dependency and005 outcomes

Historical frontend-only exclusive-lock policy is superseded by actual006 CSP-1. T001 aligns consumer snapshots, intents, immutable slots, refresh lease and original-session clear semantics, then re-runs analysis. U1-B backend feasibility is satisfied by final006 evidence;005 US1/private state/renewal/browser outcomes passed T010–025 and the final full matrix; see verification.md. Abort/body discard/lock release are not cookie proof. No live-provider/production HTTPS claim.

### Deferred findings

Historical baseline deferral: F03/F04/F06/F07/F08/F09/F12/F13 và F14 ngoài adopted controls giữ backlog. Approved US5–US7 extension supersedes deferral for the scoped gallery/workspace/editor and uncertain-publication recovery described below. Renderer reflow/metadata changes and autosave remain outside005. Customer design editing **prohibited**, không deferred.

## Planning Definition of Done (historical checkpoint)

- [x] Research có source rationale/alternatives; ui-ux-pro-max chỉ targeted guidance trong MASTER.
- [x] Model/contracts/quickstart và trace matrix hoàn tất; constitution re-check/hooks check.
- [x] Không app code/routes/dependencies/migrations thay đổi; conflict giữ explicit blocker.
- [x] `speckit-tasks` đã tạo dependency-ordered tasks và verification prerequisites.
- [x] Initial `speckit-analyze` đã chạy, ghi I1/U1/I2/I3 findings; đây không phải readiness PASS.
- [x] T001 resolved006 dependency feasibility/consumer alignment; re-analysis has zero CRITICAL/HIGH.005 runtime acceptance remains pending.
- [x] Explicit B01 default-boundary approval đã ghi trong MASTER và verification; documentation task T035 hoàn tất.
- [ ] Implementation acceptance evidence cho boundary/states; docs không thay runtime PASS.

## Extension plan — US5–US7 (2026-10-11)

Scope/authority: FR-026–031, SC-010–012; [UI-DESIGN](../../docs/frontend/UI-DESIGN.md), MASTER. Không đổi baseline T001–085 hoặc ghi đè evidence cũ.

1. US5: product-only `ui/product/product-shell.tsx` + CSS Module, session disclosure dùng sessionStore; SessionProvider giữ bootstrap/peer/dirty lifecycles và option ẩn chrome cũ. Home server component dùng local branding/illustration, không mock catalog. Root metadata/favicon; public/capture vẫn ngoài `(product)`.
2. US6: mở rộng invitations API read revision bằng builderRequest/scoped options; gallery popup native modal reuse platform surface, protected asset Blob URLs scoped/revoked. Demo route dưới product có opening; renderer preview mode, mobile popup/adaptive demo. Create giữ current pinned revision và recovery. Workspace sidebar/overview dùng owner hooks; profile reuse ProfileForm.
3. US7: giữ customer-invitation-form functional core, nhóm field vào details/summary và tabs; manual save với expectedVersion, giữ edits mới và recovery cùng publication attempt khi outcome uncertain; không bật autosave. Không rewrite publication coordinator hoặc renderer. Polish RSVP/Admin/auth qua primitives, không mất chức năng.
4. Verification: tests targeted mỗi increment; cuối cùng independent web lint/typecheck/build/unit và existing frontend/browser/package, IAM/builder compatibility theo quickstart. Evidence mới ghi riêng, không dùng baseline PASS để đóng extension.

Data model: không persisted entities mới; UI state gồm disclosure, selected template revision, demo open, editor tab; owner-bound state disposed khi admission đổi. Demo URL lấy route thực và current revision, không lưu proof/token vào URL. Assets template được đọc theo template+revision+asset, không đổi storage policy.

Constitution extension review: scope explicit/authorized; app independence preserved; no DB migration; pinned tooling/local assets; tests và deadlines/owned cleanup theo baseline. Không phát hiện exception. Không có hooks configuration. Execution tuần tự US5→US6→US7; MVP đầu tiên là US5. Parallel opportunity chỉ các test files độc lập, không yêu cầu subagents.


## Complete prototype mapping implementation plan (2026-10-11)

US8–US10/FR032–036 extend the completed baseline and first prototype integration. Build an explicit screen/control matrix before source changes. Use existing scoped CSS modules/platform primitives and local prototype assets/copy. No global descendant styling into invitation renderer. No new dependencies/backend endpoints/migrations.

Parallel ownership: Admin list/new template-pages and its CSS; Admin authoring editor files/panels and scoped CSS; Customer editor/date/media/publication and scoped CSS; root owns shared shell/home/auth/account/RSVP, SpecKit artifacts and acceptance orchestration. Shared files are serialized. Each contributor reads MASTER/Next docs and runs appropriate targeted checks.

Preserve state/lifetime cores and actual API labels where tests rely on semantics; adapt selectors only for genuine interaction changes, never weaken outcomes or budgets. Native accessible surfaces and44px functional boundaries remain. New create enhancements explain existing schema paths rather than inventing new products. Customer datetime conversion uses the declared timezone, never silently browser-local reinterpretation.

Visual loop: capture paired prototype and actual screen views at390/1440 after fonts/images ready; review contact sheets and named regions, classify intended real-data/renderer differences, fix unintended gaps, recapture. Add real-backend cases for changed interactions to the explicit frontend registry. Final full gate retains budgets/owned disposable resources; manual3000 and prototype3300 stay available, restart manual FE only after final build.

Constitution reviewed: scope explicitly authorized, FE/BE independently runnable, pinned tooling/local assets retained, no schema evolution needed, verifiable visual plus behavior evidence required. No hooks configuration.
