import type { ValidationIssue } from '../domain/document.types';
import { TrustedRenderError } from './chromium-renderer';
export type CaptureIdentity = {
  candidateHash: string;
  containerWidth: 390 | 900;
  scenePair: readonly [1, 1] | readonly [2, 2];
  correlationId: string;
  hasVisibleRsvp: boolean;
};
type Rect = { x: number; y: number; width: number; height: number };
export type CaptureReportV2 = CaptureIdentity & {
  protocolVersion: 2;
  ready: boolean;
  issues: ValidationIssue[];
  rootRect: Rect;
  captureRect: Rect;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function closed(
  value: unknown,
  keys: string[],
  required = keys,
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function rect(value: unknown): value is Rect {
  return (
    closed(value, ['x', 'y', 'width', 'height']) &&
    Object.values(value).every(
      (n) => typeof n === 'number' && Number.isFinite(n),
    ) &&
    Number(value.width) > 0 &&
    Number(value.height) > 0
  );
}
export function assertV2Report(
  value: unknown,
  identity: CaptureIdentity,
): asserts value is CaptureReportV2 {
  const fail = () => {
    throw new TrustedRenderError('RENDER_VERSION_MISMATCH');
  };
  if (
    !closed(value, [
      'protocolVersion',
      'candidateHash',
      'scenePair',
      'containerWidth',
      'correlationId',
      'ready',
      'issues',
      'rootRect',
      'captureRect',
      'hasVisibleRsvp',
    ])
  )
    return fail();
  if (
    value.protocolVersion !== 2 ||
    value.candidateHash !== identity.candidateHash ||
    value.containerWidth !== identity.containerWidth ||
    value.correlationId !== identity.correlationId ||
    value.hasVisibleRsvp !== identity.hasVisibleRsvp ||
    typeof value.ready !== 'boolean' ||
    !Array.isArray(value.scenePair) ||
    value.scenePair.length !== 2 ||
    value.scenePair.some((n, i) => n !== identity.scenePair[i]) ||
    !rect(value.rootRect) ||
    !rect(value.captureRect)
  )
    return fail();
  if (
    Math.abs(value.rootRect.width - identity.containerWidth) > 1 ||
    (value.ready && value.rootRect.height > 12000) ||
    value.rootRect.x !== 0 ||
    value.rootRect.y !== 0 ||
    value.captureRect.x !== 0 ||
    value.captureRect.y !== 0 ||
    value.captureRect.width !== identity.containerWidth ||
    value.captureRect.height !== 520
  )
    return fail();
  if (
    !Array.isArray(value.issues) ||
    value.issues.length > 100 ||
    (value.ready && value.issues.length !== 0) ||
    (!value.ready && value.issues.length === 0)
  )
    return fail();
  for (const issue of value.issues) {
    if (
      !closed(
        issue,
        ['path', 'code', 'nodeId', 'sectionId', 'layout'],
        ['path', 'code'],
      ) ||
      typeof issue.path !== 'string' ||
      issue.path.length > 256 ||
      !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(issue.path) ||
      typeof issue.code !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(issue.code)
    )
      return fail();
    for (const key of ['nodeId', 'sectionId'])
      if (
        issue[key] !== undefined &&
        (typeof issue[key] !== 'string' || !uuid.test(issue[key]))
      )
        return fail();
    if (
      issue.layout !== undefined &&
      issue.layout !== 'mobile' &&
      issue.layout !== 'desktop'
    )
      return fail();
  }
}
