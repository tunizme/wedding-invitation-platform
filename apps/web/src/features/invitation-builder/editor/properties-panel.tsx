'use client';
import { useState, type ReactNode } from 'react';
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
import type { EditorCommand } from './editor-commands';
import { BindingPanel } from './binding-panel';
import { PropertyPopover } from './property-popover';
import {
  PaddingControl,
  CornerRadiusControl,
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

export function PropertiesPanel({
  id,
  node,
  onCommand,
  onReplace,
  disabled,
}: {
  id: string;
  node: ElementNode;
  index: number;
  count: number;
  onCommand: (command: EditorCommand) => void;
  /** Receives the button so the library can return focus to it explicitly. */
  onReplace: (trigger: HTMLElement | null) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState('');
  const command = (value: EditorCommand) => {
    try {
      onCommand(value);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Thuộc tính không hợp lệ.',
      );
    }
  };
  const content = node.props.content,
    appearance = node.props.appearance;
  const isText = 'textStyle' in content;
  const updateText = (value: Partial<TextStyle>) => {
    if ('textStyle' in content)
      command({
        type: 'content',
        id,
        value: { textStyle: { ...content.textStyle, ...value } },
      });
  };
  const setContent = (value: Record<string, unknown>) =>
    command({ type: 'content', id, value });
  const setAppearance = (value: Parameters<typeof command>[0] & object) =>
    command(value);
  const appearanceChange = (
    value: Extract<EditorCommand, { type: 'appearance' }>['value'],
  ) => setAppearance({ type: 'appearance', id, value });
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
  return (
    <section aria-label="Thuộc tính">
      {isText && (
        <p className={styles.hint}>Kích đúp vào văn bản để chỉnh sửa</p>
      )}
      {error && <p role="alert">{error}</p>}
      <fieldset
        disabled={disabled || node.custom.locked}
        className={styles.fieldset}
      >
        {'textStyle' in content && (
          <PropertySection title="Kiểu chữ" defaultOpen>
            <ToggleRow>
              <IconToggle
                label="Đậm"
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
              <select
                value={content.textStyle.fontId}
                onChange={(event) =>
                  updateText({
                    fontId: event.target.value as TextStyle['fontId'],
                  })
                }
              >
                <option value="noto-sans-v1">Noto Sans</option>
                <option value="noto-serif-v1">Noto Serif</option>
              </select>
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
        {'assetId' in content && (
          <PropertySection title="Hình ảnh" defaultOpen>
            <button
              type="button"
              className={styles.wideButton}
              disabled={node.props.bindings.some(
                (binding) => binding.target === 'assetId',
              )}
              onClick={(event) => onReplace(event.currentTarget)}
            >
              Thay ảnh
            </button>
            <FieldRow label="Khớp ảnh">
              <select
                value={content.fit}
                onChange={(event) => setContent({ fit: event.target.value })}
              >
                <option value="cover">Phủ kín</option>
                <option value="contain">Vừa khung</option>
              </select>
            </FieldRow>
            <NumberRow
              label="Căn ảnh ngang"
              value={content.positionX}
              onChange={(positionX) => setContent({ positionX })}
            />
            <NumberRow
              label="Căn ảnh dọc"
              value={content.positionY}
              onChange={(positionY) => setContent({ positionY })}
            />
          </PropertySection>
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
        {kind === 'Calendar' && 'accentColor' in content && (
          <PropertySection title="Lịch" defaultOpen>
            <FieldRow label="Kiểu lịch">
              <select
                value={('variant' in content && content.variant) || 'classic'}
                onChange={(event) =>
                  setContent({ variant: event.target.value })
                }
              >
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
            <FieldRow label="Hướng hiển thị">
              <select
                value={('layout' in content && content.layout) || 'horizontal'}
                onChange={(event) => setContent({ layout: event.target.value })}
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
        {kind === 'Map' && 'label' in content && (
          <PropertySection title="Bản đồ" defaultOpen>
            {textField('Nhãn bản đồ', content.label, 'label')}
          </PropertySection>
        )}
        {kind === 'RSVP' && 'title' in content && (
          <PropertySection title="Xác nhận tham dự" defaultOpen>
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
          <PropertySection title="Màu sắc">
            {appearance.background?.kind === 'solid' && (
              <ColorField
                label="Màu nền"
                value={appearance.background.color}
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
        {appearance.padding && (
          <PropertySection title="Khoảng đệm">
            <PaddingControl
              value={appearance.padding}
              onChange={(padding) => appearanceChange({ padding })}
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
          {'textStyle' in content && (
            <ShadowControls
              text
              value={content.textStyle.textShadow}
              onChange={(shadow) =>
                updateText({ textShadow: shadow ?? undefined })
              }
            />
          )}
        </PropertySection>
        <PropertySection title="Liên kết dữ liệu">
          <div className={styles.bindingSettings}>
            <BindingPanel
              id={id}
              node={node}
              onCommand={command}
              disabled={disabled}
            />
          </div>
        </PropertySection>
      </fieldset>
    </section>
  );
}
