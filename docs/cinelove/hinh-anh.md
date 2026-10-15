# Đối chiếu Cinelove: Hình ảnh (xóa ảnh, panel Tuỳ chỉnh, cắt ảnh)

## 1. Phạm vi

- Yêu cầu người dùng (2026-10-14):
  - Xóa ảnh trong thư viện phải hiện popup của ứng dụng thay cho `window.confirm`, gồm cảnh báo "Ảnh đang được sử dụng" kèm số thành phần.
  - Panel Tuỳ chỉnh của ảnh: bỏ section "Hình ảnh" cũ (thay ảnh, khớp ảnh, căn ảnh) và section "Cắt & tạo hình". Thay bằng giao diện theo `tuychinh.png`: xem trước, nút Cắt ảnh, Màu sắc có thêm Màu nền, Khoảng đệm chứa Lật ngang/Lật dọc.
  - Bấm Cắt ảnh mở popup theo `catanh.png`.
  - Không làm nút "Đổi ảnh".
  - Thành phần Trang trí: đổi theo Cinelove nếu việc đổi giúp đồng bộ.
- Ngày khảo sát: 2026-10-14.
- Cinelove: https://cinelove.me/editor/new-blank, dùng bản nháp chưa lưu, tài khoản do người dùng cấp. Đường đi: tab "Hình ảnh" ở thanh trái → ô ảnh → panel "Tuỳ chỉnh"; tab "Stock" → ô trang trí.
- Web local: http://localhost:3000, đăng nhập admin → mở một mẫu (template editor) → tab Hình ảnh / Trang trí.
- Dữ liệu kiểm thử: ảnh test 600×400 dạng gradient, thành phần ảnh 200×133 trên Cinelove.
- Viewport 1440×900, browser zoom 100%, canvas zoom 100%, Chromium headless (Playwright 1.63).
- Ngoại lệ theo yêu cầu người dùng:
  - Không có nút "Đổi ảnh" ở panel ảnh.
  - Bộ hình dạng cắt do dự án tự vẽ bằng SVG thay cho 107 PNG thuộc Cinelove (`assets.cinelove.me/resources/cropShapes/*.png`). Người dùng chọn phương án này ngày 2026-10-14.

## 2. Kiểm kê hai bên

| ID  | Chức năng                                                         | Source                                                     | Bằng chứng source                                               | Bằng chứng Cinelove                                  | Quyết định                               |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| F01 | Xóa ảnh trong thư viện, ảnh chưa dùng                             | Có, dùng `window.confirm`                                  | `editor/asset-library.tsx` `removeAsset`                        | `delete-unused.png`                                  | Sửa                                      |
| F02 | Xóa ảnh đang dùng: cảnh báo, đếm và xóa thành phần                | Một phần: API trả 409 `ASSET_IN_USE`, UI chưa xử lý        | `asset-reference.service.ts` `assertUnreferenced`               | `delete-used-1.png`, `delete-used-2.png`             | Sửa                                      |
| F03 | Khung xem trước ảnh trong panel                                   | Chưa có                                                    | —                                                               | `panel-image.png`                                    | Sửa (thuộc giao diện người dùng yêu cầu) |
| F04 | Nút Cắt ảnh và popup cắt                                          | Một phần: `crop` dạng ô số 0–1, mask 3 hình                | `editor-properties.tsx` "Cắt & tạo hình", `canvas-renderer.tsx` | `crop-dialog.png`, `crop-apply.json`                 | Sửa                                      |
| F05 | Hình dạng cắt                                                     | Một phần: none/circle/arch/heart                           | `NodeOptions.mask`                                              | 107 ô, `crop-shape-selected.png`                     | Sửa, dùng bộ SVG riêng (ngoại lệ)        |
| F06 | Màu sắc: Màu nền + Trong suốt                                     | Một phần: chỉ có Trong suốt; schema Image cấm `background` | `schema-definitions.ts` `field_Image`, `document-schema.ts`     | `panel-image-open-1-mausac.png`                      | Sửa (mở rộng schema)                     |
| F07 | Khoảng đệm 4 cạnh, liên kết mặc định                              | Có control cho Text; schema Image cấm `padding`            | `PaddingControl`                                                | `panel-image-open-2-khoangdem.png`                   | Sửa (mở rộng schema)                     |
| F08 | Lật ngang / Lật dọc                                               | Có (`flipX`/`flipY`, checkbox trong "Cắt & tạo hình")      | `editor-properties.tsx`                                         | `flip-*.png`                                         | Sửa vị trí và dạng control               |
| F09 | Đường viền, Đổ bóng                                               | Có                                                         | `properties-panel.tsx`                                          | `panel-image-open-3/4`                               | Giữ                                      |
| F10 | Thay ảnh / Khớp ảnh / Căn ảnh (section "Hình ảnh")                | Có                                                         | `properties-panel.tsx`                                          | Không có trên Cinelove                               | Bỏ khỏi panel ảnh theo yêu cầu           |
| F11 | Panel Trang trí: xem trước + "Thay đổi", Màu sắc mở sẵn, Đối xứng | Một phần                                                   | `properties-panel.tsx`                                          | `stock-selected-panel.png`, `stock-doixung-open.png` | Sửa theo yêu cầu đồng bộ                 |
| F12 | Hành động khi bấm, Hiệu ứng chuyển động, Chuyển động liên tục     | Có                                                         | `ClickActionControls`, `MotionControls`                         | Có                                                   | Giữ, ngoài phạm vi                       |
| F13 | Liên kết dữ liệu ảnh                                              | Có (source riêng)                                          | `BindingPanel`                                                  | Không thấy                                           | Giữ                                      |

