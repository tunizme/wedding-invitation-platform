# Thiệp trọn gói do admin thiết kế

Giai đoạn 1: admin thiết kế mẫu và thiệp riêng cho customer; customer quản lý khách mời, lượt mở link, RSVP và lời chúc. Editor linh hoạt cho customer chưa được mở.

## Luồng sử dụng

Trong `/admin/templates`, mẫu có trạng thái **Bản nháp** có nút **Xóa bản nháp**. Hộp thoại hiển thị tên mẫu và yêu cầu xác nhận; mặc định focus ở **Hủy**. Chỉ admin được xóa mẫu chưa từng xuất bản, không có revision và không có tác vụ xuất bản đang chạy. Ảnh/nhạc trong thư viện không bị xóa. Nếu mẫu vừa được sửa ở phiên khác, tải lại danh sách trước khi xóa lại.

API: `DELETE /admin/templates/:id`, JSON `{ "expectedVersion": <editVersion> }`; thành công `204`, không tìm thấy `404`, phiên bản cũ `409 VERSION_CONFLICT`, không còn là bản nháp `409 TEMPLATE_NOT_DRAFT`, đang xuất bản `409 PUBLICATION_IN_PROGRESS`. Lịch sử tác vụ xuất bản thất bại của mẫu nháp được dọn cùng mẫu.

1. Admin mở `/admin/invitations`, nhập email customer, tên thiệp và chọn mẫu đã xuất bản.
2. Tài khoản mới nhận email kích hoạt, tự đặt mật khẩu. Email thuộc customer đang hoạt động được liên kết với tài khoản hiện có; email admin hoặc tài khoản bị khóa bị từ chối. Có thể yêu cầu lại email kích hoạt tại `/activate-account` hoặc `/verify-email`.
3. Admin mở **Thiết kế thiệp**, chỉnh trực tiếp nội dung và toàn bộ bố cục.
4. Mở **Thanh toán và bàn giao**, xác nhận đã nhận đủ tiền bên ngoài hệ thống. Hệ thống lưu người xác nhận, thời điểm và ghi chú; chưa tích hợp cổng thanh toán.
5. Trở lại editor và xuất bản. Link thiệp giữ nguyên khi xuất bản lại; bản nháp không thay đổi bản đang công khai.
6. Customer đăng nhập, vào **Thiệp của tôi → Khách mời**. Cả admin/customer có thể thêm khách, nhập CSV, sao chép link riêng, tạo lại/thu hồi link, xem RSVP và lời chúc. Admin có thêm trang đọc/đóng/mở RSVP riêng.

Không có bước khách duyệt thiết kế. Customer của thiệp dịch vụ không được sửa dữ liệu thiết kế, xuất bản hoặc gỡ xuất bản; API thực thi giới hạn này.

## Editor admin nhập nội dung trực tiếp

**Tùy chỉnh** bên phải (khi chưa chọn phần tử) chứa tiêu đề/ảnh/mô tả chia sẻ, ngôn ngữ nhãn, tự cuộn, bật/tắt **QR mừng cưới**, **Chia sẻ** và **nền gradient**. Menu **Cài đặt** bên trái đã bỏ; hiệu ứng vẫn nằm ở menu Hiệu ứng.

Lời chúc và lượt thích đang tạm ẩn theo phạm vi giai đoạn hiện tại: không có tùy chọn trong editor hoặc nút trên thanh tiện ích public, kể cả với thiết kế cũ đã bật các cờ này. Trang public không tải số lượt thích. Các lối vào quản lý lời chúc được ẩn; phản hồi biểu mẫu vẫn giữ riêng. API và dữ liệu/cấu hình cũ chưa bị xóa để có thể mở lại sau.

Đã bỏ tab **Dữ liệu mẫu**, panel **Liên kết dữ liệu**, trường nội dung liên kết dành cho customer và lựa chọn nhạc qua form.

- Lịch, đếm ngược: chọn ngày giờ ở thuộc tính phần tử.
- Bản đồ: nhập tên, địa chỉ, tọa độ.
- QR mừng cưới: nhập ngân hàng, tài khoản, tên chủ tài khoản, nội dung chuyển khoản theo các giới hạn VietQR hiện có.
- Timeline: thêm/sửa/xóa các mục chương trình.
- Nhắc lịch: nhập ngày giờ trực tiếp. Điều khiển ngày giờ dùng múi giờ Việt Nam.
- Thiết kế cũ được chuyển các liên kết đang hiển thị thành nội dung cố định trong bản nháp khi admin mở editor; lưu/xuất bản vẫn là thao tác tường minh. Snapshot public và các thiệp customer cũ không tự thay đổi.

