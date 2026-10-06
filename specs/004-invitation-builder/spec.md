# Feature Specification: Invitation Builder

**Feature Branch**: `master` (nhánh hiện hành; không tạo nhánh mới trong bước specify)

**Feature Directory**: `specs/004-invitation-builder`

**Created**: 2026-10-01

**Status**: Draft — đã rà soát chất lượng yêu cầu, sẵn sàng cho planning

**Input**: User description: "Invitation Builder là core module với tám nhóm chức năng: Template Editor / Workarea, Element Management, Properties Panel, Asset Library, Layers, Binding System, Wedding Widgets và Template Data / Persistence. Tách InvitationTemplate, TemplateDesign và WeddingData. Customer không chỉnh canvas. Chốt một layout chuẩn, canvas cao tùy chỉnh, RSVP công khai hoạt động thật; customer tự tạo thiệp và admin có thể tạo hộ customer."

## Clarifications

### Session 2026-10-01

- Q: Khi customer không nhập dữ liệu cho phần tùy chọn như thông tin ngân hàng, cha mẹ hoặc story, thiệp nên hiển thị thế nào? → A: Admin đánh dấu element/widget tùy chọn; thiếu dữ liệu và không có fallback thì ẩn phần đó, giữ nguyên khoảng trống. Phần bắt buộc thiếu dữ liệu vẫn chặn publish.
- Q: Customer có cần đóng nhận RSVP mà vẫn giữ thiệp công khai để khách xem không? → A: Customer và Admin hỗ trợ được đóng/mở nhận RSVP ngay, không cần publish lại. Thiệp vẫn công khai, widget báo đã đóng và phản hồi cũ được giữ nguyên.
- Q: URL công khai của thiệp trong MVP nên do hệ thống tạo hay cho customer tự đặt tên đường dẫn? → A: Hệ thống tạo đường dẫn duy nhất và cố định; Customer và Admin không được đặt hoặc đổi đường dẫn, kể cả sau khi publish lại.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin thiết kế và lưu mẫu thiệp (Priority: P1)

Là Admin, tôi muốn tạo một mẫu thiệp có bố cục, hình ảnh và nội dung mẫu, lưu lại rồi mở tiếp để xây thư viện mẫu tái sử dụng.

**Why this priority**: Đây là hành trình tạo tài sản thiết kế nền tảng; có giá trị độc lập ngay cả khi chưa xuất bản thiệp customer.

**Independent Test**: Admin tạo thiết kế gồm Text, Image, Decoration và Shape, chỉnh thuộc tính/layer, lưu, đóng và mở lại; thiết kế và metadata được giữ nguyên.

**Acceptance Scenarios**:

1. **Given** Admin đã đăng nhập, **When** tạo mẫu mới, **Then** có workarea với chiều rộng chuẩn, chiều cao tùy chỉnh và có thể đặt tên mẫu.
2. **Given** một thiết kế, **When** thêm, chọn, kéo, resize, rotate, duplicate hoặc delete element, **Then** canvas, properties và layers cùng phản ánh kết quả; một gesture liên tục tương ứng một bước undo và redo phục hồi kết quả đó.
3. **Given** element được chọn, **When** chỉnh các thuộc tính phù hợp loại element, **Then** preview phản ánh giá trị mới; giá trị không hợp lệ được báo tại thuộc tính và không làm hỏng thiết kế.
4. **Given** nhiều layer, **When** rename, reorder, bring forward/backward/front/back, lock/unlock hoặc hide/show, **Then** thứ tự và trạng thái nhất quán; layer bị ẩn vẫn quản lý được trong danh sách, layer bị khóa không bị biến đổi ngoài thao tác unlock.
5. **Given** thiết kế đã lưu, **When** mở lại hoặc duplicate template, **Then** nội dung thiết kế được bảo toàn; bản duplicate có danh tính riêng, trạng thái draft và không thay đổi mẫu gốc.
6. **Given** thay đổi chưa lưu, **When** lưu thất bại, rời trang hoặc lưu từ một tab có revision cũ, **Then** hệ thống báo rõ trạng thái, giữ thay đổi tại tab còn mở và không âm thầm ghi đè dữ liệu mới hơn.

### User Story 2 - Admin gắn dữ liệu và kiểm tra widget (Priority: P1)

Là Admin, tôi muốn liên kết mẫu với các trường dữ liệu đám cưới và xem nhiều bộ dữ liệu mẫu để bảo đảm một thiết kế dùng được cho nhiều customer.

**Why this priority**: Binding là điều kiện để customer nhập dữ liệu bằng form mà không cần chỉnh canvas.

**Independent Test**: Trên một thiết kế đã lưu, đổi giữa hai bộ dữ liệu mẫu có tên, ảnh, ngày giờ và địa điểm khác nhau; nội dung hiển thị đổi đúng nhưng thiết kế lưu không đổi.

**Acceptance Scenarios**:

