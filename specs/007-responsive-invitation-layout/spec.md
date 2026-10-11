# Feature Specification: Responsive Invitation Layout

**Feature Branch**: Định danh Spec Kit `007-responsive-invitation-layout`; Git hiện tại `master` (không tạo/chuyển branch trong bước tài liệu).
**Created**: 2026-10-11
**Status**: Phạm vi và phương án đã được người dùng chốt ngày 2026-10-11 sau analysis; chưa implementation hoặc runtime verification.
**Input**: Đọc `docs/frontend/DESKTOP-900-PLAN.md` và lên phương án phát triển feature 007.

## User Scenarios & Testing

### User Story 1 - Xem thiệp thích ứng theo không gian hiển thị (Priority: P1)

Khách xem một mẫu thiệp mới được bố cục cân đối trên điện thoại và desktop, đọc nội dung dài và sử dụng các chức năng mà không phải phóng to một bản điện thoại.

**Why this priority**: Đây là giá trị cốt lõi của desktop 900px.
**Independent Test**: Dùng mẫu mới có hero, thông tin lễ cưới, nhóm ảnh và RSVP trên shared preview và thiệp công khai tại các chiều rộng quy định; có thể kiểm qua fixture đã publish mà không cần UI authoring mới.

**Acceptance Scenarios**:

1. **Given** thiệp thế hệ mới, **When** container rộng 1440px, **Then** khung thiệp rộng 900px và căn giữa; nội dung và controls dùng kích thước riêng.
2. **Given** cùng thiệp, **When** container dưới 768px, **Then** khung không quá 480px, vừa chiều rộng có sẵn và nội dung chính một cột; tại 768px khung rộng 768px, tại 900px khung rộng 900px.
3. **Given** tên/địa chỉ nhiều dòng và trạng thái lỗi RSVP, **When** nội dung thay đổi, **Then** section tăng chiều cao, nội dung và controls không bị cắt.
4. **Given** RSVP đang nhập hoặc đang gửi, **When** container qua mốc 767/768px, **Then** dữ liệu nhập, focus và trạng thái gửi được giữ; không phát sinh submission lặp.

### User Story 2 - Customer chỉnh dữ liệu với preview nhất quán (Priority: P1)

Customer điền dữ liệu trên thiết kế được ghim, xem preview mobile và xuất bản; bản công khai dùng chính dữ liệu/thiết kế đã xuất bản.

**Why this priority**: Giữ đúng quyền hạn và niềm tin vào preview.
**Independent Test**: Tạo invitation từ revision mới bằng fixture, chỉnh/lưu dữ liệu và publish qua luồng Customer hiện có.

**Acceptance Scenarios**:

1. **Given** desktop viewport 1440px, **When** mở Customer editor hoặc shared mobile preview trong popup test fixture, **Then** preview vẫn một cột trong container tối đa 390px và không có device selector dành cho Customer.
2. **Given** cùng thiết kế, dữ liệu, chiều rộng, tài nguyên và thời điểm hiển thị, **When** so Customer preview/public, **Then** thứ tự section, nội dung, typography và hình học tương đương; hành động public và trạng thái preview tuân theo mode của từng surface.
3. **Given** draft chưa publish, **When** chỉnh dữ liệu hoặc publish thất bại, **Then** thiệp công khai vẫn dùng snapshot trước đó; Customer không gửi được layout/style/binding thay thế.

### User Story 3 - Admin authoring section và responsive layout (Priority: P2)

Admin tạo mẫu mới bằng section, định nghĩa thứ tự nội dung, bố cục mobile/desktop và artwork riêng, kiểm tra trước khi publish.

**Why this priority**: Cho phép tạo nhiều mẫu có bố cục thích ứng thay vì bảo trì hai thiệp độc lập.
**Independent Test**: Tạo một mẫu mới, thêm/sắp xếp section, cấu hình một/two-column, undo/redo, save/reload, preview hai chiều rộng và publish.

**Acceptance Scenarios**:

1. **Given** mẫu mới, **When** Admin đổi thứ tự section hoặc bố cục nhóm ảnh, **Then** thứ tự đọc trên mobile/desktop được bảo toàn và save/reload giữ nguyên thiết kế.
2. **Given** Admin chỉnh artwork, **When** nội dung tăng chiều cao, **Then** artwork ở trong section và không che, cắt hoặc chặn controls.
3. **Given** mẫu cũ, **When** Admin tạo bản thiết kế mới, **Then** phải tái author có kiểm tra; không tự suy diễn section từ tọa độ cũ và không tự thay revision đang được invitation sử dụng.
4. **Given** hai phiên Admin cùng chỉnh, **When** save/publish dựa trên phiên bản cũ, **Then** conflict giữ thay đổi cục bộ và không ghi đè thiết kế mới hơn.

