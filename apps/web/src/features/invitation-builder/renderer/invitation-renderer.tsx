import { PublicRsvp } from '../../invitations/public-rsvp';
import type { CSSProperties } from 'react';
import type {
  RenderContext,
  ResolvedElement,
  ResolvedScene,
  ContentByKind,
} from '../document/types';
import { InvitationCanvasDisplay } from './canvas';
import {
  elementFrameStyle,
  TextDisplay,
  ImageDisplay,
  ShapeDisplay,
  textStyle,
} from './primitives';
import { BackgroundAssetStatus } from './asset-image';
import { CalendarWidget } from './widgets/calendar';
import { CountdownWidget } from './widgets/countdown';
import { MapWidget } from './widgets/map';
import { QrBankWidget } from './widgets/qr-bank';
import {
  RsvpWidget,
  rsvpUnavailableMessage,
  rsvpRateLimitMessage,
  rsvpRetryMessage,
} from './widgets/rsvp';
import { TimelineWidget } from './widgets/timeline';

export function RenderElement({
  element,
  context,
  contentOnly = false,
}: {
  element: ResolvedElement;
  context: RenderContext;
  contentOnly?: boolean;
}) {
  const content = element.content as unknown as Record<string, unknown>;
  let child: React.ReactNode;
  switch (element.type) {
    case 'Text':
      child = (
        <TextDisplay content={content as unknown as ContentByKind['Text']} />
      );
      break;
    case 'Image':
    case 'Decoration':
      child = (
        <ImageDisplay
          content={content as unknown as ContentByKind['Image']}
          assets={context.assetUrls}
        />
      );
      break;
    case 'Shape':
      child = (
        <ShapeDisplay
          content={content as unknown as ContentByKind['Shape']}
          border={element.appearance.border}
        />
      );
      break;
    case 'Calendar': {
      const event = content.event as { datetime: string; timeZone: string };
      child = (
        <CalendarWidget
          datetime={event.datetime}
          timeZone={event.timeZone}
          accentColor={content.accentColor as string}
        />
      );
      break;
    }
    case 'Countdown': {
      const event = content.event as { datetime: string; timeZone: string };
      child = (
        <CountdownWidget
          validationState={context.validationState?.countdown}
          live={context.mode === 'public'}
          datetime={event.datetime}
          timeZone={event.timeZone}
          asOf={context.asOf}
          label={content.label as string}
          endedLabel={content.endedLabel as string}
        />
      );
      break;
    }
    case 'Map':
      child = (
        <MapWidget
          venue={content.venue as Required<import('../document/types').Venue>}
          mode={context.mode}
          label={content.label as string}
        />
      );
      break;
    case 'QRBank':
      child = (
        <QrBankWidget
          bank={
            content.bank as Required<
              Pick<
                import('../document/types').Bank,
                'bin' | 'account' | 'recipientName'
              >
            > &
              Pick<import('../document/types').Bank, 'message'>
          }
          payload={content.qrPayload as string}
          label={content.label as string}
        />
      );
      break;
    case 'Timeline':
      child = (
        <TimelineWidget
          entries={
            content.entries as import('../document/types').TimelineEntry[]
          }
          accentColor={content.accentColor as string}
        />
      );
      break;
    case 'RSVP':
      child =
        context.mode === 'public' && context.invitation?.slug ? (
          <PublicRsvp
            slug={context.invitation.slug}
            title={content.title as string}
            closedLabel={content.closedLabel as string}
            successLabel={content.successLabel as string}
          />
        ) : (
          <RsvpWidget
            title={content.title as string}
            closedLabel={content.closedLabel as string}
            successLabel={content.successLabel as string}
            displayState={
              context.validationState?.rsvp ??
              (context.invitation?.rsvpOpen ? 'open' : 'closed')
            }
            mode={context.mode}
            status={
              context.validationState?.rsvpUnavailable
                ? rsvpUnavailableMessage
                : undefined
            }
            error={
              context.validationState?.rsvpRateLimited
                ? rsvpRateLimitMessage(600)
                : undefined
            }
            retryLabel={
              context.validationState?.rsvpRateLimited
                ? rsvpRetryMessage(600)
                : undefined
            }
          />
        );
      break;
  }
  const widgetStyle =
    'textStyle' in content
      ? textStyle(content.textStyle as import('../document/types').TextStyle)
      : {};
  const backgroundStatus =
    element.appearance.background?.kind === 'asset' ? (
      <BackgroundAssetStatus
        source={context.assetUrls[element.appearance.background.assetId]}
      />
    ) : null;
  const display = (
    <div
      data-measure-content
      style={{
        ...(widgetStyle as CSSProperties),
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 'inherit',
      }}
    >
      {backgroundStatus}
      {child}
    </div>
  );
  if (contentOnly) return display;
  return (
    <div
      data-rendered-element={element.id}
      style={elementFrameStyle(
        element.box,
        element.appearance,
        context.assetUrls,
        element.type,
        element.content,
      )}
    >
      {display}
    </div>
  );
}

export function InvitationRenderer({
  scene,
  context,
}: {
  scene: ResolvedScene;
  context: RenderContext;
}) {
  return (
    <InvitationCanvasDisplay canvas={scene.canvas} assets={context.assetUrls}>
      {scene.elements.map((element) => (
        <RenderElement key={element.id} element={element} context={context} />
      ))}
    </InvitationCanvasDisplay>
  );
}
