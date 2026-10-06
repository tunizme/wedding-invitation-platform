import type { CSSProperties } from 'react';
import type {
  Appearance,
  Background,
  Box,
  ContentByKind,
  TextStyle,
  ComponentName,
} from '../document/types';
import { AssetImage } from './asset-image';
import { fontFamily } from './font-registry';

export function backgroundStyle(
  background: Background | undefined,
  assets: Record<string, string>,
): CSSProperties {
  if (!background) return {};
  if (background.kind === 'solid') return { backgroundColor: background.color };
  const url = assets[background.assetId];
  return {
    backgroundImage: url ? `url(${JSON.stringify(url)})` : undefined,
    backgroundSize: background.fit,
    backgroundPosition: `${background.positionX * 100}% ${background.positionY * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}
export function boxTransform(box: Box) {
  return `translate(${box.x}px, ${box.y}px) rotate(${box.rotation}deg)`;
}
export function frameStyle(
  box: Box,
  appearance: Appearance,
  assets: Record<string, string>,
): CSSProperties {
  const { border, shadow, padding } = appearance;
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: box.width,
    height: box.height,
    transform: boxTransform(box),
    transformOrigin: '50% 50%',
    boxSizing: 'border-box',
    opacity: appearance.opacity,
    border: `${border.width}px ${border.style} ${border.color}`,
    borderRadius: appearance.borderRadius,
    boxShadow: shadow
      ? `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`
      : undefined,
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : undefined,
    ...backgroundStyle(appearance.background, assets),
  };
}
// The same authored frame rules apply to Craft wrappers and display rendering.
export function elementFrameStyle(
  box: Box,
  appearance: Appearance,
  assets: Record<string, string>,
  kind: ComponentName,
  content: unknown,
): CSSProperties {
  const style = frameStyle(box, appearance, assets);
  const primitive = (content as { primitive?: string }).primitive;
  if (kind === 'Shape' && primitive === 'ellipse') style.borderRadius = '50%';
  if (kind === 'Shape' && primitive === 'line') style.borderWidth = 0;
  return style;
}
export function textStyle(style: TextStyle): CSSProperties {
  return {
    fontFamily: fontFamily(style.fontId),
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    color: style.color,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
    textTransform: style.textTransform,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSynthesis: 'none',
    margin: 0,
  };
}
export function TextDisplay({ content }: { content: ContentByKind['Text'] }) {
  return (
    <div data-measure-content style={textStyle(content.textStyle)}>
      {content.text}
    </div>
  );
}
export function ImageDisplay({
  content,
  assets,
}: {
  content: ContentByKind['Image'];
  assets: Record<string, string>;
}) {
  const source = content.assetId ? assets[content.assetId] : undefined;
  if (!source && !content.assetId)
    return (
      <div
        role="img"
        aria-label="Ảnh chưa được chọn"
        style={{ width: '100%', height: '100%', background: '#eee' }}
      >
        Ảnh
      </div>
    );
  return (
    <AssetImage
      key={source}
      source={source}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: content.fit,
        objectPosition: `${content.positionX * 100}% ${content.positionY * 100}%`,
        borderRadius: 'inherit',
      }}
    />
  );
}
export function ShapeDisplay({
  content,
  border,
}: {
  content: ContentByKind['Shape'];
  border?: Appearance['border'];
}) {
  return (
    <div
      aria-hidden
      style={{
        width: '100%',
        height: content.primitive === 'line' ? 1 : '100%',
        position: content.primitive === 'line' ? 'absolute' : undefined,
        top: content.primitive === 'line' ? '50%' : undefined,
        background: content.primitive === 'line' ? undefined : content.fill,
        borderTop:
          content.primitive === 'line'
            ? `${border?.width ?? 1}px ${border?.style ?? 'solid'} ${border?.color ?? content.fill}`
            : undefined,
        borderRadius: content.primitive === 'ellipse' ? '50%' : 'inherit',
      }}
    />
  );
}