1. **Given** Text hoặc Image, **When** chọn binding hợp lệ và fallback, **Then** preview lấy dữ liệu đúng kiểu; trường thiếu dùng fallback, trường sai kiểu được báo thay vì chuyển thành nội dung không xác định.
2. **Given** Calendar, Countdown, Map, QR Bank, Timeline hoặc RSVP, **When** chỉnh cấu hình riêng của widget, **Then** renderer và property editor hỗ trợ đúng loại; Map lấy venue, Calendar/Countdown lấy ngày giờ sự kiện, QR Bank lấy thông tin tài khoản và RSVP lấy invitation hiện tại khi chạy thực tế.
3. **Given** sample data có tên dài, story nhiều dòng hoặc thiếu ảnh, **When** preview, **Then** thấy nội dung wrap/fallback cùng cảnh báo phần vượt khung; hệ thống không tự đổi tọa độ hoặc âm thầm cắt nội dung để làm preview có vẻ hợp lệ.
4. **Given** workarea có thiết kế đã lưu, **When** zoom, fit-to-screen hoặc đổi preview mobile/desktop, **Then** tọa độ chuẩn và dữ liệu lưu không đổi; preview và thiệp công khai sử dụng cùng quy tắc hiển thị.
5. **Given** một mẫu có RSVP, **When** Admin thử preview bằng sample data, **Then** widget hiển thị trạng thái mô phỏng, không tạo phản hồi thật.
6. **Given** Admin đánh dấu một element/widget là tùy chọn, **When** thiếu dữ liệu cần để hiển thị và không có fallback, **Then** preview/public ẩn toàn bộ element/widget đó nhưng giữ nguyên khoảng trống và tọa độ các element khác; dữ liệu hợp lệ được bổ sung làm phần đó xuất hiện lại nếu không bị Admin hide thủ công. Phần bắt buộc thiếu dữ liệu vẫn chặn publish; dữ liệu sai kiểu không được coi là dữ liệu thiếu.

### User Story 3 - Admin quản lý asset và xuất bản template (Priority: P1)

Là Admin, tôi muốn quản lý tài nguyên và xuất bản một phiên bản mẫu ổn định để customer có thể chọn sử dụng.

**Why this priority**: Việc tái sử dụng mẫu cần phiên bản ổn định và tài nguyên không bị mất sau khi phát hành.

**Independent Test**: Upload asset, dùng trong mẫu, publish, chỉnh draft rồi unpublish mẫu; published revision cũ vẫn nguyên vẹn và không còn được chọn để tạo thiệp mới.

**Acceptance Scenarios**:

1. **Given** Admin mở thư viện, **When** upload ảnh/trang trí, search/filter hoặc mở My uploads, **Then** tìm và chèn được asset phù hợp; upload lỗi không tạo tham chiếu có vẻ sử dụng được.
2. **Given** template draft hợp lệ, **When** publish, **Then** tạo published revision bất biến kèm thumbnail và metadata; customer có thể chọn phiên bản đó.
3. **Given** template có published revision, **When** sửa và lưu draft, **Then** published revision vẫn giữ nguyên cho tới lần publish tiếp theo.
4. **Given** template đang được thiệp sử dụng, **When** publish revision mới hoặc unpublish template, **Then** thiệp đã ghim revision cũ không đổi; template bị unpublish không thể được chọn cho thiệp mới.
5. **Given** asset được thiết kế đã lưu hoặc phiên bản đã phát hành tham chiếu, **When** yêu cầu xóa, **Then** bị chặn và có lý do; asset chưa được tham chiếu có thể bị chủ sở hữu xóa.
6. **Given** thiết kế có loại element không hỗ trợ, binding sai kiểu, asset không truy cập được hoặc nội dung mẫu vượt khung, **When** publish, **Then** bị chặn với lỗi chỉ rõ phần cần sửa; bản public hiện tại không bị ảnh hưởng.

### User Story 4 - Customer tạo và xuất bản thiệp của mình (Priority: P1)

Là Customer, tôi muốn chọn mẫu, nhập thông tin đám cưới qua form và chia sẻ URL thiệp mà không phải học công cụ thiết kế.

**Why this priority**: Đây là kết quả sử dụng trực tiếp của core module và là điều kiện để nhận RSVP thật.

**Independent Test**: Với một mẫu đã publish, Customer tạo thiệp, nhập dữ liệu, preview, publish và mở URL không đăng nhập; sau đó sửa draft và xác nhận trang công khai chỉ đổi khi publish lại.

**Acceptance Scenarios**:

1. **Given** Customer đã đăng nhập, **When** chọn một mẫu đang khả dụng và tạo thiệp, **Then** thiệp thuộc customer đó, ghim published design revision được chọn và cung cấp form dữ liệu phù hợp binding.
2. **Given** thiệp draft, **When** Customer nhập tên, ngày giờ, venue, gia đình, story, timeline, ảnh và thông tin QR Bank được mẫu sử dụng, **Then** dữ liệu nằm trong WeddingData; Customer không được sửa layout/style/binding hoặc mở editor quản trị.
3. **Given** dữ liệu hợp lệ, **When** preview mobile/desktop rồi publish, **Then** URL công khai hiển thị đúng dữ liệu và thiết kế đã duyệt, theo một layout chuẩn được co giãn phù hợp chiều rộng màn hình.
4. **Given** thiệp đang công khai, **When** lưu thay đổi dữ liệu vào draft, **Then** trang công khai giữ nguyên; publish lại cập nhật toàn bộ bản phát hành tại cùng URL, không hiển thị trạng thái dở dang.
5. **Given** thiệp đang công khai, **When** owner unpublish, **Then** URL không còn cung cấp nội dung thiệp hoặc nhận RSVP mới; dữ liệu và phản hồi cũ vẫn còn trong khu vực owner.
6. **Given** Customer khác hoặc Guest, **When** truy cập draft, dữ liệu quản trị, asset riêng hoặc thao tác sửa thiệp không thuộc mình, **Then** bị từ chối; dữ liệu owner do người gọi tự khai không cấp thêm quyền.
7. **Given** dữ liệu thật gây overflow hoặc thiếu dữ liệu bắt buộc, **When** Customer publish, **Then** thấy trường cần sửa; thiết kế không tự tăng chiều cao và phiên bản công khai cũ được giữ nguyên.
8. **Given** thiệp được publish lần đầu, **When** hệ thống cấp URL công khai, **Then** đường dẫn do hệ thống tạo là duy nhất cho thiệp đó và không có thao tác Customer/Admin tự đặt hoặc đổi đường dẫn; sửa tên cặp đôi, publish lại hoặc unpublish rồi publish lại đều giữ URL ban đầu.

