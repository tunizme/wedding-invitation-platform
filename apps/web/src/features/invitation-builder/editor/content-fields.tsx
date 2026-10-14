'use client';
import { useState } from 'react';
import type { WeddingData } from '../document/types';
import type { FormField } from '../document/binding-catalog';
import type { ContentFieldValue } from '../document/editor-document';
import { AssetLibrary } from './asset-library';
import { ModalSurface } from '../../../ui/platform/modal-surface';
import type { AssetSummary } from '../api/client';

export function ContentFields({
  fields,
  data,
  onChange,
  role = 'CUSTOMER',
  disabled = false,
}: {
  fields: (FormField & { required: boolean })[];
  data: WeddingData;
  onChange: (data: WeddingData) => void;
  role?: 'ADMIN' | 'CUSTOMER';
  disabled?: boolean;
}) {
  const [choosing, setChoosing] = useState<{
    key: string;
    kind: 'IMAGE' | 'AUDIO';
    multiple: boolean;
    poster?: boolean;
  } | null>(null);
  const update = (key: string, value: ContentFieldValue) =>
    onChange({
      ...data,
      schemaVersion: 2,
      fields: { ...data.fields, [key]: value },
    });
  const pick = (asset: AssetSummary) => {
    if (!choosing) return;
    const current = data.fields?.[choosing.key] ?? {};
    update(
      choosing.key,
      choosing.kind === 'AUDIO'
        ? { ...current, audioId: asset.id }
        : choosing.poster
          ? { ...current, posterId: asset.id }
          : { ...current, assetIds: [...(current.assetIds ?? []), asset.id] },
    );
    if (!choosing.multiple) setChoosing(null);
  };
  return (
    <fieldset
      disabled={disabled}
      style={{ border: 0, padding: 0, display: 'grid', gap: 16 }}
    >
      {fields
        .filter((f) => f.id.startsWith('fields.'))
        .map((f) => {
          const key = f.id.slice(7),
            v = data.fields?.[key] ?? {};
          return (
            <section key={key}>
              <h3>
                {f.label}
                {f.required ? ' *' : ''}
              </h3>
              {f.type === 'album' ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setChoosing({ key, kind: 'IMAGE', multiple: true })
                    }
                  >
                    Thêm ảnh album
                  </button>
                  <ol>
                    {(v.assetIds ?? []).map((id, i) => (
                      <li key={id + ':' + i}>
                        Ảnh {i + 1}
                        <button
                          type="button"
                          aria-label={`Đưa ảnh ${i + 1} lên`}
                          disabled={!i}
                          onClick={() => {
                            const ids = [...(v.assetIds ?? [])];
                            [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                            update(key, { ...v, assetIds: ids });
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            update(key, {
                              ...v,
                              assetIds: (v.assetIds ?? []).filter(
                                (_, j) => j !== i,
                              ),
                            })
                          }
                        >
                          Bỏ ảnh
                        </button>
                      </li>
                    ))}
                  </ol>
                </>
              ) : f.type === 'audio' ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setChoosing({ key, kind: 'AUDIO', multiple: false })
                    }
                  >
                    {v.audioId ? 'Đổi nhạc' : 'Chọn nhạc'}
                  </button>
                  {v.audioId && (
                    <button
                      type="button"
                      onClick={() => update(key, { ...v, audioId: null })}
                    >
                      Bỏ nhạc
                    </button>
                  )}
                </>
              ) : f.type === 'video' ? (
                <>
                  <label>
                    Mã hoặc link YouTube
                    <input
                      value={v.videoId ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        let id = raw;
                        try {
                          const u = new URL(raw);
                          if (u.hostname === 'youtu.be')
                            id = u.pathname.slice(1);
                          else if (
                            [
                              'youtube.com',
                              'www.youtube.com',
                              'm.youtube.com',
                            ].includes(u.hostname)
                          )
                            id =
                              u.searchParams.get('v') ??
                              u.pathname.split('/').at(-1) ??
                              raw;
                        } catch {}
                        update(key, { ...v, videoId: id });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setChoosing({
                        key,
                        kind: 'IMAGE',
                        multiple: false,
                        poster: true,
                      })
                    }
                  >
                    Chọn ảnh đại diện video
                  </button>
                  {v.videoId && !/^[a-zA-Z0-9_-]{11}$/.test(v.videoId) && (
                    <p role="alert">
                      Nhập mã video 11 ký tự hoặc link YouTube hợp lệ.
                    </p>
                  )}
                </>
              ) : (
                <label>
                  Số điện thoại
                  <input
                    type="tel"
                    value={v.phone ?? ''}
                    maxLength={30}
                    onChange={(e) =>
                      update(key, { ...v, phone: e.target.value })
                    }
                  />
                </label>
              )}
            </section>
          );
        })}
      {choosing && (
        <ModalSurface
          label={choosing.kind === 'AUDIO' ? 'Chọn nhạc' : 'Chọn ảnh album'}
          onClose={() => setChoosing(null)}
        >
          <AssetLibrary
            kind={choosing.kind}
            expectedRole={role}
            multiple={choosing.multiple}
            onAsset={pick}
          />
        </ModalSurface>
      )}
    </fieldset>
  );
}
