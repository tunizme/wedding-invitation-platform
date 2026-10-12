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
  const [loadedKey, setLoadedKey] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const assetKey = assets
    .map((asset) => `${asset.id}:${asset.previewUrl}`)
    .join('|');
  useEffect(() => {
    const scope = createOperationScope(assetKey);
    const abort = new AbortController();
    const created: string[] = [];
    let active = true;
    void Promise.all(
      assets.map(async (asset) => {
        const blob = await builderRequest<Blob>(
          scopedAssetPath(asset.previewUrl),
          {
            bytes: true,
            signal: abort.signal,
            scope,
          },
        );
        if (!active || !scope.isActive()) return [asset.id, ''] as const;
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [asset.id, url] as const;
      }),
    )
      .then((entries) => {
        if (active && scope.isActive()) {
          setUrls(Object.fromEntries(entries));
          setLoadedKey(`${epoch}:${assetKey}`);
        }
      })
      .catch(() => {
        if (active && scope.isActive()) setUrls({});
      });
    return () => {
      active = false;
      abort.abort();
      scope.dispose();
      for (const url of created) URL.revokeObjectURL(url);
    };
    // assetKey encodes the only fields that affect protected preview requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetKey, epoch]);
  return loadedKey === `${epoch}:${assetKey}` ? urls : {};
}
