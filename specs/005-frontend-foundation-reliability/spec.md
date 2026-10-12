# Feature Specification: Frontend Foundation & Reliability

**Feature Branch**: `master` (giữ nhánh hiện hành; không tạo branch trong bước specify)

**Feature Directory**: `specs/005-frontend-foundation-reliability`

**Created**: 2026-10-06

**Status**: In progress — full prototype mapping and improved Admin authoring approved 2026-10-11. Historical T001–T101 checkpoint FULL PASS at `run-XjtXMT`; new T102–T114 require their own visual and functional acceptance.

**Input**: Tiếp tục frontend development theo SpecKit kết hợp ui-ux-pro-max, sử dụng Design System v1 và Frontend Audit. Chốt Customer MUST NOT sửa layout/style/binding như feature `004-invitation-builder`. Bắt đầu bằng Frontend Foundation & Reliability, không redesign toàn bộ product trong một feature.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Dữ liệu riêng đúng người dùng hiện tại (Priority: P1)

Là Customer hoặc Admin, tôi muốn dữ liệu riêng và các kết quả thao tác chỉ thuộc người đang đăng nhập, kể cả khi đổi account hoặc phiên thay đổi ở tab khác.

**Why this priority**: Dữ liệu riêng bị giữ từ account trước có thể gây nhầm thao tác hoặc lộ thông tin, phải được xử lý trước mở rộng frontend.

**Independent Test**: Mở danh sách/detail của account A, chuyển sang account B cùng role khi trang vẫn mở; thử cả request đang xử lý và request mới thất bại. Không có dữ liệu A được hiển thị hay kết quả thao tác A được áp dụng cho B.

**Acceptance Scenarios**:

1. **Given** Customer A đang xem thiệp riêng, **When** phiên đổi sang Customer B cùng role, **Then** dữ liệu riêng của A bị loại khỏi screen và B chỉ thấy loading, empty, error hoặc dữ liệu của B.
2. **Given** request của A đang xử lý, **When** account/resource đổi trước khi response đến, **Then** response cũ không khôi phục dữ liệu, status, assets hoặc navigation cho context mới.
3. **Given** đã chuyển account, **When** request mới thất bại, **Then** screen hiển thị recovery phù hợp và không fallback về private data của account trước.
4. **Given** danh sách đã có nhiều trang, **When** identity đổi hoặc old pagination response đến muộn, **Then** pages/cursor không được trộn giữa accounts.
5. **Given** draft chưa lưu của A, **When** identity chuyển sang B hoặc logout, **Then** draft của A không hiển thị hoặc được save/publish bằng context của B; dirty-navigation handling không làm lộ draft cũ.
6. **Given** access credentials được renew cho cùng account và resource, **When** phiên được cập nhật, **Then** valid unsaved data được giữ và không bị reset chỉ vì credential renewal.
7. **Given** Admin A đang quản lý customer records, **When** đổi sang Admin B hoặc account khác role, **Then** old private results/actions không bị áp dụng cho phiên mới.

### User Story 2 - Invitation hiển thị độc lập với product session (Priority: P1)

Là người xem invitation, tôi muốn thấy đúng published invitation dù đang đăng nhập product hay chưa; là Admin/Customer, tôi muốn preview và publication có fonts cần thiết trong packaged application.

**Why this priority**: Public invitation là đầu ra chính của product. Session chrome và missing assets có thể làm output khác preview hoặc ngăn publish.

**Independent Test**: Mở cùng published invitation khi anonymous, sau khi đi từ authenticated product và trong packaged application. Nội dung/fonts nhất quán theo template; không có account email/logout toolbar xen vào invitation.

**Acceptance Scenarios**:

1. **Given** user đã đăng nhập, **When** mở public invitation từ product, **Then** không có private account email, logout controls hoặc product session toolbar trong invitation surface.
2. **Given** anonymous visitor và authenticated visitor mở cùng published version, **When** invitation hiển thị, **Then** template content và appearance tương đương; live state/time-dependent content vẫn theo cùng rules hiện có.
3. **Given** packaged application đang phục vụ template dùng approved invitation fonts, **When** preview/capture/public invitation load fonts, **Then** tất cả required faces sẵn có và không phải dựa vào source-tree assets bên ngoài package.
4. **Given** font hoặc image không load được, **When** preview/publication kiểm tra output, **Then** có truthful failure/recovery theo hiện trạng hợp lệ, không báo ready hoặc successful publish giả.
5. **Given** isolated render surface được sử dụng để kiểm tra publication, **When** product có active session, **Then** surface không nhận account chrome hoặc session side effects không cần thiết.
6. **Given** Admin mở Template Authoring, **When** dùng existing authoring capabilities, **Then** layer/geometry/binding tools vẫn hoạt động trong workspace riêng; không trở thành Customer capabilities.

### User Story 3 - Các màn hình tài khoản có platform language thống nhất (Priority: P2)

Là người dùng, tôi muốn sign-in, registration, recovery và account management có typography, forms, buttons và feedback nhất quán, dễ đọc và dùng được trên mobile/keyboard.

**Why this priority**: Đây là các screens có contracts hoạt động, giúp áp dụng platform foundations và nghiệm thu độc lập trước Marketplace redesign.

**Independent Test**: Hoàn thành existing account journeys và Admin customer management trên các viewport đã chọn, review theo MASTER; không cần public catalog hoặc feature mới.

**Acceptance Scenarios**:

1. **Given** user mở login/register/verification/password recovery/account screens, **When** đọc nội dung và thao tác controls, **Then** platform typography, colors, spacing, radius và control styling theo MASTER, không phụ thuộc browser-default styling để tạo visual language.
2. **Given** form chưa hợp lệ hoặc operation thất bại, **When** user nhận feedback, **Then** labels luôn visible, lỗi có text/accessibility association khi xác định được field; general failure có recovery, không giả field detail chưa được cung cấp.
3. **Given** Admin mở customer list/detail, **When** tìm kiếm, phân trang hoặc lock/unlock, **Then** shared controls/status dùng cùng platform foundations và giữ existing authorization/confirmation behavior.
4. **Given** viewport nhỏ hoặc keyboard-only interaction, **When** hoàn thành các journeys trong scope, **Then** controls/focus/content dùng được, không bị sticky surfaces che hoặc xuất hiện horizontal page overflow do layout chrome.
5. **Given** platform fonts/styles đã áp dụng, **When** xem invitation hoặc Admin canvas preview, **Then** template typography/palette/authored geometry không bị platform styles ghi đè.
6. **Given** screen cần loading/empty/success/error feedback, **When** state thay đổi, **Then** status dùng text cùng semantic treatment, không color-only; important account milestones không biến thành transient toast duy nhất.

### User Story 4 - Media library sử dụng được bằng keyboard và mobile (Priority: P2)

Là Admin thiết kế template, tôi muốn tìm/upload/chọn ảnh trong media library mà vẫn giữ editing context và có thể đóng surface để tiếp tục công việc.

**Why this priority**: Existing complex overlay cần complete interaction/accessibility lifecycle; đây là một ứng dụng thực tế của foundational surfaces.

**Independent Test**: Mở media library từ Admin authoring, dùng keyboard và viewport nhỏ để tìm/chọn/upload/đóng; focus trở về action đã mở library, existing asset operations giữ behavior.

**Acceptance Scenarios**:

1. **Given** Admin mở library, **When** surface xuất hiện, **Then** surface có accessible name, focus vào vị trí hợp lý và context phía sau không nhận interaction trái với modal state.
2. **Given** library là modal surface, **When** dùng Tab/Shift+Tab hoặc Escape/close action, **Then** focus không thoát ra background khi còn mở và trở về trigger khi đóng, nếu trigger còn tồn tại.
3. **Given** screen nhỏ, **When** tìm/chọn/upload asset, **Then** responsive sheet phù hợp complexity, controls không bị cắt và close/recovery actions luôn reachable.
4. **Given** upload/search thất bại, **When** lỗi hiển thị, **Then** local feedback giải thích next action, không giả asset đã sẵn sàng hoặc xóa editing context.
5. **Given** Customer mở invitation data editing, **When** chọn/upload ảnh thuộc quyền mình, **Then** chỉ thay image data reference; không mở Admin library hoặc chỉnh template crop/geometry/style/binding.

