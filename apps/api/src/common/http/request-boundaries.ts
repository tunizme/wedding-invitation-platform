import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  type INestApplication,
} from '@nestjs/common';
import {
  json,
  urlencoded,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

// Shared by each upload interceptor. Multipart decoding remains on upload
// routes only; limits also apply when Content-Length is absent (chunked upload).
export const builderMultipartLimits = Object.freeze({
  fileSize: 10 * 1024 * 1024,
  files: 1,
  fields: 2,
  fieldSize: 480,
  fieldNameSize: 32,
  headerPairs: 40,
});
export const BUILDER_MULTIPART_BODY_LIMIT = 10 * 1024 * 1024 + 64 * 1024;

export function configureRequestBoundaries(
  app: INestApplication,
  frontendOrigin: string,
): void {
  const parsers = {
    template: json({ limit: 1536 * 1024 }),
    invitation: json({ limit: 272 * 1024 }),
    rsvp: json({ limit: 8 * 1024 }),
    iam: json({ limit: 100 * 1024 }),
  };
  const form = urlencoded({
    extended: false,
    limit: 100 * 1024,
    parameterLimit: 1000,
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = request.path;
    if (request.is('multipart/form-data')) {
      const size = request.headers['content-length'];
      if (size !== undefined && Number(size) > BUILDER_MULTIPART_BODY_LIMIT)
        return next(new PayloadTooLargeException());
      return next();
    }
    const parser = /^\/api\/v1\/admin\/templates(?:\/|$)/.test(path)
      ? parsers.template
      : /^\/api\/v1\/public\/invitations\/[^/]+\/rsvps\/?$/.test(path)
        ? parsers.rsvp
        : /^\/api\/v1\/(?:admin\/)?invitations(?:\/|$)/.test(path) ||
            /^\/api\/v1\/admin\/customers\/[^/]+\/invitations(?:\/|$)/.test(
              path,
            )
          ? parsers.invitation
          : parsers.iam;
    const complete = (error?: unknown) => {
      if (!error) return next();
      // This callback receives parser errors only. Never reflect body samples,
      // encoding names or internal parser diagnostics through the public filter.
      const type =
        typeof error === 'object' && error !== null && 'type' in error
          ? error.type
          : undefined;
      next(
        type === 'entity.too.large' || type === 'parameters.too.many'
          ? new PayloadTooLargeException()
          : type === 'encoding.unsupported' || type === 'charset.unsupported'
            ? new UnsupportedMediaTypeException()
            : error instanceof HttpException
              ? error
              : new BadRequestException(),
      );
    };
    if (request.is('application/x-www-form-urlencoded'))
      form(request, response, complete);
    else parser(request, response, complete);
  });
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, origin === frontendOrigin),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-CSRF-Token',
      'Idempotency-Key',
      // 006 CSP-1 context/intent/session headers (contracts/auth-context.openapi.yaml).
      'X-Auth-Context',
      'X-Auth-Intent',
      'X-Auth-Session-Tag',
    ],
    exposedHeaders: ['Retry-After', 'Location'],
  });
}
