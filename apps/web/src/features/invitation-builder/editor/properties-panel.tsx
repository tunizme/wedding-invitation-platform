'use client';
import { DirectWidgetControls } from './direct-widget-controls';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Underline,
  ArrowLeftRight,
  ArrowUpDown,
} from 'lucide-react';
import type { ContentByKind, ElementNode, TextStyle } from '../document/types';
import type { NodeOptions } from '../document/editor-document';
import type { DocumentCommand } from './editor-commands';
import type { CropResult } from './image-crop-dialog';
import { FontPicker } from './font-picker';
import { getInvitationFont, supportsFontFace } from '../document/font-catalog';
import { loadInvitationFontFace } from '../renderer/font-registry';
import { CalendarWidget } from '../renderer/widgets/calendar';
import { MediaHeader } from './media-properties';
import { PropertyPopover } from './property-popover';
import {
  PaddingControl,
  CornerRadiusControl,
  FlipControls,
  ShadowControls,
} from './appearance-controls';
import {
  ColorField,
  FieldRow,
  IconToggle,
  NumberRow,
  NumberControl,
  RangeNumber,
  PropertySection,
  Segmented,
  SliderRow,
  Stepper,
  ToggleRow,
} from './property-controls';
import styles from './property-controls.module.css';

const SHAPES = [
  ['rectangle', 'Hình chữ nhật'],
  ['ellipse', 'Hình tròn'],
  ['triangle', 'Tam giác'],
  ['line', 'Đường kẻ'],
] as const;

const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

/** Drops cleared keys: undefined is not valid in document JSON. */
function definedOptions(value: NodeOptions): NodeOptions {
  const next = { ...value };
  for (const key of Object.keys(next) as (keyof NodeOptions)[])
    if (next[key] === undefined) delete next[key];
  return next;
}

