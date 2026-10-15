# Đối chiếu Cinelove: Tiện ích và các mẫu design

## 1. Phạm vi

Khảo sát trực tiếp panel **Tiện ích**, ưu tiên mẫu design theo yêu cầu bổ sung của người dùng: các kiểu dựng sẵn, hình thức trên canvas, phối màu, font và phần có thể tùy chỉnh. Tạm hoãn kế hoạch admin. Chỉ khảo sát và ghi hồ sơ, chưa sửa code sản phẩm.

Ngày: 2026-10-14. URL: https://cinelove.me/editor/new-blank. Chromium, viewport 1440×1000, browser zoom mặc định và canvas 100%. Mỗi tiện ích dùng thiết kế trống riêng chưa xuất bản. Tài khoản báo FREE; không mua gói hoặc vượt giới hạn. Đã đọc `cinelove-clone.md`.

Bằng chứng local tại `.artifacts/local/cinelove/widgets/reference/`: ảnh toàn màn hình, `survey.json`, `deep-survey.json`, `design-survey.json`, `calendar-survey.json`, `*-fields.json`, `*-geometry.json`. Bảng ảnh xem nhanh: `.artifacts/local/cinelove/widgets/reference/design-gallery.html`. Không lưu credentials/cookie/storage state. Bằng chứng chỉ tồn tại trên máy hiện tại.

## 2. Kiểm kê hai bên

| ID | Tiện ích Cinelove | Mẫu/design đã thấy | Source hiện tại | Quyết định |
| --- | --- | --- | --- | --- |
| F01 | Lịch | No Style, Kiểu 1, Kiểu 2 | Có Calendar, ba variant classic/minimal/filled, nhưng hình thức khác | Đối chiếu từng mẫu, không đồng nhất theo số lượng variant |
| F02 | Đếm ngược | Một cấu trúc bốn ô ngày/giờ/phút/giây, hướng ngang/dọc và đổi màu | Có Countdown, layout/gap/frameColor | Có chức năng; cần đối chiếu hình thức/defaults |
| F03 | Bản đồ | Khung nhúng bản đồ, địa chỉ hoặc tọa độ | Có Map; lấy venue từ binding, renderer OpenStreetMap | Chưa đủ bằng chứng hình thức bản đồ đã tải |
| F04 | Nút gọi | Nút nền đỏ, icon điện thoại trắng + nhãn trắng | Có Contact, icon bật/tắt, màu nút/chữ | Icon size/màu độc lập còn thiếu |
| F05 | Thêm lời nhắc | Nút lời nhắc; nhóm Giao diện nút | Có Reminder/ICS, dữ liệu từ sự kiện | Có một phần; ngày kết thúc/ảnh sự kiện riêng chưa tương ứng |
| F06 | Form xác nhận tham dự | Form một cột, tiêu đề, tên, radio Có/Không, nút đỏ | Có RSVP nhưng editor/preview không render đầy đủ form như Cinelove | Chênh lệch design/preview rõ ràng |
| F07 | Form tùy chỉnh | Modal giới thiệu Premium; chưa vào form designer | Có CustomForm và composer | Giữ source; chưa đủ chứng cứ đối chiếu mẫu |
| F08 | Tên khách mời tự động | Modal giới thiệu Premium có các ảnh minh họa | Có GuestName từ query guest | Luồng danh sách/link/trạng thái gửi chưa tương ứng |
| F09 | QR Box | Icon hộp quà trên canvas, đổi icon, tiêu đề khi mở | Có QRBank render trực tiếp mã QR | Có nghiệp vụ QR nhưng thiếu mẫu hộp quà mở dialog |
| F10 | Hiệu ứng phong bì thư | Phong bì đồ họa, 8 theme màu, Design/Modal | Chỉ có envelope ở settings toàn trang | Thiếu widget và mẫu phong bì tương ứng |
| F11 | Album ảnh | Modal giới thiệu Basic; chưa vào gallery designer | Có Album grid ảnh | Chưa thể đối chiếu mẫu gallery thật |
| F12 | Carousel ảnh | Khung ảnh, bốn chuyển động Zoom/Switch/Overlap/Fade | Có Carousel và bốn transition cùng tên | Khung rỗng và controls đã xem; chưa xác minh gallery có ảnh |
| F13 | Video YouTube | Modal giới thiệu Premium; chưa vào video designer | Có YouTube và poster | Chưa đủ chứng cứ đối chiếu mẫu |
| F14 | Hiệu ứng hạt | Widget vùng chữ nhật; Tuyết rơi/Hạt sao | Source có particles toàn trang: cánh hoa/trái tim | Thiếu widget và hai loại tương ứng |