### User Story 5 - Admin tạo thiệp hộ Customer (Priority: P2)

Là Admin, tôi muốn chọn một Customer hiện hữu, tạo và xuất bản thiệp hộ họ để hỗ trợ vận hành mà không đăng nhập bằng tài khoản của họ.

**Why this priority**: Hỗ trợ customer sử dụng cùng quy trình, không cần cơ chế giả danh hoặc quyền quản trị ngầm định.

**Independent Test**: Admin tạo thiệp cho Customer A, nhập dữ liệu và publish; A thấy và quản lý được thiệp, Customer B bị từ chối, lịch sử ghi đúng Admin đã thao tác.

**Acceptance Scenarios**:

1. **Given** Admin chọn một Customer đang hoạt động, **When** tạo hộ, **Then** owner là Customer được chọn, createdBy là Admin; giao diện xác nhận rõ người nhận quyền sở hữu trước khi tạo.
2. **Given** thiệp thuộc Customer, **When** Admin dùng capability tạo/chỉnh dữ liệu/publish/unpublish hộ được cấp rõ ràng, **Then** áp dụng cùng validation và chống ghi đè như owner, đồng thời ghi actor, owner, hành động, thời điểm và kết quả thành công.
3. **Given** một thiệp được tạo hộ, **When** owner đăng nhập, **Then** owner tiếp tục chỉnh dữ liệu và quản lý thiệp bình thường; thao tác hộ không chuyển quyền sở hữu cho Admin.
4. **Given** Admin có quyền hỗ trợ thiệp, **When** yêu cầu đọc danh sách RSVP của Customer, **Then** bị từ chối; quyền tạo hộ không bao gồm đọc phản hồi.
5. **Given** Customer mục tiêu bị khóa, không tồn tại hoặc thực chất là tài khoản Admin, **When** tạo hộ, **Then** bị từ chối và không tạo thiệp mồ côi.
6. **Given** Admin có quyền hỗ trợ thiệp, **When** đóng/mở nhận RSVP hộ Customer, **Then** trạng thái có hiệu lực ngay, có dấu vết actor/owner và không cấp quyền đọc phản hồi.

### User Story 6 - Guest gửi RSVP và owner xem phản hồi (Priority: P1)

Là khách mời, tôi muốn xác nhận việc tham dự ngay trên thiệp; là owner, tôi muốn xem các phản hồi để chuẩn bị đón khách.

**Why this priority**: Người dùng đã chọn thu RSVP thật trong MVP; chỉ preview widget không đáp ứng yêu cầu này.

**Independent Test**: Guest mở thiệp công khai có RSVP, gửi phản hồi và thấy xác nhận; owner nhìn thấy đúng phản hồi, người khác không truy cập được danh sách.

**Acceptance Scenarios**:

1. **Given** thiệp công khai có RSVP đang bật, **When** Guest nhập tên, tham dự/không tham dự, số người và lời nhắn hợp lệ, **Then** phản hồi được lưu cho chính thiệp đó và chỉ báo thành công sau khi lưu thành công.
2. **Given** tên trống, số người không hợp lệ hoặc lời nhắn vượt giới hạn, **When** gửi, **Then** thấy lỗi tại trường tương ứng, không mất các giá trị hợp lệ đã nhập và không có phản hồi mới.
3. **Given** lần gửi đã được ghi nhận nhưng kết nối bị gián đoạn, **When** retry cùng lượt gửi, **Then** không tạo bản ghi trùng và nhận lại kết quả của lượt đó.
4. **Given** thiệp chưa publish, đã unpublish, không hiển thị widget RSVP hoặc đã đóng nhận RSVP, **When** gửi kể cả bỏ qua giao diện, **Then** bị từ chối; khi unpublish/đóng RSVP và gửi đồng thời, không chấp nhận phản hồi mới sau thời điểm thao tác ngừng nhận đã có hiệu lực.
5. **Given** Guest gửi quá giới hạn tần suất, **When** tiếp tục gửi, **Then** bị giới hạn và được thông báo thời điểm có thể thử lại; không lộ phản hồi đã gửi bởi người khác.
6. **Given** owner mở quản lý phản hồi, **When** xem danh sách, **Then** có tên, trạng thái, số người, lời nhắn và thời điểm gửi, mới nhất trước, có phân trang; Guest, Customer khác và Admin hỗ trợ không đọc được.
7. **Given** thiệp công khai có widget RSVP, **When** owner hoặc Admin hỗ trợ đóng nhận RSVP, **Then** trạng thái có hiệu lực ngay không cần publish lại, thiệp vẫn công khai, widget thay form gửi bằng thông báo đã đóng và phản hồi cũ được giữ nguyên; mở lại cho phép gửi nếu thiệp vẫn công khai và hiển thị widget RSVP.

### Edge Cases

