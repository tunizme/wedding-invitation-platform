# Tasks: Project Foundation

**Input**: Design documents from `/specs/001-project-foundation/`

**Organization**: Dependency-ordered phases; categories are `[Frontend]`, `[Backend]`, `[Database]`, `[Infrastructure]`, `[Documentation]`. `[P]` marks tasks that may run in parallel.

## Phase 1: Setup

**Purpose**: Khởi tạo monorepo, application skeletons và quality tooling mà các phase sau sử dụng.

- [X] T001 [Infrastructure] Tạo pnpm workspace và pin Node/package manager trong `package.json`, `pnpm-workspace.yaml`, `.nvmrc`
- [X] T002 [P] [Frontend] Scaffold Next.js 16 App Router TypeScript app và app-owned scripts trong `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/eslint.config.mjs`
- [X] T003 [P] [Backend] Scaffold NestJS 11 TypeScript app và app-owned scripts trong `apps/api/package.json`, `apps/api/nest-cli.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/eslint.config.mjs`
- [X] T004 [P] [Infrastructure] Cấu hình Prettier và format exclusions trong `.prettierrc.json`, `.prettierignore`
- [X] T005 [P] [Frontend] Cấu hình Vitest và React Testing Library trong `apps/web/vitest.config.ts`, `apps/web/tests/setup.ts`
- [X] T006 [P] [Backend] Cấu hình Vitest unit/integration projects và Supertest setup trong `apps/api/vitest.config.ts`, `apps/api/test/setup.ts`
- [X] T007 [Infrastructure] Expose root `format:*`, `format:check:*`, `lint:*`, `typecheck:*`, `test:*`, `build:*`, `test:scripts` aliases trong `package.json`
- [X] T008 [P] [Infrastructure] Ignore dependencies, outputs và actual env files nhưng giữ examples trong `.gitignore`
- [X] T009 [Infrastructure] Cài dependencies và commit deterministic lockfile trong `pnpm-lock.yaml`

**Verification command**:

```bash
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck
```

---

## Phase 2: Foundational

**Purpose**: PostgreSQL, environment validation và migration lifecycle; block mọi User Story.

- [X] T010 [P] [Infrastructure] Khai báo PostgreSQL 17 bind `127.0.0.1`, named volume và `pg_isready` trong `compose.yaml`
- [X] T011 [P] [Infrastructure] Tạo project-specific safe local PostgreSQL placeholders trong `.env.example`
- [X] T012 [P] [Frontend] Tạo required/optional public config schema và example trong `apps/web/src/config/env.ts`, `apps/web/.env.example`
- [X] T013 [P] [Frontend] Viết missing/invalid/browser-safe configuration tests trong `apps/web/tests/environment.test.ts`
- [X] T014 [P] [Backend] Tạo fail-fast environment schema và example trong `apps/api/src/config/environment.ts`, `apps/api/src/config/config.module.ts`, `apps/api/.env.example`
- [X] T015 [P] [Backend] Viết missing/invalid/no-secret configuration tests trong `apps/api/test/unit/environment.spec.ts`
- [X] T016 [Backend] Cấu hình TypeORM với `synchronize: false`, `migrationsRun: false` trong `apps/api/src/infrastructure/database/database.module.ts`, `apps/api/src/infrastructure/database/data-source.ts`
- [X] T017 [Database] Tạo empty baseline migration trong `apps/api/src/infrastructure/database/migrations/20260923000000-InitialFoundation.ts`
- [X] T018 [Backend] Thêm migration lifecycle scripts trong `apps/api/package.json`
- [X] T019 [Database] Viết clean-apply, repeated-run, visibility và latest-revert tests trong `apps/api/test/integration/migrations.integration.spec.ts`
- [X] T020 [Infrastructure] Implement `infra:up`, `infra:down`, guarded `infra:reset` trong `scripts/infra.mjs`, `package.json`
- [X] T021 [Backend] Wire validated ConfigModule và DatabaseModule trong `apps/api/src/app.module.ts`, `apps/api/src/main.ts`

**Verification command**:

```bash
pnpm infra:up && pnpm --filter @wedding/api migration:run && pnpm --filter @wedding/api test:integration; status=$?; pnpm infra:down; exit $status
```

**Checkpoint**: Sau Phase 2, US1/US2/US3 có thể bắt đầu song song.

---

## Phase 3: User Story 1 - Khởi chạy môi trường local (P1) 🎯 MVP

**Goal**: Fresh clone chạy full stack hoặc từng application bằng documented commands.

**Independent Test**: `pnpm smoke:local` chạy bounded startup, migration, reachability checks và cleanup; app-only commands không yêu cầu app còn lại.

