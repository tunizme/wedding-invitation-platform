import type {
  ResolvedLeafV2,
  ResolvedElement,
  RenderContext,
} from '../../document/types';
import { RenderElement } from '../v1/invitation-renderer-v1';
/** Content owns widget state; its key is the persisted node ID, never the breakpoint. */
export function WidgetContent({
  node,
  context,
  intrinsic = true,
}: {
  node: ResolvedLeafV2;
  context: RenderContext;
  intrinsic?: boolean;
}) {
  const element = {
    id: node.id,
    type: node.type,
    content: node.content,
    appearance: node.appearance,
    box: { x: 0, y: 0, width: 390, height: 390, rotation: 0 },
  } as ResolvedElement;
  const displayContext =
    node.type === 'RSVP' && context.mode === 'preview'
      ? {
          ...context,
          mode: 'capture' as const,
          validationState: {
            ...context.validationState,
            rsvp:
              context.validationState?.rsvp ??
              (context.invitation?.rsvpOpen === false
                ? ('closed' as const)
                : ('open' as const)),
          },
        }
      : context;
  return (
    <RenderElement
      element={element}
      context={displayContext}
      contentOnly
      intrinsic={intrinsic}
    />
  );
}
