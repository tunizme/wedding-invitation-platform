'use client';
import Link from 'next/link';
import type { RefObject } from 'react';
import { Check, Eye } from 'lucide-react';
import { ModalSurface } from '../../ui/platform/modal-surface';
import { Button } from '../../ui/platform/button';
import { InlineAlert } from '../../ui/platform/feedback';
import type { TemplateChoice } from './api';
import {
  DemoQr,
  PreviewFeedback,
  TemplatePreview,
  templateDemoPath,
  useTemplatePreview,
  type useTemplateCreation,
} from './template-preview';
import styles from './template-catalog.module.css';

export function TemplatePopup({
  choice,
  onClose,
  onReload,
  returnFocusRef,
  fallbackFocusRef,
  creation,
}: {
  choice: TemplateChoice;
  onClose: () => void;
  onReload: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  creation: ReturnType<typeof useTemplateCreation>;
}) {
  const preview = useTemplatePreview(choice.id, choice.publishedRevisionId);
  const href = templateDemoPath(choice.id, choice.publishedRevisionId);
  return (
    <ModalSurface
      label={choice.name}
      variant="centered"
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      fallbackFocusRef={fallbackFocusRef}
    >
      <div className={styles.popupGrid}>
        <div className={styles.previewPane}>
          <PreviewFeedback {...preview} reload={onReload} />
          {preview.state.status === 'ready' && (
            <TemplatePreview ready={preview.state} mobile />
          )}
        </div>
        <div className={styles.details}>
          <div>
            <p className={styles.category}>{choice.category}</p>
            <h3 className={styles.detailTitle}>
              Lời mời mang câu chuyện của hai bạn.
            </h3>
            <div className={styles.tags}>
              {(choice.tags ?? []).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
          <div>
            <h4>Cùng mẫu thiệp này</h4>
            <ul className={styles.features}>
              <li>
                <Check size={16} aria-hidden="true" />
                Điền thông tin theo mẫu
              </li>
              <li>
                <Check size={16} aria-hidden="true" />
                Nội dung theo thiết kế của mẫu
              </li>
              <li>
                <Check size={16} aria-hidden="true" />
                Chia sẻ bằng đường dẫn
              </li>
              <li>
                <Check size={16} aria-hidden="true" />
                Xem trước trước khi xuất bản
              </li>
            </ul>
          </div>
          <div className={styles.demoQr}>
            <DemoQr href={href} />
            <p>
              Quét mã QR để xem demo
              <br />
              trực tiếp trên điện thoại.
            </p>
          </div>
          {creation.error && (
            <InlineAlert tone="error">
              {creation.error}
              <p>
                {creation.uncertain ? (
                  <Link href="/invitations">Kiểm tra Thiệp của tôi</Link>
                ) : creation.unavailable ? (
                  <Button variant="secondary" onClick={onReload}>
                    Tải lại kho mẫu
                  </Button>
                ) : null}
              </p>
            </InlineAlert>
          )}
          <p className={styles.hint}>
            Nội dung demo là dữ liệu mẫu. Bạn sẽ thêm câu chuyện của mình sau
            khi chọn mẫu.
          </p>
          <div className={styles.actions}>
            <Button
              busy={creation.busy}
              disabled={
                preview.state.status !== 'ready' ||
                creation.uncertain ||
                creation.unavailable
              }
              onClick={() =>
                void creation.create(choice.id, choice.publishedRevisionId)
              }
            >
              {creation.busy ? 'Đang tạo thiệp…' : 'Chọn mẫu này'}
            </Button>
            <Link className={styles.demoLink} href={href}>
              <Eye size={18} aria-hidden="true" />
              Xem demo
            </Link>
          </div>
        </div>
      </div>
    </ModalSurface>
  );
}
