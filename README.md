# Wedding Invitation Platform — Project Foundation

Monorepo nền tảng cho sản phẩm tạo thiệp cưới online. Frontend là Next.js + TypeScript; backend là NestJS modular monolith + TypeScript, cung cấp REST API; PostgreSQL local chạy bằng Docker Compose.

Repository hiện có IAM, editor canvas 500px, kho mẫu, thiệp dịch vụ do admin thiết kế riêng cho từng customer, xác nhận thanh toán thủ công, khách mời với link riêng, lượt mở link, RSVP và lời chúc. Customer của thiệp dịch vụ quản lý khách mời và phản hồi; chưa được chỉnh bố cục. Các thiệp thuộc luồng điền thông tin cũ giữ nguyên chế độ sử dụng.

Editor admin nhập nội dung trực tiếp trên phần tử, không còn panel dữ liệu mẫu/liên kết dữ liệu. Xem [hướng dẫn tính năng](docs/editor/managed-invitations.md), [font tiếng Việt](docs/editor/font-library.md) và [hướng dẫn chuyển sang máy khác](docs/development/transfer-to-another-machine.md). Payment gateway/VNPay và editor linh hoạt cho customer thuộc giai đoạn sau.

## Prerequisites

- Git
- Node.js 24 LTS (xem `.nvmrc`)
- Corepack và pnpm version được pin trong `package.json`
- Docker Engine hoặc Docker Desktop với Docker Compose v2

Không cần cài PostgreSQL trực tiếp trên máy.

## Fresh clone đến healthy stack

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
pnpm dev
```

`pnpm dev` kiểm tra trước các port 3000, 3001 và 5432; start PostgreSQL; chờ database healthy; chạy migration; rồi start API và frontend. Nếu đổi port trong `.env`, cập nhật các URL tương ứng trong app env files.

Trong terminal khác:

```bash
pnpm health
```

Kết quả thành công báo riêng `frontend`, `backend-live`, `backend-ready` và `postgresql`, hoàn tất trong 10 giây và exit code 0. Có thể chạy lifecycle tự động có cleanup bằng:

```bash
pnpm smoke:local
```

Dừng `pnpm dev` bằng Ctrl+C; script dừng app processes và Compose infrastructure. `pnpm infra:down` cũng dừng infrastructure nhưng giữ data volume.

## Workflows độc lập

Frontend không cần backend hoặc PostgreSQL:

```bash
pnpm dev:web
pnpm format:check:web
pnpm lint:web
pnpm typecheck:web
pnpm test:web
pnpm build:web
```

Backend cần PostgreSQL nhưng không cần frontend:

```bash
pnpm dev:api
pnpm format:check:api
pnpm lint:api
pnpm typecheck:api
pnpm test:api
pnpm build:api
```

Mỗi app có `package.json`, `.env.example`, quality commands và Dockerfile riêng. Frontend build tạo Next.js standalone output; backend build tạo `apps/api/dist`. Build hoặc image của một app không yêu cầu build app còn lại.

## PostgreSQL và migrations

```bash
pnpm infra:up
pnpm --filter @wedding/api migration:show
pnpm --filter @wedding/api migration:run
pnpm --filter @wedding/api migration:revert
pnpm infra:down
```

PostgreSQL chỉ bind `127.0.0.1`, dùng database/user riêng cho project và credential local-only. Backend luôn có `synchronize: false` và không tự chạy migration khi boot.

`pnpm infra:reset` được guard vì xóa toàn bộ local database volume. Chỉ chạy khi chấp nhận mất dữ liệu local:

```bash
pnpm infra:reset -- --confirm
```

## Health endpoints

| Component         | Endpoint/check                                         | Meaning                                          |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Frontend          | `GET http://localhost:3000/api/health`                 | Next.js reachable; không gọi API/database        |
| Backend liveness  | `GET http://localhost:3001/api/v1/health/live`         | Process đang đáp ứng; không query database       |
| Backend readiness | `GET http://localhost:3001/api/v1/health/ready`        | PostgreSQL query thành công; trả 503 khi DB down |
| PostgreSQL        | `docker compose exec ... pg_isready` qua `pnpm health` | Database trực tiếp nhận kết nối                  |

Health response không chứa credential, connection string, internal host, stack trace hoặc environment value. Sau khi service ready, mỗi endpoint có target dưới 500 ms.

