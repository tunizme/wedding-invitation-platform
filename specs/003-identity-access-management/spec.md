# Feature Specification: Feature 2 — Identity & Access Management

**Feature Branch**: `N/A — specification-only; no branch hook is configured`

**Created**: 2026-09-26

**Status**: Draft — clarification A1–A3 completed

**Input**: User description: "Xây dựng đặc tả cho Feature 2: Identity & Access Management của website tạo thiệp cưới online có mục tiêu thương mại hóa."

## Clarifications

### Session 2026-09-26

- Q: MVP có nên giữ nguyên quy tắc mỗi tài khoản chỉ có một phương thức đăng nhập và hoàn toàn không hỗ trợ Account linking/unlinking không? → A: Xác nhận; mỗi tài khoản chỉ có LOCAL, GOOGLE hoặc FACEBOOK, không có Account linking/unlinking trong MVP.
- Q: Tài khoản LOCAL chưa xác minh email có được đăng nhập ngay, trong khi xác minh email LOCAL và Forgot Password vẫn để sang feature sau không? → A: Không; Feature 2 phải bao gồm xác minh email LOCAL và Forgot Password, và LOCAL account phải xác minh email trước khi đăng nhập.
- Q: Khi domain frontend và API chưa được quyết định, đặc tả có nên tiếp tục để topology domain cùng cấu hình cookie, CORS, CSRF và OAuth session handoff sang bước plan không? → A: Xác nhận; topology domain và cấu hình chi tiết được quyết định tại plan, trong khi các bảo vệ bắt buộc trong spec vẫn giữ nguyên.
- Q: Sau khi social onboarding xác minh email thành công, người dùng có được đăng nhập ngay bằng phiên mới không? → A: Có; tạo social account và cấp một phiên mới ngay sau khi xác minh thành công.
- Q: Khi Guest đăng ký LOCAL bằng email đã tồn tại, phản hồi bên ngoài có được tiết lộ rằng email đó đã có tài khoản không? → A: Không; dùng phản hồi chung, không tiết lộ email đã tồn tại.

### Session 2026-09-27

- Q: Facebook login lần đầu có luôn phải qua platform email verification dù Facebook đã trả email hợp lệ không? → A: Không; theo business policy mới, email hợp lệ do Facebook trả về sau callback đã được kiểm tra đầy đủ được xem là đã xác minh để tạo account/session ngay. Chỉ khi Facebook thiếu email hoặc email không hợp lệ mới chuyển sang social onboarding để nhập và xác minh email.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Đăng ký tài khoản local (Priority: P1)

Là Guest, tôi muốn đăng ký bằng email và mật khẩu để có một tài khoản Customer riêng và có thể đăng nhập sau đó.

**Why this priority**: Đây là điểm vào độc lập, tối thiểu để hình thành tập khách hàng sở hữu tài nguyên và là nền tảng cho các luồng thương mại sau này.

**Independent Test**: Có thể kiểm thử bằng việc đăng ký một email mới, xác nhận tài khoản Customer ở trạng thái ACTIVE được tạo đúng một lần, không có phiên tự động, và người dùng được chuyển sang bước xác minh email.

**Acceptance Scenarios**:

1. **Given** một Guest cung cấp email hợp lệ chưa được dùng và mật khẩu đạt chính sách, **When** đăng ký, **Then** đúng một tài khoản LOCAL có role CUSTOMER, status ACTIVE và email chưa xác minh được tạo, mật khẩu được lưu ở dạng hash một chiều, không cấp phiên và người dùng được chuyển sang xác minh email.
2. **Given** email đã tồn tại dưới bất kỳ cách viết hoa/thường hoặc khoảng trắng đầu/cuối nào, **When** Guest đăng ký, **Then** không tạo tài khoản thứ hai và phản hồi bên ngoài không tiết lộ email đã tồn tại.
3. **Given** hai yêu cầu đăng ký đồng thời dùng cùng một email sau normalize, **When** cả hai được xử lý, **Then** nhiều nhất một yêu cầu tạo thành công và chỉ tồn tại một tài khoản.
4. **Given** email có dấu chấm hoặc phần `+tag` hợp lệ, **When** đăng ký, **Then** hệ thống chỉ trim và lowercase, không tự loại dấu chấm hoặc `+tag`.
5. **Given** mật khẩu có khoảng trắng, chữ hoa/thường hoặc dài hơn mức tối thiểu, **When** đăng ký, **Then** mật khẩu được đánh giá và hash đúng nguyên văn, không trim, đổi hoa/thường hoặc âm thầm cắt ngắn.
6. **Given** bất kỳ kết quả hoặc log nào của luồng đăng ký, **When** được kiểm tra, **Then** không có mật khẩu rõ, password hash hoặc secret xác thực.

---

### User Story 2 - Xác minh email local và khôi phục mật khẩu (Priority: P1)

Là Customer LOCAL, tôi muốn xác minh email sau đăng ký và đặt lại mật khẩu khi quên để có thể đăng nhập và tự khôi phục quyền truy cập an toàn.

**Why this priority**: Email verification là điều kiện đăng nhập LOCAL, còn Forgot Password ngăn Customer bị mất vĩnh viễn quyền truy cập vào account thương mại.

**Independent Test**: Có thể kiểm thử verification/reset proof hợp lệ, hết hạn, đã dùng, resend, email không tồn tại, password mới không hợp lệ và revocation sau reset.

**Acceptance Scenarios**:

1. **Given** LOCAL account chưa xác minh và verification proof hợp lệ, chưa hết hạn, chưa dùng, **When** Customer xác minh email, **Then** email_verified trở thành true, proof bị vô hiệu hóa và account đủ điều kiện đăng nhập.
2. **Given** verification proof hết hạn hoặc đã dùng, **When** Customer gửi lại, **Then** yêu cầu bị từ chối và trạng thái email không thay đổi.
3. **Given** Customer yêu cầu gửi lại email xác minh quá ngưỡng, **When** tiếp tục yêu cầu, **Then** thao tác bị giới hạn mà không làm lộ thêm thông tin account.
4. **Given** Guest gửi Forgot Password với email tồn tại hoặc không tồn tại, **When** yêu cầu được nhận, **Then** phản hồi bên ngoài là như nhau và chỉ account LOCAL có email đã xác minh mới có thể nhận reset proof.
5. **Given** reset proof hợp lệ, chưa hết hạn, chưa dùng và password mới đạt chính sách, **When** Customer đặt lại password, **Then** password được thay đổi, proof bị vô hiệu hóa và mọi Refresh Token của user bị thu hồi.
6. **Given** reset proof hết hạn, đã dùng hoặc password mới không đạt chính sách, **When** reset được gửi, **Then** password và session state không thay đổi.
7. **Given** email chưa xác minh, **When** dùng Forgot Password, **Then** email đó không được coi là bằng chứng ownership; Customer phải hoàn tất email verification flow thay vì được reset password.

