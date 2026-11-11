# Phương án thiệp desktop 900px

Ngày khảo sát: 2026-10-11. Tài liệu giữ phương án nghiên cứu ban đầu. Cập nhật: feature007 đã triển khai contract v2; prototype đã tích hợp shared renderer cho ba mẫu minh họa. Xem UI-DESIGN.md và specs/007-responsive-invitation-layout/contracts/document-v2.md để biết trạng thái hiện hành. MASTER.md không đổi.

## Kết quả khảo sát mã chạy trên trình duyệt

Kiểm tra DOM, class CSS và computed styles trong Chromium; đây là mã frontend được phục vụ công khai, không phải repository nội bộ của các website. Các số đo áp dụng cho mẫu cụ thể.

| Mẫu | Desktop viewport 1440px | Mobile viewport 390px | Cách bố trí quan sát được |
| --- | --- | --- | --- |
| [Một Đời – Duyên dáng 04](https://motdoi.com.vn/thiep-mau/graceful-04) | 480px | 390px | Wrapper max-width 480px; các section nối tiếp trong document flow. |
| [Chung Đôi – Minimalism Nâu](https://chungdoi.com/vi/mau-thiep/minimalism-nau/demo) | 900px sau khi mở thiệp | 390px | Wrapper `w-full max-w-[480px] md:max-w-[900px]`; khối thông tin `w-[88%] max-w-[420px] md:max-w-[560px]`. |
| [thieponline – Minimalism Nâu](https://thieponline.app/vi/mau-thiep/minimalism-nau/demo) | 900px | 390px | Cùng quy tắc chiều rộng trên; ở viewport 768px wrapper là 768px và khối thông tin 560px. |
| [Vesey – Ngày chung đôi](https://vesey.vn/api-proxy/api/templates/ngay-chung-doi/preview) | 640px | 390px | Nội dung dùng tỷ lệ 70%, 90%, 100%; section và flex. Popup nhúng iframe rộng 459px trên desktop, không phải giới hạn của nội dung thiệp. |
| [CineLove – Gia Lộc & Phương Nhung](https://cinelove.me/showcase/UJUhZU0ZJhUTa1ZT1iGc11JJ60GUOOUJG) | Khung 495px | 390px | Canvas desktop CSS width 493px, transform scale(0.95); canvas mobile CSS width 390px, không transform. |

Các class thực tế đáng tham khảo ở thieponline:

```html
<!-- Khung thiệp -->
<div class="relative w-full max-w-[480px] md:max-w-[900px] md:mx-auto ...">
<!-- Khối thông tin lễ cưới -->
<section class="relative z-10 mx-auto w-[88%] max-w-[420px] md:max-w-[560px]">
<!-- Heading thay font riêng, không phóng đại nguyên trang -->
<h2 class="text-center text-[20px] font-normal uppercase md:text-[26px]">
```

Suy ra từ DOM/CSS: khung, nội dung và typography có quy tắc riêng; không sử dụng một phép scale 390 → 900 cho toàn bộ thiệp. Trang mở phong bì là một lớp riêng, không dùng kích thước phong bì để kết luận chiều rộng thiệp.

## Ràng buộc của sản phẩm hiện tại

- `apps/ui-prototype/src/ui.tsx`, `LivePreview`: ResizeObserver giới hạn chiều rộng ở 390, sau đó scale toàn scene.
- `apps/web/src/features/invitation-builder/document/schema-definitions.ts`: canvas width là `z.literal(390)`.
- Frontend và API đều có `Canvas.width: 390`, document schemaVersion 1 và validator chặt.
- `renderer/canvas.tsx`: canvas có width/height cố định, overflow hidden; phần tử có box tuyệt đối. Chỉ đổi max-width của wrapper không tạo layout 900px.
- Backend publication, đo overflow, capture và template authoring cùng phụ thuộc document hiện tại; thay contract cần đi qua toàn bộ pipeline.
- MASTER yêu cầu shared renderer, preview khớp output đã publish, mobile ưu tiên và Customer chỉ sửa dữ liệu. Quy tắc 900px dành cho invitation template; không đổi các container/token của platform chrome.

## Hướng đề xuất

Đích dài hạn: document responsive theo section, dùng flow/grid cho nội dung và absolute positioning cho artwork trong từng section. Renderer chung hỗ trợ cả document v1 và v2; template cũ giữ nguyên đến khi Admin chuyển đổi có kiểm tra. Không suy diễn section tự động từ tọa độ y của v1.

| Không gian có sẵn cho thiệp | Hiển thị v2 |
| --- | --- |
| Dưới 768px | width 100%, max-width 480px; một cột. |
| Từ 768px | width 100%, max-width 900px; căn giữa. Với 768px thực tế vẫn chỉ rộng 768px. |
| Preview popup / Customer editor | Container mobile tối đa 390px; luôn render layout mobile dù màn hình ngoài là desktop. |
| Demo độc lập / thiệp công khai | Responsive theo container thực tế. |

Breakpoint dùng chiều rộng container, không chỉ window: popup hẹp trên màn hình lớn không được chọn layout desktop. Ưu tiên CSS container queries cho v2; dùng ResizeObserver khi renderer cần chọn một scene. Điểm breakpoint là đề xuất, cần kiểm chứng tại 767/768px.

Thông số bố cục dự kiến:

- Nền, hero và ảnh chính có thể full width trong khung 900px.
- Khối lễ cưới, lời mời, lịch: max-width 560px; đoạn kể chuyện tối đa 640px.
- RSVP: max-width 400px trên desktop; nút/input giữ kích thước sử dụng được, không scale theo toàn trang.
- Album có thể 2 cột desktop, 1 cột mobile; Admin quyết định bố cục từng mẫu.
- Typography khai báo riêng theo layout, dùng clamp khi phù hợp; spacing dùng scale trong MASTER. Đây là default authoring, không ép mọi template cùng một thiết kế.
- Section tự tăng chiều cao theo nội dung; background/artwork chỉ trang trí, không cắt tên dài hoặc form.

Ví dụ CSS cho renderer v2, mang tính minh họa:

```css
.invitation-viewport { container-type: inline-size; }
.invitation { width: 100%; max-width: 480px; margin-inline: auto; }
.invitation-info { width: 88%; max-width: 420px; margin-inline: auto; }
@container (min-width: 768px) {
  .invitation { max-width: 900px; }
  .invitation-info { max-width: 560px; }
}
```

CSS này chỉ phù hợp nội dung flow của v2; không áp dụng trực tiếp để sửa geometry tuyệt đối của v1.

## Phương án nhỏ hơn nếu cần ra mắt sớm

Bổ sung mobile scene 390px và desktop scene 900px do Admin thiết kế, dùng chung binding/data/assets và widgets. Có thể triển khai bằng desktop layout overrides cho các node với ID ổn định, schema có version mới, fallback mobile cho template chưa có desktop. Cần giới hạn thuộc tính override và kiểm tra ID/type/binding; không nhân đôi dữ liệu khách hàng.

Ưu điểm: tái sử dụng phần lớn renderer canvas và công cụ authoring. Hạn chế: hai layout cần bảo trì, chiều cao/tọa độ vẫn cố định, chưa có reflow thực sự; không nên gọi đây là cách responsive giống thieponline. Với canvas desktop cố định900, đề xuất chỉ chọn nó khi container đủ900; các kích thước nhỏ hơn dùng mobile scene, tránh thu nhỏ functional controls quá mức. Quy tắc breakpoint khác v2 flow và phải được tài liệu hóa riêng.

Đề xuất ưu tiên v2 flow nếu mục tiêu là chất lượng và mở rộng lâu dài; chỉ chọn dual-scene khi thời gian triển khai là ràng buộc chính. Không dùng scale toàn canvas lên 2,31 lần làm giải pháp production.

## Thứ tự triển khai

1. Prototype một mẫu v2 có hero, thông tin lễ cưới, album, RSVP; đặt adapter version trong renderer dùng chung. Không dựng trang demo bằng dữ liệu/binding độc lập với editor. Prototype adapter là bản thử, chưa tuyên bố tương thích API v1.
2. Chốt document v2: section IDs/order, layout presets được cho phép, style overrides theo breakpoint, bindings/assets và quy tắc chiều cao. Customer chỉ sửa invitation data; Admin quản lý thiết kế.
3. Bổ sung schema/types/validator/resolve đối xứng frontend và API; lưu/publish version mới có snapshot chứa đầy đủ layout. Giữ đọc v1 và snapshot cũ.
4. Hoàn thiện shared renderer, Admin authoring cho section và responsive layout; editor/popup dùng mobile container, demo/public dùng adaptive container.
5. Cập nhật publication measurement, capture, thumbnail và cache invalidation. Đo canonical scene ở mobile390 và desktop900; test breakpoint768 riêng. Có thể giữ thumbnail mobile nếu catalog contract yêu cầu.
6. Chuyển từng mẫu có kiểm tra thủ công; cập nhật UI-DESIGN.md và README khi implementation hoàn thành. Không đánh dấu đề xuất là chức năng đã implement.

## Tiêu chí nghiệm thu

- Tại viewport1440, demo/public v2 có khung900px thực tế, nội dung cân đối và căn giữa.
- Test360/375/390/430/767/768/900/1024/1440; không overflow ngang, không cắt nội dung/functional control.
- Cùng dữ liệu và cùng chiều rộng cho output tương đương ở demo, preview và published snapshot.
- Popup/editor vẫn mobile, không có device selector cho Customer. Chuyển breakpoint không mất state RSVP/audio/lightbox.
- Test tên dài, nhiều dòng địa chỉ, nội dung thiếu, ảnh lỗi, font/ảnh tải muộn và số lượng album khác nhau.
- Kiểm tra keyboard, text zoom200%, target/focus, prefers-reduced-motion; không chỉ dựa vào screenshot.
- Template v1 và snapshot đã publish tiếp tục render nguyên trạng.

## Phạm vi của tài liệu này

Phần phương án phía trên ghi nhận nghiên cứu ban đầu. Sau feature007, prototype đã tích hợp contract/renderer v2 hiện hành; không sửa schema production hoặc MASTER.md trong lượt tích hợp prototype. Các chi tiết mang tính đề xuất trong tài liệu này phải đối chiếu contract007 trước khi dùng.
