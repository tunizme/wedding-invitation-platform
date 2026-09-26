# Phase 0 Research: Project Foundation

## Runtime và frameworks

**Decision**: Node.js 24 LTS + TypeScript 5.x; Next.js 16.x App Router; NestJS 11.x. Exact versions được pin trong lockfile. NestJS 11 được chọn để toàn bộ official integration packages có peer compatibility nhất quán.

**Rationale**: Dùng current stable/LTS lines cho foundation mới; App Router là recommended router. **Alternatives considered**: Node 20 (EOL), Pages Router (không có compatibility need), prerelease versions.

**Sources**: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Node releases](https://nodejs.org/en/about/previous-releases), [Nest releases](https://github.com/nestjs/nest/releases)

## Monorepo tooling

**Decision**: pnpm workspaces, một lockfile, `apps/web` và `apps/api`; root dùng filters/recursive runs; chưa dùng Turborepo/Nx.

**Rationale**: Workspace, strict dependency visibility và filtered commands đủ cho hai apps. **Alternatives considered**: npm workspaces khả thi nhưng filter surface kém rõ; Turbo/Nx hoãn đến khi CI/shared graph cần caching.

**Sources**: [pnpm workspaces](https://pnpm.io/workspaces), [filtering](https://pnpm.io/filtering), [run](https://pnpm.io/cli/run)

## Frontend và independent health

**Decision**: Foundation page tại `/` và `GET /api/health` trả frontend-only JSON với `Cache-Control: no-store`; route không gọi API/database.

**Rationale**: Machine-readable contract ổn định và giữ frontend independently runnable. **Alternatives considered**: parse `/` HTML; aggregated frontend/backend health.

**Source**: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)

## Backend architecture và REST

**Decision**: Một NestJS modular monolith expose REST dưới `/api/v1`; future capabilities là bounded feature modules chỉ export intentional providers; OpenAPI là HTTP contract.

**Rationale**: Nest modules cho encapsulation trong một deployable, phù hợp MVP. **Alternatives considered**: microservices (operational complexity chưa có nhu cầu), unversioned REST.

**Sources**: [Nest modules](https://docs.nestjs.com/modules), [Nest OpenAPI](https://docs.nestjs.com/openapi/introduction)

## PostgreSQL access và migrations

**Decision**: TypeORM 0.3.x qua `@nestjs/typeorm`, driver `pg`, `synchronize: false`, `migrationsRun: false`; commit empty `InitialFoundation` migration; run migrations explicit sau DB readiness, trước API startup.

**Rationale**: First-class Nest integration, migrations và test seams cho bounded readiness query. Empty baseline proves lifecycle without inventing domain tables. **Alternatives considered**: Prisma (thêm lifecycle glue), Drizzle (custom readiness), schema sync/auto-migrate on replica startup (unsafe).

**Sources**: [Nest TypeORM](https://docs.nestjs.com/data/typeorm), [migration setup](https://typeorm.io/docs/migrations/setup/), [creating](https://typeorm.io/docs/migrations/creating/), [executing](https://typeorm.io/docs/migrations/executing/)

## Local infrastructure

**Decision**: Docker Compose v2 quản lý PostgreSQL 17 với named volume và `pg_isready`; apps chạy trên host. Root startup chờ DB healthy, migrate, rồi start apps; không fixed sleep.

**Rationale**: Reproducible DB setup và fast host HMR/debugging. **Alternatives considered**: machine-installed DB, containerized normal watch loop, fixed sleep.

**Sources**: [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/), [startup order](https://docs.docker.com/compose/how-tos/startup-order/), [PostgreSQL versioning](https://www.postgresql.org/support/versioning/)

## Health model

**Decision**: Frontend `/api/health`; backend `/api/v1/health/live` process-only và `/api/v1/health/ready` database-aware; root `health` còn probe PostgreSQL trực tiếp với bounded timeout.

**Rationale**: Phân biệt process và dependency failures, báo cáo riêng ba components. **Alternatives considered**: one aggregate endpoint; log-only health.

**Source**: [Nest health checks](https://docs.nestjs.com/recipes/terminus)

## Environment configuration

**Decision**: Root/web/API có `.env.example` riêng; actual `.env*` ignored. API fail fast qua `@nestjs/config`; frontend chỉ expose browser-safe `NEXT_PUBLIC_` values.

**Rationale**: Ownership độc lập và không leak server secret. **Alternatives considered**: một shared root env; không cung cấp templates.

**Sources**: [Nest config](https://docs.nestjs.com/techniques/configuration), [Next env](https://nextjs.org/docs/app/guides/environment-variables)

## Testing

**Decision**: Vitest cho cả hai apps; React Testing Library cho web; Supertest + real PostgreSQL cho API integration. Business E2E/Playwright hoãn lại.

**Rationale**: Fast TypeScript-native unit testing; real PostgreSQL bắt dialect/migration behavior. **Alternatives considered**: Jest; SQLite substitute; browser E2E ngoài scope.

**Sources**: [Next Vitest](https://nextjs.org/docs/app/guides/testing/vitest), [Nest testing](https://docs.nestjs.com/fundamentals/testing)

## CI và packaging

**Decision**: GitHub Actions có `frontend-checks`, `backend-checks`, `backend-integration`, `full-stack-health`; bounded waits, diagnostics, cleanup; không path-filter required jobs. Mỗi app có Dockerfile; Next dùng standalone output. Không publish/deploy.

**Rationale**: Independent failure domains và deployable artifacts, sau đó full-stack proof. **Alternatives considered**: monolithic CI job; full CI/CD; shared artifact.

**Sources**: [PostgreSQL services](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Next standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)

## VNPay boundary

**Decision**: Ghi nhận VNPay là future provider nhưng không thêm package, module, route, environment variable, table hay external call.

**Rationale**: Ngăn scope creep và premature secret/config surface. **Alternatives considered**: empty payment module/config (không tạo value, vi phạm out-of-scope).
