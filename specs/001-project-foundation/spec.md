# Feature Specification: Project Foundation

**Feature Branch**: `001-project-foundation`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Xây dựng Project Foundation cho nền tảng tạo thiệp cưới online, cho phép frontend và backend phát triển, chạy, deploy độc lập; hỗ trợ developer mới khởi chạy dự án theo tài liệu; cung cấp PostgreSQL cho local development và health check cho frontend, backend, database; không bao gồm authentication, invitation editor hay VNPay."

## Clarifications

### Session 2026-09-23

- Q: Frontend và backend nên được tổ chức theo mô hình repository nào để vừa dùng chung một lần clone vừa giữ vòng đời phát triển và deploy độc lập? → A: Một monorepo chứa frontend và backend trong hai application cấp cao độc lập; mỗi application có dependency và quy trình run, test, build, deploy riêng.
- Q: Quy trình local chuẩn nên khởi chạy PostgreSQL, frontend và backend theo cách nào? → A: Project cung cấp một lệnh khởi chạy toàn bộ; đồng thời có lệnh riêng cho frontend và cho backend cùng PostgreSQL. PostgreSQL local do project quản lý và không cần cài đặt thủ công.
- Q: Health check nên phân biệt trạng thái của frontend, backend và PostgreSQL theo mô hình nào? → A: Frontend có kiểm tra khả năng truy cập; backend có liveness và readiness riêng; readiness của backend kiểm tra kết nối PostgreSQL; quy trình tổng hợp vẫn báo riêng cả ba thành phần.
- Q: Environment configuration nên được phân chia và quản lý giữa frontend, backend và local orchestration như thế nào? → A: Frontend và backend có tập cấu hình cùng template riêng; root chỉ chứa cấu hình dùng để điều phối local. Mỗi application tự validate cấu hình bắt buộc khi khởi chạy và không commit secret thật.
- Q: CI ban đầu của Project Foundation nên dừng ở ranh giới kiểm tra nào trước khi merge? → A: CI kiểm tra format/lint, unit test và build riêng cho frontend/backend; chạy backend integration test với PostgreSQL; chạy full-stack health check. Không deploy, publish artifact hoặc chạy business E2E.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Khởi chạy môi trường local (Priority: P1)

Là developer mới, tôi muốn clone repository và làm theo tài liệu để chạy frontend, backend và PostgreSQL trên máy của mình, nhờ đó tôi có thể bắt đầu phát triển feature MVP mà không cần hướng dẫn trực tiếp từ thành viên khác.

**Why this priority**: Khả năng khởi chạy toàn bộ môi trường là giá trị cốt lõi của foundation và là điều kiện tiên quyết cho mọi feature tiếp theo.

**Independent Test**: Thực hiện trên một máy chưa từng chạy dự án: clone repository, chỉ làm theo tài liệu, cung cấp các giá trị cấu hình được yêu cầu và xác nhận cả ba thành phần sẵn sàng.

**Acceptance Scenarios**:

1. **Given** developer đã clone repository và có đủ các prerequisite được tài liệu liệt kê, **When** developer làm theo hướng dẫn khởi chạy local, **Then** frontend, backend và PostgreSQL đều chạy và có thể được xác nhận mà không cần hỗ trợ ngoài tài liệu.
2. **Given** developer chưa cung cấp một cấu hình bắt buộc, **When** developer thực hiện quy trình khởi chạy, **Then** quy trình dừng và chỉ rõ cấu hình còn thiếu cùng cách khắc phục.
3. **Given** môi trường local đang chạy, **When** developer dừng và khởi động lại theo tài liệu, **Then** các thành phần trở lại trạng thái sẵn sàng một cách nhất quán.

---

### User Story 2 - Xác nhận tình trạng hệ thống (Priority: P2)

Là developer, tôi muốn thực hiện health check để biết riêng frontend, backend và database có đang hoạt động hay không, nhờ đó tôi có thể nhanh chóng khoanh vùng lỗi môi trường.

