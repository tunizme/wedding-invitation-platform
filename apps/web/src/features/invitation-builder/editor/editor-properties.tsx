'use client';
import type {
  CanvasNode,
  NodeOptions,
  EditorDocument,
  CustomField,
} from '../document/editor-document';
import { isAdvanced } from '../document/editor-document';
import type { ElementNode } from '../document/types';
import type { DocumentCommand } from './editor-commands';
import { PropertiesPanel } from './properties-panel';
import { MotionControls } from './motion-controls';
import { ClickActionControls } from './click-action-controls';
import {
  ColorField,
  FieldRow,
  NumberRow,
  PropertySection,
} from './property-controls';
import styles from './property-controls.module.css';

export function NumberProperty({
  label,
  value,
  onChange,
  min,
  max,
  step = 'any',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
}) {
  return (
    <label>
      {label}
      <input
        key={value}
        type="number"
        defaultValue={value}
        min={min}
        max={max}
        step={step}
        onBlur={(e) => {
          if (e.target.value !== '') onChange(Number(e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function EditorProperties({
  id,
  node,
  options,
  index,
  count,
  command,
  onChoose,
  disabled,
  targets = [],
  onPickTarget,
  onLocateTarget,
}: {
  id: string;
  node: CanvasNode;
  options: NodeOptions;
  index: number;
  count: number;
  command: (c: DocumentCommand) => void;
  onChoose: (target: 'image' | 'album' | 'poster') => void;
  disabled: boolean;
  targets?: { id: string; label: string }[];
  onPickTarget?: () => void;
  onLocateTarget?: (id: string) => void;
}) {
  const content = (value: Record<string, unknown>) =>
    command({ type: 'content', id, value });
  const option = (value: NodeOptions) =>
    command({ type: 'options', id, value: { ...options, ...value } });
  return (
    <section aria-label="Thuộc tính phần tử">
      {!isAdvanced(node) ? (
        <PropertiesPanel
          id={id}
          node={node as ElementNode}
          index={index}
          count={count}
          onCommand={command}
          onReplace={() => onChoose('image')}
          disabled={disabled}
        />
      ) : (
        <div className={styles.legacyForm}>
          <h3>{node.custom.layerName}</h3>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              command({ type: 'lock', id, value: !node.custom.locked })
            }
          >
            {node.custom.locked ? 'Mở khóa' : 'Khóa phần tử'}
          </button>
          <fieldset
            disabled={disabled || node.custom.locked}
            style={{ border: 0, padding: 0 }}
          >
            <label>
              Nhãn hiển thị
              <input
                key={node.props.content.label}
                defaultValue={node.props.content.label}
                maxLength={120}
                onBlur={(e) => content({ label: e.target.value })}
              />
            </label>
            {['Album', 'Carousel', 'YouTube', 'Contact'].includes(
              node.type.resolvedName,
            ) && (
              <label>
                Trường nội dung cho khách
                <input
                  key={node.props.content.field ?? ''}
                  defaultValue={node.props.content.field ?? ''}
                  placeholder="album, video, contact…"
                  maxLength={60}
                  onBlur={(e) =>
                    content({ field: e.target.value.trim() || null })
                  }
                />
                <small>Để trống để dùng nội dung cố định của mẫu.</small>
              </label>
            )}
            {(node.type.resolvedName === 'Album' ||
              node.type.resolvedName === 'Carousel') && (
              <>
                <button type="button" onClick={() => onChoose('album')}>
                  Thêm ảnh vào album
                </button>
                <ol>
                  {(node.props.content.assetIds ?? []).map((a, i) => (
                    <li key={a + ':' + i}>
                      Ảnh{i + 1}
                      <button
                        type="button"
                        disabled={!i}
                        onClick={() => {
                          const ids = [...(node.props.content.assetIds ?? [])];
                          [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                          content({ assetIds: ids });
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          content({
                            assetIds: (
                              node.props.content.assetIds ?? []
                            ).filter((_, j) => j !== i),
                          })
                        }
                      >
                        Bỏ
                      </button>
                    </li>
                  ))}
                </ol>
                {node.type.resolvedName === 'Carousel' && (
                  <>
                    <label>
                      Hiệu ứng chuyển ảnh
                      <select
                        value={node.props.content.transition ?? ''}
                        onChange={(e) =>
                          content({ transition: e.target.value || undefined })
                        }
                      >
                        <option value="">Không</option>
                        <option value="zoom">Zoom</option>
                        <option value="switch">Switch</option>
                        <option value="overlap">Overlap</option>
                        <option value="fade">Fade</option>
                      </select>
                    </label>
                    <NumberProperty
                      label="Thời gian chuyển (s)"
                      min={0.2}
                      max={10}
                      step={0.1}
                      value={node.props.content.durationSec ?? 1.5}
                      onChange={(durationSec) => content({ durationSec })}
                    />
                    <NumberProperty
                      label="Độ trễ (s)"
                      min={0}
                      max={10}
                      step={0.1}
                      value={node.props.content.delaySec ?? 0}
                      onChange={(delaySec) => content({ delaySec })}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={node.props.content.autoplay ?? false}
                        onChange={(e) =>
                          content({ autoplay: e.target.checked })
                        }
                      />
                      Tự động chạy (khách có thể tạm dừng)
                    </label>
                  </>
                )}
              </>
            )}
            {node.type.resolvedName === 'YouTube' && (
              <>
                <label>
                  Mã video YouTube
                  <input
                    key={node.props.content.videoId}
                    defaultValue={node.props.content.videoId}
                    maxLength={11}
                    onBlur={(e) => content({ videoId: e.target.value.trim() })}
                  />
                </label>
                <button type="button" onClick={() => onChoose('poster')}>
                  Chọn poster
                </button>
              </>
            )}
            {node.type.resolvedName === 'Contact' && (
              <label>
                Số điện thoại
                <input
                  type="tel"
                  key={node.props.content.phone}
                  defaultValue={node.props.content.phone}
                  maxLength={30}
                  onBlur={(e) => content({ phone: e.target.value })}
                />
              </label>
            )}
            {node.type.resolvedName === 'Contact' && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={node.props.content.showIcon !== false}
                    onChange={(e) => content({ showIcon: e.target.checked })}
                  />
                  Hiển thị biểu tượng điện thoại
                </label>
                <ColorField
                  label="Màu nút"
                  value={node.props.content.buttonColor ?? '#FFFFFFFF'}
                  onPick={(buttonColor) => content({ buttonColor })}
                />
                <ColorField
                  label="Màu chữ"
                  value={node.props.content.textColor ?? '#000000FF'}
                  onPick={(textColor) => content({ textColor })}
                />
              </>
            )}
            {node.type.resolvedName === 'Reminder' && (
              <>
                <label>
                  Mô tả sự kiện
                  <textarea
                    key={node.props.content.description ?? ''}
                    defaultValue={node.props.content.description ?? ''}
                    maxLength={500}
                    onBlur={(e) => content({ description: e.target.value })}
                  />
                </label>
                <label>
                  Địa điểm
                  <input
                    key={node.props.content.location ?? ''}
                    defaultValue={node.props.content.location ?? ''}
                    maxLength={200}
                    placeholder="Để trống để dùng địa chỉ của sự kiện"
                    onBlur={(e) => content({ location: e.target.value })}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={node.props.content.allDay ?? false}
                    onChange={(e) => content({ allDay: e.target.checked })}
                  />
                  Sự kiện cả ngày
                </label>
              </>
            )}
            {node.type.resolvedName === 'Reminder' && (
              <label>
                Sự kiện
                <select
                  value={node.props.content.eventKey}
                  onChange={(e) => content({ eventKey: e.target.value })}
                >
                  {['ceremony', 'reception', 'engagement', 'afterParty'].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
            )}
            {node.type.resolvedName === 'CustomForm' && (
              <FormComposer
                fields={node.props.content.fields ?? []}
                onChange={(fields) => content({ fields })}
              />
            )}
            <label>
              <input
                type="checkbox"
                checked={node.custom.optional}
                onChange={(e) =>
                  command({ type: 'optional', id, value: e.target.checked })
                }
              />
              Phần tùy chọn khi thiếu dữ liệu
            </label>
          </fieldset>
        </div>
      )}
      <fieldset
        disabled={disabled || node.custom.locked}
        className={styles.fieldset}
      >
        {(node.type.resolvedName === 'Image' ||
          node.type.resolvedName === 'Decoration') && (
          <PropertySection title="Cắt & tạo hình">
            <FieldRow label="Lật ngang">
              <input
                type="checkbox"
                aria-label="Lật ngang"
                checked={!!options.flipX}
                onChange={(e) => option({ flipX: e.target.checked })}
              />
            </FieldRow>
            <FieldRow label="Lật dọc">
              <input
                type="checkbox"
                aria-label="Lật dọc"
                checked={!!options.flipY}
                onChange={(e) => option({ flipY: e.target.checked })}
              />
            </FieldRow>
            <FieldRow label="Khung ảnh">
              <select
                value={options.mask ?? 'none'}
                onChange={(e) =>
                  option({ mask: e.target.value as NodeOptions['mask'] })
                }
              >
                {[
                  ['none', 'Gốc'],
                  ['circle', 'Tròn'],
                  ['arch', 'Vòm'],
                  ['heart', 'Trái tim'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="Cắt ảnh không phá bản gốc">
              <input
                type="checkbox"
                aria-label="Cắt ảnh không phá bản gốc"
                checked={!!options.crop}
                onChange={(e) =>
                  option(
                    e.target.checked
                      ? { crop: { x: 0, y: 0, width: 1, height: 1 } }
                      : { crop: undefined },
                  )
                }
              />
            </FieldRow>
            {options.crop &&
              (
                [
                  ['x', 'Cắt trái (0–1)'],
                  ['y', 'Cắt trên (0–1)'],
                  ['width', 'Cắt rộng (0–1)'],
                  ['height', 'Cắt cao (0–1)'],
                ] as const
              ).map(([k, label]) => (
                <NumberRow
                  key={k}
                  label={label}
                  value={options.crop![k]}
                  min={k === 'width' || k === 'height' ? 0.01 : 0}
                  max={1}
                  step={0.01}
                  onChange={(v) =>
                    option({ crop: { ...options.crop!, [k]: v } })
                  }
                />
              ))}
          </PropertySection>
        )}
        {['Text', 'Image', 'Decoration', 'Shape'].includes(
          node.type.resolvedName,
        ) && (
          <ClickActionControls
            id={id}
            options={options}
            targets={targets}
            onChange={option}
            onPickTarget={onPickTarget}
            onLocateTarget={onLocateTarget}
          />
        )}
        <MotionControls options={options} onChange={option} />
      </fieldset>
    </section>
  );
}
function FormComposer({
  fields,
  onChange,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
}) {
  const update = (i: number, patch: Partial<CustomField>) =>
    onChange(fields.map((f, j) => (i === j ? { ...f, ...patch } : f)));
  return (
    <section>
      <h3>Trường biểu mẫu</h3>
      {fields.map((f, i) => (
        <fieldset key={f.id}>
          <label>
            Nhãn
            <input
              key={f.label}
              defaultValue={f.label}
              maxLength={120}
              onBlur={(e) => update(i, { label: e.target.value })}
            />
          </label>
          <label>
            Loại
            <select
              value={f.type}
              onChange={(e) =>
                update(i, {
                  type: e.target.value as CustomField['type'],
                  options: ['select', 'multiselect'].includes(e.target.value)
                    ? f.options.length
                      ? f.options
                      : ['Có', 'Không']
                    : [],
                })
              }
            >
              {[
                'text',
                'textarea',
                'email',
                'tel',
                'number',
                'date',
                'select',
                'multiselect',
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => update(i, { required: e.target.checked })}
            />
            Bắt buộc
          </label>
          {['select', 'multiselect'].includes(f.type) && (
            <label>
              Mỗi lựa chọn một dòng
              <textarea
                key={f.options.join('\n')}
                defaultValue={f.options.join('\n')}
                onBlur={(e) =>
                  update(i, {
                    options: e.target.value
                      .split('\n')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
          >
            Xóa trường
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={fields.length >= 20}
        onClick={() =>
          onChange([
            ...fields,
            {
              id: 'field_' + crypto.randomUUID().slice(0, 8),
              label: 'Trường mới',
              type: 'text',
              required: false,
              options: [],
            },
          ])
        }
      >
        Thêm trường
      </button>
    </section>
  );
}
const PAGE_ANIMATIONS = [
  ['none', 'Không', 'Giữ nguyên, không hiệu ứng'],
  ['fade-all', 'Mờ dần toàn bộ', 'Mọi phần tử hiện dần'],
  ['slide-all', 'Trượt lên toàn bộ', 'Mọi phần tử trượt từ dưới lên'],
  ['scale-all', 'Phóng to toàn bộ', 'Mọi phần tử phóng to khi hiện'],
  ['flip-all', 'Lật toàn bộ', 'Mọi phần tử lật khi hiện'],
  ['slide-mix', 'Trượt lên xen kẽ', 'Trượt và mờ dần xen kẽ'],
  ['fade-mix', 'Mờ dần xen kẽ', 'Mờ dần và phóng to xen kẽ'],
] as const;
const PARTICLES = [
  ['none', 'Không'],
  ['petals', 'Cánh hoa'],
  ['hearts', 'Trái tim'],
] as const;
export function EditorSettingsPanel({
  document,
  onChange,
  onShareImage,
  view = 'settings',
}: {
  document: EditorDocument;
  onChange: (value: EditorDocument['settings']) => void;
  onShareImage: () => void;
  /** `effects` = motion presets; `settings` = sharing, language, toolbar, background. */
  view?: 'effects' | 'settings';
}) {
  const s = document.settings,
    update = (value: Partial<typeof s>) => onChange({ ...s, ...value });
  if (view === 'effects')
    return (
      <section aria-label="Hiệu ứng thiệp" className={styles.legacyForm}>
        <p className={styles.hint}>
          Hiệu ứng áp dụng khi khách mở thiệp; tự tắt nếu thiết bị bật giảm
          chuyển động.
        </p>
        <h3>Hiệu ứng động toàn trang</h3>
        <div
          role="radiogroup"
          aria-label="Hiệu ứng động toàn trang"
          className={styles.optionList}
        >
          {PAGE_ANIMATIONS.map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={(s.pageAnimation ?? 'none') === value}
              onClick={() => update({ pageAnimation: value })}
            >
              <strong>{label}</strong>
              <span>{hint}</span>
            </button>
          ))}
        </div>
        <small>
          Áp dụng cho phần tử chưa tự chọn hiệu ứng xuất hiện riêng.
        </small>
        <h3>Hiệu ứng mở màn</h3>
        <label>
          <input
            type="checkbox"
            checked={s.envelope}
            onChange={(e) => update({ envelope: e.target.checked })}
          />
          Mở bằng phong bì
        </label>
        <h3>Hiệu ứng rơi</h3>
        <div
          role="radiogroup"
          aria-label="Hiệu ứng rơi"
          className={styles.optionList}
        >
          {PARTICLES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={s.particles === value}
              onClick={() => update({ particles: value })}
            >
              <strong>{label}</strong>
            </button>
          ))}
        </div>
      </section>
    );
  return (
    <section aria-label="Cài đặt thiệp" className={styles.legacyForm}>
      <h3>Chia sẻ</h3>
      <label>
        Tiêu đề
        <input
          maxLength={120}
          value={s.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </label>
      <label>
        Mô tả
        <textarea
          maxLength={500}
          value={s.description}
          onChange={(e) => update({ description: e.target.value })}
        />
      </label>
      <button type="button" onClick={onShareImage}>
        Chọn ảnh chia sẻ
      </button>
      <h3>Ngôn ngữ & cuộn trang</h3>
      <label>
        Ngôn ngữ nhãn
        <select
          value={s.locale}
          onChange={(e) => update({ locale: e.target.value as 'vi' | 'en' })}
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </label>
      <NumberProperty
        label="Tự cuộn (px/giây,0=tắt)"
        value={s.autoScroll}
        min={0}
        max={100}
        onChange={(autoScroll) => update({ autoScroll })}
      />
      <h3>Thanh tiện ích</h3>
      {(
        [
          ['wishes', 'Lời chúc'],
          ['likes', 'Lượt thích'],
          ['gift', 'QR mừng cưới'],
          ['share', 'Chia sẻ'],
        ] as const
      ).map(([k, l]) => (
        <label key={k}>
          <input
            type="checkbox"
            checked={s.toolbar[k]}
            onChange={(e) =>
              update({ toolbar: { ...s.toolbar, [k]: e.target.checked } })
            }
          />
          {l}
        </label>
      ))}
      <h3>Nền chuyển màu</h3>
      <label>
        <input
          type="checkbox"
          checked={!!s.gradient}
          onChange={(e) =>
            update({
              gradient: e.target.checked
                ? { from: '#FDFBF7FF', to: '#F1EAE0FF', angle: 180 }
                : null,
            })
          }
        />
        Dùng gradient
      </label>
      {s.gradient && (
        <>
          <ColorField
            label="Màu đầu"
            value={s.gradient.from}
            onPick={(from) => update({ gradient: { ...s.gradient!, from } })}
          />
          <ColorField
            label="Màu cuối"
            value={s.gradient.to}
            onPick={(to) => update({ gradient: { ...s.gradient!, to } })}
          />
          <NumberProperty
            label="Góc gradient"
            min={0}
            max={360}
            value={s.gradient.angle}
            onChange={(angle) =>
              update({ gradient: { ...s.gradient!, angle } })
            }
          />
        </>
      )}
    </section>
  );
}
