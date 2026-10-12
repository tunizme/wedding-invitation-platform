# Tiệm làm thiệp — UI prototype

Prototype React độc lập để review giao diện theo [MASTER](../../docs/design/MASTER.md). Không gọi API, đăng nhập thật, gửi email, chạy publication worker hoặc thay đổi dữ liệu production. Bản thiết kế và contract mapping: [UI-DESIGN](../../docs/frontend/UI-DESIGN.md).

## Chạy

Từ repo root:

```bash
pnpm install
pnpm --filter @wedding/ui-prototype dev
```

Mở **http://localhost:3300**. Port được giữ cố định để tránh tự chuyển sang server khác.

```bash
pnpm --filter @wedding/ui-prototype build
pnpm --filter @wedding/ui-prototype preview
pnpm --filter @wedding/ui-prototype typecheck
pnpm --filter @wedding/ui-prototype test:browser
```

Browser tests cần Chromium của Playwright: `pnpm --filter @wedding/ui-prototype exec playwright install chromium` nếu môi trường chưa có. Test runner khởi động Vite khi cần và có thể dùng server prototype đã chạy tại port 3300.

## Review

- Bấm **Review thiết kế** ở thanh trên cùng để chọn màn hình, vai trò, trạng thái loading/empty/error/conflict.
- **Đặt lại** phục hồi fixture, xóa ảnh upload trong bộ nhớ và đưa về homepage.
- Kho mẫu/detail/editor cần Customer; quản trị cần Admin. Đây là guard mô phỏng, không phải cơ chế bảo mật.
- Mọi dữ liệu ở bộ nhớ của tab; reload phục hồi fixture. Không dùng tài khoản/mật khẩu thật.
- Luồng chính: homepage → login mô phỏng → kho mẫu → detail → dùng mẫu → editor → publish → xem thiệp → RSVP.
- Lưu bản nháp không đổi snapshot công khai. Xuất bản lại mới thay nội dung public. Bản thiết kế Customer được copy/ghim khi tạo; chỉnh Admin không đổi thiết kế của thiệp cũ.
- Ảnh upload dùng blob local, kiểm MIME/kích thước cơ bản; không mô phỏng pipeline re-encode, EXIF, storage hay toàn bộ bảo vệ phía API.
- QR ngân hàng là dữ liệu giả, **không chuyển tiền**.

## Layout v3

Header giữ logo và tên “tiệm làm thiệp”, bỏ tagline. Customer editor là form accordion một cột với tab **Chỉnh sửa / Xem trước**. Các field ngắn có hai cột trên desktop, một cột trên mobile; không có rail hoặc content sheet. Preview dùng canvas mobile390px, giữ draft và autosave khi đổi tab.

Bấm cover/tên mẫu mở popup ngay trên kho mẫu, giữ URL/filter/pagination. Popup có khung preview chữ nhật, viền mảnh, cuộn được, thông tin/tính năng, QR demo và **Dùng mẫu này / Xem demo**; đóng bằng nút, Escape hoặc backdrop và trả focus về card. Bookmark `#/template/:id` hiển thị kho mẫu với popup mở sẵn. Không còn detail page riêng.

Preview trong popup/editor chỉ có mobile; **Xem demo** mở `#/demo/:templateId`. Demo có lời mời → **Mở thiệp** → nội dung dài qua shared renderer, **Xem lại lời mời** và **Dùng mẫu này**. Dữ liệu demo và RSVP là sample preview, không gửi phản hồi thật. Demo vẫn cần Customer như catalog/detail; không thêm public API.

Tham khảo layout editor từ ảnh người dùng cung cấp và [demo của thieponline.app](https://thieponline.app/vi/mau-thiep/minimalism-nau/demo); giữ màu và giới hạn chức năng của MASTER.

QR popup encode URL demo theo origin đang chạy. Điện thoại cần truy cập được host đó; quét localhost trên điện thoại sẽ không mở máy phát triển. Không thêm QR/payment contract.

Hash routes chỉ là điều hướng prototype; route production không đổi. Khu review không phải UI của sản phẩm.

## Reuse và giới hạn

Vite import trực tiếp token, Button, Field, validator, resolver và renderer từ `apps/web`, với một bản React nhờ `resolve.dedupe`. Font invitation dùng public directory hiện có; font platform và logo được bundler đưa vào build. Không tạo design system hay renderer thứ hai.

Plugin `prototype-only-rsvp-transport` chỉ thay import transport của `PublicRsvp` trong bundle prototype bằng adapter trong bộ nhớ. Source API và source FE production không bị sửa. Browser test kiểm tra guest flow không phát sinh request external/API.

Admin prototype minh họa quản lý mẫu, metadata tên, layer selection, geometry, optional content, undo, save và publish confirmation. Engine Craft.js, drag/resize, binding editor, crop/focal và job thật giữ trong ứng dụng hiện có; đặc tả UI cho các phần đó nằm trong tài liệu thiết kế.

Feature007 đã được nối vào prototype qua shared renderer/resolver/validator production. Ba mẫu đầu là document v2 theo section: demo và guest tự thích ứng theo container (dưới768px: tối đa480px; từ768px: tối đa900px). Nội dung thông tin tối đa560px desktop, story640px, form400px; album hai cột desktop/một cột mobile. Popup và Customer preview luôn mobile tối đa390px, không có device selector.

Admin authoring v2 có preview390/900px và mô phỏng chỉnh preset nội dung, khoảng cách, số cột desktop, undo, save/publish trong bộ nhớ; không thay thế toàn bộ Admin authoring production. Mẫu thứ tư vẫn v1 canvas390px để review tương thích. Mẫu v2 được tác giả sắp xếp section tường minh, không có chuyển đổi tự động thiệp cũ. Invitation ghim document khi tạo; chỉnh catalog không đổi document đã ghim.

Không coi screenshot hoặc smoke tests là chứng nhận WCAG hay release-ready. Prototype không kiểm lại pipeline publication/storage của feature007.

## Assets

Logo gốc: `docs/branding/Gemini_Generated_Image_bdlxgbbdlxgbbdlx.png`, giữ nguyên artwork và tỷ lệ.

Ảnh minh họa được tải một lần từ Unsplash, lưu local trong `src/assets`:

- [Ảnh cưới 1](https://images.unsplash.com/photo-1519741497674-611481863552)
- [Ảnh cưới 2](https://images.unsplash.com/photo-1511285560929-80b456fea0bc)
- [Ảnh cưới 3](https://images.unsplash.com/photo-1529636798458-92182e662485)

Ảnh và tên cặp đôi là dữ liệu minh họa, không phải testimonial hoặc khách hàng thật. Khi đưa homepage lên production, cần nội dung/ảnh được duyệt. Các font giữ license trong source hiện có; Vite sao chép font invitation cùng license vào build.

Khu vực tài khoản có menu avatar và `#/overview` (Customer), sidebar dùng chung với Thiệp của tôi/Thông tin cá nhân. Mobile dùng điều hướng ngang. Overview thống kê state thiệp/RSVP hiện có, không có gói dịch vụ/usage quota. Hồ sơ lưu trong bộ nhớ của tab, cập nhật menu/sidebar sau khi lưu; reset/reload phục hồi seed. Menu hỗ trợ Escape, click ngoài, điều hướng và đăng xuất.