---

### User Story 3 - Đăng nhập local và duy trì phiên cơ bản (Priority: P1)

Là Customer có tài khoản LOCAL, tôi muốn đăng nhập bằng email và mật khẩu để truy cập tài khoản và tài nguyên thuộc sở hữu của mình.

**Why this priority**: Đăng nhập và kiểm tra trạng thái tài khoản là dependency trực tiếp của mọi hành vi cần xác thực.

**Independent Test**: Chỉ LOCAL ACTIVE có email_verified=true và credential đúng tạo phiên độc lập; kiểm thử riêng LOCKED, unverified, email không tồn tại và password sai đều không tạo phiên.

**Acceptance Scenarios**:

1. **Given** tài khoản LOCAL ACTIVE có email_verified=true và thông tin đăng nhập đúng, **When** Customer đăng nhập, **Then** một phiên mới được tạo và cấp credential truy cập phù hợp.
2. **Given** email không tồn tại hoặc mật khẩu sai, **When** đăng nhập, **Then** hệ thống trả cùng một thông điệp lỗi chung, không tiết lộ email có tồn tại hay không.
3. **Given** tài khoản LOCAL LOCKED, **When** cung cấp đúng mật khẩu, **Then** không có phiên mới được tạo.
4. **Given** tài khoản LOCAL chưa xác minh email, **When** cung cấp đúng thông tin và tài khoản ACTIVE, **Then** không có session được tạo và người dùng được hướng dẫn hoàn tất xác minh email mà không làm lộ thêm thông tin account.
5. **Given** nhiều lần đăng nhập hợp lệ trên các trình duyệt, **When** từng lần hoàn tất, **Then** mỗi lần tạo một phiên độc lập và “thiết bị hiện tại” chỉ có nghĩa là phiên trình duyệt hiện tại.
6. **Given** thao tác đăng nhập hoặc đăng ký bị lặp với tần suất bất thường, **When** vượt ngưỡng bảo vệ đã cấu hình, **Then** yêu cầu tiếp theo bị giới hạn mà không tiết lộ trạng thái tài khoản.

---

### User Story 4 - Làm mới và kết thúc phiên (Priority: P1)

Là Customer hoặc Admin đã đăng nhập, tôi muốn làm mới phiên, đăng xuất phiên hiện tại hoặc đăng xuất mọi phiên để duy trì truy cập liên tục và chủ động kiểm soát các phiên của mình.

**Why this priority**: Phiên tối thiểu là dependency của login và authorization; rotation và revocation phải tồn tại cùng luồng đăng nhập thay vì được bổ sung cuối dự án.

**Independent Test**: Có thể kiểm thử một phiên trong toàn bộ vòng đời 14 ngày, gồm refresh rotation, reuse, hai refresh đồng thời, logout hiện tại và logout-all.

**Acceptance Scenarios**:

1. **Given** phiên ACTIVE, user ACTIVE và Refresh Token hợp lệ, chưa hết hạn, chưa bị thu hồi, **When** refresh thành công, **Then** Access Token mới tối đa 15 phút và Refresh Token mới được cấp, token cũ bị vô hiệu hóa nguyên tử, còn hạn tuyệt đối của phiên không đổi.
2. **Given** Refresh Token đã được rotation, **When** token cũ bị dùng lại, **Then** yêu cầu bị từ chối và toàn bộ chuỗi refresh token thuộc phiên liên quan bị thu hồi.
3. **Given** hai yêu cầu refresh đồng thời dùng cùng credential, **When** được xử lý, **Then** kết quả tuân theo chính sách concurrency/retry duy nhất được chốt tại plan, không tạo nhiều nhánh token hợp lệ và không gây vòng lặp refresh ở frontend.
4. **Given** phiên đã đủ 14 ngày kể từ lần đăng nhập, **When** refresh, **Then** yêu cầu bị từ chối dù phiên đã từng rotation gần đó.
5. **Given** Access Token đã hết hạn nhưng Refresh Token phiên hiện tại còn nhận diện được, **When** người dùng logout, **Then** phiên hiện tại bị thu hồi, cookie bị xóa và thao tác vẫn hoàn tất.
6. **Given** logout hiện tại đã hoàn tất, **When** lặp lại logout, **Then** kết quả vẫn thành công về mặt nghiệp vụ và không thu hồi phiên khác.
7. **Given** user có nhiều phiên, **When** thực hiện logout-all với một phiên đã xác thực, **Then** mọi Refresh Token của user bị thu hồi và không phiên nào refresh tiếp được.
8. **Given** logout, logout-all, đổi mật khẩu hoặc khóa tài khoản vừa xảy ra, **When** một Access Token đã cấp trước đó được dùng, **Then** có thể còn hiệu lực đến hết TTL tối đa 15 phút; acceptance không yêu cầu thu hồi Access Token tức thì.

---

### User Story 5 - Hoàn tất social onboarding an toàn (Priority: P1)

Là Guest đăng nhập qua Google hoặc Facebook nhưng provider thiếu email hoặc chưa đưa ra bằng chứng xác minh email đáng tin cậy, tôi muốn nhập và xác minh email để hoàn tất tài khoản mà không tạo tài khoản truy cập được một phần.

**Why this priority**: Đây là hàng rào an toàn bắt buộc trước khi social authentication có thể tạo Customer trong mọi trường hợp provider response.

**Independent Test**: Có thể dùng provider response giả lập thiếu email/bằng chứng, hoàn tất hoặc làm hết hạn onboarding, gửi lại xác minh và tạo xung đột email trước thời điểm hoàn tất.

**Acceptance Scenarios**:

1. **Given** provider không trả email hoặc email không có bằng chứng xác minh phù hợp, **When** callback hợp lệ hoàn tất, **Then** chỉ tạo onboarding tạm thời có thời hạn, chưa tạo tài khoản đăng nhập được và chưa cấp phiên Customer.
2. **Given** onboarding tạm thời hợp lệ, **When** Guest nhập email chưa được dùng và xác minh quyền sở hữu bằng bằng chứng hợp lệ dùng một lần, **Then** hệ thống kiểm tra lại email và identity duy nhất, tạo đúng một Customer social-only ACTIVE và cấp một phiên mới ngay trong flow đó.
3. **Given** mã/bằng chứng onboarding hoặc xác minh đã hết hạn hay đã dùng, **When** được gửi lại, **Then** yêu cầu bị từ chối và không tạo tài khoản.
4. **Given** Guest yêu cầu gửi lại hoặc thử xác minh quá ngưỡng, **When** tiếp tục yêu cầu, **Then** thao tác bị giới hạn theo chính sách và không làm lộ tài khoản hiện hữu.
5. **Given** email được xác minh đã bị tài khoản khác chiếm trước thời điểm hoàn tất, **When** onboarding hoàn tất, **Then** không tạo hoặc liên kết tài khoản; người dùng được hướng dẫn dùng phương thức đã đăng ký mà không bị tiết lộ provider gắn với tài khoản.
6. **Given** người dùng hủy OAuth, provider từ chối, onboarding hết hạn hoặc gửi mail thất bại, **When** flow kết thúc, **Then** không có tài khoản đăng nhập được một phần hoặc phiên Customer nào được tạo.

