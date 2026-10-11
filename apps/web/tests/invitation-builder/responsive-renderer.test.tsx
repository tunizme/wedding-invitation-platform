import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { InvitationRenderer } from '../../src/features/invitation-builder/renderer/invitation-renderer';
import { resolveDesignV2 } from '../../src/features/invitation-builder/document/resolve-design-v2';
import type {
  TemplateDesignV2,
  SupportedResolvedScene,
} from '../../src/features/invitation-builder/document/types';
const document = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../../../specs/007-responsive-invitation-layout/contracts/fixtures/valid-v2.json',
    ),
    'utf8',
  ),
) as TemplateDesignV2;
const context = {
  mode: 'preview' as const,
  asOf: '2026-10-11T00:00:00.000Z',
  assetUrls: {
    '70000000-0000-4000-8000-000000000100': '/fixture-a.webp',
    '70000000-0000-4000-8000-000000000101': '/fixture-b.webp',
  },
};
describe('responsive shared renderer', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    ),
  );
  afterEach(() => vi.unstubAllGlobals());
  it('uses stable document IDs and intrinsic flow, with meaningful image alternatives', () => {
    const { scene } = resolveDesignV2(document, { schemaVersion: 1 }, context);
    const { container } = render(
      <InvitationRenderer scene={scene} context={context} />,
    );
    expect(
      [...container.querySelectorAll('[data-rendered-element]')].map((el) =>
        el.getAttribute('data-rendered-element'),
      ),
    ).toEqual(
      document.sectionOrder.flatMap((id) => document.sections[id].flowNodeIds),
    );
    expect(container.querySelector('[data-invitation-root]')).toHaveAttribute(
      'data-scene-version',
      '2',
    );
    expect(
      screen.getByText('Nguyễn Thị Minh Anh & Trần Quốc Bảo'),
    ).toBeVisible();
    expect(screen.getByRole('img', { name: 'Ảnh cưới 1' })).toHaveAttribute(
      'alt',
      'Ảnh cưới 1',
    );
    expect(container.querySelector('[data-role="flow"]')).not.toHaveStyle({
      position: 'absolute',
    });
  });
  it('fails closed for unsupported scene pairs', () => {
    expect(() =>
      render(
        <InvitationRenderer
          scene={
            {
              schemaVersion: 2,
              rendererContractVersion: 1,
            } as unknown as SupportedResolvedScene
          }
          context={context}
        />,
      ),
    ).toThrow('UNSUPPORTED_SCHEMA');
  });
  it('preserves legacy fixed geometry', () => {
    const { container } = render(
      <InvitationRenderer
        scene={{
          schemaVersion: 1,
          rendererContractVersion: 1,
          canvas: {
            width: 390,
            height: 520,
            background: { kind: 'solid', color: '#FFFFFF00' },
          },
          elements: [],
        }}
        context={context}
      />,
    );
    expect(container.querySelector('[data-testid="workarea"]')).toHaveStyle({
      width: '390px',
      height: '520px',
    });
  });
});
