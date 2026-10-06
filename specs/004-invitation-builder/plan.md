# Implementation Plan: Invitation Builder

**Branch**: `master` (Git hiện hành) | **Feature ID**: `004-invitation-builder` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: `specs/004-invitation-builder/spec.md`, gồm ba quyết định clarification và quyết định dùng MinIO tương thích S3 trước implementation. Setup script trả `BRANCH=004-invitation-builder` từ feature pointer; đó không phải nhánh Git đã tạo.

**Status**: Phase 0 research và Phase 1 design hoàn tất; chưa triển khai, cài dependency hoặc chạy kiểm thử sản phẩm.

## Summary

Xây core Invitation Builder trong modular monolith hiện hữu: Admin thiết kế mẫu bằng Craft.js + Moveable, customer nhập WeddingData qua form, renderer dùng chung cho preview/thiệp công khai và kiểm tra publish. Admin có capability tạo hộ rõ ràng. Published design revision bất biến; draft dữ liệu tách khỏi bản công khai. RSVP lưu thật, chống retry trùng và đóng/mở ngay độc lập với publish. URL do hệ thống cấp và không đổi.

API sở hữu dữ liệu, quyền, asset storage, publication jobs và RSVP; web sở hữu editor/display components. Headless Chromium do API điều khiển dùng render harness của web để đo overflow và tạo thumbnail. Không đưa business logic vào root tooling, thêm MinIO làm hạ tầng object storage theo yêu cầu người dùng; không thêm business microservice/broker hoặc import source của app kia.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node 24, pnpm 12.3.4; giữ lockfile hiện hành.

**Primary Dependencies**: Next 16.3.5, React/React DOM 19.3.0, Nest 11.2.5, TypeORM 0.3.31; thêm exact Craft 0.2.12, react-moveable 0.56.0, Playwright 1.63.0, sharp 0.35.5, qrcode 1.5.4. Web thêm Craft/Moveable/qrcode và @playwright/test 1.63.0 (dev); API thêm Playwright/sharp và AWS SDK v3 `@aws-sdk/client-s3`; chọn và pin exact SDK version cùng MinIO server/client image digests tại T002 trước storage tests. API dùng class-validator và AJV cho document; web dùng Zod, cùng contract fixtures kiểm tra tương thích. AJV chuyển từ dev-only sang runtime dependency khi validator dùng trong production.

**Storage**: PostgreSQL 17 cho documents/snapshots/jobs/RSVP; MinIO private bucket cho normalized assets/thumbnails qua API-owned S3-compatible AssetStore; bundled immutable fonts. Một API instance ở MVP; MinIO có persistent volume riêng trong Compose. Chưa có CDN hoặc AWS deployment. Xem [storage contract](contracts/storage.md).

**Testing**: Vitest 4.1.11, Testing Library, Supertest, PostgreSQL integration, Playwright browser tests; renderer fixtures và valid/invalid document corpus kiểm tra hai app độc lập.

**Target Platform**: Linux API/web; desktop Chrome/Edge cho editor, Chromium/Firefox/WebKit cho public/form. Public widths 360/390/768/1440; Vietnamese labels/fonts, keyboard-accessible forms và property controls.

**Project Type**: Web application với frontend/backend triển khai độc lập và versioned REST boundary.

**Performance Goals**: 100 primitive elements +10 widgets (110 total); p95 chọn/đổi thuộc tính ≤200 ms sau asset load; p95 mở mẫu ≤3 s; đo trên reference environment trong research/quickstart. Không tuyên bố production SLA.

**Constraints**: 390 px canonical width, canvas 390–12,000 px, tối đa 200 elements/30 widgets, 1 MiB design, 256 KiB WeddingData; flat node tree, không group/reflow. Manual save; publish kiểm chứng server. Không âm thầm thay dependency stack nếu compatibility test fail.

**Scale/Scope**: Sáu user stories, 37 FR, tám SC; tám nhóm builder cộng luồng invitation và RSVP. Tối đa 2 render jobs hoạt động/10 chờ; 30 s execution/90 s total deadline. MinIO là storage được duyệt; một API instance vẫn là giới hạn MVP, chưa cam kết horizontal scaling.

## Constitution Check

| Gate | Trước research | Sau design | Bằng chứng |
|------|----------------|------------|------------|
| Scope discipline | PASS | PASS | MVP/Later giữ nguyên; RSVP thật/admin tạo hộ được user chốt; không payment/email/cộng tác/section reflow |
| Independent applications | PASS | PASS | Code trong từng app; HTTP/render contract versioned; unit/build không cần app kia; runtime publish dependency xử lý như lỗi operation |
| Modular monolith | PASS | PASS | Workers trong API process, PostgreSQL jobs, S3-compatible storage port và MinIO infrastructure; không business microservice/broker/Redis |
| Reproducibility | PASS | PASS | Exact dependencies, pinned Chromium, per-app env, private MinIO bucket/persistent volume, bounded validation commands |
| Explicit migrations | PASS | PASS | Additive TypeORM migrations, no auto synchronize/run; FK/check/index và rollback tests |
| Quality/security | PASS | PASS | IAM policies, no implicit ADMIN RSVP access, server-side publish, byte validation, no raw payload logging, race/browser tests |
| Workflow/delivery | PASS | PASS | Requirements checklist 16/16; chỉ design artifacts; tasks/analyze/implement sau; CI không deploy |

