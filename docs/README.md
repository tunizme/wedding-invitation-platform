# Tài liệu Dự án — Wedding Invitation Platform

Bản đồ tra cứu toàn bộ tài liệu kỹ thuật, thiết kế và hồ sơ chức năng của dự án.

---

## 1. Tiêu chuẩn & Vận hành Kỹ thuật (Standards & Operations)

| Tài liệu | Mô tả |
| --- | --- |
| [MASTER.md](design/MASTER.md) | **UI/UX Source of Truth**: Bộ quy tắc thiết kế (design tokens, bảng màu, typography, khoảng cách, buttons, forms, a11y). |
| [ci.md](ci.md) | Quy định tích hợp liên tục (CI), các luồng kiểm thử tự động và chính sách merge. |
| [iam-operations.md](iam-operations.md) | Sổ tay vận hành hệ thống Identity & Access Management (rotation khóa, xử lý lỗi mail, tài khoản Admin). |
| [transfer-to-another-machine.md](development/transfer-to-another-machine.md) | Hướng dẫn đồng bộ và chuyển môi trường làm việc sang máy phát triển khác. |
| [windows-without-docker.md](development/windows-without-docker.md) | Hướng dẫn chạy và phát triển trên Windows không có Docker. |

---

## 2. Hướng dẫn Tính năng Sản phẩm (Product Guides)

| Tài liệu | Mô tả |
| --- | --- |
| [managed-invitations.md](editor/managed-invitations.md) | **Mô hình Thiệp dịch vụ (Service-Managed)**: Admin thiết kế thiệp riêng cho từng khách hàng; khách hàng quản lý danh sách khách mời, lượt mở link, RSVP và lời chúc. |
| [font-library.md](editor/font-library.md) | Danh mục font hỗ trợ đầy đủ tiếng Việt, quy tắc fallback và tối ưu font rendering trên canvas 500px. |
| [music-panel.md](editor/music-panel.md) | Hướng dẫn chức năng nhạc nền, tải file MP3, cấu hình autoplay và công cụ cắt đoạn nhạc (audio trim). |

---

## 3. Quy trình Đối chiếu & Hồ sơ Cinelove (Cinelove Parity)

Quy định bắt buộc khi làm theo Cinelove: đọc [cinelove-clone.md](../cinelove-clone.md) và tuân thủ [AGENTS.md](../AGENTS.md). Mọi chức năng đối chiếu đều có hồ sơ lưu tại `docs/cinelove/`.

| Hồ sơ chức năng | Phạm vi đối chiếu |
| --- | --- |
| [feature-template.md](cinelove/feature-template.md) | Biểu mẫu chuẩn để lập hồ sơ kiểm kê và đối chiếu cho một chức năng mới. |
| [preview-opening.md](cinelove/preview-opening.md) | Preview thiệp có mở đầu: căn giữa desktop, responsive mobile, khóa cuộn trước khi mở, mở cuộn sau khi mở. |
| [hinh-anh.md](cinelove/hinh-anh.md) | Xử lý hình ảnh: crop ảnh không phá hủy, mask/khung hình, lật ảnh, thư viện ảnh và gallery. |
| [hieu-ung.md](cinelove/hieu-ung.md) | Hiệu ứng mở màn (phong bì, chuyển cảnh), hiệu ứng rơi hạt/hoa/tim và animation preset. |
| [widgets.md](cinelove/widgets.md) | Các widget tương tác: QR mừng cưới (VietQR), bản đồ, đếm ngược, timeline chương trình, lịch hẹn. |
| [asset-management.md](cinelove/asset-management.md) | Quản lý tài nguyên media: upload theo batch, phân loại taxonomy, quản lý dung lượng và bảo mật file. |

---

## 4. Đặc tả Tính năng (Specs Directory)

Thư mục `specs/` lưu trữ đặc tả chi tiết (Spec-Driven Development) theo từng giai đoạn:

- **Đặc tả hiện hành (Active Spec):**
  - [`specs/008-cinelove-editor/`](../specs/008-cinelove-editor/): Mở rộng Editor với Canvas 500px theo mô hình Cinelove, lược bỏ panel dữ liệu mẫu, nhập liệu trực tiếp trên canvas.
- **Đặc tả các giai đoạn nền tảng (Historical Specs):**
  - `001-project-foundation`: Nền tảng kiến trúc monorepo, Next.js, NestJS, PostgreSQL.
  - `002-rapid-development-governance`: Quy chuẩn quản trị và chất lượng code.
  - `003-identity-access-management`: Hệ thống xác thực và phân quyền (IAM).
  - `004-invitation-builder`: Công cụ dựng thiệp thế hệ đầu.
  - `005-frontend-foundation-reliability`: Đồng bộ hóa UI prototype vào ứng dụng Next.js.
  - `006-iam-auth-transition-reliability`: Độ tin cậy chuyển trạng thái auth trên trình duyệt.
  - `007-responsive-invitation-layout`: Tiền đề bố cục responsive cho thiệp cưới.

---

## 5. Tài liệu Lưu trữ Lịch sử (Archive)

Thư mục `docs/archive/` chứa các tài liệu đã hoàn thành nhiệm vụ lịch sử hoặc đã được thay thế bởi kiến trúc mới:

- **`archive/legacy-prototype-integration/`**: Tài liệu kiểm thử, biên bản audit (`AUDIT.md`, `PROTOTYPE-PARITY.md`, `PRODUCTION-INTEGRATION.md`, `UI-DESIGN.md`) và ảnh chụp màn hình prototype cũ (`prototype-screenshots/`).
- **`archive/session-logs/`**: Biên bản merge phiên cũ (`session-merge-2026-10-15.md`, `manual-test-2026-10-15.md`) và kết quả phỏng vấn thử nghiệm (`onboarding-validation*.md`).
- **`archive/desktop-900-plan.md`**: Kế hoạch nghiên cứu layout desktop 900px cũ (đã được thay thế hoàn toàn bởi Canvas 500px tại Spec 008).
- **`archive/admin-design-library-plan.md`**: Bản phác thảo kế hoạch thư viện thiết kế cũ trước khi triển khai.
