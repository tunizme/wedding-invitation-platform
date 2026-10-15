# Panel Âm nhạc và modal cắt nhạc

Ngày thực hiện: 2026-10-14. Phạm vi theo yêu cầu người dùng: tạm ẩn thanh Thay ảnh nhanh; hiển thị icon nhạc; thêm nút Cắt trên từng mục nhạc và chọn đoạn bằng thanh tiến trình trong modal.

## Hành vi

- Thanh Thay ảnh nhanh được gỡ khỏi bề mặt editor.
- Panel Âm nhạc hiển thị sáu kiểu icon bằng SVG, lựa chọn hiện tại và màu biểu tượng. Bài đang dùng có nhãn Đang dùng; canvas có nút icon để nghe bài với âm lượng, lặp lại và đoạn cắt đã lưu.
- Nút Cắt cạnh mỗi bài mở modal riêng. Khi mở bài đang dùng, modal giữ mốc cắt đã lưu; mở bài khác bắt đầu với toàn bộ bài đó.
- Thanh tiến trình có hai tay kéo bắt đầu/kết thúc, thời gian hai mốc, thời lượng đoạn chọn và vị trí phát khi nghe thử. Không dùng ô nhập số để cắt.
- Có thể kéo bằng chuột/cảm ứng, bấm trên thanh để chỉnh mốc gần nhất, hoặc dùng bàn phím: mũi tên 0,1 giây, Shift + mũi tên 1 giây, Home/End đến giới hạn. Hai mốc không vượt nhau; đoạn ngắn nhất 250ms hoặc toàn bộ bài nếu bài ngắn hơn.
- Nghe đoạn đã chọn phát từ mốc đầu và dừng ở mốc cuối. Chọn toàn bộ đặt lại hai mốc trong modal. Mở modal dừng phần nghe thử trên canvas.
- Áp dụng chọn bài đó làm nhạc và lưu hai mốc qua `settings.audio.trimStartMs`/`trimEndMs` bằng một command, hỗ trợ undo/redo sẵn có. Hủy, Đóng và Escape không áp dụng thay đổi; focus trở về nút Cắt.
- Chọn bài khác hoặc Bỏ nhạc xóa mốc cắt của bài trước. Chọn lại toàn bộ bài bỏ các trường giới hạn không cần thiết. Các cài đặt icon, âm lượng, lặp lại và cho khách chọn nhạc được giữ.
- Đọc thời lượng thực từ metadata MP3; tải lỗi có thông báo và nút Thử lại. Hủy request/thu hồi blob URL khi modal đóng hoặc phiên người dùng hết hiệu lực. Việc dừng phát có chủ ý không biến thành lỗi chặn cắt nhạc.
- Giao diện sử dụng skill `ui-ux-pro-max`: nhãn cho icon và slider, điều khiển bàn phím, vùng kéo 44px, focus/return focus và modal vừa viewport.

## Kiểm tra

- Unit/component: chọn bài khác không giữ đoạn cũ; giới hạn hai mốc; Áp dụng/Hủy; nghe đúng đoạn; lỗi tải/thử lại; hủy trước khi nhận bytes; thu hồi blob URL; ngắt phát có chủ ý.
- Chromium với API/database/storage thật, MP3 thử 12 giây và 6 giây: chọn icon Đĩa nhạc thấy trên canvas; mở modal từ mục nhạc; nghe được MP3; kéo đoạn 3–9 giây; lưu và reload giữ đoạn; Escape hủy và trả focus; nghe trên canvas bắt đầu đúng mốc; đổi bài xóa mốc cũ; modal vừa màn hình 390×844. Chỉ tạo và dọn các tài nguyên TEST-MUSIC riêng.
- Bằng chứng local: `.artifacts/local/music-panel/result.json`, `music-panel-desktop.png`, `music-trim-desktop.png`, `music-trim-mobile.png`. Script `.artifacts/local/music-panel-manual.mjs` dùng tài khoản manual local, không ghi thông tin đăng nhập vào kết quả.
- Không có thay đổi schema/API trong lượt này; dữ liệu cắt nhạc và icon dùng hợp đồng hiện có.
- Kết quả cuối: 593/593 test web đạt; typecheck, ESLint, Prettier và production build đạt. Chạy lại Chromium sau khi hoàn tất sửa: toàn bộ kịch bản đạt, gồm desktop/mobile, lưu/tải lại và phát MP3 thật. Web/API/database local đều healthy.

## Sửa tải/xóa nhạc và vị trí icon

- Bài `Chua-Bao-Gio-DSK.mp3` trả 404 vì object còn ở MinIO cũ (cổng 9000), trong khi cấu hình API đọc kho cổng 19000. Đã khôi phục đúng object sang kho hiện tại, kiểm tra 4.612.096 byte và SHA-256 khớp database; không sửa ID hoặc nội dung bài. API tải lại trả 200.
- Modal phân biệt tệp không còn trong storage với lỗi tải tạm thời; trường hợp 404 hướng dẫn tải lại MP3 gốc/chọn bài khác.
- Migration `CascadeAudioDeletion20261014000200` mở rộng cơ chế gỡ tham chiếu đã có cho AUDIO. Xóa nhạc gỡ khỏi draft/revision/preset/snapshot/job trước khi xóa object; editor lưu và đồng bộ phiên bản qua cùng callback xóa tài nguyên, tránh bị chặn bởi bài đang dùng. Giữ kiểm tra quyền sở hữu.
- Icon nhạc nằm trong canvas, cách góc trên/phải 16px, thay cho vị trí dưới bên trái của stage.
- Kiểm tra bổ sung: 4/4 integration xóa tài nguyên (có nhạc tham chiếu trong draft/revision), 14/14 component test panel/modal, typecheck toàn repo, lint và diff check đạt. Browser chạy lại đầy đủ luồng cắt với MP3 thử đạt sau sửa. Lượt kiểm tra bổ sung bài gốc/vị trí góc phải/xóa đang dùng chưa hoàn tất do bước đăng nhập manual timeout; API tải bài gốc trả 200 và integration xóa nhạc đang dùng đạt.
