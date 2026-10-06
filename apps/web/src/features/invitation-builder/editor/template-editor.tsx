'use client';
import {
  Editor,
  Frame,
  useEditor,
  useNode,
  DefaultEventHandlers,
} from '@craftjs/core';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type {
  Canvas,
  ComponentName,
  ElementProps,
  TemplateDesign,
  ResolvedScene,
} from '../document/types';
import {
  builderRequest,
  BuilderApiError,
  type TemplateDetail,
  type AssetSummary,
} from '../api/client';
import { AssetLibrary, type AssetChoice } from '../assets/asset-library';
import { importDesign, exportDesign } from './craft-adapter';
import { canonicalJson } from '../document/validation-helpers';
import { applyCommand, type EditorCommand } from './commands';
import { primitiveNode } from './defaults';
import { widgetNode } from './defaults';
import { SampleDataPanel, sampleWeddingData } from './sample-data-panel';
import { resolveDesign } from '../document/resolve-design';
import { RenderElement } from '../renderer/invitation-renderer';
import { ScenePreview } from '../renderer/scene-preview';
import { InvitationCanvasDisplay } from '../renderer/canvas';
import { elementFrameStyle } from '../renderer/primitives';
import { PropertiesPanel } from './properties-panel';
import { LayersPanel } from './layers-panel';
import { GeometryControls } from './geometry-controls';
import type { TemplateLifecycle } from '../api/operations';
import { PublicationControls } from './publication-controls';
import { useDirtyNavigationGuard } from '../../identity-access/session/navigation-guard';
import '../renderer/fonts.css';

