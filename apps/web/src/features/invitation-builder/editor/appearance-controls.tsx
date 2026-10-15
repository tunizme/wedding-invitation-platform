'use client';
import { useEffect, useRef, useState } from 'react';
import { Link2, Unlink } from 'lucide-react';
import type { Appearance, Padding, Shadow, TextStyle } from '../document/types';
import {
  ColorField,
  NumberControl,
  RangeNumber,
  SwitchRow,
} from './property-controls';
import styles from './property-controls.module.css';

export function PaddingControl({
  value,
  onChange,
  defaultLinked = false,
  max = 100,
  emptyValue,
}: {
  value: Padding;
  onChange: (value: Padding) => void;
  defaultLinked?: boolean;
  max?: number;
  emptyValue?: number;
}) {
  const [linked, setLinked] = useState(defaultLinked);
  const sides = [
    ['top', 'Trên'],
    ['left', 'Trái'],
    ['right', 'Phải'],
    ['bottom', 'Dưới'],
  ] as const;
  return (
    <>
      <div className={styles.row}>
        <span>Khoảng đệm (Padding)</span>
        <button
          className={styles.linkControl}
          type="button"
          aria-label="Liên kết bốn cạnh khoảng đệm"
          aria-pressed={linked}
          title={
            linked
              ? 'Điều chỉnh riêng từng cạnh'
              : 'Điều chỉnh đồng thời bốn cạnh'
          }
          onClick={() => setLinked(!linked)}
        >
          {linked ? <Link2 size={16} /> : <Unlink size={16} />}
        </button>
      </div>
      <div className={styles.paddingDiagram}>
        {sides.map(([side, name]) => (
          <div
            key={side}
            className={
              styles[
                `padding${name === 'Trên' ? 'Top' : name === 'Dưới' ? 'Bottom' : name === 'Trái' ? 'Left' : 'Right'}`
              ]
            }
          >
            <NumberControl
              label={`Khoảng đệm ${name.toLowerCase()}`}
              value={value[side]}
              max={max}
              emptyValue={emptyValue}
              onChange={(next) =>
                onChange(
                  linked
                    ? { top: next, right: next, bottom: next, left: next }
                    : { ...value, [side]: next },
                )
              }
            />
          </div>
        ))}
        <div className={styles.paddingBlock}>Block</div>
      </div>
    </>
  );
}

/** Horizontal and vertical flip switches shown side by side. */
export function FlipControls({
  flipX,
  flipY,
  onChange,
}: {
  flipX: boolean;
  flipY: boolean;
  onChange: (value: { flipX: boolean; flipY: boolean }) => void;
}) {
  const item = (label: string, checked: boolean, next: () => void) => (
    <span className={styles.flipItem}>
      <span>{label}:</span>
      <button
        type="button"
        className={styles.switch}
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={next}
      >
        <span />
      </button>
    </span>
  );
  return (
    <div className={styles.flipRow}>
      {item('Lật ngang', flipX, () => onChange({ flipX: !flipX, flipY }))}
      {item('Lật dọc', flipY, () => onChange({ flipX, flipY: !flipY }))}
    </div>
  );
}

export function CornerRadiusControl({
  appearance,
  onChange,
}: {
  appearance: Appearance;
  onChange: (value: Partial<Appearance>) => void;
}) {
  const [linked, setLinked] = useState(!appearance.borderRadii);
  const radius = appearance.borderRadius ?? 0;
  const corners = appearance.borderRadii ?? {
    topLeft: radius,
    topRight: radius,
    bottomLeft: radius,
    bottomRight: radius,
  };
  return (
    <>
      <div className={styles.row}>
        <span>Bo góc</span>
        <button
          className={styles.linkControl}
          type="button"
          aria-label="Liên kết bốn góc"
          aria-pressed={linked}
          title={
            linked
              ? 'Điều chỉnh riêng từng góc'
              : 'Điều chỉnh đồng thời bốn góc'
          }
          onClick={() => setLinked(!linked)}
        >
          {linked ? <Link2 size={16} /> : <Unlink size={16} />}
        </button>
      </div>
      <div className={styles.cornerGrid}>
        {(
          [
            ['topLeft', 'trên trái'],
            ['topRight', 'trên phải'],
            ['bottomLeft', 'dưới trái'],
            ['bottomRight', 'dưới phải'],
          ] as const
        ).map(([corner, label]) => (
          <div key={corner}>
            <span
              className={styles.cornerMark}
              data-corner={corner}
              aria-hidden="true"
            />
            <NumberControl
              label={`Bo góc ${label}`}
              value={corners[corner]}
              max={600}
              onChange={(next) =>
                onChange({
                  borderRadii: linked
                    ? {
                        topLeft: next,
                        topRight: next,
                        bottomLeft: next,
                        bottomRight: next,
                      }
                    : { ...corners, [corner]: next },
                })
              }
            />
          </div>
        ))}
      </div>
    </>
  );
}

type ShadowValue = Shadow | NonNullable<TextStyle['textShadow']>;
export function ShadowControls({
  value,
  onChange,
  text = false,
}: {
  value: ShadowValue | null | undefined;
  onChange: (value: ShadowValue | null) => void;
  text?: boolean;
}) {
  const fallback: ShadowValue = {
    offsetX: 0,
    offsetY: 0,
    blur: text ? 5 : 10,
    ...(!text ? { spread: 0 } : {}),
    color: '#00000066',
  };
  const last = useRef(value ?? fallback);
  useEffect(() => {
    if (value) last.current = value;
  }, [value]);
  const prefix = text ? 'Bóng chữ ' : '';
  return (
    <div className={styles.shadowGroup}>
      <SwitchRow
        label={text ? 'Đổ bóng chữ' : 'Đổ bóng'}
        checked={!!value}
        onChange={(enabled) => onChange(enabled ? { ...last.current } : null)}
      />
      {value && (
        <>
          <RangeNumber
            label={`${prefix}Lệch ngang`}
            value={value.offsetX}
            min={-100}
            max={100}
            onChange={(offsetX) => onChange({ ...value, offsetX })}
          />
          <RangeNumber
            label={`${prefix}Lệch dọc`}
            value={value.offsetY}
            min={-100}
            max={100}
            onChange={(offsetY) => onChange({ ...value, offsetY })}
          />
          <RangeNumber
            label={`${prefix}Độ nhòe`}
            value={value.blur}
            max={100}
            onChange={(blur) => onChange({ ...value, blur })}
          />
          {!text && 'spread' in value && (
            <RangeNumber
              label="Độ lan"
              value={value.spread}
              min={-100}
              max={100}
              onChange={(spread) => onChange({ ...value, spread })}
            />
          )}
          <ColorField
            label={text ? 'Màu bóng chữ' : 'Màu bóng'}
            value={value.color}
            onPick={(color) => onChange({ ...value, color })}
          />
        </>
      )}
    </div>
  );
}
