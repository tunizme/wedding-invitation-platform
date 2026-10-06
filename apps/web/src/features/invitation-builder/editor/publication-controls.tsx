'use client';
import { useState } from 'react';
import { BuilderApiError, type TemplateDetail } from '../api/client';
import {
  enqueueTemplatePublication,
  getPublicationOperation,
  unpublishTemplate,
  publicationResult,
  type TemplateLifecycle,
} from '../api/operations';

export function PublicationControls({
  template,
  dirty,
  externalBusy = false,
  canStart,
  saveBeforePublish,
  onChanged,
  onBusy,
}: {
  template: TemplateDetail;
  dirty: boolean;
  externalBusy?: boolean;
  canStart?: () => boolean;
  saveBeforePublish: () => Promise<TemplateDetail | null>;
  onChanged: (committed?: TemplateLifecycle) => Promise<void>;
  onBusy?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [refreshPending, setRefreshPending] = useState(false);

  async function publish() {
    if (busy || externalBusy || canStart?.() === false) return;
    setBusy(true);
    setMessage('');
    try {
      const current = dirty ? await saveBeforePublish() : template;
      if (!current) return;
      onBusy?.(true);
      const accepted = await enqueueTemplatePublication(
        current.id,
        current.editVersion,
        crypto.randomUUID(),
      );
      setMessage('Đang chuẩn bị bản xuất bản…');
      const deadline = Date.now() + 90_000;
      let operation = accepted;
      while (
        Date.now() < deadline &&
        (operation.status === 'PENDING' || operation.status === 'RUNNING')
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        operation = await getPublicationOperation(operation.id);
      }
      if (operation.status === 'SUCCEEDED') {
        const result = publicationResult(operation, current.id);
        if (!result.revisionId) throw new Error('Missing revision');
        setMessage('Đã xuất bản phiên bản mới.');
        try {
          await onChanged({
            status: 'PUBLISHED',
            editVersion: result.editVersion,
            publishedRevisionId: result.revisionId,
          });
          setRefreshPending(false);
        } catch (error) {
          setRefreshPending(true);
          setMessage(
            error instanceof BuilderApiError &&
              error.code === 'VERSION_CONFLICT'
              ? 'Đã xuất bản phiên bản mới. ' + error.message
              : 'Đã xuất bản phiên bản mới nhưng chưa tải được thông tin.',
          );
        }
      } else if (operation.status === 'FAILED') {
        const issue = operation.error?.issues[0];
        setMessage(
          'Không thể xuất bản. Bản công khai hiện tại vẫn được giữ.' +
            (issue
              ? ` Cần sửa ${issue.code} tại ${issue.path}.`
              : operation.error
                ? ` Mã lỗi: ${operation.error.code}.`
                : ''),
        );
      } else setMessage('Tác vụ vẫn đang xử lý. Bạn có thể kiểm tra lại sau.');
    } catch (error) {
      setMessage(
        error instanceof BuilderApiError
          ? error.message +
              (error.issues[0]
                ? ` Cần sửa ${error.issues[0].code} tại ${error.issues[0].path}.`
                : ` Mã lỗi: ${error.code}.`)
          : 'Không thể xuất bản mẫu.',
      );
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  async function unpublish() {
    if (busy || externalBusy || canStart?.() === false) return;
    setBusy(true);
    onBusy?.(true);
    setMessage('');
    try {
      const committed = await unpublishTemplate(
        template.id,
        template.editVersion,
      );
      setMessage('Đã gỡ mẫu khỏi thư viện.');
      await onChanged(committed);
    } catch (error) {
      setMessage(
        error instanceof BuilderApiError ? error.message : 'Không thể gỡ mẫu.',
      );
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  return (
    <section
      aria-label="Xuất bản mẫu"
      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
    >
      <button
        type="button"
        disabled={busy || externalBusy}
        onClick={() => void publish()}
      >
        {busy ? 'Đang xử lý…' : 'Xuất bản'}
      </button>
      {template.status === 'PUBLISHED' && (
        <button
          type="button"
          disabled={busy || externalBusy}
          onClick={() => void unpublish()}
        >
          Gỡ xuất bản
        </button>
      )}
      {refreshPending && (
        <button
          type="button"
          disabled={busy || externalBusy}
          onClick={async () => {
            if (busy || externalBusy || canStart?.() === false) return;
            setBusy(true);
            onBusy?.(true);
            try {
              await onChanged();
              setRefreshPending(false);
              setMessage('Đã tải lại thông tin xuất bản.');
            } catch (error) {
              setMessage(
                error instanceof BuilderApiError &&
                  error.code === 'VERSION_CONFLICT'
                  ? 'Đã xuất bản phiên bản mới. ' + error.message
                  : 'Đã xuất bản phiên bản mới nhưng chưa tải được thông tin.',
              );
            } finally {
              setBusy(false);
              onBusy?.(false);
            }
          }}
        >
          Thử tải lại thông tin
        </button>
      )}
      {message && <span role="status">{message}</span>}
    </section>
  );
}
