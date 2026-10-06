import type { WeddingData, EventKey } from '../document/types';
import type { AssetSummary } from '../api/client';

const samples: Record<'A' | 'B', WeddingData> = {
  A: {
    schemaVersion: 1,
    bride: { name: 'Nguyễn Minh Anh' },
    groom: { name: 'Đặng Hoàng Nam' },
    story: 'Một ngày gặp nhau, một đời bên nhau.',
    timeline: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Lần đầu gặp nhau',
        dateLabel: '2024',
        description: 'Khởi đầu câu chuyện của chúng mình.',
      },
    ],
    events: {
      ceremony: {
        datetime: '2027-01-10T10:00:00+07:00',
        timeZone: 'Asia/Ho_Chi_Minh',
        venue: {
          name: 'Địa điểm mẫu',
          address: 'Địa chỉ minh họa',
          latitude: 10.7769,
          longitude: 106.7009,
        },
      },
    },
    bank: {
      bin: '970436',
      account: '000123456789',
      recipientName: 'NGUYEN MINH ANH',
      message: 'Mung cuoi',
    },
  },
  B: {
    schemaVersion: 1,
    bride: { name: 'Trần Ngọc Hà' },
    groom: { name: 'Lê Đức Huy' },
    story: 'Câu chuyện mẫu thứ hai\nCùng viết tiếp những ngày hạnh phúc.',
    timeline: [
      {
        id: '00000000-0000-4000-8000-000000000002',
        title: 'Ngày hẹn đầu',
        dateLabel: '2025',
        description: 'Kỷ niệm đáng nhớ.',
      },
    ],
    events: {
      ceremony: {
        datetime: '2027-05-16T18:30:00+07:00',
        timeZone: 'Asia/Ho_Chi_Minh',
        venue: {
          name: 'Sảnh tiệc B',
          address: '2 Đường Mẫu',
          latitude: 10.78,
          longitude: 106.71,
        },
      },
    },
    bank: {
      bin: '970436',
      account: '000987654321',
      recipientName: 'LE DUC HUY',
      message: 'Mung cuoi',
    },
  },
};
export function sampleWeddingData(sample: 'A' | 'B') {
  return structuredClone(samples[sample]);
}
export function SampleDataPanel({
  selected,
  data,
  onSelect,
  onChange,
  assets = [],
}: {
  selected: 'A' | 'B';
  data: WeddingData;
  onSelect: (sample: 'A' | 'B') => void;
  onChange: (data: WeddingData) => void;
  assets?: AssetSummary[];
}) {
  function change(mutator: (next: WeddingData) => void) {
    const next = structuredClone(data);
    mutator(next);
    onChange(next);
  }
  return (
    <fieldset aria-label="Dữ liệu mẫu" style={{ maxWidth: '100%' }}>
      <legend>Dữ liệu xem trước</legend>
      {(['A', 'B'] as const).map((sample) => (
        <button
          type="button"
          aria-pressed={selected === sample}
          key={sample}
          onClick={() => onSelect(sample)}
        >
          Mẫu dữ liệu {sample}
        </button>
      ))}
      <label>
        Tên cô dâu mẫu
        <input
          aria-label="Tên cô dâu mẫu"
          value={data.bride?.name ?? ''}
          onChange={(event) =>
            onChange({
              ...data,
              bride: { ...data.bride, name: event.target.value },
            })
          }
        />
      </label>
      <label>
        Tên chú rể mẫu
        <input
          aria-label="Tên chú rể mẫu"
          value={data.groom?.name ?? ''}
          onChange={(event) =>
            onChange({
              ...data,
              groom: { ...data.groom, name: event.target.value },
            })
          }
        />
      </label>
      <label>
        Câu chuyện mẫu
        <textarea
          aria-label="Câu chuyện mẫu"
          value={data.story ?? ''}
          onChange={(event) => onChange({ ...data, story: event.target.value })}
        />
      </label>
      {(['bride', 'groom', 'couple'] as const).map((person) => (
        <label key={person}>
          Ảnh mẫu {person}
          <select
            aria-label={`Ảnh mẫu ${person}`}
            value={data[person]?.photo ?? ''}
            onChange={(event) =>
              change((next) => {
                next[person] ??= {};
                if (event.target.value)
                  next[person]!.photo = event.target.value;
                else delete next[person]!.photo;
              })
            }
          >
            <option value="">Không có ảnh</option>
            {data[person]?.photo &&
              !assets.some((asset) => asset.id === data[person]?.photo) && (
                <option value={data[person]?.photo}>Ảnh đang sử dụng</option>
              )}
            {assets.map((asset) => (
              <option value={asset.id} key={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      {(['bride', 'groom'] as const).map((side) => (
        <fieldset key={side}>
          <legend>Gia đình mẫu {side}</legend>
          {(['fatherName', 'motherName'] as const).map((prop) => (
            <label key={prop}>
              {prop === 'fatherName' ? 'Bố' : 'Mẹ'} mẫu {side}
              <input
                value={data.parents?.[side]?.[prop] ?? ''}
                onChange={(event) =>
                  change((next) => {
                    next.parents ??= {};
                    next.parents[side] ??= {};
                    next.parents[side]![prop] = event.target.value;
                  })
                }
              />
            </label>
          ))}
        </fieldset>
      ))}
      {(
        ['ceremony', 'reception', 'engagement', 'afterParty'] as EventKey[]
      ).map((key) => (
        <details key={key}>
          <summary>Sự kiện mẫu {key}</summary>
          {(['datetime', 'timeZone'] as const).map((prop) => (
            <label key={prop}>
              {prop === 'datetime' ? 'Ngày giờ ISO' : 'Múi giờ IANA'} mẫu {key}
              <input
                value={data.events?.[key]?.[prop] ?? ''}
                onChange={(event) =>
                  change((next) => {
                    next.events ??= {};
                    next.events[key] ??= {};
                    next.events[key]![prop] = event.target.value;
                  })
                }
              />
            </label>
          ))}
          {(['name', 'address', 'latitude', 'longitude'] as const).map(
            (prop) => (
              <label key={prop}>
                {prop} mẫu {key}
                <input
                  type={
                    prop === 'latitude' || prop === 'longitude'
                      ? 'number'
                      : 'text'
                  }
                  step="any"
                  value={data.events?.[key]?.venue?.[prop] ?? ''}
                  onChange={(event) =>
                    change((next) => {
                      next.events ??= {};
                      next.events[key] ??= {};
                      next.events[key]!.venue ??= {};
                      if (prop === 'latitude' || prop === 'longitude') {
                        if (!event.target.value)
                          delete next.events[key]!.venue![prop];
                        else
                          next.events[key]!.venue![prop] = Number(
                            event.target.value,
                          );
                      } else
                        next.events[key]!.venue![prop] = event.target.value;
                    })
                  }
                />
              </label>
            ),
          )}
        </details>
      ))}
      <details>
        <summary>Ngân hàng mẫu</summary>
        {(['bin', 'account', 'recipientName', 'message'] as const).map(
          (prop) => (
            <label key={prop}>
              {prop} mẫu
              <input
                value={data.bank?.[prop] ?? ''}
                onChange={(event) =>
                  change((next) => {
                    next.bank ??= {};
                    next.bank[prop] = event.target.value;
                  })
                }
              />
            </label>
          ),
        )}
      </details>
      <details>
        <summary>Timeline mẫu</summary>
        {(data.timeline ?? []).map((entry, index) => (
          <div key={entry.id}>
            {(['title', 'description', 'dateLabel'] as const).map((prop) => (
              <label key={prop}>
                {prop} mẫu {index + 1}
                <input
                  value={entry[prop] ?? ''}
                  onChange={(event) =>
                    change((next) => {
                      next.timeline![index][prop] = event.target.value;
                    })
                  }
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() =>
                change((next) => {
                  next.timeline = next.timeline?.filter(
                    (item) => item.id !== entry.id,
                  );
                })
              }
            >
              Xóa mốc mẫu
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={(data.timeline?.length ?? 0) >= 20}
          onClick={() =>
            change((next) => {
              next.timeline = [
                ...(next.timeline ?? []),
                { id: crypto.randomUUID(), title: 'Mốc mới' },
              ];
            })
          }
        >
          Thêm mốc mẫu
        </button>
      </details>
      <p>
        Thay đổi ở đây chỉ dùng để xem trước. Chọn “Dùng dữ liệu này khi xuất
        bản” để lưu bộ dữ liệu mẫu cho thumbnail.
      </p>
    </fieldset>
  );
}
