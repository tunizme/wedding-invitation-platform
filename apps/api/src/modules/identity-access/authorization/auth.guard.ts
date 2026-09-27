import {
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AccessTokenService } from '../auth/access-token.service';
import type { AuthenticatedPrincipal } from './principal';

const publicKey = 'iam:public';
export const Public = () => SetMetadata(publicKey, true);
export type AuthenticatedRequest = Request & {
  principal: Readonly<AuthenticatedPrincipal>;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessTokenService) private readonly tokens: AccessTokenService,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(publicKey, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer '))
      throw new UnauthorizedException();
    try {
      Object.defineProperty(request, 'principal', {
        value: this.tokens.verify(authorization.slice(7)),
        writable: false,
        configurable: false,
      });
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}
