'use client';
import { ManagedAssetsContext } from './managed-assets-context';
import { useContext, useEffect, useState } from 'react';
import {
  Check,
  CloudUpload,
  Pause,
  Play,
  Scissors,
  Trash2,
} from 'lucide-react';
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
import { AssetDeleteDialog } from './asset-delete-dialog';
import { AudioTrimDialog } from './audio-trim-dialog';
import type { AudioTrimSelection } from './audio-trim';
import type { EditorSettings } from '../document/editor-document';

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
  onAssets,
  selectionLimit = 50,
  onPreset,
  onTemplate,
  expectedRole = 'ADMIN',
  multiple = false,
  usage,
  onDelete,
  audioSettings,
  onTrimAudio,
}: {
  kind: 'IMAGE' | 'DECORATION' | 'BACKGROUND' | 'AUDIO' | 'PRESET' | 'TEMPLATE';
  onAsset: (asset: AssetSummary) => void;
  onAssets?: (assets: AssetSummary[]) => void;
  selectionLimit?: number;
  onPreset?: (preset: Preset) => void;
  onTemplate?: (template: TemplateDetail) => void;
  expectedRole?: 'ADMIN' | 'CUSTOMER';
  multiple?: boolean;
  /** Number of document elements using an asset. */
  usage?: (assetId: string) => number;
  /** Saves local edits, deletes globally and reconciles the active editor. */
  onDelete?: (assetId: string) => Promise<void>;
  audioSettings?: EditorSettings['audio'];
  onTrimAudio?: (asset: AssetSummary, selection: AudioTrimSelection) => void;
}) {
  const invitationId = useContext(ManagedAssetsContext);
  const lifetime = useOperationLifetime(`AssetLibrary:${kind}`),
    [assets, setAssets] = useState<AssetSummary[]>([]),
    [presets, setPresets] = useState<Preset[]>([]),
    [templates, setTemplates] = useState<TemplateSummary[]>([]),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [statuses, setStatuses] = useState<{ name: string; status: string }[]>([]),
    [deleting, setDeleting] = useState<{
      asset: AssetSummary;
      usage: number;
      busy: boolean;
      error: string;
    } | null>(null);
  const [picked, setPicked] = useState<AssetSummary[]>([]);
  const toggleAsset = (asset: AssetSummary) => {
    if (!onAssets) {
      onAsset(asset);
      return;
    }
    if (picked.some((a) => a.id === asset.id)) {
      setPicked((items) => items.filter((a) => a.id !== asset.id));
    } else if (picked.length < selectionLimit) {
      setPicked((items) => [...items, asset]);
      setError('');
    } else setError(`Chỉ có thể thêm tối đa ${selectionLimit} ảnh nữa.`);
  };
  const urls = useAssetPreview(assets.filter((a) => a.kind !== 'AUDIO'));
  const [trimming, setTrimming] = useState<AssetSummary | null>(null);
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
            ? invitationId
              ? `/admin/invitations/${invitationId}/assets`
              : '/admin/template-assets'
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
  }, [kind, query, category, expectedRole, invitationId, lifetime]);
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
                ? invitationId
                  ? `/admin/invitations/${invitationId}/assets`
                  : '/admin/template-assets'
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
            { scope, invitationId },
          );
          if (!scope.isActive()) return;
          setAssets((a) => [asset, ...a]);
          setStatuses((s) =>
            s.map((v, j) => (j === i ? { ...v, status: 'Đã tải' } : v)),
          );
          if (onAssets)
            setPicked((items) =>
              items.some((a) => a.id === asset.id) ||
              items.length >= selectionLimit
                ? items
                : [...items, asset],
            );
          else if (multiple) onAsset(asset);
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
  async function deleteAsset(a: AssetSummary): Promise<string> {
    const scope = lifetime.capture();
    try {
      if (onDelete) await onDelete(a.id);
      else await builderRequest(`/assets/${a.id}`, { scope, method: 'DELETE' });
      if (scope.isActive()) {
        setAssets((list) => list.filter((v) => v.id !== a.id));
        setPicked((list) => list.filter((v) => v.id !== a.id));
      }
      return '';
    } catch (c) {
      return c instanceof Error ? c.message : 'Không xóa được';
    } finally {
      scope.dispose();
    }
  }
  async function removeAsset(a: AssetSummary) {
    // Audio keeps the plain confirmation; images get the usage-aware dialog.
    if (a.kind === 'AUDIO') {
      if (!window.confirm('Xóa tài nguyên này?')) return;
      const message = await deleteAsset(a);
      if (message) setError(message);
      return;
    }
    setDeleting({
      asset: a,
      usage: usage?.(a.id) ?? 0,
      busy: false,
      error: '',
    });
  }
  async function confirmDelete() {
    if (!deleting || deleting.busy) return;
    const { asset } = deleting;
    setDeleting({ ...deleting, busy: true, error: '' });
    const message = await deleteAsset(asset);
    if (!lifetime.isActive()) return;
    if (message) setDeleting({ ...deleting, busy: false, error: message });
    else setDeleting(null);
  }
  return (
    <section aria-label="Thư viện nội bộ">
      {onAssets && (
        <div className={styles.batchSelection}>
          <span role="status">
            Đã chọn {picked.length} ảnh · còn{' '}
            {Math.max(0, selectionLimit - picked.length)} chỗ
          </span>
          <button
            type="button"
            disabled={!picked.length || busy}
            onClick={() => onAssets(picked)}
          >
            Thêm {picked.length} ảnh đã chọn
          </button>
          {picked.length > 0 && (
            <button type="button" disabled={busy} onClick={() => setPicked([])}>
              Bỏ chọn tất cả
            </button>
          )}
        </div>
      )}
      {trimming && onTrimAudio && (
        <AudioTrimDialog
          key={trimming.id}
          asset={trimming}
          startMs={
            audioSettings?.assetId === trimming.id
              ? audioSettings.trimStartMs
              : undefined
          }
          endMs={
            audioSettings?.assetId === trimming.id
              ? audioSettings.trimEndMs
              : undefined
          }
          onCancel={() => setTrimming(null)}
          onConfirm={(selection) => {
            onTrimAudio(trimming, selection);
            setTrimming(null);
          }}
        />
      )}
      {deleting && (
        <AssetDeleteDialog
          usage={deleting.usage}
          busy={deleting.busy}
          error={deleting.error}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
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
            <li
              key={a.id}
              className={styles.audioRow}
              data-selected={audioSettings?.assetId === a.id}
            >
              <AudioPreview key={trimming ? 'trimming' : 'preview'} asset={a} />
              <button
                type="button"
                className={styles.audioPick}
                aria-label={a.name}
                title={a.name}
                onClick={() => onAsset(a)}
              >
                <span className={styles.audioName}>
                  {a.name}
                  {audioSettings?.assetId === a.id && (
                    <span className={styles.audioSelected}>Đang dùng</span>
                  )}
                </span>
                <span className={styles.audioTime}>
                  {a.durationMs
                    ? `${Math.floor(a.durationMs / 60000)}:${String(
                        Math.floor((a.durationMs % 60000) / 1000),
                      ).padStart(2, '0')}`
                    : ''}
                </span>
              </button>
              {onTrimAudio && (
                <button
                  type="button"
                  className={styles.audioTrim}
                  aria-label={`Cắt ${a.name}`}
                  title="Cắt nhạc"
                  disabled={busy}
                  onClick={() => setTrimming(a)}
                >
                  <Scissors size={16} aria-hidden="true" />
                  <span>Cắt</span>
                </button>
              )}
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
                aria-pressed={
                  onAssets ? picked.some((item) => item.id === a.id) : undefined
                }
                onClick={() => toggleAsset(a)}
              >
                {onAssets && picked.some((item) => item.id === a.id) && (
                  <span className={styles.selectionMark}>
                    <Check size={16} aria-hidden="true" />
                  </span>
                )}
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
                <Trash2 size={20} strokeWidth={2} aria-hidden="true" />
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
