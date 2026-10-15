# Tiếp tục phát triển trên máy khác

Bản ZIP gồm toàn bộ file source trong workspace, kể cả các thay đổi chưa commit, font, tài nguyên tĩnh, migration, tài liệu, `.git`, các file `.env` hiện có và `.secrets`. Không cần chép `node_modules`, cache, kết quả build hoặc log kiểm thử; cài lại chúng trên máy mới.

**PostgreSQL và ảnh/nhạc đã upload trong MinIO nằm ở Docker volumes ngoài repository, nên không nằm trong bản ZIP source.** Nếu cần giữ nguyên mẫu/thiệp/customer đã lưu, phải chuyển thêm backup database và object storage. Nếu bắt đầu bằng database mới, chạy migration và tạo tài khoản admin mới như bên dưới.

## 1. Cài công cụ và dependencies

Máy Windows không dùng Docker có thể chạy PostgreSQL/MinIO/Mailpit trực tiếp theo [hướng dẫn Windows không Docker](windows-without-docker.md).

- Node.js 24 theo `.nvmrc`, Corepack/pnpm theo `package.json`.
- Docker Engine/Desktop có Docker Compose v2.
- Giải nén vào một thư mục riêng; không dùng lại đường dẫn `node_modules` của máy cũ.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @wedding/api exec playwright install chromium
```

Trên Linux, nếu thiếu thư viện hệ thống cho Chromium, dùng hướng dẫn của Playwright hoặc `playwright install --with-deps chromium` với quyền quản trị phù hợp.

## 2. Kiểm tra cấu hình local

Giữ các file `.env`/`.secrets` đi kèm cho môi trường riêng. Có thể dựng cấu hình mới từ `.env.example`, `apps/api/.env.example` và `apps/web/.env.example` theo [IAM operations](../iam-operations.md).

Đồng bộ các giá trị trước khi chạy:

- Port PostgreSQL trong root `.env` phải khớp port của `DATABASE_URL` ở `apps/api/.env`.
- `BUILDER_S3_ENDPOINT` phải trỏ đến MinIO mới. Cấu hình API được mang từ máy này đang dùng port **19000**; Compose mặc định dùng **9000**. Chọn một port rồi cập nhật endpoint/port cho khớp.
- Root credentials MinIO dùng để tạo bucket/tài khoản; API dùng tài khoản storage có scope riêng. Cần provision chúng trên MinIO mới, không chỉ tạo bucket thủ công.
- `FRONTEND_ORIGIN`, `BUILDER_RENDER_ORIGIN`, frontend API URL và API internal URL phải khớp các port app mới. Mặc định web 3000, API 3001.
- Nếu có đường dẫn tuyệt đối đến key/certificate trong cấu hình, đổi sang đường dẫn trên máy mới.

Các file override tạm dưới `.artifacts` của máy cũ không được đóng gói; cấu hình app chính là nguồn cấu hình trên máy mới.

## 3. Dựng hạ tầng và migration

MinIO dùng image được build từ source pin phiên bản trong repository; máy mới chưa có image local này.

```bash
docker compose build minio
docker build --target client -t wedding-builder-mc:2025-08-13 infra/minio
docker compose up -d --wait postgres minio mailpit
pnpm builder:storage:init
pnpm --filter @wedding/api migration:run
pnpm --filter @wedding/api bootstrap:admin -- --email your-email@example.com
```

Lệnh bootstrap hỏi mật khẩu trong terminal, không cần ghi mật khẩu vào command. Các trường storage development/test phải được cấu hình theo `.env.example` trước khi provision. Mailpit dùng để xem email local, không gửi email thật ra ngoài.

## 4. Chạy và kiểm tra

Sau khi hạ tầng đã chạy, mở hai terminal:

```bash
pnpm --filter @wedding/api dev
```

```bash
pnpm dev:web
```

Đăng nhập admin, mở `/admin/templates` để thiết kế/xuất bản mẫu; sau đó mở `/admin/invitations` để tạo thiệp riêng, xác nhận thanh toán và bàn giao. Chi tiết tính năng mới: [managed-invitations.md](../editor/managed-invitations.md).

```bash
pnpm typecheck:api
pnpm typecheck:web
pnpm lint:api
pnpm lint:web
pnpm test:api
pnpm test:web
```

Các test tích hợp cần database/schema và storage kiểm thử riêng theo runner của repository. Không chạy fixture test lên dữ liệu đang sử dụng.
