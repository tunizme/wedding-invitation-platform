# Kế hoạch trang admin Thư viện thiết kế

Trạng thái: đề xuất thiết kế và triển khai, chưa sửa chức năng sản phẩm. Ngày: 2026-10-14.

## Mục tiêu và phạm vi

Admin có khu vực riêng để quản lý Stock, hình nền có sẵn, âm nhạc, danh mục tiện ích và hiệu ứng. Editor đọc nội dung được cho phép hiển thị từ cùng nguồn dữ liệu. Áp dụng hướng dẫn UI `ui-ux-pro-max`, kế thừa shell và component admin hiện có.

Ảnh cá nhân của khách và ảnh tải riêng cho một thiết kế không tự trở thành tài nguyên dùng chung. Màu nền/gradient, chỉnh âm lượng, cắt nhạc và hiệu ứng đang áp dụng cho một phần tử tiếp tục là cài đặt của thiết kế đó.

## Căn cứ từ giao diện người dùng Cinelove

Đã đọc `cinelove-clone.md`, đăng nhập và khảo sát trực tiếp editor ngày 2026-10-14. Theo yêu cầu mới nhất, **suy luận thiết kế admin từ giao diện người dùng**; không coi đây là mô tả trang admin thật của Cinelove. Hồ sơ và bằng chứng: [asset-management.md](../cinelove/asset-management.md).

| Quan sát thực tế | Suy luận để thiết kế admin của source |
| --- | --- |
| Stock có 19 nhóm; màn hình Tất cả chia thành từng khối và mỗi khối có Xem thêm; bộ lọc có các nhóm ưu tiên và Xem thêm mở nhóm còn lại | Category cần thứ tự hiển thị chung, cờ xuất hiện ở thanh lọc nhanh và thứ tự ở thanh lọc. Item cần category, thumbnail, tên và thứ tự trong nhóm. Không mặc định thứ tự thanh lọc giống thứ tự các khối |
| Nhạc có tìm kiếm, Tất cả/Nhạc ngoại/V-POP; mỗi hàng có tên, thời lượng và nút nghe; lọc V-POP thay danh sách; truy vấn không khớp báo không tìm thấy | Admin dùng bảng nhạc với player, tên hiển thị, danh mục, duration tự lấy từ file và thứ tự; tìm kiếm theo tên. Không yêu cầu nghệ sĩ riêng nếu chưa có dữ liệu |
| Thư viện nhạc tách Nhạc của tôi; tài khoản FREE thấy thông báo nâng cấp khi mở Nhạc của tôi | Thư viện admin chỉ phát hành tài nguyên chung. Upload cá nhân tách scope và quyền. Không tự thêm paywall, định dạng WAV/M4A hoặc hệ thống gói vào source |
| Nền tách Màu nền/Hình nền; Hình nền có Chọn hình nền cá nhân; phiên khảo sát chưa thấy danh sách nền có sẵn | Giữ quản trị hình nền có sẵn vì người dùng đã yêu cầu và source đã có BACKGROUND. Đây là nhu cầu sản phẩm riêng, chưa có bằng chứng để coi là sao chép catalog nền của Cinelove |
| Tiện ích là danh sách công cụ có tên và icon, gồm lịch, đếm ngược, bản đồ, form, album... | Quản lý registry chức năng: nhãn, icon được phép, mô tả, thứ tự, trạng thái, mặc định hợp lệ; không coi tiện ích là tệp upload |
| Hiệu ứng có ba nhóm động/mở màn/rơi; Hiệu ứng động có mẫu dựng sẵn và nút xem trước | Catalog có effectGroup và registryKey; admin preview cấu hình được renderer hỗ trợ. Không suy từ tên mẫu rằng source đã hỗ trợ thuật toán tương ứng |

Đề xuất màn hình admin: thanh nhóm Stock / Hình nền / Âm nhạc / Tiện ích / Hiệu ứng; thanh tìm kiếm và lọc; vùng nội dung; drawer chỉnh sửa. Stock có **Xem như editor** để xem các khối theo danh mục và kiểm tra thứ tự trước khi phát hành. Nhạc có player cố định trong panel, dừng bài trước khi nghe bài khác. Tiện ích/hiệu ứng có khung preview dùng renderer thật trên dữ liệu mẫu.

