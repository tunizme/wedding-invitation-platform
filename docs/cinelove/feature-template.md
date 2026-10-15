# Đối chiếu Cinelove: <tên chức năng>

> Sao chép thành `docs/cinelove/<ten-chuc-nang>.md`. Điền bằng chứng thực tế; không đánh dấu đạt từ giả định. Xóa hướng dẫn giữ chỗ khi hoàn thiện hồ sơ.

## 1. Phạm vi

- Yêu cầu người dùng:
- Ngày khảo sát / ngày kiểm tra lại:
- URL và đường đi đến chức năng trên Cinelove:
- URL và đường đi tương ứng trên web local:
- Đối tượng / dữ liệu kiểm thử:
- Viewport / browser zoom / canvas zoom:
- Ngoại lệ do người dùng yêu cầu và căn cứ:

## 2. Kiểm kê hai bên

| ID  | Chức năng cụ thể | Source: có / một phần / chưa có / chưa rõ | Bằng chứng source           | Bằng chứng Cinelove                       | Quyết định: sửa / báo thiếu / giữ / khảo sát thêm |
| --- | ---------------- | ----------------------------------------- | --------------------------- | ----------------------------------------- | ------------------------------------------------- |
| F01 |                  |                                           | File, symbol, luồng thực tế | Trạng thái đã thao tác, ảnh hoặc ghi nhận |                                                   |

Chỉ các dòng xác định đã có ở cả hai bên mới thuộc phạm vi sửa theo quy trình mặc định. Chức năng mới được người dùng giao riêng phải ghi căn cứ tại mục 1.

## 3. Hành vi đã quan sát

| ID  | Chức năng | Điều kiện ban đầu | Thao tác | Kết quả thực tế trên Cinelove | Bằng chứng | Đã xác minh / chưa xác minh |
| --- | --------- | ----------------- | -------- | ----------------------------- | ---------- | --------------------------- |
| R01 | F01       |                   |          |                               |            |                             |

Ghi các trạng thái áp dụng được: mặc định, mở/đóng, focus, chỉnh sửa, giới hạn, xác nhận/hủy, chọn lại đối tượng, lưu/tải lại, undo/redo, preview. Trường hợp không áp dụng cần nêu lý do.

## 4. Thông số giao diện và dữ liệu

| Thuộc tính                                    | Giá trị source | Giá trị Cinelove đã đo/quan sát | Cách đo / bằng chứng | Thay đổi thuộc phạm vi |
| --------------------------------------------- | -------------- | ------------------------------- | -------------------- | ---------------------- |
| Bố cục, kích thước, khoảng cách               |                |                                 |                      |                        |
| Font, màu, icon, viền, bóng                   |                |                                 |                      |                        |
| Popup: điểm neo, hướng mở, xử lý mép màn hình |                |                                 |                      |                        |
| Giá trị mặc định, đơn vị, min/max/step        |                |                                 |                      |                        |
| Thời điểm áp dụng, hủy, lưu và tải lại        |                |                                 |                      |                        |

## 5. Tiêu chí nghiệm thu phần sẽ sửa

| ID   | Chức năng / quan sát liên quan | Điều kiện + thao tác | Kết quả mong đợi cụ thể | Cách kiểm tra | Kết quả / bằng chứng |
| ---- | ------------------------------ | -------------------- | ----------------------- | ------------- | -------------------- |
| AC01 | F01 / R01                      |                      |                         |               | Chưa kiểm tra        |

Kết quả chỉ dùng: **Đạt**, **Chưa đạt**, **Chưa kiểm tra**, **Không áp dụng (lý do)**. Không đánh dấu toàn bộ một nhóm đạt khi mới kiểm tra một trạng thái.

## 6. Kế hoạch sửa chức năng hiện có

- Component và state/command liên quan:
- Schema, validation, API hoặc lưu trữ cần chỉnh nếu có:
- Renderer / preview / trang người xem chịu ảnh hưởng:
- Tương thích dữ liệu cũ và hành vi cần bảo vệ:
- Logic cũ bị thay thế trong phạm vi:
- Skill và hướng dẫn đã áp dụng:

## 7. Cinelove có nhưng source còn thiếu — chỉ báo cáo

| ID  | Chức năng thiếu và lợi ích | Bằng chứng tham chiếu | Source hiện có phần nào | Đề xuất tích hợp đồng bộ                   | Phụ thuộc / tác động dữ liệu | Trạng thái                                    |
| --- | -------------------------- | --------------------- | ----------------------- | ------------------------------------------ | ---------------------------- | --------------------------------------------- |
| M01 |                            |                       |                         | UI, state, schema, API, renderer liên quan |                              | Chưa triển khai; chờ người dùng lên phương án |

Không có phần thiếu thì ghi “Không phát hiện trong phạm vi đã khảo sát”, không suy rộng sang toàn bộ website. Không thêm code cho các dòng này chỉ vì đang chỉnh cùng panel.

## 8. Kết quả kiểm tra

- Lệnh kiểm tra và kết quả thực tế:
- Kịch bản tương tác đã chạy trên hai web:
- Ảnh reference/local/diff và điều kiện chụp:
- Kiểm tra API thật, lưu/tải lại, preview nếu liên quan:
- Những phần chỉ kiểm tra bằng mock:
- Sai khác còn lại / nhánh chưa xác minh / lý do:
- URL và bước manual test:

## 9. Bàn giao

- Đã sửa và đối chiếu đạt:
- Chức năng thiếu cần người dùng lên phương án:
- Chưa đạt hoặc chưa đủ bằng chứng:
- Ngoại lệ đã áp dụng theo yêu cầu:

Không kết luận “giống 100%” khi còn tiêu chí chưa đạt hoặc chưa xác minh; báo đúng phạm vi đã kiểm chứng.
