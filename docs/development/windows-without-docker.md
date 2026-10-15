# Chạy local trên Windows không cần Docker

Ứng dụng vẫn dùng PostgreSQL, storage S3/MinIO và SMTP như môi trường Docker. Chỉ thay cách khởi động dịch vụ; không dùng SQLite hoặc storage giả thay cho kiểm tra tích hợp.

## PostgreSQL có sẵn

Máy hiện tại có PostgreSQL 17.11 tại `C:\Users\RkUser\pgsql`, data tại `C:\Users\RkUser\pgsql\data`, nghe ở `127.0.0.1:55432`.

```powershell
& 'C:\Users\RkUser\pgsql\bin\pg_ctl.exe' -D 'C:\Users\RkUser\pgsql\data' -l 'C:\Users\RkUser\pgsql\postgres.log' start
& 'C:\Users\RkUser\pgsql\bin\pg_isready.exe' -h 127.0.0.1 -p 55432
```

Giữ nguyên data directory đã có; không chạy `initdb` lên đó. Cấu hình `DATABASE_URL` theo port trên. Dùng database `wedding_validation` riêng cho `IAM_TEST_DATABASE_URL`/`BUILDER_TEST_DATABASE_URL`; runner tạo schema ngẫu nhiên và tự dọn schema. Không chạy fixture trực tiếp trên database đang sử dụng.

## MinIO và Mailpit

Máy hiện tại có Go tại `C:\Users\RkUser\go\bin\go.exe`. Có thể build MinIO và mc đúng các release trong `infra/minio/Dockerfile` vào thư mục bị Git bỏ qua:

```powershell
$env:GOBIN = Join-Path (Get-Location) '.artifacts\native\bin'
$env:CGO_ENABLED = '0'
$env:GOTELEMETRY = 'off'
& 'C:\Users\RkUser\go\bin\go.exe' install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z
& 'C:\Users\RkUser\go\bin\go.exe' install github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z
& 'C:\Users\RkUser\go\bin\go.exe' install github.com/axllent/mailpit@v1.27.8
```

Ở terminal đã nạp `MINIO_ROOT_USER` và `MINIO_ROOT_PASSWORD` từ cấu hình local, chạy MinIO với dữ liệu riêng:

```powershell
.\.artifacts\native\bin\minio.exe server .artifacts/native/minio-data --address 127.0.0.1:19000 --console-address 127.0.0.1:19001
```

Ở terminal khác, chạy SMTP và giao diện xem email chỉ trên loopback:

```powershell
.\.artifacts\native\bin\mailpit.exe --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025
```

Cấu hình development/test S3 endpoint cùng là `http://127.0.0.1:19000`, bucket và credentials riêng biệt theo `.env.example`. Provision bằng mc native:

```powershell
$env:BUILDER_MC_EXECUTABLE = Join-Path (Get-Location) '.artifacts\native\bin\mc.exe'
pnpm.cmd builder:storage:init
```

Khi không đặt `BUILDER_MC_EXECUTABLE`, lệnh provision vẫn dùng Docker như trước. Cấu hình SMTP dùng host `127.0.0.1`, port `1025`, không TLS/auth cho Mailpit local. Email được giữ local.

## Ứng dụng và kiểm tra

Chạy migration trên database ứng dụng rồi khởi động API/web theo [hướng dẫn chuyển máy](transfer-to-another-machine.md). Trên Windows có thể gọi Next trực tiếp thay cho script dùng cú pháp shell POSIX:

```powershell
pnpm.cmd --filter @wedding/web exec next dev --hostname 127.0.0.1 --port 3000
```

Lint, typecheck, unit tests và build không cần Docker. Các test tích hợp cần database/storage thật đã khởi động và phải chạy qua runner sở hữu schema/prefix kiểm thử. Phần browser dùng Chromium local cần được cài riêng; không dùng nhánh browser runner khởi động container khi máy không có Docker.

Nguồn: [PostgreSQL Windows](https://www.postgresql.org/download/windows/), [Mailpit installation](https://mailpit.axllent.org/docs/install/), các release MinIO được pin trong `infra/minio/Dockerfile`.
