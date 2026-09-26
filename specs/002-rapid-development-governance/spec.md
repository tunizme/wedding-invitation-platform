# Feature Specification: Rapid Development Governance

**Feature Branch**: `002-rapid-development-governance`

**Created**: 2026-09-26

**Status**: Draft

**Input**: User description: "docs: amend constitution v2.0.0 for rapid development"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tiếp tục phát triển không bị chặn bởi Rulesets (Priority: P1)

Là maintainer trong giai đoạn rapid development, tôi muốn repository rulesets và automated merge
blocking là tùy chọn để tiến độ phát triển không phụ thuộc vào repository hosting plan hoặc cấu hình
merge protection chưa cần thiết.

**Why this priority**: Đây là mục tiêu trực tiếp của amendment và loại bỏ completion gate đang chặn
Project Foundation dù implementation và CI validation đã tồn tại.

**Independent Test**: Rà soát constitution và các artifact feature đang hoạt động; không artifact
nào được coi việc thiếu ruleset là blocker trong giai đoạn rapid development.

**Acceptance Scenarios**:

1. **Given** dự án đang ở giai đoạn rapid development, **When** maintainer đánh giá completion của
   một feature, **Then** việc repository chưa có ruleset không làm feature thất bại.
2. **Given** hosting plan không hỗ trợ rulesets cho repository hiện tại, **When** maintainer tiếp tục
   phát triển, **Then** không cần đổi visibility hoặc mua plan chỉ để hoàn tất feature.

---

### User Story 2 - Duy trì bằng chứng chất lượng từ CI (Priority: P2)

Là reviewer, tôi muốn các quality checks vẫn chạy và báo kết quả độc lập dù merge không bị chặn tự
động, để tốc độ phát triển không làm mất khả năng quan sát lỗi.

**Why this priority**: Bỏ automated enforcement không đồng nghĩa với bỏ validation; bằng chứng CI
vẫn cần thiết để phát hiện regression và chuẩn bị cho release sau này.

**Independent Test**: Kiểm tra một thay đổi đi qua quy trình validation; từng nhóm kiểm tra áp dụng
vẫn trả kết quả riêng và không có bước deploy hoặc publish ngoài phạm vi.

**Acceptance Scenarios**:

1. **Given** một thay đổi được gửi lên repository, **When** quy trình validation chạy, **Then** các
   checks áp dụng báo pass/fail rõ ràng dù chưa có merge protection.
2. **Given** một check thất bại, **When** maintainer xem kết quả, **Then** component bị ảnh hưởng được
   nhận diện mà không có tuyên bố sai rằng thay đổi đã đạt chất lượng.

---

### User Story 3 - Biết thời điểm xem xét lại merge protection (Priority: P3)

Là maintainer chuẩn bị release, tôi muốn governance nêu rõ trigger xem xét lại merge protection để
quyết định rapid-development không trở thành miễn trừ vô thời hạn cho production delivery.

**Why this priority**: Chính sách hiện tại tối ưu tốc độ sớm nhưng cần một điểm kiểm soát rõ ràng khi
rủi ro phát hành tăng lên.

**Independent Test**: Một reviewer đọc governance có thể xác định chính xác milestone nào yêu cầu
một quyết định merge-protection mới.

**Acceptance Scenarios**:

1. **Given** một feature bắt đầu production delivery hoặc tuyên bố repository release-ready,
   **When** feature đó được specification review, **Then** merge-protection policy phải được quyết
   định, ghi tài liệu và có tiêu chí xác minh rõ ràng.

---

### Edge Cases

- Repository chuyển từ private sang public hoặc hosting plan bắt đầu hỗ trợ rulesets trong rapid
  development; việc có capability mới không tự biến merge protection thành completion gate.
- Nhiều contributor bắt đầu làm việc trước release-ready; maintainer có thể tạo feature riêng để
  bật protection sớm mà không sửa ngầm policy hiện hành.
- CI tạm thời không chạy do sự cố nền tảng; thiếu kết quả không được ghi nhận sai là pass.
- Một feature production-delivery được mở khi artifact cũ vẫn nói rulesets là tùy chọn; feature mới
  phải xác lập policy áp dụng cho milestone đó.
- Merge xảy ra khi check thất bại trong rapid development; failure vẫn phải được hiển thị và xử lý,
  dù repository không tự động chặn merge.

## Requirements *(mandatory)*

### Scope Boundaries

**In scope**:

- Governance cho repository rulesets và automated merge blocking trong rapid development.
- Duy trì CI validation và khả năng quan sát pass/fail độc lập.
- Đồng bộ artifact để thiếu ruleset không còn là completion blocker hiện tại.
- Trigger rõ ràng để quyết định lại merge protection trước production delivery hoặc release-ready.

**Out of scope**:

- Bật, apply hoặc verify repository rulesets ngay trong feature này.
- Thay đổi visibility, mua hoặc nâng cấp hosting plan.
- Bỏ CI checks, giảm test coverage, deploy hoặc publish artifact.
- Thay đổi application behavior, domain model hoặc user-facing functionality.

### Functional Requirements

- **FR-001**: Governance MUST xác định repository rulesets và automated merge blocking là tùy chọn
  trong giai đoạn rapid development.
- **FR-002**: Feature completion trong rapid development MUST NOT phụ thuộc vào repository ruleset,
  merge protection, repository visibility hoặc paid hosting capability.
- **FR-003**: Các CI checks áp dụng MUST tiếp tục chạy và báo pass/fail độc lập dù không tự động chặn
  merge.
- **FR-004**: CI MUST NOT deploy hoặc publish artifact trừ khi một feature được phê duyệt riêng cho
  phép các hành động đó.
- **FR-005**: Các artifact hiện hành MUST không mô tả việc thiếu ruleset là blocker của Project
  Foundation trong rapid development.
- **FR-006**: Task chỉ tồn tại để apply hoặc verify rulesets trong rapid development MUST được loại
  khỏi completion scope hoặc được ghi nhận là deferred sang feature release-readiness.
- **FR-007**: Một feature bắt đầu production delivery hoặc tuyên bố repository release-ready MUST
  quyết định, ghi tài liệu và xác minh merge-protection policy của milestone đó.
- **FR-008**: Amendment MUST ghi rõ version, ngày thay đổi, rationale và impact đối với các artifact
  phụ thuộc.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% artifact active được rà soát không còn xem thiếu ruleset là blocker trong rapid
  development.
- **SC-002**: 100% CI checks đã áp dụng trước amendment vẫn còn được mô tả như quality evidence và
  không check nào bị loại chỉ vì merge protection trở thành tùy chọn.
- **SC-003**: Một maintainer có thể xác định trigger xem xét lại merge protection trong vòng 2 phút
  chỉ bằng governance documentation.
- **SC-004**: Không có deployment hoặc artifact publishing capability mới được thêm bởi amendment.
- **SC-005**: Tất cả task chỉ nhằm apply/verify rulesets hiện tại được loại khỏi completion blocker
  hoặc được deferred rõ ràng trước lần đánh giá Project Foundation tiếp theo.

## Assumptions

- Dự án hiện ở rapid-development stage và chưa tuyên bố release-ready.
- CI validation hiện có tiếp tục là nguồn bằng chứng chất lượng chính.
- Maintainer chấp nhận review kết quả CI mà không cần repository tự động chặn merge.
- Quyết định merge-protection cho production delivery sẽ nằm trong một feature được phê duyệt riêng.