---

### User Story 6 - Đăng ký hoặc đăng nhập bằng Google (Priority: P2)

Là Guest, tôi muốn dùng Google để đăng ký hoặc đăng nhập nhanh mà không phải tạo mật khẩu local.

**Why this priority**: Google giảm ma sát chuyển đổi cho sản phẩm thương mại nhưng phụ thuộc hàng rào session và social onboarding đã có.

**Independent Test**: Có thể kiểm thử lần đầu và lần sau với identity Google, email mới, email trùng, email provider thay đổi, callback không hợp lệ và redirect không được phép.

**Acceptance Scenarios**:

1. **Given** callback Google hợp lệ, identity chưa tồn tại, email hợp lệ chưa được dùng và có bằng chứng xác minh được chấp nhận, **When** flow hoàn tất, **Then** đúng một Customer GOOGLE ACTIVE được tạo, không yêu cầu password và role không lấy từ provider.
2. **Given** identity Google đã tồn tại và user ACTIVE, **When** đăng nhập lần sau, **Then** đúng user gắn với provider + providerSubject được dùng dù email provider đã thay đổi.
3. **Given** identity Google chưa tồn tại nhưng email trùng tài khoản sẵn có, **When** callback hoàn tất, **Then** hệ thống không đăng nhập vào tài khoản đó, không tự liên kết, không tạo tài khoản trùng và chỉ hướng dẫn dùng phương thức đã đăng ký mà không tiết lộ provider hiện hữu.
4. **Given** user gắn với identity Google đang LOCKED, **When** đăng nhập social, **Then** không tạo phiên mới.
5. **Given** state sai, callback hết hạn hoặc callback đã dùng, **When** callback được nhận, **Then** yêu cầu bị từ chối và không tạo user hoặc phiên.
6. **Given** redirect đích không thuộc allowlist, **When** bắt đầu hoặc hoàn tất flow, **Then** redirect bị từ chối.
7. **Given** dữ liệu identity/email do frontend tự khai báo hoặc response provider không vượt qua kiểm tra giao thức, **When** backend xử lý, **Then** dữ liệu đó không được tin dùng để đăng nhập hoặc tạo tài khoản.

---

### User Story 7 - Đăng ký hoặc đăng nhập bằng Facebook (Priority: P2)

Là Guest, tôi muốn dùng Facebook để đăng ký hoặc đăng nhập nhanh mà không phải tạo mật khẩu local.

**Why this priority**: Facebook mở rộng kênh acquisition sau khi cùng quy tắc social identity và onboarding đã được chứng minh với Google.

**Independent Test**: Có thể kiểm thử lần đầu với Facebook email hợp lệ tạo account/session ngay, email thiếu chuyển sang onboarding, cùng các trường hợp identity lặp lại, email trùng, callback hủy/sai ràng buộc và tài khoản LOCKED.

**Acceptance Scenarios**:

1. **Given** callback Facebook đã vượt qua kiểm tra giao thức, identity chưa tồn tại và Facebook trả email hợp lệ chưa được dùng, **When** flow hoàn tất, **Then** email được xem là đã xác minh theo business policy, đúng một Customer FACEBOOK ACTIVE và một phiên được tạo ngay, không yêu cầu password, không chuyển qua social onboarding và role không lấy từ provider.
2. **Given** identity Facebook đã tồn tại và user ACTIVE, **When** đăng nhập lần sau, **Then** đúng user gắn với provider + providerSubject được dùng dù email provider đã thay đổi.
3. **Given** identity Facebook chưa tồn tại nhưng email trùng tài khoản sẵn có, **When** callback hoàn tất, **Then** không tự liên kết, không cấp truy cập tài khoản hiện hữu và không tạo tài khoản trùng.
4. **Given** Facebook không trả email hoặc trả email không hợp lệ, **When** callback hợp lệ hoàn tất, **Then** người dùng phải đi qua social onboarding và xác minh email trước khi có tài khoản hoặc phiên Customer.
5. **Given** user gắn với identity Facebook đang LOCKED, **When** đăng nhập, **Then** không tạo phiên mới.
6. **Given** người dùng hủy provider flow, state sai, callback hết hạn hoặc đã dùng, **When** quay lại hệ thống, **Then** flow bị từ chối an toàn và không tạo tài khoản một phần.

---

### User Story 8 - Xem, cập nhật profile và đổi mật khẩu (Priority: P2)

Là Customer, tôi muốn xem thông tin tài khoản an toàn, cập nhật thông tin cá nhân được phép và đổi mật khẩu LOCAL để duy trì hồ sơ và bảo vệ tài khoản.

**Why this priority**: Self-service profile và credential hygiene cần thiết cho tài khoản thương mại, nhưng không chặn việc đăng ký/đăng nhập cốt lõi.

**Independent Test**: Có thể kiểm thử đọc/sửa profile bằng Customer, thử sửa field đặc quyền, đổi mật khẩu LOCAL và gọi đổi mật khẩu từ social-only account.

**Acceptance Scenarios**:

1. **Given** Customer đã xác thực, **When** xem profile, **Then** chỉ nhận thông tin tài khoản an toàn, không có password hash, token, secret hoặc dữ liệu identity nhạy cảm.
2. **Given** Customer cập nhật `display_name` và `phone_number` tùy chọn, **When** dữ liệu hợp lệ, **Then** các trường được phép được cập nhật; `phone_number` vẫn được ghi nhận là chưa xác minh.
3. **Given** Customer gửi thay đổi email, role, status, email_verified, password_hash hoặc identity qua profile, **When** yêu cầu được xử lý, **Then** các field đặc quyền không thay đổi.
4. **Given** Customer LOCAL đã xác thực và cung cấp đúng mật khẩu hiện tại cùng mật khẩu mới đạt chính sách, **When** đổi mật khẩu, **Then** mật khẩu được thay đổi, mọi Refresh Token bị thu hồi, cookie phiên hiện tại bị xóa và người dùng phải đăng nhập lại.
5. **Given** mật khẩu hiện tại sai hoặc mật khẩu mới không đạt chính sách, **When** đổi mật khẩu, **Then** mật khẩu và các phiên vẫn không đổi.
6. **Given** tài khoản GOOGLE hoặc FACEBOOK social-only, **When** gọi đổi mật khẩu, **Then** nhận phản hồi rõ thao tác không áp dụng và không thể dùng luồng này để thêm LOCAL/password.
7. **Given** social provider cung cấp avatar khi tạo tài khoản, **When** tài khoản được hoàn tất, **Then** avatar có thể được lưu làm giá trị ban đầu; người dùng không có chức năng upload avatar trong feature này.

