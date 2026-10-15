# Đối chiếu Cinelove: Hiệu ứng

## 1. Phạm vi

- Yêu cầu: nghiên cứu và clone mục **Hiệu ứng** bên trái editor, mục tiêu 90–100% trong phạm vi đã khảo sát. Người dùng đã chốt **đầy đủ ba nhóm**, bao gồm chức năng source còn thiếu, và **mở toàn bộ**, không thêm khóa gói; sau đó giao “Implement the plan”.
- Ngày khảo sát/triển khai: 15/10/2026.
- Tham chiếu: `https://cinelove.me/editor/new-blank` → Hiệu ứng.
- Local: `/admin/templates/<id>/edit` hoặc `/admin/invitations/<id>/edit` → Hiệu ứng; trang khách `/i/<slug>`.
- Dữ liệu: bản trắng riêng trên tham chiếu; mẫu/thiệp kiểm thử riêng trên local. Không xuất bản hay sửa thiệp có sẵn trên tài khoản Cinelove.
- Điều kiện chính: desktop 1440 × 1000, browser zoom 100%, canvas 100%; mobile 390 × 844. Ảnh `cinelove-effects-default.png` ban đầu có viewport nhỏ hơn và không dùng làm baseline desktop.
- Bằng chứng ở `.artifacts/local/cinelove/hieu-ung/{reference,local}/`. Thư mục này bị Git ignore, chỉ có trên máy chạy khảo sát. Không lưu mật khẩu/cookie/token trong hồ sơ hay Git.

## 2. Kiểm kê hai bên

| ID  | Chức năng            | Source trước triển khai          | Bằng chứng source / điểm triển khai                   | Cinelove                                 | Xử lý                           |
| --- | -------------------- | -------------------------------- | ----------------------------------------------------- | ---------------------------------------- | ------------------------------- |
| F01 | Chọn nhóm/quay lại   | Một panel chung                  | `editor/effects-panel.tsx`                            | 3 thẻ → panel con                        | Thay UI                         |
| F02 | 7 preset toàn trang  | Có, áp dụng ngay; Mix theo index | `editor/effect-presets.ts`                            | Chọn thử, reset, modal preview, Apply    | Đồng bộ transaction và thông số |
| F03 | Phong bì có cấu hình | Chỉ boolean và màn đơn giản      | `document/effects.ts`, `renderer/opening-effects.tsx` | 3 kiểu; tên, tiêu đề, font, nút, preview | Bổ sung theo phạm vi đã duyệt   |
| F04 | Thiệp mở đầu         | Chưa có                          | Như F03                                               | 12 theme, nội dung, tên khách, 7 màu     | Bổ sung                         |
| F05 | Intro Page           | Chưa có                          | Như F03                                               | 2 kiểu, 2 ảnh                            | Bổ sung                         |
| F06 | Curtain              | Chưa có                          | Như F03                                               | 5 màu                                    | Bổ sung                         |
| F07 | Cửa trượt            | Chưa có                          | Như F03                                               | Auto/tap, texture/ảnh, dấu sáp           | Bổ sung                         |
| F08 | Animated Image       | Chưa có                          | Như F03                                               | Tiêu đề/phụ đề, 1–10s, GIF/ảnh riêng     | Bổ sung                         |
| F09 | Photobooth           | Chưa có                          | Như F03                                               | Khung, 3 ảnh, tên/font/màu/nút/footer    | Bổ sung                         |
| F10 | Hiệu ứng rơi         | None/petals/hearts               | `renderer/falling-effects.tsx`                        | Switch, 7 kiểu, phản hồi trực tiếp       | Mở rộng, giữ đọc giá trị cũ     |
| F11 | Asset/lưu/xuất bản   | Có cho dữ liệu cũ                | Web/API `editor-document.ts`                          | Không xuất bản trên tham chiếu           | Bổ sung kiểm kê ảnh cấu hình    |

Không thay đổi chức năng riêng ngoài phạm vi Hiệu ứng. Các mục mới được triển khai theo việc người dùng chấp thuận phạm vi đầy đủ, không dựa riêng vào việc panel đã tồn tại.

## 3. Hành vi đã quan sát

