'use client';
/* eslint-disable @next/next/no-img-element -- Local effect artwork includes animated GIFs. */
import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Sparkles,
  PanelsTopLeft,
  Snowflake,
  Check,
  X,
  Play,
  Palette,
  Film,
} from 'lucide-react';
import type { EditorDocument, EditorScene } from '../document/editor-document';
import {
  defaultOpeningEffect,
  openingAssetIds,
  INVITATION_THEMES,
  INVITATION_COLORS,
  CURTAIN_COLORS,
  DOOR_TEXTURES,
  type OpeningEffect,
  type EffectImage,
  type OpeningKind,
} from '../document/effects';
import { FONT_CATALOG } from '../document/font-catalog';
import { ModalSurface } from '../../../ui/platform/modal-surface';
import { AssetLibrary } from './asset-library';
import { useAssetPreview } from '../assets/use-asset-preview';
import type { AssetSummary } from '../api/client';
import { PropertyPopover } from './property-popover';
import { ColorField } from './property-controls';
import {
  OPENING_CATALOG,
  effectAsset,
  effectImageUrl,
} from '../renderer/effect-catalog';
import { useReducedMotion } from '../renderer/motion-preference';
import { OpeningArtwork, OpeningPlayer } from '../renderer/opening-effects';
import { FALLING_TYPES } from '../renderer/falling-effects';
import { CanvasRenderer } from '../renderer/canvas-renderer';
import {
  PAGE_PRESETS,
  applyPagePreset,
  type PagePreset,
} from './effect-presets';
import styles from './effects-panel.module.css';

