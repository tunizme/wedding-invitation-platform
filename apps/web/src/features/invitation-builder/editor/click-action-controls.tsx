'use client';
import type { NodeOptions } from '../document/editor-document';
import type { Bank } from '../document/types';
import bankCatalog from '../document/bank-catalog.json';
import { PropertySection, TextControl } from './property-controls';
import styles from './property-controls.module.css';

export function ClickActionControls({
  id,
  options,
  targets,
  onChange,
  onPickTarget,
  onLocateTarget,
}: {
  id: string;
  options: NodeOptions;
  targets: { id: string; label: string }[];
  onChange: (value: NodeOptions) => void;
  onPickTarget?: () => void;
  onLocateTarget?: (id: string) => void;
}) {
  const accounts = options.giftAccounts ?? [];
  const updateBank = (index: number, patch: Partial<Bank>) =>
    onChange({
      giftAccounts: accounts.map((bank, i) =>
        i === index ? { ...bank, ...patch } : bank,
      ),
    });
  return (
    <PropertySection title="Hành động khi bấm">
      <label className={styles.stackField}>
        <span className={styles.srOnly}>Loại hành động</span>
        <select
          aria-label="Loại hành động"
          value={options.action?.kind ?? 'none'}
          onChange={(event) => {
            const kind = event.target.value;
            if (kind === 'none') onChange({ action: undefined });
            else if (kind === 'link')
              onChange({
                action: {
                  kind: 'link',
                  value:
                    options.action?.kind === 'link' ? options.action.value : '',
                },
              });
            else if (kind === 'gift')
              onChange({ action: { kind: 'gift', value: '' } });
            else
              onChange({
                action: {
                  kind: 'scroll',
                  value: targets.find((target) => target.id !== id)?.id ?? id,
                },
              });
          }}
        >
          <option value="none">Không có</option>
          <option value="link">Mở liên kết</option>
          <option value="gift">Mở Hộp quà QR</option>
          <option value="scroll">Cuộn tới phần tử</option>
        </select>
      </label>
      {options.action?.kind === 'link' && (
        <TextControl
          label="Địa chỉ liên kết"
          placeholder="https://"
          maxLength={2048}
          value={options.action.value}
          onChange={(value) =>
            onChange({
              action: { kind: 'link', value },
            })
          }
        />
      )}
      {options.action?.kind === 'scroll' && (
        <>
          <label className={styles.stackField}>
            Chọn phần tử
            <select
              aria-label="Phần tử đích"
              value={options.action.value}
              onChange={(event) =>
                onChange({
                  action: { kind: 'scroll', value: event.target.value },
                })
              }
            >
              {targets.map((target) => (
                <option value={target.id} key={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.buttonGrid}>
            <button
              type="button"
              disabled={!onPickTarget}
              onClick={onPickTarget}
            >
              Chọn trên thiệp
            </button>
            <button
              type="button"
              disabled={!onLocateTarget}
              onClick={() => onLocateTarget?.(options.action!.value)}
            >
              Xem vị trí
            </button>
          </div>
        </>
      )}
      {options.action?.kind === 'gift' && (
        <>
          <p className={styles.help}>
            Khách bấm sẽ mở danh sách QR mừng cưới, không cần thêm phần tử Hộp
            quà.
          </p>
          <div className={styles.row}>
            <strong>QR Bank</strong>
            <button
              type="button"
              className={styles.smallAction}
              disabled={accounts.length >= 2}
              onClick={() =>
                onChange({
                  giftAccounts: [
                    ...accounts,
                    { bin: '', account: '', recipientName: '' },
                  ],
                })
              }
            >
              Thêm tài khoản
            </button>
          </div>
          <p className={styles.help}>Thêm tối đa 2 tài khoản ngân hàng.</p>
          {accounts.length === 0 && (
            <p className={styles.emptyBank}>Chưa có thông tin tài khoản</p>
          )}
          {accounts.map((bank, index) => (
            <div className={styles.bankCard} key={index}>
              <div className={styles.row}>
                <strong>Tài khoản {index + 1}</strong>
                <button
                  type="button"
                  className={styles.smallAction}
                  aria-label={`Xóa tài khoản ${index + 1}`}
                  onClick={() =>
                    onChange({
                      giftAccounts: accounts.filter((_, i) => i !== index),
                    })
                  }
                >
                  Xóa
                </button>
              </div>
              <label className={styles.stackField}>
                Ngân hàng
                <select
                  aria-label={`Ngân hàng ${index + 1}`}
                  value={bank.bin ?? ''}
                  onChange={(event) =>
                    updateBank(index, { bin: event.target.value })
                  }
                >
                  <option value="">Chọn ngân hàng</option>
                  {bankCatalog.banks.map((entry) => (
                    <option key={entry.bin} value={entry.bin}>
                      {entry.shortName}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ['account', 'Số tài khoản', 34],
                  ['recipientName', 'Tên chủ tài khoản', 120],
                  ['message', 'Nội dung chuyển khoản', 300],
                ] as const
              ).map(([key, label, length]) => (
                <label className={styles.stackField} key={key}>
                  {label}
                  <TextControl
                    label={`${label} ${index + 1}`}
                    maxLength={length}
                    inputMode={key === 'account' ? 'numeric' : 'text'}
                    value={bank[key] ?? ''}
                    onChange={(value) => updateBank(index, { [key]: value })}
                  />
                </label>
              ))}
            </div>
          ))}
          <label className={styles.stackField}>
            Tiêu đề khi hiển thị
            <TextControl
              label="Tiêu đề hộp quà"
              maxLength={120}
              value={options.giftTitle ?? 'Mừng cưới'}
              onChange={(giftTitle) => onChange({ giftTitle })}
            />
          </label>
        </>
      )}
    </PropertySection>
  );
}
