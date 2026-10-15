'use client';
import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';
import styles from './property-controls.module.css';
import { ColorPicker } from './color-picker';

/** Collapsible card used for every group in the right-hand customisation panel. */
export function PropertySection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span>{title}</span>
      </button>
      <div id={bodyId} hidden={!open} className={styles.sectionBody}>
        {children}
      </div>
    </section>
  );
}

/** Label on the left, control on the right. */
export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const control =
    isValidElement<{ 'aria-label'?: string }>(children) &&
    typeof children.type === 'string' &&
    ['input', 'select', 'textarea'].includes(children.type)
      ? cloneElement(children, {
          'aria-label': children.props['aria-label'] ?? label,
        })
      : children;
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowControl}>{control}</span>
    </div>
  );
}

export function TextControl({
  label,
  value,
  onChange,
  maxLength = 120,
  inputMode = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  inputMode?: 'text' | 'numeric';
  placeholder?: string;
}) {
  const [editing, setEditing] = useState<{
    value: string;
    text: string;
  } | null>(null);
  const text = editing?.value === value ? editing.text : value;
  return (
    <input
      className={styles.actionInput}
      aria-label={label}
      value={text}
      maxLength={maxLength}
      inputMode={inputMode}
      placeholder={placeholder}
      onChange={(event) => setEditing({ value, text: event.target.value })}
      onBlur={() => onChange(text.trim())}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export function IconToggle({
  label,
  pressed,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={styles.iconToggle}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ToggleRow({ children }: { children: ReactNode }) {
  return <div className={styles.toggleRow}>{children}</div>;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div role="group" aria-label={label} className={styles.segmented}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            title={option.label}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Number input flanked by − / + buttons. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.stepper}>
        <button
          type="button"
          aria-label={`Giảm ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          <Minus size={16} />
        </button>
        <input
          key={value}
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step="any"
          defaultValue={value}
          onBlur={(event) => {
            if (event.target.value !== '')
              onChange(clamp(Number(event.target.value)));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <button
          type="button"
          aria-label={`Tăng ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/** Plain number input in the same visual language. */
export function NumberRow({
  label,
  value,
  onChange,
  min,
  max,
  step = 'any',
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
}) {
  return (
    <FieldRow label={label}>
      <input
        key={value}
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        className={styles.numberInput}
        onBlur={(event) => {
          if (event.target.value !== '') onChange(Number(event.target.value));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </FieldRow>
  );
}

/** Swatch-only colour control; the picker keeps the RGBA alpha channel. */
export function ColorField({
  label,
  value,
  onPick,
  compact = false,
}: {
  label: string;
  value: string;
  onPick: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? styles.compactColor : styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <ColorPicker label={label} value={value} onPick={onPick} />
    </div>
  );
}

export function NumberControl({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  emptyValue,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Value committed when the field is left empty; keeps the old value if unset. */
  emptyValue?: number;
}) {
  const [editing, setEditing] = useState<{
    value: number;
    text: string;
  } | null>(null);
  const draft = editing?.value === value ? editing.text : String(value);
  return (
    <input
      type="number"
      aria-label={label}
      className={styles.numberControl}
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(event) => {
        const next = Number(event.target.value);
        const valid =
          event.target.value !== '' &&
          Number.isFinite(next) &&
          next >= min &&
          next <= max;
        setEditing({ value: valid ? next : value, text: event.target.value });
        if (valid) onChange(next);
      }}
      onBlur={() => {
        const next =
          draft === ''
            ? (emptyValue ?? value)
            : Math.min(max, Math.max(min, Number(draft)));
        if (Number.isFinite(next)) {
          onChange(next);
        }
        setEditing(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export function RangeNumber({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className={styles.sliderBlock}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>
          {label}
          {unit ? `: ${value}${unit}` : ''}
        </span>
        <NumberControl
          label={label}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
        />
      </div>
      <input
        type="range"
        aria-label={`${label} (thanh trượt)`}
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <button
        type="button"
        className={styles.switch}
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

/** Number input with a slider for 0..1 style values. */
export function SliderRow({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className={styles.sliderBlock}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>{label}</span>
        <input
          key={value}
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          defaultValue={value.toFixed(2)}
          className={styles.numberInput}
          onBlur={(event) => {
            if (event.target.value !== '')
              onChange(
                Math.min(max, Math.max(min, Number(event.target.value))),
              );
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>
      <input
        type="range"
        className={styles.slider}
        aria-label={`${label} (thanh trượt)`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
