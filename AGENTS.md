# Quy ước làm việc trong repository

## Yêu cầu làm giống Cinelove

Khi người dùng yêu cầu làm giống, clone, đối chiếu hoặc sửa một phần theo Cinelove:

1. Đọc và áp dụng [cinelove-clone.md](cinelove-clone.md) trước khi sửa code.
2. Kiểm kê từng chức năng ở cả source hiện tại và Cinelove. Chỉ triển khai đối chiếu đối với chức năng đã có ở cả hai bên, trong phạm vi người dùng yêu cầu.
3. Nếu Cinelove có chức năng mà source chưa có, báo cáo phần thiếu và đề xuất tích hợp; không tự triển khai, thêm UI giả hoặc mở rộng hệ thống. Chỉ thực hiện khi người dùng giao làm phần đó.
4. Với chức năng source có nhưng Cinelove không có, giữ nguyên trừ khi người dùng yêu cầu khác. Không xóa chỉ để giống trang tham chiếu.
5. Trực tiếp khảo sát các trạng thái và tương tác trên Cinelove; không suy diễn hành vi từ một ảnh hoặc từ source hiện tại. Phần chưa xác minh phải ghi rõ.
6. Dùng mẫu [hồ sơ đối chiếu](docs/cinelove/feature-template.md) để lưu phạm vi, bằng chứng, tiêu chí nghiệm thu và kết quả. Không tuyên bố giống 100% khi còn tiêu chí chưa kiểm chứng.
7. Khi triển khai giao diện, áp dụng skill `ui-ux-pro-max` và các hướng dẫn tại thư mục liên quan. Skill hỗ trợ chất lượng triển khai; không thay thế giao diện tham chiếu bằng thiết kế tự chọn.

Yêu cầu cụ thể mới nhất của người dùng được ưu tiên. Tiếp tục chủ động các phần đã được giao; báo cáo chức năng thiếu không phải lý do dừng phần công việc độc lập đã đủ thông tin.
