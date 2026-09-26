# Data Model: Rapid Development Governance

## Scope

Feature không tạo persisted application data, database table hoặc migration. Các entity dưới đây là
logical documentation records dùng để kiểm tra tính nhất quán giữa governance artifacts.

## Governance Policy

| Field | Type | Rules |
|-------|------|-------|
| `version` | Semantic version | `2.0.0` cho amendment hiện tại |
| `developmentStage` | Enum | `rapid-development` hoặc milestone được feature sau định nghĩa |
| `mergeProtectionRequirement` | Enum | `optional` trong rapid development |
| `ciEvidenceRequirement` | Enum | `required`; applicable jobs phải chạy và báo pass/fail |
| `releaseTriggers` | Set | `production-delivery`, `release-ready` |
| `lastAmended` | Date | ISO date của governance amendment |

Validation: policy không được đồng thời coi ruleset là rapid-development blocker và optional. CI
evidence requirement không được bị hạ xuống khi merge enforcement được defer.

## Artifact Alignment Record

| Field | Type | Rules |
|-------|------|-------|
| `path` | Repository-relative path | Phải nằm trong documented scope |
| `currentAssertion` | Text | Assertion trước alignment |
| `targetAssertion` | Text | Phải phù hợp constitution v2.0.0 |
| `disposition` | Enum | `update`, `verify-unchanged`, `defer-with-trace` |
| `evidence` | Text | Search result, checklist hoặc review note |

Lifecycle: `identified → aligned → verified`. Record không được chuyển sang `verified` nếu artifact
vẫn mô tả thiếu ruleset là completion blocker.

## CI Quality Evidence

| Field | Type | Rules |
|-------|------|-------|
| `checkName` | Enum | `frontend-checks`, `backend-checks`, `backend-integration`, `full-stack-health` |
| `result` | Enum | `pass`, `fail`, `unavailable`; không có implicit pass |
| `mergeEnforcement` | Enum | `none` trong rapid development, do repository state quyết định |
| `deliveryAction` | Enum | `none`; deploy/publish ngoài scope |

Relationship: Governance Policy yêu cầu bốn CI Quality Evidence records nhưng không yêu cầu chúng
được gắn với automated merge blocking trong rapid development.

## Merge Protection Decision

| Field | Type | Rules |
|-------|------|-------|
| `status` | Enum | `deferred`, `under-review`, `approved`, `validated` |
| `trigger` | Enum | `production-delivery` hoặc `release-ready` |
| `hostingConstraints` | Text | Capability/plan constraints tại thời điểm review |
| `selectedPolicy` | Text | Policy được feature tương lai phê duyệt |
| `verificationEvidence` | Text | Evidence trước khi milestone tiếp tục |

Transitions: `deferred → under-review → approved → validated`. Rapid development dùng `deferred`;
capability thay đổi không tự động chuyển state.