Backend vẫn đọc dữ liệu/binding của phiên bản cũ để duy trì các thiệp hiện có. Khi tạo thiệp dịch vụ từ mẫu, hệ thống chụp nội dung đang hiển thị của mẫu vào một document riêng.

## Dữ liệu và API

Migration `20261014000300-ManagedInvitations.ts` bổ sung chế độ `SERVICE_MANAGED`, document nháp, tên thiệp, xác nhận thanh toán, khách mời, sự kiện mở link, biên nhận nhập danh sách và liên kết RSVP với khách. Các thiệp cũ giữ `FORM_ONLY`; không tự chuyển chế độ.

Các API mới:

- `POST /admin/customers/invite`: liên kết customer hiện có hoặc tạo tài khoản chờ kích hoạt và đưa email vào outbox.
- `POST /auth/customer-activation/confirm`: nhận proof và mật khẩu; xác minh email, đặt mật khẩu và tiêu thụ token một lần. Token nằm trong fragment URL, được xóa khỏi thanh địa chỉ khi mở trang.
- `GET/POST /admin/invitations`, `GET /admin/invitations/:id`, `PATCH /admin/invitations/:id/draft`.
- `POST /admin/invitations/:id/payment`, `POST .../publish`, `POST .../unpublish`. Lưu và xuất bản dùng version; xuất bản dùng idempotency key và tác vụ render hiện có.
- `GET/POST /admin/invitations/:id/assets`, `POST .../audio`. Upload mang chủ sở hữu customer và ID thiệp hỗ trợ; người upload vẫn là admin.
- `GET .../guests`, `POST .../guests/import`, `POST .../guests/:guestId/rotate|revoke`, dưới cả `/invitations/:id` và `/admin/invitations/:id`. Import yêu cầu `Idempotency-Key`.
- `GET /admin/invitations/:id/rsvps`, `PATCH .../rsvp-state`.
- `GET /public/invitations/:slug/guests/:token` trả duy nhất tên hiển thị; `POST .../open` nhận eventId để chống đếm lặp.
- RSVP hiện có nhận thêm `guestToken` tùy chọn. Server tự tìm khách theo token thuộc đúng thiệp; phản hồi mới nhất quyết định trạng thái khách. Không truyền guestId từ client.

Document, dữ liệu, tài nguyên, quyền và phiên bản đều được kiểm tra lại lúc hoàn tất xuất bản. Admin là người thao tác; customer luôn là chủ thiệp. Tài nguyên trong document riêng được giữ tham chiếu ở cả bản nháp và bản public, kể cả tài nguyên không nằm trong revision mẫu nguồn. Xóa tài nguyên cũng loại bỏ nó khỏi document riêng.

## Khách mời và số liệu

CSV UTF-8, có thể có BOM; tiêu đề `name,group` hoặc `Tên,Nhóm`. Hỗ trợ dấu tiếng Việt, tên có dấu phẩy/ngoặc kép và CRLF. Tối đa 1.000 khách mỗi lần; tên trùng vẫn là khách riêng. Gửi lại cùng key và nội dung không tạo trùng.

Link riêng dùng `?g=<token ngẫu nhiên>`. Tạo link mới hoặc thu hồi làm token cũ ngừng có hiệu lực. Link chung vẫn dùng được; danh sách khách không public.

Lượt mở ghi sau khi trang hiển thị và token được xác nhận, không ghi từ GET metadata. Một trình duyệt/tab giữ eventId trong 30 phút để tải lại không tăng lượt; server chống nhận lặp cùng eventId. Đây là **lượt mở link**, không xác minh danh tính; link có thể được chuyển tiếp, và trình duyệt chặn JavaScript không gửi số liệu.

## Kiểm tra và vận hành

- Migration đã áp dụng trên database local đang dùng; chạy migration trước khi triển khai API ở môi trường khác.
- Web hiện có 610 test qua; API unit có 94 test qua.
- 33 test contract/integration hồi quy qua cho thiệp cũ, RSVP, xung đột phiên bản, tài nguyên và trang public; 6 test tích hợp mới qua cho thiệp dịch vụ, thanh toán, ownership, upload, guest token, RSVP và kích hoạt.
- Đã thử bằng Chromium: tạo thiệp → chỉnh lịch trực tiếp → xác nhận thanh toán → xuất bản → thêm khách → customer quản lý trên điện thoại; link riêng hiển thị tên khách, tải lại cùng tab vẫn giữ một lượt mở.
- Build production API/web đã qua; đã capture thành công trên web production với font Allura và chuỗi tiếng Việt có dấu.
- Bộ render cho phép đúng các font đã đóng gói trong catalog. CSP chỉ cho phép `unsafe-eval` khi Next chạy development; production giữ chính sách chặt.

Chưa triển khai giai đoạn 2, trang quản trị assets riêng, cổng thanh toán, công nợ hoặc luồng duyệt thiết kế.
