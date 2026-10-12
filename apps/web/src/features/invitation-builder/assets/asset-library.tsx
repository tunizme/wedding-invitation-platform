'use client';
import {
  useOperationLifetime,
  usePrivateOwner,
  type OperationScope,
} from '../../identity-access/session/operation-scope';
import { useEffect, useRef, useState, type RefObject } from 'react';
import Image from 'next/image';
import {
  BuilderApiError,
  builderRequest,
  uploadBuilderAsset,
  type AssetSummary,
  type ListPage,
} from '../api/client';
import { useAssetPreview } from './use-asset-preview';
import { Button } from '../../../ui/platform/button';
import { Field, SelectField } from '../../../ui/platform/field';
import { InlineAlert } from '../../../ui/platform/feedback';
import { ModalSurface } from '../../../ui/platform/modal-surface';
import styles from './asset-library.module.css';

export type AssetChoice =
  'Image' | 'Decoration' | 'replace' | 'background' | 'cover';
type AssetLibraryProps = {
  choice: AssetChoice;
  /** Customer data entry may select images; Admin retains design choices. */
  expectedRole?: 'ADMIN' | 'CUSTOMER';
  onSelect: (asset: AssetSummary) => void;
  onClose: () => void;
  /** Opening trigger to restore on close (explicit: WebKit does not focus buttons). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Logical workspace to focus when the opening trigger no longer exists. */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
};
export function AssetLibrary(props: AssetLibraryProps) {
  const role = props.expectedRole ?? 'ADMIN';
  const owner = usePrivateOwner(`AssetLibrary:${props.choice}`, role);
  if (role === 'CUSTOMER' && props.choice !== 'Image') return null;
  return owner ? <OwnedAssetLibrary key={owner} {...props} /> : null;
}
function OwnedAssetLibrary({
  choice,
  onSelect,
  onClose,
  returnFocusRef,
  fallbackFocusRef,
  expectedRole = 'ADMIN',
}: AssetLibraryProps) {
  const lifetime = useOperationLifetime(choice);
  const searchRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const customer = expectedRole === 'CUSTOMER';
  const [kind, setKind] = useState(customer ? 'IMAGE' : '');
  const [mine, setMine] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadKind, setUploadKind] = useState<
    'IMAGE' | 'DECORATION' | 'BACKGROUND'
  >(
    choice === 'Decoration'
      ? 'DECORATION'
      : choice === 'background'
        ? 'BACKGROUND'
        : 'IMAGE',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urls = useAssetPreview(assets);
  const queryScopes = useRef(new Set<OperationScope>());
  function captureQuery() {
    const scope = lifetime.capture();
    queryScopes.current.add(scope);
    scope.onDispose(() => queryScopes.current.delete(scope));
    return scope;
  }
  function changeQuery() {
    for (const scope of queryScopes.current) scope.dispose();
    setAssets([]);
    setCursor(null);
    setError('');
    setBusy(false);
  }

  useEffect(() => {
    const scope = lifetime.capture();
    queryScopes.current.add(scope);
    scope.onDispose(() => queryScopes.current.delete(scope));
    const params = new URLSearchParams({ limit: '100' });
    if (query.trim()) params.set('q', query.trim());
    if (kind) params.set('kind', kind);
    if (mine) params.set('mine', 'true');
    void builderRequest<ListPage<AssetSummary>>(
      `/admin/template-assets?${params}`,
      { scope },
    )
      .then((page) => {
        if (!scope.isActive()) return;
        setAssets(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (scope.isActive())
          setError(
            cause instanceof BuilderApiError
              ? cause.message
              : 'Không thể tải thư viện ảnh.',
          );
      });
    return () => scope.dispose();
  }, [query, kind, mine, lifetime]);

  async function more() {
    const scope = captureQuery();
    if (!scope.isActive()) return;

    if (!cursor || busy) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ limit: '100', cursor });
      if (query.trim()) params.set('q', query.trim());
      if (kind) params.set('kind', kind);
      if (mine) params.set('mine', 'true');
      const page = await builderRequest<ListPage<AssetSummary>>(
        `/admin/template-assets?${params}`,
        { scope },
      );
      if (!scope.isActive()) return;
      setAssets((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((prior) => prior.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch {
      if (!scope.isActive()) return;
      setError('Không thể tải trang ảnh tiếp theo.');
    } finally {
      if (!scope.isActive()) return;
      setBusy(false);
    }
  }
  async function upload() {
    const scope = captureQuery();
    if (!scope.isActive()) return;

    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const asset = await uploadBuilderAsset(
        file,
        name.trim() || file.name,
        uploadKind,
        customer ? 'customer' : 'template',
        { scope },
      );
      if (!scope.isActive()) return;
      onSelect(asset);
    } catch (cause) {
      if (!scope.isActive()) return;
      setError(
        cause instanceof BuilderApiError
          ? cause.message
          : 'Không thể tải ảnh lên.',
      );
    } finally {
      if (!scope.isActive()) return;
      setBusy(false);
    }
  }

  return (
    <ModalSurface
      label="Thư viện ảnh"
      closeLabel="Đóng thư viện"
      onClose={onClose}
      initialFocusRef={searchRef}
      returnFocusRef={returnFocusRef}
      fallbackFocusRef={fallbackFocusRef}
    >
      <fieldset disabled={busy} className={styles.group}>
        <legend>Tải ảnh lên</legend>
        <Field
          id="asset-upload-name"
          label="Tên ảnh tải lên"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        <SelectField
          id="asset-upload-kind"
          label="Loại ảnh tải lên"
          value={uploadKind}
          onChange={(event) =>
            setUploadKind(event.target.value as typeof uploadKind)
          }
        >
          <option value="IMAGE">Hình ảnh</option>
          {!customer && <option value="DECORATION">Trang trí</option>}
          {!customer && <option value="BACKGROUND">Nền</option>}
        </SelectField>
        <Field
          id="asset-upload-file"
          label="File ảnh tải lên"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button
          variant="primary"
          disabled={!file}
          busy={busy}
          onClick={() => void upload()}
        >
          {busy ? 'Đang tải…' : 'Tải ảnh lên và chọn'}
        </Button>
      </fieldset>
      <fieldset disabled={busy} className={styles.group}>
        <legend>Tìm ảnh có sẵn</legend>
        <Field
          ref={searchRef}
          id="asset-search"
          label="Tìm ảnh"
          value={query}
          onChange={(event) => {
            changeQuery();
            setQuery(event.target.value);
          }}
        />
        <SelectField
          id="asset-kind-filter"
          label="Lọc loại ảnh"
          value={kind}
          onChange={(event) => {
            changeQuery();
            setKind(event.target.value);
          }}
        >
          {!customer && <option value="">Tất cả</option>}
          <option value="IMAGE">Hình ảnh</option>
          {!customer && <option value="DECORATION">Trang trí</option>}
          {!customer && <option value="BACKGROUND">Nền</option>}
        </SelectField>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => {
              changeQuery();
              setMine(event.target.checked);
            }}
          />{' '}
          Chỉ ảnh tôi tải lên
        </label>
      </fieldset>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <div className={styles.results}>
        {assets.map((asset) => (
          <Button
            key={asset.id}
            variant="secondary"
            className={styles.choice}
            onClick={() => {
              if (lifetime.isActive()) onSelect(asset);
            }}
            aria-label={`Chọn ${asset.name}`}
          >
            {urls[asset.id] && (
              <Image
                src={urls[asset.id]}
                alt=""
                width={64}
                height={64}
                unoptimized
              />
            )}
            {asset.name} · {asset.width}×{asset.height}
          </Button>
        ))}
      </div>
      {cursor && (
        <Button variant="secondary" disabled={busy} onClick={() => void more()}>
          Tải thêm ảnh
        </Button>
      )}
      {assets.length === 0 && <p>Chưa có ảnh trong thư viện.</p>}
    </ModalSurface>
  );
}
