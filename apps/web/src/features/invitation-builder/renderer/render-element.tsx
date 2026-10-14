import { PublicRsvp } from '../../invitations/public-rsvp';
import type { CSSProperties } from 'react';
import type {
  RenderContext,
  ResolvedElement,
  ContentByKind,
} from '../document/types';
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
  intrinsic = false,
  locale = 'vi',
}: {
  element: ResolvedElement;
  context: RenderContext;
  contentOnly?: boolean;
  intrinsic?: boolean;
  locale?: 'vi' | 'en';
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
          locale={locale}
          datetime={event.datetime}
          timeZone={event.timeZone}
          accentColor={content.accentColor as string}
          variant={content.variant as 'classic' | 'minimal' | 'filled'}
        />
      );
      break;
    }
    case 'Countdown': {
      const event = content.event as { datetime: string; timeZone: string };
      child = (
        <CountdownWidget
          locale={locale}
          validationState={context.validationState?.countdown}
          live={context.mode === 'public'}
          datetime={event.datetime}
          timeZone={event.timeZone}
          asOf={context.asOf}
          label={content.label as string}
          endedLabel={content.endedLabel as string}
          layout={content.layout as 'horizontal' | 'vertical' | undefined}
          gap={content.gap as number | undefined}
          frameColor={content.frameColor as string | undefined}
        />
      );
      break;
    }
    case 'Map':
      child = (
        <MapWidget
          locale={locale}
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
            locale={locale}
            slug={context.invitation.slug}
            title={content.title as string}
            closedLabel={content.closedLabel as string}
            successLabel={content.successLabel as string}
            nameLabel={content.nameLabel as string | undefined}
            submitLabel={content.submitLabel as string | undefined}
            buttonColor={content.buttonColor as string | undefined}
            buttonTextColor={content.buttonTextColor as string | undefined}
          />
        ) : (
          <RsvpWidget
            locale={locale}
            title={content.title as string}
            closedLabel={content.closedLabel as string}
            successLabel={content.successLabel as string}
            nameLabel={content.nameLabel as string | undefined}
            submitLabel={content.submitLabel as string | undefined}
            buttonColor={content.buttonColor as string | undefined}
            buttonTextColor={content.buttonTextColor as string | undefined}
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
        height: intrinsic ? undefined : '100%',
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