---

### User Story 9 - Bảo vệ role và ownership (Priority: P1)

Là chủ tài khoản, tôi muốn chỉ mình hoặc Admin được ủy quyền mới có thể truy cập dữ liệu phù hợp để tài nguyên thương mại không bị lộ hoặc sửa chéo.

**Why this priority**: Authentication không có giá trị nếu authorization và ownership không được thực thi ngay từ vertical slice đầu tiên có tài nguyên được bảo vệ.

**Independent Test**: Có thể kiểm thử ma trận Guest/CUSTOMER/ADMIN trên profile, Admin capability và một tài nguyên sở hữu đã tồn tại; nếu tài nguyên chưa tồn tại thì xác minh dependency contract thay vì tạo module giả.

**Acceptance Scenarios**:

1. **Given** Guest, **When** truy cập nội dung public hoặc luồng đăng ký/đăng nhập, **Then** được phép theo từng luồng; PUBLIC/GUEST không được lưu như role.
2. **Given** CUSTOMER, **When** truy cập Admin capability, **Then** bị từ chối.
3. **Given** CUSTOMER A, **When** gửi `userId` hoặc `ownerId` của CUSTOMER B để truy cập tài nguyên thuộc sở hữu B, **Then** backend bỏ qua tuyên bố đặc quyền từ frontend và từ chối truy cập.
4. **Given** request có role do frontend tự khai báo khác role đã được xác thực, **When** authorization chạy, **Then** role từ frontend không được tin dùng.
5. **Given** ADMIN đã xác thực, **When** dùng capability quản trị Customer được định nghĩa trong feature này, **Then** được phép; các capability quản lý template, thiệp, đơn hàng hoặc thanh toán không tự phát sinh.

---

### User Story 10 - Admin quản lý trạng thái Customer (Priority: P3)

Là Admin, tôi muốn tìm, xem, khóa và mở khóa Customer để xử lý abuse hoặc hỗ trợ vận hành mà không can thiệp vào tài khoản Admin khác.

**Why this priority**: Đây là năng lực vận hành cần cho thương mại hóa nhưng có thể triển khai sau khi identity, session và role enforcement ổn định.

**Independent Test**: Có thể kiểm thử danh sách/phân trang/tìm/lọc, chi tiết an toàn, khóa/mở khóa, audit và các thao tác bị cấm với ADMIN hoặc chính mình.

**Acceptance Scenarios**:

1. **Given** ADMIN đã xác thực, **When** xem danh sách Customer, **Then** có thể phân trang, tìm theo email/tên và lọc ACTIVE/LOCKED mà không trả secret.
2. **Given** ADMIN đã xác thực, **When** xem chi tiết Customer, **Then** nhận thông tin cần cho quản trị nhưng không nhận password hash, token, authorization code, provider token hoặc secret.
3. **Given** Customer ACTIVE, **When** ADMIN khóa tài khoản, **Then** status thành LOCKED, mọi Refresh Token của Customer bị thu hồi và audit event ghi actor, target, thời điểm, hành động.
4. **Given** Customer LOCKED, **When** ADMIN mở khóa, **Then** status thành ACTIVE, audit event được ghi, không Refresh Token cũ nào được khôi phục và Customer phải đăng nhập lại.
5. **Given** target là chính ADMIN đang thao tác hoặc một ADMIN khác, **When** yêu cầu khóa/mở khóa được gửi, **Then** yêu cầu bị từ chối.
6. **Given** ADMIN cố xóa Customer, đổi role hoặc chỉnh nội dung profile Customer, **When** dùng capability của feature này, **Then** thao tác không được hỗ trợ.
7. **Given** cần tạo ADMIN đầu tiên, **When** public registration được dùng, **Then** không thể tạo ADMIN; việc cấp ADMIN đầu tiên thuộc cơ chế quản trị ở bước triển khai.

### Edge Cases

- Email sau trim/lowercase trở thành rỗng, sai định dạng hoặc vượt giới hạn dữ liệu được plan phê duyệt phải bị từ chối trước khi tạo tài khoản/onboarding.
- Hai đăng ký local, hai callback social hoặc hai bước hoàn tất onboarding cạnh tranh cho cùng email/identity không được tạo duplicate user hay identity.
- Identity đã tồn tại nhưng email provider thay đổi hoặc trùng với user khác vẫn phải ưu tiên `provider + providerSubject`; không tái gán identity theo email.
- Identity social hợp lệ trỏ tới user không tồn tại/không nhất quán phải fail closed và được quan sát như lỗi integrity; không tự tạo user thay thế.
- Provider trả role, access scope ngoài allowlist hoặc redirect động không làm mở rộng quyền hay redirect được phép.
- Callback, state và bằng chứng verification phải có thời hạn, dùng một lần; refresh credential không được dùng thay callback và ngược lại.
- Refresh xảy ra đúng lúc user bị khóa, logout-all hoặc đổi mật khẩu phải có một kết quả nguyên tử không để lại Refresh Token hợp lệ ngoài chính sách.
- Access Token còn hạn sau revocation có thể tiếp tục đi qua kiểm tra stateless đến tối đa 15 phút; thao tác nhạy cảm vẫn phải kiểm tra authorization/ownership theo dữ liệu đáng tin cậy.
- Cookie bị thiếu, hỏng hoặc đã xóa khi logout phải cho kết quả idempotent, không biến thành lỗi nghiệp vụ.
- Lỗi gửi email sau khi yêu cầu resend không được vô hiệu hóa bằng chứng hợp lệ trước đó nếu chính sách plan không chủ ý thay thế; plan phải chốt hành vi này để tránh khóa người dùng ngoài ý muốn.
- Tìm kiếm Admin không được suy diễn thành public account-discovery surface; phân trang/lọc phải ổn định khi dữ liệu thay đổi đồng thời.
- Log, analytics, tracing, audit và error response không được chứa password, token, authorization code, client secret hoặc provider token.

## Requirements *(mandatory)*

### Scope Boundaries

**In scope**:

- Đăng ký/đăng nhập bằng email và mật khẩu; Google; Facebook.
- Xác minh email cho LOCAL account và Forgot Password/reset password.
- Access Token, Refresh Token, rotation, session expiry, logout hiện tại và logout-all.
- Social onboarding tối thiểu và xác minh email khi provider thiếu email hoặc thiếu bằng chứng xác minh phù hợp.
- Profile self-service, đổi mật khẩu LOCAL, role CUSTOMER/ADMIN, authorization và ownership.
- Admin xem, tìm, lọc, khóa/mở khóa Customer và audit các hành động đó.
- Security behavior, rate limiting, CSRF protection, secret/log hygiene và test evidence gắn với từng slice.