Bằng chứng source: `apps/web/src/features/invitation-builder/editor/invitation-editor.tsx` (componentNames, thêm widget), `properties-panel.tsx` (Calendar/Countdown/RSVP/Map/QRBank), `editor-properties.tsx` (advanced widgets), `document/editor-document.ts`, `renderer/widgets/`, `renderer/content-widgets.tsx`, `renderer/invitation-presentation.tsx`. Source có Timeline riêng, không thấy trong panel tham chiếu; giữ nguyên.

## 3. Hành vi đã quan sát

| ID | Thao tác | Kết quả thực tế | Bằng chứng |
| --- | --- | --- | --- |
| R01 | Mở panel và nhấn từng mục trong 14 mục | Sáu mục cơ bản thêm phần tử, một số mục nâng cao mở modal giới thiệu, QR/phong bì/carousel/hạt mở được panel | `00-panel.png`, `01-added.png` đến `14-added.png` |
| R02 | Lịch → Hiển thị 2 ngày | Xuất hiện thêm ô Chọn ngày 2 | `calendar-two-days.png` |
| R03 | Lịch → Style | Menu No Style / Kiểu 1 / Kiểu 2; chuyển No Style bỏ header tháng và watermark năm trong text canvas | `calendar-styles.png`, `design-calendar-none.png` |
| R04 | Đếm ngược → Dọc; nhấn ngày | Bốn ô xếp dọc; date picker lịch tháng mở cạnh field | `countdown-vertical.png`, `countdown-date.png` |
| R05 | Sửa nhãn nút gọi và nhấn Xem trước | Canvas và preview hiển thị Gọi nhà trai | `contact-edited.png`, `contact-preview.png` |
| R06 | Lời nhắc → Có giờ cụ thể, nhập ngày giờ hợp lệ | Inputs đổi sang datetime-local, thông báo ngày giờ không hợp lệ biến mất sau nhập | `reminder-timed.png`, `reminder-valid.png` |
| R07 | Sửa tiêu đề và nội dung nút RSVP | Canvas đổi ngay theo field | `rsvp-edited.png` |
| R08 | QR → Thêm tài khoản | Modal yêu cầu Basic/Premium; chưa nhập được tài khoản | `qr-add-account.png` |
| R09 | Phong bì → Modal → Xem trước hiệu ứng | Hiện text hướng dẫn, controls font/màu/backdrop; chuyển sang chế độ preview | `envelope-modal-mode.png`, `envelope-preview.png` |

Không gửi form, gọi điện, mua gói, thêm tài khoản ngân hàng hoặc xuất bản lên tài khoản tham chiếu.

## 4. Mẫu design — trọng tâm khảo sát

### Lịch

Kiểu 1 mặc định có thanh tháng dạng `10.2026` nền hồng, chữ trắng căn trái; hàng thứ T2–CN; ngày sự kiện nổi bằng hình trái tim; năm 2026 cỡ lớn màu hồng rất nhạt phía sau lưới ngày. Khác hẳn cách source tô nền/vòng ngày đơn giản.

Số đo DOM trên canvas 100%: header rộng 300px, cao 42px; header Arial 29px, nền `rgb(243,150,161)` = `#F396A1`, chữ trắng; chữ thứ/ngày Arial 14px; watermark năm font-size 100px. Không lấy kích thước handle selection làm kích thước nội dung. Bằng chứng `design-calendar-default-geometry.json` và ảnh tương ứng.

Đã chọn và chụp đủ ba mẫu:

- **No Style:** chỉ lưới số ngày xám và dấu tim ở ngày sự kiện; không có header tháng/năm, hàng thứ hoặc watermark. Số ngày Arial 14px, màu `#999999`; ngày được đánh dấu chữ trắng. Ảnh `design-calendar-none-clean.png`.
- **Kiểu 1:** header tháng/năm nền hồng, hàng thứ và watermark năm như mô tả ở trên. Ảnh `design-calendar-default.png`.
- **Kiểu 2:** khung viền hồng kiểu trang sổ có hai chi tiết gáy bên trái; số tháng ở góc trái và năm góc phải, Arial 24px màu `#F396A1`; thanh hồng bo tròn dưới hàng thứ; lưới ngày và dấu tim, không có watermark năm. Ảnh `design-calendar-two.png`; DOM trong file geometry tương ứng.

Các mẫu có hình thức khác nhau thực sự, không chỉ đổi màu hoặc border của cùng một renderer đơn giản. Tùy chỉnh: ngày, hai ngày, màu chữ/nền/giao diện (tùy kiểu), font, cỡ chữ, opacity, padding, border, shadow, motion.

### Đếm ngược

Bốn ô nền đen, chữ trắng; mỗi ô ghi số và đơn vị bằng chữ thường. Có khoảng cách giữa ô, mặc định field gap 20px. Font Arial 14px, opacity 1.00. Ngang/Dọc là hai bố cục của cùng cấu trúc, chưa thấy menu nhiều template design độc lập. Canvas mới thêm hiển thị bốn số 0 tại thời điểm khảo sát; chưa kết luận logic hết hạn. Không nhầm bốn hiệu ứng carousel với mẫu countdown.

### Nút gọi và lời nhắc

Nút gọi mặc định đỏ san hô, icon điện thoại nét trắng nằm trước chữ Gọi ngay; font Arial 16px, icon-size field 16. Có màu icon độc lập, màu chữ/nền, font, opacity, border, shadow, motion. Đây là một mẫu tùy biến, chưa thấy thư viện nhiều nút dựng sẵn.

Đã mở nhóm Giao diện nút: màu chữ, màu nền, font-size mặc định 14, Arial và opacity; chưa thấy selector template độc lập (`design-reminder-button.png`). Có ảnh sự kiện tùy chọn với gợi ý tỷ lệ 3:2, 16:9 hoặc 4:3; chưa chọn ảnh.

### RSVP

Khối một cột nền trắng: tiêu đề đậm căn giữa, nhãn và input tên, câu hỏi tham dự, hai radio xếp dọc, nút gửi đỏ san hô chiếm ngang vùng nội dung. Mẫu thêm mới khoảng 300px ngang và 320px cao theo ảnh ở zoom 100%; chưa đo DOM chính xác. Font field 14px, Arial; màu chữ/nền/viền input/nút/chữ nút chỉnh độc lập. Tham chiếu `06-added.png`.

Đây là một form design tùy chỉnh, chưa thấy menu nhiều template. Các trường nâng cao được giới thiệu Basic+; chưa xác minh giao diện khi bật số người/phương tiện/nhà trai-gái. Source preview hiện chỉ tiêu đề và nút disabled, nên không thể coi đã tương đương mẫu này.

### QR Box

Phần tử là hình hộp quà màu hồng/vàng (khoảng 100×100px theo ảnh), không phải mã QR hiển thị trực tiếp. Panel có Đổi icon, Xem trước, tiêu đề mặc định Hộp Quà Yêu Thương; tối đa hai tài khoản theo mô tả UI. Đổi icon chuyển sang panel Stock kèm lời nhắc chọn ảnh thay thế (`design-qr-icons.png`), chưa thấy danh mục icon QR riêng. Mở thêm tài khoản bị yêu cầu nâng cấp. Chưa có dữ liệu để xác minh mẫu dialog chứa QR thật.

### Phong bì

Mẫu mặc định là phong bì đồ họa đỏ nhiều lớp: nắp tam giác, hai cạnh, đáy và dấu sáp ở giữa; có bóng đổ dưới. Có tám theme màu nhanh: Blush Romance, Lavender Dream, Red Serenity, Olive Nature, Forest Green, Minimal Ivory, Mint Whisper, Sky Dream. Mỗi theme là phối màu cho cùng cấu trúc, không mặc định coi là tám kiểu hình học khác nhau.


Đã nhấn và chụp đủ tám theme; giá trị đọc trực tiếp từ panel:

| Theme | Nắp | Cạnh | Đáy |
| --- | --- | --- | --- |
| Blush Romance | #EDA5A9 | #F4B8BB | #FACBCD |
| Lavender Dream | #B39DDB | #CDB4F4 | #DCCAFF |
| Red Serenity | #812927 | #A33F3D | #A84644 |
| Olive Nature | #B8C1A8 | #E8DDC1 | #F2EDD8 |
| Forest Green | #305D2E | #4A7647 | #638B60 |
| Minimal Ivory | #C5BCAB | #DAD3C8 | #E8E3D8 |
| Mint Whisper | #C9E4CA | #E4F5E7 | #F0FAF2 |
| Sky Dream | #C7DBF4 | #EFF4FA | #F7FAFC |

Design đặt phong bì trong canvas để di chuyển; Modal hiển thị phủ nội dung, thêm text hướng dẫn, font/cỡ/màu và backdrop mặc định hiển thị 40%. Có khóa cuộn và ảnh trong phong bì. Panel cho thao tác dù có thông báo yêu cầu Basic; chưa kiểm chứng xuất bản/sử dụng thực tế trên gói FREE. Source envelope toàn trang hiện có không phải mẫu đồ họa này.

### Carousel và hạt

Carousel mặc định rỗng là khung xám nhạt, text Chưa có ảnh carousel. Fade được chọn; thời gian 1.5s, delay 0.0s. Zoom/Switch/Overlap/Fade là kiểu chuyển động, chưa có bằng chứng là bốn layout ảnh. Chưa dùng ảnh riêng của tài khoản để thử.

Hạt là vùng phần tử có thể resize và đặt trên ảnh/nền. Tuyết rơi/Hạt sao là hai lựa chọn; nền trắng khiến nội dung khó nhìn theo cảnh báo UI. Đã mở Hiển thị: opacity 100%, blend mode Screen (khuyến nghị), Normal, Multiply, Overlay, Lighten, Hard Light; UI giải thích Screen ẩn nền đen của video (`design-particles-display.png`). Đây là dấu hiệu dùng nội dung video hòa trộn, chưa kiểm tra nguồn file/codec. Không coi ảnh tĩnh vùng trắng là bằng chứng animation hoạt động/không hoạt động.

### Những mẫu chưa thể khảo sát

Form tùy chỉnh, album ảnh, video YouTube và tên khách tự động bị modal gói khóa khi mở. Nội dung quảng bá không chứng minh design thật, các mẫu và số biến thể của các mục này vẫn chưa xác minh.

## 5. Tiêu chí đối chiếu khi được giao triển khai

| ID | Điều kiện | Mong đợi | Kết quả |
| --- | --- | --- | --- |
| AC01 | Cùng ngày, font, canvas zoom, chọn từng kiểu lịch | Khớp header, lưới, dấu ngày, watermark và màu đã chụp | Chưa kiểm tra |
| AC02 | Countdown ngang/dọc | Khớp ô số/nhãn/gap/màu; layout không thay đổi dữ liệu ngày | Chưa kiểm tra |
| AC03 | Nút gọi đổi màu/icon/nhãn | Canvas và preview khớp hình thức; không phát sinh cuộc gọi lúc chỉnh | Chưa kiểm tra |
| AC04 | RSVP trong editor/preview | Hiển thị đủ mẫu form để thấy kết quả chỉnh; preview không gửi dữ liệu thật | Chưa kiểm tra |
| AC05 | Widget thiếu như QR Box/phong bì/hạt | Chỉ triển khai sau khi được giao cụ thể; schema/state/renderer đầy đủ | Chưa kiểm tra |

## 6. Kế hoạch sửa chức năng hiện có

Chưa sửa code trong phạm vi khảo sát. Nếu được giao làm giống, ưu tiên Calendar/Countdown/Contact/RSVP: giữ ID/binding cũ, thêm trường thực sự cần thiết theo schema, đồng bộ panel–command–renderer–preview. Áp dụng skill ui-ux-pro-max khi triển khai UI theo yêu cầu repository; không thay mẫu bằng thiết kế tự chọn.

## 7. Chức năng thiếu — chỉ báo cáo