| ID  | Điều kiện/thao tác                                     | Kết quả thực tế                                                        | Bằng chứng                                                        | Trạng thái tham chiếu                |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| R01 | Mở Hiệu ứng trên bản trắng                             | 3 thẻ, mô tả và chevron; panel con có nút quay lại                     | `reference/cinelove-effects-{default,motion,opening,falling}.png` | Đã xác minh                          |
| R02 | Chọn preset                                            | Viền chọn, nút reset và Apply; chưa tự Apply; có preview vùng cuộn     | `reference/cinelove-effects-motion-preview.png`                   | Đã xác minh                          |
| R03 | Đổi vị trí phần tử sang phải rồi thử Mix               | Slide Up Mix: slide-up → slide-left; Fade In Mix: fade-in → slide-left | Ghi DOM `data-transition-key` trong khảo sát                      | Đã xác minh tâm/phải; chưa đo ngưỡng |
| R04 | Mở từng mẫu mở màn, Hủy                                | Mở được cả 7 modal dù tài khoản FREE và có vương miện                  | `reference/cinelove-effects-opening-{envelope,1,2,3,4,5,6}.png`   | Đã xác minh                          |
| R05 | Xác nhận phong bì                                      | Toast thành công, dấu chọn và nút Xóa hiệu ứng; xóa bỏ lựa chọn        | `reference/cinelove-effects-opening-applied.png`                  | Đã xác minh                          |
| R06 | Preview toàn trang sau áp dụng phong bì                | Không thấy phong bì trong nhánh preview này                            | `reference/cinelove-effects-full-preview.png`                     | Runtime mở màn chưa xác minh         |
| R07 | Bật rơi, chọn từng kiểu                                | Tuyết/Trái tim/Hoa/Sao/Confetti/Bướm/Mix; hiện ngay trong editor       | `reference/cinelove-effects-falling-{enabled,mix}.png`            | Đã xác minh                          |
| R08 | Mở Cửa trượt → Ảnh cửa                                 | 4 bộ ảnh, đổi cánh trái/phải, dấu sáp; texture có 6 lựa chọn           | `reference/cinelove-effects-door-image.png`                       | Đã xác minh UI                       |
| R09 | Mở nhóm Màu sắc của thiệp mở đầu                       | Nền chính, chữ, nền/chữ nút, ba màu gradient phía sau                  | `reference/invitation-colors.png`                                 | Đã xác minh UI/màu mặc định 12 theme |
| R10 | Lưu server, reload, undo/redo, khách xem trên Cinelove | Không thử xuất bản hoặc tác động dữ liệu có sẵn                        | Không có                                                          | Chưa xác minh                        |

## 4. Thông số giao diện và dữ liệu

- Shelf mục Hiệu ứng desktop: rail 84px + shelf 294px; grid preset/mở màn 2 cột, grid rơi 3 cột. Các shelf khác giữ cấu trúc hiện có.
- Modal phong bì khoảng 800px; form trái và preview phải. Mobile xếp một cột, phần thân cuộn; Escape/đóng/Hủy không commit cấu hình. Dùng native dialog và popover có focus/return focus của repo.
- Preset: None 0s; Fade In All 1.6s; Slide Up All 1.5s; Scale In All 1.2s; Flip In All 1.6s; Slide Up Mix 1.3s; Fade In Mix 1.5s + delay 0.2s. Các trường hợp đo được dùng ease-out, không lặp.
- Animated Image: duration mặc định 5s, min 1, max 10; phụ đề tối đa 60 ký tự.
- Phong bì: Classic/Beige/Đỏ; tên tự ghép bằng `&`; monogram lấy ký tự đầu của từ cuối trong từng tên. Font Aquarelle được lưu local; đổi font dùng catalog đang có.
- Thiệp mở đầu: đủ 12 nhãn; màu mặc định từng theme đọc từ DOM. `INVITATION_COLORS` lưu 7 màu/theme; người dùng chỉnh riêng từng màu.
- Cửa trượt: màu mặc định #2A4A3C, 8 swatch, 6 texture; dấu sáp có thể đổi hoặc bỏ. Thời lượng preview đo được 3000ms.
- Photobooth: nền mặc định #4A1218; frame gốc được lưu local; vị trí/khung strip tái dựng từ UI.
- Rơi: 12 hạt; fall 10s linear và sway 3s ease-in-out, vô hạn; delay khác nhau. Các emoji và Mix dùng nội dung đúng tham chiếu. Phân bố đầy đủ/delay từng hạt được tái dựng, không coi là đã đo toàn bộ.
- Bộ asset: hình, GIF, video thumbnail, texture và font trong `apps/web/public/effects`; `manifest.json` ghi URL công khai, đường dẫn, kích thước và SHA-256. Poster thiếu được trích frame từ video local. Không gọi Cinelove lúc ứng dụng chạy.