- Resize nhỏ hơn nội dung hoặc giảm chiều cao canvas làm element vượt khung: cảnh báo và chặn publish, không xóa/reposition element tự động.
- Drag khi zoom và rotate kết hợp: kết quả lưu dùng tọa độ chuẩn; undo phục hồi đúng trạng thái trước gesture.
- Element bị hide không xuất hiện trong preview/public; vẫn có trong layers để khôi phục. Lock ngăn sửa, biến đổi và delete tới khi unlock.
- Binding dữ liệu rỗng dùng fallback; nếu element/widget được Admin đánh dấu tùy chọn và vẫn thiếu đầu vào cần để hiển thị thì ẩn toàn bộ element/widget, giữ nguyên khoảng trống, không sửa trạng thái hide đã lưu. Phần bắt buộc thiếu đầu vào thì chặn publish; dữ liệu sai kiểu vẫn là lỗi. Chuỗi giống mã lệnh được coi là dữ liệu, không được thực thi.
- Ngày giờ có timezone rõ ràng; Countdown hết hạn hiển thị trạng thái kết thúc, không đếm âm. Map/QR thiếu dữ liệu bắt buộc không hiển thị giá trị mẫu trên thiệp thật.
- Template unpublish sau khi Customer đã tạo draft: draft đã ghim revision vẫn có thể tiếp tục hoàn thiện và publish; không tạo thiệp mới từ mẫu đó.
- Asset hoặc font tải lỗi: có trạng thái lỗi/fallback rõ, không làm sập toàn bộ thiệp; không thay đổi nội dung thiết kế đã lưu.
- Hai người hoặc hai tab cùng lưu/publish: từ chối thao tác dựa trên revision cũ, giữ bản hiện hành; cung cấp tải lại sau cảnh báo mất thay đổi chưa lưu, không tự merge.
- Retry RSVP khác với lượt gửi mới: cùng lượt không trùng bản ghi; lượt mới của người trùng tên vẫn được lưu vì chưa định danh khách.
- Unpublish rồi publish lại thiệp: giữ URL, phản hồi đã nhận và trạng thái đóng/mở RSVP đã chọn; publish lại không tự mở RSVP đã đóng. Template không hiển thị widget RSVP thì trạng thái mở không cho phép nhận phản hồi. Việc bỏ widget khỏi thiết kế không xóa lịch sử phản hồi của thiệp.
- Customer upload ảnh cho thiệp riêng: không xuất hiện trong thư viện template công khai hoặc My uploads của người khác.

## Requirements *(mandatory)*

### Scope and Delivery Boundaries

| Nhóm | MVP | Later / ngoài phạm vi MVP |
|------|-----|--------------------------|
| Template Editor / Workarea | Tạo/mở/duplicate, chiều rộng chuẩn và chiều cao tùy chỉnh, zoom/fit, preview mobile/desktop, draft, publish/unpublish, undo/redo, snapshot khi publish | Autosave, local recovery, lịch sử/restore nâng cao, layout theo breakpoint, section tự tăng chiều cao |
| Element Management | Text, Image, Decoration, Shape, Calendar, Countdown, Map, RSVP, QR Bank, Timeline; select/drag/resize/rotate/delete/duplicate, thứ tự, lock/hide | Multi-select, group/ungroup, Gallery |
| Properties Panel | Position, size, rotation, thứ tự, opacity, background, border/radius, shadow, padding theo loại; thuộc tính text đầy đủ; replace ảnh, object-fit và điểm căn; thuộc tính widget | Crop tương tác nâng cao, mask, animation; MVP chỉ hiển thị tĩnh |
| Left Toolbar / Asset Library | Văn bản, hình ảnh, trang trí, hình dạng, nền, tiện ích, mẫu; upload, asset library nội bộ, search/filter, My uploads | Stock/preset mở rộng, âm nhạc và hiệu ứng |
| Layers | Danh sách theo thứ tự hiển thị, chọn, rename, reorder, lock/unlock, hide/show, delete | Grouping |
| Binding System | Text/image/widget binding có kiểu, fallback, sample data, dữ liệu lặp riêng của Timeline | Biểu thức tùy ý, repeater tổng quát, gallery-item binding |
| Wedding Widgets | Calendar, Countdown, Map, RSVP, QR Bank, Timeline; Couple/Family/Love Story bằng Text/Image binding | Widget riêng Couple/Family/Love Story, Gallery, Music, Guest Message/Blessing |
| Template Data / Persistence | Save/load, schema version, validation, asset reference, thumbnail, metadata, published revision bất biến | Long thumbnail, compression, diff/restore nâng cao |

Luồng Customer tạo/xuất bản thiệp, Admin tạo hộ và RSVP thật thuộc cùng feature này với ranh giới nghiệp vụ riêng. Không bao gồm đơn hàng, thanh toán/xác nhận tiền về, danh sách khách mời, link riêng từng khách, gửi email/SMS RSVP, domain riêng, cộng tác thời gian thực hoặc chỉnh template từ giao diện Customer.

### Functional Requirements

#### Access and ownership

- **FR-001**: Hệ thống MUST chỉ cho ADMIN truy cập editor và quản lý template; CUSTOMER chỉ được chọn mẫu đã publish và quản lý dữ liệu/thiệp của mình. Guest chỉ được xem thiệp công khai và gửi RSVP được phép. (US1, US4)
- **FR-002**: Hệ thống MUST xác định actor từ phiên xác thực và owner từ dữ liệu đã lưu; quyền trên tài nguyên MUST được kiểm tra phía hệ thống, không chỉ bằng việc ẩn nút. CUSTOMER không thể tự cấp quyền qua trường owner/role. (US4.6, US5)
- **FR-003**: ADMIN MUST có capability rõ ràng để chọn Customer đang hoạt động, tạo, sửa dữ liệu, publish/unpublish và đóng/mở nhận RSVP hộ; MUST lưu owner riêng với createdBy và ghi dấu vết mọi mutation hộ thành công. Không chuyển owner, giả danh đăng nhập hoặc mặc nhiên đọc RSVP. (US5)