### User Story 4 - Publish an toàn và giữ thiệp cũ (Priority: P1)

Admin/Customer có thể publish mẫu mới trong khi toàn bộ mẫu và thiệp đã xuất bản trước đó tiếp tục hoạt động.

**Why this priority**: Tương thích là điều kiện phát hành, không phải phase có thể bỏ.
**Independent Test**: Dùng dữ liệu cũ trước migration, publish v1/v2 và kiểm tra URL/snapshot ghim, lỗi readiness, unpublish và asset access.

**Acceptance Scenarios**:

1. **Given** mẫu mới, **When** publish, **Then** hệ thống kiểm nội dung/tài nguyên ở mobile 390px và desktop 900px; lỗi một phía ngăn toàn bộ publication.
2. **Given** template mới đã publish, **When** template được cập nhật lại, **Then** invitation đã ghim vẫn dùng thiết kế cũ; snapshot chứa đầy đủ thông tin bố cục để hiển thị cả hai kích thước.
3. **Given** thiệp cũ đang public, **When** triển khai hỗ trợ mẫu mới, **Then** nội dung, kích thước và hành vi cũ giữ nguyên.
4. **Given** publication chưa hoàn thành, **When** timeout, asset bị xóa hoặc unpublish xảy ra, **Then** không lộ snapshot chưa hợp lệ, không công khai asset không thuộc snapshot và không mất publication cũ.

### Edge Cases

- Width thực tế 767/768px; viewport desktop nhưng container hẹp; container 0px/ẩn rồi mở; browser zoom 200%.
- Tên tiếng Việt dài, địa chỉ nhiều dòng, story dài, optional data thiếu; 0/1/2/3/nhiều Image trong nhóm ảnh theo giới hạn tài liệu.
- Font/ảnh tải muộn hoặc hỏng; artwork vượt biên; widget báo lỗi dài; ngày countdown đã qua.
- Width đổi lúc nhập/gửi RSVP, đổi orientation hoặc mở dialog; keyboard và reduced motion.
- ID trùng, section/node không tồn tại, thuộc tính lạ, phiên bản không hỗ trợ; không được bỏ qua âm thầm.
- Publish retry/conflict, snapshot v1/v2 cùng tồn tại; background/artwork/fallback assets ở nested sections, hidden/pruned assets và cleanup races. Không có asset identity hoặc visibility riêng theo breakpoint trong 007.

## Requirements

### Scope

**In scope**: Thế hệ template section/flow, shared renderer, Admin authoring, các surface production hiện có (Customer editor preview, Admin preview, public, capture); test host độc lập để kiểm responsive/mobile-popup policy, tương thích/persistence/publication, một mẫu pilot v2, hướng dẫn chuyển mẫu thủ công và verification.

**Out of scope**: Dual-scene production; scale nguyên canvas thành 900px; Customer sửa thiết kế; tự động chuyển toàn catalog; payment; thêm provider; thiết kế lại platform chrome hoặc đổi MASTER; triển khai hosting; thêm production discovery/detail/demo/popup mới. Demo/popup trong apps/ui-prototype chỉ là tham chiếu, không là surface nghiệm thu production. Nhóm ảnh gồm Image và binding hiện có, không bổ sung album upload/data collection, audio player hoặc lightbox mới. Nếu surface có state audio/lightbox sẵn thì giữ state khi thay width.

### Functional Requirements