**Out of scope**:

- Account linking/unlinking, thêm phương thức đăng nhập, xem danh sách linked identities hoặc thêm password cho social-only account.
- MFA, OTP login, Apple login, permission động, nhiều role, đổi email, upload avatar, xác minh số điện thoại hoặc xóa tài khoản.
- Access Token blacklist hoặc thu hồi Access Token tức thì.
- Lưu provider token để gọi API khác hoặc quản lý Facebook Page.
- Quản lý template, thiệp cưới, đơn hàng và thanh toán; feature chỉ áp dụng ownership lên tài nguyên đã tồn tại và ghi dependency nếu chưa tồn tại.
- Schema chi tiết, API contract, library, thuật toán/parameter hashing, topology domain, cookie/CORS chi tiết và cơ chế frontend nhận phiên sau OAuth; các nội dung này thuộc plan.

### Functional Requirements

#### Identity, role và trạng thái

- **FR-001**: Hệ thống MUST chỉ lưu hai role `CUSTOMER` và `ADMIN`; PUBLIC/GUEST MUST là trạng thái chưa đăng nhập, không phải role persisted.
- **FR-002**: Mỗi tài khoản MVP MUST có đúng một login method: `LOCAL`, `GOOGLE` hoặc `FACEBOOK`; hệ thống MUST NOT cung cấp account linking/unlinking hay thêm login method.
- **FR-003**: User mới từ public registration MUST luôn là CUSTOMER và ACTIVE; hệ thống MUST NOT cho public registration tạo ADMIN.
- **FR-004**: Trạng thái tài khoản tối thiểu MUST gồm ACTIVE và LOCKED.
- **FR-005**: CUSTOMER MUST NOT tự sửa role, status hoặc email_verified.
- **FR-006**: Backend MUST tự xác định authentication principal, role và ownership từ nguồn đáng tin cậy; MUST NOT tin role, `userId` hoặc `ownerId` do frontend khai báo.
- **FR-007**: ADMIN đầu tiên MUST được cấp qua cơ chế quản trị khi triển khai; public flow MUST không có khả năng này.

#### Local registration và login

- **FR-008**: Đăng ký LOCAL MUST yêu cầu email và password; email MUST được normalize chỉ bằng trim và lowercase, unique không phân biệt hoa/thường, không bỏ dấu chấm hoặc `+tag`.
- **FR-009**: Kiểm soát uniqueness MUST bảo đảm các yêu cầu đồng thời cho cùng email không thể tạo hai tài khoản.
- **FR-010**: Password MUST có ít nhất 8 ký tự và MUST được xử lý nguyên văn, không trim, đổi hoa/thường hoặc âm thầm cắt ngắn.
- **FR-011**: Password MUST chỉ được lưu dưới dạng hash một chiều theo thuật toán mạnh được chốt tại plan; password và password hash MUST không xuất hiện trong response hoặc log.
- **FR-012**: Đăng ký LOCAL thành công MUST chuyển người dùng sang email verification, MUST NOT tự cấp session và MUST NOT cho login trước khi xác minh thành công.
- **FR-013**: Chỉ LOCAL account ACTIVE có email_verified=true và credential đúng mới được login.
- **FR-014**: Login failure MUST dùng thông điệp không phân biệt email không tồn tại, password sai hoặc chi tiết nội bộ khác có thể làm lộ account existence.
- **FR-015**: Tài khoản LOCKED MUST NOT tạo session mới qua LOCAL, GOOGLE hoặc FACEBOOK và MUST NOT refresh.
- **FR-016**: Các thao tác xác thực nhạy cảm MUST có rate limiting; ngưỡng, cửa sổ và keying strategy được chốt tại plan.
- **FR-066**: Local email-verification proof MUST có hạn, dùng một lần và có resend/attempt limiting; xác minh thành công MUST đặt email_verified=true và vô hiệu hóa proof.
- **FR-067**: Forgot Password MUST trả phản hồi bên ngoài giống nhau cho email tồn tại và không tồn tại; chỉ LOCAL account có email đã xác minh mới đủ điều kiện nhận reset proof.
- **FR-068**: Password-reset proof MUST có hạn, dùng một lần và có request/attempt limiting; email chưa xác minh MUST không được coi là bằng chứng ownership để reset password.
- **FR-069**: Reset password MUST yêu cầu proof hợp lệ và password mới tuân thủ FR-010/FR-011; thành công MUST vô hiệu hóa proof và revoke mọi Refresh Token của user.
- **FR-070**: Verification/reset request, resend và completion failures MUST không tiết lộ account existence, password state hoặc login method ngoài hướng dẫn an toàn cần thiết.
- **FR-072**: LOCAL registration MUST trả phản hồi bên ngoài không cho phép phân biệt email mới với email đã tồn tại; email trùng MUST không tạo account thứ hai, còn việc gửi verification email chỉ xảy ra khi phù hợp với trạng thái account mà không làm thay đổi phản hồi công khai.

#### Google, Facebook và social onboarding

