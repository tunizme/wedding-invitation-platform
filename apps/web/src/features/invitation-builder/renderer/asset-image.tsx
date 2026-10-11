'use client';
import { useState, type CSSProperties } from 'react';

export function AssetImage({
  source,
  background = false,
  style,
  alt = '',
}: {
  source?: string;
  background?: boolean;
  style?: CSSProperties;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!source || failed)
    return (
      <div
        data-asset-error
        role="img"
        aria-label={background ? 'Không thể tải nền' : 'Không thể tải ảnh'}
        style={{
          background: '#eee',
          ...(!background ? { width: '100%', height: '100%' } : {}),
        }}
      >
        <span role="status">
          {background
            ? 'Không thể tải nền. Vui lòng thử lại.'
            : 'Không thể tải ảnh. Vui lòng thử lại.'}
        </span>
      </div>
    );
  // The hidden image makes CSS background loading observable and measurable.
  // Contextual blobs and preauthorized bytes must be decoded directly for fit checks.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
      style={background ? { display: 'none' } : style}
    />
  );
}
export function BackgroundAssetStatus({ source }: { source?: string }) {
  return <AssetImage key={source ?? 'missing'} source={source} background />;
}
