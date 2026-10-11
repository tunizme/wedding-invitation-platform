import { useMemo } from 'react';
import type { HostInput } from '../../../../../e2e/responsive-host/mount';
import pilot from '../../../../../e2e/invitation-builder/fixtures/responsive-pilot.json';
import { validateSupportedTemplateDesign } from '../../document/schema';
import { resolveDesign } from '../../document/resolve-design';
import { measureReadyScene } from '../measure';
import { InvitationRenderer } from '../invitation-renderer';
const photo =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#dfc5ab"/></svg>',
  );
function resolved(input: HostInput) {
  const document = validateSupportedTemplateDesign(input.fixture ?? pilot);
  if (!document.valid) throw new Error(JSON.stringify(document.issues));
  const context = {
    mode: input.validationState ? ('capture' as const) : input.mode,
    validationState: input.validationState,
    asOf: '2026-10-11T00:00:00.000Z',
    invitation: {
      slug: '70000000-0000-4000-8000-000000000999',
      publicVersion: 1,
      rsvpOpen: true,
    },
    assetUrls:
      input.assetUrls ??
      Object.fromEntries(
        [100, 101].map((n) => [
          `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
          photo,
        ]),
      ),
  };
  const result = resolveDesign(document.value, { schemaVersion: 1 }, context);
  return { result, context };
}
export async function measureHost(input: HostInput, root: HTMLElement) {
  const { result } = resolved(input);
  try {
    return {
      ready: true,
      issues: await measureReadyScene(root, result.scene, {
        deadline: Date.now() + 8000,
      }),
    };
  } catch (error) {
    return {
      ready: false,
      issues: [
        {
          path: '/',
          code:
            error instanceof Error ? error.message : 'RENDER_ASSET_NOT_READY',
        },
      ],
    };
  }
}
export default function Adapter({ input }: { input: HostInput }) {
  const { fixture, mode, validationState, assetUrls } = input;
  const { result, context } = useMemo(
    () => resolved({ width: 0, fixture, mode, validationState, assetUrls }),
    [fixture, mode, validationState, assetUrls],
  );
  return (
    <InvitationRenderer
      scene={result.scene}
      context={context}
      hostPolicy={input.popup ? 'mobile' : 'adaptive'}
    />
  );
}