- **FR-017**: Hệ thống MUST chỉ chấp nhận provider trong allowlist GOOGLE và FACEBOOK.
- **FR-018**: Google flow MUST yêu cầu quyền định danh, email và profile; Facebook flow MUST yêu cầu public profile và email ở mức tối thiểu cần thiết.
- **FR-019**: Backend MUST xử lý callback và authorization-code exchange, kiểm tra response đúng giao thức; MUST NOT tin identity/email do frontend tự khai báo.
- **FR-020**: Mỗi callback MUST được ràng buộc với login request ban đầu, có hạn, dùng một lần và kiểm tra state; plan MUST xác định PKCE và nonce phù hợp flow/provider.
- **FR-021**: Redirect sau social login MUST chỉ đến allowlist; Access Token hoặc Refresh Token nội bộ MUST NOT xuất hiện trong URL.
- **FR-022**: Provider token MUST NOT được dùng làm token phiên nội bộ và MUST NOT được lưu lâu dài khi provider chỉ phục vụ login.
- **FR-023**: Role MUST NOT được lấy từ provider.
- **FR-024**: Khi xử lý social identity, hệ thống MUST tìm theo `provider + providerSubject` trước email.
- **FR-025**: Nếu identity tồn tại, hệ thống MUST dùng user đã gắn và kiểm tra status; MUST NOT tạo user mới chỉ vì provider email thay đổi.
- **FR-026**: Nếu identity chưa tồn tại và email hợp lệ chưa dùng, hệ thống MUST chỉ tạo Customer mới sau khi áp dụng quy tắc email verification riêng cho provider; Facebook email hợp lệ nhận từ callback đã kiểm tra đầy đủ MUST được chấp nhận để tạo account/session ngay.
- **FR-027**: Nếu identity chưa tồn tại nhưng email trùng tài khoản có sẵn, hệ thống MUST NOT đăng nhập account đó, tự link hoặc tạo duplicate; thông báo MUST hướng dẫn dùng phương thức đã đăng ký nhưng không tiết lộ provider gắn với account.
- **FR-028**: Social-only account MUST không bắt buộc password và MUST không thể dùng change-password flow để thêm LOCAL method.
- **FR-029**: Nếu provider thiếu email hoặc email không đáp ứng policy riêng của provider, hệ thống MUST tạo pending onboarding có hạn mà chưa cấp Customer access session và cho nhập/xác minh email. Với Facebook, trường hợp này chỉ áp dụng khi email thiếu hoặc không hợp lệ.
- **FR-030**: Onboarding và email-verification proof MUST có hạn, dùng một lần, có resend/attempt limiting; chỉ sau verification thành công mới được tạo account.
- **FR-031**: Tại thời điểm hoàn tất onboarding, hệ thống MUST kiểm tra lại email và identity uniqueness một cách an toàn trước cạnh tranh.
- **FR-032**: Hệ thống MUST áp dụng policy email theo từng provider và kiểm thử rõ ràng: Google chỉ được tin cậy khi có bằng chứng xác minh được chấp nhận; Facebook email hợp lệ từ callback đã kiểm tra đầy đủ được xem là verified theo business policy; email Facebook thiếu hoặc không hợp lệ MUST đi qua platform verification.
- **FR-033**: Hủy OAuth, onboarding hết hạn, verification thất bại hoặc lỗi gửi mail MUST không để lại account đăng nhập được một phần.
- **FR-071**: Sau khi social onboarding xác minh email thành công và kiểm tra uniqueness lần cuối, hệ thống MUST tạo social account và một session mới trong cùng flow; proof onboarding/verification MUST bị vô hiệu hóa trước khi kết quả thành công có thể được dùng lại.

#### Session và token behavior

- **FR-034**: Access Token MUST có TTL 15 phút; feature MUST NOT triển khai blacklist hay cam kết revoke Access Token tức thì.
- **FR-035**: Refresh Token MUST được lưu ở dạng hash và chuyển qua cookie HttpOnly, Secure trong production.
- **FR-036**: Mỗi login thành công MUST tạo một session độc lập với absolute lifetime 14 ngày từ login; rotation MUST NOT kéo dài mốc này.
- **FR-037**: Mỗi refresh thành công MUST cấp Refresh Token mới và vô hiệu token cũ nguyên tử.
- **FR-038**: Refresh MUST chỉ thành công khi credential còn hạn, chưa revoked và user ACTIVE.
- **FR-039**: Reuse Refresh Token cũ MUST bị từ chối và MUST revoke token family/session chain liên quan.
- **FR-040**: Plan MUST xác định hành vi concurrent refresh và retry sao cho không tạo nhiều token branches hoặc frontend refresh loop; acceptance test MUST khóa chính sách đã chọn.
- **FR-041**: Logout hiện tại MUST dùng được bằng refresh credential khi Access Token hết hạn, revoke đúng session và xóa cookie; repeated logout MUST idempotent về nghiệp vụ.
- **FR-042**: Logout-all, đổi password và khóa user MUST revoke toàn bộ Refresh Token của user.
- **FR-043**: Mở khóa MUST không restore revoked session; user MUST login lại.
- **FR-044**: Hệ thống MUST chấp nhận rằng Access Token đã cấp có thể hoạt động tối đa 15 phút sau logout, đổi password hoặc lock; MUST NOT có acceptance criterion đòi immediate revocation.
- **FR-045**: Mọi thao tác xác thực dựa trên cookie MUST có CSRF protection; SameSite, domain, path, CORS, frontend Access Token handling và post-OAuth session handoff MUST được chốt tại plan theo domain thực tế.

#### Profile và đổi password

- **FR-046**: User đã xác thực MUST xem được account information an toàn và MUST không nhận password hash, token hoặc secret.
- **FR-047**: CUSTOMER MUST chỉ tự cập nhật `display_name` và `phone_number`; phone number là tùy chọn và chưa verified.
- **FR-048**: Profile update MUST không cho sửa email, role, status, email_verified, password_hash hoặc identity.
- **FR-049**: Avatar từ provider MAY được dùng khi tạo social account; avatar upload MUST không thuộc feature.
- **FR-050**: Change password MUST chỉ áp dụng cho LOCAL account, yêu cầu authenticated session, current password đúng và new password tuân thủ FR-010/FR-011.
- **FR-051**: Change password thành công MUST revoke mọi Refresh Token, xóa current browser session cookie và yêu cầu login lại.
- **FR-052**: Social-only account gọi change password MUST nhận phản hồi rõ thao tác không áp dụng mà không tạo password.

#### Authorization, ownership và Admin

- **FR-053**: Guest MUST chỉ truy cập public content và registration/login/onboarding flows được phép.
- **FR-054**: CUSTOMER MUST chỉ truy cập account và tài nguyên thuộc ownership của mình; ADMIN MUST chỉ truy cập admin capabilities được định nghĩa rõ.
- **FR-055**: Ownership integration với template, invitation, order và payment MUST chỉ áp dụng khi resource/module tương ứng đã tồn tại; nếu chưa có MUST ghi dependency, không tạo module nghiệp vụ giả để test.
- **FR-056**: Admin list MUST chỉ liệt kê Customer, hỗ trợ pagination, search theo email/tên và filter ACTIVE/LOCKED.
- **FR-057**: Admin detail MUST chỉ trả account information cần thiết, không trả hash, token hoặc secret.
- **FR-058**: ADMIN MUST có thể lock/unlock Customer; MUST NOT lock/unlock chính mình hoặc ADMIN khác.
- **FR-059**: Mỗi lock/unlock được chấp nhận MUST ghi actor, target Customer, timestamp, requested action, previous/new status, outcome CHANGED hoặc NO_CHANGE và request ID; repeated/no-op request vẫn có audit, không giả lập state transition.
- **FR-060**: Admin feature MUST NOT xóa account, đổi role hoặc chỉnh sửa Customer content.

#### Security, testing và compatibility

- **FR-061**: Password, password hash, Access/Refresh Token, authorization code, provider token và client secret MUST không xuất hiện trong application log, audit log, tracing, analytics hoặc error response.
- **FR-062**: Cookie behavior và CSRF protection MUST được kiểm tra trên cấu hình deployment dự kiến sau khi domain topology được chốt.
- **FR-063**: Business rules và critical flows MUST có unit/integration coverage, gồm concurrency, uniqueness, authorization, ownership, rotation/reuse và revocation.
- **FR-064**: Google và Facebook thật MUST được kiểm thử trên test environment trước release; automated tests MAY dùng controlled doubles nhưng không thay thế release verification.
- **FR-065**: Migration được tạo ở bước implementation sau này MUST chạy trên database trống và tương thích foundation hiện có; runtime schema synchronization MUST vẫn bị tắt.

