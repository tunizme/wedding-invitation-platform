'use client';
import { useEffect, useState } from 'react';
import { CloudUpload, Pause, Play, Trash2 } from 'lucide-react';
import {
  builderRequest,
  uploadBuilderAsset,
  type AssetSummary,
  type ListPage,
  type TemplateSummary,
  type TemplateDetail,
} from '../api/client';
import { useOperationLifetime } from '../../identity-access/session/operation-scope';
import { useAssetPreview } from '../assets/use-asset-preview';
import { AssetImage } from '../renderer/asset-image';
import type { EditorDocument } from '../document/editor-document';
import styles from './invitation-editor.module.css';
import { categoriesFor } from './library-taxonomy';

export type Preset = {
  id: string;
  name: string;
  category: string;
  editVersion: number;
  document: EditorDocument;
};
export function AssetLibrary({
  kind,
  onAsset,
  onPreset,
  onTemplate,
  expectedRole = 'ADMIN',
  multiple = false,
}: {
  kind: 'IMAGE' | 'DECORATION' | 'BACKGROUND' | 'AUDIO' | 'PRESET' | 'TEMPLATE';
  onAsset: (asset: AssetSummary) => void;
  onPreset?: (preset: Preset) => void;
  onTemplate?: (template: TemplateDetail) => void;
  expectedRole?: 'ADMIN' | 'CUSTOMER';
  multiple?: boolean;
}) {
  const lifetime = useOperationLifetime(`AssetLibrary:${kind}`),
    [assets, setAssets] = useState<AssetSummary[]>([]),
    [presets, setPresets] = useState<Preset[]>([]),
    [templates, setTemplates] = useState<TemplateSummary[]>([]),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [statuses, setStatuses] = useState<{ name: string; status: string }[]>([]);
  const urls = useAssetPreview(assets.filter((a) => a.kind !== 'AUDIO'));
  const [coverState, setCoverState] = useState<{
    templates: TemplateSummary[];
    urls: Record<string, string>;
  }>({ templates: [], urls: {} });
  const coverUrls = coverState.templates === templates ? coverState.urls : {};
  useEffect(() => {
    const scope = lifetime.capture();
    const created: string[] = [];
    scope.onDispose(() => created.forEach((url) => URL.revokeObjectURL(url)));
    void Promise.all(
      templates.map(async (template) => {
        if (template.coverUrl !== `/api/v1/templates/${template.id}/cover`)
          return null;
        try {
          const blob = await builderRequest<Blob>(
            `/templates/${template.id}/cover`,
            { scope, bytes: true },
          );
          scope.assertActive();
          const url = URL.createObjectURL(blob);
          created.push(url);
          return [template.id, url] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (scope.isActive())
        setCoverState({
          templates,
          urls: Object.fromEntries(entries.filter((entry) => entry !== null)),
        });
    });
    return () => scope.dispose();
  }, [templates, lifetime]);
  useEffect(() => {
    const scope = lifetime.capture();
    const params = new URLSearchParams({ limit: '24' });
    if (query.trim()) params.set('q', query.trim());
    const path =
      kind === 'PRESET'
        ? '/admin/editor-presets'
        : kind === 'TEMPLATE'
          ? '/admin/templates'
          : expectedRole === 'ADMIN'
            ? '/admin/template-assets'
            : '/assets';
    if (!['PRESET', 'TEMPLATE'].includes(kind)) params.set('kind', kind);
    if (category && expectedRole === 'ADMIN' && kind !== 'TEMPLATE')
      params.set('category', category);
    void builderRequest<ListPage<AssetSummary | Preset | TemplateSummary>>(
      `${path}?${params}`,
      { scope },
    )
      .then((page) => {
        if (!scope.isActive()) return;
        setCursor(page.nextCursor);
        setAssets(
          kind === 'PRESET' || kind === 'TEMPLATE'
            ? []
            : (page.items as AssetSummary[]),
        );
        setPresets(kind === 'PRESET' ? (page.items as Preset[]) : []);
        setTemplates(
          kind === 'TEMPLATE' ? (page.items as TemplateSummary[]) : [],
        );
        setError('');
      })
      .catch((c) => {
        if (scope.isActive())
          setError(c instanceof Error ? c.message : 'Không tải được thư viện');
      });
    return () => scope.dispose();
  }, [kind, query, category, expectedRole, lifetime]);
  async function more() {
    if (!cursor || busy) return;
    const scope = lifetime.capture();
    setBusy(true);
    try {
      const path =
          kind === 'PRESET'
            ? '/admin/editor-presets'
            : kind === 'TEMPLATE'
              ? '/admin/templates'
              : expectedRole === 'ADMIN'
                ? '/admin/template-assets'
                : '/assets',
        params = new URLSearchParams({ limit: '24', cursor });
      if (query.trim()) params.set('q', query.trim());
      if (!['PRESET', 'TEMPLATE'].includes(kind)) params.set('kind', kind);
      if (category && expectedRole === 'ADMIN' && kind !== 'TEMPLATE')
        params.set('category', category);
      const page = await builderRequest<
        ListPage<AssetSummary | Preset | TemplateSummary>
      >(`${path}?${params}`, { scope });
      if (!scope.isActive()) return;
      setCursor(page.nextCursor);
      if (kind === 'PRESET')
        setPresets((a) => [...a, ...(page.items as Preset[])]);
      else if (kind === 'TEMPLATE')
        setTemplates((a) => [...a, ...(page.items as TemplateSummary[])]);
      else setAssets((a) => [...a, ...(page.items as AssetSummary[])]);
    } catch (c) {
      if (scope.isActive())
        setError(c instanceof Error ? c.message : 'Không tải được thư viện');
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function upload(files: File[]) {
    if (busy) return;
    if (files.length > 15) {
      setError('Chọn tối đa 15 tệp mỗi lần');
      return;
    }
    const scope = lifetime.capture();
    setBusy(true);
    setStatuses(files.map((f) => ({ name: f.name, status: 'Chờ tải' })));
    try {
      for (let i = 0; i < files.length; i++) {
        if (!scope.isActive()) return;
        setStatuses((s) =>
          s.map((v, j) => (j === i ? { ...v, status: 'Đang tải' } : v)),
        );
        try {
          const asset = await uploadBuilderAsset(
            files[i],
            files[i].name.slice(0, 120),
            kind as 'IMAGE' | 'DECORATION' | 'BACKGROUND' | 'AUDIO',
            expectedRole === 'ADMIN' ? 'template' : 'customer',
            { scope },
          );
          if (!scope.isActive()) return;
          setAssets((a) => [asset, ...a]);
          setStatuses((s) =>
            s.map((v, j) => (j === i ? { ...v, status: 'Đã tải' } : v)),
          );
          if (multiple) onAsset(asset);
        } catch (c) {
          if (scope.isActive())
            setStatuses((s) =>
              s.map((v, j) =>
                j === i
                  ? { ...v, status: c instanceof Error ? c.message : 'Tải lỗi' }
                  : v,
              ),
            );
        }
      }
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function removeAsset(a: AssetSummary) {
    if (!window.confirm('Xóa tài nguyên này?')) return;
    const scope = lifetime.capture();
    try {
      await builderRequest(`/assets/${a.id}`, { scope, method: 'DELETE' });
      if (scope.isActive())
        setAssets((list) => list.filter((v) => v.id !== a.id));
    } catch (c) {
      if (scope.isActive())
        setError(c instanceof Error ? c.message : 'Không xóa được');
    } finally {
      scope.dispose();
    }
  }
  return (
    <section aria-label="Thư viện nội bộ">
      <label className={styles.searchBox}>
        <span className={styles.srOnly}>Tìm kiếm</span>
        <input
          type="search"
          placeholder="Tìm kiếm"
          value={query}
          maxLength={120}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {(expectedRole === 'ADMIN' || kind === 'PRESET') &&
        categoriesFor(kind).length > 0 && (
          <div
            className={styles.categoryChips}
            role="group"
            aria-label="Danh mục"
          >
            {[{ slug: '', label: 'Tất cả' }, ...categoriesFor(kind)].map(
              (item) => (
                <button
                  key={item.slug || 'all'}
                  type="button"
                  aria-pressed={category === item.slug}
                  onClick={() => setCategory(item.slug)}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
        )}
      {!['PRESET', 'TEMPLATE'].includes(kind) && (
        <label
          className={styles.upload}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy) void upload([...e.dataTransfer.files]);
          }}
        >
          <CloudUpload size={32} aria-hidden="true" />
          {kind === 'AUDIO'
            ? 'Tải MP3 · tối đa20MiB/10phút'
            : 'Kéo thả hoặc nhấn để tải ảnh · tối đa 15 ảnh/lần'}
          <input
            type="file"
            multiple={kind !== 'AUDIO'}
            disabled={busy}
            accept={
              kind === 'AUDIO'
                ? 'audio/mpeg'
                : 'image/jpeg,image/png,image/webp'
            }
            onChange={(e) => {
              void upload([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </label>
      )}
      {statuses.length > 0 && (
        <>
          <progress
            aria-label="Tiến độ tải tệp"
            max={statuses.length}
            value={
              statuses.filter(
                (s) => !['Chờ tải', 'Đang tải'].includes(s.status),
              ).length
            }
          />
          <ul aria-live="polite">
            {statuses.map((s, i) => (
              <li key={i}>
                {s.name}: {s.status}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {!busy &&
        !error &&
        assets.length === 0 &&
        presets.length === 0 &&
        templates.length === 0 && (
          <p className={styles.emptyLibrary}>
            {kind === 'TEMPLATE'
              ? 'Chưa có mẫu nào'
              : kind === 'PRESET'
                ? 'Chưa có preset nào'
                : kind === 'AUDIO'
                  ? 'Chưa có âm nhạc'
                  : 'Chưa có ảnh nào'}
          </p>
        )}
      {kind === 'AUDIO' ? (
        <ul className={styles.audioList}>
          {assets.map((a) => (
            <li key={a.id} className={styles.audioRow}>
              <AudioPreview asset={a} />
              <button
                type="button"
                className={styles.audioPick}
                title={a.name}
                onClick={() => onAsset(a)}
              >
                <span className={styles.audioName}>{a.name}</span>
                <span className={styles.audioTime}>
                  {a.durationMs
                    ? `${Math.floor(a.durationMs / 60000)}:${String(
                        Math.floor((a.durationMs % 60000) / 1000),
                      ).padStart(2, '0')}`
                    : ''}
                </span>
              </button>
              <button
                type="button"
                className={styles.rowDelete}
                aria-label={`Xóa ${a.name}`}
                title="Xóa"
                disabled={busy}
                onClick={() => void removeAsset(a)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.stockGrid}>
          {assets.map((a) => (
            <div key={a.id} className={styles.stockTile}>
              <button
                type="button"
                className={styles.stockPick}
                aria-label={a.name}
                title={a.name}
                onClick={() => onAsset(a)}
              >
                <AssetImage
                  source={urls[a.id]}
                  alt={a.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              </button>
              <button
                type="button"
                className={styles.tileDelete}
                aria-label={`Xóa ${a.name}`}
                title="Xóa"
                disabled={busy}
                onClick={() => void removeAsset(a)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {presets
        .filter((p) => !category || p.category === category)
        .map((p) => (
          <article key={p.id}>
            <button type="button" onClick={() => onPreset?.(p)}>
              {p.name} · {p.category}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm('Xóa preset này khỏi thư viện?')) return;
                const scope = lifetime.capture();
                try {
                  await builderRequest(`/admin/editor-presets/${p.id}`, {
                    scope,
                    method: 'DELETE',
                    body: { expectedVersion: p.editVersion },
                  });
                  if (scope.isActive())
                    setPresets((a) => a.filter((v) => v.id !== p.id));
                } catch (c) {
                  if (scope.isActive())
                    setError(c instanceof Error ? c.message : 'Không xóa được');
                } finally {
                  scope.dispose();
                }
              }}
            >
              Xóa
            </button>
          </article>
        ))}
      {templates.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={async () => {
            const scope = lifetime.capture();
            try {
              const value = await builderRequest<TemplateDetail>(
                `/admin/templates/${t.id}`,
                { scope },
              );
              if (scope.isActive()) onTemplate?.(value);
            } catch (c) {
              if (scope.isActive())
                setError(c instanceof Error ? c.message : 'Không mở được mẫu');
            } finally {
              scope.dispose();
            }
          }}
        >
          {t.coverUrl && (
            <AssetImage
              source={coverUrls[t.id]}
              alt=""
              style={{
                width: '100%',
                height: 160,
                objectFit: 'cover',
                objectPosition: 'top',
              }}
            />
          )}
          <span>
            {t.name} ·{' '}
            {
              {
                DRAFT: 'Bản nháp',
                PUBLISHED: 'Đã xuất bản',
                UNPUBLISHED: 'Đã gỡ xuất bản',
              }[t.status]
            }
          </span>
        </button>
      ))}
      {cursor && (
        <button type="button" disabled={busy} onClick={() => void more()}>
          Xem thêm
        </button>
      )}
      {!assets.length && !presets.length && !templates.length && !error && (
        <p>Chưa có tài nguyên phù hợp. Tải lên hoặc lưu preset để bắt đầu.</p>
      )}
    </section>
  );
}
function AudioPreview({ asset }: { asset: AssetSummary }) {
  const [play, setPlay] = useState(false),
    urls = useAssetPreview(play ? [asset] : []);
  return (
    <>
      <button
        type="button"
        className={styles.audioPlay}
        aria-label={play ? `Dừng ${asset.name}` : `Nghe thử ${asset.name}`}
        aria-pressed={play}
        title={play ? 'Dừng' : 'Nghe thử'}
        onClick={() => setPlay((value) => !value)}
      >
        {play ? (
          <Pause size={16} aria-hidden="true" />
        ) : (
          <Play size={16} aria-hidden="true" />
        )}
      </button>
      {play && urls[asset.id] && (
        <audio
          autoPlay
          src={urls[asset.id]}
          preload="none"
          onEnded={() => setPlay(false)}
        />
      )}
    </>
  );
}