### Edge Cases

- Identity đổi cùng role, khác role, logout → login, peer-session change và responses về không theo thứ tự.
- Credential renewal cùng principal/resource không được làm mất unsaved data; identity/resource change không được giữ old private content.
- Source resource đã unmount hoặc trigger của library đã bị xóa khi surface đóng; không chuyển focus đến stale element.
- Public invitation unavailable/unpublished vẫn giữ truthful unavailable state; không trả draft để làm page có vẻ hoạt động.
- Font/image thất bại chỉ ở packaged environment; capture không được fallback âm thầm rồi đánh dấu output valid.
- Long Vietnamese names, accented text, 200% text zoom và multi-line errors trên viewport 360px.
- Platform style selectors vô tình tác động vào template descendants, làm đổi geometry hoặc overflow validation.
- Không có field-specific backend error: dùng local validation/general recovery phù hợp, không tự suy ra unsupported server details.
- Một static finding không reproduce trên current source: ghi evidence/verification về outcome đúng thay vì áp dụng speculative fix; requirement về privacy/output vẫn phải đạt.

## Requirements _(mandatory)_

### Functional Requirements

#### Privacy / Session / Surface Boundaries

- **FR-001**: Private screens MUST scope data, pagination, status, assets và outstanding work theo current account/resource; account change MUST loại old private state trước khi hiển thị context mới. (US1.1–5, US1.7)
- **FR-002**: Results từ prior account/resource MUST NOT commit vào current context, kể cả response thành công, lỗi, pagination hoặc navigation side effect. (US1.2–4, US1.7)
- **FR-003**: Credential renewal cùng account/resource MUST giữ valid local edits; đổi identity MUST NOT save/publish draft của account trước. (US1.5–6)
- **FR-004**: Public invitation và isolated render surfaces MUST không hiển thị private account/session chrome. Product/account/Admin navigation MUST remain available trong đúng product contexts. (US2.1, US2.5–6)
- **FR-005**: Session/layout separation MUST preserve existing authentication, authorization, refresh, ownership và public visibility rules. (US1, US2)

#### Packaged Output / Template Compatibility

- **FR-006**: Packaged application MUST phục vụ required existing invitation font faces/assets để preview/capture/public output không phụ thuộc files chỉ có trong development source tree. (US2.3)
- **FR-007**: Missing required font/image MUST có truthful failure state; publication MUST NOT được xác nhận thành công khi required output validation chưa đạt. (US2.4)
- **FR-008**: Platform foundations MUST NOT mutate pinned TemplateDesign, template palette/fonts, authored positions, revision identity hoặc existing preview/published rendering rules. (US2.2–4, US3.5)

#### Platform Foundations / Initial Adoption

- **FR-009**: In-scope platform screens MUST tuân theo approved MASTER colors, typography roles, spacing/density, containers, radius, shadows, control language và motion constraints; không tạo second visual language. (US3.1, US3.3)
- **FR-010**: Shared platform controls MUST có consistent default/hover/focus/disabled/busy/error behavior phù hợp vai trò; buttons, labels, helpers, status badges và alerts MUST theo MASTER. (US3.1–3, US3.6)
- **FR-011**: Initial visual adoption MUST bao gồm login, registration, email verification/request, password recovery/reset, social onboarding/result, account profile/password và Admin customer list/detail. Initial adoption đã hoàn tất; extension US5–US7 bên dưới mở rộng giao diện theo prototype được chủ sản phẩm duyệt. (US3.1–3)
- **FR-012**: Form labels MUST visible; field-specific errors khi có MUST liên kết accessible với field; general errors MUST có actionable recovery. Generic responses MUST không bị diễn giải thành fabricated field/business details. (US3.2, US4.4)
- **FR-013**: Feedback MUST contextual; status không color-only, async actions không báo success sớm, important milestone có persistent meaningful state và relevant next action theo existing capability. (US3.6, US4.4)
- **FR-014**: Initial adoption MUST preserve existing account journeys, safe generic registration/recovery messaging, sensitive-link handling và Admin management semantics. (US3.1–3)
- **FR-015**: Shared UI terminology MUST occasion-neutral trừ inherently wedding-specific content; reuse MUST theo actual semantics, không tạo unsupported product abstractions. (US3)

