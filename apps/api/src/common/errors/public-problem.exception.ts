import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';

export const BUILDER_PROBLEM_CODES = [
  'DOCUMENT_INVALID',
  'UNSUPPORTED_SCHEMA',
  'BINDING_INVALID',
  'REQUIRED_DATA_MISSING',
  'CONTENT_OVERFLOW',
  'ASSET_UNAVAILABLE',
  'ASSET_IN_USE',
  'UPLOAD_INVALID',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'TEMPLATE_UNAVAILABLE',
  'NOT_PUBLISHED',
  'PUBLICATION_IN_PROGRESS',
  'RSVP_CLOSED',
  'RENDER_QUEUE_FULL',
  'RENDER_UNAVAILABLE',
  'RENDER_TIMEOUT',
  'RENDER_VERSION_MISMATCH',
  'FONT_UNAVAILABLE',
  'STORAGE_UNAVAILABLE',
] as const;
export type BuilderProblemCode = (typeof BUILDER_PROBLEM_CODES)[number];
export interface SafeProblemIssue {
  path: string;
  nodeId?: string;
  code: string;
}
export class BuilderProblemException extends HttpException {
  constructor(
    status: number,
    readonly problemCode: BuilderProblemCode,
    readonly issues: SafeProblemIssue[] = [],
    readonly retryAfter?: number,
  ) {
    super(problemCode, status);
  }
}

/** 006 CSP-1 problem codes (contracts/auth-context.openapi.yaml). */
export type AuthTransitionProblemCode =
  | 'BINDING_INVALID'
  | 'STALE_REVISION'
  | 'SUPERSEDED'
  | 'CREDENTIAL_MISSING'
  | 'CAPACITY_EXHAUSTED'
  | 'CONTEXT_UNAVAILABLE';
const authTransitionStatus: Record<AuthTransitionProblemCode, number> = {
  BINDING_INVALID: 401,
  STALE_REVISION: 409,
  SUPERSEDED: 409,
  CREDENTIAL_MISSING: 401,
  CAPACITY_EXHAUSTED: 409,
  CONTEXT_UNAVAILABLE: 410,
};
export class AuthTransitionProblemException extends HttpException {
  constructor(
    readonly problemCode: AuthTransitionProblemCode,
    /** Only for STALE_REVISION: read-only current revision of the context. */
    readonly currentRevision?: number,
  ) {
    super(problemCode, authTransitionStatus[problemCode]);
  }
}

export class OnboardingCannotCompleteException extends ConflictException {
  readonly problemCode = 'ONBOARDING_CANNOT_COMPLETE' as const;
}

export class PasswordChangeNotApplicableException extends BadRequestException {
  readonly problemCode = 'PASSWORD_CHANGE_NOT_APPLICABLE' as const;
}
