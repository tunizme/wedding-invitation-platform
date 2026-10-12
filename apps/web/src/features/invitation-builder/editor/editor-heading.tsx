import { ArrowLeft, Check, Circle, PenLine } from 'lucide-react';
import styles from './authoring-workspace.module.css';

export function EditorHeading({
  title,
  dirty,
  responsive = false,
}: {
  title: string;
  dirty: boolean;
  responsive?: boolean;
}) {
  return (
    <header className={styles.heading}>
      <a
        className={styles.back}
        href="/admin/templates"
        aria-label="Danh sách mẫu"
        title="Danh sách mẫu"
      >
        <ArrowLeft size={20} aria-hidden="true" />
      </a>
      <span className={styles.studioMark} aria-hidden="true">
        <PenLine size={20} />
      </span>
      <div className={styles.documentTitle}>
        <p className={styles.eyebrow}>
          TIỆM LÀM THIỆP <span>/ Thiết kế mẫu</span>
        </p>
        <h1>{title}</h1>
      </div>
      <span className={styles.identity}>
        {dirty ? (
          <Circle size={12} aria-hidden="true" />
        ) : (
          <Check size={14} aria-hidden="true" />
        )}
        {dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu bản nháp'}
      </span>
      <span className={styles.formatBadge}>
        {responsive ? 'Responsive' : 'Canvas 390px'}
      </span>
    </header>
  );
}
