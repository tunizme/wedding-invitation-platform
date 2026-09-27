import type { UserProfile } from '../api/client';

export type FrontendCapability = 'SELF_SERVICE' | 'ADMIN_CUSTOMERS';

export function canShowCapability(
  principal: UserProfile | null,
  capability: FrontendCapability,
): boolean {
  if (!principal) return false;
  if (capability === 'SELF_SERVICE') return true;
  return principal.role === 'ADMIN';
}
