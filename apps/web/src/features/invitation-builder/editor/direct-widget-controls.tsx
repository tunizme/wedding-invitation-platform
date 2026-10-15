'use client';
import type {
  ElementNode,
  WeddingEvent,
  Venue,
  Bank,
  TimelineEntry,
} from '../document/types';
import bankCatalog from '../document/bank-catalog.json';
import { FieldRow, PropertySection } from './property-controls';

export function vietnameseLocalDateTime(datetime?: string): string {
  if (!datetime || !Number.isFinite(new Date(datetime).getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(datetime));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}
export function DirectEventControl({
  value,
  onChange,
}: {
  value?: WeddingEvent;
  onChange: (value: WeddingEvent) => void;
}) {
  return (
    <FieldRow label="Ngày giờ">
      <input
        aria-label="Ngày giờ"
        type="datetime-local"
        value={vietnameseLocalDateTime(value?.datetime)}
        onChange={(e) => {
          if (e.target.value)
            onChange({
              ...value,
              datetime: e.target.value + ':00+07:00',
              timeZone: 'Asia/Ho_Chi_Minh',
            });
        }}
      />
    </FieldRow>
  );
}
export function DirectWidgetControls({
  node,
  onChange,
}: {
  node: ElementNode;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const kind = node.type.resolvedName,
    content = node.props.content as unknown as {
      event?: WeddingEvent;
      venue?: Venue;
      bank?: Bank;
      entries?: TimelineEntry[];
    };
  if (kind === 'Calendar' || kind === 'Countdown')
    return (
      <PropertySection title="Ngày giờ sự kiện" defaultOpen>
        <DirectEventControl
          value={content.event}
          onChange={(event) => onChange({ event })}
        />
        <small>Giờ Việt Nam (UTC+7).</small>
      </PropertySection>
    );
  if (kind === 'Map') {
    const venue = content.venue ?? {
        address: '',
      },
      update = (patch: Partial<Venue>) =>
        onChange({ venue: { ...venue, ...patch } });
    return (
      <PropertySection title="Địa điểm" defaultOpen>
        <FieldRow label="Địa chỉ">
          <input
            value={venue.address ?? ''}
            maxLength={500}
            onChange={(e) => update({ address: e.target.value })}
          />
        </FieldRow>
        <p>
          Maps tìm vị trí theo địa chỉ. Tọa độ là tùy chọn; nhập cả hai để chỉ
          định vị trí chính xác.
        </p>
        <FieldRow label="Vĩ độ">
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            value={venue.latitude ?? ''}
            onChange={(e) =>
              update({
                latitude:
                  e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
        </FieldRow>
        <FieldRow label="Kinh độ">
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            value={venue.longitude ?? ''}
            onChange={(e) =>
              update({
                longitude:
                  e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
        </FieldRow>
      </PropertySection>
    );
  }
  if (kind === 'QRBank') {
    const bank = content.bank ?? {
        bin: '',
        account: '',
        recipientName: '',
        message: '',
      },
      update = (patch: Partial<Bank>) =>
        onChange({ bank: { ...bank, ...patch } });
    return (
      <PropertySection title="Thông tin mừng cưới" defaultOpen>
        <FieldRow label="Ngân hàng">
          <select
            value={bank.bin ?? ''}
            onChange={(e) => update({ bin: e.target.value })}
          >
            <option value="">Chọn ngân hàng</option>
            {bankCatalog.banks.map((item) => (
              <option key={item.bin} value={item.bin}>
                {item.shortName} · {item.name}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Số tài khoản">
          <input
            key={bank.account}
            defaultValue={bank.account ?? ''}
            maxLength={19}
            onBlur={(e) =>
              update({ account: e.target.value.replace(/\D/g, '') })
            }
          />
        </FieldRow>
        <FieldRow label="Tên chủ tài khoản">
          <input
            key={bank.recipientName}
            defaultValue={bank.recipientName ?? ''}
            maxLength={50}
            onBlur={(e) => update({ recipientName: e.target.value })}
          />
        </FieldRow>
        <small>
          Số tài khoản 6–19 chữ số; tên chủ tài khoản 5–50 ký tự. Nội dung
          chuyển khoản tối đa 25 ký tự không dấu.
        </small>
        <FieldRow label="Nội dung chuyển khoản">
          <input
            key={bank.message}
            defaultValue={bank.message ?? ''}
            maxLength={25}
            onBlur={(e) =>
              update({
                message: e.target.value
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/[đĐ]/g, 'D')
                  .replace(/[^A-Za-z0-9 ]/g, ''),
              })
            }
          />
        </FieldRow>
      </PropertySection>
    );
  }
  if (kind === 'Timeline') {
    const entries = content.entries ?? [],
      update = (index: number, patch: Partial<TimelineEntry>) =>
        onChange({
          entries: entries.map((entry, i) =>
            i === index ? { ...entry, ...patch } : entry,
          ),
        });
    return (
      <PropertySection title="Nội dung chương trình" defaultOpen>
        {entries.map((entry, index) => (
          <fieldset key={entry.id}>
            <legend>Mục {index + 1}</legend>
            <FieldRow label="Thời gian">
              <input
                value={entry.dateLabel ?? ''}
                maxLength={40}
                onChange={(e) => update(index, { dateLabel: e.target.value })}
              />
            </FieldRow>
            <FieldRow label="Tiêu đề">
              <input
                value={entry.title}
                maxLength={120}
                onChange={(e) => update(index, { title: e.target.value })}
              />
            </FieldRow>
            <FieldRow label="Mô tả">
              <textarea
                value={entry.description ?? ''}
                maxLength={500}
                onChange={(e) => update(index, { description: e.target.value })}
              />
            </FieldRow>
            <button
              type="button"
              onClick={() =>
                onChange({ entries: entries.filter((_, i) => i !== index) })
              }
            >
              Xóa mục {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={entries.length >= 20}
          onClick={() =>
            onChange({
              entries: [
                ...entries,
                {
                  id: crypto.randomUUID(),
                  title: 'Nội dung chương trình',
                  dateLabel: '',
                  description: '',
                },
              ],
            })
          }
        >
          Thêm mục
        </button>
      </PropertySection>
    );
  }
  return null;
}
