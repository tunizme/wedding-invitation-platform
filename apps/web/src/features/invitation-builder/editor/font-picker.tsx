'use client';
import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  FONT_CATALOG,
  getInvitationFont,
  type InvitationFontId,
} from '../document/font-catalog';
import { PropertyPopover } from './property-popover';
import styles from './property-controls.module.css';

const GROUPS = [
  ['sans-serif', 'Không chân'],
  ['serif', 'Có chân'],
  ['handwriting', 'Viết tay'],
  ['display', 'Trang trí'],
] as const;
const fold = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();

export function FontPicker({
  value,
  disabled,
  loading,
  onChange,
}: {
  value: InvitationFontId;
  disabled: boolean;
  loading: boolean;
  onChange: (fontId: InvitationFontId) => void;
}) {
  const [query, setQuery] = useState('');
  const selected = getInvitationFont(value);
  const fonts = FONT_CATALOG.filter((font) =>
    fold(font.label).includes(fold(query)),
  );
  return (
    <PropertyPopover
      label="Phông chữ"
      width={290}
      disabled={disabled}
      className={styles.fontTrigger}
      trigger={
        <>
          <span>{loading ? 'Đang tải font…' : selected.label}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </>
      }
    >
      <div className={styles.fontPicker} aria-busy={loading}>
        <input
          type="search"
          aria-label="Tìm phông chữ"
          placeholder="Tìm phông chữ…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled || loading}
        />
        <p className={styles.hint}>
          {FONT_CATALOG.length} phông chữ · Đã kiểm tra dấu tiếng Việt
        </p>
        <div className={styles.fontList}>
          {GROUPS.map(([category, label]) => {
            const group = fonts.filter((font) => font.category === category);
            return group.length ? (
              <section key={category} aria-label={label}>
                <h4>{label}</h4>
                {group.map((font) => (
                  <button
                    type="button"
                    key={font.id}
                    aria-pressed={font.id === value}
                    disabled={disabled || loading}
                    onClick={() => onChange(font.id)}
                  >
                    <span>{font.label}</span>
                    {font.id === value && (
                      <Check size={16} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </section>
            ) : null;
          })}
          {!fonts.length && <p role="status">Không tìm thấy phông chữ.</p>}
        </div>
      </div>
    </PropertyPopover>
  );
}
