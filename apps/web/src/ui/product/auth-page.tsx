import type { ReactNode } from 'react';
import styles from './auth-page.module.css';

const stories: Record<string, [string, string, string]> = {
  login: [
    'Chào bạn,',
    'câu chuyện đang chờ.',
    'Đăng nhập để chọn mẫu và tạo lời mời của riêng mình.',
  ],
  register: [
    'Một khởi đầu mới,',
    'một lời mời riêng.',
    'Tạo tài khoản để lưu giữ và hoàn thiện thiệp của bạn.',
  ],
  'verify-email': [
    'Chỉ còn một bước,',
    'mình bắt đầu nhé.',
    'Mở email và xác minh tài khoản để tiếp tục.',
  ],
  'forgot-password': [
    'Mình tìm lại',
    'lối vào nhé.',
    'Nhập email để nhận hướng dẫn đặt lại mật khẩu.',
  ],
  'reset-password': [
    'Một mật khẩu mới,',
    'tiếp tục câu chuyện.',
    'Chọn mật khẩu mới cho tài khoản của bạn.',
  ],
  'social-onboarding': [
    'Rất vui được gặp bạn.',
    'Thêm một chút thông tin.',
    'Hoàn thiện hồ sơ để lời mời được lưu đúng tài khoản.',
  ],
  'oauth-result': [
    'Chào mừng trở lại.',
    'Câu chuyện tiếp nối.',
    'Đang kiểm tra kết quả đăng nhập của bạn.',
  ],
};
export function AuthPage({
  kind,
  children,
}: {
  kind: string;
  children: ReactNode;
}) {
  const copy = stories[kind] ?? stories.login;
  return (
    <main className={styles.page}>
      <section className={styles.story} aria-label="Lời chào từ tiệm">
        <p className={styles.eyebrow}>TIỆM LÀM THIỆP</p>
        <h2>
          {copy[0]}
          <br />
          <em>{copy[1]}</em>
        </h2>
        <p>{copy[2]}</p>
        <svg className={styles.art} viewBox="0 0 280 200" aria-hidden="true">
          <path
            d="M35 55H235V173H35ZM35 55L135 125L235 55M35 173L109 109M235 173L160 109M110 30Q99 8 84 21Q73 35 110 57Q147 35 134 21Q119 8 110 30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
        <p className={styles.quote}>
          “Một lời mời nhỏ,
          <br />
          đủ để mang mọi người đến gần.”
        </p>
      </section>
      <section className={styles.form}>
        <p className={styles.eyebrow}>BẮT ĐẦU TỪ ĐÂY</p>
        {children}
      </section>
    </main>
  );
}