#### Template Editor / Workarea

- **FR-004**: ADMIN MUST tạo mới, mở, lưu draft và duplicate template; duplicate tạo mẫu draft độc lập, sao chép thiết kế/metadata trừ danh tính, trạng thái phát hành, người tạo và lịch sử phiên bản. (US1.1, US1.5)
- **FR-005**: Workarea MUST có chiều rộng thiết kế chuẩn cố định, chiều cao chỉnh được, zoom in/out và fit-to-screen. Preview/public MUST giữ một bố cục, co giãn đồng đều khi màn hình hẹp, căn giữa và giới hạn độ rộng trên desktop; không mutate design theo viewport. (US1.1, US2.4)
- **FR-006**: ADMIN MUST undo/redo các thay đổi thiết kế trong phiên editor, bao gồm layer và thuộc tính; một gesture liên tục là một bước undo. Zoom, selection và sample data MUST NOT trở thành thay đổi document. (US1.2, US2.3–4)
- **FR-007**: Hệ thống MUST phân biệt đã lưu/đang lưu/chưa lưu/lưu lỗi, cảnh báo rời trang khi có thay đổi và từ chối ghi đè từ revision cũ. MVP không cam kết khôi phục thay đổi chưa lưu sau crash hoặc đóng trình duyệt. (US1.6)

#### Element Management and Layers

- **FR-008**: ADMIN MUST thêm được toàn bộ element MVP trong bảng scope; chọn từ canvas hoặc layers, drag, resize, rotate, delete và duplicate từng element. Duplicate MUST có danh tính riêng và giữ style/binding của nguồn. (US1.2, US2.2)
- **FR-009**: ADMIN MUST đổi thứ tự bằng forward/backward/front/back và kéo thả trong layers; canvas và danh sách MUST cùng một thứ tự, không có thứ tự hiển thị mâu thuẫn với thuộc tính layer. (US1.4)
- **FR-010**: Layers MUST liệt kê cả element ẩn, hỗ trợ rename, lock/unlock, hide/show và delete. Element khóa MUST không sửa/biến đổi/delete trước khi unlock; element ẩn MUST không render ở preview/public. (US1.4)

#### Properties Panel

- **FR-011**: Element MUST có position x/y, width/height, rotation, thứ tự và opacity; background, border, border radius, shadow, padding chỉ được cung cấp khi renderer hỗ trợ cho loại đó. Giá trị không hợp lệ MUST bị từ chối với thông báo tại thuộc tính. (US1.3)
- **FR-012**: Text MUST hỗ trợ content, font family/size/weight, italic, underline, color, letter spacing, line height, text align và text transform; font khả dụng MUST hiển thị nhất quán giữa editor, preview, thumbnail và public. (US1.3, US2.4)
- **FR-013**: Image MUST hỗ trợ replace, object-fit, điểm căn ảnh và border radius; cách hiển thị/cắt theo khung MUST không thay đổi asset gốc. MVP chưa có crop tương tác hoặc mask tùy chỉnh. (US1.3)
- **FR-014**: Nội dung vượt khung hoặc vượt canvas MUST có cảnh báo xác định element. Draft hợp lệ về cấu trúc vẫn lưu được; publish MUST chặn overflow của nội dung đang hiển thị, không tự dời element, thu nhỏ chữ hoặc cắt text để che lỗi. Text được wrap trong khung. (US2.3, US3.6, US4.7)

#### Left Toolbar / Asset Library

- **FR-015**: Toolbar MUST cung cấp các nhóm MVP trong bảng scope. ADMIN MUST upload, duyệt thư viện nội bộ, search theo tên, filter theo loại và xem My uploads; CUSTOMER MUST có upload/chọn ảnh của mình qua form dữ liệu, không có quyền chỉnh thư viện template. (US3.1, US4.2)
- **FR-016**: Upload MUST có giới hạn dung lượng/loại tệp được công bố, kiểm tra nội dung thực tế và báo lỗi có thể xử lý. Document MUST lưu asset reference, không nhúng ảnh Base64; nội dung chủ động từ tệp tải lên MUST không được thực thi. (US3.1, US3.6)
- **FR-017**: Asset riêng MUST chỉ có người có quyền được chọn/quản lý. Asset được thiết kế hoặc thiệp đã lưu tham chiếu MUST không bị xóa; thay asset MUST không sửa tài nguyên của revision cũ. Public renderer chỉ nhận tài nguyên cần cho bản thiệp được phát hành. (US3.5, US4.6)

#### Binding System

- **FR-018**: TemplateDesign MUST chỉ chứa layout, style, binding và cấu hình widget; dữ liệu thật MUST thuộc WeddingData. Binding MUST hỗ trợ tên/ảnh cô dâu, chú rể, ảnh đôi, ngày giờ cưới, tên/địa chỉ venue, thông tin cha mẹ, story và timeline; dữ liệu tĩnh của template được giữ riêng với dữ liệu resolve. (US2.1–3, US4.2)
- **FR-019**: Binding MUST khai báo loại dữ liệu được chấp nhận, trường nguồn, đầu vào cần để hiển thị và fallback phù hợp. ADMIN MUST được đánh dấu element/widget là bắt buộc hoặc tùy chọn. Trường thiếu/rỗng dùng fallback; nếu vẫn thiếu đầu vào cần để hiển thị thì phần tùy chọn MUST được ẩn toàn bộ, giữ nguyên khoảng trống, tọa độ và chiều cao canvas; phần bắt buộc MUST chặn publish và chỉ rõ lỗi. Đầu vào phụ không cần để hiển thị, như nội dung chuyển khoản, có thể rỗng mà không ẩn widget. Dữ liệu sai kiểu MUST vẫn chặn publish. Việc ẩn do thiếu dữ liệu MUST không sửa design hoặc trạng thái hide thủ công; phần tùy chọn xuất hiện lại khi đủ dữ liệu hợp lệ và không bị hide thủ công. Không thực thi biểu thức do người dùng cung cấp. (US2.1, US2.6, US3.6, US4.7)
- **FR-020**: ADMIN MUST preview với sample wedding data tách khỏi dữ liệu customer; thay sample data MUST không mutate design. Các trường dùng bởi binding MUST có đầu vào tương ứng trong form customer; template tĩnh không bắt customer nhập trường không dùng. (US2.3–5, US4.1–2)
- **FR-021**: Map MUST bind venue; Calendar/Countdown bind datetime sự kiện với timezone; QR Bank bind thông tin ngân hàng; Timeline bind danh sách mốc. RSVP MUST lấy invitation từ runtime context, không ghi invitation/customer ID vào template tái sử dụng. (US2.2)