### Business Rules

- **BR-001 — Một login method**: Một account có đúng một method trong MVP. Email trùng không phải bằng chứng cho phép link, và mọi link/unlink capability đều ngoài scope theo A1.
- **BR-002 — Email ownership**: Email chưa verified không phải bằng chứng sở hữu để login, link hoặc reset password. LOCAL account chỉ login sau verification; Forgot Password chỉ cấp reset proof cho LOCAL account có email đã verified. Riêng Facebook, email hợp lệ nhận từ callback backend đã kiểm tra đầy đủ được xem là verified theo business policy cho account creation.
- **BR-003 — Identity precedence**: Social authentication luôn resolve identity theo provider + providerSubject trước; provider email chỉ tham gia quy tắc tạo account/onboarding, không thay thế identity key.
- **BR-004 — Fail closed**: Mọi ambiguity về state, callback binding, verification proof, identity integrity, role hoặc ownership phải từ chối truy cập mà không tạo partial account/session.
- **BR-005 — Session isolation**: Mỗi login là một browser session độc lập. Logout hiện tại chỉ ảnh hưởng session đó; logout-all, password change và account lock ảnh hưởng tất cả Refresh Token của user.
- **BR-006 — Lock semantics**: LOCKED chặn mọi login mới và refresh. Unlock chỉ cho phép login mới, không hồi sinh session.
- **BR-007 — Server authority**: Backend là authority cho principal, role, status và ownership; frontend claims không làm thay đổi quyền.
- **BR-008 — Admin boundary**: Admin MVP chỉ quản lý Customer. Không có public Admin registration, Admin self-lock, Admin-to-Admin lock, delete hay role mutation.
- **BR-009 — Sensitive-data minimization**: Chỉ lưu và trả dữ liệu cần cho login/profile/admin; provider token không được retained nếu không có nhu cầu ngoài login.
- **BR-010 — Bounded credentials**: Callback, onboarding proof, verification proof và Refresh Token đều có thời hạn và replay controls phù hợp loại credential.

### Key Entities *(include if feature involves data)*

- **User**: Đại diện account với email normalized, profile an toàn, role CUSTOMER/ADMIN, status ACTIVE/LOCKED, trạng thái email verification và duy nhất một login method; chi tiết schema thuộc plan.
- **External Identity**: Quan hệ riêng giữa một User social-only và provider allowlisted qua providerSubject; không đặt `google_id`/`facebook_id` trực tiếp trên User.
- **Authentication Session / Refresh Credential**: Đại diện một browser session độc lập, absolute expiry, revocation state và token-family lifecycle; Refresh Token chỉ được lưu dạng hash.
- **Verification / Recovery Challenge**: Bằng chứng tạm thời có hạn, dùng một lần cho local email verification, password reset hoặc social onboarding; mỗi challenge có purpose riêng và không phải Customer session.
- **Admin Audit Event**: Bằng chứng bất biến ở mức nghiệp vụ cho lock/unlock gồm actor, target, timestamp và action; không chứa secret.

### Acceptance Traceability

- **AC-REG**: User Story 1 xác nhận FR-008–FR-012, FR-061, FR-072, uniqueness/concurrency và non-enumerating response.
- **AC-VERIFY-RECOVER**: User Story 2 xác nhận FR-066–FR-070, proof expiry/single-use, non-enumeration và revoke-on-reset.
- **AC-LOGIN**: User Story 3 xác nhận FR-013–FR-016, lock behavior, verified-email requirement và non-enumerating error.
- **AC-SESSION**: User Story 4 xác nhận FR-034–FR-045, rotation/reuse/concurrency, absolute expiry và revocation scope.
- **AC-ONBOARD**: User Story 5 xác nhận FR-029–FR-033 và FR-071, expiry/resend/duplicate/provider-cancel behavior cùng việc cấp phiên sau xác minh.
- **AC-GOOGLE**: User Story 6 xác nhận FR-017–FR-028 cho Google, callback/state/redirect và identity precedence.
- **AC-FACEBOOK**: User Story 7 xác nhận FR-017–FR-033 cho Facebook và missing-email onboarding.
- **AC-PROFILE**: User Story 8 xác nhận FR-046–FR-052 và social-only password restriction.
- **AC-AUTHZ**: User Story 9 xác nhận FR-001–FR-007, FR-053–FR-055 và server-side ownership.
- **AC-ADMIN**: User Story 10 xác nhận FR-056–FR-060, audit, revoke-on-lock và no-session-restore-on-unlock.
- **AC-QUALITY**: FR-061–FR-065 được xác nhận xuyên suốt các story bằng log inspection, deployment-shape security checks, migration checks và test evidence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% test cases đăng ký đồng thời và khác hoa/thường cho cùng email tạo tối đa một account; không có duplicate User hoặc identity.
- **SC-002**: Ít nhất 95% người dùng thử nghiệm hoàn tất đăng ký LOCAL hợp lệ và đến màn hình login trong 2 phút ở lần thử đầu.
- **SC-003**: Ít nhất 95% người dùng thử nghiệm có provider response đầy đủ hoàn tất Google hoặc Facebook login trong 90 giây, không phải tạo password.
- **SC-004**: 100% test cases Facebook có email hợp lệ tạo Customer session mà không qua onboarding; 100% trường hợp Facebook thiếu/email không hợp lệ và provider khác thiếu bằng chứng bắt buộc không nhận Customer access trước verification; 100% proof hết hạn, đã dùng hoặc email conflict bị từ chối.
- **SC-005**: 100% test cases đăng ký trùng, login sai và Forgot Password trả thông điệp không cho phép phân biệt email tồn tại; không password, hash, token, code hoặc secret nào xuất hiện trong response/log đã kiểm tra.
- **SC-006**: 100% test cases rotation/reuse/concurrent refresh chỉ để lại tối đa một token branch hợp lệ theo policy đã chọn; session không vượt quá 14 ngày.
- **SC-007**: 100% logout-current chỉ revoke session tương ứng; 100% logout-all, successful password change và account lock làm mọi Refresh Token của user không thể dùng tiếp.
- **SC-008**: 100% authorization matrix tests từ chối Guest/CUSTOMER/ADMIN ngoài quyền và từ chối cross-customer ownership access, kể cả khi request giả mạo role/userId/ownerId.
- **SC-009**: 100% profile mutation tests chỉ cho phép `display_name` và `phone_number`; 100% social-only change-password attempts không tạo LOCAL credential.
- **SC-010**: Admin tìm/lọc Customer trả kết quả đầu tiên trong 2 giây cho tập kiểm thử 100.000 Customer, và 100% lock/unlock được chấp nhận, gồm no-op, tạo audit event đầy đủ với outcome phù hợp.
- **SC-011**: 100% security checks trên deployment shape dự kiến xác nhận Refresh Token cookie không đọc được từ browser script, chỉ truyền qua secure transport ở production và request dựa trên cookie có CSRF protection.
- **SC-012**: Trước release, toàn bộ critical flows có unit/integration evidence, migration validation chạy thành công từ database trống trên foundation, và mỗi Google/Facebook flow có ít nhất một successful và một rejected real-provider test trên test environment.
- **SC-013**: Trong usability test, ít nhất 90% người dùng bị email conflict hoặc social onboarding failure hiểu được bước tiếp theo mà không được tiết lộ provider/account detail của người khác.
- **SC-014**: 100% LOCAL login tests từ chối account chưa xác minh; 100% verification/reset proofs hết hạn hoặc đã dùng bị từ chối; Forgot Password không cho phép phân biệt email tồn tại qua response bên ngoài.

