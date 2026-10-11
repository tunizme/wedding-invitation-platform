import { randomUUID } from 'node:crypto';
import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimitExceeded } from '../../modules/identity-access/infrastructure/rate-limit.service';
import {
  AuthTransitionProblemException,
  OnboardingCannotCompleteException,
  PasswordChangeNotApplicableException,
  BuilderProblemException,
} from './public-problem.exception';
import {
  AssetObjectMissingError,
  StorageUnavailableError,
} from '../../modules/invitation-assets/domain/asset-store.port';
import {
  safePath,
  UUID_EXPRESSION,
} from '../../modules/invitation-builder/domain/validation-helpers';

const issueCodes = new Set(
  'INVALID_VALUE JSON_BOUNDS UNSUPPORTED_SCHEMA TYPE_OR_FIELD_INVALID TREE_INVALID CONTENT_BOX_EMPTY PROPERTY_NOT_APPLICABLE PROPERTY_REQUIRED BINDING_REQUIRED DUPLICATE_ID WIDGET_LIMIT TIME_ZONE_INVALID DATETIME_INVALID DOCUMENT_INVALID BINDING_INVALID REQUIRED_DATA_MISSING CONTENT_OVERFLOW ASSET_UNAVAILABLE FONT_UNAVAILABLE NODE_LIMIT GEOMETRY_INVALID'.split(
    ' ',
  ),
);

const titles: Record<number, string> = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Not found',
  409: 'Cannot complete request',
  413: 'Payload too large',
  415: 'Unsupported media type',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Internal server error',
  503: 'Service unavailable',
};
const codes: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'ACCESS_DENIED',
  404: 'NOT_FOUND',
  409: 'CANNOT_COMPLETE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const multerCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    const multipartTooLarge =
      multerCode === 'LIMIT_FILE_SIZE' ||
      multerCode === 'LIMIT_FIELD_VALUE' ||
      multerCode === 'LIMIT_PART_COUNT';
    const status = multipartTooLarge
      ? 413
      : multerCode === 'LIMIT_UNEXPECTED_FILE' ||
          multerCode === 'LIMIT_FIELD_COUNT'
        ? 422
        : error instanceof HttpException
          ? error.getStatus()
          : error instanceof AssetObjectMissingError
            ? 404
            : error instanceof StorageUnavailableError
              ? 503
              : 500;
    const code =
      error instanceof BuilderProblemException ||
      error instanceof AuthTransitionProblemException ||
      error instanceof OnboardingCannotCompleteException ||
      error instanceof PasswordChangeNotApplicableException
        ? error.problemCode
        : error instanceof StorageUnavailableError
          ? 'STORAGE_UNAVAILABLE'
          : (codes[status] ?? 'REQUEST_FAILED');
    if (error instanceof RateLimitExceeded)
      response.setHeader('Retry-After', error.retryAfter);
    if (
      error instanceof BuilderProblemException &&
      error.retryAfter !== undefined
    )
      response.setHeader('Retry-After', error.retryAfter);
    // Never serialize arbitrary exception messages, request values or SQL details.
    response
      .status(status)
      .type('application/problem+json')
      .setHeader('Cache-Control', 'no-store');
    response.json({
      type: 'about:blank',
      title: titles[status] ?? 'Request failed',
      status,
      code,
      requestId: randomUUID(),
      ...(error instanceof AuthTransitionProblemException &&
      error.currentRevision !== undefined
        ? { currentRevision: error.currentRevision }
        : {}),
      ...(error instanceof BuilderProblemException && error.issues.length
        ? {
            issues: error.issues.slice(0, 100).map((entry) => ({
              path: safePath(entry.path.slice(0, 2048)),
              code: issueCodes.has(entry.code) ? entry.code : 'INVALID_VALUE',
              ...(entry.nodeId && UUID_EXPRESSION.test(entry.nodeId)
                ? { nodeId: entry.nodeId }
                : {}),
              ...(entry.sectionId && UUID_EXPRESSION.test(entry.sectionId)
                ? { sectionId: entry.sectionId }
                : {}),
              ...(entry.layout && ['mobile', 'desktop'].includes(entry.layout)
                ? { layout: entry.layout }
                : {}),
            })),
          }
        : {}),
    });
  }
}
