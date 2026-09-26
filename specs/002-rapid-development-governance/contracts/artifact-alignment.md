# Artifact Alignment Contract

Contract này định nghĩa outcome bắt buộc khi implementation đồng bộ rapid-development governance.

| Artifact | Required outcome | Forbidden outcome | Verification evidence |
|----------|------------------|-------------------|-----------------------|
| `.specify/memory/constitution.md` | Version 2.0.0; rulesets optional; CI evidence required; release trigger rõ ràng | Unconditional merge-blocking MUST | Version/policy search |
| `specs/001-project-foundation/spec.md` | Foundation completion không phụ thuộc ruleset; bốn CI results vẫn observable | FR/SC yêu cầu repository từ chối merge trong rapid development | Requirement review |
| `specs/001-project-foundation/plan.md` | Constitution v2 gate và optional enforcement được phản ánh | Evidence claim rằng active ruleset đã được verify | Constitution table review |
| `specs/001-project-foundation/tasks.md` | `T053`/`T063` giữ ID nhưng có deferred/superseded disposition và không còn unchecked blocker; `T052` chỉ là optional template | Claim ruleset đã apply khi không có evidence | Open-task scan |
| `specs/001-project-foundation/quickstart.md` | Bốn CI jobs được giữ; ruleset không nằm trong pending external gates | Ruleset absence blocks Foundation | Stale-text scan |
| `specs/001-project-foundation/checklists/foundation.md` | Checklist đánh giá optional policy đúng constitution v2 | Checklist vẫn yêu cầu unconditional enforcement | Checklist review |
| `README.md` | CI evidence được mô tả; ruleset là optional future control | Foundation completion phụ thuộc ruleset | Stale-text scan |
| `docs/ci.md` | Guide nói rõ template dormant và future opt-in conditions | Hướng dẫn ngụ ý phải apply ngay | Documentation review |
| `.github/workflows/ci.yml` | Giữ bốn job names, read-only contents permission, không deploy/publish | Rename/remove jobs hoặc thêm delivery action | Workflow structure scan |
| `.github/rulesets/main.json` | Giữ như dormant desired-state template | File được dùng làm bằng chứng active state | Documentation cross-reference |

## Task Disposition Contract

- `T053` và `T063` MUST không còn là unchecked completion blockers.
- Disposition MUST nói rõ activation chưa xảy ra và được superseded/deferred bởi feature 002.
- `T052` MAY giữ `[X]` vì tạo template là work đã hoàn tất.
- Fresh-clone/onboarding tasks không liên quan rulesets MUST giữ nguyên trạng thái và evidence thật.

## Release Trigger Contract

Trước `production-delivery` hoặc `release-ready`, feature tương lai MUST:

1. Chọn merge-protection policy phù hợp governance tại thời điểm đó.
2. Ghi repository/hosting constraints.
3. Định nghĩa pass/fail evidence.
4. Validate policy trước khi milestone tiếp tục.
