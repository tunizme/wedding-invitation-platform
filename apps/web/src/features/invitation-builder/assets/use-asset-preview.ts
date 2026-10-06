'use client';
import { useEffect, useState } from 'react';
import { builderRequest, scopedAssetPath, type AssetSummary } from '../api/client';

export function useAssetPreview(assets: AssetSummary[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const assetKey = assets.map((asset) => `${asset.id}:${asset.previewUrl}`).join('|');
  useEffect(() => {
    const abort = new AbortController();
    const created: string[] = [];
    let active = true;
    void Promise.all(assets.map(async (asset) => {
      const blob = await builderRequest<Blob>(scopedAssetPath(asset.previewUrl), {
        bytes: true,
        signal: abort.signal,
      });
      if (!active) return [asset.id, ''] as const;
      const url = URL.createObjectURL(blob);
      created.push(url);
      return [asset.id, url] as const;
    })).then((entries) => {
      if (active) setUrls(Object.fromEntries(entries));
    }).catch(() => {
      if (active) setUrls({});
    });
    return () => {
      active = false;
      abort.abort();
      for (const url of created) URL.revokeObjectURL(url);
    };
    // assetKey encodes the only fields that affect protected preview requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetKey]);
  return urls;
}