- Calendar hai ngày và ba mẫu của Cinelove chưa có mapping đúng với source; cần schema ngày thứ hai và renderer từng mẫu, bảo vệ dữ liệu cũ. Chưa triển khai.
- Contact thiếu cỡ/màu icon riêng; cần field/schema/control/renderer. Chưa triển khai.
- Reminder thiếu ngày kết thúc và ảnh sự kiện độc lập theo UI tham chiếu; cần xác định tương tác với event binding và ICS. Chưa triển khai.
- QR Box là giao diện icon mở hộp QR; source hiện chỉ QRBank trực tiếp. Cần node/config, dialog, asset icon và preview; không thay QRBank cũ tự động.
- Phong bì Design/Modal và theme màu là widget mới so với settings.envelope; cần định danh node, geometry, theme, ảnh, interaction, renderer và tương thích settings hiện hành.
- Hạt tuyết/sao cấp phần tử khác particles cánh hoa/trái tim toàn trang; cần widget/renderer mới nếu được giao.
- Luồng danh sách khách/link riêng/theo dõi gửi và trường form Premium mới được giới thiệu qua modal; chưa đủ bằng chứng thực tế để quyết định triển khai.

## 8. Kết quả kiểm tra

Đã nhấn cả 14 mục, chụp mặc định và nhiều trạng thái chỉnh sửa/preview. Một lần chọn Kiểu 2 timeout do dropdown đóng/mở; đã chạy kiểm tra riêng để bổ sung, không quy kết lỗi Cinelove. Một số ảnh có toast backup của chính thiết kế thử trong phiên; không khôi phục hoặc xuất bản. Chưa nghiệm thu local, chưa chạy test sản phẩm vì chỉ thêm tài liệu. Không có ảnh local/diff. Chưa kiểm tra lưu/tải lại, undo/redo, mobile, kết quả gửi form, mở QR với tài khoản thật, mở phong bì hết animation hoặc animation hạt. Chưa kết luận toàn bộ các tiện ích tương đương source.

## 9. Bàn giao

Trọng tâm là bộ mẫu design với ảnh thực tế và các khác biệt source. Không phát triển admin và không thêm widget thiếu trong lượt này. Các giới hạn theo gói và nhánh chưa xác minh được ghi riêng để tránh lấy nội dung giới thiệu làm mẫu đã kiểm chứng.

## 10. Phạm vi triển khai ngày 2026-10-14

Người dùng giao sửa code phần Tiện ích sau khảo sát, trọng tâm mẫu design. Triển khai mẫu lịch No Style/Kiểu 1/Kiểu 2 trong Calendar hiện có, layout đếm ngược dạng ô, nút gọi, RSVP đầy đủ trong editor/preview và panel Tiện ích. Giữ variant lịch cũ để không thay đổi thiết kế đã lưu. Các trường mới optional ở cả API/web; defaults mới chỉ áp dụng khi thêm phần tử mới. Các chức năng mới hai ngày, widget phong bì/hạt và QR Box mở dialog chưa được gộp vào phạm vi sửa luồng hiện có.

Tiêu chí trước sửa: mẫu lịch giữ đúng thứ/ngày và múi giờ ở cả ba kiểu; document cũ vẫn parse/render; countdown ngang/dọc giữ target/clock, không có timer trong preview; RSVP editor/preview hiển thị form nhưng không gửi; radio trong public giữ đúng attendance và API hiện hành; chọn kiểu/màu/nhãn lưu qua API thật rồi tải lại được.

## 11. Kết quả triển khai

### Đã sửa

- Calendar: ba design `plain`/`ribbon`/`notebook`, dấu tim, header tháng/năm và watermark/gáy sổ; thumbnail chọn mẫu trong panel. Giữ `classic`/`minimal`/`filled` và cách render cũ khi document dùng chúng. Default mới chỉ dùng khi thêm widget.
- Countdown: mẫu `boxed`, bốn ô số/đơn vị, nền khung và khoảng cách; chuyển ngang/dọc đổi kích thước khung trong cùng một command, hoàn tác/làm lại một bước. Giữ renderer cũ khi không có design. Chọn nâng cấp mẫu cũ áp dụng chữ trắng/nền đen để tránh chữ đen trên nền đen.
- Contact: nút đỏ, màu/cỡ icon và chữ, bật/tắt icon; Reminder dùng được màu/cỡ chữ nút. Call button chưa nhập số vẫn hiện design trong editor/preview nhưng giữ lỗi BINDING_REQUIRED, không xuất bản/capture như dữ liệu hợp lệ; không mở cuộc gọi trong editor/preview.
- RSVP: mẫu `invitation` render đầy đủ form trong editor/preview; radio Có/Không, màu viền input, nhãn và nút gửi; public đi qua PublicRsvp và API hiện hành. Preview/capture inert, không gửi dữ liệu. Giữ số người/lời nhắn vì source đã có; giữ giao diện cũ nếu không chọn mẫu mới.
- Panel Tiện ích: thứ tự các nhóm tương ứng công cụ đã có, icon rõ hơn, trạng thái disabled khi đang xuất bản. Giữ Timeline và các widget riêng của source.
- API/web schema và types cập nhật đồng bộ; metadata mới optional, không cần database migration.