#### Accessibility / Responsive / Media Library

- **FR-016**: In-scope chrome/screens MUST dùng được ở khoảng 360/375/390/430/768/1440px, với keyboard, readable text và visible focus không bị che; không shrink desktop workspace để giả mobile support. (US3.4, US4.3)
- **FR-017**: Normal text MUST đạt contrast ≥4.5:1, large text ≥3:1 và meaningful controls/graphics ≥3:1 khi applicable; controls SHOULD có touch targets khoảng 40–44px theo MASTER. Conflict với approved baseline MUST được ghi và xử lý theo change control, không âm thầm đổi tokens. (US3.1–4)
- **FR-018**: Non-essential motion MUST reduced/disabled theo user preference; icon-only controls MUST có accessible names; meaningful headings/errors/status MUST có semantics phù hợp. (US3.2–6, US4.1)
- **FR-019**: Existing Admin media library MUST dùng context-aware complex-task surface theo MASTER, có accessible name, initial/contained/return focus khi modal, close/Escape behavior và mobile sheet phù hợp. (US4.1–3)
- **FR-020**: Media library changes MUST preserve existing authorized search/filter/pagination/upload/select behavior và local recovery; không thêm unsupported uploads hoặc asset mutations. (US4.4–5)

#### Customer Editing / Governance

- **FR-021**: Customer MUST chỉ chỉnh invitation data được actual template/binding contract hỗ trợ; MUST NOT sửa layout/style/binding, colors/fonts, section order/visibility hoặc authored crop/geometry, kể cả qua indirect settings/payload. (US4.5; feature 004 US4.2, FR-030)
- **FR-022**: Admin Template Authoring MUST giữ existing design/layer/geometry/binding capabilities riêng. Admin hỗ trợ data-entry cho Customer MUST NOT mutate pinned design trong flow đó. Feature này không implement missing assisted invitation capability. (US2.6; feature 004 FR-030)
- **FR-023**: Optional content thiếu data MUST giữ behavior 004: template-defined fallback/visibility, giữ authored khoảng trống/geometry; không thêm Customer manual section controls hoặc auto-reflow. Timeline entry content/order MAY theo actual data contract, không cấp quyền section/layer reorder. (FR-008, FR-021)
- **FR-024**: Future planning/implementation MUST trace tasks tới approved requirements và audit evidence; findings phải được verify, không coi audit risk là confirmed incident. Missing capability MUST ghi BLOCKED thay vì invent business contracts. (Toàn feature)
- **FR-025**: ui-ux-pro-max MUST chỉ hỗ trợ execution/review trong MASTER; MUST NOT chọn lại visual direction hoặc tạo authority/overrides khác. SpecKit quality/analysis gates MUST hoàn tất trước implementation theo constitution. (Toàn feature)

### Key Entities _(include if feature involves data)_

- **Current account context**: người đang đăng nhập, role và resource đang thao tác; private data/results chỉ thuộc context tương ứng.
- **Invitation draft / published invitation**: existing private data và published snapshot, design revision được ghim; feature không thêm persistence fields.
- **Template / TemplateDesign**: Admin-owned authored design và bindings; Customer nhập data theo design, không chỉnh design.
- **Platform control / surface**: product-owned form/action/status/overlay; tuân MASTER và độc lập với template appearance.
- **Media asset**: existing authorized image/reference; upload/select không đồng nghĩa được sửa authored presentation.