- [X] T022 [P] [US1] [Infrastructure] Viết tests cho startup order, migration failure, repeatability và partial-process cleanup trong `scripts/tests/dev.test.mjs`
- [X] T023 [P] [US1] [Infrastructure] Viết occupied-port tests cho web, API và PostgreSQL ports trong `scripts/tests/ports.test.mjs`
- [X] T024 [P] [US1] [Frontend] Viết independent foundation-page test trong `apps/web/tests/foundation-page.test.tsx`
- [X] T025 [P] [US1] [Backend] Viết REST prefix, invalid-config và graceful-shutdown tests trong `apps/api/test/unit/bootstrap.spec.ts`
- [X] T026 [P] [US1] [Frontend] Implement minimal foundation page và metadata trong `apps/web/src/app/page.tsx`, `apps/web/src/app/layout.tsx`
- [X] T027 [P] [US1] [Backend] Cấu hình `/api/v1`, validation, CORS và shutdown hooks trong `apps/api/src/main.ts`
- [X] T028 [US1] [Infrastructure] Implement port preflight, bounded DB wait, migrate-before-start, parallel startup và cleanup trong `scripts/dev.mjs`
- [X] T029 [US1] [Infrastructure] Expose `dev`, `dev:web`, `dev:api` commands trong `package.json`
- [X] T030 [P] [US1] [Infrastructure] Viết bounded local-smoke lifecycle tests trong `scripts/tests/local-smoke.test.mjs`
- [X] T031 [US1] [Infrastructure] Implement `smoke:local` start/wait/probe/finally-cleanup flow trong `scripts/local-smoke.mjs`, `package.json`
- [X] T032 [P] [US1] [Documentation] Viết prerequisites, fresh-clone, full-stack/app-only startup và shutdown trong `README.md`
- [X] T033 [US1] [Documentation] Document missing config, occupied port, unavailable DB và migration failure remedies trong `README.md`

**Verification command**:

```bash
pnpm test:web && pnpm test:api && pnpm test:scripts && pnpm smoke:local
```

---

## Phase 4: User Story 2 - Xác nhận tình trạng hệ thống (P2)

**Goal**: Phân biệt frontend reachability, backend liveness/readiness và PostgreSQL status.

**Independent Test**: Automated matrix bao phủ healthy, frontend-down, backend-down, database-down và performance thresholds.

- [X] T034 [P] [US2] [Frontend] Viết frontend health OpenAPI contract test trong `apps/web/tests/health-route.test.ts`
- [X] T035 [P] [US2] [Backend] Viết backend liveness contract test trong `apps/api/test/unit/health-live.spec.ts`
- [X] T036 [P] [US2] [Backend] Viết readiness up/down integration tests và sanitized 503 assertions trong `apps/api/test/integration/health-ready.integration.spec.ts`
- [X] T037 [P] [US2] [Infrastructure] Viết root health output, timeout và exit-code tests trong `scripts/tests/health-check.test.mjs`
- [X] T038 [P] [US2] [Infrastructure] Viết self-contained `test:health:integration` dùng host apps qua `scripts/dev.mjs`, Compose PostgreSQL, failure matrix và cleanup trong `scripts/tests/health-failures.integration.test.mjs`, `package.json`
- [X] T039 [P] [US2] [Infrastructure] Viết self-contained `test:health:performance` dùng host apps qua `scripts/dev.mjs`, Compose PostgreSQL, five-sample latency, aggregate timing và cleanup trong `scripts/tests/health-performance.test.mjs`, `package.json`
- [X] T040 [P] [US2] [Frontend] Implement uncached frontend-only health route trong `apps/web/src/app/api/health/route.ts`
- [X] T041 [P] [US2] [Backend] Implement process-only liveness trong `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.service.ts`
- [X] T042 [US2] [Backend] Implement bounded TypeORM readiness trong `apps/api/src/health/health.module.ts`, `apps/api/src/health/health.controller.ts`
- [X] T043 [US2] [Infrastructure] Implement per-component bounded `health` command trong `scripts/health-check.mjs`, `package.json`
- [X] T044 [US2] [Documentation] Document health meanings, timing targets và recovery flows trong `README.md`

**Verification command**:

```bash
pnpm test:web && pnpm test:api && pnpm --filter @wedding/api test:integration && pnpm test:scripts && pnpm test:health:integration && pnpm test:health:performance && pnpm smoke:local
```

---

## Phase 5: User Story 3 - Frontend/backend lifecycle độc lập (P3)

**Goal**: Mỗi app format/lint/typecheck/test/build/package độc lập; bốn CI jobs báo kết quả riêng, không deploy; merge enforcement là optional trong rapid development.

**Independent Test**: Filtered commands không tạo output app còn lại; bốn CI jobs có tên khớp chính xác; ruleset file chỉ là dormant optional template và không được dùng làm active-state evidence.