#### Wedding Widgets and Renderer

- **FR-022**: Mỗi widget MVP MUST có renderer, bộ thuộc tính riêng, giá trị mặc định, kiểm tra dữ liệu và danh sách binding được hỗ trợ. Hành vi hiển thị MUST nhất quán giữa editor, preview và public; preview MUST không gửi RSVP thật. (US2.2, US2.4–5)
- **FR-023**: Calendar MUST đánh dấu ngày sự kiện; Countdown MUST đếm theo datetime/timezone và dừng ở trạng thái kết thúc; Map MUST hiển thị địa điểm và cho mở chỉ đường; Timeline MUST giữ thứ tự các mốc được nhập. Thiếu dữ liệu widget bắt buộc MUST chặn publish thay vì dùng dữ liệu mẫu. (US2.2, US3.6)
- **FR-024**: QR Bank MUST tạo mã từ ngân hàng/tài khoản/tên người nhận và nội dung chuyển khoản tùy chọn, cho đối chiếu thông tin bằng chữ; không xác nhận chuyển khoản, số dư hoặc thanh toán. (US2.2, US4.2)

#### Template Data / Persistence

- **FR-025**: Thiết kế MUST lưu và mở lại không mất element, thuộc tính, layer, binding, asset reference hoặc kích thước chuẩn. Document MUST có schema version và được kiểm tra cấu trúc, kiểu element/thuộc tính, binding và tham chiếu trước khi chấp nhận. Phiên bản chưa hỗ trợ MUST có lỗi rõ, không âm thầm bỏ dữ liệu. (US1.5, US3.6)
- **FR-026**: Template metadata MUST gồm name, category, status, tags, cover, sort order, createdBy và revision. ADMIN MUST chỉnh metadata; danh sách mẫu MUST hỗ trợ tìm/lọc và thứ tự đã cấu hình. Thumbnail MUST gắn với đúng published revision và sample data, không lấy dữ liệu riêng của customer. (US3.2)
- **FR-027**: Publish template MUST kiểm tra thiết kế, tạo published revision bất biến và thumbnail tương ứng; lỗi ở bất kỳ bước bắt buộc nào MUST giữ nguyên bản đang phát hành. Lưu draft MUST không sửa published revision. (US3.2–3, US3.6)
- **FR-028**: Unpublish template MUST chỉ ngăn chọn mẫu cho thiệp mới. Published revision đã ghim MUST vẫn dùng được cho thiệp hiện hữu, kể cả draft đã tạo trước đó; revision mới MUST không tự nâng cấp thiệp cũ. Schema version, design revision và revision chống ghi đè MUST có ý nghĩa riêng. (US3.4, US4.1)

#### Customer Invitations and Admin Assistance

- **FR-029**: CUSTOMER MUST xem danh sách mẫu khả dụng, tạo thiệp từ published revision và quản lý danh sách thiệp của mình. Mỗi thiệp MUST có owner, design revision cố định, WeddingData, trạng thái và URL riêng khi publish. Hệ thống MUST cấp đường dẫn duy nhất cho từng thiệp ở lần publish đầu và giữ cố định qua sửa dữ liệu, publish lại hoặc unpublish rồi publish lại; CUSTOMER và ADMIN MUST NOT tự đặt hoặc đổi đường dẫn. Đổi template của thiệp hiện hữu không thuộc MVP. (US4.1, US4.8, US5.1–3)
- **FR-030**: CUSTOMER và ADMIN hỗ trợ MUST nhập/sửa WeddingData qua form và preview; không sửa bản thiết kế được ghim qua luồng nhập dữ liệu. Dữ liệu MUST hỗ trợ thông tin cặp đôi, gia đình, story, các sự kiện/venue, timezone, timeline, ảnh và QR Bank khi mẫu yêu cầu. (US4.2, US5.2)
- **FR-031**: Publish thiệp MUST kiểm tra dữ liệu bắt buộc, binding, asset và overflow, rồi phát hành một bản nhất quán. Lưu draft không đổi public; publish lại giữ URL, thay toàn bộ nội dung phát hành sau khi thành công. Guest MUST không đọc được draft, dữ liệu owner hoặc lịch sử quản trị. (US4.3–4, US4.6–7)
- **FR-032**: Owner và ADMIN hỗ trợ MUST có thể unpublish thiệp. Sau khi thao tác có hiệu lực, hệ thống MUST ngừng phục vụ nội dung thiệp và nhận RSVP mới; giữ dữ liệu/phản hồi để owner quản lý và publish lại cùng URL. Không cam kết thu hồi bản sao người xem đã tải trước đó. (US4.5, US6.4)

