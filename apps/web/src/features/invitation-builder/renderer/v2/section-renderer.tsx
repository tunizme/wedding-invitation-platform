import type { CSSProperties } from 'react';
import type {
  ResolvedSectionV2,
  ResolvedSceneV2,
  RenderContext,
} from '../../document/types';
import { useDesktopLayout } from '../invitation-viewport';
import { backgroundStyle } from '../primitives';
import { BackgroundAssetStatus } from '../asset-image';
import { LeafRenderer } from './leaf-renderer';
import styles from './responsive.module.css';
export function SectionRenderer({
  section,
  nodes,
  context,
}: {
  section: ResolvedSectionV2;
  nodes: ResolvedSceneV2['nodes'];
  context: RenderContext;
}) {
  const desktop = useDesktopLayout();
  const rule = {
    ...section.mobile,
    ...(desktop ? section.desktop : {}),
    padding: {
      ...section.mobile.padding,
      ...(desktop ? section.desktop.padding : {}),
    },
  };
  const presets = {
    full: { width: '100%' },
    information: { width: '88%', maxWidth: desktop ? 560 : 420 },
    story: { width: '100%', maxWidth: desktop ? 640 : 480 },
    form: { width: '100%', maxWidth: 400 },
    custom: { width: '100%', maxWidth: rule.customMaxWidth ?? undefined },
  };
  const { top, right, bottom, left } = rule.padding;
  const content: CSSProperties = {
    ...presets[rule.contentPreset],
    gridTemplateColumns: `repeat(${rule.layout === 'grid' ? rule.columns : 1},minmax(0,1fr))`,
    gap: rule.gap,
    marginInline: rule.align === 'center' ? 'auto' : undefined,
    marginLeft: rule.align === 'end' ? 'auto' : undefined,
  };
  return (
    <section
      data-section={section.id}
      data-layout={desktop ? 'desktop' : 'mobile'}
      className={styles.section}
      style={{
        ...backgroundStyle(section.background, context.assetUrls),
        padding: `${top}px ${right}px ${bottom}px ${left}px`,
        minHeight: rule.minHeight,
      }}
    >
      {section.background.kind === 'asset' && (
        <BackgroundAssetStatus
          source={context.assetUrls[section.background.assetId]}
        />
      )}
      <div className={styles.artworkLayer} aria-hidden>
        {section.artworkNodeIds.map((id) => (
          <LeafRenderer key={id} node={nodes[id]} context={context} />
        ))}
      </div>
      <div data-section-content className={styles.content} style={content}>
        {section.flowNodeIds.map((id) => (
          <LeafRenderer key={id} node={nodes[id]} context={context} />
        ))}
      </div>
    </section>
  );
}