## 3. Hành vi đã quan sát

| ID  | Chức năng | Điều kiện                   | Thao tác                 | Kết quả trên Cinelove                                                                                                                                                                                                                                                                                                                                                                  | Bằng chứng                               | Trạng thái                                         |
| --- | --------- | --------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| R01 | F01       | Ảnh chưa dùng               | Hover ô → thùng rác      | Modal 416px: "Xóa ảnh", "Bạn có chắc chắn muốn xóa ảnh này không?", hộp vàng (#FDFDEA, viền #FCE96A, chữ #723B13) "**Lưu ý:** Nếu ảnh đang được sử dụng ở các trang thiệp khác, việc xóa ảnh sẽ ảnh hưởng đến tất cả các trang đó.", nút Hủy (viền) + Xóa (primary #1677FF)                                                                                                            | `delete-unused.png`                      | Đã xác minh                                        |
| R02 | F01/F02   | Modal đang mở               | Escape / Hủy / click nền | Escape và Hủy đóng, không xóa; click nền không đóng                                                                                                                                                                                                                                                                                                                                    | survey.md A1                             | Đã xác minh                                        |
| R03 | F02       | Ảnh dùng ở 1 / 2 thành phần | Bấm thùng rác            | Icon ! cam, tiêu đề "Ảnh đang được sử dụng", "Ảnh này đang được sử dụng trong N thành phần:", "• N thành phần của trang", in đậm "Nếu bạn xóa ảnh này, các thành phần đó cũng sẽ bị xóa theo.", hộp vàng "Lưu ý: Nếu ảnh đang được sử dụng ở các trang khác, việc xóa ảnh sẽ ảnh hưởng đến các trang đó.", in đậm "Bạn có chắc chắn muốn tiếp tục xóa?", nút Hủy + "Vẫn xóa" (viền đỏ) | `delete-used-1.txt`, `delete-used-2.png` | Đã xác minh                                        |
| R04 | F02       | Ảnh đang dùng               | Bấm "Vẫn xóa"            | —                                                                                                                                                                                                                                                                                                                                                                                      | —                                        | Chưa xác minh: không xóa trên tài khoản tham chiếu |
| R05 | F03/F04   | Chọn ảnh                    | —                        | Xem trước 140×138 (ảnh 120×120 contain), nút Cắt ảnh 104.5×36 #3F83F8 r8, chữ trắng 14/500, có icon                                                                                                                                                                                                                                                                                    | survey.md B                              | Đã xác minh                                        |
| R06 | F04       | Mở popup                    | —                        | Modal 800×658, tiêu đề "Cắt ảnh"; vùng ảnh 552×540 nền xám; khung cắt ban đầu 80% ảnh, lưới 3×3 nét đứt, 8 điểm kéo, dấu + ở tâm; cột phải "Hình dạng cắt:", lưới 4 cột cuộn được; "Tỷ lệ khung hình" 6 nút 2 cột (mặc định Tự do); Hủy + Xác nhận                                                                                                                                     | `crop-dialog.png`                        | Đã xác minh                                        |
| R07 | F04       | Popup mở                    | Chọn tỷ lệ               | Khung cắt co về tỷ lệ, giữ tâm, lớn nhất có thể trong khung hiện tại (1:1 → 294×294 từ 442×294)                                                                                                                                                                                                                                                                                        | `crop-apply.json`                        | Đã xác minh                                        |
| R08 | F05       | Popup mở                    | Chọn hình                | Ô viền xanh; hình hiện cạnh tiêu đề kèm nút × "Reset shape"; xem trước mask trong khung cắt                                                                                                                                                                                                                                                                                            | `crop-shape-selected.png`                | Đã xác minh                                        |
| R09 | F04       | Chọn 1:1 + hình             | Xác nhận                 | Khung thành phần đổi tỷ lệ theo vùng cắt, giữ chiều rộng (200×133 → 200×200); mask áp lên ảnh; toast "Cập nhật ảnh thành công"                                                                                                                                                                                                                                                         | `crop-confirmed.png`                     | Đã xác minh                                        |
| R10 | F04       | Đã cắt                      | Mở lại                   | Thấy ảnh gốc, giữ vùng cắt, hình và nút tỷ lệ đã chọn                                                                                                                                                                                                                                                                                                                                  | `crop-reopen.png`                        | Đã xác minh                                        |
| R11 | F04       | Popup mở                    | Escape                   | Đóng, không áp dụng                                                                                                                                                                                                                                                                                                                                                                    | `crop-apply.json`                        | Đã xác minh                                        |
| R12 | F06       | Mở Màu sắc                  | —                        | "Màu nền" (ô màu) + "Trong suốt" 0–1, bước 0.01, mặc định 1.00, có slider                                                                                                                                                                                                                                                                                                              | `panel-image-open-1-mausac.png`          | Đã xác minh                                        |
| R13 | F07       | Mở Khoảng đệm               | Nhập số                  | 4 ô quanh "Block", số nguyên 0–100, mặc định 0, liên kết sẵn; khung giữ nguyên, ảnh co vào trong; 150 → 100; -5 hoặc rỗng → 0                                                                                                                                                                                                                                                          | `padding-*.png`                          | Đã xác minh                                        |
| R14 | F08       | Khoảng đệm                  | Bật công tắc             | "Lật ngang:" và "Lật dọc:" cùng một hàng; chỉ lật nội dung ảnh                                                                                                                                                                                                                                                                                                                         | `flip-*.png`                             | Đã xác minh                                        |
| R15 | F06       | Có padding                  | —                        | Màu nền lộ ở đâu                                                                                                                                                                                                                                                                                                                                                                       | —                                        | Chưa xác minh                                      |
| R16 | F11       | Chọn trang trí Stock        | —                        | Xem trước + nút "Thay đổi"; Màu sắc mở sẵn (Màu nền, Trong suốt); "Đối xứng" gồm Lật ngang/Lật dọc; không có Cắt ảnh, không có Khoảng đệm                                                                                                                                                                                                                                              | `stock-selected-panel.png`               | Đã xác minh                                        |
| R17 | —         | Section                     | —                        | Mặc định đóng (ảnh), header 50px, viền 1px rgba(0,0,0,.1), chevron trái                                                                                                                                                                                                                                                                                                                | survey.md B                              | Đã xác minh                                        |

## 4. Thông số giao diện và dữ liệu

| Thuộc tính | Source trước         | Cinelove                                                   | Cách đo   | Thay đổi                |
| ---------- | -------------------- | ---------------------------------------------------------- | --------- | ----------------------- |
| Modal xóa  | `window.confirm`     | 416px, nút cao 32, xem R01/R03                             | DOM + ảnh | Có                      |
| Popup cắt  | Không có             | 800×658, vùng ảnh 552×540, cột phải 180px, nút tỷ lệ 86×35 | DOM + ảnh | Có                      |
| Khoảng đệm | Text: không liên kết | 0–100, bước 1, liên kết sẵn                                | DOM       | Có                      |
| Lưu cắt    | `crop` x/y/w/h 0–1   | Không phá ảnh gốc, giữ tỷ lệ đã chọn                       | Mở lại    | Thêm `cropAspect`       |
| Hình dạng  | 4 giá trị            | 107 PNG                                                    | DOM       | Tự vẽ bộ SVG (ngoại lệ) |

## 5. Tiêu chí nghiệm thu

| ID   | Liên quan       | Điều kiện + thao tác                  | Kết quả mong đợi                                                                                                                                       | Cách kiểm tra                 | Kết quả                                                                                               |
| ---- | --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| AC01 | R01             | Ảnh chưa dùng → thùng rác             | Modal "Xóa ảnh" đúng chữ và màu như R01; không có `window.confirm`                                                                                     | Playwright local              | Đạt — chữ khớp R01, không có hộp thoại native (`delete-unused.png`)                                   |
| AC02 | R02             | Escape / Hủy / click nền              | Escape và Hủy đóng, không gọi DELETE; click nền không đóng                                                                                             | Playwright local              | Đạt — Escape đóng, giữ ảnh; click nền không đóng; Hủy đóng                                            |
| AC03 | R03             | Ảnh dùng ở 1 và 2 thành phần          | Chữ đúng R03, N = số thành phần đang tham chiếu ảnh                                                                                                    | Playwright local + unit test  | Đạt — "2 thành phần" (`delete-used-2.png`); unit test `nodesUsingAsset`                               |
| AC04 | R04             | Bấm "Vẫn xóa"                         | Thành phần dùng ảnh bị xóa (một bước undo), draft được lưu, asset bị xóa khỏi thư viện; nếu API vẫn 409 thì báo lỗi rõ và không xóa ảnh khỏi danh sách | Playwright local qua API thật | Đạt — gỡ 2 thành phần, ảnh biến mất, tải lại vẫn mất; 409 khi ảnh dùng ở mẫu khác hiện lỗi và giữ ảnh |
| AC05 | R05, F10        | Chọn ảnh                              | Panel có xem trước + nút Cắt ảnh; không còn Thay ảnh/Khớp ảnh/Căn ảnh/Cắt & tạo hình; không có Đổi ảnh                                                 | Playwright local              | Đạt — có xem trước + Cắt ảnh; không còn các mục cũ (`panel-image.png`)                                |
| AC06 | R06–R08         | Mở popup                              | Bố cục và hành vi tỷ lệ như R06–R08; tỷ lệ giữ tâm                                                                                                     | Playwright local + unit test  | Đạt — popup 800×660 tại (320,120); khung cắt 442×294 → 1:1 294×294 giữ tâm; 25 hình                   |
| AC07 | R09             | Chọn 1:1 + hình → Xác nhận            | Khung thành phần 1:1, giữ chiều rộng; mask áp trên canvas và trang xem trước; có thông báo thành công                                                  | Playwright local              | Đạt — 240×180 → 240×240; toast; xem trước có mask (`crop-confirmed.png`, `preview-mask.png`)          |
| AC08 | R10             | Mở lại sau khi cắt, rồi tải lại trang | Thấy ảnh gốc, giữ vùng cắt, hình và tỷ lệ                                                                                                              | Playwright local qua API thật | Đạt — mở lại và sau tải lại vẫn 1:1 + "Mái vòm thấp"                                                  |
| AC09 | R11             | Escape / Hủy                          | Không thay đổi document                                                                                                                                | Playwright local              | Đạt — Escape đóng; thành phần giữ 240×240 sau đó                                                      |
| AC10 | R12             | Đổi Màu nền, Trong suốt               | Màu nền lưu vào `appearance.background`, hiển thị sau ảnh; ảnh cũ chưa có `background` vẫn hợp lệ                                                      | Unit test schema + Playwright | Đạt — có Màu nền; unit test schema nhận `background`                                                  |
| AC11 | R13             | Nhập padding 30, 150, -5, rỗng        | Liên kết sẵn; 30 áp cả 4 cạnh; giá trị được kẹp trong 0–100 và giới hạn hợp lệ của khung; ảnh co vào trong khung                                       | Playwright + unit test        | Đạt (30 liên kết 4 cạnh, 150 → 100, rỗng → 0); -5: Chưa kiểm tra                                      |
| AC12 | R14             | Bật Lật ngang / Lật dọc               | Lật nội dung ảnh, không lật khung                                                                                                                      | Playwright                    | Đạt — công tắc bật, lật nội dung (`flip-horizontal.png`)                                              |
| AC13 | R16             | Chọn Trang trí                        | Xem trước + "Thay đổi"; Màu sắc mở sẵn; Đối xứng có 2 công tắc; không có Cắt ảnh/Khoảng đệm                                                            | Playwright                    | Đạt — cấu trúc panel; ảnh Stock local không tải được do môi trường                                    |
| AC15 | Yêu cầu bổ sung | Chọn ảnh trên canvas                  | Chỉ một viền xanh nhạt #9bceff như khung Văn bản, không còn viền nâu lồng ngoài; điểm kéo giữ nguyên                                                   | Playwright local              | Đạt — panel-image.png                                                                                 |
| AC14 | —               | Document cũ có mask circle/arch/heart | Vẫn hợp lệ và hiển thị như trước                                                                                                                       | Unit test web + API           | Đạt (validator web + API); hiển thị: Chưa kiểm tra bằng ảnh                                           |

## 6. Kế hoạch sửa chức năng hiện có

- Component, state, command:
  - `properties-panel.tsx` (panel Image/Decoration), `editor-properties.tsx` (bỏ "Cắt & tạo hình").
  - Popup cắt ảnh mới.
  - `editor/asset-library.tsx` (modal xóa), `invitation-editor.tsx` (đếm/xóa thành phần, lưu draft trước khi xóa asset).
- Schema, validation:
  - Cho phép `appearance.background` (Image, Decoration) và `appearance.padding` (Image) là tùy chọn, ở web zod và API JSON schema.
  - `NodeOptions.mask` nhận id hình trong danh sách cố định (giữ `none`/`circle`/`arch`/`heart`).
  - Thêm `NodeOptions.cropAspect`.
  - Sửa song song `editor-document.ts` web và API.
- Renderer: `canvas-renderer.tsx` áp mask SVG bằng `mask-image`; padding và màu nền đi qua `frameStyle` sẵn có.
- Tương thích dữ liệu cũ: các trường mới đều tùy chọn; giá trị mask cũ được giữ.
- Logic cũ bị thay thế: section "Hình ảnh" và "Cắt & tạo hình" cho Image/Decoration; `window.confirm` khi xóa ảnh.
- Skill: `ui-ux-pro-max` (focus, Escape, nhãn cho nút icon, xác nhận trước thao tác phá hủy).

## 7. Cinelove có nhưng source còn thiếu — chỉ báo cáo

| ID  | Chức năng thiếu      | Bằng chứng         | Source hiện có                  | Đề xuất tích hợp                                                       | Phụ thuộc                          | Trạng thái                                    |
| --- | -------------------- | ------------------ | ------------------------------- | ---------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------- |
| M01 | Xóa nền (AI)         | `panel-image.png`  | Không có                        | Dịch vụ tách nền (API), tạo asset mới, thay `assetId`; UI nút gradient | Dịch vụ AI, chi phí, lưu trữ asset | Chưa triển khai; chờ người dùng lên phương án |
| M02 | Đổi ảnh ở panel ảnh  | `panel-image.png`  | Có luồng thay ảnh (`onReplace`) | Người dùng yêu cầu không làm                                           | —                                  | Không làm theo yêu cầu                        |
| M03 | Bộ 107 hình dạng cắt | `crop-dialog.html` | Bộ SVG tự vẽ                    | Bổ sung hình có bản quyền khi cần                                      | Tài sản thiết kế                   | Ngoại lệ đã chốt                              |

## 8. Kết quả kiểm tra

- Lệnh kiểm tra và kết quả thực tế (2026-10-14):
  - `vitest` web: 59 file, 579/579 test đạt. Có thêm `crop-geometry.test.ts` và các test cho schema, command `crop`/`delete-many`.
  - `vitest` API unit: 15 file, 92/92 đạt.
  - `node scripts/editor-api.mjs --all-builder`: 131/133 đạt. Hai test least-privilege của S3 (`storage-setup.spec.ts`, `storage.spec.ts`) lỗi do SeaweedFS trên máy này chỉ có một identity đủ quyền; không liên quan thay đổi này.
  - `tsc` web/API, `eslint`, `prettier`, `next build`: sạch.
- Kịch bản tương tác local: `.artifacts/local/cinelove/hinh-anh/scripts/local-verify.cjs` chạy trên web + API thật, mẫu thử `TEST-DOI-CHIEU-HINH-ANH`. Kết quả ở `local/verify-results.json`, ảnh chụp ở `local/`.
- Kịch bản khảo sát Cinelove: `survey-delete-crop.cjs`, `survey-crop-apply.cjs`, `survey-stock.cjs`, `survey-frames.cjs`.
- Sai khác còn lại:
  - Popup cao 660px so với 658px trên Cinelove.
  - Bộ hình dạng có 25 hình tự vẽ, Cinelove có 107 (ngoại lệ đã chốt).
  - Ô Màu nền khi trong suốt hiển thị caro, Cinelove hiển thị ô trắng.
  - Nút trong popup lấy focus đầu tiên theo mặc định của trình duyệt; dialog xóa focus vào "Hủy" cho an toàn.
  - Chưa xác minh: màu nền lộ ở vùng nào khi có padding (R15); hành vi khi bấm "Vẫn xóa" trên Cinelove (R04, không xóa trên tài khoản tham chiếu); vị trí khung sau khi cắt (Cinelove có giữ góc trên-trái không).
- Ảnh tham chiếu: `.artifacts/local/cinelove/hinh-anh/reference/` (chỉ có trên máy local).
- Script khảo sát: `.artifacts/local/cinelove/hinh-anh/scripts/` (đọc tài khoản từ biến môi trường).

## 9. Bàn giao

- Đã sửa và đối chiếu đạt: AC01–AC13, AC15; AC11 và AC14 đạt một phần như ghi ở mục 5.
- Chức năng thiếu cần người dùng lên phương án: M01.
- Chưa đạt hoặc chưa đủ bằng chứng: R04, R15; AC11 với giá trị âm; AC14 phần hiển thị.
- Ngoại lệ đã áp dụng theo yêu cầu: không có nút Đổi ảnh; bộ hình dạng SVG riêng.

## 10. Kiểm tra sau khi merge vào source hiện tại (2026-10-14)

- Nguồn: `/home/tunizme/Workspace/hinh-anh-session-2026-10-14`; repository đích bắt đầu tại commit `26025cb`.
- Đã nhập 18 tệp thay đổi và 9 tệp mới (gồm hồ sơ này). Ba tệp hướng dẫn còn lại trùng nội dung nên giữ nguyên. Không xóa tệp ngoài gói bàn giao.
- Toàn bộ 26 tệp code/test trong gói giữ nguyên nội dung sau merge; hồ sơ này bổ sung kết quả kiểm tra tại repository đích.
- Bản sao lưu trước merge: `/tmp/hinh-anh-pre-merge-ct4piryk/existing-files.tar.gz`; danh sách tệp mới/thay đổi: `/tmp/hinh-anh-pre-merge-ct4piryk/manifest.json` (chỉ có trên máy local).
- Kết quả chạy lại: web 579/579 test đạt; API unit 92/92 test đạt; `pnpm typecheck`, `pnpm lint`, `pnpm build`, Prettier trên các tệp nhập vào và `git diff --check` đều đạt.
- Lượt test web trong sandbox bị chặn mở cổng localhost (`EPERM`); lượt chạy lại ngoài sandbox đã đạt toàn bộ. Build prototype có cảnh báo bundle lớn hơn 500 kB, không làm build thất bại.
- Lượt merge này chưa chạy lại browser/E2E, kiểm tra lưu qua API thật hoặc khảo sát Cinelove. Các kết quả đối chiếu ở mục 1–9 được giữ từ hồ sơ bàn giao; ảnh chụp và script `.artifacts/local/cinelove/hinh-anh/` không có trong gói nguồn.

## 11. Hoàn thiện xóa ảnh theo yêu cầu bổ sung (2026-10-14)

- Người dùng yêu cầu khi xác nhận xóa phải gỡ ảnh ở các nơi khác và xóa tệp storage; không tiếp tục chặn bằng lỗi ảnh đang dùng ở mẫu khác/nền/ảnh chia sẻ. Đồng thời tăng kích thước icon xóa góc phải và sửa hover bị mất màu. Đây là hành vi được người dùng giao cụ thể; lượt này không khảo sát lại Cinelove.
- Server xử lý trong một transaction: gỡ thành phần Image/Decoration dùng ảnh; xóa ảnh khỏi album/carousel và poster; thay nền ảnh bằng nền trắng; xóa ảnh chia sẻ, ảnh trong dữ liệu mẫu và dữ liệu thiệp. Áp dụng cho các draft, revision, preset và snapshot đã xuất bản đang giữ ảnh đó. Nội dung văn bản trùng UUID ảnh được giữ nguyên.
- Bản đã xuất bản được cập nhật phiên bản công khai, giữ trạng thái PUBLISHED/UNPUBLISHED. Thumbnail có thể chứa ảnh cũ được bỏ tham chiếu; xuất bản lại sẽ tạo thumbnail mới. Job xuất bản đang chờ/chạy có dùng ảnh bị kết thúc với `ASSET_UNAVAILABLE`, ngăn ghi lại snapshot cũ.
- Migration `CascadeImageDeletion20261014000100` cho phép bỏ thumbnail và thêm ngoại lệ gỡ ảnh có kiểm soát cho revision/snapshot bất biến. Ngoại lệ chỉ áp dụng trong transaction xóa đúng ảnh DELETING; document/data mới phải bằng kết quả gỡ ảnh từ bản cũ. Đã áp dụng migration trên database local; dữ liệu không liên quan đến ảnh được yêu cầu xóa được giữ.
- Quyền xóa vẫn theo tài khoản sở hữu ảnh. Sau commit dữ liệu, server xóa object storage và chuyển DELETING → DELETED. Storage lỗi trả 503, giữ tombstone để nút thử lại hoặc cleanup worker xóa tiếp; không phục hồi tham chiếu ảnh đã gỡ. Thao tác xóa lặp lại an toàn.
- Editor lưu chỉnh sửa đang có trước khi gửi DELETE, sau đó đọc lại mẫu và phiên bản từ API kể cả khi storage lỗi. Xóa lịch sử undo/redo, clipboard và backup cũ sau khi đồng bộ để tránh đưa ảnh đã xóa trở lại. Phím tắt editor không chạy bên trong dialog.
- Nút xóa desktop 36×36px, icon 20×20px không co; mobile 44×44px. Hover/focus nền `#B42318`, icon trắng; selector riêng ghi đè hover và padding của nút chung.

| Tiêu chí bổ sung                                                                        | Kiểm tra                                                                      | Kết quả |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| Xóa trên hai mẫu dùng chung; gỡ nền, ảnh chia sẻ, cover; tải lại vẫn mất                | Chromium + API/database/storage local thật, tài nguyên TEST-DELETE riêng      | Đạt     |
| Giữ phần văn bản vừa thêm chưa lưu; editor nhận phiên bản mới; undo không khôi phục ảnh | Chromium, thao tác xóa từ thư viện editor                                     | Đạt     |
| Object storage thật không còn sau DELETE                                                | S3 HeadObject trước thao tác thành công, sau thao tác trả 404                 | Đạt     |
| Gỡ revision, snapshot PUBLISHED/UNPUBLISHED, preset, job xuất bản; giữ các ảnh khác     | PostgreSQL/S3 integration trong schema/prefix test riêng                      | Đạt     |
| Storage lỗi rồi retry; tài khoản khác không có quyền xóa                                | Integration, ép storage trả lỗi; kiểm tra dữ liệu và object trước/sau cleanup | Đạt     |
| Hover giữ icon trắng trên nền đỏ; desktop 36px/icon 20px, mobile 44px                   | Đo bounding box và computed style trên Chromium                               | Đạt     |

- Kiểm thử: web 582/582; API unit 92/92; API builder contract/integration 136/136. Sau bước giới hạn việc dọn reverse references vào tài nguyên bị ảnh hưởng, chạy lại 3/3 integration xóa ảnh đạt. Typecheck, lint, build web/API và `git diff --check` đạt.
- Bằng chứng local: `.artifacts/local/cinelove/hinh-anh/cascade/result.json`, `delete-icon-desktop.png`, `delete-icon-mobile.png`, `delete-confirmation.png`, `delete-complete.png`. Script: `.artifacts/local/asset-cascade-manual.mjs`; tài nguyên thử nghiệm được dọn riêng sau kiểm tra.
- Kết quả AC04 cũ (chặn 409 khi dùng ở mẫu khác) ở mục 5 là kết quả trước yêu cầu bổ sung; hành vi cuối cùng được thay bằng mục này. Các phần chưa xác minh với Cinelove ở mục 9 vẫn giữ nguyên trạng thái.

## 12. Sửa ảnh hợp lệ không hiển thị trên canvas (2026-10-14)

- Lỗi người dùng báo: thumbnail ảnh vừa tải lên hiển thị trong thư viện, nhưng khi thêm vào editor thì cả các thành phần ảnh báo không tải được.
- Xác minh trên mẫu local: hai ảnh của thành phần Image trả HTTP 200, trong đó ảnh mới rộng 3840px; một tham chiếu ảnh khác trong mẫu trả 404. `useAssetPreview` trước đây dùng `Promise.all` và xóa toàn bộ URL khi một request thất bại, nên ảnh hợp lệ cũng bị ẩn.
- Sửa hook để từng request kết thúc độc lập bằng `Promise.allSettled` và công bố URL ngay khi ảnh đó tải thành công. Request 404 hoặc đang chờ không xóa/chặn URL của ảnh khác. Giữ việc hủy request và thu hồi blob URL khi đổi danh sách ảnh, đổi tài khoản hoặc unmount; không thay đổi dữ liệu ảnh của người dùng.
- Kiểm tra lại mẫu người dùng bằng trình duyệt: cả hai thành phần Image tải và decode thành công; tham chiếu 404 không còn làm chúng báo lỗi.
- Browser test với tài nguyên riêng: giả lập một ảnh chia sẻ trả 404; tải một ảnh mới qua UI/API/storage thật, kiểm tra thumbnail, thêm vào canvas, lưu và reload. Ảnh mới decode thành công ở tất cả bước. Đã dọn các asset/mẫu kiểm thử.
- Regression test bổ sung cho hai thứ tự: ảnh hợp lệ thành công trước khi ảnh khác lỗi, và ảnh hợp lệ về sau khi ảnh khác đã lỗi. Giữ các kiểm tra đổi tài khoản A → B → A, unmount và thu hồi URL.
- Kết quả: web 584/584 test đạt; typecheck web, ESLint trên hai tệp sửa, Prettier và `git diff --check` đạt.
- Bằng chứng local: `.artifacts/local/cinelove/hinh-anh/asset-load/result.json`, `upload-add-loaded.png`, `reload-loaded.png`. Script: `.artifacts/local/asset-load-manual.mjs`. Không khảo sát lại Cinelove trong lượt sửa lỗi này.
