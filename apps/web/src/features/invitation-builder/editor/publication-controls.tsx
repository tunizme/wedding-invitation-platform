'use client';
import {
  scopedDelay,
  useOperationLifetime,
  type OperationLifetime,
} from '../../identity-access/session/operation-scope';
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
  lifetime: ownerLifetime,
}: {
  template: TemplateDetail;
  dirty: boolean;
  externalBusy?: boolean;
  canStart?: () => boolean;
  saveBeforePublish: () => Promise<TemplateDetail | null>;
  onChanged: (committed?: TemplateLifecycle) => Promise<void>;
  onBusy?: (busy: boolean) => void;
  lifetime?: OperationLifetime;
}) {
  const localLifetime = useOperationLifetime(template.id);
  const lifetime = ownerLifetime ?? localLifetime;
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [refreshPending, setRefreshPending] = useState(false);

  async function publish() {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    if (busy || externalBusy || canStart?.() === false) return;
    setBusy(true);
    setMessage('');
    try {
      const current = dirty ? await saveBeforePublish() : template;
      if (!scope.isActive()) return;
      if (!current) return;
      onBusy?.(true);
      const accepted = await enqueueTemplatePublication(
        current.id,
        current.editVersion,
        crypto.randomUUID(),
        { scope },
      );
      if (!scope.isActive()) return;
      setMessage('Đang chuẩn bị bản xuất bản…');
      const deadline = Date.now() + 90_000;
      let operation = accepted;
      while (
        Date.now() < deadline &&
        (operation.status === 'PENDING' || operation.status === 'RUNNING')
      ) {
        await scopedDelay(1000, scope);
        if (!scope.isActive()) return;
        operation = await getPublicationOperation(operation.id, { scope });
        if (!scope.isActive()) return;
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
          if (!scope.isActive()) return;
          setRefreshPending(false);
        } catch (error) {
          if (!scope.isActive()) return;
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
              ? ` Cần sửa ${issue.code} tại ${issue.path}${issue.sectionId ? ` · section ${issue.sectionId}` : ''}${issue.layout ? ` · ${issue.layout}` : ''}.`
              : operation.error
                ? ` Mã lỗi: ${operation.error.code}.`
                : ''),
        );
      } else setMessage('Tác vụ vẫn đang xử lý. Bạn có thể kiểm tra lại sau.');
    } catch (error) {
      if (!scope.isActive()) return;
      setMessage(
        error instanceof BuilderApiError
          ? error.message +
              (error.issues[0]
                ? ` Cần sửa ${error.issues[0].code} tại ${error.issues[0].path}.`
                : ` Mã lỗi: ${error.code}.`)
          : 'Không thể xuất bản mẫu.',
      );
    } finally {
      if (!scope.isActive()) return;
      setBusy(false);
      onBusy?.(false);
    }
  }

  async function unpublish() {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    if (busy || externalBusy || canStart?.() === false) return;
    setBusy(true);
    onBusy?.(true);
    setMessage('');
    try {
      const committed = await unpublishTemplate(
        template.id,
        template.editVersion,
        { scope },
      );
      if (!scope.isActive()) return;
      setMessage('Đã gỡ mẫu khỏi thư viện.');
      await onChanged(committed);
      if (!scope.isActive()) return;
    } catch (error) {
      if (!scope.isActive()) return;
      setMessage(
        error instanceof BuilderApiError ? error.message : 'Không thể gỡ mẫu.',
      );
    } finally {
      if (!scope.isActive()) return;
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
            const scope = lifetime.capture();
            if (!scope.isActive()) return;
            if (busy || externalBusy || canStart?.() === false) return;
            setBusy(true);
            onBusy?.(true);
            try {
              await onChanged();
              if (!scope.isActive()) return;
              setRefreshPending(false);
              setMessage('Đã tải lại thông tin xuất bản.');
            } catch (error) {
              if (!scope.isActive()) return;
              setMessage(
                error instanceof BuilderApiError &&
                  error.code === 'VERSION_CONFLICT'
                  ? 'Đã xuất bản phiên bản mới. ' + error.message
                  : 'Đã xuất bản phiên bản mới nhưng chưa tải được thông tin.',
              );
            } finally {
              if (!scope.isActive()) return;
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
