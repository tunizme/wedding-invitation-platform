# Quy trình đối chiếu và làm giống Cinelove

Tài liệu này áp dụng mỗi khi người dùng yêu cầu “làm giống phần X của Cinelove”, kể cả khi không nhắc tên file. Mục tiêu là khớp giao diện và hành vi của **chức năng đã tồn tại ở cả hai hệ thống**, trong phạm vi được giao. Không biến yêu cầu đối chiếu thành một đợt tự bổ sung toàn bộ sản phẩm.

## 1. Quy tắc phạm vi bắt buộc

| Source hiện tại | Cinelove              | Cách xử lý                                                                                        |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------- |
| Có              | Có                    | Khảo sát, đối chiếu và sửa cho giống trong phạm vi được giao.                                     |
| Chưa có         | Có                    | Báo cáo chức năng thiếu, ảnh hưởng và đề xuất tích hợp. Không tự triển khai.                      |
| Có              | Không thấy có         | Giữ nguyên. Không tự xóa hoặc thay đổi hành vi riêng của sản phẩm.                                |
| Chưa xác định   | Có hoặc chưa xác định | Kiểm tra thêm code và trang thực tế. Ghi rõ phần chưa xác minh; không coi suy đoán là bằng chứng. |

“Có” phải được đánh giá theo **từng chức năng cụ thể**, không chỉ theo tên trang hoặc panel. Panel Tùy chỉnh tồn tại không có nghĩa source đã có tất cả công cụ trong panel Cinelove.

- Chức năng đã có nhưng bố cục, giá trị mặc định, cách mở popup hoặc hành vi bị sai: sửa trong phạm vi đối chiếu.
- Chức năng đã có nhưng bị lỗi: xác minh luồng và sửa lỗi để đạt hành vi tham chiếu. Không dùng lỗi hiện tại làm lý do coi chức năng chưa tồn tại.
- Chỉ có nút, giao diện giữ chỗ hoặc kiểu dữ liệu nhưng chưa có luồng thực hiện: đánh dấu **có một phần**, nêu phần đã hoạt động và phần còn thiếu. Không báo là đã có đầy đủ.
- Cinelove có một hành động, loại hiệu ứng hoặc chế độ độc lập mà source chưa hỗ trợ: đưa vào báo cáo thiếu, dù nhóm chứa nó đã có.
- Thay đổi component, CSS, validation hoặc cách lưu để sửa chức năng đã có được phép trong phạm vi được giao. Thêm nghiệp vụ, dịch vụ, luồng dữ liệu hoặc tích hợp mới phải được phân loại và báo cáo trước, không gộp ngầm vào việc sửa giao diện.
- Nếu chưa rõ một khác biệt là sửa chức năng cũ hay thêm chức năng mới, tìm bằng chứng trong code trước; nếu vẫn chưa rõ, ghi ở nhóm chưa xác định và tiếp tục phần độc lập đã rõ phạm vi.

Chỉ triển khai chức năng thiếu khi người dùng giao làm hoặc đã cho phép cụ thể phần mở rộng đó. Quyền thao tác toàn bộ workspace không thay thế quy tắc phạm vi này.

## 2. “Giống 100%” được nghiệm thu như thế nào?

Đây là mục tiêu đối chiếu có thể kiểm tra, không phải lời cam kết dựa trên cảm giác. Với mỗi chức năng thuộc phạm vi, phải kiểm tra:

1. **Giao diện:** thứ tự, nhãn, icon, kích thước, khoảng cách, căn chỉnh, font, màu, viền, bóng, vị trí popup, trạng thái tương tác.
2. **Hành vi:** thao tác mở/đóng, chọn, kéo, nhập, xác nhận, hủy, bật/tắt, chọn lại đối tượng, focus và bàn phím khi có hỗ trợ.
3. **Quy tắc dữ liệu:** giá trị mặc định, đơn vị, giới hạn, bước tăng, giá trị rỗng/sai, áp dụng tức thời hay sau khi lưu.
4. **Vòng đời:** lưu, tải lại, đổi đối tượng, undo/redo nếu có, preview và trang người xem nếu chức năng tác động đến kết quả xuất bản.
5. **Ngữ cảnh hiển thị:** cùng viewport, zoom trình duyệt, zoom canvas, dữ liệu đầu vào, font đã tải và trạng thái cuộn.