const EditorPreview = createContext(false);
const EditorScene = createContext<ResolvedScene | null>(null);
const Assets = createContext<Record<string, string>>({});
function InvitationCanvas({
  canvas,
  children,
}: {
  canvas: Canvas;
  children?: ReactNode;
}) {
  return (
    <InvitationCanvasDisplay
      canvas={canvas}
      assets={useContext(Assets)}
      testId={useContext(EditorPreview) ? null : 'workarea'}
    >
      {children}
    </InvitationCanvasDisplay>
  );
}
function ElementView({
  kind,
  props,
}: {
  kind: ComponentName;
  props: ElementProps;
}) {
  const {
    id,
    connectors: { connect },
  } = useNode();
  const { actions } = useEditor();
  const assets = useContext(Assets);
  const scene = useContext(EditorScene);
  const resolved = scene?.elements.find((element) => element.id === id);
  return (
    <div
      ref={(element) => {
        if (element) connect(element);
      }}
      data-element-id={id}
      onPointerDown={(event) => {
        event.stopPropagation();
        actions.selectNode(id);
      }}
      style={{
        ...elementFrameStyle(
          props.box,
          props.appearance,
          assets,
          kind,
          props.content,
        ),
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {resolved ? (
        <RenderElement
          element={resolved}
          context={{
            mode: 'editor',
            asOf: '2026-01-01T00:00:00Z',
            assetUrls: assets,
          }}
          contentOnly
        />
      ) : (
        <span aria-label="Dữ liệu chưa đủ">
          {kind}: cần dữ liệu để hiển thị
        </span>
      )}
    </div>
  );
}
function Text(props: ElementProps) {
  return <ElementView kind="Text" props={props} />;
}
function Image(props: ElementProps) {
  return <ElementView kind="Image" props={props} />;
}
function Decoration(props: ElementProps) {
  return <ElementView kind="Decoration" props={props} />;
}
function Shape(props: ElementProps) {
  return <ElementView kind="Shape" props={props} />;
}
function Calendar(props: ElementProps) {
  return <ElementView kind="Calendar" props={props} />;
}
function Countdown(props: ElementProps) {
  return <ElementView kind="Countdown" props={props} />;
}
function Map(props: ElementProps) {
  return <ElementView kind="Map" props={props} />;
}
function RSVP(props: ElementProps) {
  return <ElementView kind="RSVP" props={props} />;
}
function QRBank(props: ElementProps) {
  return <ElementView kind="QRBank" props={props} />;
}
function Timeline(props: ElementProps) {
  return <ElementView kind="Timeline" props={props} />;
}
const resolver = {
  InvitationCanvas,
  Text,
  Image,
  Decoration,
  Shape,
  Calendar,
  Countdown,
  Map,
  RSVP,
  QRBank,
  Timeline,
};

function collectAssets(document: TemplateDesign): string[] {
  const ids = new Set<string>();
  const background = document.nodes.ROOT.props.canvas.background;
  if (background.kind === 'asset') ids.add(background.assetId);
  for (const id of document.nodes.ROOT.nodes) {
    const node = document.nodes[id];
    if (node.isCanvas) continue;
    if ('assetId' in node.props.content && node.props.content.assetId)
      ids.add(node.props.content.assetId);
    for (const binding of node.props.bindings)
      if (binding.target === 'assetId' && binding.fallback)
        ids.add(binding.fallback);
    if (node.props.appearance.background?.kind === 'asset')
      ids.add(node.props.appearance.background.assetId);
  }
  return [...ids].sort();
}

function Workarea({
  initial,
  onSaved,
}: {
  initial: TemplateDetail;
  onSaved: (value: TemplateDetail) => void;
}) {
  const { actions, serialized, selected, canUndo, canRedo } = useEditor(
    (state, query) => ({
      serialized: query.serialize(),
      selected: [...state.events.selected][0],
      canUndo: query.history.canUndo(),
      canRedo: query.history.canRedo(),
    }),
  );
  const document = useMemo(
    () =>
      serialized === '{}'
        ? initial.draftDocument
        : exportDesign(JSON.parse(serialized)),
    [serialized, initial.draftDocument],
  );
  const [saved, setSaved] = useState(initial),
    [busy, setBusy] = useState(false),
    [gestureActive, setGestureActive] = useState(false),
    [saving, setSaving] = useState(false),
    [publicationBusy, setPublicationBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [zoom, setZoom] = useState(1),
    [preview, setPreview] = useState(false),
    [selectedSample, setSelectedSample] = useState<'A' | 'B'>('A'),
    [previewWidth, setPreviewWidth] = useState(390);
  const [sampleData, setSampleData] = useState(() =>
    Object.keys(initial.draftSampleData).length > 1
      ? initial.draftSampleData
      : sampleWeddingData('A'),
  );
  const [publicationSample, setPublicationSample] = useState(
    initial.draftSampleData,
  );
  const sampleSets = useRef<
    Partial<Record<'A' | 'B', import('../document/types').WeddingData>>
  >({});
  const [sampleCursor, setSampleCursor] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const sampleLoadingRef = useRef(false);
  const [sampleAssets, setSampleAssets] = useState<AssetSummary[]>([]);
  const sampleDirty =
    canonicalJson(publicationSample) !== canonicalJson(saved.draftSampleData);
  useEffect(() => {
    void builderRequest<{ items: AssetSummary[]; nextCursor: string | null }>(
      '/admin/template-assets?limit=100',
    )
      .then((page) => {
        setSampleAssets(page.items);
        setSampleCursor(page.nextCursor);
      })
      .catch(() => setError('Không thể tải ảnh mẫu.'));
  }, []);
  const [choice, setChoice] = useState<AssetChoice | null>(null);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [metadata, setMetadata] = useState({
    name: initial.name,
    category: initial.category,
    tags: initial.tags.join(', '),
    sortOrder: initial.sortOrder,
    coverAssetId: initial.coverAssetId,
  });
  const metadataDirty =
    metadata.name !== saved.name ||
    metadata.category !== saved.category ||
    metadata.tags !== saved.tags.join(', ') ||
    metadata.sortOrder !== saved.sortOrder ||
    metadata.coverAssetId !== saved.coverAssetId;
  const designDirty =
    canonicalJson(document) !== canonicalJson(saved.draftDocument);
  const [root, setRoot] = useState<HTMLDivElement | null>(null),
    [target, setTarget] = useState<HTMLElement | null>(null);
  const gestureBusy = useRef(false);
  const dirty =
      canonicalJson(document) !== canonicalJson(saved.draftDocument) ||
      metadataDirty ||
      sampleDirty,
    node = selected ? document.nodes[selected] : undefined;
  const assetKey = [
    ...new Set([
      ...collectAssets(document),
      ...[
        sampleData.bride?.photo,
        sampleData.groom?.photo,
        sampleData.couple?.photo,
      ].filter((id): id is string => Boolean(id)),
    ]),
  ]
    .sort()
    .join(',');
  const localPreview = useMemo(
    () =>
      resolveDesign(document, sampleData, {
        mode: 'preview',
        asOf: '2026-01-01T00:00:00Z',
      }),
    [document, sampleData],
  );
  useEffect(() => {
    const abort = new AbortController(),
      urls: string[] = [];
    let active = true;
    void Promise.all(
      assetKey
        ? assetKey.split(',').map(async (id) => {
            const blob = await builderRequest<Blob>(`/assets/${id}/content`, {
              bytes: true,
              signal: abort.signal,
            });
            if (!active) return [id, ''] as const;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            return [id, url] as const;
          })
        : [],
    )
      .then((entries) => {
        if (active) setAssets(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) setError('Không thể tải một số ảnh. Vui lòng thử lại.');
      });
    return () => {
      active = false;
      abort.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [assetKey]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setTarget(
        selected && root && !node?.hidden
          ? root.querySelector<HTMLElement>(`[data-element-id="${selected}"]`)
          : null,
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [selected, root, node?.hidden, serialized]);
  const dirtyRef = useRef(dirty);
  useLayoutEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useDirtyNavigationGuard(dirty);
  const execute = (command: EditorCommand) => {
    if (gestureBusy.current || busy || saving || publicationBusy) return;
    const result = applyCommand(document, command);
    if (command.type === 'box')
      actions.setProp(command.id, (props: ElementProps) => {
        props.box = (
          result.document.nodes[command.id] as { props: ElementProps }
        ).props.box;
      });
    else actions.deserialize(importDesign(result.document));
    actions.selectNode(result.selectedId);
    setStatus('Chưa lưu');
  };
  const safeExecute = (command: EditorCommand) => {
    try {
      execute(command);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Thuộc tính không hợp lệ.',
      );
    }
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        busy ||
        saving ||
        publicationBusy ||
        gestureBusy.current ||
        preview ||
        (event.target instanceof HTMLElement &&
          !!event.target.closest(
            'input,textarea,select,[contenteditable=true]',
          ))
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) actions.history.redo();
        } else if (canUndo) actions.history.undo();
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selected &&
        node &&
        !node.isCanvas &&
        !node.custom.locked
      ) {
        event.preventDefault();
        safeExecute({ type: 'delete', id: selected });
      } else if (event.key === 'Escape') actions.selectNode(undefined);
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  async function save(): Promise<TemplateDetail | null> {
    if (busy || saving || publicationBusy || gestureBusy.current) return null;
    setSaving(true);
    setError('');
    try {
      const result = await builderRequest<TemplateDetail>(
        `/admin/templates/${saved.id}/draft`,
        {
          method: 'PATCH',
          body: {
            expectedVersion: saved.editVersion,
            document,
            sampleData: publicationSample,
          },
        },
      );
      savedRef.current = result;
      setSaved(result);
      setPublicationSample(result.draftSampleData);
      onSaved(result);
      setStatus('Đã lưu');
      return result;
    } catch (cause) {
      setError(
        cause instanceof BuilderApiError ? cause.message : 'Không thể lưu mẫu.',
      );
      return null;
    } finally {
      setSaving(false);
    }
  }
  const savedRef = useRef(saved);
  useLayoutEffect(() => {
    savedRef.current = saved;
  }, [saved]);
  function applyLifecycle(lifecycle: TemplateLifecycle) {
    const next = { ...savedRef.current, ...lifecycle };
    savedRef.current = next;
    setSaved(next);
    onSaved(next);
  }
  async function refreshPublication(committed?: TemplateLifecycle) {
    if (committed) applyLifecycle(committed);
    if (committed?.status === 'UNPUBLISHED') {
      await reload(true);
      return;
    }
    const result = await builderRequest<TemplateDetail>(
      `/admin/templates/${savedRef.current.id}`,
    );
    if (result.editVersion !== savedRef.current.editVersion)
      throw new BuilderApiError(409, 'VERSION_CONFLICT');
    applyLifecycle({
      status: result.status,
      editVersion: result.editVersion,
      publishedRevisionId: result.publishedRevisionId,
      coverUrl: result.coverUrl,
      updatedAt: result.updatedAt,
    });
  }
  async function reload(fromPublication = false) {
    if (
      busy ||
      saving ||
      (publicationBusy && !fromPublication) ||
      gestureBusy.current
    )
      return;
    if (
      dirtyRef.current &&
      !window.confirm('Bỏ các thay đổi chưa lưu và tải lại bản đã lưu?')
    )
      return;
    setBusy(true);
    try {
      const result = await builderRequest<TemplateDetail>(
        `/admin/templates/${saved.id}`,
      );
      actions.deserialize(importDesign(result.draftDocument));
      actions.history.clear();
      setMetadata({
        name: result.name,
        category: result.category,
        tags: result.tags.join(', '),
        sortOrder: result.sortOrder,
        coverAssetId: result.coverAssetId,
      });
      savedRef.current = result;
      setSaved(result);
      setPublicationSample(result.draftSampleData);
      setSampleData(result.draftSampleData);
      onSaved(result);
      setError('');
      setStatus('Đã tải lại');
    } catch {
      setError('Không thể tải lại mẫu.');
    } finally {
      setBusy(false);
    }
  }
  function choose(kind: AssetChoice) {
    setChoice(kind);
  }
  async function saveMetadata(
    base: TemplateDetail = saved,
  ): Promise<TemplateDetail | null> {
    if (busy || saving || publicationBusy || gestureBusy.current) return null;
    setSaving(true);
    setError('');
    setBusy(true);
    try {
      const result = await builderRequest<TemplateDetail>(
        `/admin/templates/${saved.id}`,
        {
          method: 'PATCH',
          body: {
            expectedVersion: base.editVersion,
            name: metadata.name,
            category: metadata.category,
            tags: metadata.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
            sortOrder: metadata.sortOrder,
            coverAssetId: metadata.coverAssetId,
          },
        },
      );
      savedRef.current = result;
      setSaved(result);
      onSaved(result);
      setMetadata({
        name: result.name,
        category: result.category,
        tags: result.tags.join(', '),
        sortOrder: result.sortOrder,
        coverAssetId: result.coverAssetId,
      });
      setStatus('Đã lưu thông tin mẫu');
      return result;
    } catch (cause) {
      setError(
        cause instanceof BuilderApiError
          ? cause.message
          : 'Không thể lưu thông tin mẫu.',
      );
      return null;
    } finally {
      setSaving(false);
      setBusy(false);
    }
  }
  async function saveBeforePublish(): Promise<TemplateDetail | null> {
    let current = saved;
    if (designDirty || sampleDirty) {
      const result = await save();
      if (!result) return null;
      current = result;
    }
    const hasMetadataChanges =
      metadata.name !== current.name ||
      metadata.category !== current.category ||
      metadata.tags !== current.tags.join(', ') ||
      metadata.sortOrder !== current.sortOrder ||
      metadata.coverAssetId !== current.coverAssetId;
    if (hasMetadataChanges) {
      const result = await saveMetadata(current);
      if (!result) return null;
      current = result;
    }
    return current;
  }
  function selectedAsset(asset: AssetSummary) {
    setSampleAssets((current) =>
      current.some((item) => item.id === asset.id)
        ? current
        : [asset, ...current],
    );
    if (choice === 'cover')
      setMetadata((current) => ({ ...current, coverAssetId: asset.id }));
    else if (choice === 'replace' && selected)
      safeExecute({
        type: 'content',
        id: selected,
        value: { assetId: asset.id },
      });
    else if (choice === 'Image' || choice === 'Decoration')
      safeExecute({ type: 'add', node: primitiveNode(choice, asset.id) });
    else if (choice === 'background')
      safeExecute({
        type: 'canvas-background',
        value: {
          kind: 'asset',
          assetId: asset.id,
          fit: 'cover',
          positionX: 0.5,
          positionY: 0.5,
        },
      });
    setChoice(null);
  }
  const activeScale = preview ? Math.min(1, previewWidth / 390) : zoom;
  const attach = useCallback(
    (element: HTMLDivElement | null) => setRoot(element),
    [],
  );
  return (
    <EditorScene.Provider value={localPreview.scene}>
      <Assets.Provider value={assets}>
        <div>
          <details>
            <summary>Thông tin mẫu</summary>
            <fieldset disabled={busy || saving || publicationBusy}>
              <label>
                Tên mẫu
                <input
                  value={metadata.name}
                  maxLength={120}
                  onChange={(event) =>
                    setMetadata({ ...metadata, name: event.target.value })
                  }
                />
              </label>
              <label>
                Danh mục
                <input
                  value={metadata.category}
                  maxLength={64}
                  onChange={(event) =>
                    setMetadata({ ...metadata, category: event.target.value })
                  }
                />
              </label>
              <label>
                Nhãn (phân cách bằng dấu phẩy)
                <input
                  value={metadata.tags}
                  onChange={(event) =>
                    setMetadata({ ...metadata, tags: event.target.value })
                  }
                />
              </label>
              <label>
                Thứ tự mẫu
                <input
                  type="number"
                  min={-1000000}
                  max={1000000}
                  value={metadata.sortOrder}
                  onChange={(event) =>
                    setMetadata({
                      ...metadata,
                      sortOrder: Number(event.target.value),
                    })
                  }
                />
              </label>
              <p>
                {metadata.coverAssetId
                  ? 'Đang dùng ảnh bìa riêng'
                  : 'Đang dùng thumbnail đã xuất bản'}
              </p>
              <button type="button" onClick={() => choose('cover')}>
                Chọn ảnh bìa
              </button>
              <button
                type="button"
                disabled={!metadata.coverAssetId}
                onClick={() => setMetadata({ ...metadata, coverAssetId: null })}
              >
                Dùng thumbnail làm bìa
              </button>
              <button
                disabled={!metadataDirty}
                onClick={() => void saveMetadata()}
              >
                Lưu thông tin mẫu
              </button>
            </fieldset>
          </details>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              padding: 12,
              background: '#f4edf0',
            }}
          >
            <a href="/admin/templates">Danh sách mẫu</a>
            <button
              disabled={!canUndo || busy || saving || publicationBusy}
              onClick={() => actions.history.undo()}
            >
              Hoàn tác
            </button>
            <button
              disabled={!canRedo || busy || saving || publicationBusy}
              onClick={() => actions.history.redo()}
            >
              Làm lại
            </button>
            <button
              disabled={busy || saving || publicationBusy}
              onClick={() => void save()}
            >
              Lưu bản nháp
            </button>
            <button
              disabled={busy || saving || publicationBusy}
              onClick={() => void reload()}
            >
              Tải lại bản đã lưu
            </button>
            <label>
              Zoom
              <select
                aria-label="Zoom"
                disabled={busy}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              >
                {[0.25, 0.5, 0.75, 1, 1.5, 2].map((value) => (
                  <option key={value} value={value}>
                    {value * 100}%
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy}
              onClick={() =>
                setZoom(
                  Math.min(
                    2,
                    Math.max(0.25, ((root?.clientWidth ?? 438) - 48) / 390),
                  ),
                )
              }
            >
              Vừa màn hình
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setPreview((value) => !value);
                actions.selectNode(undefined);
              }}
            >
              {preview ? 'Quay lại chỉnh sửa' : 'Xem trước'}
            </button>
            {preview && (
              <>
                <label>
                  Thiết bị
                  <select
                    aria-label="Chiều rộng xem trước"
                    value={previewWidth}
                    onChange={(event) =>
                      setPreviewWidth(Number(event.target.value))
                    }
                  >
                    {[360, 390, 768, 1440].map((width) => (
                      <option key={width} value={width}>
                        {width}px
                      </option>
                    ))}
                  </select>
                </label>
                <SampleDataPanel
                  assets={sampleAssets}
                  selected={selectedSample}
                  data={sampleData}
                  onSelect={(sample) => {
                    sampleSets.current[selectedSample] =
                      structuredClone(sampleData);
                    setSelectedSample(sample);
                    setSampleData(
                      sampleSets.current[sample] ?? sampleWeddingData(sample),
                    );
                  }}
                  onChange={setSampleData}
                />
                {sampleCursor && (
                  <button
                    disabled={
                      saving || busy || publicationBusy || sampleLoading
                    }
                    onClick={() => {
                      if (sampleLoadingRef.current) return;
                      sampleLoadingRef.current = true;
                      setSampleLoading(true);
                      void builderRequest<{
                        items: AssetSummary[];
                        nextCursor: string | null;
                      }>(
                        '/admin/template-assets?' +
                          new URLSearchParams({
                            limit: '100',
                            cursor: sampleCursor,
                          }),
                      )
                        .then((page) => {
                          setSampleAssets((current) => [
                            ...new globalThis.Map(
                              [...current, ...page.items].map((asset) => [
                                asset.id,
                                asset,
                              ]),
                            ).values(),
                          ]);
                          setSampleCursor(page.nextCursor);
                        })
                        .catch(() => setError('Không thể tải thêm ảnh mẫu.'))
                        .finally(() => {
                          sampleLoadingRef.current = false;
                          setSampleLoading(false);
                        });
                    }}
                  >
                    Tải thêm ảnh mẫu
                  </button>
                )}
                <button
                  disabled={saving || busy || publicationBusy}
                  onClick={() => {
                    setPublicationSample(structuredClone(sampleData));
                    setStatus('Chưa lưu dữ liệu xuất bản');
                  }}
                >
                  Dùng dữ liệu này khi xuất bản
                </button>
              </>
            )}
            <span role="status">
              {saving ? 'Đang lưu…' : status || (dirty ? 'Chưa lưu' : 'Đã lưu')}
            </span>
            <PublicationControls
              template={saved}
              dirty={dirty}
              externalBusy={busy || saving}
              canStart={() => !gestureBusy.current && !busy && !saving}
              saveBeforePublish={saveBeforePublish}
              onChanged={refreshPublication}
              onBusy={setPublicationBusy}
            />
          </div>
          {error && <p role="alert">{error}</p>}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: preview
                ? '1fr'
                : '200px minmax(440px,1fr) 280px',
              gap: 16,
            }}
          >
            {!preview && (
              <aside>
                <h2>Thành phần</h2>
                <fieldset
                  disabled={busy || saving || publicationBusy}
                  style={{ border: 0, padding: 0 }}
                >
                  <button
                    onClick={() =>
                      safeExecute({ type: 'add', node: primitiveNode('Text') })
                    }
                  >
                    Thêm văn bản
                  </button>
                  <button
                    onClick={() =>
                      safeExecute({ type: 'add', node: primitiveNode('Shape') })
                    }
                  >
                    Thêm hình dạng
                  </button>
                  <button onClick={() => void choose('Image')}>
                    Thêm hình ảnh
                  </button>
                  <button onClick={() => void choose('Decoration')}>
                    Thêm trang trí
                  </button>
                  <button onClick={() => choose('background')}>Chọn nền</button>
                  {(
                    [
                      'Calendar',
                      'Countdown',
                      'Map',
                      'RSVP',
                      'QRBank',
                      'Timeline',
                    ] as const
                  ).map((kind) => (
                    <button
                      key={kind}
                      onClick={() =>
                        safeExecute({ type: 'add', node: widgetNode(kind) })
                      }
                    >
                      Thêm {kind}
                    </button>
                  ))}
                  <label>
                    Chiều cao thiệp
                    <input
                      type="number"
                      min={390}
                      max={12000}
                      key={document.nodes.ROOT.props.canvas.height}
                      defaultValue={document.nodes.ROOT.props.canvas.height}
                      onBlur={(event) =>
                        safeExecute({
                          type: 'height',
                          value: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </fieldset>
                <LayersPanel
                  document={document}
                  selected={selected}
                  onSelect={(id) => actions.selectNode(id)}
                  onCommand={safeExecute}
                  disabled={busy || saving || publicationBusy}
                />
              </aside>
            )}
            <div
              ref={attach}
              style={{
                position: 'relative',
                overflow: 'auto',
                background: '#e9e6e4',
                minHeight: 600,
                maxHeight: '80vh',
                padding: 24,
              }}
            >
              <div
                style={{
                  width: preview ? previewWidth : 390 * activeScale,
                  maxWidth: preview ? '100%' : undefined,
                  height: document.nodes.ROOT.props.canvas.height * activeScale,
                  margin: preview ? '0 auto' : undefined,
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: 390,
                    height: document.nodes.ROOT.props.canvas.height,
                    transform: `scale(${activeScale})`,
                    transformOrigin: 'top left',
                    pointerEvents: preview ? 'none' : undefined,
                  }}
                >
                  <div style={{ display: preview ? 'none' : undefined }}>
                    <EditorPreview.Provider value={preview}>
                      <Frame data={importDesign(initial.draftDocument)} />
                    </EditorPreview.Provider>
                  </div>
                  {preview && (
                    <ScenePreview
                      scene={localPreview.scene}
                      bindingIssues={localPreview.issues}
                      context={{
                        mode: 'preview',
                        asOf: '2026-01-01T00:00:00Z',
                        assetUrls: assets,
                      }}
                    />
                  )}
                  {!preview &&
                    node &&
                    !node.isCanvas &&
                    !node.hidden &&
                    !node.custom.locked &&
                    (!busy || gestureActive) &&
                    !saving &&
                    !publicationBusy && (
                      <GeometryControls
                        key={selected}
                        target={target}
                        box={node.props.box}
                        zoom={zoom}
                        rootContainer={root}
                        onCommit={(value) => {
                          const result = applyCommand(document, {
                            type: 'box',
                            id: selected,
                            value,
                          });
                          actions.setProp(selected, (props: ElementProps) => {
                            props.box = (
                              result.document.nodes[selected] as {
                                props: ElementProps;
                              }
                            ).props.box;
                          });
                          setStatus('Chưa lưu');
                        }}
                        onBusy={(value) => {
                          gestureBusy.current = value;
                          setGestureActive(value);
                          setBusy(value);
                        }}
                        onError={setError}
                      />
                    )}
                </div>
              </div>
            </div>
            {!preview && (
              <aside>
                {node && !node.isCanvas && (
                  <PropertiesPanel
                    key={selected}
                    id={selected}
                    node={node}
                    index={document.nodes.ROOT.nodes.indexOf(selected)}
                    count={document.nodes.ROOT.nodes.length}
                    onCommand={execute}
                    onReplace={() => void choose('replace')}
                    disabled={busy || saving || publicationBusy}
                  />
                )}
              </aside>
            )}
          </div>
          {choice && (
            <AssetLibrary
              choice={choice}
              onSelect={selectedAsset}
              onClose={() => setChoice(null)}
            />
          )}
        </div>
      </Assets.Provider>
    </EditorScene.Provider>
  );
}
export default function TemplateEditor({
  initial,
  onSaved,
}: {
  initial: TemplateDetail;
  onSaved: (value: TemplateDetail) => void;
}) {
  return (
    <Editor
      resolver={resolver}
      handlers={(store) =>
        new DefaultEventHandlers({
          store,
          isMultiSelectEnabled: () => false,
          removeHoverOnMouseleave: true,
        })
      }
    >
      <Workarea initial={initial} onSaved={onSaved} />
    </Editor>
  );
}
