# Implementation Plan: Project Foundation

**Branch**: `001-project-foundation` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-project-foundation/spec.md` and the technical decisions supplied for this planning phase.

## Summary

Xây dựng TypeScript monorepo dùng pnpm workspaces với hai application độc lập: Next.js frontend và NestJS modular-monolith REST API. PostgreSQL local chạy qua Docker Compose; TypeORM quản lý explicit migrations với `synchronize: false`. Foundation cung cấp frontend health route, backend liveness/readiness, environment validation, root orchestration, README và CI validation không deploy. VNPay chỉ là future payment provider; không có SDK, config, route, schema hay integration trong feature này.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 24 LTS; exact dependencies và package-manager version được pin trong repository

**Primary Dependencies**: Next.js 16.x App Router, React, NestJS 11.x, `@nestjs/config`, `@nestjs/swagger`, `@nestjs/typeorm`, TypeORM 0.3.x, `pg`, pnpm workspaces, Prettier, Docker Compose v2

**Storage**: PostgreSQL 17.x với named local volume; migration history là persisted data duy nhất trong foundation

**Testing**: Prettier format check; ESLint; TypeScript typecheck; Vitest; React Testing Library; Supertest; PostgreSQL thật cho integration/migration tests; HTTP và `pg_isready` smoke checks

**Target Platform**: Evergreen browsers; Linux runtime/container; macOS, Linux hoặc WSL2/Docker Desktop cho local; GitHub Actions cho CI

**Project Type**: Web application monorepo với frontend và REST API backend độc lập

**Performance Goals**: Sau khi services ready, đo ít nhất 5 requests cho mỗi health endpoint; từng request MUST dưới 500 ms trên local/CI và root health command MUST hoàn tất trong 10 giây; disposable clean-clone validation dưới 30 phút

**Constraints**: Liveness không phụ thuộc PostgreSQL; readiness trả non-2xx khi database down; PostgreSQL local chỉ bind `127.0.0.1`; không commit secret; không schema synchronization, microservices, authentication, invitation editor, VNPay integration, publishing hay automated deployment. Scope guard chỉ quét application source, direct dependency manifests và migrations; nó MUST bỏ qua specs, documentation, tests, generated files và lockfile.

**Scale/Scope**: Foundation MVP với một frontend, một modular-monolith backend và một PostgreSQL instance; chưa có business entity hoặc production SLA

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Constitution v2.0.0 đã ratify và là governance authority. Thiết kế phải pass cả constitution principles lẫn feature-specific constraints.

| Gate | Pre-Research | Post-Design | Evidence |
|------|--------------|-------------|----------|
| Hai app độc lập trong monorepo | PASS | PASS | App-owned scripts/config/Dockerfiles; root chỉ orchestration |
| Modular monolith REST API, không microservices | PASS | PASS | Một NestJS deployable với internal module boundaries |
| Explicit PostgreSQL migrations từ đầu | PASS | PASS | Baseline migration; `synchronize: false`; migrate trước startup |
| Health signals tách biệt | PASS | PASS | Frontend, liveness, readiness và direct database checks |
| Environment ownership và secret hygiene | PASS | PASS | Ba `.env.example`, fail-fast validation, không trả config qua health |
| CI validate nhưng không deploy | PASS | PASS | Bốn jobs; không publish/deploy/business E2E |
| Không scope creep | PASS | PASS | Không User/Invitation/Payment/VNPay code hoặc schema |
| Reproducible developer experience | PASS | PASS | Pinned tooling, lockfile, safe examples, bounded orchestration và destructive reset warning |
| Verifiable quality gates | PASS | PASS | Format/lint/typecheck/test/build và bốn CI jobs; merge enforcement là optional trong rapid development |

Không có gate failure hay complexity exception.

## Project Structure

### Documentation (this feature)

```text
specs/001-project-foundation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── backend-api.openapi.yaml
│   ├── frontend-health.openapi.yaml
│   └── developer-commands.md
└── tasks.md                 # Created later by $speckit-tasks
```

### Source Code (repository root)

```text
.
├── .github/workflows/ci.yml
├── .github/rulesets/main.json          # Dormant optional template; không phải active-state evidence
├── apps/
│   ├── web/
│   │   ├── src/app/
│   │   │   ├── api/health/route.ts
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── tests/
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── eslint.config.mjs
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── api/
│       ├── src/
│       │   ├── common/
│       │   ├── config/
│       │   ├── health/
│       │   ├── infrastructure/database/
│       │   │   ├── migrations/
│       │   │   ├── database.module.ts
│       │   │   └── data-source.ts
│       │   ├── modules/              # Future bounded modules
│       │   ├── app.module.ts
│       │   └── main.ts
│       ├── test/{unit,integration}/
│       ├── .env.example
│       ├── Dockerfile
│       ├── eslint.config.mjs
│       ├── nest-cli.json
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsconfig.build.json
│       └── vitest.config.ts
├── docs/{ci.md,onboarding-validation.md,onboarding-validation-results.md}
├── scripts/{dev.mjs,health-check.mjs,local-smoke.mjs,scope-check.mjs}
├── .env.example
├── .gitignore
├── .prettierignore
├── .prettierrc.json
├── compose.yaml
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── README.md
```

**Structure Decision**: `apps/web` và `apps/api` là independent workspace packages/deployables. Không tạo shared package khi chưa có reuse thật. Root scripts là thin orchestration layer. Docker Compose mặc định quản lý PostgreSQL; apps chạy trên host trong local watch mode. Mỗi app có Dockerfile riêng để chứng minh independent packaging và hỗ trợ full-stack CI health validation.