#### RSVP

- **FR-033**: Owner và ADMIN hỗ trợ MUST được đóng/mở nhận RSVP với hiệu lực ngay, độc lập với lưu draft và publish thiệp. Khi đóng, thiệp MUST vẫn công khai, widget RSVP hiển thị thông báo đã đóng thay form gửi và phản hồi cũ MUST được giữ nguyên. Guest MUST chỉ được gửi RSVP không đăng nhập khi thiệp đang công khai, bản công khai hiển thị widget RSVP và trạng thái nhận RSVP đang mở; hệ thống MUST kiểm tra đủ các điều kiện khi ghi nhận lượt gửi mới, kể cả từ trang đã mở trước khi đóng. Mặc định trạng thái nhận RSVP của thiệp mới là mở; publish/unpublish không tự thay đổi trạng thái đã chọn. Phản hồi MUST gắn với invitation hợp lệ, không tin owner/thiệp do payload tự khai để vượt quyền hoặc trạng thái. (US5.6, US6.1, US6.4, US6.7)
- **FR-034**: Form MUST yêu cầu tên từ 1–120 ký tự sau trim và lựa chọn tham dự/không tham dự. Tham dự yêu cầu số người nguyên 1–20, tính cả người gửi; không tham dự có số người 0. Lời nhắn tùy chọn tối đa 1.000 ký tự, hiển thị như văn bản. Lỗi MUST không xóa các đầu vào hợp lệ. (US6.1–2)
- **FR-035**: Cùng một lượt gửi được retry MUST tạo tối đa một phản hồi; giao diện MUST chỉ xác nhận thành công sau khi dữ liệu được ghi nhận. Nếu chưa biết kết quả do lỗi mạng, MUST cho retry cùng lượt. MVP không xác minh danh tính hoặc gộp lượt mới chỉ vì trùng tên. (US6.3)
- **FR-036**: RSVP MUST có giới hạn gửi được áp dụng cả khi bỏ qua giao diện; mặc định tối đa 5 lượt gửi mới trong 10 phút cho cùng nguồn truy cập trên một thiệp. Retry cùng lượt đã ghi nhận không tạo phản hồi mới. Khi bị giới hạn, người gửi MUST biết thời gian có thể thử lại. (US6.5)
- **FR-037**: Chỉ owner MUST được xem danh sách phản hồi của thiệp mình, có phân trang và thứ tự mới nhất trước; hiển thị tên, quyết định, số người, lời nhắn và thời điểm. Không công khai danh sách, cấp quyền đọc cho ADMIN hỗ trợ hoặc tự xóa phản hồi khi unpublish/bỏ widget. (US5.4, US6.6)

### Key Entities *(include if feature involves data)*

- **InvitationTemplate**: Danh tính và metadata của mẫu; trạng thái khả dụng, draft hiện tại và published revision hiện hành. Không chứa dữ liệu đám cưới thật.
- **TemplateDesign**: Document chứa layout/style/binding/cấu hình widget và asset reference; có schema version, kích thước chuẩn và design revision. Published revision bất biến, độc lập với draft và revision chống ghi đè.
- **WeddingData**: Dữ liệu thật của một thiệp, thuộc customer qua Invitation; bao gồm các trường được form hỗ trợ. MVP không tạo hồ sơ đám cưới dùng chung tự đồng bộ giữa nhiều thiệp.
- **Invitation**: Thiệp thuộc một Customer, ghim một published design revision, có dữ liệu draft, bản dữ liệu đã phát hành, URL với đường dẫn duy nhất do hệ thống cấp và cố định từ lần publish đầu, trạng thái xuất bản, trạng thái nhận RSVP mở/đóng độc lập, createdBy và thông tin chỉnh sửa. Trạng thái nhận RSVP không thuộc TemplateDesign hoặc WeddingData.
- **RenderContext**: Ngữ cảnh hiển thị như invitation ID, public URL và chế độ preview/public; không phải dữ liệu mẫu hoặc bản ghi customer nhúng trong template.
- **BindingDefinition**: Trường đích, trường nguồn được hỗ trợ, kiểu, đầu vào cần để hiển thị và fallback; element/widget sở hữu binding có cấu hình bắt buộc hoặc tùy chọn do Admin đặt. Không chứa mã thực thi tùy ý.
- **Asset**: Tài nguyên có danh tính, loại, chủ sở hữu/phạm vi sử dụng và tham chiếu từ thiết kế/thiệp; bao gồm ảnh, trang trí, nền và font khả dụng.
- **RSVPResponse**: Invitation liên quan, tên người gửi, quyết định tham dự, số người, lời nhắn, thời điểm và định danh lượt gửi để nhận biết retry; không phải tài khoản hoặc hồ sơ khách đã xác minh.
- **AssistedActionRecord**: Actor Admin, owner Customer, invitation, hành động và thời điểm; chứng minh thao tác hỗ trợ, không sao chép toàn bộ dữ liệu riêng hoặc nội dung RSVP vào lịch sử.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Trong kịch bản nghiệm thu, Admin hoàn thành tạo mẫu với Text/Image/Shape, binding tên/ngày cưới, lưu và mở lại trong tối đa 15 phút sau phần hướng dẫn; toàn bộ thuộc tính được kiểm tra khớp trước/sau lưu.
- **SC-002**: Với một thiết kế gồm 100 element và 10 widget, 100% trường hợp zoom/preview ở chiều rộng 360, 390, 768 và 1440 không đổi document; không có cuộn ngang ngoài ý muốn của trang thiệp và layer/thứ tự hiển thị giữ nguyên.
- **SC-003**: Hai bộ sample data và bộ dữ liệu thiếu/sai kiểu/nội dung dài cho kết quả binding, fallback và cảnh báo đúng trong 100% tình huống nghiệm thu; phần tùy chọn thiếu dữ liệu được ẩn/hiện lại đúng mà không thay đổi bố cục, phần bắt buộc thiếu dữ liệu chặn publish. Không có dữ liệu sample xuất hiện thay dữ liệu bắt buộc bị thiếu trên thiệp thật.
- **SC-004**: Customer có sẵn thông tin và ảnh hoàn thành chọn mẫu, nhập các trường bắt buộc, preview và publish một thiệp trong tối đa 10 phút theo kịch bản nghiệm thu, không mở editor hoặc cần Admin sửa layout.
- **SC-005**: 100% kịch bản sửa draft, publish revision mới và unpublish template giữ nguyên các thiệp đang ghim revision cũ; publish dữ liệu thiệp không hiển thị bản cập nhật một phần.
- **SC-006**: Trong kịch bản nghiệm thu, Guest hoàn thành RSVP hợp lệ trong tối đa 60 giây; retry cùng lượt chỉ có một phản hồi và owner thấy bản ghi sau khi tải lại danh sách. Trong 100% kịch bản đóng nhận RSVP, lượt gửi mới sau khi thao tác đóng có hiệu lực bị từ chối, thiệp vẫn xem được và phản hồi cũ không mất; mở lại không cần publish và chỉ nhận phản hồi khi thiệp công khai có widget RSVP.
- **SC-007**: 100% trường hợp trong ma trận quyền của US4–US6 từ chối truy cập trái phép, bao gồm giả owner, Customer khác, Guest đọc draft và Admin hỗ trợ đọc RSVP; thao tác tạo hộ thành công ghi đúng actor/owner.
- **SC-008**: Sau khi tải xong asset/font, với thiết kế tham chiếu của SC-002 trên môi trường kiểm thử được ghi nhận trong plan, 95% thao tác chọn/đổi thuộc tính có phản hồi nhìn thấy trong 200 ms; 95% lần mở mẫu đã lưu sẵn sàng thao tác trong 3 giây trên môi trường đó.

