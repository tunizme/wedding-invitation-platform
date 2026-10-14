import type { Venue } from '../../document/types';
export function MapWidget({
  locale = 'vi',
  venue,
  mode,
  label = 'Địa điểm',
}: {
  locale?: 'vi' | 'en';
  venue: Required<Venue>;
  mode: 'editor' | 'preview' | 'capture' | 'public';
  label?: string;
}) {
  const destination = `${venue.latitude},${venue.longitude}`;
  const delta = 0.01;
  const bbox = `${venue.longitude - delta}%2C${venue.latitude - delta}%2C${venue.longitude + delta}%2C${venue.latitude + delta}`;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${venue.latitude}%2C${venue.longitude}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  return (
    <section aria-label={label}>
      <strong>{label}</strong>
      <div
        aria-label={locale === 'vi' ? 'Bản đồ địa điểm' : 'Venue map'}
        style={{ width: '100%', height: 160, background: '#f3f0ed' }}
      >
        {mode !== 'capture' && mode !== 'editor' && (
          <iframe
            title={(locale === 'vi' ? 'Bản đồ ' : 'Map ') + venue.name}
            src={mapUrl}
            loading="lazy"
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              border: 0,
            }}
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>
      <strong>{venue.name}</strong>
      <p>{venue.address}</p>
      <a href={directions} target="_blank" rel="noreferrer">
        {locale === 'vi' ? 'Mở chỉ đường' : 'Get directions'}
      </a>
    </section>
  );
}