### Scope Boundaries

**In scope:** platform foundations với initial adoption ở FR-011; principal-scoped state reliability trên existing Customer/Admin private screens; public/capture session isolation; packaged existing template fonts/assets; accessibility lifecycle của existing Admin media library. Audit references chính: F01, F02, F05 (foundations only), F10, F11; shared feedback/semantics trong phạm vi FR-011.

**Out of scope (updated 2026-10-11):** public catalog/preview backend changes; Collections/Favorites; new title/cover/filter/duplicate/delete contracts; renderer document/schema/mobile reflow changes; template image/heading accessibility metadata migration; new occasions; assisted invitation endpoints; payments/analytics/guests; deployment/publishing. Admin authoring canvas redesign không thuộc scope.

F03/F04/F06/F07/F08/F09/F12/F13 và phần F14 ngoài initial controls giữ trong future feature backlog. Việc defer MUST không được diễn giải thành toàn product đã đạt MASTER/WCAG hoặc release-ready. Customer design editing không phải deferred backlog: **prohibited** cho tới explicit requirement change.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% account/resource-switch scenarios US1 đạt zero prior-account private records/edits/status xuất hiện hoặc được commit cho context mới; bao gồm same-role switch, logout/login, stale completion và failed reload. (FR-001–003)
- **SC-002**: 100% credential-renewal scenarios cùng account/resource giữ valid unsaved edits. (FR-003)
- **SC-003**: Anonymous và authenticated viewers của cùng published version thấy zero account email/logout/product-session controls trong invitation; isolated render surface cũng không có account chrome. (FR-004–005)
- **SC-004**: Existing invitation fonts required bởi selected verification templates đều load từ packaged application; missing required asset không tạo false successful publication. (FR-006–008)
- **SC-005**: Tất cả screens FR-011 được review theo MASTER và có zero unapproved visual-system deviations; core existing journeys vẫn hoàn thành mà không cần capability mới. (FR-009–015)
- **SC-006**: In-scope screen journeys hoàn thành bằng keyboard tại 360/375/390/430/768/1440px; zero inaccessible essential actions hoặc obscured focus; representative long Vietnamese/error content readable ở 200% text zoom. (FR-016–018)
- **SC-007**: Admin hoàn thành media-library open/search/select/close bằng keyboard và mobile; mọi modal lifecycle case US4 trả focus đúng hoặc safe fallback khi trigger không còn; no unintended background interaction. (FR-019–020)
- **SC-008**: Customer data-editing regression scenarios có zero changes vào authored layout/style/binding/pinned design và zero exposed Customer design controls; existing Admin authoring actions tiếp tục hoạt động. (FR-021–023)
- **SC-009**: Mỗi in-scope audit finding có verification evidence về satisfied outcome và mỗi implementation task có requirement trace; không có unresolved mandatory requirement hoặc CRITICAL/HIGH cross-artifact finding khi đi vào implementation. (FR-024–025)

## Assumptions

