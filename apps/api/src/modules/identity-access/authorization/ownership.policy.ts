import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from './principal';

export interface PersistedOwnershipRule {
  persistedOwnerUserId: string;
  allowAdmin?: true;
}

@Injectable()
export class OwnershipPolicy {
  allows(
    principal: AuthenticatedPrincipal | undefined,
    rule: PersistedOwnershipRule,
  ): boolean {
    if (!principal) return false;
    if (principal.userId === rule.persistedOwnerUserId) return true;
    return rule.allowAdmin === true && principal.role === 'ADMIN';
  }

  authorize(
    principal: AuthenticatedPrincipal | undefined,
    rule: PersistedOwnershipRule,
  ): void {
    if (!this.allows(principal, rule)) throw new ForbiddenException();
  }
}
