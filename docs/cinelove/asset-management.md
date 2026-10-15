# Đối chiếu Cinelove: thư viện tài nguyên và suy luận trang admin

## 1. Phạm vi

- Yêu cầu: lên kế hoạch quản trị Stock, nền có sẵn, nhạc, tiện ích, hiệu ứng; đọc `cinelove-clone.md`, khảo sát giao diện người dùng Cinelove để suy luận trang quản lý admin.
- Ngày khảo sát: 2026-10-14. URL: https://cinelove.me/editor/new-blank; đăng nhập bằng tài khoản người dùng cung cấp, giao diện báo gói FREE.
- Dữ liệu: thiết kế trống chưa xuất bản; không sửa/xóa nội dung có sẵn của tài khoản. Không lưu phiên đăng nhập hoặc thông tin xác thực vào hồ sơ.
- Chromium headless, viewport 1440×1000, browser zoom mặc định, canvas hiển thị 100%.
- Phạm vi hiện tại là khảo sát và kế hoạch, chưa triển khai admin hoặc nghiệm thu giao diện local. Đường đi local dự kiến `/admin/design-library/stock`.
- Suy luận admin được người dùng yêu cầu rõ; không khẳng định đó là admin/backend thật của Cinelove.

## 2. Kiểm kê hai bên

| ID | Chức năng | Source | Bằng chứng source | Cinelove | Quyết định |
| --- | --- | --- | --- | --- | --- |
| F01 | Stock theo danh mục | Có | `editor/library-taxonomy.ts`: 19 nhóm; `invitation-editor.tsx`: panel Stock | Tất cả, nhóm nhanh, Xem thêm, khối từng danh mục | Đề xuất admin quản lý danh mục/thứ tự |
| F02 | Nhạc chung và nhạc cá nhân | Có | Panel nhạc trong `invitation-editor.tsx`; asset AUDIO | Thư viện nhạc/Nhạc của tôi; upload cá nhân bị chặn theo gói FREE | Giữ tách scope; không thêm paywall |
| F03 | Lọc/tìm nhạc | Có | Taxonomy Nhạc ngoại/V-POP và panel nhạc | Đã lọc V-POP và tìm chuỗi không khớp | Admin quản lý tên/danh mục/thời lượng |
| F04 | Hình nền có sẵn | Có | Asset BACKGROUND, BACKGROUND_CATEGORIES | Chưa thấy kho nền có sẵn; thấy chọn hình nền cá nhân | Giữ theo nhu cầu người dùng, không coi đã đối chiếu |
| F05 | Danh mục tiện ích | Có một phần tương ứng | `componentNames` và renderer hiện có | 14 mục tiện ích hiển thị | Quản trị registry; báo loại chưa tương ứng |
| F06 | Nhóm hiệu ứng | Có một phần tương ứng | `editor-properties.tsx`: pageAnimation, envelope, particles | Ba nhóm động/mở màn/rơi; đã mở nhóm động | Catalog chỉ dùng renderer đã hỗ trợ |
| F07 | Admin thư viện riêng | Chưa có | Admin hiện có template/customer/wishes; chưa có module design-library | Không khảo sát admin nội bộ | Thiết kế mới dựa trên suy luận được giao |

Các đường dẫn editor nói trên nằm trong `apps/web/src/features/invitation-builder/editor/`. Asset entity tại `apps/api/src/modules/invitation-assets/domain/entities.ts`.

## 3. Hành vi đã quan sát

| ID | Chức năng | Thao tác | Kết quả | Bằng chứng | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| R01 | F01 | Mở Stock | Tất cả hiển thị khối theo 19 nhóm, mỗi khối có Xem thêm | `stock.png`, `survey.json` | Đã xác minh |
| R02 | F01 | Nhấn Xem thêm ▼ ở thanh nhóm | Mở danh sách nhóm còn lại, có Văn hóa Việt | `stock-expanded.png`, `deep-survey.json` | Đã xác minh |
| R03 | F01 | Chọn Hoa cưới | Rời bố cục các khối; ảnh tài nguyên không có nhãn văn bản | `stock-category.png` | Đã xác minh chuyển trạng thái; chưa xác minh toàn bộ ảnh đã tải |
| R04 | F04 | Nền → Hình nền | Chọn hình nền từ ảnh bạn đã tải lên; nút Chọn hình nền cá nhân | `background-images.png` | Đã xác minh |
| R05 | F02/F03 | Mở Âm nhạc → V-POP | Danh sách thay đổi; tên, thời lượng, nút ▶ từng hàng | `music-vpop.png` | Đã xác minh lọc; chưa xác minh phát âm thanh |
| R06 | F03 | Nhập chuỗi không khớp vào tìm kiếm | Không tìm thấy bài hát nào, có nút xóa truy vấn | `music-search-empty.png` | Đã xác minh |
| R07 | F02 | Mở Nhạc của tôi | Thông báo Premium, quảng bá MP3/WAV/M4A, gói hiện tại FREE | `music-personal.png` | Đã xác minh thông báo; chưa kiểm tra upload |
| R08 | F05 | Mở Tiện ích | Danh sách lịch, đếm ngược, bản đồ, nút gọi, lời nhắc, RSVP, form tùy chỉnh, tên khách, QR Box, phong bì, album, carousel, YouTube, hạt | `widgets.png` | Đã xác minh danh sách; chưa kiểm tra từng công cụ |
| R09 | F06 | Mở Hiệu ứng → Hiệu ứng động | None, Fade In All, Slide Up All, Scale In All, Flip In All, Slide Up Mix, Fade In Mix; nút Xem trước hiệu ứng | `effect-motion.png` | Đã xác minh danh sách; chưa kiểm tra chuyển động |