**Why this priority**: Health check biến việc "dự án đã chạy" thành một kết quả có thể quan sát và kiểm thử, đồng thời giảm thời gian chẩn đoán sự cố.

**Independent Test**: Kiểm tra lần lượt khi cả ba thành phần hoạt động và khi chủ động làm một thành phần không khả dụng; kết quả phải nhận diện đúng trạng thái từng thành phần.

**Acceptance Scenarios**:

1. **Given** frontend, backend và database đều hoạt động, **When** developer thực hiện quy trình health check được tài liệu hóa, **Then** kết quả xác nhận rõ cả ba thành phần đều sẵn sàng.
2. **Given** database không khả dụng nhưng frontend vẫn có thể được truy cập, **When** developer thực hiện health check, **Then** kết quả phân biệt frontend đang hoạt động, database không sẵn sàng và backend không thể hoàn thành kiểm tra phụ thuộc database.
3. **Given** một thành phần không thể truy cập, **When** developer thực hiện health check, **Then** kết quả nêu đúng thành phần bị ảnh hưởng và không báo sai rằng toàn hệ thống sẵn sàng.

---

### User Story 3 - Làm việc độc lập trên frontend và backend (Priority: P3)

Là developer frontend hoặc backend, tôi muốn phát triển, chạy, kiểm tra và deploy phần mình phụ trách độc lập, nhờ đó thay đổi của một phía không buộc phía còn lại phải được build hoặc deploy lại.

**Why this priority**: Ranh giới độc lập giúp các nhóm phát triển song song và giảm rủi ro khi phát hành các feature MVP sau này.

**Independent Test**: Chạy và thực hiện quy trình release giả lập cho từng phần riêng biệt, sau đó xác nhận phần còn lại không cần build hay deploy lại.

**Acceptance Scenarios**:

1. **Given** developer chỉ làm việc trên frontend, **When** developer làm theo hướng dẫn phát triển và chạy frontend, **Then** frontend có thể được khởi chạy và kiểm tra mà không bắt buộc khởi chạy backend hoặc database.
2. **Given** developer chỉ làm việc trên backend, **When** developer làm theo hướng dẫn phát triển và chạy backend với các dependency cần thiết, **Then** backend có thể được khởi chạy và kiểm tra mà không bắt buộc khởi chạy frontend.
3. **Given** chỉ frontend hoặc backend có thay đổi, **When** quy trình deploy của thành phần đó được thực hiện, **Then** thành phần còn lại không phải build hoặc deploy lại.
4. **Given** một thay đổi được đề nghị merge, **When** CI chạy, **Then** frontend và backend được kiểm tra riêng, backend được kiểm tra tích hợp với PostgreSQL và full-stack health check xác nhận trạng thái ba thành phần mà không thực hiện deploy.

### Edge Cases

- Khi database chưa sẵn sàng lúc backend bắt đầu hoạt động, health check phải phản ánh đúng dependency chưa sẵn sàng và cho phép xác nhận lại sau khi database phục hồi.
- Khi một tài nguyên local cần thiết đang được tiến trình khác sử dụng, developer nhận được thông báo có thể hành động thay vì một lỗi chung chung.
- Khi cấu hình local không hợp lệ, không được báo thành phần ở trạng thái sẵn sàng.
- Khi chỉ một trong ba thành phần hoạt động, health check phải bảo toàn kết quả riêng của thành phần đó và nêu rõ các thành phần không sẵn sàng.
- Khi developer lặp lại quy trình khởi chạy trên môi trường đã được thiết lập, quy trình không được tạo ra trạng thái xung đột hoặc yêu cầu thiết lập lại từ đầu.

## Requirements *(mandatory)*

### Scope Boundaries

**In scope**:

- Nền tảng ban đầu cho frontend, backend và PostgreSQL trong local development.
- Tài liệu onboarding, cấu hình môi trường, quy trình chạy và xác nhận hoạt động.
- Khả năng phát triển, chạy và deploy frontend và backend độc lập.
- Health check cho frontend, backend và khả năng kết nối database.
- CI validation trước merge cho từng application, backend với PostgreSQL và full-stack health check.

