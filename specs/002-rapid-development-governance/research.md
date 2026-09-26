# Phase 0 Research: Rapid Development Governance

## Artifact synchronization boundary

**Decision**: Xử lý feature 002 như một documentation/governance synchronization pass trên active
artifacts. Cập nhật Project Foundation spec, plan, tasks, quickstart, foundation checklist, root
README và CI guide; không sửa application source hoặc runtime behavior.

**Rationale**: FR-005/FR-006 yêu cầu loại stale blocker khỏi artifacts, trong khi scope loại trừ
application behavior, deploy, publish và provider operations.

**Alternatives considered**: Chỉ tạo docs mới cho feature 002 bị loại vì artifacts 001 vẫn mâu
thuẫn; sửa application/CI implementation bị loại vì ngoài scope và không cần thiết.

## CI evidence without merge enforcement

**Decision**: Giữ nguyên bốn CI jobs `frontend-checks`, `backend-checks`, `backend-integration` và
`full-stack-health`; mô tả chúng là independent CI jobs/checks, không gọi là required checks khi
chưa có protection policy.

**Rationale**: Workflow hiện tại đã cung cấp quality evidence theo FR-003/FR-004. Đổi tên, gộp hoặc
xóa jobs làm yếu continuity và vi phạm SC-002.

**Alternatives considered**: Gộp jobs bị loại vì mất component isolation; bỏ checks vi phạm
constitution; giữ từ “required” bị loại vì mô tả sai enforcement state.

## Dormant ruleset template

**Decision**: Giữ `.github/rulesets/main.json` như một dormant optional template. `docs/ci.md` phải
nói rõ apply/verify/rollback chỉ thực hiện sau một approved future decision và khi hosting capability
hỗ trợ; absence hoặc API failure không phải rapid-development blocker.

**Rationale**: Giữ template giúp tái sử dụng sau này mà không tạo bằng chứng giả rằng ruleset đang
active. Feature 002 cấm gọi GitHub API hoặc thay đổi visibility/plan.

**Alternatives considered**: Xóa template gây mất cấu hình hữu ích; apply ngay hoặc đổi visibility/
hosting plan vi phạm scope.

## Historical task disposition

**Decision**: Giữ task IDs `T053` và `T063` để bảo toàn traceability, nhưng ghi rõ chúng được
deferred/superseded bởi feature 002 và không còn là unchecked completion blockers. `T052` vẫn hoàn
thành vì nó chỉ tạo optional template, không chứng minh activation.

**Rationale**: Xóa task làm mất history; đánh dấu “applied” tạo false evidence; để unchecked tiếp tục
mâu thuẫn FR-005/FR-006.

**Alternatives considered**: Xóa task, giả lập completion hoặc giữ nguyên blocker đều bị loại.

## Release-readiness re-evaluation

**Decision**: Trước production delivery hoặc khi repository được tuyên bố release-ready, một feature
được phê duyệt riêng phải chọn policy, ghi hosting constraints, định nghĩa verification evidence và
validate policy trước milestone.

**Rationale**: Trigger dựa trên risk milestone phù hợp constitution v2.0.0 và ngăn rapid-development
exception kéo dài vô thời hạn.

**Alternatives considered**: Deadline theo lịch không gắn với risk; tự bật khi hosting hỗ trợ nhầm
capability với policy; bắt buộc GitHub Rulesets lặp lại blocker hiện tại.

## Repository setup risk

**Decision**: Ghi nhận branch-name alignment (`master` so với CI target `main`) như risk độc lập,
không tự đổi branch trong feature documentation-only này.

**Rationale**: PR checks vẫn là quality evidence, nhưng push evidence phụ thuộc target branch. Đổi
branch là repository-state mutation ngoài scope hiện tại.

**Alternatives considered**: Đổi branch ngầm bị loại vì vượt quyền hạn và không liên quan trực tiếp
đến ruleset policy.
