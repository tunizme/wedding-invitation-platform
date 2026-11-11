# Đối chiếu Cinelove: preview có thiệp mở đầu

## 1. Phạm vi

- Yêu cầu: khảo sát cách hiển thị preview có thiệp mở đầu theo mẫu https://cinelove.me/template/thiep-cuoi-44.
- Ngày khảo sát: 2026-10-16. Trang mẫu truy cập công khai, không cần đăng nhập.
- Điều kiện: Chromium, desktop 1440 × 1000 và mobile 390 × 844, zoom mặc định.
- Sau khảo sát, người dùng giao “giúp tôi sửa preview”. Đã sửa bố cục preview và vòng đời khóa/mở cuộn của hiệu ứng hiện có. Không thêm phong bì chứa ảnh hoặc QR chia sẻ.
- Bằng chứng chỉ lưu local tại `.artifacts/local/cinelove/preview-opening/reference/`; script khảo sát `../survey.cjs`. Không lưu thông tin đăng nhập.

## 2. Kiểm kê hai bên

| ID | Chức năng | Source | Bằng chứng source | Cinelove | Quyết định |
| --- | --- | --- | --- | --- | --- |
| F01 | Căn thiệp dọc giữa nền preview | Có | `invitation-editor.tsx`: nhánh preview; `public-invitation-view.tsx`: ScaledInvitationView | Khung giữa desktop | Có thể đối chiếu bố cục |
| F02 | Thu nhỏ theo chiều rộng mobile | Có | ScaledInvitationView, ResizeObserver, scale theo canvas.width | Mobile rộng 390px, không cuộn ngang | Có thể đối chiếu responsive |
| F03 | Mở thiệp bằng thao tác bấm | Có, cách thể hiện khác | OpeningPlayer, InvitationPresentation | Bấm phong bì, hiện ảnh bên trong | Tách phần hành vi chung và animation còn thiếu |
| F04 | Khóa cuộn trước khi mở, cuộn bên trong khung sau khi mở | Có một phần | Nội dung inert/aria-hidden khi chưa mở; ScaledInvitationView vẫn giữ chiều cao toàn canvas | Scroller đổi từ hidden sang hidden auto | Cần đồng bộ bố cục và trạng thái cuộn hiện có |
| F05 | Phong bì nằm trong bố cục, mở nắp và đưa ảnh lên, giữ lại sau khi mở | Chưa thấy hỗ trợ trong luồng mở màn | OpeningArtwork không có ảnh bên trong phong bì; CSS envelope scale/fade rồi OpeningPlayer bị unmount | `desktop-opened.png` | Báo thiếu, không tự thêm vào schema |
| F06 | QR nổi trên preview desktop | Chưa thấy ở preview hiện tại | Nhánh preview editor và TemplateDemo không có QR | Góc dưới phải, ngoài khung thiệp | Báo thiếu |
| F07 | Quay lại chỉnh sửa/chọn mẫu | Có | PreviewExit, toolbar TemplateDemo | Nút “Chỉnh sửa mẫu này” phía trên trái | Giữ hành động riêng của local, đối chiếu vị trí nếu triển khai |

## 3. Hành vi đã quan sát

| ID | Điều kiện / thao tác | Kết quả trực tiếp | Bằng chứng |
| --- | --- | --- | --- |
| R01 | Mở URL trên desktop | Thiệp giữa nền xám; phong bì đóng, thấy một phần lời mời phía dưới; container overflow hidden | desktop-initial.png, survey.json |
| R02 | Đưa chuột lên phong bì | Thiệp vẫn hiển thị; chưa mở | desktop-hover.png |
| R03 | Bấm giữa phong bì | Có chuyển cảnh mở phong bì; ảnh cặp đôi nhô lên; phong bì vẫn nằm trong bố cục sau 3 giây | desktop-opening.png, desktop-opened.png |
| R04 | Cuộn sau khi mở | Container overflow hidden auto, scrollTop tăng 0 → 720; trang ngoài vẫn cao 1000px | desktop-scrolled.png, survey.json |
| R05 | Tải lại | Trở lại trạng thái phong bì đóng | survey.json, lần tải lại trước mobile |
| R06 | Mở trên mobile | Thiệp phủ chiều rộng 390px; không có nền xám hai bên, không có QR desktop | mobile-initial.png |
| R07 | Bấm phong bì trên mobile | Đã bấm và chụp trạng thái sau mở; chưa đo chi tiết timeline | mobile-opened.png |

