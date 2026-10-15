'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '../../identity-access/session/store';
import { createOperationScope } from '../../identity-access/session/operation-scope';
import {
  builderRequest,
  scopedAssetPath,
  type AssetSummary,
} from '../api/client';

export function useAssetPreview(assets: AssetSummary[]) {
  const epoch = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.identityEpoch,
    () => 0,
  );
  const [preview, setPreview] = useState<{
    key: string;
    urls: Record<string, string>;
  }>({ key: '', urls: {} });
  const assetKey = assets
    .map((asset) => `${asset.id}:${asset.previewUrl}`)
    .join('|');
  useEffect(() => {
    const scope = createOperationScope(assetKey);
    const abort = new AbortController();
    const created: string[] = [];
    let active = true;
    // Each protected image settles independently: an unavailable/stale asset
    // must not hide valid images or hold them up until its request times out.
    void Promise.allSettled(
      assets.map(async (asset) => {
        const blob = await builderRequest<Blob>(
          scopedAssetPath(asset.previewUrl),
          {
            bytes: true,
            signal: abort.signal,
            scope,
          },
        );
        if (!active || !scope.isActive()) return;
        const url = URL.createObjectURL(blob);
        created.push(url);
        setPreview((current) => {
          if (!active || !scope.isActive()) return current;
          const key = `${epoch}:${assetKey}`;
          return {
            key,
            urls: {
              ...(current.key === key ? current.urls : {}),
              [asset.id]: url,
            },
          };
        });
      }),
    );
    return () => {
      active = false;
      abort.abort();
      scope.dispose();
      for (const url of created) URL.revokeObjectURL(url);
    };
    // assetKey encodes the only fields that affect protected preview requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetKey, epoch]);
  return preview.key === `${epoch}:${assetKey}` ? preview.urls : {};
}