type Group = 'motion' | 'opening' | 'falling';
const GROUPS = [
  {
    value: 'motion' as const,
    title: 'Hiệu ứng động',
    description: 'Hiệu ứng chuyển động khi cuộn trang',
    Icon: PanelsTopLeft,
  },
  {
    value: 'opening' as const,
    title: 'Hiệu ứng mở màn',
    description: 'Ấn tượng đầu tiên khi mở trang',
    Icon: Sparkles,
  },
  {
    value: 'falling' as const,
    title: 'Hiệu ứng rơi',
    description: 'Hiệu ứng rơi trang trí trên trang',
    Icon: Snowflake,
  },
];
function radioKeys(event: KeyboardEvent<HTMLDivElement>) {
  const arrows = [
    'ArrowLeft',
    'ArrowUp',
    'ArrowRight',
    'ArrowDown',
    'Home',
    'End',
  ];
  if (!arrows.includes(event.key)) return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  );
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index +
            (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) +
            buttons.length) %
          buttons.length;
  buttons[next].focus();
  buttons[next].click();
}
function VideoPreview({ src, ariaLabel }: { src: string; ariaLabel?: string }) {
  const reduced = useReducedMotion();
  return (
    <video
      key={reduced ? 'still' : 'animated'}
      src={src}
      poster={src.replace(/\.webm$/, '.jpg')}
      autoPlay={!reduced}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={ariaLabel}
    />
  );
}
export function EffectsPanel({
  document,
  scene,
  assetUrls,
  onChange,
}: {
  document: EditorDocument;
  scene: EditorScene;
  assetUrls: Record<string, string>;
  onChange: (document: EditorDocument) => void;
}) {
  const [group, setGroup] = useState<Group | null>(null);
  const [pending, setPending] = useState<PagePreset | null>(null);
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState<OpeningKind | null>(null);
  const [lastFalling, setLastFalling] = useState<
    EditorDocument['settings']['particles']
  >(
    document.settings.particles === 'none'
      ? 'snow'
      : document.settings.particles,
  );
  const [status, setStatus] = useState('');
  const opening =
    document.settings.openingEffect === undefined
      ? document.settings.envelope
        ? defaultOpeningEffect('envelope')
        : null
      : document.settings.openingEffect;
  function settings(patch: Partial<EditorDocument['settings']>) {
    onChange({ ...document, settings: { ...document.settings, ...patch } });
  }
  function apply() {
    if (pending !== null) {
      onChange(applyPagePreset(document, pending));
      setPending(null);
      setStatus('Đã áp dụng hiệu ứng vào trang!');
    }
    setPreview(false);
  }
  const previewDoc =
    pending === null ? document : applyPagePreset(document, pending);
  const previewScene: EditorScene = {
    ...scene,
    nodeOptions: previewDoc.nodeOptions,
    settings: { ...previewDoc.settings, envelope: false, openingEffect: null },
  };
  return (
    <section className={styles.panel} aria-label="Hiệu ứng thiệp">
      {group ? (
        <button
          type="button"
          className={styles.back}
          onClick={() => {
            setGroup(null);
            setPending(null);
            setStatus('');
          }}
        >
          <ArrowLeft size={16} />
          {GROUPS.find((g) => g.value === group)!.title}
        </button>
      ) : (
        <>
          <h3>Hiệu ứng</h3>
          <p className={styles.hint}>Chọn loại hiệu ứng bạn muốn thêm</p>
        </>
      )}
      {!group && (
        <div className={styles.groups}>
          {GROUPS.map(({ value, title, description, Icon }) => (
            <button type="button" key={value} onClick={() => setGroup(value)}>
              <span className={styles.groupIcon} data-group={value}>
                <Icon size={30} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      )}
      {group === 'motion' && (
        <>
          <div className={styles.presetBox}>
            <h3>
              <Palette size={18} /> Hiệu ứng dựng sẵn
            </h3>
            <p className={styles.hint}>
              Chọn 1 mẫu hiệu ứng để áp dụng cho toàn bộ trang
            </p>
            <div
              className={styles.grid}
              role="radiogroup"
              aria-label="Hiệu ứng dựng sẵn"
              onKeyDown={radioKeys}
            >
              {PAGE_PRESETS.map((preset) => (
                <div key={preset.value} className={styles.presetWrapper}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={pending === preset.value}
                    className={styles.preset}
                    onClick={() => setPending(preset.value)}
                  >
                    <img
                      src={`/effects/transition-effects/${preset.icon}.png`}
                      alt=""
                    />
                    <span>{preset.label}</span>
                  </button>
                  {pending === preset.value && (
                    <button
                      type="button"
                      title="Reset hiệu ứng"
                      aria-label="Reset hiệu ứng"
                      className={styles.reset}
                      onClick={() => setPending(null)}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.previewButton}
              onClick={() => setPreview(true)}
            >
              <Film size={17} />
              {pending === null ? 'Xem trước hiệu ứng' : 'Xem trước'}
            </button>
            {pending !== null && (
              <button type="button" className={styles.apply} onClick={apply}>
                Áp dụng
              </button>
            )}
          </div>
        </>
      )}
      {group === 'opening' && (
        <>
          <h3>Hiệu ứng mở màn</h3>
          <p className={styles.hint}>
            Tạo ấn tượng đầu tiên đặc biệt với hiệu ứng mở màn khi trang web của
            bạn được mở.
          </p>
          {opening && (
            <button
              type="button"
              className={styles.remove}
              onClick={() => {
                settings({ openingEffect: null, envelope: false });
                setStatus('Đã xóa hiệu ứng mở màn');
              }}
            >
              Xóa hiệu ứng
            </button>
          )}
          <div className={styles.openingGrid}>
            {OPENING_CATALOG.map((item) => (
              <button
                type="button"
                key={item.kind}
                title={item.label}
                aria-label={item.label}
                aria-pressed={opening?.kind === item.kind}
                className={styles.openingCard}
                onClick={() => setEditing(item.kind)}
              >
                {item.image ? (
                  <img src={effectAsset(item.image)} alt={item.label} />
                ) : item.video ? (
                  <VideoPreview
                    src={effectAsset(item.video)}
                    ariaLabel={item.label}
                  />
                ) : (
                  <OpeningArtwork
                    effect={defaultOpeningEffect('sliding-door')}
                  />
                )}
                {opening?.kind === item.kind && (
                  <span className={styles.selected}>
                    <Check size={16} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      {group === 'falling' && (
        <>
          <h3>Chọn hiệu ứng</h3>
          <p className={styles.subtitle}>
            Chọn loại hiệu ứng thả rơi bạn muốn hiển thị
          </p>
          <label className={styles.toggle}>
            <span>
              <strong>Hiệu ứng rơi</strong>
              <small>Thêm hiệu ứng rơi cho trang của bạn</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Hiệu ứng rơi"
              checked={document.settings.particles !== 'none'}
              onChange={(event) => {
                const active = event.target.checked;
                if (!active) setLastFalling(document.settings.particles);
                settings({ particles: active ? lastFalling : 'none' });
              }}
            />
            <span className={styles.switchTrack} />
          </label>
          {document.settings.particles !== 'none' && (
            <div
              className={styles.fallingGrid}
              role="radiogroup"
              aria-label="Chọn kiểu rơi"
              onKeyDown={radioKeys}
            >
              {FALLING_TYPES.map(([value, label, glyph]) => (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  title={label}
                  aria-label={label}
                  aria-checked={
                    document.settings.particles === value ||
                    (value === 'flowers' &&
                      document.settings.particles === 'petals')
                  }
                  onClick={() => {
                    setLastFalling(value);
                    settings({ particles: value });
                  }}
                >
                  <span>{glyph}</span>
                  {(document.settings.particles === value ||
                    (value === 'flowers' &&
                      document.settings.particles === 'petals')) && (
                    <Check className={styles.fallingCheck} size={14} />
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {status && (
        <p className={styles.status} role="status">
          {status}
        </p>
      )}
      {preview && (
        <ModalSurface
          variant="centered"
          className={styles.motionModal}
          label="Xem trước hiệu ứng"
          onClose={() => setPreview(false)}
        >
          {pending !== null && (
            <button type="button" className={styles.apply} onClick={apply}>
              Áp dụng
            </button>
          )}
          <p className={styles.previewHint}>
            Trang đang hiển thị với hiệu ứng{' '}
            <strong>
              {PAGE_PRESETS.find((p) => p.value === pending)?.label ??
                'đã áp dụng'}
            </strong>
            . Cuộn trang để xem
          </p>
          <div className={styles.motionViewport}>
            <div className={styles.scaled}>
              <CanvasRenderer
                scene={previewScene}
                context={{
                  mode: 'preview',
                  asOf: '2026-10-15T00:00:00Z',
                  assetUrls,
                }}
              />
            </div>
          </div>
        </ModalSurface>
      )}
      {editing && (
        <OpeningConfiguration
          key={editing}
          initial={
            opening?.kind === editing ? opening : defaultOpeningEffect(editing)
          }
          assetUrls={assetUrls}
          onCancel={() => setEditing(null)}
          onConfirm={(effect) => {
            settings({
              openingEffect: effect,
              envelope: effect.kind === 'envelope',
            });
            setEditing(null);
            setStatus('Đã áp dụng hiệu ứng vào trang!');
          }}
        />
      )}
    </section>
  );
}

function OpeningConfiguration({
  initial,
  assetUrls,
  onCancel,
  onConfirm,
}: {
  initial: OpeningEffect;
  assetUrls: Record<string, string>;
  onCancel: () => void;
  onConfirm: (effect: OpeningEffect) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [picker, setPicker] = useState<number | 'image' | 'seal' | null>(null);
  const [play, setPlay] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [fontQuery, setFontQuery] = useState('');
  const [ownImage, setOwnImage] = useState(
    initial.kind === 'animated-image' && !!initial.image.assetId,
  );
  const summaries = useMemo(
    () =>
      openingAssetIds(draft).map(
        (id) =>
          ({
            id,
            name: id,
            kind: 'IMAGE',
            mimeType: 'image/webp',
            byteSize: 0,
            width: 0,
            height: 0,
            createdAt: '',
            previewUrl: `/api/v1/assets/${id}/content`,
          }) as AssetSummary,
      ),
    [draft],
  );
  const draftUrls = useAssetPreview(summaries);
  const urls = { ...assetUrls, ...draftUrls };
  const patch = (value: Record<string, unknown>) => {
    setDraft((current) => ({ ...current, ...value }) as OpeningEffect);
    setPlay(false);
  };
  function pickImage(slot: number | 'image' | 'seal', image: EffectImage) {
    if (typeof slot === 'number' && 'images' in draft) {
      const images = [...draft.images];
      images[slot] = image;
      patch({ images });
    } else if (slot === 'image' && draft.kind === 'animated-image')
      patch({ image });
    else if (slot === 'seal' && draft.kind === 'sliding-door')
      patch({ seal: image });
  }
  function field(key: string, label: string, multiline = false, max = 120) {
    const value = (draft as unknown as Record<string, unknown>)[key] as string;
    return (
      <label className={styles.field} key={key}>
        {label}
        {multiline ? (
          <textarea
            rows={3}
            maxLength={max}
            value={value}
            onChange={(e) => patch({ [key]: e.target.value })}
          />
        ) : (
          <input
            maxLength={max}
            value={value}
            onChange={(e) => patch({ [key]: e.target.value })}
          />
        )}
      </label>
    );
  }
  function imagePicker(
    image: EffectImage,
    slot: number | 'image' | 'seal',
    label: string,
  ) {
    return (
      <div className={styles.imageSlot} key={label}>
        {effectImageUrl(image, urls) && (
          <img src={effectImageUrl(image, urls)} alt={label} />
        )}
        <span>{label}</span>
        <button type="button" onClick={() => setPicker(slot)}>
          {image.assetId ? 'Đổi ảnh' : 'Chọn ảnh'}
        </button>
      </div>
    );
  }
  function fontField() {
    if (!('font' in draft)) return null;
    const choices = [{ id: 'aquarelle', label: 'Aquarelle' }, ...FONT_CATALOG];
    return (
      <div className={styles.field}>
        <span>Font hiển thị tên</span>
        <PropertyPopover
          label="Font hiển thị tên"
          width={290}
          className={styles.fontTrigger}
          trigger={
            <>
              <span
                style={{
                  fontFamily:
                    draft.font === 'aquarelle'
                      ? 'Opening Aquarelle'
                      : undefined,
                }}
              >
                {choices.find((font) => font.id === draft.font)?.label}
              </span>
              <small>Đổi font</small>
            </>
          }
        >
          <div className={styles.fontChoices}>
            <input
              type="search"
              aria-label="Tìm phông chữ"
              placeholder="Tìm phông chữ…"
              value={fontQuery}
              onChange={(event) => setFontQuery(event.target.value)}
            />
            {choices
              .filter((font) =>
                font.label.toLowerCase().includes(fontQuery.toLowerCase()),
              )
              .map((font) => (
                <button
                  type="button"
                  key={font.id}
                  aria-pressed={draft.font === font.id}
                  onClick={() => patch({ font: font.id })}
                >
                  {font.label}
                  {draft.font === font.id && <Check size={14} />}
                </button>
              ))}
          </div>
        </PropertyPopover>
      </div>
    );
  }
  const selectedTitle = OPENING_CATALOG.find(
    (item) => item.kind === draft.kind,
  )!.title;
  if (picker !== null)
    return (
      <ModalSurface
        variant="centered"
        label="Chọn ảnh"
        className={styles.configModal}
        onClose={() => setPicker(null)}
      >
        <AssetLibrary
          kind="IMAGE"
          onAsset={(asset) => {
            pickImage(picker, { assetId: asset.id, preset: null });
            setPicker(null);
          }}
        />
      </ModalSurface>
    );
  return (
    <ModalSurface
      variant="centered"
      className={`${styles.configModal} ${draft.kind === 'curtain' || draft.kind === 'intro' ? styles.compactModal : ''}`}
      label={selectedTitle}
      onClose={onCancel}
    >
      <div className={styles.configuration}>
        <div className={styles.form}>
          {draft.kind === 'envelope' && (
            <>
              <fieldset>
                <legend>Kiểu phong bì</legend>
                <div className={styles.variants}>
                  {(
                    [
                      ['classic', 'Kem cổ điển'],
                      ['begie', 'Beige'],
                      ['red', 'Đỏ'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={draft.variant === value}
                      onClick={() => patch({ variant: value })}
                    >
                      <img
                        src={effectAsset(
                          `opening-envelope/${value}/${value}-preview.webp`,
                        )}
                        alt=""
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Nội dung hiển thị</legend>
                <div className={styles.twoFields}>
                  {field('groom', 'Tên chú rể')}
                  {field('bride', 'Tên cô dâu')}
                </div>
                {field('title', 'Dòng tiêu đề')}
                {fontField()}
                {field('buttonText', 'Nút mở thiệp')}
                <p className={styles.hint}>
                  Tên trên phong bì tự ghép từ chú rể &amp; cô dâu (dạng
                  &quot;Tên &amp; Tên&quot;). Monogram lấy chữ cái đầu tên gọi
                  (từ cuối trong họ tên).
                </p>
              </fieldset>
            </>
          )}
          {draft.kind === 'invitation' && (
            <>
              <fieldset>
                <legend>Kiểu thiệp</legend>
                <select
                  aria-label="Kiểu thiệp"
                  value={draft.theme}
                  onChange={(e) =>
                    patch({
                      theme: e.target.value,
                      colors: {
                        ...INVITATION_COLORS[
                          e.target.value as keyof typeof INVITATION_COLORS
                        ],
                      },
                    })
                  }
                >
                  {INVITATION_THEMES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </fieldset>
              <fieldset>
                <legend>Nội dung hiển thị</legend>
                <div className={styles.twoFields}>
                  {field('person1', 'Tên người 1')}
                  {field('person2', 'Tên người 2')}
                </div>
                {field('date', 'Ngày tổ chức')}
                {field('buttonText', 'Text nút mở')}
                {field('guestLabel', 'Nhãn mời')}
                {field('guestName', 'Tên khách mời')}
                <p className={styles.hint}>
                  Khi sử dụng tên khách mời tự động, hệ thống sẽ dùng tên theo
                  mỗi khách.
                </p>
                {field('message', 'Lời mời', true, 1000)}
              </fieldset>
              <details className={styles.colors}>
                <summary>
                  Màu sắc <span>Bấm để mở</span>
                </summary>
                <div>
                  {(
                    [
                      ['background', 'Màu nền chính'],
                      ['text', 'Màu chữ'],
                      ['buttonBackground', 'Nền nút mở thiệp'],
                      ['buttonText', 'Chữ nút mở thiệp'],
                      ['backdropStart', 'Nền phía sau Start'],
                      ['backdropMiddle', 'Nền phía sau Middle'],
                      ['backdropEnd', 'Nền phía sau End'],
                    ] as const
                  ).map(([key, label]) => (
                    <ColorField
                      key={key}
                      label={label}
                      value={draft.colors[key]}
                      onPick={(color) =>
                        patch({ colors: { ...draft.colors, [key]: color } })
                      }
                    />
                  ))}
                </div>
              </details>
            </>
          )}
          {draft.kind === 'intro' && (
            <>
              <fieldset>
                <legend>Chọn kiểu hiệu ứng</legend>
                <div className={styles.variants}>
                  {([1, 2] as const).map((variant) => (
                    <button
                      type="button"
                      key={variant}
                      aria-pressed={draft.variant === variant}
                      onClick={() => patch({ variant })}
                    >
                      <VideoPreview
                        src={effectAsset(`preview/intro-page-${variant}.webm`)}
                      />
                      Kiểu {variant}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Chọn ảnh nền</legend>
                {draft.images.map((image, i) => (
                  <div key={i}>
                    {imagePicker(image, i, `Ảnh 0${i + 1}`)}
                    <small>
                      {i === 0
                        ? 'Trượt vào từ phải'
                        : 'Nền phía sau + zoom nhẹ'}
                    </small>
                  </div>
                ))}
              </fieldset>
            </>
          )}
          {draft.kind === 'curtain' && (
            <fieldset>
              <legend>Chọn màu rèm</legend>
              <div className={styles.curtainChoices}>
                {CURTAIN_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    aria-pressed={draft.color === color}
                    onClick={() => patch({ color })}
                  >
                    <VideoPreview
                      src={effectAsset(`preview/curtain-reveal-${color}.webm`)}
                    />
                    <span>{color[0].toUpperCase() + color.slice(1)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {draft.kind === 'sliding-door' && (
            <>
              <fieldset>
                <legend>Cách mở thiệp</legend>
                <div className={styles.segment}>
                  {(
                    [
                      ['auto', 'Tự động mở'],
                      ['tap', 'Chạm để mở'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={draft.trigger === value}
                      onClick={() => patch({ trigger: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Kiểu hai cánh cửa</legend>
                <div className={styles.segment}>
                  {(
                    [
                      ['texture', 'Màu & texture'],
                      ['image', 'Ảnh cửa'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={draft.mode === value}
                      onClick={() => patch({ mode: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {draft.mode === 'texture' ? (
                  <>
                    <ColorField
                      label="Màu hai cánh cửa"
                      value={draft.color}
                      onPick={(color) => patch({ color })}
                    />
                    <div className={styles.swatches}>
                      {[
                        '#2A4A3CFF',
                        '#6B1C23FF',
                        '#1B2A4AFF',
                        '#1A1A1AFF',
                        '#E4D5C0FF',
                        '#B8954AFF',
                        '#5C6B5AFF',
                        '#8B4D55FF',
                      ].map((color) => (
                        <button
                          type="button"
                          key={color}
                          title={color}
                          aria-label={`Màu cửa ${color}`}
                          aria-pressed={draft.color === color}
                          style={{ background: color }}
                          onClick={() => patch({ color })}
                        />
                      ))}
                    </div>
                    <p>Texture cửa</p>
                    <div className={styles.textureGrid}>
                      {DOOR_TEXTURES.map((texture, i) => (
                        <button
                          type="button"
                          key={texture}
                          aria-pressed={draft.texture === texture}
                          onClick={() => patch({ texture })}
                        >
                          {
                            [
                              'Trơn',
                              'Texture sọc',
                              'Vải nhạt',
                              'Vải tối',
                              'Giấy',
                              'Họa tiết hoa',
                            ][i]
                          }
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p>Ảnh có sẵn</p>
                    <div className={styles.textureGrid}>
                      {(['red', 'white', 'green', 'pink'] as const).map(
                        (color, i) => (
                          <button
                            type="button"
                            key={color}
                            aria-pressed={
                              draft.images[0].preset === `door-${color}-left`
                            }
                            onClick={() =>
                              patch({
                                images: [
                                  {
                                    assetId: null,
                                    preset: `door-${color}-left`,
                                  },
                                  {
                                    assetId: null,
                                    preset: `door-${color}-right`,
                                  },
                                ],
                              })
                            }
                          >
                            {['Hoa đỏ', 'Hoa trắng', 'Hoa xanh', 'Hoa hồng'][i]}
                          </button>
                        ),
                      )}
                    </div>
                    <p>Tải ảnh riêng</p>
                    {draft.images.map((image, i) =>
                      imagePicker(
                        image,
                        i,
                        i === 0 ? 'Cánh trái' : 'Cánh phải',
                      ),
                    )}
                  </>
                )}
              </fieldset>
              <fieldset>
                <legend>Icon dấu sáp (không bắt buộc)</legend>
                {imagePicker(draft.seal, 'seal', 'Dấu sáp')}
                <div className={styles.segment}>
                  <button
                    type="button"
                    onClick={() =>
                      patch({ seal: { assetId: null, preset: 'seal-01' } })
                    }
                  >
                    Dấu sáp mặc định
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patch({ seal: { assetId: null, preset: null } })
                    }
                  >
                    Xóa dấu sáp
                  </button>
                </div>
              </fieldset>
            </>
          )}
          {draft.kind === 'animated-image' && (
            <>
              <fieldset>
                {field('title', 'Tiêu đề chính')}
                {field('subtitle', 'Tiêu đề phụ', true, 60)}
                <small>{draft.subtitle.length} / 60</small>
                <label className={styles.field}>
                  Thời gian hiển thị (giây)
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={draft.duration}
                    onChange={(e) =>
                      patch({
                        duration: Math.max(
                          1,
                          Math.min(10, Number(e.target.value) || 1),
                        ),
                      })
                    }
                  />
                </label>
              </fieldset>
              <fieldset>
                <legend>Chọn ảnh</legend>
                <div className={styles.segment}>
                  <button
                    type="button"
                    aria-pressed={!ownImage}
                    onClick={() => setOwnImage(false)}
                  >
                    Ảnh có sẵn
                  </button>
                  <button
                    type="button"
                    aria-pressed={ownImage}
                    onClick={() => setOwnImage(true)}
                  >
                    Ảnh của bạn
                  </button>
                </div>
                {ownImage ? (
                  imagePicker(draft.image, 'image', 'Ảnh của bạn')
                ) : (
                  <div className={styles.characters}>
                    {[1, 2, 3, 4].map((i) => (
                      <button
                        type="button"
                        key={i}
                        aria-label={`Nhân vật ${i}`}
                        aria-pressed={draft.image.preset === `character-${i}`}
                        onClick={() =>
                          patch({
                            image: { assetId: null, preset: `character-${i}` },
                          })
                        }
                      >
                        <img
                          src={effectImageUrl(
                            {
                              assetId: null,
                              preset: `character-${i}` as EffectImage['preset'],
                            },
                            urls,
                          )}
                          alt=""
                        />
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>
            </>
          )}
          {draft.kind === 'photobooth' && (
            <>
              <fieldset>
                <legend>Nội dung hiển thị</legend>
                {field('title', 'Tiêu đề')}
                <div className={styles.twoFields}>
                  {field('groom', 'Tên chú rể')}
                  {field('bride', 'Tên cô dâu')}
                </div>
                {fontField()}
                {field('footer', 'Text cuối strip')}
                {field('buttonText', 'Nút mở thiệp')}
                <ColorField
                  label="Màu nền"
                  value={draft.background}
                  onPick={(background) => patch({ background })}
                />
                <ColorField
                  label="Màu chữ"
                  value={draft.color}
                  onPick={(color) => patch({ color })}
                />
              </fieldset>
              <fieldset>
                <legend>3 ảnh trên strip</legend>
                <div className={styles.photoSlots}>
                  {draft.images.map((image, i) =>
                    imagePicker(image, i, `Ảnh 0${i + 1}`),
                  )}
                </div>
              </fieldset>
            </>
          )}
        </div>
        {draft.kind !== 'curtain' && draft.kind !== 'intro' && (
          <div className={styles.livePreview}>
            <h4>Preview</h4>
            <div className={styles.previewStage} data-kind={draft.kind}>
              {play ? (
                <OpeningPlayer
                  key={playKey}
                  effect={draft}
                  assetUrls={urls}
                  onComplete={() => setPlay(false)}
                />
              ) : (
                <OpeningArtwork effect={draft} assetUrls={urls} />
              )}
            </div>
            <button
              type="button"
              className={styles.replay}
              onClick={() => {
                setPlayKey((k) => k + 1);
                setPlay(true);
              }}
            >
              <Play size={14} />{' '}
              {draft.kind === 'sliding-door'
                ? 'Xem hiệu ứng trượt'
                : 'Xem trước'}
            </button>
          </div>
        )}
      </div>
      <footer className={styles.footer}>
        <button type="button" onClick={onCancel}>
          Hủy
        </button>
        <button
          type="button"
          className={styles.confirm}
          onClick={() => onConfirm(draft)}
        >
          Xác nhận
        </button>
      </footer>
    </ModalSurface>
  );
}