## 4. Thông số giao diện và dữ liệu

| Thuộc tính | Source | Cinelove đã quan sát |
| --- | --- | --- |
| Chiều rộng desktop | Editor mặc định previewWidth=390; lựa chọn 320/375/390/500 | Vùng canvas đo 495px, x=473.5 tại viewport 1440 |
| Chiều cao desktop | Theo chiều cao toàn bộ scene nhân scale | Vùng cuộn clientHeight=898px, bắt đầu y=51; khung nhìn khoảng 900px |
| Cuộn desktop | Vùng preview/editor cuộn canvas dài | Nội dung 8529px cuộn trong khung; trang ngoài không dài theo canvas |
| Mobile | Scale canvas 500 theo host | Viewport/pageWidth đều 390px; thiệp sát hai mép |
| Mở màn | Envelope fade/scale, thời lượng cấu hình trong renderer 1400ms | Mở nắp/đưa ảnh lên; chưa đo chính xác duration/easing |
| Trang demo kho mẫu | TemplateDemo có lời mời riêng trước TemplatePreview | URL mẫu hiển thị trực tiếp thiết kế với phong bì đóng |

## 5. Tiêu chí nghiệm thu dự kiến

| ID | Thao tác | Mong đợi | Kết quả local |
| --- | --- | --- | --- |
| AC01 | Xem preview desktop | Khung dọc căn giữa nền xám; chiều rộng gần canvas 500px, chiều cao theo viewport với khoảng trống trên/dưới tương ứng tham chiếu | Đạt: khung 500 × 900 tại x=470, y=50 trong viewport 1440 × 1000 |
| AC02 | Chưa mở và hover | Thiệp mở đầu vẫn hiển thị; chưa cho cuộn tới phần nội dung bị khóa | Đạt: nền hit area trong suốt, wheel giữ scrollTop=0 |
| AC03 | Bấm mở | Chạy hiệu ứng đã chọn; mở khóa cuộn trong khung, không thay đổi vị trí khung | Đạt: envelope hiện có hoàn tất và bỏ inert, mở overflowY auto |
| AC04 | Cuộn sau mở desktop | Trang ngoài giữ kích thước viewport; chỉ nội dung bên trong khung thiệp cuộn | Đạt: scrollTop bên trong tăng, window.scrollY=0 |
| AC05 | Xem mobile | Thiệp vừa chiều rộng viewport, không tràn ngang; hành động mở dùng được bằng tap | Đạt: khung 390 × 844 tại x=0, y=0; opening phủ đủ khung sau scale; bấm mở hoàn tất |
| AC06 | Tải lại / mở lại preview | Phát lại trạng thái mở đầu; giữ dữ liệu thiết kế | Đạt với đóng/mở lại bản nháp mock; chưa kiểm tra reload qua API thật |

AC03 chỉ bao gồm hiệu ứng hiện có; animation phong bì chứa ảnh là phần thiếu M01, không tự coi đã được hỗ trợ.

## 6. Kế hoạch sửa chức năng hiện có

- Bố cục: nhánh preview trong `invitation-editor.tsx`, `authoring-workspace.module.css`, `invitation-editor.module.css`.
- Khung responsive: `features/invitations/public-invitation-view.tsx`, tránh dùng chiều cao toàn canvas cho viewport preview desktop.
- Trạng thái mở/khóa cuộn: `renderer/invitation-presentation.tsx`, phối hợp với preview host; giữ tương thích `openingEffect` và `envelope` cũ.
- Phân biệt preview editor với TemplateDemo và trang public trước khi áp dụng thay đổi; không thay cơ chế phân quyền hoặc chức năng RSVP.
- Khi triển khai tiếp áp dụng skill ui-ux-pro-max đã đọc trong phiên, giữ giao diện tham chiếu và hỗ trợ focus/reduced motion.

## 7. Cinelove có nhưng source còn thiếu