Yêu cầu cụ thể của người dùng được ưu tiên hơn Cinelove. Mọi khác biệt có chủ ý phải được ghi thành ngoại lệ kèm căn cứ; không tự chọn phương án “đẹp hơn” rồi coi là giống.

Không tự đặt ngưỡng “gần giống là đạt”. So sánh ảnh phải xét cả hình ảnh và số đo; sai khác do font rendering/anti-aliasing phải được tách khỏi lỗi bố cục. Nếu còn sai khác hoặc chưa kiểm chứng thì báo chính xác, không tuyên bố “100%”. Đạt toàn bộ tiêu chí cũng chỉ chứng minh phạm vi đã khảo sát, không chứng minh toàn bộ website giống nhau.

## 3. Hồ sơ cần tạo cho mỗi yêu cầu

Tạo `docs/cinelove/<ten-chuc-nang>.md` từ [feature-template.md](docs/cinelove/feature-template.md). Cập nhật hồ sơ đã có nếu làm tiếp cùng chức năng; ghi ngày khảo sát lại vì trang tham chiếu có thể thay đổi.

Hồ sơ cần chứa:

- Phạm vi người dùng giao và ngoại lệ đã yêu cầu.
- Bảng kiểm kê chức năng hai bên cùng bằng chứng source/trang tham chiếu.
- Ma trận trạng thái và thao tác của các chức năng sẽ sửa.
- Số đo, giá trị mặc định và quy tắc nghiệp vụ quan sát được.
- Danh sách khác biệt cần sửa cùng tiêu chí nghiệm thu.
- Danh sách chức năng còn thiếu, đề xuất tích hợp và phần chưa xác minh.
- Kết quả đối chiếu sau sửa, kiểm thử và giới hạn còn lại.

Đặt bằng chứng chạy local ở `.artifacts/local/cinelove/<ten-chuc-nang>/`, chia `reference/`, `local/` và `diff/` khi cần. Ghi đường dẫn và điều kiện chụp trong hồ sơ. Nếu bằng chứng chỉ tồn tại local, nêu rõ; không coi đường dẫn local là bằng chứng luôn có sẵn ở mọi máy.

Không ghi mật khẩu, cookie, token hoặc nội dung storage state vào tài liệu hay Git. Dùng tài khoản/phiên đăng nhập đã được cung cấp theo quyền hiện có; che dữ liệu riêng tư khỏi ảnh và log cần chia sẻ.

## 4. Trình tự thực hiện

### Bước 1 — Đọc source và chốt phạm vi bằng bằng chứng

Đọc hướng dẫn repo và thư mục liên quan, tìm component, state, schema, API, renderer và test của phần được giao. Ghi điểm bắt đầu và luồng đang hoạt động; không chỉ tìm tên nút.

Mở đúng phần Cinelove để lập bảng đối chiếu Có / Có một phần / Chưa có / Chưa xác định. Tách chức năng thiếu ra trước khi triển khai. Không yêu cầu người dùng viết lại toàn bộ nghiệp vụ có thể tự khảo sát.

### Bước 2 — Khảo sát trực tiếp Cinelove

Dùng trình duyệt tương tác với đúng trang, đúng loại đối tượng và điều kiện tương đương. Ảnh người dùng cung cấp là mốc quan trọng nhưng không đủ để kết luận hành vi ẩn.

Với chức năng hai bên đều có, khảo sát các trạng thái áp dụng được:

- Mặc định, đã chọn đối tượng, chưa chọn đối tượng, đổi sang đối tượng khác.
- Hover, focus, đang mở, đang nhập/kéo, đã thay đổi, disabled.
- Xác nhận, hủy, click ngoài, Escape và mở lại.
- Giá trị nhỏ nhất/lớn nhất, rỗng, sai định dạng và nội dung dài.
- Cuộn panel, sát mép viewport, zoom canvas và màn hình hẹp nếu thuộc phạm vi.
- Lưu rồi tải lại; preview và trang người xem khi liên quan.

Ghi lại kết quả thực tế, không suy luận “chắc phải như vậy”. Chờ dropdown/animation hoàn tất trước khi ghi nhận để tránh lấy trạng thái cũ. Với animation, ghi loại, thời lượng, delay, easing, trigger và vòng lặp; ảnh tĩnh không chứng minh chuyển động giống nhau.

Ưu tiên bản nháp kiểm thử riêng. Không sửa mẫu đang sử dụng, xuất bản hoặc thực hiện hành động có tác động thật trên tài khoản tham chiếu chỉ để khảo sát. Nếu không kiểm tra được một nhánh một cách phù hợp, ghi nhánh đó là chưa xác minh và tiếp tục phần có thể làm.

Nếu không truy cập được Cinelove, ghi rõ lý do và nguồn bằng chứng thay thế. Có thể tiến hành phần đã có đủ bằng chứng, nhưng không khẳng định đã khảo sát trực tiếp hoặc nghiệm thu phần chưa truy cập được.

### Bước 3 — Viết tiêu chí nghiệm thu trước khi sửa

Mỗi tiêu chí có mã, điều kiện ban đầu, thao tác, kết quả mong đợi và nguồn bằng chứng. Kết quả phải cụ thể: popup ở đâu, giá trị nào thay đổi, đối tượng nào giữ nguyên, dữ liệu tồn tại thế nào sau khi tải lại.

Không dùng tiêu chí mơ hồ như “giao diện đẹp”, “giống Cinelove” hoặc “chạy được”. Mỗi tiêu chí phải thuộc một chức năng được phép sửa, hoặc một ngoại lệ rõ ràng do người dùng yêu cầu.

### Bước 4 — Triển khai đồng bộ chức năng hiện có

Áp dụng skill `ui-ux-pro-max` khi sửa frontend. Dùng skill để kiểm tra khả năng sử dụng, bố cục, focus, responsive và độ nhất quán; không dùng bảng màu/layout đề xuất từ skill để thay giao diện tham chiếu.

Đi theo luồng thực tế: control → state/command → validation → API/lưu trữ → renderer. Kiểm tra các lớp có liên quan, cập nhật nơi thực sự cần thiết. Không sửa UI thành một chức năng chưa được backend/renderer hỗ trợ rồi coi là hoàn thành.

- Tái sử dụng component/token nếu phù hợp với số đo và hành vi đã quan sát.
- Xóa logic hiển thị cũ trong phần được giao khi nó đã được thay thế; tránh hai nguồn state hoặc hai luồng lưu cạnh tranh.
- Giữ tương thích dữ liệu cũ và hành vi ngoài phạm vi.
- Xử lý popup không tràn màn hình, focus, Escape và thao tác trong drawer/dialog.
- Không tự thêm nghiệp vụ còn thiếu; nếu phát hiện giữa quá trình làm, cập nhật báo cáo và tiếp tục phần độc lập.

### Bước 5 — Đối chiếu hai web và kiểm thử

Thực hiện cùng kịch bản, cùng dữ liệu và cùng điều kiện trên hai bên. Chụp từng trạng thái quan trọng; dùng ảnh cạnh nhau hoặc overlay/diff để tìm sai lệch. Đo kích thước/vị trí khi ảnh cho thấy khác biệt; không chỉ dựa vào trí nhớ.

