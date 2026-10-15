# Manual test local — 15/10/2026

Web: http://localhost:3000. Mailpit: http://localhost:8025. API: http://localhost:3001/api/v1/docs.

Cập nhật giao diện: lời chúc/lượt thích đang tạm ẩn; các mục mô tả chức năng này bên dưới là chức năng có sẵn nhưng chưa mở trong phạm vi hiện tại. QR mừng cưới, Chia sẻ, nền gradient và toàn bộ mô tả/ngôn ngữ/tự cuộn được chỉnh trong **Tùy chỉnh** bên phải editor, khi chưa chọn phần tử. Menu Cài đặt bên trái đã bỏ.

Tài khoản admin/customer review đã được tạo, xác minh email và kiểm tra đăng nhập. Thông tin đăng nhập được gửi trong cuộc trò chuyện; bản local riêng ở `.artifacts/native/review-accounts.json`. Không đổi mật khẩu tài khoản cũ. Dữ liệu có tên “review” là dữ liệu local dành cho kiểm tra, không phải giao dịch thật.

Mẫu review: `b5c06e99-0a59-4892-b3b0-957bc80b28c5`.
Thiệp review: `cc9a1935-3b74-4068-9b12-2775271fe320`.
Thiệp công khai: http://localhost:3000/i/147ed3c0-eb3d-41b6-90a7-b048b6e5c611.

## Các màn hình đã triển khai

| Vai trò      | Màn hình                            | Đường dẫn                             | Thao tác chính                                                                                            |
| ------------ | ----------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Chung        | Trang chủ                           | `/`                                   | Xem giới thiệu, điều hướng vào kho mẫu                                                                    |
| Chung        | Kho mẫu                             | `/templates`                          | Xem/chọn mẫu, mở bản demo                                                                                 |
| Chung        | Demo mẫu                            | `/templates/:id/demo`                 | Xem mẫu trước khi tạo thiệp                                                                               |
| Chung        | Đăng nhập                           | `/login`                              | Đăng nhập theo vai trò                                                                                    |
| Chung        | Đăng ký                             | `/register`                           | Tạo tài khoản, nhận email xác minh                                                                        |
| Chung        | Xác minh email                      | `/verify-email`                       | Xác minh và yêu cầu gửi lại email                                                                         |
| Chung        | Kích hoạt tài khoản được mời        | `/activate-account`                   | Mở link trong Mailpit, tự đặt mật khẩu                                                                    |
| Chung        | Quên/đặt lại mật khẩu               | `/forgot-password`, `/reset-password` | Gửi email và đặt lại mật khẩu                                                                             |
| Chung        | Kết quả đăng nhập xã hội/onboarding | `/oauth-result`, `/social-onboarding` | Dùng trong luồng OAuth khi nhà cung cấp đã được cấu hình; không mở URL trống để đánh giá luồng thành công |
| Đã đăng nhập | Hồ sơ/tài khoản                     | `/account`                            | Xem/cập nhật thông tin và bảo mật tài khoản                                                               |
| Customer     | Tổng quan                           | `/overview`                           | Xem tổng quan tài khoản                                                                                   |
| Admin        | Danh sách khách hàng                | `/admin/customers`                    | Tìm, lọc và mở khách hàng                                                                                 |
| Admin        | Chi tiết khách hàng                 | `/admin/customers/:customerId`        | Xem thông tin và thiệp của khách hàng                                                                     |
| Admin        | Kho mẫu quản trị                    | `/admin/templates`                    | Quản lý các mẫu thiệp                                                                                     |
| Admin        | Tạo mẫu                             | `/admin/templates/new`                | Tạo bản nháp mới                                                                                          |
| Admin        | Editor mẫu                          | `/admin/templates/:id/edit`           | Chỉnh bố cục/nội dung, ảnh/nhạc, tiện ích, xem trước, lưu, xuất bản                                       |
| Admin        | Thiệp khách hàng                    | `/admin/invitations`                  | Tạo thiệp riêng theo email khách từ mẫu đã xuất bản                                                       |
| Admin        | Editor thiệp riêng                  | `/admin/invitations/:id/edit`         | Chỉnh thiết kế độc lập với mẫu; lưu nháp và xuất bản                                                      |
| Admin        | Thanh toán/bàn giao                 | `/admin/invitations/:id/manage`       | Xác nhận tiền nhận bên ngoài, mở/sao chép link bàn giao                                                   |
| Admin        | Khách mời                           | `/admin/invitations/:id/guests`       | Thêm khách, nhập CSV nhỏ, sao chép/tạo lại/thu hồi link, xem lượt mở và RSVP                              |
| Admin        | RSVP                                | `/admin/invitations/:id/rsvps`        | Xem phản hồi, đóng/mở nhận RSVP                                                                           |
| Admin        | Lời chúc                            | `/admin/invitations/:id/wishes`       | Xem, duyệt và ẩn lời chúc khi thiệp có bật nhận lời chúc                                                  |
| Customer     | Thiệp của tôi                       | `/invitations`                        | Mở thiệp, thông tin bàn giao và các màn quản lý                                                           |
| Customer     | Nội dung/thông tin bàn giao         | `/invitations/:id/edit`               | Thiệp dịch vụ chỉ xem bàn giao; thiệp cũ `FORM_ONLY` giữ form nhập thông tin                              |
| Customer     | Khách mời                           | `/invitations/:id/guests`             | Quản lý danh sách nhỏ và link khách                                                                       |
| Customer     | RSVP                                | `/invitations/:id/rsvps`              | Xem phản hồi, đóng/mở nhận RSVP                                                                           |
| Customer     | Lời chúc và biểu mẫu                | `/invitations/:id/interactions`       | Xem lời chúc/phản hồi; duyệt/ẩn lời chúc                                                                  |
| Khách mời    | Thiệp công khai                     | `/i/:slug`                            | Xem thiệp, gửi RSVP và tương tác đã bật trong thiết kế                                                    |
| Khách mời    | Link riêng                          | `/i/:slug?g=:token`                   | Hiển thị tên khách, ghi nhận lượt mở, gắn RSVP với khách                                                  |