| ID | Phần thiếu | Đề xuất | Trạng thái |
| --- | --- | --- | --- |
| M01 | Phong bì trong canvas chứa ảnh, mở nắp và giữ lại trong scene | Xác định là widget/element độc lập hay mở rộng hiệu ứng; cần ảnh/asset reference, cấu hình, validation, renderer và tương thích tài liệu cũ | Chưa triển khai; cần chốt phần mở rộng này |
| M02 | QR nổi tại preview desktop | Thành phần preview tạo QR từ URL có thể truy cập trên điện thoại; không dùng URL localhost hoặc bản nháp chỉ có trong memory làm QR giả | Chưa triển khai; cần xác định URL preview chia sẻ thật |

## 8. Kết quả kiểm tra

- Đã khảo sát bằng Playwright trên URL thật: mặc định, hover, bấm mở, cuộn sau mở, reload và mobile.
- Đã xem ảnh desktop trước/sau mở và mobile trước mở; số đo/cuộn nằm trong survey.json.
- Không sửa dữ liệu tài khoản tham chiếu, không bấm chỉnh sửa mẫu, không gửi RSVP/lời chúc.
- Kiểm tra local bằng `.artifacts/local/preview-layout.cjs`: editor thật, dữ liệu template/mock endpoint riêng, không sửa mẫu người dùng; screenshot tại `local/desktop-closed.png`, `desktop-open-scrolled.png`, `mobile-closed.png`. Đã xem ảnh desktop/mobile.
- Viewport desktop giữ canvas chuẩn 500px thay vì 495px đo trên tham chiếu; mobile dùng scale theo chiều rộng và bù chiều cao viewport về tọa độ canvas trước scale.
- Nút quay lại editor bằng click và Escape đều hoạt động; Escape trả focus về nút Xem trước. Bộ chọn chiều rộng preview giữ cho desktop, ẩn trên mobile.
- `pnpm typecheck:web`: đạt. ESLint các file TS/TSX và test đã sửa: đạt. `next build`: đạt. Vitest effects + template-owner với configLoader native: 42 tests đạt.
- Có test hồi quy cho inert/khóa cuộn trước khi mở, bỏ inert/mở cuộn sau khi hiệu ứng hoàn tất với reduced motion.
- Thay đổi khung chỉ áp dụng context preview; context public và capture giữ chiều cao scene và cơ chế cuộn cũ.
- Chưa xác minh: duration/easing chính xác, bàn phím, reduced motion trên Cinelove, preview nội bộ sau đăng nhập, QR đóng/mở và đích QR, dữ liệu sau lưu.

## 9. Bàn giao

- Đã xác định cách bố trí preview desktop/mobile và sự khác biệt giữa hiệu ứng mở màn hiện có với phong bì trong thiết kế mẫu 44.
- Đã triển khai bố cục preview editor toàn màn hình, mặc định 500px, nền xám, viewport cuộn riêng và mở khóa cuộn sau hiệu ứng; hỗ trợ quay lại và focus.
- Chưa triển khai M01/M02. TemplateDemo vẫn có màn lời mời riêng và luồng chọn mẫu cũ; không thay đổi phân quyền, lưu thiết kế hoặc trang public.
- Giao diện phong bì dùng tài nguyên và cấu hình hiện có của local, không tái tạo phong bì chứa ảnh của mẫu 44; không kết luận giống hoàn toàn.

## 10. Tích hợp vào source hiện tại — 2026-10-21

- Nguồn bàn giao: `/home/tunizme/Workspace/session-changes-2026-10-16`, gồm 10 file (8 file cập nhật và 2 file mới). Đã đối chiếu diff từng file trước khi tích hợp; không có xung đột nội dung với source hiện tại.
- Các kết quả khảo sát và kiểm tra trình duyệt tại mục 1–9 là thông tin bàn giao của phiên 2026-10-16, không phải kết quả chạy lại ngày 2026-10-21.
- Bộ bàn giao không kèm thư mục ảnh `.artifacts/local/cinelove/preview-opening/` hoặc script `.artifacts/local/preview-layout.cjs`; các bằng chứng này cũng không có trong workspace khi merge. Chưa xác minh lại giao diện bằng trình duyệt, trang Cinelove hoặc luồng lưu API thật trong lần merge này.
- Kiểm tra sau tích hợp: `pnpm typecheck:web` đạt; ESLint 5 file TS/TSX thay đổi đạt; Vitest `effects`, `template-owner`, `scene-preview` đạt 43/43 test; `pnpm build:web` đạt; `git diff --check` đạt.
