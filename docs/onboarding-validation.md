# Optional onboarding và timed diagnostic study

Protocol này dành cho usability study tương lai và không phải completion gate của Project
Foundation trong rapid development.

## Participants

Chọn đúng 5 developer chưa tham gia implementation. Mỗi người dùng máy hoặc VM chưa từng chạy project và chỉ nhận README cùng các prerequisite đã ghi.

## Fresh-clone exercise

1. Bắt đầu đồng hồ trước khi clone.
2. Làm đúng README, không nhận hướng dẫn trực tiếp.
3. Dừng đồng hồ khi `pnpm health` báo đủ frontend, backend liveness/readiness và PostgreSQL healthy.
4. Pass khi hoàn tất trong 30 phút với 0 lần hỗ trợ trực tiếp.

## Timed diagnostic exercise

Với mỗi participant, người điều phối bí mật làm một component không khả dụng. Bắt đầu đồng hồ khi participant nhận thông báo stack unhealthy. Participant chỉ dùng README và `pnpm health`; pass khi xác định đúng component trong 2 phút. Ít nhất 4/5 người phải pass.

## Recording

Ghi participant bằng mã ẩn danh, environment, commit SHA, thời gian onboarding, support count, failure component, diagnostic time, kết quả và ghi chú vào `docs/onboarding-validation-results.md`. Không ghi credential hay dữ liệu cá nhân.
