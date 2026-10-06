'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  BuilderApiError,
  builderRequest,
  uploadBuilderAsset,
  type AssetSummary,
  type ListPage,
} from '../api/client';
import { useAssetPreview } from './use-asset-preview';

export type AssetChoice =
  'Image' | 'Decoration' | 'replace' | 'background' | 'cover';
export function AssetLibrary({
  choice,
  onSelect,
  onClose,
}: {
  choice: AssetChoice;
  onSelect: (asset: AssetSummary) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
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

  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ limit: '100' });
    if (query.trim()) params.set('q', query.trim());
    if (kind) params.set('kind', kind);
    if (mine) params.set('mine', 'true');
    void builderRequest<ListPage<AssetSummary>>(
      `/admin/template-assets?${params}`,
      { signal: abort.signal },
    )
      .then((page) => {
        setAssets(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof BuilderApiError
              ? cause.message
              : 'Không thể tải thư viện ảnh.',
          );
      });
    return () => abort.abort();
  }, [query, kind, mine]);

  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ limit: '100', cursor });
      if (query.trim()) params.set('q', query.trim());
      if (kind) params.set('kind', kind);
      if (mine) params.set('mine', 'true');
      const page = await builderRequest<ListPage<AssetSummary>>(
        `/admin/template-assets?${params}`,
      );
      setAssets((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((prior) => prior.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch {
      setError('Không thể tải trang ảnh tiếp theo.');
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const asset = await uploadBuilderAsset(
        file,
        name.trim() || file.name,
        uploadKind,
      );
      onSelect(asset);
    } catch (cause) {
      setError(
        cause instanceof BuilderApiError
          ? cause.message
          : 'Không thể tải ảnh lên.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      role="dialog"
      aria-label="Thư viện tài sản"
      style={{
        position: 'fixed',
        inset: '8%',
        background: 'white',
        padding: 24,
        overflow: 'auto',
        zIndex: 100,
      }}
    >
      <h2>Thư viện ảnh</h2>
      <button type="button" onClick={onClose}>
        Đóng thư viện
      </button>
      <fieldset disabled={busy}>
        <legend>Tải ảnh lên</legend>
        <label>
          Tên ảnh
          <input
            aria-label="Tên ảnh tải lên"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Loại ảnh
          <select
            aria-label="Loại ảnh tải lên"
            value={uploadKind}
            onChange={(event) =>
              setUploadKind(event.target.value as typeof uploadKind)
            }
          >
            <option value="IMAGE">Hình ảnh</option>
            <option value="DECORATION">Trang trí</option>
            <option value="BACKGROUND">Nền</option>
          </select>
        </label>
        <label>
          Chọn file
          <input
            aria-label="File ảnh tải lên"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="button" disabled={!file} onClick={() => void upload()}>
          {busy ? 'Đang tải…' : 'Tải ảnh lên và chọn'}
        </button>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Tìm ảnh có sẵn</legend>
        <label>
          Tìm theo tên
          <input
            aria-label="Tìm ảnh"
            value={query}
            onChange={(event) => {
              setCursor(null);
              setQuery(event.target.value);
            }}
          />
        </label>
        <label>
          Lọc loại
          <select
            aria-label="Lọc loại ảnh"
            value={kind}
            onChange={(event) => {
              setCursor(null);
              setKind(event.target.value);
            }}
          >
            <option value="">Tất cả</option>
            <option value="IMAGE">Hình ảnh</option>
            <option value="DECORATION">Trang trí</option>
            <option value="BACKGROUND">Nền</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => {
              setCursor(null);
              setMine(event.target.checked);
            }}
          />{' '}
          Chỉ ảnh tôi tải lên
        </label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {assets.map((asset) => (
        <button
          type="button"
          key={asset.id}
          onClick={() => onSelect(asset)}
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
        </button>
      ))}
      {cursor && (
        <button type="button" disabled={busy} onClick={() => void more()}>
          Tải thêm ảnh
        </button>
      )}
      {assets.length === 0 && <p>Chưa có ảnh trong thư viện.</p>}
    </section>
  );
}