- [Constitution](../../.specify/memory/constitution.md) quản lý governance; [MASTER](../../docs/design/MASTER.md) quản lý UI/UX; [AUDIT](../../docs/frontend/AUDIT.md) là source-state/evidence index, không thay executable contracts.
- Approved clarification 2026-10-06 giữ [feature 004](../004-invitation-builder/spec.md) Customer restriction. MASTER/AUDIT đã đồng bộ; feature 005 không supersede restriction hoặc Admin authoring requirements của 004.
- Existing account, invitation, asset và publication behavior là baseline compatibility. U1-B đã xác định cần IAM reliability refinement: [006 IAM Auth Transition Reliability](../006-iam-auth-transition-reliability/spec.md) owns required auth contract/recovery work và minimal auth integration. Feature 005 không tự thêm backend capability/migration; actual approved/verified 006 contract sẽ được re-inspect trước integration.
- Dependency approval 2026-10-06 (“áp dụng như đề xuất”) chỉ authorize specification/dependency documentation, không application/backend code hoặc migrations. 005 application implementation entry vẫn BLOCKED cho đến completed/verified 006 handoff và re-analysis; privacy requirements/SC giữ nguyên. 006 không phụ thuộc runtime implementation của 005.
- Initial foundation adoption cố ý giới hạn FR-011; existing catalogue/customer editor/Admin authoring có thể chưa đạt full visual redesign ngoài reliability changes của feature này. Template controls nằm trong renderer chưa được restyle toàn bộ trong feature 005.
- Verification dùng existing supported templates/fixtures và safe owned test resources, không dữ liệu production. Planning sẽ định nghĩa bounded commands/dependencies/cleanup theo constitution.
- Dates/fonts/layout/data contract limits theo actual source; không tự thêm font IDs, responsive template schema hoặc customer settings để giải design issue.
- Documentation bằng tiếng Việt, technical/design terminology và normative terms bằng English. Không cần hỏi lại palette/fonts/editor choices đã duyệt.
- Không có `.specify/extensions.yml` tại bước specify; không có before/after hooks hoặc branch change. Spec chỉ đánh dấu requirements ready for planning, không xác nhận implementation hoàn tất.

## Approved extension — Prototype integration (2026-10-11)

Chủ sản phẩm yêu cầu đưa FE đã chốt trong `apps/ui-prototype` vào module 005 và bắt đầu phát triển với backend hiện tại. Phạm vi này thay thế các giới hạn initial adoption về Home, catalog, Customer workspace và editor ở trên. Lịch sử US1–US4, evidence và restriction Customer design vẫn giữ nguyên. [UI-DESIGN](../../docs/frontend/UI-DESIGN.md) mô tả composition được duyệt; MASTER là visual authority.

### User Story 5 - Nhận diện và điều hướng sản phẩm (Priority: P1)

Người dùng nhận ra Tiệm làm thiệp và đi từ trang chủ tới mẫu thiệp hoặc tài khoản bằng giao diện đã duyệt.

**Independent Test**: Mở trang chủ khi chưa đăng nhập; đăng nhập Customer/Admin; dùng avatar bằng bàn phím; đổi hồ sơ và đăng xuất; kiểm header/footer trên mobile và desktop.

**Acceptance Scenarios**:

1. Header/footer ghi “Tiệm làm thiệp”; tab trình duyệt có ảnh branding. Header chỉ giữ logo/tên, không có tagline hoặc link Thiệp của tôi bên cạnh avatar. Footer hiện plain text `tiemlamthiep@gmail.com`, không mở ứng dụng email.
2. Trang chủ có editorial hero, hình minh họa, lời giới thiệu và bước tạo thiệp theo prototype; CTA dẫn tới luồng phù hợp quyền hiện tại. Hình minh họa không được trình bày như mẫu đang xuất bản khi chưa tải được catalog.
3. Avatar hiển thị thông tin phiên hiện tại; Customer có Tổng quan/Thiệp của tôi/Hồ sơ/Tạo thiệp; Admin có quản trị. Escape đóng và trả focus, click ngoài đóng; logout giữ xác nhận rời bản chưa lưu và chính sách phiên hiện có.
4. Product chrome không xuất hiện trên public invitation hoặc isolated capture; nội dung private không còn sau đổi owner.

### User Story 6 - Khám phá mẫu và quản lý thiệp (Priority: P1)

Customer chọn mẫu trong popup, xem demo riêng và quản lý thiệp đã tạo với dữ liệu thật.

**Independent Test**: Đăng nhập Customer, tìm/lọc/tải thêm mẫu, mở/đóng popup, xem demo, dùng đúng revision để tạo thiệp, xem danh sách và sửa hồ sơ; kiểm trường hợp lỗi và đổi account.

**Acceptance Scenarios**:

