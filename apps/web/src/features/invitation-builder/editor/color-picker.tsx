'use client';
import { useState } from 'react';
import { PropertyPopover } from './property-popover';
import { hexToHsva, hsvaToHex, type Hsva } from './color-utils';
import styles from './property-controls.module.css';

const palette = [
  '#000000',
  '#FFFFFF',
  '#64748B',
  '#DC2626',
  '#F97316',
  '#FBBF24',
  '#16A34A',
  '#06B6D4',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#E7C7CF',
];
export function ColorPicker({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => ({
    value: value.toUpperCase(),
    color: hexToHsva(value),
  }));
  const color =
    draft.value === value.toUpperCase() ? draft.color : hexToHsva(value);
  const setColor = (next: Hsva) =>
    setDraft({ value: hsvaToHex(next), color: next });
  const update = (patch: Partial<Hsva>) => {
    const next = { ...color, ...patch };
    setColor(next);
    onPick(hsvaToHex(next));
  };
  const pickPlane = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    update({
      a: color.a || 1,
      s: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      v: 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    });
  };
  return (
    <PropertyPopover
      label={`Chọn ${label.toLowerCase()}`}
      trigger={<span style={{ background: value }} />}
      className={styles.colorSwatch}
      width={240}
    >
      <div className={styles.colorPicker}>
        <strong>{label}</strong>
        <div
          className={styles.colorPlane}
          style={{ backgroundColor: `hsl(${color.h} 100% 50%)` }}
          role="slider"
          tabIndex={0}
          aria-label="Độ bão hòa và độ sáng"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(color.s * 100)}
          aria-valuetext={`Bão hòa ${Math.round(color.s * 100)}%, độ sáng ${Math.round(color.v * 100)}%`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pickPlane(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              pickPlane(event);
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 0.1 : 0.01;
            if (
              !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                event.key,
              )
            )
              return;
            event.preventDefault();
            update({
              s: Math.max(
                0,
                Math.min(
                  1,
                  color.s +
                    (event.key === 'ArrowRight'
                      ? step
                      : event.key === 'ArrowLeft'
                        ? -step
                        : 0),
                ),
              ),
              v: Math.max(
                0,
                Math.min(
                  1,
                  color.v +
                    (event.key === 'ArrowUp'
                      ? step
                      : event.key === 'ArrowDown'
                        ? -step
                        : 0),
                ),
              ),
            });
          }}
        >
          <span
            className={styles.colorPointer}
            style={{
              left: `${color.s * 100}%`,
              top: `${(1 - color.v) * 100}%`,
            }}
          />
        </div>
        <label className={styles.colorSliderLabel}>
          Sắc màu
          <input
            className={styles.hueSlider}
            type="range"
            min={0}
            max={359}
            value={color.h}
            aria-label="Sắc màu"
            onChange={(event) => update({ h: Number(event.target.value) })}
          />
        </label>
        <label className={styles.colorSliderLabel}>
          Độ trong suốt <span>{Math.round(color.a * 100)}%</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={color.a}
            aria-label="Độ trong suốt của màu"
            onChange={(event) => update({ a: Number(event.target.value) })}
          />
        </label>
        <div className={styles.colorPalette}>
          {palette.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Màu ${preset}`}
              style={{ background: preset }}
              onClick={() => {
                const next = hexToHsva(preset);
                setColor(next);
                onPick(hsvaToHex(next));
              }}
            />
          ))}
          <button
            type="button"
            className={styles.transparentColor}
            aria-label="Không màu"
            title="Không màu"
            onClick={() => update({ a: 0 })}
          />
        </div>
      </div>
    </PropertyPopover>
  );
}
