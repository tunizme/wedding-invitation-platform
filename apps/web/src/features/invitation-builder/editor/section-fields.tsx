'use client';
import { useState } from 'react';
function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  inherit = false,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number | undefined) => void;
  inherit?: boolean;
}) {
  const [raw, setRaw] = useState(value === undefined ? '' : String(value));
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (raw === '' && inherit) {
      if (value !== undefined) onChange(undefined);
      setInvalid(false);
      return;
    }
    const number = Number(raw);
    if (
      raw === '' ||
      !Number.isFinite(number) ||
      number < min ||
      number > max ||
      (step === 1 && !Number.isInteger(number))
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (number !== value) onChange(number);
  };
  return (
    <label>
      {label}
      <input
        type="number"
        value={raw}
        min={min}
        max={max}
        step={step}
        placeholder={inherit ? 'Kế thừa' : undefined}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setRaw(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      {invalid && (
        <span role="alert">
          Nhập số từ {min} đến {max}.
        </span>
      )}
    </label>
  );
}
function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [raw, setRaw] = useState(value);
  const [invalid, setInvalid] = useState(false);
  return (
    <label>
      {label}
      <input
        value={raw}
        maxLength={9}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setRaw(e.target.value);
          setInvalid(false);
        }}
        onBlur={() => {
          if (/^#[0-9a-f]{8}$/i.test(raw)) {
            if (raw !== value) onChange(raw);
          } else setInvalid(true);
        }}
      />
      {invalid && <span role="alert">Dùng màu #RRGGBBAA.</span>}
    </label>
  );
}

export function NumberField(props: Parameters<typeof NumberInput>[0]) {
  return (
    <NumberInput
      key={`${props.label}:${props.value ?? 'inherit'}`}
      {...props}
    />
  );
}
export function ColorField(props: Parameters<typeof ColorInput>[0]) {
  return <ColorInput key={`${props.label}:${props.value}`} {...props} />;
}