## Assumptions

- Các quyết định đã được người dùng xác nhận: một layout chuẩn; canvas có chiều cao chỉnh thủ công; RSVP hoạt động thật qua form công khai; Customer tự tạo thiệp và ADMIN có thể tạo hộ.
- Editor dùng trên desktop; form Customer, public renderer và RSVP dùng được trên mobile/desktop. MVP không làm editor cảm ứng hoặc layout riêng theo breakpoint.
- Chuẩn chiều rộng thiết kế, giới hạn chiều cao/số element/upload và tập font sẽ được cố định, công bố trong planning dựa trên thử nghiệm khả năng hiển thị và SC-002/SC-008; không để browser viewport quyết định dữ liệu lưu.
- Craft.js + Moveable là ràng buộc công nghệ do người dùng chốt, được chuyển sang plan/research để kiểm chứng tương thích. Spec không quy định cách tích hợp hook, cấu trúc serialization nội bộ hoặc hợp đồng truyền dữ liệu.
- Dùng IAM hiện hữu và [authorization contract](../003-identity-access-management/contracts/authorization.md). Feature này bổ sung policy riêng cho tài nguyên thật; không thay đổi ngầm định cơ chế phiên, role hoặc quyền Admin toàn hệ thống.
- Theo mặc định, Customer chỉ quản lý thiệp của mình; Admin hỗ trợ được tạo/sửa/publish/unpublish và đóng/mở nhận RSVP nhưng không đọc phản hồi RSVP. Không chuyển owner hoặc chỉnh template đã ghim từ luồng hỗ trợ.
- Dữ liệu đưa vào thiệp công khai được coi là nội dung owner chủ động công bố; lịch sử hỗ trợ, thông tin tài khoản nội bộ và phản hồi RSVP không thuộc nội dung công khai.
- Đám cưới có thể có nhiều sự kiện và venue; widget chọn sự kiện tương ứng. Thời gian dùng timezone được nhập rõ ràng, mặc định Asia/Ho_Chi_Minh, không suy ra từ trình duyệt khách.
- Không có asset storage hoặc business module template/invitation/RSVP hiện hữu theo kiểm tra repository ngày 2026-10-01. Planning phải thiết kế các phần cần thiết trong phạm vi này, không giả định chúng đã có hoặc chờ một module ngoài scope để hoàn thành RSVP thật.
- Người dùng đã chọn MinIO cho ảnh upload và thumbnail, với giao tiếp tương thích S3 để hỗ trợ chuyển sang AWS S3 sau này. Đây là ràng buộc storage được duyệt; cấu hình, adapter, quyền bucket và kiểm chứng thuộc planning. Chưa triển khai hoặc chuyển dữ liệu lên AWS trong feature này.
- Quyết định nhà cung cấp bản đồ, định dạng QR Bank, thumbnail và giới hạn chống lạm dụng cụ thể thuộc planning; không mở rộng sang thanh toán, gửi thư hoặc dịch vụ phân tán không cần thiết.
- Mẫu phải đủ khoảng trống cho dữ liệu thường gặp. Nội dung vượt khung yêu cầu Customer rút gọn dữ liệu hoặc Admin chuẩn bị mẫu khác; MVP không tự reflow, chỉnh layout riêng cho mỗi customer hoặc đổi mẫu của thiệp hiện hữu.
- Published snapshot là bắt buộc; UI lịch sử/restore, autosave/local backup và các mục Later không phải điều kiện nghiệm thu MVP.