### Kiểm tra thực tế

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| Lịch đúng ngày/tháng và múi giờ qua giao năm, cả ba mẫu | Đạt | `widget-designs.test.tsx` |
| Document defaults mới, variant cũ và từ chối mẫu không hợp lệ | Đạt | Tests document/design; lưu thật qua API |
| Đếm ngược layout và kích thước undo/redo cùng nhau, giữ binding | Đạt | Unit test + browser `local/result.json` |
| Form invitation đầy đủ và inert trong preview; radio public cập nhật attendance | Đạt | Unit test + browser |
| Radio không bị CSS editor ép thành input toàn chiều rộng | Đạt | Browser đo 18×18px |
| Mẫu lịch, iconSize và nhãn RSVP lưu/tải lại qua API thật | Đạt | Browser `realApiSaved`, `reloadPreserved` |
| Preview mobile không tràn document ngang ở 390×844 | Đạt | `mobileDocumentWidth: 390`, `mobile-preview.png` |
| Khớp pixel hoàn toàn với Cinelove | Chưa đạt | Các khác biệt dưới đây |

- `pnpm test:web`: **61 files / 602 tests passed**.
- API unit nhóm invitation-builder: **6 files / 59 tests passed**; kiểm tra lại editor-document sau bổ sung assertions: **6 tests passed**.
- Lint web/API, typecheck API và production build web/API: **pass**. Build web kiểm tra TypeScript, output tách dev server; config build tạm đã xóa.
- Browser thực tế: `.artifacts/local/cinelove/widgets/manual.mjs`, kết quả PASS ở `local/result.json`. Tạo template kiểm thử riêng, lưu qua API, tải lại, preview, chụp từng design riêng rồi xóa dữ liệu kiểm thử theo marker. Không xuất bản hoặc sửa template người dùng.
- Ảnh local: `calendar-plain.png`, `calendar-ribbon.png`, `calendar-notebook.png`, `isolated-calendar.png`, `isolated-countdown.png`, `isolated-contact.png`, `isolated-rsvp.png`, `preview.png`, `mobile-preview.png` trong `.artifacts/local/cinelove/widgets/local/`.

### Giới hạn và phần còn thiếu

Không tuyên bố giống 100%: source giữ font Noto đã hỗ trợ thay vì Arial tham chiếu; dấu tim là SVG dựng trong code, chưa có texture như ảnh dấu tim của Cinelove. RSVP giữ trường số người/lời nhắn nên cao hơn form FREE tham chiếu. Chưa kiểm tra kết quả RSVP trên trang đã xuất bản bằng API thật trong lượt này; unit tests public transport hiện hành vẫn qua.

Các mục chưa triển khai trong lượt này: ngày thứ hai của lịch; QR Box dạng icon mở dialog; widget phong bì với theme/Design/Modal; hạt tuyết/sao cấp phần tử; reminder ngày kết thúc/ảnh sự kiện riêng. Album, YouTube, form tùy chỉnh và tên khách giữ source vì mẫu thật bị khóa và chưa đủ bằng chứng. Kế hoạch admin tiếp tục hoãn theo yêu cầu.

Manual test: http://localhost:3000/admin/templates → tạo/mở mẫu → Tiện ích → thêm Lịch/Đếm ngược/Nút gọi/Xác nhận tham dự. Với widget cũ, chọn mẫu mới trong panel để đổi design; không tự sửa hàng loạt dữ liệu cũ. Nhấn Lưu, tải lại và Xem trước để kiểm tra. Server web/API đang chạy.