export function PropertiesPanel({
  id,
  node,
  options,
  assetUrls,
  onCommand,
  onReplace,
  disabled,
}: {
  id: string;
  node: ElementNode;
  options: NodeOptions;
  assetUrls: Record<string, string>;
  index: number;
  count: number;
  onCommand: (command: DocumentCommand) => void;
  /** Receives the button so the library can return focus to it explicitly. */
  onReplace: (trigger: HTMLElement | null) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState('');
  const [loadingFont, setLoadingFont] = useState(false);
  const fontRequest = useRef(0);
  useEffect(
    () => () => {
      fontRequest.current++;
    },
    [],
  );
  const command = (value: DocumentCommand): boolean => {
    try {
      onCommand(value);
      setError('');
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Thuộc tính không hợp lệ.',
      );
      return false;
    }
  };
  const content = node.props.content,
    appearance = node.props.appearance;
  const isText = 'textStyle' in content;
  const updateText = (value: Partial<TextStyle>) => {
    if ('textStyle' in content) {
      // Khóa optional được tắt phải bị xóa; giá trị undefined không hợp lệ với document JSON.
      const textStyle = { ...content.textStyle, ...value };
      for (const key of Object.keys(textStyle) as (keyof TextStyle)[])
        if (textStyle[key] === undefined) delete textStyle[key];
      if (value.fontId || value.fontWeight || value.italic !== undefined) {
        const request = ++fontRequest.current;
        setLoadingFont(true);
        void loadInvitationFontFace(globalThis.document, textStyle)
          .then(() => {
            if (request !== fontRequest.current) return;
            command({ type: 'content', id, value: { textStyle } });
          })
          .catch(() => {
            if (request === fontRequest.current)
              setError('Không tải được phông chữ. Vui lòng chọn lại.');
          })
          .finally(() => {
            if (request === fontRequest.current) setLoadingFont(false);
          });
      } else command({ type: 'content', id, value: { textStyle } });
    }
  };
  const setContent = (value: Record<string, unknown>) =>
    command({ type: 'content', id, value });
  const appearanceChange = (
    value: Extract<DocumentCommand, { type: 'appearance' }>['value'],
  ) => command({ type: 'appearance', id, value });
  const setFlip = (flip: { flipX: boolean; flipY: boolean }) =>
    command({ type: 'options', id, value: { ...options, ...flip } });
  // Confirming a crop resizes the frame to the crop ratio, keeping its width.
  const applyCrop = (result: CropResult) =>
    command({
      type: 'crop',
      id,
      options: definedOptions({
        ...options,
        crop: result.crop,
        cropAspect: result.cropAspect,
        mask: result.mask,
      }),
      box: {
        height:
          Math.round((node.props.box.width / result.pixelAspect) * 100) / 100,
      },
    });
  // Single-line text input used by the widget content settings.
  const textField = (label: string, value: string, key: string): ReactNode => (
    <FieldRow label={label}>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => setContent({ [key]: event.target.value })}
      />
    </FieldRow>
  );
  const kind = node.type.resolvedName;
  const isMedia = kind === 'Image' || kind === 'Decoration';
  return (
    <section aria-label="Thuộc tính">
      {isText && (
        <p className={styles.hint}>Kích đúp vào văn bản để chỉnh sửa</p>
      )}
      {error && <p role="alert">{error}</p>}
      <fieldset
        disabled={disabled || node.custom.locked || loadingFont}
        className={styles.fieldset}
      >
        {kind !== 'Map' && 'textStyle' in content && (
          <PropertySection title="Kiểu chữ" defaultOpen>
            <ToggleRow>
              <IconToggle
                label="Đậm"
                disabled={
                  !supportsFontFace(
                    content.textStyle.fontId,
                    700,
                    content.textStyle.italic,
                  )
                }
                pressed={content.textStyle.fontWeight === 700}
                onClick={() =>
                  updateText({
                    fontWeight:
                      content.textStyle.fontWeight === 700 ? 400 : 700,
                  })
                }
              >
                <Bold size={18} />
              </IconToggle>
              <IconToggle
                label="Nghiêng"
                disabled={
                  !supportsFontFace(
                    content.textStyle.fontId,
                    content.textStyle.fontWeight,
                    true,
                  )
                }
                pressed={content.textStyle.italic}
                onClick={() =>
                  updateText({ italic: !content.textStyle.italic })
                }
              >
                <Italic size={18} />
              </IconToggle>
              <IconToggle
                label="Gạch ngang"
                pressed={content.textStyle.strike ?? false}
                onClick={() =>
                  updateText({ strike: !(content.textStyle.strike ?? false) })
                }
              >
                <Strikethrough size={18} />
              </IconToggle>
              <IconToggle
                label="Gạch chân"
                pressed={content.textStyle.underline}
                onClick={() =>
                  updateText({ underline: !content.textStyle.underline })
                }
              >
                <Underline size={18} />
              </IconToggle>
              <IconToggle
                label="Chữ hoa"
                pressed={content.textStyle.textTransform === 'uppercase'}
                onClick={() =>
                  updateText({
                    textTransform:
                      content.textStyle.textTransform === 'uppercase'
                        ? 'none'
                        : 'uppercase',
                  })
                }
              >
                Aa
              </IconToggle>
              <PropertyPopover
                label="Giãn ký tự"
                trigger={<ArrowLeftRight size={18} />}
                pressed={content.textStyle.letterSpacing !== 0}
              >
                <RangeNumber
                  label="Giãn ký tự"
                  value={content.textStyle.letterSpacing}
                  min={0}
                  max={100}
                  onChange={(letterSpacing) => updateText({ letterSpacing })}
                />
              </PropertyPopover>
              <PropertyPopover
                label="Giãn dòng"
                trigger={<ArrowUpDown size={18} />}
                pressed={content.textStyle.lineHeight !== 1.2}
              >
                <RangeNumber
                  label="Giãn dòng"
                  value={content.textStyle.lineHeight}
                  min={0.5}
                  max={2.5}
                  step={0.01}
                  onChange={(lineHeight) => updateText({ lineHeight })}
                />
              </PropertyPopover>
            </ToggleRow>
            <Segmented<TextStyle['textAlign']>
              label="Căn chỉnh"
              value={content.textStyle.textAlign}
              onChange={(textAlign) => updateText({ textAlign })}
              options={[
                {
                  value: 'left',
                  label: 'Căn trái',
                  icon: <AlignLeft size={16} />,
                },
                {
                  value: 'center',
                  label: 'Căn giữa',
                  icon: <AlignCenter size={16} />,
                },
                {
                  value: 'right',
                  label: 'Căn phải',
                  icon: <AlignRight size={16} />,
                },
                {
                  value: 'justify',
                  label: 'Căn đều',
                  icon: <AlignJustify size={16} />,
                },
              ]}
            />
            <Stepper
              label="Cỡ chữ"
              value={content.textStyle.fontSize}
              min={8}
              max={160}
              onChange={(fontSize) => updateText({ fontSize })}
            />
            <FieldRow label="Phông chữ">
              <FontPicker
                value={content.textStyle.fontId}
                disabled={disabled || node.custom.locked || loadingFont}
                loading={loadingFont}
                onChange={(fontId) => {
                  const font = getInvitationFont(fontId);
                  updateText({
                    fontId,
                    fontWeight: font.weights.includes(
                      content.textStyle.fontWeight,
                    )
                      ? content.textStyle.fontWeight
                      : 400,
                    italic:
                      font.styles.includes('italic') &&
                      content.textStyle.italic,
                  });
                }}
              />
            </FieldRow>
            <div className={styles.colorPair}>
              <ColorField
                compact
                label="Màu chữ"
                value={content.textStyle.color}
                onPick={(color) => updateText({ color })}
              />
              {appearance.background?.kind === 'solid' && (
                <ColorField
                  compact
                  label="Màu nền"
                  value={appearance.background.color}
                  onPick={(color) =>
                    appearanceChange({ background: { kind: 'solid', color } })
                  }
                />
              )}
            </div>
            <SliderRow
              label="Trong suốt"
              value={appearance.opacity}
              onChange={(opacity) => appearanceChange({ opacity })}
            />
          </PropertySection>
        )}
        {isMedia && 'assetId' in content && (
          <MediaHeader
            kind={kind}
            source={content.assetId ? assetUrls[content.assetId] : undefined}
            options={options}
            disabled={disabled || node.custom.locked || loadingFont}
            replaceDisabled={false}
            onReplace={onReplace}
            onCrop={applyCrop}
          />
        )}
        {'primitive' in content && (
          <PropertySection title="Hình dạng" defaultOpen>
            <FieldRow label="Loại hình">
              <select
                value={content.primitive}
                onChange={(event) =>
                  setContent({ primitive: event.target.value })
                }
              >
                {SHAPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FieldRow>
            <ColorField
              label="Màu hình"
              value={content.fill}
              onPick={(fill) => setContent({ fill })}
            />
          </PropertySection>
        )}
        <DirectWidgetControls node={node} onChange={setContent} />
        {kind === 'Calendar' && 'accentColor' in content && (
          <PropertySection title="Tùy chỉnh lịch" defaultOpen>
            <div
              className={styles.calendarTemplates}
              role="group"
              aria-label="Mẫu lịch"
            >
              {(
                [
                  ['plain', 'No Style'],
                  ['ribbon', 'Kiểu 1'],
                  ['notebook', 'Kiểu 2'],
                ] as const
              ).map(([variant, label]) => (
                <button
                  type="button"
                  key={variant}
                  aria-pressed={
                    (content as ContentByKind['Calendar']).variant === variant
                  }
                  onClick={() => setContent({ variant })}
                >
                  <span className={styles.calendarThumbnail} aria-hidden="true">
                    <CalendarWidget
                      datetime="2026-10-14T10:00:00+07:00"
                      timeZone="Asia/Ho_Chi_Minh"
                      variant={variant}
                      accentColor={content.accentColor}
                    />
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <FieldRow label="Kiểu lịch">
              <select
                value={('variant' in content && content.variant) || 'classic'}
                onChange={(event) =>
                  setContent({ variant: event.target.value })
                }
              >
                <option value="plain">No Style</option>
                <option value="ribbon">Kiểu 1</option>
                <option value="notebook">Kiểu 2</option>
                <option value="classic">Tô nền ngày</option>
                <option value="minimal">Vòng quanh ngày</option>
                <option value="filled">Ngày hình tròn</option>
              </select>
            </FieldRow>
            <ColorField
              label="Màu nhấn"
              value={content.accentColor}
              onPick={(accentColor) => setContent({ accentColor })}
            />
          </PropertySection>
        )}
        {kind === 'Timeline' && 'accentColor' in content && (
          <PropertySection title="Dòng thời gian" defaultOpen>
            <ColorField
              label="Màu nhấn"
              value={content.accentColor}
              onPick={(accentColor) => setContent({ accentColor })}
            />
          </PropertySection>
        )}
        {kind === 'Countdown' && 'label' in content && (
          <PropertySection title="Đếm ngược" defaultOpen>
            {(content as ContentByKind['Countdown']).design !== 'boxed' && (
              <button
                type="button"
                onClick={() =>
                  setContent({
                    design: 'boxed',
                    frameColor: '#000000FF',
                    textStyle: { ...content.textStyle, color: '#FFFFFFFF' },
                  })
                }
              >
                Dùng mẫu khung số
              </button>
            )}
            <FieldRow label="Hướng hiển thị">
              <select
                value={('layout' in content && content.layout) || 'horizontal'}
                onChange={(event) => {
                  const layout = event.target.value;
                  const vertical =
                    (content as ContentByKind['Countdown']).layout ===
                    'vertical';
                  const box = node.props.box;
                  command({
                    type: 'content',
                    id,
                    value: { layout },
                    ...((content as ContentByKind['Countdown']).design ===
                      'boxed' && (layout === 'vertical') !== vertical
                      ? { box: { width: box.height, height: box.width } }
                      : {}),
                  });
                }}
              >
                <option value="horizontal">Ngang</option>
                <option value="vertical">Dọc</option>
              </select>
            </FieldRow>
            <NumberRow
              label="Khoảng cách (px)"
              min={0}
              max={40}
              value={('gap' in content ? content.gap : undefined) ?? 4}
              onChange={(gap) => setContent({ gap })}
            />
            <ColorField
              label="Màu khung"
              value={
                ('frameColor' in content && content.frameColor) || '#00000000'
              }
              onPick={(frameColor) => setContent({ frameColor })}
            />
            {textField('Nhãn đếm ngược', content.label, 'label')}
            {textField(
              'Nhãn kết thúc',
              (content as ContentByKind['Countdown']).endedLabel,
              'endedLabel',
            )}
          </PropertySection>
        )}
        {kind === 'RSVP' && 'title' in content && (
          <PropertySection title="Cài đặt biểu mẫu" defaultOpen>
            {content.design !== 'invitation' && (
              <button
                type="button"
                onClick={() => setContent({ design: 'invitation' })}
              >
                Dùng mẫu thiệp mời
              </button>
            )}
            {content.design === 'invitation' && (
              <>
                {textField(
                  'Nhãn xác nhận tham dự',
                  content.attendanceLabel ?? '',
                  'attendanceLabel',
                )}
                <ColorField
                  label="Màu viền input"
                  value={content.inputBorderColor ?? '#DEDEDEFF'}
                  onPick={(inputBorderColor) =>
                    setContent({ inputBorderColor })
                  }
                />
              </>
            )}
            {textField(
              'Nhãn trường tên',
              ('nameLabel' in content && content.nameLabel) || '',
              'nameLabel',
            )}
            {textField(
              'Nội dung nút gửi',
              ('submitLabel' in content && content.submitLabel) || '',
              'submitLabel',
            )}
            <ColorField
              label="Màu nút gửi"
              value={
                ('buttonColor' in content && content.buttonColor) || '#00000000'
              }
              onPick={(buttonColor) => setContent({ buttonColor })}
            />
            <ColorField
              label="Màu chữ nút gửi"
              value={
                ('buttonTextColor' in content && content.buttonTextColor) ||
                '#000000FF'
              }
              onPick={(buttonTextColor) => setContent({ buttonTextColor })}
            />
            {textField('Tiêu đề RSVP', content.title, 'title')}
            {textField('Nhãn đóng RSVP', content.closedLabel, 'closedLabel')}
            {textField(
              'Nhãn RSVP thành công',
              content.successLabel,
              'successLabel',
            )}
          </PropertySection>
        )}
        {kind === 'QRBank' && 'label' in content && (
          <PropertySection title="QR mừng cưới" defaultOpen>
            {textField('Nhãn QR ngân hàng', content.label, 'label')}
          </PropertySection>
        )}
        {!isText && (
          <PropertySection title="Màu sắc" defaultOpen={kind === 'Decoration'}>
            {(appearance.background?.kind === 'solid' || isMedia) && (
              <ColorField
                label="Màu nền"
                value={
                  appearance.background?.kind === 'solid'
                    ? appearance.background.color
                    : '#FFFFFF00'
                }
                onPick={(color) =>
                  appearanceChange({ background: { kind: 'solid', color } })
                }
              />
            )}
            <SliderRow
              label="Trong suốt"
              value={appearance.opacity}
              onChange={(opacity) => appearanceChange({ opacity })}
            />
          </PropertySection>
        )}
        {(appearance.padding || kind === 'Image') && (
          <PropertySection title="Khoảng đệm">
            <PaddingControl
              value={appearance.padding ?? NO_PADDING}
              defaultLinked={kind === 'Image'}
              emptyValue={kind === 'Image' ? 0 : undefined}
              onChange={(padding) => appearanceChange({ padding })}
            />
            {kind === 'Image' && (
              <FlipControls
                flipX={!!options.flipX}
                flipY={!!options.flipY}
                onChange={setFlip}
              />
            )}
          </PropertySection>
        )}
        {kind === 'Decoration' && (
          <PropertySection title="Đối xứng">
            <FlipControls
              flipX={!!options.flipX}
              flipY={!!options.flipY}
              onChange={setFlip}
            />
          </PropertySection>
        )}
        <PropertySection title="Đường viền">
          <div className={styles.colorPair}>
            <div className={styles.compactColor}>
              <span>Size:</span>
              <NumberControl
                label="Độ dày viền"
                value={appearance.border.width}
                max={20}
                onChange={(width) =>
                  appearanceChange({ border: { ...appearance.border, width } })
                }
              />
            </div>
            <ColorField
              compact
              label="Màu viền"
              value={appearance.border.color}
              onPick={(color) =>
                appearanceChange({ border: { ...appearance.border, color } })
              }
            />
          </div>
          <FieldRow label="Kiểu viền">
            <select
              value={appearance.border.style}
              onChange={(event) =>
                appearanceChange({
                  border: {
                    ...appearance.border,
                    style: event.target.value as
                      'solid' | 'dashed' | 'dotted' | 'double',
                  },
                })
              }
            >
              <option value="solid">Nét liền</option>
              <option value="dashed">Nét đứt</option>
              <option value="dotted">Chấm tròn</option>
              <option value="double">Viền đôi</option>
            </select>
          </FieldRow>
          <FieldRow label="Vị trí viền">
            <select
              value={appearance.border.position ?? 'all'}
              onChange={(event) =>
                appearanceChange({
                  border: {
                    ...appearance.border,
                    position: event.target.value as NonNullable<
                      typeof appearance.border.position
                    >,
                  },
                })
              }
            >
              <option value="all">Toàn bộ</option>
              <option value="top">Cạnh trên</option>
              <option value="bottom">Cạnh dưới</option>
              <option value="left">Cạnh trái</option>
              <option value="right">Cạnh phải</option>
              <option value="vertical">Trên và dưới</option>
              <option value="horizontal">Trái và phải</option>
              <option value="top-left">Trên trái</option>
              <option value="top-right">Trên phải</option>
              <option value="bottom-left">Dưới trái</option>
              <option value="bottom-right">Dưới phải</option>
            </select>
          </FieldRow>
          {appearance.borderRadius !== undefined && (
            <CornerRadiusControl
              appearance={appearance}
              onChange={appearanceChange}
            />
          )}
        </PropertySection>
        <PropertySection title="Đổ bóng">
          <ShadowControls
            value={appearance.shadow}
            onChange={(shadow) =>
              appearanceChange({ shadow: shadow as typeof appearance.shadow })
            }
          />
          {kind !== 'Map' && 'textStyle' in content && (
            <ShadowControls
              text
              value={content.textStyle.textShadow}
              onChange={(shadow) =>
                updateText({ textShadow: shadow ?? undefined })
              }
            />
          )}
        </PropertySection>
      </fieldset>
    </section>
  );
}
