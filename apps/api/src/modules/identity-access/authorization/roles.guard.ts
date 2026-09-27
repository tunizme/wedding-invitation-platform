import {
  Inject,
  Injectable,
  SetMetadata,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.guard';
import type { UserRole } from './principal';

const rolesKey = 'iam:roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(rolesKey, roles);
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(rolesKey, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const principal = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!principal || !roles.includes(principal.role))
      throw new ForbiddenException();
    return true;
  }
}