**Out of scope**:

- Authentication và authorization.
- Invitation editor và các luồng tạo/chỉnh sửa thiệp cưới.
- Tích hợp thanh toán VNPay hoặc bất kỳ payment provider nào.
- Chức năng nghiệp vụ cho end user ngoài việc hiển thị trạng thái sẵn sàng của foundation.
- Automated deployment, artifact publishing và business E2E test.
- Quyết định framework, ngôn ngữ lập trình, cấu trúc code hoặc nhà cung cấp hosting.

### Functional Requirements

- **FR-001**: Repository MUST là một monorepo chứa frontend và backend dưới dạng hai application cấp cao độc lập; mỗi application MUST có dependency và quy trình run, test, build, deploy riêng.
- **FR-002**: Thay đổi chỉ thuộc frontend MUST không bắt buộc build hoặc deploy lại backend; thay đổi chỉ thuộc backend MUST không bắt buộc build hoặc deploy lại frontend.
- **FR-003**: Project MUST cung cấp PostgreSQL dành cho local development mà không yêu cầu cài đặt thủ công. Database port MUST chỉ bind vào loopback interface; database và user MUST dành riêng cho project; credential mẫu MUST chỉ dùng cho local và MUST không được tái sử dụng ngoài local development.
- **FR-004**: Backend MUST cung cấp liveness để xác nhận tiến trình đang hoạt động và readiness riêng để xác nhận backend có thể kết nối tới PostgreSQL.
- **FR-005**: Frontend MUST có một health check quan sát được để xác nhận frontend có thể được truy cập.
- **FR-006**: Project MUST cung cấp một quy trình health check được tài liệu hóa, tổng hợp nhưng vẫn cho biết riêng khả năng truy cập frontend, liveness và readiness của backend, cùng trạng thái kết nối PostgreSQL.
- **FR-007**: Health check MUST không hiển thị thông tin bảo mật, credential hoặc chi tiết cấu hình nhạy cảm.
- **FR-008**: Repository MUST có tài liệu onboarding từ lúc clone đến khi xác nhận cả ba thành phần hoạt động, bao gồm prerequisite, cấu hình bắt buộc, cách khởi chạy, cách dừng, health check và cách xử lý các lỗi thiết lập thường gặp.
- **FR-009**: Frontend và backend MUST sở hữu tập environment configuration và template riêng; root của monorepo MUST chỉ chứa environment configuration phục vụ local orchestration. Mọi template MUST liệt kê giá trị bắt buộc và MUST không chứa credential hoặc secret thật.
- **FR-010**: Frontend và backend MUST phân loại rõ environment configuration bắt buộc và tùy chọn, tự validate khi build/khởi chạy, và có negative acceptance coverage cho giá trị thiếu hoặc không hợp lệ. Validation failure MUST nêu tên cấu hình và hướng khắc phục mà không in secret value hoặc báo trạng thái sẵn sàng sai.
- **FR-011**: Developer MUST có thể khởi chạy và dừng toàn bộ frontend, backend và PostgreSQL bằng một lệnh chung nhất quán, có thể lặp lại.
- **FR-012**: Developer MUST có lệnh riêng để khởi chạy frontend mà không cần backend/database, và lệnh riêng để khởi chạy backend cùng PostgreSQL mà không cần frontend.
- **FR-013**: Foundation MUST cung cấp các điểm xác nhận tối thiểu để quy trình build và release của frontend và backend có thể được kiểm tra riêng.
- **FR-014**: Foundation MUST không cung cấp bất kỳ khả năng authentication, invitation editor hoặc VNPay nào trong phạm vi feature này.
- **FR-015**: CI MUST chạy format check, lint, typecheck, unit test và build cho frontend và backend dưới dạng các phần kiểm tra độc lập trước khi merge.
- **FR-016**: CI MUST chạy backend integration test với một PostgreSQL instance dành riêng cho lần kiểm tra.
- **FR-017**: CI MUST khởi chạy môi trường đầy đủ và chạy full-stack health check cho frontend, backend và PostgreSQL trước khi merge.
- **FR-018**: CI của Project Foundation MUST không deploy, publish artifact hoặc chạy business E2E test.
- **FR-019**: Trong rapid development, repository ruleset và automated merge blocking MAY được bỏ qua và việc thiếu chúng MUST NOT chặn feature completion. Bốn CI jobs `frontend-checks`, `backend-checks`, `backend-integration` và `full-stack-health` MUST tiếp tục báo kết quả độc lập. Một feature bắt đầu production delivery hoặc tuyên bố repository release-ready MUST quyết định và xác minh merge-protection policy riêng.
- **FR-020**: Trước khi khởi chạy local stack, orchestration MUST phát hiện port bắt buộc đang bị chiếm dụng, nêu rõ port và component bị ảnh hưởng, dừng với failure status và không để lại partial process.

