import type { TimelineEntry } from '../../document/types';
export function TimelineWidget({ entries, accentColor = '#AABBCCFF' }: { entries: TimelineEntry[]; accentColor?: string }) {
  return <ol aria-label="Dòng thời gian" style={{ borderInlineStart: `2px solid ${accentColor}` }}>
    {entries.map((entry) => <li key={entry.id}>
      {entry.dateLabel && <time>{entry.dateLabel}</time>}
      <h3>{entry.title}</h3>
      {entry.description && <p>{entry.description}</p>}
    </li>)}
  </ol>;
}
