# CI trong rapid development

CI chỉ validation, không deploy hoặc publish artifact. Mỗi pull request phải cho phép reviewer quan
sát bốn kết quả độc lập: `frontend-checks`, `backend-checks`, `backend-integration` và
`full-stack-health`. Một check thất bại phải hiển thị failure domain tương ứng để sửa lỗi, nhưng
rapid-development policy hiện tại không yêu cầu GitHub tự động chặn merge.

`backend-integration` chạy PostgreSQL 17 và Mailpit đã pin, apply migration trên database CI,
sau đó chạy `validate:iam --phase all` trong schema ngẫu nhiên do runner sở hữu. Job đặt
`DATABASE_HEALTH_MODE=direct` để health runner kiểm tra GitHub service-container qua
`DATABASE_URL`; local và `full-stack-health` giữ mặc định `compose` để kiểm tra container do
project quản lý. Cả hai probe đều bounded và không in connection URL. IAM key/JWT key
được tạo tạm trong process con bằng `with-test-iam.cjs`, không được lưu thành secret hay artifact.
Mail smoke chỉ xóa message gửi tới địa chỉ ngẫu nhiên của chính lượt chạy; schema test luôn được
drop trong `finally`. Job không xóa hoặc tái sử dụng persistent production data.

`full-stack-health` vẫn là job thứ tư độc lập. Compose profile `ci` đợi PostgreSQL, migration,
Mailpit, API và web theo dependency health; bước `if: always()` dừng container, xóa volume CI và
orphan sau cả success lẫn failure. Workflow không có credential provider thật và không thay thế
browser/real-provider/usability evidence.

Thiếu repository ruleset không phải completion blocker trong giai đoạn này. File
`.github/rulesets/main.json` chỉ là dormant desired-state template cho một quyết định tương lai;
giá trị `enforcement: active` trong template không chứng minh repository đang có ruleset active.
Feature hiện tại không gọi GitHub API, không đổi repository visibility và không yêu cầu nâng hosting
plan.

## Xem xét lại khi chuẩn bị phát hành

Một feature được phê duyệt mới MUST quyết định lại merge-protection policy trước một trong hai mốc:

- bắt đầu production delivery; hoặc
- tuyên bố sản phẩm/repository là release-ready.

Feature tương lai phải thực hiện và lưu evidence cho đủ bốn bước sau:

1. Xác nhận hosting plan và repository visibility hỗ trợ control được chọn.
2. Chọn rõ enforcement policy: giữ manual review, bật ruleset, hoặc cơ chế tương đương.
3. Được repository owner phê duyệt trước mọi thay đổi external repository state.
4. Xác minh control thực tế bằng provider evidence và một failing-check scenario trước milestone.

Nếu quyết định tương lai chọn GitHub Rulesets, maintainer có thể dùng
`.github/rulesets/main.json` làm điểm bắt đầu sau khi kiểm tra lại branch name và required checks.
Lệnh apply, disable hoặc delete phải nằm trong feature/runbook được phê duyệt khi đó; chúng không
phải bước setup hay completion của rapid development hiện tại.
