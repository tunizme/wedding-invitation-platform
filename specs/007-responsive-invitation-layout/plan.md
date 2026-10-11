# Implementation Plan: Responsive Invitation Layout

**Branch**: Spec Kit `007-responsive-invitation-layout`; Git thực tế `master` trong bước planning.
**Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)
**Input**: `specs/007-responsive-invitation-layout/spec.md`, dựa trên `docs/frontend/DESKTOP-900-PLAN.md`.
**Status**: Development plan đã chốt theo remediation được người dùng đồng ý ngày 2026-10-11; chưa triển khai, chưa đổi MASTER.

## Summary

Bổ sung document/scene v2 theo section flow/grid và artwork absolute trong section; giữ document/renderer v1 nguyên trạng qua adapter version. V2 render responsive theo container, mobile max480 dưới768 và desktop max900 từ768; Customer editor/shared mobile preview host giới hạn390. Production demo/popup mới ngoài phạm vi; parity bắt buộc Customer preview/public, bổ sung Admin preview ở authoring gate. Không scale toàn trang, không duy trì hai scene và không suy diễn section từ canvas cũ.

Đi xuyên pipeline thật: types/schema/validator/resolve ở cả hai app → renderer/authoring → migration constraints → publication/capture → pinned/public projection → assets/cleanup → compatibility. Mẫu pilot phải dùng cùng binding/data/renderer như production. Quyết định chi tiết tại [research.md](research.md), [data-model.md](data-model.md) và [contracts](contracts/).

## Technical Context

**Language/Version**: TypeScript 5.9 line, Node.js24, pnpm12.3.4 theo manifest/lockfile hiện tại.
**Primary Dependencies**: Next.js16/React19.2, Zod4.1, NestJS11, AJV8.18, TypeORM0.3, PostgreSQL; Craft0.2.12/Moveable0.56 giữ cho v1; Playwright1.63 và Sharp cho capture. Không thêm framework layout hoặc root runtime package. Test-only Vite8.3.0 dùng trong app web để mount renderer độc lập, cùng version đã pin ở ui-prototype; không phụ thuộc chạy/build prototype app.
**Storage**: PostgreSQL JSONB hiện có; explicit migration nới document/scene CHECK và version pairing; giữ WeddingData1 và S3-compatible asset ownership hiện có.
**Testing**: Vitest, API contract/integration trên PostgreSQL, Playwright Chromium/Firefox/WebKit, trusted Chromium capture, shared JSON corpus cho parity frontend/backend.
**Target Platform**: Browser matrix hiện có; API modular monolith; responsive container360–1440 và zoom200%.
**Project Type**: Monorepo web+REST API, từng app độc lập build/run/test/deploy.
**Performance Goals**: Giữ publication deadline90s và retry/lease hiện có; hai canonical validations phải hoàn thành trong deadline hoặc fail bounded. Resize chỉ đổi CSS layout, không resolve/network/remount do breakpoint. Không thêm dịch vụ hoặc số liệu throughput chưa có yêu cầu.
**Constraints**: Document1MiB, weddingData256KiB, max200 leaf nodes/30 widgets; v2 tối đa40 sections và depth cố định; measured height tối đa12000px ở mỗi canonical width. Snapshot cũ bất biến; unsupported pair fail closed; public requests chỉ đọc current release; không customer design editing.
**Scale/Scope**: Một pilot v2 đủ hero/information/Image grid/RSVP, toàn pipeline authoring/publication/rendering, manual conversion guide. Không batch migrate catalog hoặc mở album/audio capability.

## Constitution Check

*Gate trước Phase0 và đánh giá lại sau Phase1.*

| Principle / gate | Trước nghiên cứu | Sau thiết kế |
| --- | --- | --- |
| I Scope discipline | PASS: in/out scope, FR và assumptions trong spec | PASS: v2 flow/pilot, không album data/audio/dual-scene; mọi phase trace FR |
| II Independent applications | PASS: giữ Next/Nest và modular monolith | PASS: mỗi app sở hữu schema/resolver; chia fixture corpus, không import runtime từ app kia |
| III Reproducible DX | PASS: reuse pinned tools/infra | PASS: quickstart phân biệt command hiện có với runner cần bổ sung, timeout/cleanup rõ |
| IV Database evolution | PASS: cần migration riêng | PASS: sửa CHECK bằng migration mới, không rewrite migration lịch sử; downgrade guarded khi có v2 |
| V Verifiable quality/security | PASS: acceptance đo được | PASS: parity/compatibility/real DB/browser gates, giữ asset authorization và off-origin capture guard |
| Workflow/review | PASS cho planning: spec draft + checklist reviewed | PASS cho design artifacts; coding chỉ sau tasks, analysis và review scope/design; chưa có bằng chứng implementation |

