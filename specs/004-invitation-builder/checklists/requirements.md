# Specification Quality Checklist: Invitation Builder

**Purpose**: Kiểm tra tính đầy đủ, rõ ràng và khả năng nghiệm thu của đặc tả trước planning.

**Created**: 2026-10-01

**Feature**: [spec.md](../spec.md)

**Review Ownership**: Checklist do bước `speckit-specify` rà soát và cập nhật.

**Marker Semantics**: `[x]` nghĩa là tiêu chí chất lượng yêu cầu đã được rà soát và đáp ứng; không có nghĩa chức năng đã được triển khai hoặc kiểm thử chạy thành công.

## Content Quality

- [x] CHK001 Không quy định chi tiết triển khai như cấu trúc code, hợp đồng API hoặc thuật toán tích hợp thư viện.
- [x] CHK002 Tập trung vào giá trị người dùng và nhu cầu nghiệp vụ.
- [x] CHK003 Nội dung được mô tả theo hành vi để stakeholder nghiệp vụ có thể review.
- [x] CHK004 Hoàn thành các phần bắt buộc của spec template.

## Requirement Completeness

- [x] CHK005 Không còn marker yêu cầu làm rõ.
- [x] CHK006 Yêu cầu có hành vi kiểm chứng được và không mâu thuẫn về phạm vi.
- [x] CHK007 Success criteria có thước đo cụ thể.
- [x] CHK008 Success criteria không phụ thuộc công nghệ triển khai.
- [x] CHK009 Các user story có acceptance scenarios Given/When/Then.
- [x] CHK010 Có edge cases về dữ liệu, trạng thái, quyền, lỗi và thao tác đồng thời.
- [x] CHK011 Phân định MVP/Later và các nghiệp vụ ngoài phạm vi.
- [x] CHK012 Ghi rõ dependency, giả định và quyết định đã được người dùng xác nhận.

## Feature Readiness

- [x] CHK013 Mọi functional requirement có liên kết với user story/acceptance scenario.
- [x] CHK014 User scenarios bao phủ tạo mẫu, binding, asset/publish, customer, admin tạo hộ và RSVP thật.
- [x] CHK015 Success criteria bao phủ kết quả sử dụng chính, tính toàn vẹn dữ liệu và kiểm soát truy cập.
- [x] CHK016 Không đưa thiết kế triển khai vào yêu cầu nghiệp vụ; ràng buộc công nghệ đã chốt được phân biệt với công việc planning.

## Review Evidence

| Nhóm yêu cầu | Acceptance coverage | Tiêu chí kết quả liên quan |
|--------------|---------------------|---------------------------|
| FR-001–003: quyền và tạo hộ | US1, US4.6, US5.1–5 | SC-007 |
| FR-004–007: editor/workarea và lưu | US1.1–6, US2.3–4 | SC-001, SC-002, SC-008 |
| FR-008–010: element/layers | US1.2–4, US2.2 | SC-001, SC-002 |
| FR-011–014: properties/overflow | US1.3, US2.3–4, US3.6, US4.7 | SC-001–004 |
| FR-015–017: assets | US3.1, US3.5–6, US4.2, US4.6 | SC-001, SC-007 |
| FR-018–021: binding | US2.1–5, US3.6, US4.1–2, US4.7 | SC-003, SC-004 |
| FR-022–024: widgets/renderer | US2.2, US2.4–5, US3.6, US4.2 | SC-002–004 |
| FR-025–028: persistence/revisions | US1.5, US3.2–4, US3.6, US4.1 | SC-001, SC-005 |
| FR-029–032: customer/admin thiệp | US4.1–7, US5.1–3 | SC-004, SC-005, SC-007 |
| FR-033–037: RSVP | US5.4, US6.1–6 | SC-006, SC-007 |

## Notes

- Kết quả rà soát: 16/16 tiêu chí chất lượng đạt; sáu user story, 37 functional requirements, tám success criteria. Đây là đánh giá tài liệu, không phải kết quả kiểm thử sản phẩm.
- Quyết định trực tiếp từ người dùng: một layout chuẩn, canvas cao tùy chỉnh, RSVP thật qua form công khai, Customer tự tạo thiệp và ADMIN có thể tạo hộ.
- Các mặc định bổ sung nằm trong spec: quyền đọc RSVP chỉ cho owner, số người tham dự 1–20, giới hạn độ dài tên/lời nhắn, giới hạn gửi 5 lượt mới/10 phút/nguồn/thiệp, không đổi template cho thiệp hiện hữu. Đây là mặc định đặc tả, không được trình bày như lựa chọn người dùng đã trả lời riêng.
- Bằng chứng tách dữ liệu: FR-018 yêu cầu "dữ liệu thật MUST thuộc WeddingData"; FR-021 đặt invitation của RSVP vào runtime context; FR-028 ngăn tự nâng cấp revision của thiệp cũ.
- Bằng chứng ranh giới quyền: FR-003 yêu cầu lưu actor/owner riêng; FR-037 chỉ cho owner xem phản hồi. Không suy diễn quyền Admin hỗ trợ thành quyền đọc RSVP.
- MinIO và giao tiếp tương thích S3 được người dùng bổ sung trước implementation; storage contract và tasks được cập nhật, chưa có bằng chứng chạy MinIO hoặc AWS.
- Craft.js + Moveable chỉ được ghi ở Assumptions như ràng buộc người dùng đã chốt. Đánh giá CHK001/CHK016 không loại bỏ ràng buộc đó; tích hợp thư viện, serialization, API và schema lưu trữ được để cho planning.
- Các quyết định kỹ thuật còn thuộc planning: tương thích stack, kích thước/giới hạn hỗ trợ, chi tiết adapter/cấu hình MinIO, thumbnail, bản đồ, QR Bank, môi trường đo SC-008 và cơ chế áp dụng giới hạn gửi. Đây không phải feature đã có trong repo hoặc bằng chứng hệ thống đã đáp ứng yêu cầu.
- Không có `.specify/extensions.yml` tại thời điểm thực hiện; không có before/after hook cần chạy, không tạo branch.
- Sẵn sàng cho `$speckit-plan`. Chỉ cần `$speckit-clarify` nếu người dùng muốn thay đổi các mặc định hoặc scope đã ghi nhận.