### Usability measurement protocol — đã xác nhận

Người dùng đã chọn toàn bộ option Recommend sau analysis, gồm protocol end-to-end sau:

- SC-002: từ lúc bắt đầu nhập registration form đến login screen sau email verification thành công; tính cả mail delivery và thao tác người dùng. Giữ 95% trong 2 phút.
- SC-003: từ khi chọn provider đến frontend có Customer session; Facebook email hợp lệ đi thẳng tới session, còn trường hợp thiếu/email không hợp lệ tính cả platform onboarding/email verification. Giữ 95% trong 90 giây; Google/Facebook đánh giá riêng.
- SC-013: sau error, người dùng xác định đúng bước tiếp theo mà không có gợi ý từ người điều phối; giữ tỷ lệ 90%.
- Tối thiểu 20 người dùng riêng biệt mỗi flow; ghi tổng thời gian và breakdown provider/mail/UI, denominator và mọi failure. Không tùy ý loại lượt chậm/lỗi; thiếu mẫu hoặc evidence là chưa đạt kiểm chứng, không tự nới ngưỡng.

## Assumptions and Confirmed Decisions

- **A1 — Đã xác nhận ngày 2026-09-26**: MVP không có Account linking, gồm self-link, manual link, xem linked identities và unlink. Mỗi tài khoản chỉ có LOCAL, GOOGLE hoặc FACEBOOK. Ảnh hưởng: email trùng giữa identity mới và account hiện hữu luôn chặn flow; không có đường hợp nhất account trong feature này.
- **A2 — Cập nhật ngày 2026-09-27**: Feature 2 bao gồm local email verification và Forgot Password. LOCAL account phải xác minh email trước khi login; email chưa verified không phải bằng chứng ownership để linking hoặc password reset. Facebook email hợp lệ từ callback backend đã kiểm tra đầy đủ được chấp nhận là verified theo business policy; Facebook chỉ onboarding khi email thiếu/không hợp lệ. Provider khác vẫn phải tuân theo bằng chứng verification riêng.
- **A3 — Đã xác nhận ngày 2026-09-26**: Frontend/API domain chưa chốt. Cookie, CORS, CSRF và cách frontend nhận session sau OAuth sẽ được quyết định tại plan dựa trên domain topology thực tế; không được giả định same-site hay cross-site trước quyết định này. Dù topology nào được chọn, các yêu cầu HttpOnly, Secure trong production, CSRF protection, redirect allowlist và không truyền token qua URL vẫn bắt buộc.
- Các ngưỡng rate limit, resend/attempt limit, độ dài tối đa profile/email và verification expiry sẽ được chốt tại plan nhưng không được làm suy yếu behavior bắt buộc trong spec; policy Facebook email đã được chốt tại A2/FR-032.
- Thuật toán password hashing là Argon2 hoặc BCrypt; lựa chọn và parameters được chốt tại plan, không phải quyết định của spec.
- PKCE và nonce được đánh giá theo flow/provider ở plan; state, callback binding, expiry và single-use là bắt buộc ngay trong spec.

## Dependencies and Current-State Evidence

- Đã kiểm tra repository ngày 2026-09-26: foundation hiện có frontend/backend độc lập, PostgreSQL, migration lifecycle, health/config/CI; chưa có User, authentication, authorization hoặc business module cho template/invitation/order/payment. Spec này không tuyên bố các capability đó đã tồn tại.
- Constitution v2.0.0 yêu cầu modular monolith, versioned REST contracts, PostgreSQL migrations explicit, `synchronize: false`, independent app lifecycle, secret hygiene và testable requirements; plan/implementation sau này phải tuân thủ.
- Google/Facebook availability, app credentials, approved redirect URIs, provider review/test accounts và outbound email delivery là external dependencies cần được chuẩn bị trước integration/release testing.
- Ownership tests với template/invitation/order/payment phụ thuộc feature tương ứng. Khi chưa có resource thật, IAM chỉ xác định reusable authorization/ownership contract và test trên resource IAM hiện hữu; không tạo domain module giả.
- Cơ chế quản trị để cấp ADMIN đầu tiên là implementation/deployment dependency phải được định nghĩa tại plan và không được expose như public registration.

## Decisions Deferred to Planning

- Schema, indexes/constraints, representation của LOCAL identity, transaction boundaries và migration design.
- Versioned REST API contracts cho register/local-email-verification/Forgot Password/reset-password/login/refresh/logout/logout-all; OAuth start/callback; social onboarding/verification; profile/change-password; Admin list/detail/lock/unlock. Không có link/unlink/list-linked-identity contract.
- Password hashing algorithm/parameters, token format/signing/key rotation, hash format và secret ownership.
- SameSite/domain/path/CORS/CSRF configuration, Access Token storage, frontend refresh coordination và post-OAuth session handoff theo domain topology.
- Concurrent refresh/retry policy cụ thể, resend/attempt/rate-limit thresholds, pagination limits và audit retention.
- Provider-specific PKCE/nonce details và tiêu chí nào được xem là provider email verification evidence đáng tin cậy.

## Vertical Slice Direction for Future Tasks

Đây chỉ là định hướng dependency/order cho bước `$speckit-tasks` sau này, không phải tasks và không cho phép tự động chuyển phase. Mỗi slice phải kèm security protection, authorization phù hợp và unit/integration tests ngay từ đầu.

1. Local registration.
2. Local email verification và Forgot Password/reset password.
3. Local login và minimal session dependency.
4. Refresh rotation, logout và logout-all.
5. Social onboarding và minimal email verification.
6. Google login.
7. Facebook login.
8. Profile và change password.
9. Role authorization và ownership.
10. Admin account management.
11. End-to-end integration validation và security review.

JWT/session tối thiểu là dependency của login; authorization không được trì hoãn đến cuối. Mỗi slice chỉ được xem là hoàn tất khi guardrails và tests liên quan cùng hoàn tất.