Với thay đổi ảnh hưởng lưu trữ, phải kiểm tra lưu qua API thật rồi tải lại. Mock chỉ kiểm chứng được phần mô phỏng. Với thay đổi renderer, kiểm tra preview và bề mặt hiển thị liên quan; với state, kiểm tra chuyển đối tượng và undo/redo nếu được hỗ trợ.

Chạy lint, typecheck, build và test thích hợp với phạm vi thay đổi theo quy ước repo. Bổ sung test cho hành vi đáng bảo vệ như dữ liệu, giới hạn, cancel/save hoặc tương tác phức tạp; không viết test chỉ để lặp lại CSS hay chi tiết implementation.

Sau khi sửa sai lệch, kiểm tra lại tiêu chí bị ảnh hưởng. Test tự động qua không thay thế đối chiếu giao diện và nghiệp vụ với Cinelove.

### Bước 6 — Báo cáo kết quả và phần thiếu

Kết quả phải tách rõ:

- **Đã đối chiếu và sửa:** chức năng có ở hai bên, kiểm thử đã thực hiện, đường dẫn manual test.
- **Cinelove có, source chưa có:** danh sách để người dùng quyết định phương án đồng bộ. Không ghi như công việc đã triển khai.
- **Chưa xác minh hoặc còn khác biệt:** nguyên nhân, ảnh hưởng và bằng chứng đang thiếu. Không trộn với mục đã đạt.

Mỗi chức năng thiếu cần nêu: người dùng sẽ làm được gì trên Cinelove, source hiện có phần liên quan nào, cần bổ sung ở UI/state/schema/API/renderer ra sao, phụ thuộc và ảnh hưởng dữ liệu cũ. Đây là đề xuất để lên phương án, không phải quyết định tự mở rộng phạm vi.

Không cần dừng toàn bộ công việc để xin xác nhận danh sách thiếu. Hoàn thành các phần đã được giao và đủ thông tin, rồi cung cấp báo cáo cụ thể để người dùng quyết định bước tiếp theo.

## 5. Ví dụ áp dụng quy tắc phạm vi

Các ví dụ dưới đây minh họa cách phân loại, không khẳng định trạng thái source hoặc Cinelove ở thời điểm hiện tại.

| Tình huống                                                                   | Cách làm                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Cả hai có chọn màu; source bị tràn popup                                     | Sửa layout, vị trí, trạng thái và thao tác của bộ chọn màu; kiểm tra sau lưu.            |
| Cả hai có giãn dòng; source dùng ô nhập, Cinelove dùng popup slider + ô nhập | Đổi cách điều khiển, đồng bộ giá trị và hành vi trong chức năng giãn dòng hiện có.       |
| Cả hai có nhóm hiệu ứng; Cinelove có thêm một loại source chưa hỗ trợ        | Đối chiếu các loại đã có; báo cáo loại thiếu để lên phương án, không tự bổ sung loại đó. |
| Cinelove có liên kết dữ liệu nhưng source chỉ có nút giữ chỗ                 | Báo cáo “có một phần”; không tự xây toàn bộ hệ thống liên kết dữ liệu.                   |
| Source có tiện ích riêng không xuất hiện trên Cinelove                       | Giữ nguyên, trừ khi người dùng yêu cầu thay đổi hoặc xóa cụ thể.                         |

## 6. Điều kiện kết thúc

- Mỗi chức năng trong phạm vi đã được phân loại, có căn cứ và không bị bỏ sót âm thầm.
- Các tiêu chí thuộc phần triển khai đã có kết quả; chưa đạt/chưa kiểm tra được nêu rõ.
- Không có chức năng thiếu được tự thêm ngoài phạm vi.
- Giao diện, tương tác và dữ liệu sau lưu đã được kiểm tra ở mức áp dụng được.
- Báo cáo chức năng thiếu đủ cụ thể để người dùng lên phương án đồng bộ.
- Hồ sơ phản ánh đúng trạng thái cuối cùng; không dùng số phần trăm để che phần chưa xác minh.