- [X] T045 [P] [US3] [Infrastructure] Viết independent filtered-build guard trong `scripts/tests/independent-builds.test.mjs`
- [X] T046 [P] [US3] [Frontend] Cấu hình standalone output và multi-stage image trong `apps/web/next.config.ts`, `apps/web/Dockerfile`
- [X] T047 [P] [US3] [Backend] Tạo multi-stage independent API image trong `apps/api/Dockerfile`
- [X] T048 [US3] [Infrastructure] Thêm migrate/api/web CI-only profile với health-aware ordering trong `compose.yaml`
- [X] T049 [US3] [Infrastructure] Tạo `frontend-checks` và `backend-checks` gồm format/lint/typecheck/test/build trong `.github/workflows/ci.yml`
- [X] T050 [US3] [Infrastructure] Thêm PostgreSQL-backed `backend-integration` job trong `.github/workflows/ci.yml`
- [X] T051 [US3] [Infrastructure] Thêm gated `full-stack-health` job với diagnostics và cleanup trong `.github/workflows/ci.yml`
- [X] T052 [US3] [Infrastructure] Định nghĩa optional future ruleset template với bốn CI job contexts trong `.github/rulesets/main.json`
- [X] T053 [US3] [Infrastructure] [Deferred/Superseded by feature 002] Giữ apply/verify main-branch ruleset ngoài rapid-development completion scope; activation chưa xảy ra và chỉ được xem xét lại bởi approved release-readiness feature theo `docs/ci.md`
- [X] T054 [US3] [Documentation] Document per-app command, artifact và image boundaries trong `README.md`

**Verification command**:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:scripts && pnpm smoke:local
```

---

## Phase 6: Polish & Cross-Cutting Gates

- [X] T055 [P] [Documentation] Tạo five-participant onboarding/timed-diagnostic protocol trong `docs/onboarding-validation.md`
- [X] T057 [P] [Infrastructure] Implement narrowly scoped source/manifest/migration guard trong `scripts/scope-check.mjs`, `package.json`
- [X] T058 [P] [Infrastructure] Viết scope allowlist và documentation false-positive tests trong `scripts/tests/scope-check.test.mjs`
- [X] T059 [P] [Frontend] Rà soát no-secret frontend health assertions trong `apps/web/tests/health-route.test.ts`
- [X] T060 [P] [Backend] Rà soát health sanitization, shutdown và no-schema-sync assertions trong `apps/api/test/unit/health-live.spec.ts`, `apps/api/test/integration/health-ready.integration.spec.ts`, `apps/api/test/unit/database-config.spec.ts`
- [X] T061 [Documentation] Chạy fresh-clone validation và ghi expected results/known limitations trong `specs/001-project-foundation/quickstart.md`, `README.md`
- [X] T062 [Infrastructure] Chạy CI-equivalent suite và sửa integration gaps trong `.github/workflows/ci.yml`, `compose.yaml`, `package.json`

**Verification command**:

```bash
pnpm scope:check && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:scripts && pnpm build && pnpm test:health:integration && pnpm test:health:performance && pnpm smoke:local
```

## Dependencies & Execution Order

- Phase 1 không có dependency; T002–T006/T008 song song sau T001; T007 sau app manifests; T009 cuối phase.
- Phase 2 phụ thuộc Phase 1 và block các stories. T010–T015 song song; T016 → T017/T018 → T019; T020/T021 theo dependencies tương ứng.
- US1, US2, US3 có thể bắt đầu sau Phase 2. T051 cần US1/US2 endpoints và smoke tooling.
- Phase 6 phụ thuộc ba stories.

```text
Setup → Foundational ─┬─→ US1 Local Startup (MVP)
                      ├─→ US2 Health
                      └─→ US3 Independent Lifecycle
US1 + US2 + US3 → Polish → Fresh-clone validation
```

## Parallel Examples

- US1: T022/T023/T024/T025, sau đó T026/T027/T030/T032.
- US2: T034–T039, sau đó T040/T041.
- US3: T045/T046/T047.
- Polish: T055/T057/T058/T059/T060.

## Implementation Strategy

1. MVP: Phase 1 + Phase 2 + US1; validate bằng `pnpm smoke:local`.
2. Thêm US2 và chạy failure/performance matrix.
3. Thêm US3 và bốn independent CI jobs; giữ ruleset JSON như optional future template.
4. Polish và disposable clean-clone validation.

## Scope Guard

- Không thêm Authentication, Authorization, Invitation Editor, Payment, VNPay SDK/config/route/schema/call, business E2E, artifact publishing hay automated deployment.
- Scope scanner MUST bỏ qua `specs/`, `docs/`, tests, lockfile và generated files; chỉ quét app source, direct manifests và migrations.

## Phase 7: Convergence

- [X] T063 [Deferred/Superseded by feature 002] Không apply hoặc verify GitHub Rulesets trong rapid development; thiếu merge enforcement không còn là completion blocker và không có claim rằng ruleset đang active per Constitution V, FR-019, SC-007
- [X] T064 CRITICAL Chạy quy trình từ disposable clean clone, xác nhận healthy stack chỉ bằng documented steps và ghi evidence/known limitations vào `specs/001-project-foundation/quickstart.md`, `README.md` per Constitution III, US1/AC1
