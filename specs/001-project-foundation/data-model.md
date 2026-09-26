# Data Model: Project Foundation

## Scope

Chưa có business/domain entity. Không tạo `User`, `Invitation`, `Payment`, `VNPayTransaction` hay seed data. Empty baseline migration xác nhận migration lifecycle; TypeORM tự duy trì migration history.

## Persisted Model: Migration Record

Infrastructure-owned record do TypeORM quản lý.

| Field | Type | Rules |
|-------|------|-------|
| `id` | Integer | Primary key do migration engine quản lý |
| `timestamp` | Big integer | Unique generated migration timestamp |
| `name` | String | Committed migration name, ví dụ `InitialFoundation` |

Không có business relationship. Lifecycle: `Pending --migration:run--> Applied --migration:revert latest--> Pending`.

Rules: `synchronize` luôn `false`; baseline có empty `up`/`down`; CI apply migrations trên DB sạch; API startup không tự apply migration.

## Transient Model: Component Health Status

| Field | Type | Rules |
|-------|------|-------|
| `status` | Enum | `ok`, `ready`, `not_ready` theo endpoint |
| `component` | Enum | `frontend` hoặc `backend` khi contract yêu cầu |
| `checks.database` | Enum | `up` hoặc `down`; chỉ trong readiness |
| `timestamp` | ISO 8601 string | UTC check time |

Transitions: frontend reachable/unreachable; backend live/unavailable; PostgreSQL `up` dẫn tới `ready`, `down` dẫn tới `not_ready` trong khi liveness vẫn có thể `ok`.

Rules: không expose credential, connection string, internal host, stack trace hay environment value; liveness không query DB; readiness có bounded timeout và trả 503 khi DB down; frontend health không gọi backend.

## Logical Model: Local Environment Configuration

| Scope | Representative values | Exposure rules |
|-------|-----------------------|----------------|
| Root | Compose project, PostgreSQL database/user/local password/port | Safe local defaults only |
| Backend | `NODE_ENV`, API port, `DATABASE_URL`, frontend origin | Server-only; fail fast |
| Frontend | web port, `NEXT_PUBLIC_API_BASE_URL` | Browser-safe values only |

Root DB values và backend URL phải trỏ cùng local instance. Frontend API URL trỏ tới public REST base nhưng không chi phối frontend health. Mỗi app chỉ đọc config thuộc ownership của mình.
