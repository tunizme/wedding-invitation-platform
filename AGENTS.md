# Quy ước làm việc trong repository

## Yêu cầu đối chiếu và làm theo tham chiếu

Khi người dùng yêu cầu làm giống, clone, đối chiếu hoặc sửa một phần theo trang tham chiếu (như Cinelove):

1. Kiểm kê từng chức năng cụ thể ở cả source hiện tại và trang tham chiếu. Chỉ triển khai đối chiếu đối với chức năng đã có ở cả hai bên, trong phạm vi người dùng yêu cầu.
2. Nếu trang tham chiếu có chức năng mà source chưa có, báo cáo phần thiếu và đề xuất tích hợp; không tự triển khai, thêm UI giả hoặc tự ý mở rộng hệ thống. Chỉ thực hiện khi người dùng giao làm phần đó.
3. Với chức năng source có nhưng trang tham chiếu không có, giữ nguyên trừ khi người dùng yêu cầu khác. Không xóa chỉ để giống trang tham chiếu.
4. Trực tiếp khảo sát các trạng thái và tương tác trên thực tế; không suy diễn hành vi từ một ảnh tĩnh hoặc từ phỏng đoán. Phần chưa xác minh phải ghi rõ.
5. Khi triển khai giao diện, áp dụng skill `ui-ux-pro-max`, `MASTER.md` và các hướng dẫn trong repository để đảm bảo chất lượng, tính khả dụng và khả năng tương thích.

Yêu cầu cụ thể mới nhất của người dùng được ưu tiên. Tiếp tục chủ động các phần đã được giao; báo cáo chức năng thiếu không phải lý do dừng phần công việc độc lập đã đủ thông tin.
