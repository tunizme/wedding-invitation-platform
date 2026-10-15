# Thư viện font tiếng Việt

Ngày triển khai/kiểm tra: 2026-10-14.

Đã thêm **24 font**, tổng cộng **26 family** với hai Noto cũ. Tệp WOFF2 tự phục vụ từ `/fonts/invitation-builder/`; không gọi CDN font khi người dùng thiết kế/xem thiệp.

## Bộ font mới

| Nhóm | Font |
| --- | --- |
| Không chân (9) | Be Vietnam Pro, Inter, Montserrat, Nunito, Nunito Sans, Quicksand, Raleway, Oswald, Bai Jamjuree |
| Có chân (7) | Merriweather, Lora, Cormorant Garamond, EB Garamond, Bitter, Crimson Pro, IBM Plex Serif |
| Viết tay (8) | Dancing Script, Great Vibes, Allura, Moon Dance, Style Script, Charm, Mali, Sriracha |

Giữ nguyên các tệp, ID và family `noto-sans-v1` / `noto-serif-v1`. Các ID mới có hậu tố `-v1`, ví dụ `be-vietnam-pro-v1`. Không tự đổi font trên thiết kế cũ.

## Nguồn và đóng gói

Đã kiểm tra Fontsource làm nguồn tra cứu/catalog ban đầu. Các gói chia subset được khảo sát có trường hợp thiếu combining marks khi kiểm tra độc lập; vì vậy tệp **font mới phát hành lấy từ full TTF của repository Google Fonts chính thức**, không dùng các subset bị loại. Đây là lựa chọn của lần tích hợp, không phải kết luận mọi phiên bản/subset của các font đó không hỗ trợ tiếng Việt.

- Nguồn chính thức: https://github.com/google/fonts/tree/main/ofl.
- Manifest lưu `sourceUrl`, `sourceBlobSHA`, SHA-256 nguồn TTF và SHA-256/bytes của WOFF2. Khi lấy nguồn đã kiểm tra Git blob SHA khớp byte tải về.
- Variable TTF được tạo static instance ở weight 400/700 nếu có; không tạo italic hoặc bold giả. Đặt lại tên family nội bộ thành `Invitation <Family> v1`, giữ tên hiển thị gốc ở catalog.
- Giữ OFL-1.1 và bản license đi cùng từng font trong thư mục public. Không đổi dữ liệu nguồn glyph thành tài nguyên không rõ xuất xứ.
- 81 face tổng cộng, trong đó 73 face mới; 89 tệp WOFF2, tổng byte font 6,535,448. Kích thước này là toàn bộ thư viện đóng gói, không phải lượng tải mỗi lần mở editor.
- API và web có bản catalog riêng nhưng nội dung giống nhau, có test kiểm tra đồng bộ; fontId enum/types/validation dùng catalog thay vì hardcode hai Noto.

## Kiểm tra dấu tiếng Việt trước phát hành

Báo cáo máy đọc: [font-vietnamese-audit.json](font-vietnamese-audit.json).

1. Kiểm tra đủ **134 chữ tiếng Việt có dấu, hoa/thường**, toàn bộ ASCII hiển thị và những dấu tổ hợp cần cho Unicode NFD. Mỗi face mới phải có glyph thực, không `.notdef`.
2. Dùng FontTools đọc trực tiếp tệp WOFF2 đã đóng gói; HarfBuzz chạy ngôn ngữ `vi` trên chuỗi đủ chữ và câu mẫu có tên người Việt, ở cả NFC/NFD.
3. Với mỗi face mới, so sánh glyph ID và advance/offset giữa NFC/NFD: **giống nhau** trên hai chuỗi kiểm tra. Không chỉ kiểm tra tên subset hoặc một câu ngắn.
4. Chromium tải và render cả NFC/NFD cho toàn bộ 73 face mới; CDP `CSS.getPlatformFontsForNode` xác nhận mọi glyph dùng đúng custom family, **không fallback sang font hệ thống**. Kiểm tra HTTP và SHA-256 của đủ 89 tệp qua server local.
5. Đã xem ảnh regular của toàn bộ font theo nhóm; glyph có dấu xuất hiện, không có ô vuông/ký tự thiếu trong mẫu. Ảnh và thông số local ở `.artifacts/local/font-expansion/`.

