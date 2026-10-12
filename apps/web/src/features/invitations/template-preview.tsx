'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  builderRequest,
  BuilderApiError,
} from '../invitation-builder/api/client';
import { useOperationLifetime } from '../identity-access/session/operation-scope';
import { resolveDesign } from '../invitation-builder/document/resolve-design';
import { validateSupportedTemplateDesign } from '../invitation-builder/document/schema';
import {
  getTemplateRevision,
  createInvitation,
  type TemplateRevision,
} from './api';
import { PublicInvitationView } from './public-invitation-view';
import { Button } from '../../ui/platform/button';
import { InlineAlert, LocalStatus } from '../../ui/platform/feedback';

export const templateDemoPath = (id: string, revisionId: string) =>
  `/templates/${encodeURIComponent(id)}/demo?revision=${encodeURIComponent(revisionId)}`;
export const templateError = (cause: unknown) =>
  cause instanceof BuilderApiError && [404, 409].includes(cause.status)
    ? 'Mẫu đã thay đổi hoặc không còn khả dụng. Vui lòng tải lại kho mẫu.'
    : cause instanceof BuilderApiError
      ? cause.message
      : 'Không thể tải bản xem trước. Vui lòng thử lại.';
type Ready = {
  status: 'ready';
  revision: TemplateRevision;
  resolution: ReturnType<typeof resolveDesign>;
  assetUrls: Record<string, string>;
  asOf: string;
};
type PreviewState =
  | Ready
  | { status: 'loading' }
  | { status: 'error'; error: string; unavailable: boolean };

export function useTemplatePreview(id: string, revisionId: string) {
  const lifetime = useOperationLifetime(`TemplatePreview:${id}:${revisionId}`);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PreviewState>({ status: 'loading' });
  useEffect(() => {
    const scope = lifetime.capture();
    const urls: string[] = [];
    scope.onDispose(() => urls.forEach((url) => URL.revokeObjectURL(url)));
    queueMicrotask(() => {
      if (scope.isActive()) setState({ status: 'loading' });
    });
    void (async () => {
      try {
        const revision = await getTemplateRevision(id, revisionId, { scope });
        if (!scope.isActive()) return;
        if (
          revision.id !== id ||
          revision.revisionId !== revisionId ||
          !validateSupportedTemplateDesign(revision.document).valid
        )
          throw new BuilderApiError(422, 'DOCUMENT_INVALID');
        const asOf = new Date().toISOString();
        const resolution = resolveDesign(
          revision.document,
          revision.sampleData,
          { mode: 'preview', asOf },
        );
        const entries = await Promise.all(
          resolution.visibleAssetIds.map(async (assetId) => {
            const blob = await builderRequest<Blob>(
              `/templates/${id}/revisions/${revisionId}/assets/${assetId}`,
              { scope, bytes: true },
            );
            scope.assertActive();
            const url = URL.createObjectURL(blob);
            urls.push(url);
            return [assetId, url] as const;
          }),
        );
        if (scope.isActive())
          setState({
            status: 'ready',
            revision,
            resolution,
            assetUrls: Object.fromEntries(entries),
            asOf,
          });
      } catch (cause) {
        if (!scope.isActive()) return;
        setState({
          status: 'error',
          error: templateError(cause),
          unavailable:
            cause instanceof BuilderApiError &&
            [404, 409].includes(cause.status),
        });
        scope.dispose();
      }
    })();
    return () => scope.dispose();
  }, [id, revisionId, attempt, lifetime]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}

export function TemplatePreview({
  ready,
  mobile = false,
}: {
  ready: Ready;
  mobile?: boolean;
}) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: mobile ? 390 : undefined,
        marginInline: 'auto',
      }}
      data-testid={mobile ? 'template-mobile-preview' : 'template-demo-preview'}
    >
      <PublicInvitationView
        scene={ready.resolution.scene}
        context={{
          mode: 'preview',
          asOf: ready.asOf,
          assetUrls: ready.assetUrls,
        }}
        hostPolicy={mobile ? 'mobile' : 'adaptive'}
      />
    </div>
  );
}

export function PreviewFeedback({
  state,
  retry,
  reload,
}: {
  state: PreviewState;
  retry: () => void;
  reload?: () => void;
}) {
  if (state.status === 'loading')
    return <LocalStatus tone="neutral">Đang tải bản xem trước…</LocalStatus>;
  if (state.status === 'error')
    return (
      <InlineAlert tone="error">
        {state.error}
        <p>
          {state.unavailable ? (
            reload ? (
              <Button variant="secondary" onClick={reload}>
                Tải lại kho mẫu
              </Button>
            ) : (
              <Link href="/templates">Tải lại kho mẫu</Link>
            )
          ) : (
            <Button variant="secondary" onClick={retry}>
              Thử lại bản xem trước
            </Button>
          )}
        </p>
      </InlineAlert>
    );
  return null;
}

export function useTemplateCreation(resource: string) {
  const lifetime = useOperationLifetime(resource);
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  async function create(id: string, revisionId: string) {
    if (inFlight.current || uncertain || unavailable) return;
    const scope = lifetime.capture();
    if (!scope.isActive()) {
      scope.dispose();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    let navigating = false;
    try {
      const invitation = await createInvitation(id, revisionId, { scope });
      if (scope.isActive()) {
        router.push(`/invitations/${invitation.id}/edit`);
        navigating = true;
      }
    } catch (cause) {
      if (!scope.isActive()) return;
      if (
        cause instanceof BuilderApiError &&
        (cause.status === 0 || cause.status >= 500)
      ) {
        setUncertain(true);
        setError(
          'Chưa xác định thiệp đã được tạo hay chưa. Hãy kiểm tra Thiệp của tôi trước khi tạo lại.',
        );
      } else {
        setError(templateError(cause));
        setUnavailable(
          cause instanceof BuilderApiError && [404, 409].includes(cause.status),
        );
      }
    } finally {
      if (scope.isActive() && !navigating) {
        inFlight.current = false;
        setBusy(false);
      }
      scope.dispose();
    }
  }
  return {
    busy,
    error,
    uncertain,
    unavailable,
    create,
    reload: () => {
      setError('');
      setUnavailable(false);
    },
  };
}

const subscribeOrigin = () => () => {};
export function DemoQr({ href }: { href: string }) {
  const origin = useSyncExternalStore(
    subscribeOrigin,
    () => window.location.origin,
    () => '',
  );
  const modules = useMemo(
    () =>
      origin
        ? QRCode.create(origin + href, { errorCorrectionLevel: 'M' }).modules
        : null,
    [origin, href],
  );
  if (!modules) return null;
  const size = modules.size;
  const path = Array.from({ length: size * size }, (_, index) =>
    modules.data[index]
      ? `M${(index % size) + 4} ${Math.floor(index / size) + 4}h1v1h-1z`
      : '',
  ).join('');
  return (
    <svg
      role="img"
      aria-label="Mã QR mở demo trên điện thoại"
      viewBox={`0 0 ${size + 8} ${size + 8}`}
      width="112"
      height="112"
      shapeRendering="crispEdges"
    >
      <rect width={size + 8} height={size + 8} fill="white" />
      <path d={path} fill="#29251f" />
    </svg>
  );
}
