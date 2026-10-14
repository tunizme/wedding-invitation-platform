import { InvitationRenderer } from '../../src/features/invitation-builder/renderer/invitation-renderer';
import type { SupportedResolvedScene } from '../../src/features/invitation-builder/document/types';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBlankDocument,
  resolveEditorDocument,
  type AdvancedNode,
} from '../../src/features/invitation-builder/document/editor-document';
import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';
import { CanvasRenderer } from '../../src/features/invitation-builder/renderer/canvas-renderer';
import { CalendarWidget } from '../../src/features/invitation-builder/renderer/widgets/calendar';
import { CountdownWidget } from '../../src/features/invitation-builder/renderer/widgets/countdown';
import { RsvpWidget } from '../../src/features/invitation-builder/renderer/widgets/rsvp';
const id = '00000000-0000-4000-8000-000000000001';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('500px render modes', () => {
  it('rejects retired scene contracts rather than dispatching to a legacy renderer', () => {
    const context = {
      mode: 'capture' as const,
      asOf: '2026-01-01T00:00:00Z',
      assetUrls: {},
    };
    const scene = resolveEditorDocument(
      createBlankDocument(),
      { schemaVersion: 1 },
      context,
    ).scene;
    for (const version of [1, 2])
      expect(() =>
        InvitationRenderer({
          scene: {
            ...scene,
            schemaVersion: version,
            rendererContractVersion: version,
          } as unknown as SupportedResolvedScene,
          context,
        }),
      ).toThrow('UNSUPPORTED_SCHEMA');
  });
  it('captures an opened envelope with static YouTube poster and no external embed or audio', () => {
    const document = createBlankDocument();
    const base = primitiveNode('Text');
    document.nodes[id] = {
      ...base,
      type: { resolvedName: 'YouTube' },
      displayName: 'YouTube',
      props: {
        ...base.props,
        bindings: [],
        content: {
          label: 'Video',
          field: null,
          videoId: 'dQw4w9WgXcQ',
          posterId: null,
        },
      },
    } as AdvancedNode;
    document.nodes.ROOT.nodes = [id];
    document.settings.envelope = true;
    document.settings.particles = 'petals';
    const context = {
      mode: 'capture' as const,
      asOf: '2026-10-12T00:00:00Z',
      assetUrls: {},
    };
    const { container } = render(
      <CanvasRenderer
        scene={
          resolveEditorDocument(document, { schemaVersion: 1 }, context).scene
        }
        context={context}
      />,
    );
    expect(container.querySelector('[data-invitation-root]')).toHaveStyle({
      width: '500px',
    });
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mở thiệp' })).toBeNull();
  });
  it('never submits a custom form in preview', () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const document = createBlankDocument();
    const base = primitiveNode('Text');
    document.nodes[id] = {
      ...base,
      type: { resolvedName: 'CustomForm' },
      displayName: 'CustomForm',
      props: {
        ...base.props,
        bindings: [],
        content: {
          label: 'Reply',
          field: null,
          fields: [
            {
              id: 'name',
              label: 'Name',
              type: 'text',
              required: true,
              options: [],
            },
          ],
        },
      },
    } as AdvancedNode;
    document.nodes.ROOT.nodes = [id];
    document.settings.locale = 'en';
    const context = {
      mode: 'preview' as const,
      asOf: '2026-10-12T00:00:00Z',
      assetUrls: {},
    };
    render(
      <CanvasRenderer
        scene={
          resolveEditorDocument(document, { schemaVersion: 1 }, context).scene
        }
        context={context}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
    expect(screen.getByText('Preview — no data is submitted')).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('localizes widget controls while retaining authored text', () => {
    render(
      <>
        <CalendarWidget
          locale="en"
          datetime="2027-01-01T12:00:00Z"
          timeZone="UTC"
          accentColor="#AABBCCFF"
        />
        <CountdownWidget
          locale="en"
          datetime="2027-01-01T12:00:00Z"
          timeZone="UTC"
          asOf="2026-01-01T00:00:00Z"
          label="Ngày của chúng mình"
          endedLabel="Đã đến"
        />
        <RsvpWidget
          locale="en"
          title="Lời mời riêng"
          mode="capture"
          displayState="open"
        />
      </>,
    );
    expect(screen.getByText('Mon')).toBeVisible();
    expect(screen.getByText('Days')).toBeVisible();
    expect(screen.getByText('Ngày của chúng mình')).toBeVisible();
    expect(screen.getByLabelText('Guest name')).toBeVisible();
    expect(screen.getByText('Lời mời riêng')).toBeVisible();
  });
});