Không có vi phạm cần ngoại lệ. Gate PASS đánh giá thiết kế, không phải implementation đã đạt kiểm thử. Compatibility/render/QR experiments là checkpoint đầu implementation.

## Project Structure

### Documentation (this feature)

```text
specs/004-invitation-builder/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── document-format.md
│   ├── http-api.md
│   ├── rendering.md
│   └── storage.md
└── tasks.md                   # dependency-ordered implementation tasks
```

### Source Code (repository root)

```text
apps/api/src/modules/
├── invitation-builder/        # template/revisions, document validation, publication worker
├── invitations/               # owner/admin forms data, public projection, lifecycle
├── invitation-assets/         # upload, references, scoped delivery, S3-compatible adapter
└── invitation-rsvp/           # receipts, rolling limiter, owner-only list
apps/api/src/infrastructure/database/migrations/
apps/api/test/{unit,contract,integration}/invitation-builder/
apps/web/src/features/invitation-builder/
├── editor/                    # Craft wrappers, Moveable adapter, toolbar/properties/layers
├── document/                  # contract, binding catalog, local validation
├── renderer/                  # no Craft/Moveable imports
├── assets/
└── api/
apps/web/src/features/invitations/   # customer/admin data forms, RSVP management
apps/web/src/app/                   # routes in HTTP/UI contract
apps/web/tests/invitation-builder/
apps/web/e2e/invitation-builder/
scripts/builder-validate.mjs         # orchestration only; introduced in implementation
```

**Structure Decision**: Module ownership follows business capabilities; display components shared only within web. Contracts/corpus are documentation/test assets, not a root runtime package. API services call module ports, not controllers or another app's source.

## Implementation sequence and verification gates

1. **Tooling/contracts and compatibility**: Add exact dependencies, Playwright browsers, fixtures, pinned MinIO Compose/provisioning and validation runner before dependent tests. Verify current React/Next production editor boundary, StrictMode, gesture undo and round-trip. Read installed Next docs before web code. Update scope-check to permit feature 004 while retaining payment exclusions. Gate: `pnpm validate:builder --phase setup`.
2. **Persistence/assets foundation**: Add migrations/entities/module registration, validators, AssetStore, policies and cleanups. Explicit migrations; reference/delete races, invalid documents and delivery authorization. Gate: `pnpm validate:builder --phase foundation`.
3. **Admin authoring/rendering (US1/US2)**: Elements/properties/layers/history, bindings/widgets/sample preview and form catalog. Pure renderer + harness. Cover property matrix, keyboard controls, optional hide and runtime states. Gate: `pnpm validate:builder --phase editor`.
4. **Template publication (US3)**: Jobs, captured candidates, render/thumbnail, CAS commit, reference tracking and metadata catalog. Gate: `pnpm validate:builder --phase templates`.
5. **Customer invitations (US4)**: Owner routes/policy, fixed URL, draft/public separation, current-release projection, public renderer and immediate unpublish. Gate: `pnpm validate:builder --story US4`.
6. **Guest/owner RSVP (US6)**: Public form, idempotent receipts, rolling limiter, immediate owner open/close controls, response list and transaction races. Gate: `pnpm validate:builder --story US6`.
7. **Admin assistance (US5)**: Reuse invitation and RSVP services; enforce actor/owner policies, scoped assets and transactional audit. Gate: `pnpm validate:builder --story US5`. Full `--phase invitations` and `--phase rsvp` gates become runnable after this step; story gates do not replace their required coverage.
8. **Acceptance**: App checks, unit/contract/integration, production browser flows, failure injection, migration lifecycle, IAM regression, performance, manual QR scan/usability. Gate: `pnpm validate:builder --phase all`; write measured results only after execution.

Commands above are planned interfaces, not commands already available. [quickstart.md](quickstart.md) specifies bounds and cleanup. Tasks generation must put tooling before dependent checks.

## Contracts and operational boundaries

- [data-model.md](data-model.md): tables, transitions, lock order, revision semantics and retention.
- [document-format.md](contracts/document-format.md): canonical layout/props, WeddingData, binding and renderer inputs.
- [http-api.md](contracts/http-api.md): endpoints, errors, pagination/idempotency, UI routes and CORS additions.
- [storage.md](contracts/storage.md): private MinIO/S3 adapter, credentials, object lifecycle, isolated tests and future migration.
- [rendering.md](contracts/rendering.md): trusted rendering, publication lifecycle, assets and deterministic measurement.
- Keep the four CI job names. Frontend/backend checks build independently. Backend integration gains PostgreSQL contract/race tests; full-stack installs pinned browsers and tests real publication/public/RSVP with unconditional cleanup. No deployment or external publish action.
- Extend existing ProblemFilter only with allowlisted builder codes and safe field/node paths, never arbitrary exception messages. Existing CORS adds DELETE and `Idempotency-Key`, retaining exact-origin credentials.
- Preserve IAM token expiry/revocation semantics. Admin-assisted mutations additionally check active ADMIN and active target CUSTOMER transactionally as a resource policy. Public availability follows invitation state, without implicit account-lock cascade.
- Add new tables through new migrations. Do not retrofit feature 003 migrations. Web/API contract-version mismatch fails publish safely and cannot destroy snapshots.

## Complexity Tracking

No constitutional exception. Chromium runtime, single API instance and user-approved MinIO infrastructure are accepted tradeoffs with alternatives in [research.md](research.md). This command generates no tasks or application code.
