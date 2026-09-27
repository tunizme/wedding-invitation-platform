export type UserRole = 'CUSTOMER' | 'ADMIN';

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: UserRole;
  readonly tokenId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface VerifiedPrincipalClaims {
  userId: string;
  sessionId: string;
  role: UserRole;
  tokenId: string;
  issuedAt: Date | string;
  expiresAt: Date | string;
}

const instant = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export function createAuthenticatedPrincipal(
  claims: VerifiedPrincipalClaims,
): Readonly<AuthenticatedPrincipal> {
  return Object.freeze({
    userId: claims.userId,
    sessionId: claims.sessionId,
    role: claims.role,
    tokenId: claims.tokenId,
    issuedAt: instant(claims.issuedAt),
    expiresAt: instant(claims.expiresAt),
  });
}