Hai Noto cũ được kiểm tra hash/cmap theo union subset và chụp mẫu; không đổi bộ subset và không áp tiêu chí mới về combining glyph riêng lẻ để loại dữ liệu cũ.

Một số tệp ứng viên bị loại trong lần khảo sát vì thiếu glyph theo bộ kiểm tra nghiêm ngặt: subset Fontsource thiếu combining marks; full TTF cụ thể của Roboto, Open Sans, Playfair Display, Patrick Hand và Manrope thiếu một số mark trong cmap. Điều này chỉ mô tả các tệp đã lấy tại thời điểm khảo sát, không kết luận về mọi release hay mọi cách normalize của family đó. Balsamiq Sans/DM Sans trong gói ban đầu thiếu một số chữ NFC tiếng Việt và không được thêm.

## Editor và vòng đời font

- Bộ chọn có tìm kiếm và nhóm Không chân / Có chân / Viết tay. Danh sách dùng font giao diện, không tải cả thư viện chỉ để vẽ tên lựa chọn.
- Chọn font/đậm/nghiêng chờ face cần dùng tải xong rồi mới áp dụng và đo text, tránh đo bằng font thay thế.
- Đổi sang font không hỗ trợ kiểu đang dùng sẽ về kiểu thực sự có. Nút đậm/nghiêng disabled theo face tương ứng; API/web từ chối tổ hợp chưa đóng gói với `FONT_STYLE_UNAVAILABLE`.
- Font lỗi không ghi đè lựa chọn trước; hiện thông báo lỗi. Kết quả tải muộn sau khi đổi đối tượng không áp vào đối tượng mới.
- CSS có thể khai báo toàn bộ font nhưng trình duyệt chỉ tải face thực sự dùng; hàm preload cũng nhận ID chỉ định, không tự preload toàn catalog. Renderer/preview/capture tiếp tục chờ font của scene bằng cơ chế readiness hiện có.
- Popup sử dụng `PropertyPopover`, Escape trả focus, có trạng thái tải và disabled; đã thử trong drawer ở 390×844.

## Kết quả kiểm thử

- `pnpm test:web`: **62 files, 606 tests passed**.
- API unit nhóm invitation-builder: **7 files, 60 tests passed**, có kiểm tra mọi tổ hợp face hợp lệ/không hợp lệ độc lập với web.
- `node --test scripts/tests/frontend-package.test.mjs`: **3 passed**, xác minh hash/bytes/tệp/license catalog và hai bản API/web.
- Typecheck web/API, lint web/API và production build web/API: **pass**. Output build riêng đã chuyển vào artifacts; tsconfig tạm đã xóa, dev server tiếp tục chạy.
- Browser `.artifacts/local/font-expansion/browser-audit.cjs`: **PASS**, 73 face mới × 2 normalization, 0 fallback, 89 sources kiểm tra.
- Browser `.artifacts/local/font-expansion/manual.mjs`: **PASS**, tìm/chọn Be Vietnam Pro, chỉ tải font mới được chọn, đổi bold sang Great Vibes về regular, lưu/tải lại qua API thật và preview, popup mobile vừa viewport. Dùng text NFD thật; dữ liệu kiểm thử được tạo riêng và dọn theo marker, không xuất bản.
- Chưa chạy toàn bộ e2e frontend-foundation trên standalone stack; test packaged-fonts đã cập nhật để kiểm tra catalog mở rộng. Kiểm tra HTTP/font thực tế ở trên chạy trên dev server.

## Chạy lại kiểm tra glyph

Cài công cụ trong venv riêng, không ảnh hưởng dependency của ứng dụng:

```bash
python3 -m venv /tmp/invitation-font-tools
/tmp/invitation-font-tools/bin/pip install 'fonttools[woff]' uharfbuzz
/tmp/invitation-font-tools/bin/python scripts/verify-invitation-fonts.py --report docs/editor/font-vietnamese-audit.json
node --test scripts/tests/frontend-package.test.mjs
```

Script audit chạy offline, không tải/font mới hoặc thay catalog. Manifest và checksum giữ phiên bản đã kiểm tra; không tự cập nhật font theo `latest` khi ứng dụng chạy.

Manual test: http://localhost:3000/admin/templates → mở editor → thêm/chọn Văn bản → Phông chữ. Font cũng dùng được trên các tiện ích có cài đặt kiểu chữ chung.
