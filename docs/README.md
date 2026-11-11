# Tài liệu Dự án — Wedding Invitation Platform

Bản đồ tra cứu toàn bộ tài liệu kỹ thuật, thiết kế và hướng dẫn phát triển của dự án.

---

## 1. Tiêu chuẩn & Vận hành Kỹ thuật (Standards & Operations)

| Tài liệu | Mô tả |
| --- | --- |
| [MASTER.md](design/MASTER.md) | **UI/UX Source of Truth**: Bộ quy tắc thiết kế (design tokens, bảng màu, typography, khoảng cách, buttons, forms, a11y). |
| [ci.md](ci.md) | Quy định tích hợp liên tục (CI), các luồng kiểm thử tự động và chính sách chất lượng mã nguồn. |
| [iam-operations.md](iam-operations.md) | Sổ tay vận hành hệ thống Identity & Access Management (rotation khóa, xử lý lỗi mail, tài khoản Admin). |
| [transfer-to-another-machine.md](development/transfer-to-another-machine.md) | Hướng dẫn đồng bộ và chuyển môi trường làm việc sang máy phát triển khác. |
| [windows-without-docker.md](development/windows-without-docker.md) | Hướng dẫn chạy và phát triển trên Windows không có Docker. |

---

## 2. Hướng dẫn Tính năng Sản phẩm (Product & Feature Guides)

| Tài liệu | Mô tả |
| --- | --- |
| [managed-invitations.md](editor/managed-invitations.md) | **Mô hình Thiệp dịch vụ (Service-Managed)**: Admin thiết kế thiệp riêng cho từng khách hàng; khách hàng quản lý danh sách khách mời, lượt mở link, RSVP và lời chúc. |
| [font-library.md](editor/font-library.md) | Danh mục font hỗ trợ đầy đủ tiếng Việt, quy tắc fallback và tối ưu font rendering trên canvas 500px. |
| [music-panel.md](editor/music-panel.md) | Hướng dẫn chức năng nhạc nền, tải file MP3, cấu hình autoplay và công cụ cắt đoạn nhạc (audio trim). |

---

## 3. Đặc tả Tính năng (Specs Directory)

Thư mục `specs/` lưu trữ đặc tả chi tiết (Spec-Driven Development) theo từng giai đoạn:

- **Đặc tả hiện hành (Active Spec):**
  - [`specs/008-cinelove-editor/`](../specs/008-cinelove-editor/): Mở rộng Editor với Canvas 500px, lược bỏ panel dữ liệu mẫu cũ, cho phép admin nhập liệu trực tiếp trên canvas.
- **Đặc tả các giai đoạn nền tảng (Foundation Specs):**
  - `001-project-foundation`: Nền tảng kiến trúc monorepo, Next.js, NestJS, PostgreSQL.
  - `002-rapid-development-governance`: Quy chuẩn quản trị và chất lượng code.
  - `003-identity-access-management`: Hệ thống xác thực và phân quyền (IAM).
  - `004-invitation-builder`: Công cụ dựng thiệp thế hệ đầu.
  - `005-frontend-foundation-reliability`: Đồng bộ hóa UI prototype vào ứng dụng Next.js.
  - `006-iam-auth-transition-reliability`: Độ tin cậy chuyển trạng thái auth trên trình duyệt.
  - `007-responsive-invitation-layout`: Tiền đề bố cục responsive cho thiệp cưới.
