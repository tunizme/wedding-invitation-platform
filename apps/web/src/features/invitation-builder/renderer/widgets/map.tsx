import type { Venue } from '../../document/types';
export function MapWidget({
  locale = 'vi',
  venue,
  mode,
  label = 'Địa điểm',
}: {
  locale?: 'vi' | 'en';
  venue: Venue;
  mode: 'editor' | 'preview' | 'capture' | 'public';
  label?: string;
}) {
  const destination =
    typeof venue.latitude === 'number' && typeof venue.longitude === 'number'
      ? `${venue.latitude},${venue.longitude}`
      : (venue.address?.trim() ?? '');
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(destination)}&z=15&output=embed`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  return (
    <section
      aria-label={label}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <div
        aria-label={locale === 'vi' ? 'Bản đồ địa điểm' : 'Venue map'}
        style={{ width: '100%', height: '100%', background: '#f3f0ed' }}
      >
        {mode !== 'capture' && destination && (
          <iframe
            title={locale === 'vi' ? 'Bản đồ địa điểm' : 'Venue map'}
            src={mapUrl}
            loading="lazy"
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              border: 0,
              pointerEvents: mode === 'editor' ? 'none' : 'auto',
            }}
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>
      {mode !== 'editor' && mode !== 'capture' && destination && (
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            padding: '8px 12px',
            background: 'white',
            color: '#174ea6',
          }}
        >
          {locale === 'vi' ? 'Mở chỉ đường' : 'Get directions'}
        </a>
      )}
    </section>
  );
}