1. Chọn thẻ mẫu mở popup tại gallery; preview khung chữ nhật mobile390px, không khung iPhone hoặc mobile/desktop selector. Popup có tên/tag/thông tin theo dữ liệu được hỗ trợ, QR dẫn demo, chọn mẫu và xem demo; có keyboard containment/return focus.
2. Demo có lời mời mở thiệp: desktop card giữa nền beige rộng tối đa600px, tên/ngày/nút Mở thiệp; sau mở dùng cùng renderer. Document v2 adaptive tối đa900px desktop, legacy v1 giữ behavior cũ. Demo không nhận RSVP thật.
3. Catalog chỉ Customer theo quyền hiện tại; loading/error/empty/retry/pagination và protected assets dùng dữ liệu thật. Create ghim published revision; mẫu unavailable yêu cầu tải lại, không tự đoán revision.
4. Workspace có sidebar desktop và navigation mobile, overview/list/account. Số liệu phải ghi rõ phạm vi trang nếu chỉ đọc một page; không invent quota, số lượt xem, favorites, wallet hoặc tổng khách. Profile lưu thật và cập nhật tên tại avatar.

### User Story 7 - Chỉnh sửa dữ liệu thiệp theo giao diện đã chốt (Priority: P1)

Customer nhập nội dung bằng accordion một cột và xem trước/xuất bản với dữ liệu thật, giữ quyền và recovery hiện hành.

**Independent Test**: Sửa tên/ảnh/lễ-tiệc, đổi tab preview, lưu/xuất bản/ngừng xuất bản; kiểm lỗi/conflict và rời trang khi dirty, rồi mở public snapshot.

**Acceptance Scenarios**:

1. Toolbar có back/tên mẫu, Chỉnh sửa/Xem trước, lưu/xuất bản. Form accordion tối đa720px; field ngắn hai cột desktop, một cột mobile; date/venue cùng chiều cao44px, address toàn hàng. Nhóm render theo formFields được ghim.
2. Preview/editor fullscreen dùng mobile390px; không có Customer layout/style/binding/font/crop controls. Chuyển tab không mất local edits.
3. Lưu dùng expectedVersion thật; autosave nếu bật phải serialize, giữ edits mới, không auto-merge conflict hoặc replay outcome uncertain. Publish chỉ báo thành công sau confirmed operation; lifecycle/link refresh là bước đọc độc lập có recovery, lỗi refresh không đảo ngược publication đã confirmed và không hiển thị URL chưa được xác nhận. Public giữ snapshot trước khi publish thành công.
4. Upload/chọn ảnh, RSVP owner, auth và Admin existing actions vẫn dùng backend hiện tại, có recovery/lifetime guards; giao diện platform thống nhất MASTER.

### Extension requirements

- **FR-026**: US5 product branding/navigation/home MUST khớp các acceptance scenarios và MASTER.
- **FR-027**: US6 gallery/popup/demo MUST sử dụng authorized published revision/assets và pinned creation; không mở anonymous backend access.
- **FR-028**: US6 workspace/profile MUST sử dụng actual session/owner data, truthful pagination/statistics và persistence hiện có.
- **FR-029**: US7 editor MUST giữ data-only, versioning/publication/dirty-navigation và asset authorization; UI theo accordion đã duyệt.
- **FR-030**: Extension MUST reuse shared renderer hiện có; v2 desktop900/mobile480 và mobile preview390 theo host policy của007; không tự migrate legacy hoặc repin invitation.
- **FR-031**: Extension MUST có regression evidence về keyboard/focus, responsive, principal isolation, publication và product/public boundaries; tests trước code cho behavior thay đổi.

### Extension success criteria

- **SC-010**: US5–US7 primary journeys hoàn thành bằng dữ liệu thật; zero prototype mocks/review toolbar/role selector trong product.
- **SC-011**: Các surfaces mới dùng được ở360/375/390/430/768/1440px, không horizontal overflow; essential controls keyboard reachable và popup focus quay về đúng trigger.
- **SC-012**: Zero cross-owner stale UI/actions và zero product chrome trong public/capture; pinned revision, public snapshot và existing IAM/builder regression gates tiếp tục đạt.

