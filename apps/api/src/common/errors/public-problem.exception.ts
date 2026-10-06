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

export class OnboardingCannotCompleteException extends ConflictException {
  readonly problemCode = 'ONBOARDING_CANNOT_COMPLETE' as const;
}

export class PasswordChangeNotApplicableException extends BadRequestException {
  readonly problemCode = 'PASSWORD_CHANGE_NOT_APPLICABLE' as const;
}
