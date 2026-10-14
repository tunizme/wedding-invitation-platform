import type { ComponentName, ElementNode, TextStyle } from '../document/types';
export const defaultTextStyle: TextStyle = {
  fontId: 'noto-sans-v1',
  fontSize: 18,
  fontWeight: 400,
  italic: false,
  underline: false,
  color: '#000000FF',
  letterSpacing: 0,
  lineHeight: 1.5,
  textAlign: 'left',
  textTransform: 'none',
};
export function primitiveNode(
  type: 'Text' | 'Image' | 'Decoration' | 'Shape',
  assetId?: string,
): ElementNode {
  const appearance = {
    opacity: 1,
    border: { width: 0, color: '#000000FF', style: 'solid' as const },
    shadow: null,
    borderRadius: 0,
    ...(type === 'Text' || type === 'Shape'
      ? {
          background: { kind: 'solid' as const, color: '#FFFFFF00' },
          ...(type === 'Text'
            ? { padding: { top: 0, right: 0, bottom: 0, left: 0 } }
            : {}),
        }
      : {}),
  };
  const content =
    type === 'Text'
      ? {
          text: 'Văn bản',
          textStyle: {
            ...defaultTextStyle,
            fontSize: 26,
            lineHeight: 1.2,
            textAlign: 'center' as const,
          },
        }
      : type === 'Shape'
        ? { primitive: 'rectangle', fill: '#E7C7CFFF' }
        : {
            assetId: assetId ?? null,
            fit: 'cover',
            positionX: 0.5,
            positionY: 0.5,
          };
  return {
    type: { resolvedName: type },
    isCanvas: false,
    props: {
      box: {
        x: type === 'Text' ? 10 : 20,
        y: type === 'Text' ? 100 : 20,
        width: type === 'Text' ? 480 : type === 'Image' ? 240 : 120,
        height: type === 'Text' ? 32 : type === 'Image' ? 180 : 120,
        rotation: 0,
      },
      appearance,
      content,
      bindings: [],
    },
    displayName: type,
    custom: {
      layerName:
        type === 'Text'
          ? 'Văn bản'
          : type === 'Shape'
            ? 'Hình dạng'
            : type === 'Image'
              ? 'Hình ảnh'
              : 'Trang trí',
      locked: false,
      optional: false,
    },
    hidden: false,
    parent: 'ROOT',
    nodes: [],
    linkedNodes: {},
  } as ElementNode;
}

export function widgetNode(
  type: Extract<
    ComponentName,
    'Calendar' | 'Countdown' | 'Map' | 'RSVP' | 'QRBank' | 'Timeline'
  >,
): ElementNode {
  const common = { textStyle: { ...defaultTextStyle } };
  const content =
    type === 'Calendar'
      ? { ...common, accentColor: '#AABBCCFF' }
      : type === 'Countdown'
        ? {
            ...common,
            label: 'Đếm ngược đến ngày cưới',
            endedLabel: 'Ngày vui đã đến',
          }
        : type === 'Map'
          ? { ...common, label: 'Địa điểm tổ chức' }
          : type === 'RSVP'
            ? {
                ...common,
                title: 'Xác nhận tham dự',
                closedLabel: 'Đã đóng xác nhận',
                successLabel: 'Cảm ơn bạn đã phản hồi',
              }
            : type === 'QRBank'
              ? { ...common, label: 'Mừng cưới' }
              : { ...common, accentColor: '#AABBCCFF' };
  const binding =
    type === 'Calendar' || type === 'Countdown'
      ? {
          target: 'event' as const,
          source: 'wedding.event' as const,
          eventKey: 'ceremony' as const,
        }
      : type === 'Map'
        ? {
            target: 'venue' as const,
            source: 'venue' as const,
            eventKey: 'ceremony' as const,
          }
        : type === 'QRBank'
          ? { target: 'bank' as const, source: 'bank' as const }
          : type === 'Timeline'
            ? { target: 'entries' as const, source: 'timeline' as const }
            : undefined;
  const appearance = {
    opacity: 1,
    border: { width: 0, color: '#000000FF', style: 'solid' as const },
    shadow: null,
    background: { kind: 'solid' as const, color: '#FFFFFF00' },
    borderRadius: 0,
    padding: { top: 8, right: 8, bottom: 8, left: 8 },
  };
  const dimension =
    type === 'Calendar'
      ? [350, 320]
      : type === 'Countdown'
        ? [350, 120]
        : type === 'Map'
          ? [350, 320]
          : type === 'QRBank'
            ? [300, 360]
            : type === 'Timeline'
              ? [350, 480]
              : [350, 640];
  return {
    type: { resolvedName: type },
    isCanvas: false,
    props: {
      box: {
        x: 20,
        y: 20,
        width: dimension[0],
        height: dimension[1],
        rotation: 0,
      },
      appearance,
      content,
      bindings: binding ? [binding] : [],
    },
    displayName: type,
    custom: { layerName: type, locked: false, optional: false },
    hidden: false,
    parent: 'ROOT',
    nodes: [],
    linkedNodes: {},
  } as ElementNode;
}