## 5. Tiêu chí nghiệm thu

| ID   | Điều kiện + thao tác                          | Kết quả mong đợi                                                             | Kết quả / bằng chứng                                                                                        |
| ---- | --------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| AC01 | Mở panel, vào từng nhóm, quay lại             | Đủ 3 nhóm; không còn UI effects cũ chạy song song                            | Đạt — browser và `local/home.png`                                                                           |
| AC02 | Chọn preset, preview, đóng                    | Không ghi document trước Apply                                               | Đạt — unit transaction/UI                                                                                   |
| AC03 | Apply, undo, redo, thêm node mới              | 1 undo step; giữ options khác; node mới không tự kế thừa                     | Đạt — unit và browser                                                                                       |
| AC04 | Mở 7 cấu hình, đổi dữ liệu, Hủy/Xác nhận      | Hủy không ghi; xác nhận lưu cấu hình hợp lệ                                  | Đạt — unit, `local/config-*.png`                                                                            |
| AC05 | Lưu API thật và reload cả 7 mẫu               | Giữ đúng loại/cấu hình; preview mở và kết thúc                               | Đạt — `local/result.json`, `local/runtime-*.png`                                                            |
| AC06 | Chọn ảnh riêng, đổi font, lưu/reload          | Ảnh decode được, ID có trong asset inventory                                 | Đạt — `local/asset-public-result.json`                                                                      |
| AC07 | Mobile 390 × 844 mở cấu hình                  | Cuộn được, không overflow ngang                                              | Đạt — browser và `local/mobile-photobooth.png`                                                              |
| AC08 | Bật rơi, chọn đủ 7 kiểu                       | Đổi ngay trong editor; save giữ lựa chọn                                     | Đạt — browser `local/falling-mix.png`                                                                       |
| AC09 | Xuất bản mẫu chứa ảnh mở màn thật             | Publication worker hoàn tất                                                  | Đạt — `local/asset-public-result.json`                                                                      |
| AC10 | Trang khách anonymous, cuộn, giảm chuyển động | Ảnh mở màn hợp lệ; mở xong giải phóng overlay; rơi bám viewport; giảm motion | Đạt — `local/public-result.json`, `local/public-photobooth-mobile.png`, `local/public-falling-scrolled.png` |
| AC11 | Đối chiếu mọi frame/runtime với Cinelove      | Timing/trigger/ảnh/màu khớp đầy đủ                                           | Chưa kiểm tra — runtime tham chiếu chưa xác minh                                                            |

## 6. Thực hiện và tương thích

- `EffectsPanel` thay nhánh UI cũ trong `EditorSettingsPanel`; màn chọn nhóm, preview và cấu hình độc lập với form cài đặt chung.
- Lựa chọn preset là state tạm; Apply materialize entrance/duration/delay/easing vào nodeOptions bằng một replace command, rồi đặt fallback pageAnimation thành none. Undo/redo dùng history hiện có.
- `settings.openingEffect` là union tùy loại, optional để đọc dữ liệu cũ; null tắt rõ ràng, undefined mới fallback vào `envelope`. Không để hai màn mở đầu xuất hiện đồng thời.
- Mở rộng enum particles, vẫn đọc `petals/hearts/none`. Schema/validator/resolver frontend và API đồng bộ; không cần migration database vì document JSON có trường optional.
- `openingAssetIds` đưa ảnh cấu hình vào cả `documentAssetIds` và `visibleAssetIds`, sử dụng quyền asset và index xuất bản hiện có. `visibleSceneAssetIds` cũng thu thập ảnh mở màn để API khách cấp đúng URL và quyền byte delivery. SQL redaction hiện có xử lý khóa `assetId` đệ quy; không thêm dịch vụ lưu ảnh riêng.
- Preview và public dùng cùng `OpeningArtwork`/`OpeningPlayer`. Capture bỏ opening/particles để thumbnail và đo nội dung giữ ổn định. Lớp rơi public portal ra body, tránh bị transform của canvas làm mất khi cuộn.
- Native dialog xử lý focus/Escape/return focus; chọn ảnh dùng library hiện có; font dùng catalog và property popover; color dùng ColorField. Có phím mũi tên cho radiogroup và hỗ trợ reduced motion, pause/resume timer.
- Skill áp dụng: `ui-ux-pro-max`; đọc hướng dẫn repo, web và tài liệu Next `use client`. Bố cục tham chiếu là chuẩn; không thay bằng thiết kế tự chọn.