Không có constitution exception. Review plan/spec vẫn cần trước implementation theo workflow; không có thay đổi design system ở bước này.

## Project Structure

### Documentation (this feature)

```text
specs/007-responsive-invitation-layout/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── document-v2.md
│   ├── rendering-publication.md
│   └── http-compatibility.md
└── quickstart.md
```

`tasks.md` sẽ được sinh bởi `speckit-tasks`, không phải output của bước plan.

### Source Code (repository root)

```text
apps/web/src/features/invitation-builder/
├── document/                 # version dispatch, schemas/resolvers owned by web
├── renderer/                 # shared entry; separate v1/v2 adapters and measurement
├── editor/                   # preserve v1 Craft editor; section v2 authoring adapter
├── assets/                   # previews and ownership unchanged
└── api/                      # discriminated payload handling
apps/web/src/features/invitations/     # data-only forms, public adaptive container
apps/web/src/ui/                       # existing preview/demo hosts; scope to invitation viewport
apps/web/src/app/internal/invitation-renderer/ # trusted version-aware harness
apps/web/tests/invitation-builder/
apps/web/e2e/invitation-builder/
apps/web/e2e/responsive-host/         # test-only Vite HTML/mount, outside Next routes/build
apps/api/src/modules/invitation-builder/
├── domain/                   # types, AJV schemas, validator/resolver
├── application/              # draft save/duplicate
├── http/                     # retain routes, support versioned payloads
└── publication/              # width matrix, worker, capture, finalizers
apps/api/src/modules/invitations/      # pinned design and published scene
apps/api/src/modules/invitation-assets/ # nested traversal and reference lifecycle
apps/api/src/infrastructure/database/migrations/ # new v1/v2 checks migration
apps/api/test/{unit,contract,integration}/invitation-builder/
scripts/                      # planned bounded responsive validation runner
```

**Structure Decision**: Business code stays inside each application. New v2 modules beside v1 avoid weakening v1 validators or conflating absolute geometry with content flow. Shared renderer does not import editor/Craft/Moveable. Read installed Next docs before implementation per `apps/web/AGENTS.md`.

## Development sequence and verification gates

| Phase | Deliverable / dependency | Requirements | Bounded verification and cleanup |
| --- | --- | --- | --- |
| A — Baseline/prototype | Pin 004/005/006 baseline and collect legacy fixture evidence. Create test-only Vite host inside web before prototype browser checks; prototype v2 pilot with existing bindings/widgets; do not send prototype to v1 API. Confirm width/zoom and state preservation before freeze contract | FR001–004,007,011,014 | Existing checks + proposed `--phase prototype` ≤10min; tear down only runner-owned processes/fixtures |
| B — Contracts/parity/tooling | Freeze strict document2/scene2, fixtures, version dispatch, v2 resolver both apps; add runner and test prerequisites before dependent gates | FR001,005–010,013 | Proposed runner `--phase contracts`, ≤10min; JSON parity and unsupported/malformed cases, no persisted fixtures |
| C — Persistence/compatibility | New migration; entity unions/version metadata, SQL finalizers, candidates/hash/pinning, nested refs and guarded downgrade | FR006,008–010,012,013 | Proposed `--phase persistence`, ≤15min; real PostgreSQL v1-before/v2-after migration and reference-only races; publication races deferred until phase E; delete only run-owned rows/objects |
| D — Shared render/surfaces | Intrinsic widgets, responsive section/grid, artwork clipping only, viewport hosts, preview measurement; v1 branch unchanged | FR001–004,007,008,011,014,015 | Proposed `--phase rendering`, ≤15min; width matrix + parity/readiness + zoom/focus; close contexts/server owned by runner |
| E — Publication | Version-aware trusted harness; frozen asOf; width390/900 state matrix; reports/thumbnail/hash/cache; atomic finalization | FR008–010,013,015 | Proposed `--phase publication`, ≤15min overall, each job ≤90s; failure injection and CAS/retry, staged object cleanup |
| F — Admin/customer pilot | Section authoring, bounded mobile/desktop rules, undo/redo/duplicate/export; Customer data-only pinned v2 flow; manual conversion draft | FR005,006,012 | Proposed `--phase authoring`, ≤15min; save/reload/conflict and full real API pilot, remove run fixtures |
| G — Release evidence/docs | All browsers and widths; keyboard/zoom/reduced-motion; legacy and auth/frontend regression; update UI-DESIGN/README after implementation evidence | All FR / SC | Proposed `--phase all`, ≤45min; structured evidence + cleanup summary; no infra reset, no publish/deploy |

