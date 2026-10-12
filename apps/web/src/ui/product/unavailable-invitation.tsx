import Link from 'next/link';
import { Heart } from 'lucide-react';
import styles from './unavailable-invitation.module.css';

export function UnavailableInvitation() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span className={styles.mark} aria-hidden="true">
          <Heart size={28} />
        </span>
        <h1>Thiệp không khả dụng.</h1>
        <p>
          Lời mời này chưa được xuất bản hoặc hiện đã tạm dừng. Bạn có thể liên
          hệ người gửi để nhận đường dẫn mới.
        </p>
        <Link href="/">Về Tiệm làm thiệp →</Link>
      </section>
    </main>
  );
}
