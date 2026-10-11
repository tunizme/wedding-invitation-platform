import type { CSSProperties } from 'react';
import type {
  ResolvedLeafV2,
  RenderContext,
  TextStyle,
} from '../../document/types';
import { useDesktopLayout } from '../invitation-viewport';
import { elementFrameStyle, textStyle, ShapeDisplay } from '../primitives';
import { AssetImage } from '../asset-image';
import { WidgetContent } from './widget-content';
import styles from './responsive.module.css';
export function LeafRenderer({
  node,
  context,
}: {
  node: ResolvedLeafV2;
  context: RenderContext;
}) {
  const desktop = useDesktopLayout();
  const frame = elementFrameStyle(
    { x: 0, y: 0, width: 390, height: 390, rotation: 0 },
    node.appearance,
    context.assetUrls,
    node.type,
    node.content,
  );
  delete frame.position;
  delete frame.left;
  delete frame.top;
  delete frame.width;
  delete frame.height;
  delete frame.transform;
  delete frame.transformOrigin;
  let style: CSSProperties = { ...frame };
  let content = node.content;
  if (node.role === 'flow') {
    const mobile = node.mobile,
      override = desktop ? node.desktop : {};
    const layout = { ...mobile.layout, ...override.layout };
    style = {
      ...style,
      width: `${layout.widthPercent}%`,
      maxWidth: layout.maxWidth ?? undefined,
      justifySelf: layout.align,
    };
    const padding = {
      ...node.appearance.padding,
      ...mobile.appearance.padding,
      ...override.appearance?.padding,
    };
    if (Object.keys(padding).length)
      style.padding = `${padding.top ?? 0}px ${padding.right ?? 0}px ${padding.bottom ?? 0}px ${padding.left ?? 0}px`;
    style.borderRadius =
      override.appearance?.borderRadius ??
      mobile.appearance.borderRadius ??
      style.borderRadius;
    if ('textStyle' in content)
      content = {
        ...content,
        textStyle: {
          ...content.textStyle,
          ...mobile.typography,
          ...override.typography,
        },
      };
  } else {
    const layout = {
      ...node.mobile.layout,
      ...(desktop ? node.desktop.layout : {}),
    };
    style = {
      ...style,
      left: `${layout.xPercent}%`,
      top: `${layout.yPercent}%`,
      width: `${layout.widthPercent}%`,
      aspectRatio: layout.aspectRatio,
      transform: `rotate(${layout.rotation}deg)`,
    };
  }
  let child: React.ReactNode;
  if (node.type === 'Image' || node.type === 'Decoration') {
    const image = node.content;
    child = (
      <AssetImage
        source={image.assetId ? context.assetUrls[image.assetId] : undefined}
        alt={node.role === 'flow' ? image.alt : ''}
        style={{
          width: '100%',
          height: node.role === 'artwork' ? '100%' : undefined,
          aspectRatio: node.role === 'flow' ? image.aspectRatio : undefined,
          objectFit: image.fit,
          objectPosition: `${image.positionX * 100}% ${image.positionY * 100}%`,
          borderRadius: 'inherit',
        }}
      />
    );
  } else if (node.type === 'Shape') {
    if (node.role === 'flow')
      style.aspectRatio = node.content.primitive === 'line' ? undefined : 1;
    if (node.content.primitive === 'line')
      style.minHeight = Math.max(1, node.appearance.border.width);
    child = (
      <ShapeDisplay content={node.content} border={node.appearance.border} />
    );
  } else if (
    node.type === 'Text' &&
    'text' in content &&
    'textStyle' in content
  )
    child = (
      <div
        data-measure-content
        style={{
          ...textStyle(content.textStyle as TextStyle),
          whiteSpace: 'break-spaces',
        }}
      >
        {content.text}
      </div>
    );
  else
    child = (
      <WidgetContent
        node={{ ...node, content } as ResolvedLeafV2}
        context={context}
      />
    );
  return (
    <div
      data-rendered-element={node.id}
      data-role={node.role}
      aria-hidden={
        node.role === 'artwork' || node.type === 'Decoration' ? true : undefined
      }
      className={node.role === 'artwork' ? styles.artwork : styles.leaf}
      style={style}
    >
      {child}
    </div>
  );
}