Each proposed phase flag belongs to a future `scripts/responsive-validate.mjs`, created before its use in tasks. Existing gates in quickstart remain mandatory where affected. Phase A has no production compatibility claim. Phases B–F form the full release slice; prototype alone is not feature completion.

## Integration and rollout

1. Ship consumers, validators and migration able to read v1/v2 before authoring/publishing v2. Treat web/API/capture deployment as compatible set; application independence does not remove wire compatibility requirements.
2. Keep all existing v1 revisions and public snapshots; deploy no bulk transforms. New v2 templates/pilot can be exposed only after compatibility and publication gates pass.
3. Manual conversion: duplicate old template as separate draft, author explicit sections, reuse assets/bindings/sample data, compare widths, review and publish new revision. Existing invitations never automatically repin.
4. Rollback after v2 exists uses previous release that still reads v2; do not roll back to v1-only binary or constraints. Pausing new v2 authoring/publishing does not stop existing v2 public rendering. Downgrade DB refuses safely until all v2 data/candidates are explicitly handled in a separate reviewed operation.
5. MASTER remains unchanged. Planned document-specific defaults are reviewable proposals; any later conflict needing a MASTER edit requires explicit design-system approval at that point.

## Risks and mitigations

- Fixed-height widget primitives cannot simply be reused unchanged: split content from v1 geometry wrapper; v2 intrinsic height, no `height:100%` or text clipping for functional content.
- Query container must sit outside capped invitation: placing it inside max480 prevents desktop activation; test actual container767/768 separately from window.
- Added publication width/state passes may exceed90s: share browser/context where safe, wait assets bounded, benchmark pilot; timeout leaves publication unchanged. Extending deadline is a separately documented decision, not silent drift.
- V2 nested section/node backgrounds, artwork, fallbacks and optional nodes need complete traversal; asset identity/visibility stays shared across layouts: compare validator/resolver/reachability/cleanup across the shared corpus.
- Working tree contains unrelated ongoing changes: do not overwrite or label them as 007 output; implementation baseline must be settled first.

## Complexity Tracking

No constitution violations; no new app, broker or shared runtime package. Version adapters and section-specific authoring are required by legacy compatibility and reflow.

## Remediation decisions — 2026-10-11

User authorized closing all six analyze findings. Add an independent web-owned test host before prototype/rendering gates, split persistence reference races from publication races, freeze explicit v2 wire/handshake shapes, and remove desktop-only asset semantics. Actual production routes currently expose Customer editor/public/Admin authoring; demo/popup discovery exists in ui-prototype and is excluded from required production parity. No new production routes, MASTER edits or application code changes in this remediation.

Test-only host is served by Vite on a runner-owned loopback port from `apps/web/e2e/responsive-host/`, imports web renderer and synthetic JSON through fixture helpers, supports injected prototype/production adapter, preview/public context and a mobile-popup wrapper. It uses test-controlled RSVP request interception, no session or real customer assets. It is outside Next app routes/build and never modifies trusted capture protocol. Runner exposes `--phase prototype` (10min), `--phase rendering --story US1` and `--phase rendering --story US2` (15min each); bare rendering runs both story suites only after both prerequisites exist.

Persistence gate runs migration/constraints/reference-retention/asset-deletion races without invoking capture or finalizers. Publication gate later runs deadline/lease/CAS/desktop-failure/unpublish races against the complete pipeline. Full runner must enumerate both rendering subsets and required production surfaces; no skipping absent mandatory cases.