Các trường dữ liệu bổ sung từ khảo sát: category `showInQuickFilter`, `quickFilterOrder`; item `sortOrder` trong nhóm; effect `effectGroup` thuộc nhóm hỗ trợ. Preview chỉ đọc dữ liệu draft của admin, không phát hành vào thư viện editor cho đến khi ACTIVE.

### Ưu tiên sau khảo sát

1. Stock: quản trị 19 danh mục hiện có, thứ tự khối, thanh lọc nhanh, upload và ẩn/hiện; preview thư viện như editor.
2. Nhạc và nền: tách chung/cá nhân; kiểm tra file thật, nghe thử nhạc và preview nền. Không phụ thuộc việc xác minh thư viện nền của Cinelove.
3. Tiện ích và hiệu ứng: đưa registry hiện tại vào catalog; chỉ quản lý chức năng đã có. Mẫu hiệu ứng hoặc tiện ích thiếu được báo riêng, không đưa nút chưa hoạt động vào admin.

## Hiện trạng đã kiểm tra

| Nhóm     | Hiện có                                                                                        | Cần bổ sung                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Stock    | Asset DECORATION, storage, upload/list/delete, category và attribution                         | Trang quản lý, metadata, trạng thái hiển thị, thứ tự, tìm kiếm, phân biệt thư viện chung với upload riêng |
| Hình nền | Asset BACKGROUND, chọn nền trong editor                                                        | Quản trị danh mục, preview nền, hiển thị và sắp xếp                                                       |
| Âm nhạc  | Asset AUDIO, MP3, duration, nghe thử, đoạn cắt theo thiết kế                                   | Quản lý bài, danh mục, kiểm tra khả dụng, preview; metadata nghệ sĩ/nguồn nếu cần                         |
| Tiện ích | Các component/renderer có sẵn, danh sách được khai báo trong code                              | Danh mục cấu hình hiển thị, nhãn/icon, thứ tự, cấu hình mặc định có validation                            |
| Hiệu ứng | Các loại được hỗ trợ trong schema/renderer: chuyển động trang/phần tử, liên tục, hạt trang trí | Catalog cấu hình và preview cho đúng các loại đã hỗ trợ                                                   |

Danh mục Stock/nền/nhạc hiện khai báo tại `editor/library-taxonomy.ts`; assets đã có `category`, `attribution`, nhưng trạng thái READY/DELETING/DELETED chỉ phản ánh vòng đời lưu trữ. Không dùng trạng thái này làm trạng thái phát hành thư viện.

## Cấu trúc điều hướng

Thêm mục **Thư viện thiết kế** trong menu admin:

- `/admin/design-library/stock` — Stock.
- `/admin/design-library/backgrounds` — Hình nền.
- `/admin/design-library/music` — Âm nhạc.
- `/admin/design-library/widgets` — Tiện ích.
- `/admin/design-library/effects` — Hiệu ứng.
- `/admin/design-library/categories` — Danh mục theo từng nhóm.

Mỗi trang là URL độc lập, dùng chung layout và thanh điều hướng nhóm. Tìm kiếm, bộ lọc, sắp xếp và phân trang lưu trong URL để quay lại đúng trạng thái. Trang gốc chuyển đến Stock; chưa cần trang dashboard riêng.

## Bố cục giao diện

Đầu trang: breadcrumb, tiêu đề, số mục và nút hành động chính. Dưới là tìm kiếm, danh mục, trạng thái và cách sắp xếp. Khu vực nội dung dùng grid cho ảnh và table/list cho nhạc, tiện ích, hiệu ứng. Có loading, lỗi kèm thử lại, trạng thái rỗng và không có kết quả tìm kiếm.

Drawer bên phải để sửa metadata; modal cho preview lớn, nghe thử/cắt thử và xác nhận xóa. Mobile chuyển bảng thành danh sách dễ đọc, bộ lọc thu gọn và drawer vừa viewport. Icon có nhãn, trạng thái không chỉ biểu diễn bằng màu, thao tác dùng được bằng bàn phím.

