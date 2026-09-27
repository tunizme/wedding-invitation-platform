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
  OnboardingCannotCompleteException,
  PasswordChangeNotApplicableException,
} from './public-problem.exception';

const titles: Record<number, string> = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Not found',
  409: 'Cannot complete request',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Internal server error',
};
const codes: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'ACCESS_DENIED',
  404: 'NOT_FOUND',
  409: 'CANNOT_COMPLETE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const code =
      error instanceof OnboardingCannotCompleteException ||
      error instanceof PasswordChangeNotApplicableException
        ? error.problemCode
        : (codes[status] ?? 'REQUEST_FAILED');
    if (error instanceof RateLimitExceeded)
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
    });
  }
}
