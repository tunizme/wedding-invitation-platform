# Data Model: IAM Auth Transition Reliability (CSP-1)

**Date:** 2026-10-07. **Source:** [research R12](research.md#r12--selected-protocol--p01p02-design-proof), [spec](spec.md). Phase1 design đã được implement bằng entities và hai explicit migrations tại `apps/api/src/infrastructure/database/migrations/`; schema/lifecycle và PostgreSQL runtime checks PASS trong final006 all (2026-10-08). Synchronize vẫn disabled theo constitutionIV.

Existing003 entities (`users`, `auth_sessions`, `refresh_credentials`, `oauth_transactions`, `pending_social_onboardings`, `auth_challenges`, `external_identities`) giữ business semantics. Phần dưới chỉ mô tả entity mới và column bổ sung.

## Server entities

### AuthContext — `auth_contexts` (mới)

Bound logical auth lifetime của một browser storage partition (FR-001). Không phải account, không phải tab.

| Field                                                      | Type                                  | Rule                                                                                               |
| ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `id`                                                       | uuid PK                               | Random; xuất hiện trong cookie name và header `X-Auth-Context`. Không phải secret, không cấp quyền |
| `binding_digest`                                           | bytea                                 | HMAC digest của binding secret 32 byte; key-versioned như refresh digest                           |
| `binding_key_version`                                      | int                                   | Key version của digest                                                                             |
| `group_id`                                                 | uuid, not null, index                 | Capacity group (xem CookieName). Ban đầu = group mới hoặc group của bindings co-present            |
| `state`                                                    | enum `PROVISIONAL`/`ACTIVE`/`RETIRED` | Chỉ ACTIVE nhận reserve/execute/refresh                                                            |
| `confirmed_seq`                                            | bigint null, unique                   | Global sequence gán khi confirm; dùng cho cleanup ordering                                         |
| `revision`                                                 | bigint not null default 0             | Tăng 1 mỗi lần accept reservation session-establishing/ending                                      |
| `current_intent_id`                                        | uuid null FK → auth_intents           | Intent được server accept gần nhất còn RESERVED                                                    |
| `current_session_id`                                       | uuid null FK → auth_sessions          | Session hiện hành; trỏ tới session revoked/expired được đọc như null                               |
| `created_at`, `confirmed_at`, `last_seen_at`, `retired_at` | timestamptz                           | `last_seen_at` cập nhật tối đa 1 lần/phút để giảm write                                            |

**Validation:** confirm chỉ khi state PROVISIONAL và binding cookie đúng name trình đúng secret. Provisional quá 1 giờ không confirm → RETIRED bởi retention worker. ACTIVE không có request trong 30 ngày → RETIRED.

**State transitions:**

```text
PROVISIONAL --confirm(binding ok)--> ACTIVE
PROVISIONAL --1h no confirm / retire--> RETIRED
ACTIVE --30d idle / cleanup retire / rollback--> RETIRED
RETIRED: terminal; mọi request với context này → CONTEXT_UNAVAILABLE
```

### AuthIntent — `auth_intents` (mới)

Explicit establish/end intent với trusted server ordering (FR-002, FR-005).

| Field                       | Type                                                        | Rule                                                                                                               |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                        | uuid PK                                                     | Trả cho client; dùng trong `X-Auth-Intent` và query `intent` của OAuth start                                       |
| `context_id`                | uuid FK → auth_contexts, index                              |                                                                                                                    |
| `kind`                      | enum `LOCAL_LOGIN`/`OAUTH`/`ONBOARDING_COMPLETE`/`LOGOUT`   |                                                                                                                    |
| `revision`                  | bigint                                                      | Giá trị `auth_contexts.revision` ngay sau khi accept                                                               |
| `state`                     | enum `RESERVED`/`COMMITTED`/`SUPERSEDED`/`FAILED`/`EXPIRED` |                                                                                                                    |
| `outcome_code`              | text null                                                   | Safe code (vd. `SESSION_ESTABLISHED`, `SESSION_ENDED`, `INVALID_CREDENTIALS`, `ONBOARDING_REQUIRED`, `SUPERSEDED`) |
| `target_session_id`         | uuid null                                                   | LOGOUT: session được capture khi reserve. Establish: session được tạo khi COMMITTED                                |
| `oauth_started_at`          | timestamptz null                                            | OAUTH: start chỉ được dùng một lần                                                                                 |
| `expires_at`                | timestamptz                                                 | LOCAL_LOGIN/LOGOUT/ONBOARDING_COMPLETE 60s; OAUTH 10 phút                                                          |
| `created_at`, `resolved_at` | timestamptz                                                 |                                                                                                                    |

**Không lưu:** password, token, proof, provider code, email. `outcome_code` không phân biệt account existence ngoài những gì003 đã trả.

**State transitions:**

```text
RESERVED --execute commit, current & revision match--> COMMITTED
RESERVED --newer reservation accepted in context--> SUPERSEDED
RESERVED --business rejection (credentials, provider deny)--> FAILED
RESERVED --expires_at passed--> EXPIRED
COMMITTED/SUPERSEDED/FAILED/EXPIRED: terminal
```

**Invariants:**

- Mỗi context có tối đa một intent RESERVED, chính là `current_intent_id`.
- Commit chỉ khi `context.current_intent_id = intent.id` và `context.revision = intent.revision` trong cùng transaction đã lock Context.
- Terminal intent **không** release capacity và không chứng minh cookie delivery (R06).
- Retention: terminal intents xóa sau 24h (outcome lookup window).

### CookieName ledger — `auth_cookie_names` (mới)

Finite delivery capacity per group (FR-006, policy P02).

| Field              | Type                  | Rule                                                                                     |
| ------------------ | --------------------- | ---------------------------------------------------------------------------------------- |
| `group_id`         | uuid                  | PK phần 1                                                                                |
| `name`             | text                  | PK phần 2; full cookie name (`__Host-wa_cb_<id>` / `__Secure-wa_s_<tag>` hoặc dev names) |
| `kind`             | enum `BINDING`/`SLOT` |                                                                                          |
| `owner_context_id` | uuid null             | BINDING                                                                                  |
| `owner_session_id` | uuid null             | SLOT                                                                                     |
| `last_set_digest`  | bytea                 | HMAC digest của value của set emission gần nhất (không lưu value)                        |
| `unresolved_set`   | bool                  | true từ lúc emit set cho tới khi request trình đúng value đó                             |
| `observed_present` | bool                  | Theo request gần nhất của group trên auth endpoint                                       |
| `observed_at`      | timestamptz           |                                                                                          |
| `bytes`            | int                   | Serialized `name=value` length dùng cho `CAP_BYTES`                                      |

**Accounting rule:** `N(G) = {observed_present} ∪ {unresolved_set}`. Giới hạn, điều kiện ack/release và cleanup: xem [browser-state §1–2](contracts/browser-state.md#2-capacity-policy-p02) (nguồn chính).

**Group merge:** request trình bindings của nhiều group → lock các contexts (sorted), chọn group có `min(id)` làm survivor, re-point contexts và ledger rows. Merge chỉ xảy ra trong transaction đã lock L0.

### Column bổ sung trên existing003 tables

| Table                             | Column                                    | Rule                                                                                      |
| --------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `auth_sessions`                   | `context_id uuid null FK → auth_contexts` | Null = legacy session (pre-cutover); legacy session không bao giờ là `current_session_id` |
| `auth_sessions`                   | `slot_tag text null unique`               | Random 128-bit base64url (22 ký tự); immutable, không reuse                               |
| `auth_sessions.revocation_reason` | thêm giá trị `SUPERSEDED`                 | Session bị thay thế bởi establish intent mới trong cùng context                           |
| `oauth_transactions`              | `intent_id uuid null FK → auth_intents`   | Null = pre-cutover transaction → callback bị reject sau cutover                           |
| `pending_social_onboardings`      | `context_id uuid null`                    | Context của OAuth intent tạo onboarding; completion phải chạy trong cùng context          |

Refresh credentials, CSRF seed/key version, absolute expiry 14 ngày và access TTL 15 phút không đổi.

## Frontend state

### Shared selector — IndexedDB (mới, 006 sở hữu)

Database `wedding-auth`, object store `selector`, một record key `current`. Chỉ ghi qua short readwrite transaction; không giữ transaction qua network await.

| Field            | Type                                                                                                                                           | Rule                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`          | `UNSELECTED`/`PROVISIONING`/`SELECTED`/`RECOVERY_REQUIRED`                                                                                     | Record vắng mặt = UNSELECTED                                                                                                                               |
| `attemptId`      | string (random UUID)                                                                                                                           | Attempt hiện hành (provisioning hoặc intent)                                                                                                               |
| `attemptSeq`     | number                                                                                                                                         | Tăng mỗi attempt; tie-breaker local order                                                                                                                  |
| `attemptAt`      | number (epoch ms local)                                                                                                                        | Staleness 20s cho attempt/lease tự động                                                                                                                    |
| `contextId`      | string null                                                                                                                                    | Chỉ khi SELECTED                                                                                                                                           |
| `revision`       | number                                                                                                                                         | Revision server lớn nhất đã biết; chỉ tăng (CAS max)                                                                                                       |
| `sessionTag`     | string null                                                                                                                                    | Slot tag của session đã admit                                                                                                                              |
| `pendingIntent`  | `{attemptId, kind, expectedRevision, intentId?}` null                                                                                          | Intent chưa resolved; LOGOUT pending chặn auto-admission                                                                                                   |
| `refreshLease`   | `{attemptId, at}` null                                                                                                                         | Cross-tab refresh single-flight, hết hạn 20s                                                                                                               |
| `recoveryReason` | `STORAGE_RESET`/`CREDENTIAL_MISSING`/`CAPACITY_EXHAUSTED`/`CONTEXT_UNAVAILABLE`/`NOT_DISPATCHED`/`OPERATION_UNCERTAIN`/`OPERATION_FAILED` null | `STORAGE_UNAVAILABLE` chỉ tồn tại trong tab memory vì IDB không mở được; operation knowledge không chứng minh cookie mất hoặc remote revocation thành công | Hiển thị recovery state (FR-006/008), Phase20 T106–T107 |

**Không lưu:** email, profile, access token, CSRF token, cookie value, proof, password (FR-015).

**State transitions:**

```text
UNSELECTED|RECOVERY_REQUIRED --explicit auth action--> PROVISIONING(attempt)
PROVISIONING --confirm ok + attempt still current--> SELECTED(context)
PROVISIONING --superseded/failed--> (unchanged owner) / RECOVERY_REQUIRED
SELECTED --CREDENTIAL_MISSING / CONTEXT_UNAVAILABLE / CAPACITY_EXHAUSTED--> RECOVERY_REQUIRED
SELECTED --NOT_DISPATCHED / OPERATION_UNCERTAIN / OPERATION_FAILED--> RECOVERY_REQUIRED
record missing while tab holds context --> tab ends private admission (STORAGE_RESET)
```

### Client operation knowledge (per tab memory)

Giữ R06: `NOT_DISPATCHED`/`COMPLETED`/`UNCERTAIN` là client knowledge, không phải backend state. `UNCERTAIN` được persist một phần qua `selector.pendingIntent` để tab mở lại có thể reconcile bằng outcome lookup read-only.

Setup failures cũng persist `selector.recoveryReason` trên PROVISIONING/SELECTED record mà không bỏ pending attempt/intent routing. Queue expiry persist NOT_DISPATCHED trên SELECTED, giữ peer lease/authority. Bootstrap/admission mới bị chặn khi explanation còn; explicit intent mới hoặc verified server-state update clears explanation. Không có intent ID thì không probe receipt; không token/profile/secret trong metadata (T110–T112).

## Lock hierarchy (L-proof R12)

```text
L0  auth_contexts           (sorted id, một statement; merge lock nhiều contexts)
    pg_advisory provider subject     ┐
    external_identities              │
    users (sorted id)                │ existing003 order, không đổi
    auth_sessions (per user, sorted) │
    refresh_credentials / auth_challenges / oauth_transactions /
    pending_social_onboardings       ┘
L∞  auth_cookie_names       (sorted name)
```

Account-wide revocation (password change/reset, logout-all, admin lock) không lock L0. Không network trong transaction.

## Requirement trace

| Entity                     | Requirements                           |
| -------------------------- | -------------------------------------- |
| AuthContext, selector      | FR-001, FR-002, FR-008                 |
| AuthIntent                 | FR-002, FR-003, FR-004, FR-005, FR-009 |
| CookieName ledger          | FR-003, FR-006, FR-008                 |
| Session columns            | FR-003, FR-011, FR-012, FR-014         |
| Client operation knowledge | FR-004–FR-007, FR-010                  |
