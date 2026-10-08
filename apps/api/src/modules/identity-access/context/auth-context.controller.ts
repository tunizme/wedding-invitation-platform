import {
  Body,
  Controller,
  Header,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  IDENTITY_CONFIG,
  type IdentityEnvironment,
} from '../../../config/identity-access.environment';
import { BrowserSecurityService } from '../auth/browser-security.service';
import { Public } from '../authorization/auth.guard';
import type { AuthIntentKind } from '../domain/entities';
import { RateLimitService } from '../infrastructure/rate-limit.service';
import { AuthContextService } from './auth-context.service';
import { AuthIntentService, type ReserveInput } from './auth-intent.service';

const KINDS: readonly AuthIntentKind[] = [
  'LOCAL_LOGIN',
  'OAUTH',
  'ONBOARDING_COMPLETE',
  'LOGOUT',
];

function emptyBody(body: unknown): void {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length
  )
    throw new UnprocessableEntityException();
}

function reserveInput(body: unknown): ReserveInput {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        !['kind', 'expectedRevision', 'expectedSessionTag'].includes(key),
    )
  )
    throw new UnprocessableEntityException();
  const value = body as Record<string, unknown>;
  const tag = value.expectedSessionTag;
  if (
    !KINDS.includes(value.kind as AuthIntentKind) ||
    (value.kind === 'LOGOUT' && tag === undefined) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    (value.expectedRevision as number) < 0 ||
    (tag !== undefined &&
      tag !== null &&
      (typeof tag !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(tag)))
  )
    throw new UnprocessableEntityException();
  return {
    kind: value.kind as AuthIntentKind,
    expectedRevision: value.expectedRevision as number,
    expectedSessionTag: typeof tag === 'string' ? tag : null,
  };
}

/** 006 CSP-1 context routes (contracts/auth-context.openapi.yaml). */
@Controller('auth/contexts')
@Public()
export class AuthContextController {
  constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnvironment,
    @Inject(AuthContextService) private readonly contexts: AuthContextService,
    @Inject(AuthIntentService) private readonly intents: AuthIntentService,
    @Inject(BrowserSecurityService)
    private readonly browser: BrowserSecurityService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
  ) {}

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async provision(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.requireOrigin(request, true);
    emptyBody(body);
    await this.limiter.consume(
      'AUTH_CONTEXT_PROVISION',
      this.limiter.ip(request),
    );
    const { contextId, secret } = await this.contexts.provision(request);
    this.browser.writeBinding(
      response,
      contextId,
      secret,
      this.config.authContext.provisionalBindingSeconds,
    );
    return {
      authProtocol: 2 as const,
      contextId,
      state: 'PROVISIONAL' as const,
      revision: 0 as const,
    };
  }

  @Post(':contextId/confirm')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async confirm(
    @Param('contextId') contextId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.requireOrigin(request, true);
    emptyBody(body);
    await this.limiter.consume('AUTH_CONTEXT_CONFIRM', contextId);
    const confirmed = await this.contexts.confirm(request, contextId);
    this.browser.clearProtocolNames(response, confirmed.cleanupNames);
    this.browser.writeBinding(
      response,
      contextId,
      confirmed.secret,
      this.config.authContext.confirmedBindingSeconds,
    );
    return {
      authProtocol: 2 as const,
      contextId,
      state: 'ACTIVE' as const,
      revision: confirmed.revision,
      sessionTag: confirmed.sessionTag,
    };
  }

  @Post(':contextId/intents')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async reserve(
    @Param('contextId') contextId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    this.browser.requireOrigin(request, true);
    const input = reserveInput(body);
    await this.limiter.consume('AUTH_INTENT_RESERVE', contextId);
    const reserved = await this.intents.reserve(request, contextId, input);
    return {
      authProtocol: 2 as const,
      intentId: reserved.intentId,
      kind: reserved.kind,
      revision: reserved.revision,
      expiresAt: reserved.expiresAt.toISOString(),
    };
  }

  @Get(':contextId/intents/:intentId')
  @Header('Cache-Control', 'no-store')
  async outcome(
    @Param('contextId') contextId: string,
    @Param('intentId') intentId: string,
    @Req() request: Request,
  ) {
    this.browser.requireOrigin(request);
    return this.intents.outcome(request, contextId, intentId);
  }
}