## 7. Chức năng thiếu và quyết định

Các chức năng thiếu trong source ban đầu (F03–F09 và các kiểu rơi bổ sung) đã được người dùng giao tích hợp trong kế hoạch được duyệt. Đã triển khai UI/state/schema/API asset inventory/renderer cho các mục này. Không thêm UI khóa gói hoặc mua gói theo quyết định “Mở toàn bộ”.

## 8. Kiểm tra và giới hạn

- Đã chạy toàn bộ test frontend: 653 test/68 file; backend unit: 107 test/18 file. Bao gồm các test bàn phím, reduced motion, portal viewport và quyền cấp ảnh mở màn công khai.
- Đã qua typecheck/lint của hai ứng dụng và build frontend/backend; build frontend dùng output/tsconfig tạm để không tranh `.next` với dev server.
- Browser thật: các modal, Save API, reload, undo/redo, runtime cả bảy mẫu; upload ảnh riêng, font popover, mobile và publication mẫu. Unit dùng JSDOM chỉ chứng minh state/semantics, không thay thế kiểm tra focus native/browser.
- Các giá trị suy luận có chủ ý: Mix chia ba vùng theo tâm phần tử, ngưỡng 1/3 và 2/3; vùng trái trượt phải. Chỉ hành vi vùng giữa/phải đã quan sát trực tiếp.
- Runtime tái dựng: Intro/Curtain/Animated tự chạy; Door theo auto/tap; Envelope/Invitation/Photobooth chạm mở. Dwell Intro/Curtain/Door-auto 1s; reveal Door 3s, Envelope 1.4s, phần còn lại 1s; Animated dwell theo cấu hình. Các số chưa đo được là mặc định triển khai.
- Các theme dùng cùng art family với màu riêng; bố trí từng lớp trang trí, motion Photobooth/Intro/rèm/phong bì được tái dựng, chưa chứng minh trùng từng frame với Cinelove. Không kết luận 90% hay 100% từ việc đủ số nút.
- Backend cần được triển khai trước frontend mới để nhận trường optional/enum mở rộng. Client cũ có validator chặt cần reload bản mới khi đọc document đã lưu trường mới.

## 9. Bàn giao

- Đã triển khai đủ ba nhóm, bảy preset động, bảy mở màn và bảy kiểu rơi; dữ liệu cũ tiếp tục đọc được.
- Bằng chứng và script browser chỉ ở local; hồ sơ này và asset manifest là phần có thể đưa vào Git.
- Chưa có bằng chứng để tuyên bố toàn bộ animation giống 100%; AC11 còn mở theo giới hạn đã thống nhất.

### Kết quả cuối ngày 15/10/2026

- Frontend: toàn bộ 653 test/68 file đạt; sau chỉnh nhóm màu thành accordion, chạy lại 27 test effects đạt. Typecheck/lint đạt; production build đạt.
- Backend: toàn bộ 107 unit test/18 file đạt, typecheck/lint/build đạt.
- Browser native Chrome: API save/reload và kết thúc runtime cả 7 mở màn đạt, ảnh riêng và font picker đạt, mobile không overflow ngang, publication mẫu thật đạt.
- Anonymous public: ảnh riêng mở màn decode được; manual open kết thúc; republish thật thành công; particles nằm ở viewport khi cuộn; reduced motion tắt particles và mở màn không chờ animation. `local/public-result.json` ghi không có page error.
- Phát hiện và sửa trong nghiệm thu: public asset allowlist trước đó bỏ sót ảnh cấu hình mở màn. Đã bổ sung `openingAssetIds` vào `visibleSceneAssetIds`, kiểm thử ID chỉ được cấp khi còn nằm trong scene đã commit.
- Asset manifest: 87 entry, đã kiểm lại SHA-256, không có entry thiếu/sai. Chỉ local asset được dùng trong runtime.
- `git diff --check` đạt. Các thay đổi có sẵn trong workspace ngoài phạm vi được giữ nguyên.