### Key Entities

- **Component Health Status**: Biểu diễn kết quả kiểm tra của một thành phần, bao gồm danh tính thành phần, loại kiểm tra, trạng thái và thời điểm kiểm tra. Các loại kiểm tra gồm khả năng truy cập frontend, backend liveness, backend readiness và kết nối PostgreSQL; kết quả không bao gồm thông tin nhạy cảm.
- **Local Environment Configuration**: Ba tập giá trị có ownership tách biệt cho frontend, backend và local orchestration. Mỗi tập phân biệt giá trị bắt buộc, tùy chọn và giá trị mẫu; frontend không được nhận cấu hình chỉ thuộc backend, và không tập nào chứa secret thật trong repository.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Một disposable clean clone có đủ documented prerequisite MUST hoàn thành từ frozen
  install đến khi frontend, backend và PostgreSQL được xác nhận healthy trong vòng 30 phút mà không
  dùng dependency, build output hoặc environment file sao chép từ working tree nguồn.
- **SC-002**: Health validation MUST xác định đúng trạng thái trong bốn scenarios: toàn stack healthy, frontend unavailable, backend unavailable và PostgreSQL unavailable; không scenario nào được báo toàn stack healthy sai.
- **SC-003**: Trong documented failure scenarios, root health command MUST xác định đúng component
  lỗi trong vòng 2 phút và không báo sai toàn stack healthy.
- **SC-004**: 100% quy trình kiểm tra release chỉ dành cho frontend hoặc chỉ dành cho backend hoàn tất mà không yêu cầu build hay deploy lại thành phần không thay đổi.
- **SC-005**: Trước khi Project Foundation được xem là hoàn tất, ít nhất một fresh-clone validation
  từ committed source snapshot MUST chạy theo README và kết quả cùng known limitations MUST được ghi
  trong README và quickstart.
- **SC-006**: Toàn bộ các trường hợp thiếu cấu hình bắt buộc được kiểm tra đều tạo thông báo nêu đúng giá trị còn thiếu và hướng khắc phục.
- **SC-007**: 100% pull request nhận kết quả riêng từ bốn CI jobs; failure MUST vẫn quan sát được nhưng automated merge rejection không bắt buộc trong rapid development.

## Assumptions

- Đối tượng chính của feature là developer xây dựng các feature MVP tiếp theo; feature này chưa cung cấp user journey nghiệp vụ cho khách hàng tạo thiệp cưới.
- Developer có quyền cài đặt và chạy các prerequisite được tài liệu nêu rõ.
- PostgreSQL local chỉ chứa dữ liệu phát triển không nhạy cảm; backup, high availability và production data migration không thuộc phạm vi feature này.
- Frontend có thể hiển thị trạng thái sẵn sàng bằng nội dung tối thiểu; không cần UI nghiệp vụ hoàn chỉnh.
- Môi trường deploy đích và nhà cung cấp hosting sẽ được quyết định trong planning hoặc feature khác; specification này chỉ yêu cầu tính deploy độc lập và khả năng kiểm chứng nó.
- Việc chọn framework, ngôn ngữ, cách orchestration local và cấu trúc repository thuộc giai đoạn planning, không thuộc specification này.