## Link có dữ liệu để thử ngay

- [Editor mẫu review](http://localhost:3000/admin/templates/b5c06e99-0a59-4892-b3b0-957bc80b28c5/edit).
- [Editor thiệp review](http://localhost:3000/admin/invitations/cc9a1935-3b74-4068-9b12-2775271fe320/edit).
- [Thanh toán/bàn giao](http://localhost:3000/admin/invitations/cc9a1935-3b74-4068-9b12-2775271fe320/manage).
- [Khách mời — admin](http://localhost:3000/admin/invitations/cc9a1935-3b74-4068-9b12-2775271fe320/guests).
- [RSVP — admin](http://localhost:3000/admin/invitations/cc9a1935-3b74-4068-9b12-2775271fe320/rsvps).
- [Thiệp của tôi — customer](http://localhost:3000/invitations).
- [Khách mời — customer](http://localhost:3000/invitations/cc9a1935-3b74-4068-9b12-2775271fe320/guests).
- [Thiệp công khai](http://localhost:3000/i/147ed3c0-eb3d-41b6-90a7-b048b6e5c611).

## Thứ tự kiểm tra đề xuất

1. Đăng nhập admin → mở mẫu review → chọn Lịch, Đếm ngược, Nhắc lịch. Ngày giờ mẫu là **10/01/2027 10:30, giờ Việt Nam**. Lưu và tải lại phải giữ nguyên, kể cả khi dùng timezone override trong DevTools.
2. Mở editor thiệp riêng → sửa một nội dung → lưu. Bản public chỉ thay đổi khi xuất bản lại; mẫu gốc không đổi.
3. Với một thiệp mới, thử xuất bản khi chưa thanh toán → xác nhận thanh toán → xuất bản. Thiệp review đã có thanh toán giả lập để thử bàn giao ngay.
4. Thêm một vài khách → sao chép link → mở trong cửa sổ ẩn danh → kiểm tra tên khách, gửi RSVP. Trở về màn khách mời/RSVP để kiểm tra số liệu.
5. Tạo lại/thu hồi link của một khách → kiểm tra link cũ không còn hiệu lực. Tạo link mới trước khi kết thúc nếu muốn tiếp tục dùng khách đó.
6. Đóng nhận RSVP → tải lại thiệp công khai → mở lại RSVP. Kiểm tra thông báo và trạng thái nút.
7. Dùng cửa sổ riêng đăng nhập customer → xác minh chỉ quản lý khách/RSVP/tương tác, không sửa thiết kế hoặc xuất bản thiệp dịch vụ.
8. Dùng DevTools ở 320/390/768 px và desktop. Kiểm tra drawer thuộc tính, nút đóng/ESC, nhãn form, vùng cuộn của canvas và danh sách khách. Canvas editor có zoom/pan riêng; dùng **Vừa màn hình** để xem toàn thiết kế.

Không cần kiểm tra 1.000 khách theo yêu cầu mới nhất. Mẫu review tập trung lịch/đếm ngược/nhắc lịch/RSVP/tên khách; toolbar lời chúc mặc định chưa bật, nên màn lời chúc của mẫu này đang ở trạng thái rỗng.

## Bằng chứng review

Đã áp dụng skill `ui-ux-pro-max`: kiểm tra nhãn, kích thước điều khiển, khoảng cách chạm, responsive, thông báo và điều hướng. Chromium local giả lập mobile ở 320/390 px; kiểm tra thêm 768/1440 px cho editor và danh sách khách. Đây không phải kiểm thử trên thiết bị iOS/Android vật lý.

Đã thử trạng thái chưa/đã thanh toán, guest rỗng/có dữ liệu, link tạo lại/thu hồi/khôi phục, RSVP rỗng/có phản hồi và đóng/mở, thiệp public có tên khách, tải nội dung ICS, customer chỉ xem bàn giao. Ngày giờ lịch/đếm ngược/nhắc lịch lưu `2027-01-10T10:30:00+07:00`, múi giờ `Asia/Ho_Chi_Minh`; ICS có `DTSTART:20270110T033000Z`.

Sửa sau review: timestamp thanh toán/lượt mở/RSVP/tương tác và ngày cập nhật dùng giờ Việt Nam; bỏ mốc preview cố định 12/10/2026; tăng khoảng cách và cho phép xuống dòng các nút loại phản hồi trên mobile.

Ảnh chụp và script review tạm ở `.artifacts/native/review-*`; thư mục này không được Git track. Source và hướng dẫn vẫn nằm trong repository.