**Assumptions/dependencies**: Backend không thêm endpoint/schema cho UI-only extension; 006 session contract và007 renderer là dependency hiện có. Unsupported pricing/favorites/gifts/export/analytics không đưa vào navigation. Publication/RSVP evidence phải chạy trên backend thật; prototype test không thay thế.


## Approved extension — complete prototype mapping and Admin authoring (2026-10-11)

User authorizes autonomous implementation, commands and parallel work. Historical completion through T101 is retained as a checkpoint, not acceptance of this expanded scope. All product UI implemented in the approved prototype must be mapped to production; prototype-only review controls/mock messages and nonexistent backend capabilities are excluded. Existing data-only Customer policy, manual-save/version/ownership/publication contracts remain binding.

### US8 — Complete platform and Customer prototype parity (P1)

1. Home/header/footer, gallery/popup/demo, overview/invitations/profile, all seven auth routes, Customer editor/media/publish success and owner RSVP map their prototype composition, copy, tokens and responsive behavior to actual backend data.
2. Customer image selection uses the existing scoped asset library and preserves upload/binding/cancellation; event date uses a user-friendly local date/time control with truthful timezone handling and unchanged ISO payload. Uncertain operations never replay as a new action.
3. No fake identity/totals/covers/unsupported controls or prototype review/scenario/role widgets are shipped. Public invitations remain authored renderer output, isolated from product chrome; template appearance is not replaced by mock designs.

### US9 — Complete Admin management and improved template creation/authoring (P1)

1. Admin template/customer list/detail and template creation have complete prototype-level headings, filters, cards/rows, actions and meaningful loading/error/empty/recovery states using real APIs.
2. New template creation provides guided metadata and schema-version selection, clear next step, validation, retained fields on failure and guarded one-request creation/navigation; current contract/defaults are preserved.
3. Both legacy and responsive authoring provide a coherent toolbar, components/layers, canvas, contextual properties/bindings/sample data and media/publication controls; desktop and mobile task panels remain usable. Existing Craft/Moveable geometry, history, zoom, versions, assets and trusted publication stay functional. No replacement engine or new backend business capability.

### US10 — Repeat implementation and visual/functional comparison (P1)

1. A route/control mapping inventory names every prototype product screen and production counterpart, with explicit intentional backend/renderer differences.
2. Paired prototype/actual screenshots at390/1440px and named layout/behavior checks drive remediation loops until every mapped screen is reviewed with no unresolved unintended mismatch. Review chrome may be hidden only on the prototype; actual product chrome remains visible.
3. Existing reliability/ownership/publication regression gates and affected builder/IAM/package compatibility pass after final code. Functional test PASS alone cannot establish visual parity; evidence includes inspected paired images, gap disposition, source checkpoint and owned cleanup.

- **FR-032**: All prototype product UI screens and supported controls MUST have an explicit production mapping and implemented equivalent; exclusions require a documented actual-contract reason. (US8/US9)
- **FR-033**: Customer media/date/publication surfaces MUST retain data-only contracts and owner/version/recovery invariants while matching approved interaction/design. (US8)
- **FR-034**: Admin management/create MUST match prototype visual language with real controls and complete recovery; creation enhancements MUST use existing API metadata/schema semantics. (US9)
- **FR-035**: Admin legacy/responsive authoring MUST improve workspace usability while preserving renderer/authoring/publication behavior and mobile alternatives. (US9)
- **FR-036**: Completion MUST include iterative screenshot/interaction comparison, gap disposition and affected real-backend regression evidence. (US10)
- **SC-013**: Every mapped product screen has reviewed390/1440 evidence and no unresolved unintended visual/interaction mismatch.
- **SC-014**: Admin can create a real draft, author components/bindings/assets/sample data, save/reload/preview/publish on the supported schema paths without losing existing capabilities.
- **SC-015**: Expanded acceptance, independent web checks and affected compatibility/package gates pass; screenshots and functional evidence are recorded separately.