- **FR-001**: Mẫu thế hệ mới MUST dùng section có thứ tự ổn định; nội dung chính tự tăng chiều cao và artwork chỉ trang trí trong section.
- **FR-002**: Thiệp công khai MUST thích ứng theo container: dưới 768px tối đa 480px, từ 768px tối đa 900px, width không vượt không gian có sẵn và căn giữa.
- **FR-003**: Customer editor preview và shared mobile preview host (bao gồm popup test fixture) MUST dùng container mobile tối đa 390px kể cả trên desktop, không có Customer device selector.
- **FR-004**: Thiệp mới MUST dùng bố cục/kích thước riêng cho nội dung, typography và controls; không scale toàn trang. Controls enabled tối thiểu 44px chiều cao/target theo design system khi applicable.
- **FR-005**: Admin MUST tạo/sắp xếp section, chọn flow/grid, chỉnh style mobile/desktop trong tập thuộc tính được phép, chỉnh artwork, binding/sample data, undo/redo và save/reload.
- **FR-006**: Customer MUST chỉ chỉnh dữ liệu trên pinned revision, tiếp tục sử dụng permissions, validation và optimistic conflict hiện có.
- **FR-007**: Các surface MUST dùng chung ngữ nghĩa binding, assets, widgets và renderer; kết quả tại cùng width/data/asOf MUST tương đương, trừ hành vi mode được định nghĩa.
- **FR-008**: Mẫu/thiệp thế hệ cũ MUST tiếp tục đọc, chỉnh và publish theo hành vi cũ; phiên bản không hỗ trợ hoặc dữ liệu sai MUST bị từ chối rõ ràng.
- **FR-009**: Publication mới MUST ghi snapshot đầy đủ responsive layout và version, kiểm mobile 390px/desktop 900px trước commit và bảo toàn pinning/draft-public separation.
- **FR-010**: Publication MUST chờ font/ảnh sẵn sàng, kiểm overflow/content/functional state, báo lỗi theo node/section và layout; failure không được thay publication hiện hành.
- **FR-011**: Breakpoint transition MUST giữ identity/state/focus của functional widgets, không tạo lại widget hoặc phát sinh gửi RSVP/network call do đổi bố cục.
- **FR-012**: Template conversion MUST do Admin tái author thành revision mới với review; không sửa snapshot đã publish hoặc tự ghim lại invitation cũ.
- **FR-013**: Asset references/authorization MUST bao phủ mọi section và mọi layout có thể hiển thị; asset nested/fallback không được bị cleanup khi còn reference hoặc phát hành ngoài scope. Asset IDs và visibility dùng chung hai layouts, không thêm desktop-only assets.
- **FR-014**: Renderer mới MUST hỗ trợ keyboard, text zoom 200%, visible focus, target size và reduced motion; decoration không tham gia thứ tự đọc hoặc chặn input.
- **FR-015**: Catalog MUST giữ cover/thumbnail contract hiện có; việc tăng width public không đổi platform containers/tokens.

### Key Entities

- **Template design**: Version, thứ tự section, nội dung/binding, cấu hình responsive và asset references.
- **Section**: ID ổn định, thứ tự nội dung, layout rules, background/artwork và chiều cao theo nội dung.
- **Template revision**: Thiết kế/sample data bất biến, phiên bản renderer, hash và thumbnail.
- **Invitation snapshot**: Pinned design, dữ liệu đã publish, scene responsive đầy đủ và public version.
- **Publication job**: Candidate bất biến, kết quả kiểm từng layout, trạng thái và conflict/idempotency hiện có.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Mẫu pilot có khung rộng 900px tại container 1440px, 768px tại container 768px, 480px tại container 767px và 390px tại container 390px; sai số đo tối đa 1 CSS px.
- **SC-002**: Mẫu pilot không overflow ngang hoặc cắt nội dung/control tại 360/375/390/430/767/768/900/1024/1440px và với fixture tên/địa chỉ dài, optional data thiếu, số ảnh khác nhau, widget errors, font/ảnh trễ.
- **SC-003**: Customer preview và public dùng cùng dữ liệu/asOf ở width bằng nhau có thứ tự/content giống nhau và bounding box tương ứng sai số tối đa 1 CSS px sau readiness.
- **SC-004**: 100% fixture thiệp cũ vẫn giữ snapshot, geometry, asset visibility và hành vi trước nâng cấp; cả publish cũ/mới qua compatibility suite.
- **SC-005**: RSVP giữ giá trị nhập và focus khi container đổi 767↔768px; một thao tác submit không tạo submission lặp do resize.
- **SC-006**: Publication lỗi mobile, desktop, font, ảnh, timeout hoặc conflict đều không thay snapshot public; report chỉ đúng layout/node/section gây lỗi.
- **SC-007**: Admin hoàn thành create → author → save/reload → preview → publish cho mẫu pilot; Customer hoàn thành data edit → publish → public RSVP bằng keyboard và ở text zoom 200%.

## Assumptions

- Chọn hướng v2 flow được DESKTOP-900-PLAN ưu tiên; dual-scene chỉ là phương án đã cân nhắc, không nằm trong kế hoạch này.
- Người dùng đã chốt v2 flow và các quyết định 768/480/900/390 trong remediation ngày 2026-10-11. Approval giới hạn tài liệu feature 007; không sửa MASTER hoặc tự authorize deployment.
- Không nâng WeddingData chỉ để đổi layout; nhóm ảnh dùng Image tĩnh hoặc ba photo binding hiện có. Test số lượng ảnh là fixture template, không phải capability album mới của Customer.
- Reuse feature 004 và các thay đổi 005/006 đang có trong working tree; baseline phải được chốt và kiểm compatibility trước coding. Planning không xác nhận các feature đó đã merged/hoàn tất.
- Không chuyển branch khi working tree chứa nhiều thay đổi khác. Feature context được pin qua Spec Kit; branch implementation dự kiến `007-responsive-invitation-layout`.