| Trang    | Nội dung chính                                                  | Hành động                                                                   |
| -------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Stock    | Thumbnail trên nền caro, tên, danh mục, trạng thái, số nơi dùng | Tải nhiều tệp, preview, sửa, đổi danh mục, sắp xếp, ẩn/hiện, xóa            |
| Hình nền | Thumbnail giữ tỷ lệ, kích thước, preview trên khung thiệp       | Tải lên, preview cover/contain, metadata, ẩn/hiện, xóa                      |
| Âm nhạc  | Nghe/dừng, tên, thời lượng, danh mục, trạng thái, số nơi dùng   | Tải MP3, sửa metadata, nghe và tua, ẩn/hiện, xóa                            |
| Tiện ích | Icon, tên, mô tả, loại, preview, trạng thái, thứ tự             | Sửa cách giới thiệu, bật/tắt cho lần thêm mới, thứ tự, mặc định được hỗ trợ |
| Hiệu ứng | Preview chạy/dừng, tên, nhóm, trạng thái, thứ tự                | Sửa nhãn/mô tả, bật/tắt, mặc định trong giới hạn schema                     |
| Danh mục | Tên, nhóm tài nguyên, thứ tự, số mục                            | Tạo/sửa, sắp xếp, ẩn/hiện; chuyển tài nguyên trước khi xóa danh mục         |

Stock/hình nền có lựa chọn grid kích thước vừa/lớn; nhạc chỉ phát một bài tại một thời điểm. Preview hiệu ứng có nút chạy lại, chạy trên phần tử mẫu và tôn trọng giảm chuyển động.

## Luồng quản lý

### Đưa tài nguyên vào thư viện

Tải tệp → kiểm tra định dạng/dung lượng → chọn tên/danh mục → preview → lưu bản nháp → bật hiển thị. Upload nhiều tệp báo tiến trình và lỗi từng tệp, có thử lại tệp lỗi. Chỉ mục đã xử lý thành công và bật hiển thị mới xuất hiện khi chọn thư viện chung trong editor.

Các giới hạn và chuẩn hóa ảnh/MP3 dùng backend hiện có. Cắt nhạc trong editor chỉ lưu đoạn phát của thiết kế; không làm thay đổi MP3 dùng chung. Nếu sau này cần đoạn nghe thử của catalog, thêm trường riêng với yêu cầu riêng.

### Sửa và ẩn tài nguyên

Đổi tên/danh mục/thứ tự không đổi asset ID. **Ẩn khỏi thư viện** ngăn chọn mới nhưng các thiệp đã dùng vẫn hiển thị/phát bình thường. Thiết kế cũ không bị thay đổi chỉ vì admin đổi giá trị mặc định của tiện ích/hiệu ứng.

### Xóa vĩnh viễn

Mặc định ưu tiên hành động Ẩn. Xóa là hành động riêng: mở hộp xác nhận có số mẫu/thiệp/preset bị ảnh hưởng và cảnh báo gỡ tham chiếu, sau đó dùng cơ chế xóa dữ liệu + storage đã có. Thống kê và kiểm tra lại thực hiện phía server; giữ quyền sở hữu hiện hành cho đến khi có chính sách quản trị tài nguyên chung được chốt.

Đề xuất quản trị thư viện chung: admin được cấp quyền quản lý thư viện có thể sửa/xóa tài nguyên chung do admin khác tạo, kèm audit. Đây là thay đổi quyền cần triển khai rõ ràng, không mặc định endpoint hiện tại đã hỗ trợ. Không cho quyền này truy cập ảnh/nhạc cá nhân của khách.

Không thay tệp bằng cách ghi đè object cũ. Thay tệp tạo asset mới; thao tác di chuyển các tham chiếu từ asset cũ phải là luồng riêng, có preview tác động.

### Tiện ích và hiệu ứng

Catalog khởi tạo từ registry code hiện có. Admin chỉ chọn các loại renderer/schema đã hỗ trợ. Thêm thuật toán hiệu ứng hoặc loại tiện ích mới vẫn cần code, migration/schema nếu liên quan và kiểm thử. Không cung cấp ô nhập JavaScript/HTML/CSS thực thi hoặc upload plugin tùy ý.

Ẩn một mục chỉ ẩn khỏi danh sách thêm mới; renderer tiếp tục đọc các thiết kế đang dùng. Thay nhãn/icon của catalog không đổi định danh chức năng đã lưu.

## Dữ liệu và API dự kiến