## Environment configuration

- Root `.env`: chỉ local orchestration và safe local PostgreSQL values; template `.env.example`.
- `apps/web/.env.local`: browser-safe frontend values; template `apps/web/.env.example`. Mọi `NEXT_PUBLIC_*` đều công khai.
- `apps/api/.env`: server-only database/origin/runtime values; template `apps/api/.env.example`.

Không commit actual env files hoặc secret. Frontend và backend fail fast với tên field cùng hướng khắc phục khi required config thiếu/sai, không echo secret value.

## Identity & Access Management

IAM hỗ trợ LOCAL registration/email verification/password recovery, Google/Facebook login,
refresh rotation, profile và Admin Customer lock/unlock. Access Token chỉ ở browser memory;
Refresh Token là opaque HttpOnly cookie. PostgreSQL giữ identity, session history, proof, outbox,
rate-limit và audit; Mailpit chỉ dùng local/CI.

```bash
# Local infrastructure and explicit migration
POSTGRES_PORT=55432 pnpm infra:up
pnpm --filter @wedding/api migration:run

# Disposable PostgreSQL validation (never point this at production)
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local \
  node apps/api/scripts/with-test-iam.cjs pnpm validate:iam --phase all

# Local SMTP/Mailpit smoke after API build
pnpm build:api
IAM_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local \
  pnpm validate:iam:mail
```

`validate:iam` creates and drops only its random `iam_test_*` schema. IAM migration rollback is
guarded for such disposable test schemas and must not be used to remove production IAM history.
Key rotation, bootstrap ADMIN, mail failure, retention and recovery procedures are in
`docs/iam-operations.md`; complete validation and browser/usability limitations are in
`specs/003-identity-access-management/quickstart.md`.

## Troubleshooting

### Missing hoặc invalid configuration

Copy lại template đúng scope và cung cấp field được error nêu tên. Không copy backend secret sang `NEXT_PUBLIC_*`. Kiểm tra URL có protocol `http://`, `https://` hoặc `postgresql://` phù hợp.

### Port occupied

Startup nêu rõ component và port bị chiếm. Dừng process/container đang dùng port hoặc đổi port cùng các URL liên quan; startup dừng trước khi tạo partial app processes.

### PostgreSQL unavailable

```bash
docker compose ps
docker compose logs postgres
pnpm infra:up
pnpm health
```

Frontend health và backend liveness có thể vẫn healthy; backend readiness và direct PostgreSQL check phải fail cho đến khi database phục hồi.

### Migration failure

API không được start nếu migration fail. Kiểm tra `DATABASE_URL`, PostgreSQL health và migration status:

```bash
pnpm infra:up
pnpm --filter @wedding/api migration:show
pnpm --filter @wedding/api migration:run
```

Không bật schema synchronization để né migration lỗi.

## Quality và CI

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:scripts
pnpm build
pnpm scope:check
```

GitHub Actions có bốn independent jobs: `frontend-checks`, `backend-checks`, `backend-integration`, `full-stack-health`. IAM integration dùng PostgreSQL/Mailpit disposable và ephemeral keys; workflow không deploy hoặc publish artifact. Merge enforcement là optional trong rapid development; `.github/rulesets/main.json` chỉ là dormant future template. Chính sách xem xét lại và hướng dẫn opt-in nằm tại `docs/ci.md`.

Protocol nhiều participant tại `docs/onboarding-validation.md` là optional future usability study,
không phải completion gate của rapid development.

## Fresh-clone validation evidence

Ngày 2026-09-26, một committed source snapshot tạm được clone sang disposable directory sạch. Node
`v24.21.0`, pnpm `12.3.4`, frozen install và ba bước copy environment template đều thành công.
`pnpm smoke:local` xác nhận frontend, backend liveness/readiness và PostgreSQL healthy rồi cleanup
Compose resources. Successful install mất `4m04.6s`, smoke mất `17.1s`, tổng khoảng `4m22s`.

Known limitations: repository chính chưa có commit nên dùng seed commit tạm
`9fec2bbf7f74fde169ceb0fc4199518f552937e5`; disposable clone chạy trên cùng Fedora host thay vì
máy/VM độc lập; port 5432 đang bận nên validation dùng `POSTGRES_PORT=55432` và matching
`DATABASE_URL`. Không còn external completion gate cho Project Foundation trong rapid development.
