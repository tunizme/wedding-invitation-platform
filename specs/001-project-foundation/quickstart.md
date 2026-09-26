# Quickstart Validation: Project Foundation

Validation guide cho implementation dự kiến. Commands tuân theo [Developer Command Contract](./contracts/developer-commands.md); HTTP responses tuân theo [Backend API](./contracts/backend-api.openapi.yaml) và [Frontend Health](./contracts/frontend-health.openapi.yaml).

## Prerequisites

- Git, Node.js 24 LTS, Corepack/pnpm version được pin
- Docker Engine hoặc Docker Desktop với Compose v2

Không cần cài PostgreSQL trực tiếp.

## Fresh clone

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Expected order: PostgreSQL healthy → `InitialFoundation`/pending migrations applied → API tại `http://localhost:3001/api/v1` → web tại `http://localhost:3000`.

Trong terminal khác:

```bash
pnpm health
```

Expected trong 10 giây với exit `0`: frontend healthy, backend live, backend ready, PostgreSQL accepting connections.

Automated bounded validation có cleanup:

```bash
pnpm smoke:local
```

## Independent workflows

```bash
pnpm dev:web
pnpm test:web
pnpm lint:web
pnpm build:web
```

Frontend không yêu cầu API/database.

```bash
pnpm dev:api
pnpm test:api
pnpm lint:api
pnpm build:api
```

Backend yêu cầu PostgreSQL nhưng không yêu cầu frontend. Mỗi build chỉ tạo output của app đích.

## Migration validation

```bash
pnpm --filter @wedding/api migration:show
pnpm --filter @wedding/api migration:run
pnpm --filter @wedding/api migration:show
```

Expected: baseline được ghi nhận, repeated run không tạo unplanned change, và không có User/Invitation/Payment/VNPay table.

## Failure validation

Sau khi stack healthy, stop PostgreSQL mà không xóa volume. Backend liveness vẫn trả 200; readiness trả 503 với `database: down`; frontend health trả 200; root health exit non-zero và nêu riêng database/readiness failure.

Bỏ hoặc làm sai một required frontend value rồi build/start frontend; lặp lại với một required backend value. Expected: application bị ảnh hưởng dừng trước khi ready, nêu config bị thiếu/sai và không in secret value.

## CI-equivalent validation

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:scripts
pnpm build
pnpm infra:up
pnpm --filter @wedding/api migration:run
pnpm --filter @wedding/api test:integration
pnpm test:health:integration
pnpm test:health:performance
pnpm smoke:local
```

GitHub Actions tách thành `frontend-checks`, `backend-checks`, `backend-integration`, `full-stack-health` và báo kết quả độc lập. Merge enforcement là optional trong rapid development; `.github/rulesets/main.json` chỉ là dormant future template, không phải bằng chứng ruleset đang active. Xem `docs/ci.md`. Workflow không deploy, publish artifact hay gọi VNPay.

## Stop/reset

`pnpm infra:down` giữ named volume. `pnpm infra:reset` là destructive command xóa local database volume và README phải cảnh báo rõ.

## Implementation validation 2026-09-23

- PASS: frozen/offline lockfile install, format, lint, typecheck, 13 application unit tests, 8 script test files và production builds.
- PASS: baseline migration apply/repeat/revert/reapply trên PostgreSQL 17 thật.
- PASS: healthy/frontend-down/backend-down/PostgreSQL-down matrix; frontend/liveness/readiness/database được phân biệt đúng.
- PASS: 5 samples cho mỗi HTTP health endpoint đều dưới 500 ms; aggregate requests dưới 10 giây.
- PASS: Docker images độc lập và CI Compose ordering `postgres → migrate → api → web`; root health báo đủ bốn signals.
- Local machine đã có process khác dùng port 5432, nên validation dùng `POSTGRES_PORT=55432` và matching `DATABASE_URL`; occupied-port handling không dừng process ngoài project.
- Repository ruleset không phải completion gate trong rapid development.

## Fresh-clone validation 2026-09-26

- PASS: tạo committed source snapshot tạm `9fec2bbf7f74fde169ceb0fc4199518f552937e5`, clone sang
  disposable directory và xác nhận checkout sạch trước setup.
- PASS: Node.js `v24.21.0`, pnpm `12.3.4`, `corepack enable` và
  `pnpm install --frozen-lockfile`; successful install hoàn tất trong `4m04.6s` với empty clone-local
  dependency tree.
- PASS: copy đúng ba environment templates theo README, không dùng environment file từ working tree
  nguồn.
- PASS: `pnpm smoke:local` hoàn tất trong `17.1s`; migration không còn pending; frontend,
  backend-live, backend-ready và PostgreSQL đều `OK`; Compose resources được cleanup.
- PASS: tổng thời gian successful install + smoke khoảng `4m22s`, dưới target 30 phút.
- Known limitation: repository chính chưa có commit, nên validation dùng seed commit tạm từ current
  source snapshot thay vì clone từ `origin`.
- Known limitation: disposable clone chạy trên cùng Fedora host, không phải máy/VM độc lập; package
  store của clone bắt đầu rỗng và source checkout không mang theo dependencies/build outputs.
- Known limitation: port 5432 đã bị chiếm trên host; validation dùng documented override
  `POSTGRES_PORT=55432` cùng matching `DATABASE_URL`.
