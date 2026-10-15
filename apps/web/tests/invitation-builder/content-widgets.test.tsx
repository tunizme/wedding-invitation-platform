import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedWidget } from '../../src/features/invitation-builder/renderer/content-widgets';
import type { ResolvedAdvanced } from '../../src/features/invitation-builder/document/editor-document';
import type {
  RenderContext,
  WeddingEvent,
} from '../../src/features/invitation-builder/document/types';

const context: RenderContext = {
  mode: 'public',
  asOf: '2026-10-13T00:00:00Z',
  assetUrls: { one: '/one.png', two: '/two.png' },
};
function element(
  type: ResolvedAdvanced['type'],
  content: Record<string, unknown>,
): ResolvedAdvanced {
  return {
    id: 'widget',
    type,
    box: { x: 0, y: 0, width: 400, height: 200, rotation: 0 },
    appearance: { opacity: 1 },
    content: { label: 'Kỷ niệm', field: null, ...content },
  } as ResolvedAdvanced;
}
let reduced = false;
const listeners = new Set<() => void>();
beforeEach(() => {
  reduced = false;
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  listeners.clear();
});
const carousel = element('Carousel', {
  assetIds: ['one', 'two'],
  autoplay: true,
  durationSec: 0.5,
  delaySec: 0,
});
const draw = (mode: RenderContext['mode'] = 'public') =>
  render(
    <AdvancedWidget
      element={carousel}
      context={{ ...context, mode }}
      locale="vi"
    />,
  );
const advance = () =>
  act(() => {
    vi.advanceTimersByTime(3000);
  });

describe('carousel motion and controls', () => {
  it.each(['stack', 'feature'] as const)(
    'navigates %s cards while keeping neighboring images decorative',
    (carouselLayout) => {
      const { container } = render(
        <AdvancedWidget
          element={{
            ...carousel,
            content: {
              ...carousel.content,
              carouselLayout,
              assetIds: ['one', 'two', 'three'],
            },
          }}
          context={{
            ...context,
            assetUrls: { ...context.assetUrls, three: '/three.png' },
          }}
          locale="vi"
        />,
      );
      expect(container.querySelector('[data-carousel-layout]')).toHaveAttribute(
        'data-carousel-layout',
        carouselLayout,
      );
      expect(screen.getByRole('img')).toHaveAttribute('src', '/one.png');
      expect(screen.getByText('01 / 03')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Ảnh sau' }));
      expect(screen.getByRole('img')).toHaveAttribute('src', '/two.png');
      fireEvent.keyDown(screen.getByRole('button', { name: 'Ảnh sau' }), {
        key: 'ArrowLeft',
      });
      expect(screen.getByRole('img')).toHaveAttribute('src', '/one.png');
      fireEvent.click(screen.getByRole('button', { name: 'Ảnh trước' }));
      expect(screen.getByRole('img')).toHaveAttribute('src', '/three.png');
    },
  );
  it('autoplays, pauses on focus until explicitly resumed, and supports manual navigation', () => {
    vi.useFakeTimers();
    draw();
    advance();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/two.png');
    expect(screen.getByRole('img')).toHaveAccessibleName('Kỷ niệm 2');
    act(() => screen.getByRole('button', { name: 'Ảnh sau' }).focus());
    advance();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/two.png');
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    advance();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/one.png');
    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }));
    advance();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/one.png');
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh sau' }));
    expect(screen.getByRole('img')).toHaveAttribute('src', '/two.png');
  });
  it('suspends autoplay on hover and immediately when reduced motion changes', () => {
    vi.useFakeTimers();
    const { container } = draw();
    fireEvent.mouseEnter(container.firstChild!);
    advance();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/one.png');
    fireEvent.mouseLeave(container.firstChild!);
    advance();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/two.png');
    act(() => {
      reduced = true;
      listeners.forEach((fn) => fn());
    });
    advance();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/two.png');
  });
  it.each(['preview', 'capture', 'editor'] as const)(
    'stays static in %s',
    (mode) => {
      vi.useFakeTimers();
      draw(mode);
      advance();
      expect(screen.getByRole('img')).toHaveAttribute('src', '/one.png');
      expect(screen.queryByRole('button', { name: 'Tạm dừng' })).toBeNull();
    },
  );
  it('uses stack for an older carousel without a layout and exposes motion timing', () => {
    const { container } = draw();
    expect(container.querySelector('[data-carousel-layout]')).toHaveAttribute(
      'data-carousel-layout',
      'stack',
    );
    expect(container.querySelector('[data-layout="stack"]')).toHaveStyle({
      '--carousel-duration': '500ms',
    });
  });
});

describe('contact and calendar reminder', () => {
  it('keeps a callable phone link and applies icon visibility and colors', () => {
    const node = element('Contact', {
      phone: '+84 (90) 123-4567',
      showIcon: false,
      buttonColor: '#112233FF',
      textColor: '#FFFFFFFF',
    });
    const { container, rerender } = render(
      <AdvancedWidget element={node} context={context} locale="vi" />,
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'tel:+84901234567',
    );
    expect(screen.getByRole('link')).toHaveStyle({
      background: '#112233FF',
      color: '#FFFFFFFF',
    });
    expect(container.querySelector('svg')).toBeNull();
    rerender(
      <AdvancedWidget
        element={{ ...node, content: { ...node.content, showIcon: true } }}
        context={context}
        locale="vi"
      />,
    );
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
  function reminder(event: WeddingEvent, allDay: boolean) {
    render(
      <AdvancedWidget
        element={element('Reminder', {
          event,
          allDay,
          description: 'Lễ cưới, gia đình; bạn bè\nHẹn gặp',
          location: 'Hà Nội',
        })}
        context={context}
        locale="vi"
      />,
    );
    return decodeURIComponent(
      screen
        .getByRole('link')
        .getAttribute('href')!
        .split(',')
        .slice(1)
        .join(','),
    );
  }
  it('exports all-day dates in the event time zone across a year boundary', () => {
    const ics = reminder(
      { datetime: '2026-12-31T18:00:00Z', timeZone: 'Asia/Ho_Chi_Minh' },
      true,
    );
    expect(ics).toContain(
      'DTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102',
    );
    expect(ics).toContain(
      'DESCRIPTION:Lễ cưới\\, gia đình\\; bạn bè\\nHẹn gặp',
    );
    expect(ics).toContain('LOCATION:Hà Nội');
  });
  it('keeps timed reminders as exact UTC instants', () => {
    const ics = reminder(
      { datetime: '2027-01-01T01:00:00+07:00', timeZone: 'Asia/Ho_Chi_Minh' },
      false,
    );
    expect(ics).toContain('DTSTART:20261231T180000Z\r\nDTEND:20261231T190000Z');
  });
  it('does not offer an invalid calendar download', () => {
    render(
      <AdvancedWidget
        element={element('Reminder', { event: { datetime: 'invalid' } })}
        context={context}
        locale="vi"
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });
});