## 4. Thông số giao diện và dữ liệu

- Stock: sidebar bên trái dạng grid ba cột; bộ lọc dạng chip; danh sách nhóm mở thêm. Thanh chip ưu tiên không hoàn toàn cùng thứ tự các khối: Văn hóa Việt là khối thứ hai nhưng nằm trong danh sách mở thêm.
- Nhạc: hai tab theo nguồn, ô tìm kiếm, chip danh mục và danh sách tên/thời lượng định dạng phút:giây; không thấy trường nghệ sĩ độc lập trong danh sách.
- Tiện ích là chức năng, hiệu ứng là cấu hình chuyển động; tên hiển thị không đủ để kết luận schema hoặc thuật toán thực tế.
- Chưa đo pixel chi tiết vì chưa triển khai clone giao diện editor trong phạm vi này. Chưa xác minh backend, storage, schema database và cơ chế xóa của Cinelove.

## 5. Tiêu chí nghiệm thu phần sẽ phát triển

| ID | Điều kiện/thao tác | Kết quả mong đợi | Trạng thái |
| --- | --- | --- | --- |
| AC01 | Admin sửa thứ tự khối và nhóm lọc nhanh Stock | Editor hiển thị theo hai thứ tự cấu hình độc lập | Chưa kiểm tra |
| AC02 | Admin phát hành bài nhạc, user lọc/tìm | Hiện đúng tên, duration, danh mục và nghe được file thật | Chưa kiểm tra |
| AC03 | Admin ẩn tài nguyên đang được dùng | Không còn trong chọn mới; thiết kế cũ tiếp tục hiển thị/phát | Chưa kiểm tra |
| AC04 | Admin cấu hình tiện ích/hiệu ứng | Chỉ lưu registryKey/defaults được schema và renderer hỗ trợ | Chưa kiểm tra |
| AC05 | Admin preview trước phát hành | Thấy bố cục thư viện và renderer thật; draft không lộ ra catalog ACTIVE | Chưa kiểm tra |

Đây là tiêu chí cho sản phẩm đề xuất, không khẳng định Cinelove có các thao tác admin này.

## 6. Kế hoạch phát triển

Chi tiết tại [admin-design-library-plan.md](../editor/admin-design-library-plan.md). Dùng một khu vực Thư viện thiết kế với các trang Stock, nền, nhạc, tiện ích, hiệu ứng, danh mục. Tách dữ liệu file khỏi metadata phát hành catalog. Bổ sung thứ tự danh mục, hiển thị lọc nhanh và thứ tự item. Tiện ích/hiệu ứng lấy định danh ổn định từ registry; không upload mã thực thi. Dữ liệu cũ giữ ID, mặc định mới không ghi đè thiết kế cũ.

Thiết kế UI áp dụng skill `ui-ux-pro-max`; tài liệu quy trình đã đọc trước khảo sát. Chưa sửa component, schema, API hoặc renderer trong lượt khảo sát.

## 7. Chức năng thiếu hoặc chưa tương ứng — chỉ báo cáo

| ID | Quan sát Cinelove | Source liên quan | Đề xuất và giới hạn |
| --- | --- | --- | --- |
| M01 | Nhạc cá nhân khóa theo Premium, thông báo MP3/WAV/M4A | Source có upload AUDIO/MP3 | Giữ upload hiện có; định dạng mới và paywall ngoài phạm vi |
| M02 | Tiện ích Hiệu ứng phong bì thư, Hiệu ứng hạt | Source có envelope/particles ở settings, không nằm trong componentNames | Chưa xác minh tương đương cấp phần tử; không thêm loại widget từ tên gọi |
| M03 | QR Box | Source có QRBank | Chưa xác minh QR tổng quát và QR ngân hàng tương đương; chỉ đưa QRBank vào registry hiện có |
| M04 | Các preset hiệu ứng động cụ thể | Source có PAGE_ANIMATIONS | Cần đối chiếu key, trigger và renderer từng preset trước khi mở rộng; không seed tên chưa được hỗ trợ |

Source có Timeline trong danh sách công cụ nhưng không thấy ở danh sách tiện ích Cinelove đã khảo sát; giữ nguyên.

## 8. Kết quả kiểm tra

- Chạy Playwright đăng nhập và mở thiết kế trống; hai lượt khảo sát thành công. Lượt sâu có hai thao tác mở nhóm hiệu ứng mở màn/rơi timeout do selector/trạng thái điều hướng; chưa xác minh nội dung hai nhóm, không coi là lỗi sản phẩm Cinelove.
- Bằng chứng local: `.artifacts/local/cinelove/asset-management/reference/`; `survey.json`, `deep-survey.json` và ảnh theo mã R ở trên. Chỉ có ở máy hiện tại.
- Một số thumbnail Stock còn trống tại thời điểm chụp; chưa kết luận nguyên nhân hoặc chất lượng tải của dịch vụ.
- Không xuất bản, không upload/xóa file trên tài khoản tham chiếu; không kiểm tra lưu/tải lại, undo/redo hoặc trang người xem. Không kiểm tra bằng mock.
- Chưa có ảnh local/diff vì chưa triển khai giao diện admin. Không cần chạy test sản phẩm cho thay đổi tài liệu.

## 9. Bàn giao

Đã khảo sát UI người dùng và cập nhật kế hoạch admin theo suy luận có căn cứ. Chưa triển khai admin, chưa xác minh trang admin nội bộ, quyền quản trị, cơ chế xóa và backend của Cinelove. Danh sách thiếu ở mục 7 chỉ là báo cáo, không có code mở rộng ngầm.
