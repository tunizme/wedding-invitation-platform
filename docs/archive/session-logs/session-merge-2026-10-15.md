# Merge gói thay đổi ngày 15/10/2026

Đã ghép gói `/home/tunizme/Workspace/session-changes-2026-10-15-171812` vào workspace hiện tại. Đã xác minh SHA-256 của toàn bộ 30 file theo `SESSION-CHANGES.json` trước khi ghép.

- Cập nhật 24 file đã có, thêm 5 file mới. Nội dung 29 file sau merge khớp manifest.
- Không nhập `apps/web/next-env.d.ts` từ máy Windows; để Next.js sinh theo môi trường local.
- Đã đọc diff trước khi ghép; các thay đổi ngoài danh sách trong manifest được giữ nguyên. Không tạo commit.
- Bản sao trước merge và danh sách thao tác: `/tmp/session-merge-backup-20261015-190420/merge-report.json` (thư mục tạm trên máy này).

Thay đổi gồm xóa mẫu chưa xuất bản, điều chỉnh phần Tùy chỉnh, tạm ẩn lời chúc/lượt thích mà vẫn giữ API/dữ liệu, thời gian hiển thị theo Việt Nam, hỗ trợ mc native và tài liệu/test bổ sung.

## Kiểm tra tại workspace sau merge

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: qua toàn workspace.
- API unit: 94/94 qua.
- Web: 613 test qua trong sandbox; 4 test delivery proxy bị `listen EPERM` và đã chạy lại ngoài sandbox, 4/4 qua. Tổng 617 test qua qua hai lượt chạy.
- HTTP boundary: 5/5 qua khi chạy ngoài sandbox.
- Chưa chạy lại test tích hợp `template-delete` và `managed-invitations` cần PostgreSQL/MinIO; `docker compose ps` không có dịch vụ đang chạy. Chưa smoke browser trong phiên merge này.

Bằng chứng Windows trong hand-off là lịch sử từ máy trước; các server/tài khoản/ảnh chụp bên đó không được chuyển theo gói này. Merge source không chuyển database hoặc object storage.