- `design_library_categories`: ID, kind, slug ổn định, tên, sortOrder, trạng thái hiển thị, version và timestamps.
- `design_library_items`: ID, kind, assetId hoặc registryKey, categoryId, tên, mô tả, tags, sortOrder, trạng thái DRAFT/ACTIVE/HIDDEN, defaults có validation, version, createdBy/updatedBy. Các field dùng cho từng loại phải có schema rõ; registryKey duy nhất cho mỗi loại tiện ích/hiệu ứng.
- Tệp tiếp tục nằm ở bảng `assets` và asset store hiện có. Không nhân đôi byte/object để tạo mục catalog. Item dùng asset phải khớp loại và scope.
- API admin `/api/v1/admin/design-library`: list/filter, create/upload adapter, detail, patch với expectedVersion, đổi trạng thái, usage, delete và batch metadata. API category riêng trong cùng module.
- API đọc catalog dành cho editor trả các mục ACTIVE, defaults hợp lệ và URL nội dung theo scope hiện có. HIDDEN vẫn được phục vụ nếu được tham chiếu hợp lệ trong thiết kế.
- Quyền truy cập ADMIN, audit hành động thay đổi metadata/trạng thái/xóa, version conflict để tránh admin ghi đè nhau. Không đưa khóa storage vào client.
- Usage hiển thị riêng số mẫu, thiệp, preset và tác vụ đang chạy; không cộng lẫn draft/published của cùng một tài nguyên thành nhiều thiệp.

## Tích hợp và chuyển dữ liệu

1. Seed category từ taxonomy hiện tại, giữ slug để tương thích.
2. Import các asset seed chung đã có vào catalog; tệp upload thông thường không tự thành tài nguyên chung. Có màn hình chọn mục cần đưa vào thư viện.
3. Seed tiện ích/hiệu ứng từ danh sách registry code, giữ key đang lưu trong document.
4. Chuyển editor sang API catalog, cùng trạng thái tải/lỗi/thử lại; giữ vùng upload riêng và chức năng chọn tài nguyên đã dùng.
5. Đối chiếu số mục, danh mục, nội dung storage và khả năng preview trước khi chuyển nguồn chính thức. Thiết kế cũ giữ nguyên ID và renderer.

## Lộ trình

| Giai đoạn               | Kết quả bàn giao                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation và Stock  | Module catalog/category, phân quyền, audit/version, admin shell; Stock upload/grid/detail/ẩn/hiện/xóa và editor đọc catalog |
| 2. Hình nền và Âm nhạc  | Tái sử dụng asset catalog; preview nền, player nhạc, metadata/danh mục, kiểm tra nội dung storage, usage và xóa             |
| 3. Tiện ích và Hiệu ứng | Registry + catalog, preview, bật/tắt, thứ tự và defaults có validation; editor dùng cấu hình mới                            |
| 4. Hoàn thiện           | Batch metadata, kiểm thử đồng thời/quyền/xóa-retry, migration dữ liệu seed, desktop/mobile và nghiệm thu                    |

Mỗi giai đoạn hoàn thành UI, API, tích hợp editor và kiểm thử của nhóm đó để có thể dùng ngay. Chưa ước lượng thời gian cố định trước khi chốt phạm vi metadata, chính sách quyền và preview.

## Tiêu chí nghiệm thu

- Admin tải và phát hành Stock/nền/nhạc; editor thấy đúng mục/danh mục/thứ tự sau tải lại.
- Mục ẩn không chọn mới được nhưng thiệp cũ vẫn sử dụng được; defaults mới không sửa thiết kế đã lưu.
- Upload một tệp lỗi không làm mất mục thành công; nhạc/ảnh có thể tải thật từ storage và preview đúng.
- Xóa hiển thị tác động và hoàn tất gỡ tham chiếu + object; storage lỗi có trạng thái rõ và retry an toàn.
- Customer không truy cập được API quản trị; quyền catalog không mở quyền vào tệp cá nhân. Hai admin sửa đồng thời nhận version conflict đúng.
- Tiện ích/hiệu ứng chỉ dùng registry hỗ trợ; preview và nội dung đã xuất bản giữ tương thích.
- Bộ lọc/phân trang/tìm kiếm, modal và player dùng được trên desktop/mobile và bàn phím.

## Mặc định đề xuất để triển khai

- Một khu vực Thư viện thiết kế với sáu trang, thay vì năm hệ thống CRUD độc lập.
- Bắt đầu bằng Stock, rồi nền/nhạc; tiện ích/hiệu ứng quản lý qua registry.
- Tách thư viện chung khỏi upload riêng; mặc định Ẩn, Xóa vĩnh viễn là hành động riêng.
- Không thêm tính phí tài nguyên, marketplace, AI hoặc plugin thực thi vào phạm vi này.
