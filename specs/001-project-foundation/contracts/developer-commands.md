# Developer Command Contract

## Root Commands

| Command | Contract |
|---------|----------|
| `pnpm dev` | Start/wait PostgreSQL, migrate, run web + API in watch mode |
| `pnpm dev:web` | Run frontend only; no API/DB requirement |
| `pnpm dev:api` | Start/wait PostgreSQL, migrate, run API only |
| `pnpm infra:up` | Start PostgreSQL and wait for healthcheck |
| `pnpm infra:down` | Stop infrastructure without deleting data volume |
| `pnpm infra:reset` | Destructive local DB reset; README MUST warn |
| `pnpm health` | Report frontend, backend live/ready and DB separately; non-zero unless all healthy |
| `pnpm smoke:local` | Start stack, wait with bounded timeout, validate health and always clean up |
| `pnpm test:scripts` | Run root orchestration, health, scope and independent-build tests |
| `pnpm test:health:integration` | Own full-stack lifecycle, run component failure matrix and always clean up |
| `pnpm test:health:performance` | Own healthy-stack lifecycle, measure health thresholds and always clean up |
| `pnpm format:web` / `pnpm format:api` | Format exactly one application |
| `pnpm format:check:web` / `pnpm format:check:api` | Check formatting for exactly one application without modifying files |
| `pnpm {lint,test,build}:{web,api}` | Run exactly one app check |
| `pnpm {format,format:check,lint,typecheck,test,build}` | Run the check across both apps |

## App-owned Scripts

Web (`@wedding/web`): `dev`, `format`, `format:check`, `lint` (ESLint CLI), `typecheck`, `test` (Vitest run), `build` (standalone output), `start`.

API (`@wedding/api`): `dev`, `format`, `format:check`, `lint`, `typecheck`, `test`, `test:integration`, `build`, `start`, `migration:create`, `migration:generate`, `migration:run`, `migration:revert`, `migration:show`.

Missing/invalid config MUST fail with actionable errors; migration failure MUST prevent API startup; health uses bounded timeouts. No command calls VNPay, deploys or publishes artifacts.
