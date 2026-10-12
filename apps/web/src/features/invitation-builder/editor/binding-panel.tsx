import mediaTrigger from '../assets/media-trigger.module.css';
import { useRef, useState } from 'react';
import type {
  Binding,
  ComponentName,
  ElementNode,
  EventKey,
  TimelineEntry,
} from '../document/types';
import type { EditorCommand } from './commands';
import { AssetLibrary } from '../assets/asset-library';
import { sampleWeddingData } from './sample-data-panel';

const eventKeys: EventKey[] = [
  'ceremony',
  'reception',
  'engagement',
  'afterParty',
];
const textSources = [
  'bride.name',
  'groom.name',
  'parents.bride.fatherName',
  'parents.bride.motherName',
  'parents.groom.fatherName',
  'parents.groom.motherName',
  'story',
  'wedding.date',
  'wedding.time',
  'venue.name',
  'venue.address',
];
const labels: Record<string, string> = {
  'bride.name': 'Tên cô dâu',
  'groom.name': 'Tên chú rể',
  'bride.photo': 'Ảnh cô dâu',
  'groom.photo': 'Ảnh chú rể',
  'couple.photo': 'Ảnh đôi',
  story: 'Câu chuyện tình yêu',
  'parents.bride.fatherName': 'Bố cô dâu',
  'parents.bride.motherName': 'Mẹ cô dâu',
  'parents.groom.fatherName': 'Bố chú rể',
  'parents.groom.motherName': 'Mẹ chú rể',
  'wedding.date': 'Ngày cưới',
  'wedding.time': 'Giờ cưới',
  'venue.name': 'Tên địa điểm',
  'venue.address': 'Địa chỉ',
  'wedding.event': 'Ngày giờ sự kiện',
  venue: 'Địa điểm tổ chức',
  bank: 'Thông tin mừng cưới',
  timeline: 'Dòng thời gian',
};
function sources(kind: ComponentName) {
  if (kind === 'Text') return textSources;
  if (kind === 'Image' || kind === 'Decoration')
    return ['bride.photo', 'groom.photo', 'couple.photo'];
  if (kind === 'Calendar' || kind === 'Countdown') return ['wedding.event'];
  if (kind === 'Map') return ['venue'];
  if (kind === 'QRBank') return ['bank'];
  if (kind === 'Timeline') return ['timeline'];
  return [];
}
function FallbackObject({
  binding,
  update,
}: {
  binding: Binding;
  update: (value: Binding) => void;
}) {
  const value = binding.fallback;
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value))
    return (
      <fieldset>
        <legend>Mốc dự phòng</legend>
        {value.map((entry, index) => (
          <div key={entry.id}>
            {(['title', 'description', 'dateLabel'] as const).map((key) => (
              <label key={key}>
                {
                  {
                    title: 'Tiêu đề',
                    description: 'Mô tả',
                    dateLabel: 'Thời gian',
                  }[key]
                }{' '}
                dự phòng
                <input
                  key={entry[key]}
                  defaultValue={entry[key] ?? ''}
                  onBlur={(event) =>
                    update({
                      ...binding,
                      fallback: value.map((item, i) =>
                        i === index
                          ? { ...item, [key]: event.target.value }
                          : item,
                      ),
                    } as Binding)
                  }
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() =>
                update({
                  ...binding,
                  fallback: value.filter((_, i) => i !== index),
                } as Binding)
              }
            >
              Xóa mốc dự phòng
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update({
              ...binding,
              fallback: [
                ...value,
                { id: crypto.randomUUID(), title: 'Mốc mới' },
              ],
            } as Binding)
          }
        >
          Thêm mốc dự phòng
        </button>
      </fieldset>
    );
  const keys =
    binding.target === 'event'
      ? ['datetime', 'timeZone']
      : binding.target === 'venue'
        ? ['name', 'address', 'latitude', 'longitude']
        : ['bin', 'account', 'recipientName', 'message'];
  const names: Record<string, string> = {
    datetime: 'Ngày giờ ISO',
    timeZone: 'Múi giờ IANA',
    name: 'Tên địa điểm',
    address: 'Địa chỉ',
    latitude: 'Vĩ độ',
    longitude: 'Kinh độ',
    bin: 'Mã BIN',
    account: 'Số tài khoản',
    recipientName: 'Tên người nhận',
    message: 'Nội dung chuyển khoản',
  };
  return (
    <fieldset>
      <legend>Giá trị dự phòng</legend>
      {keys.map((key) => {
        const numeric = key === 'latitude' || key === 'longitude',
          object = value as Record<string, string | number>;
        return (
          <label key={key}>
            {names[key]} dự phòng
            <input
              type={numeric ? 'number' : 'text'}
              step={numeric ? 'any' : undefined}
              key={String(object[key] ?? '')}
              defaultValue={object[key] ?? ''}
              onBlur={(event) => {
                const next = { ...object };
                if (numeric && !event.target.value) delete next[key];
                else
                  next[key] = numeric
                    ? Number(event.target.value)
                    : event.target.value;
                update({ ...binding, fallback: next } as Binding);
              }}
            />
          </label>
        );
      })}
    </fieldset>
  );
}
export function BindingPanel({
  id,
  node,
  onCommand,
  disabled,
}: {
  id: string;
  node: ElementNode;
  onCommand: (command: EditorCommand) => void;
  disabled: boolean;
}) {
  const [pickFallback, setPickFallback] = useState(false);
  // Explicit trigger/fallback targets: WebKit does not focus clicked buttons.
  const fallbackTriggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLFieldSetElement>(null);
  const kind = node.type.resolvedName,
    current = node.props.bindings[0],
    options = sources(kind);
  if (!options.length) return null;
  const update = (binding: Binding | undefined) =>
    onCommand({ type: 'binding', id, value: binding ? [binding] : [] });
  const image = kind === 'Image' || kind === 'Decoration',
    text = kind === 'Text';
  function select(source: string) {
    if (!source) {
      update(undefined);
      return;
    }
    const eventBased = [
      'wedding.date',
      'wedding.time',
      'venue.name',
      'venue.address',
      'wedding.event',
      'venue',
    ].includes(source);
    const target = text ? 'text' : image ? 'assetId' : current?.target;
    update({
      target,
      source,
      ...(eventBased
        ? {
            eventKey:
              current && 'eventKey' in current ? current.eventKey : 'ceremony',
          }
        : {}),
    } as Binding);
  }
  function addFallback() {
    if (!current) return;
    if (image) {
      setPickFallback(true);
      return;
    }
    const sample = sampleWeddingData('A');
    const fallback = text
      ? ''
      : current.target === 'event'
        ? sample.events!.ceremony!
        : current.target === 'venue'
          ? sample.events!.ceremony!.venue!
          : current.target === 'bank'
            ? sample.bank!
            : ([
                { id: crypto.randomUUID(), title: 'Mốc dự phòng' },
              ] as TimelineEntry[]);
    update({ ...current, fallback } as Binding);
  }
  return (
    <fieldset
      ref={panelRef}
      tabIndex={-1}
      aria-label="Liên kết dữ liệu"
      disabled={disabled || node.custom.locked}
    >
      <legend>Liên kết dữ liệu</legend>
      <label>
        {text ? 'Liên kết văn bản' : 'Nguồn dữ liệu'}
        <select
          aria-label={text ? 'Liên kết văn bản' : 'Nguồn dữ liệu'}
          value={current?.source ?? ''}
          onChange={(event) => select(event.target.value)}
        >
          {(text || image) && <option value="">Nội dung tĩnh</option>}
          {options.map((source) => (
            <option key={source} value={source}>
              {labels[source]}
            </option>
          ))}
        </select>
      </label>
      {current && 'eventKey' in current && (
        <label>
          Sự kiện
          <select
            aria-label="Sự kiện"
            value={current.eventKey}
            onChange={(event) =>
              update({ ...current, eventKey: event.target.value as EventKey })
            }
          >
            {eventKeys.map((key) => (
              <option value={key} key={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
      )}
      {current && (
        <>
          <button
            className={mediaTrigger.trigger}
            type="button"
            ref={fallbackTriggerRef}
            onClick={addFallback}
          >
            {current.fallback === undefined
              ? 'Thêm giá trị dự phòng'
              : image
                ? 'Thay ảnh dự phòng'
                : 'Đặt lại giá trị dự phòng'}
          </button>
          {current.fallback !== undefined && (
            <button
              type="button"
              onClick={() => {
                const next = { ...current };
                delete next.fallback;
                update(next);
              }}
            >
              Xóa giá trị dự phòng
            </button>
          )}
          {text && current.fallback !== undefined && (
            <label>
              Văn bản dự phòng
              <textarea
                key={String(current.fallback)}
                defaultValue={String(current.fallback)}
                onBlur={(event) =>
                  update({
                    ...current,
                    fallback: event.target.value,
                  } as Binding)
                }
              />
            </label>
          )}
          <FallbackObject binding={current} update={update} />
          {pickFallback && (
            <AssetLibrary
              choice="Image"
              returnFocusRef={fallbackTriggerRef}
              fallbackFocusRef={panelRef}
              onClose={() => setPickFallback(false)}
              onSelect={(asset) => {
                update({ ...current, fallback: asset.id } as Binding);
                setPickFallback(false);
              }}
            />
          )}
        </>
      )}
      <label>
        <input
          type="checkbox"
          aria-label="Ẩn nếu thiếu dữ liệu"
          checked={node.custom.optional}
          onChange={(event) =>
            onCommand({ type: 'optional', id, value: event.target.checked })
          }
        />
        Ẩn nếu thiếu dữ liệu
      </label>
    </fieldset>
  );
}
