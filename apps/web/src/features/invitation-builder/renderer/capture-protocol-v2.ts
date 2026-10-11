import { rawDesignV2Schema, validateV2Semantics } from '../document/schema-v2';
import type { TemplateDesignV2 } from '../document/types';
import { validateSupportedTemplateDesign } from '../document/schema';
import { UUID_EXPRESSION } from '../document/validation-helpers';
import { createBankQrPayload } from '../document/qr-bank';
import type {
  SupportedResolvedScene,
  RenderContext,
  ValidationIssue,
} from '../document/types';
export type CaptureRequestV2 = {
  protocolVersion: 2;
  candidateHash: string;
  scene: SupportedResolvedScene;
  context: RenderContext & { mode: 'capture' };
  states: 'publication-validation';
  containerWidth: 390 | 900;
  scenePair: [1, 1] | [2, 2];
  correlationId: string;
};
export type CaptureRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type CaptureReportV2 = {
  protocolVersion: 2;
  candidateHash: string;
  scenePair: [1, 1] | [2, 2];
  containerWidth: 390 | 900;
  correlationId: string;
  ready: boolean;
  issues: ValidationIssue[];
  rootRect: CaptureRect;
  captureRect: CaptureRect;
  hasVisibleRsvp: boolean;
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function closed(
  value: unknown,
  keys: string[],
  required = keys,
): asserts value is Record<string, unknown> {
  if (
    !object(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error('RENDER_REQUEST_INVALID');
}
function authoredContent(type: unknown, content: unknown) {
  if (!object(content)) throw new Error('RENDER_REQUEST_INVALID');
  const copy = structuredClone(content);
  let bindings: unknown[] = [];
  const fields: { [key: string]: [string, string, string] } = {
    Calendar: ['event', 'event', 'wedding.event'],
    Countdown: ['event', 'event', 'wedding.event'],
    Map: ['venue', 'venue', 'venue'],
    QRBank: ['bank', 'bank', 'bank'],
    Timeline: ['entries', 'entries', 'timeline'],
  };
  const binding = fields[String(type)];
  if (binding) {
    const [field, target, source] = binding;
    if (!Object.hasOwn(copy, field)) throw new Error('RENDER_REQUEST_INVALID');
    bindings = [
      {
        target,
        source,
        fallback: copy[field],
        ...(['event', 'venue'].includes(target)
          ? { eventKey: 'ceremony' }
          : {}),
      },
    ];
    delete copy[field];
  }
  if (type === 'QRBank') {
    if (
      typeof content.qrPayload !== 'string' ||
      createBankQrPayload(
        content.bank as Parameters<typeof createBankQrPayload>[0],
      ) !== content.qrPayload
    )
      throw new Error('RENDER_REQUEST_INVALID');
    delete copy.qrPayload;
  }
  return { content: copy, bindings };
}
/** Reconstruct only authored fields to reuse strict content/property validators; never change the supplied snapshot. */
function validateScene(
  scene: unknown,
): asserts scene is SupportedResolvedScene {
  if (!object(scene)) throw new Error('RENDER_REQUEST_INVALID');
  const custom = { layerName: 'Capture', locked: true, optional: false };
  let document: unknown;
  if (scene.schemaVersion === 2 && scene.rendererContractVersion === 2) {
    closed(scene, [
      'schemaVersion',
      'rendererContractVersion',
      'viewport',
      'background',
      'sectionOrder',
      'sections',
      'nodes',
    ]);
    if (!object(scene.sections) || !object(scene.nodes))
      throw new Error('RENDER_REQUEST_INVALID');
    const sections: Record<string, unknown> = {},
      nodes: Record<string, unknown> = {};
    for (const [id, section] of Object.entries(scene.sections)) {
      closed(section, [
        'id',
        'background',
        'flowNodeIds',
        'artworkNodeIds',
        'mobile',
        'desktop',
      ]);
      sections[id] = { ...section, label: 'Capture', hidden: false };
    }
    for (const [id, node] of Object.entries(scene.nodes)) {
      closed(node, [
        'id',
        'type',
        'content',
        'appearance',
        'role',
        'mobile',
        'desktop',
      ]);
      nodes[id] = {
        ...node,
        ...authoredContent(node.type, node.content),
        custom,
        hidden: false,
      };
    }
    document = {
      schemaVersion: 2,
      viewport: scene.viewport,
      background: scene.background,
      sectionOrder: scene.sectionOrder,
      sections,
      nodes,
    };
  } else if (scene.schemaVersion === 1 && scene.rendererContractVersion === 1) {
    closed(scene, [
      'schemaVersion',
      'rendererContractVersion',
      'canvas',
      'elements',
    ]);
    if (!Array.isArray(scene.elements))
      throw new Error('RENDER_REQUEST_INVALID');
    const ids: string[] = [],
      nodes: Record<string, unknown> = {};
    for (const element of scene.elements) {
      closed(element, ['id', 'type', 'box', 'appearance', 'content']);
      if (typeof element.id !== 'string')
        throw new Error('RENDER_REQUEST_INVALID');
      ids.push(element.id);
      nodes[element.id] = {
        type: { resolvedName: element.type },
        isCanvas: false,
        displayName: element.type,
        custom,
        hidden: false,
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
        props: {
          box: element.box,
          appearance: element.appearance,
          ...authoredContent(element.type, element.content),
        },
      };
    }
    nodes.ROOT = {
      type: { resolvedName: 'InvitationCanvas' },
      isCanvas: true,
      displayName: 'InvitationCanvas',
      custom: {},
      hidden: false,
      nodes: ids,
      linkedNodes: {},
      props: { canvas: scene.canvas },
    };
    document = { schemaVersion: 1, nodes };
  } else throw new Error('RENDER_REQUEST_INVALID');
  const parsed =
    scene.schemaVersion === 2
      ? rawDesignV2Schema.safeParse(document)
      : undefined;
  const checked = parsed?.success
    ? validateV2Semantics(parsed.data as TemplateDesignV2)
    : scene.schemaVersion === 2
      ? { valid: false }
      : validateSupportedTemplateDesign(document);
  if (!checked.valid) throw new Error('RENDER_REQUEST_INVALID');
}
export function validateCaptureRequestV2(value: unknown): CaptureRequestV2 {
  closed(value, [
    'protocolVersion',
    'candidateHash',
    'scene',
    'context',
    'states',
    'containerWidth',
    'scenePair',
    'correlationId',
  ]);
  if (
    value.protocolVersion !== 2 ||
    value.states !== 'publication-validation' ||
    typeof value.candidateHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.candidateHash) ||
    typeof value.correlationId !== 'string' ||
    !UUID_EXPRESSION.test(value.correlationId) ||
    ![390, 900].includes(value.containerWidth as number)
  )
    throw new Error('RENDER_REQUEST_INVALID');
  closed(
    value.context,
    ['mode', 'asOf', 'assetUrls', 'invitation'],
    ['mode', 'asOf', 'assetUrls'],
  );
  if (
    value.context.mode !== 'capture' ||
    typeof value.context.asOf !== 'string' ||
    !Number.isFinite(Date.parse(value.context.asOf)) ||
    !object(value.context.assetUrls)
  )
    throw new Error('RENDER_REQUEST_INVALID');
  for (const [id, url] of Object.entries(value.context.assetUrls))
    if (!UUID_EXPRESSION.test(id) || url !== `/__render-assets/${id}`)
      throw new Error('RENDER_REQUEST_INVALID');
  if (value.context.invitation !== undefined) {
    closed(value.context.invitation, ['slug', 'publicVersion', 'rsvpOpen']);
    if (
      typeof value.context.invitation.slug !== 'string' ||
      !UUID_EXPRESSION.test(value.context.invitation.slug) ||
      !Number.isSafeInteger(value.context.invitation.publicVersion) ||
      Number(value.context.invitation.publicVersion) < 1 ||
      typeof value.context.invitation.rsvpOpen !== 'boolean'
    )
      throw new Error('RENDER_REQUEST_INVALID');
  }
  validateScene(value.scene);
  if (
    !Array.isArray(value.scenePair) ||
    value.scenePair.length !== 2 ||
    value.scenePair[0] !== value.scene.schemaVersion ||
    value.scenePair[1] !== value.scene.rendererContractVersion ||
    (value.scene.schemaVersion === 1 && value.containerWidth !== 390)
  )
    throw new Error('RENDER_REQUEST_INVALID');
  return value as unknown as CaptureRequestV2;
}
