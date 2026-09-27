import { randomUUID } from 'node:crypto';
import { decode, sign, verify } from 'jsonwebtoken';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import {
  createAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
  type UserRole,
} from '../authorization/principal';

export interface AccessTokenSubject {
  readonly sub: string;
  readonly sid: string;
  readonly role: UserRole;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AccessTokenService {
  constructor(private readonly config: IdentityEnvironment) {}

  issue(
    principal: AccessTokenSubject,
    now = Math.floor(Date.now() / 1000),
  ): string {
    return sign(
      {
        sub: principal.sub,
        sid: principal.sid,
        role: principal.role,
        jti: randomUUID(),
        iat: now,
        exp: now + 900,
      },
      this.config.privateKey,
      {
        algorithm: 'RS256',
        issuer: this.config.issuer,
        audience: this.config.audience,
        header: { alg: 'RS256', typ: 'at+jwt', kid: this.config.kid },
      },
    );
  }

  verify(
    token: string,
    now = Math.floor(Date.now() / 1000),
  ): Readonly<AuthenticatedPrincipal> {
    try {
      if (typeof token !== 'string' || token.length > 8192) throw new Error();
      const decoded = decode(token, { complete: true });
      if (
        !decoded ||
        decoded.header.alg !== 'RS256' ||
        decoded.header.typ !== 'at+jwt' ||
        !decoded.header.kid ||
        !Object.hasOwn(this.config.publicKeys, decoded.header.kid)
      )
        throw new Error();
      const claims = verify(token, this.config.publicKeys[decoded.header.kid], {
        algorithms: ['RS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTimestamp: now,
        clockTolerance: 0,
      });
      if (
        typeof claims === 'string' ||
        claims.iss !== this.config.issuer ||
        claims.aud !== this.config.audience ||
        typeof claims.sub !== 'string' ||
        !uuid.test(claims.sub) ||
        typeof claims.sid !== 'string' ||
        !uuid.test(claims.sid) ||
        typeof claims.jti !== 'string' ||
        !uuid.test(claims.jti) ||
        !['CUSTOMER', 'ADMIN'].includes(claims.role as string) ||
        !Number.isInteger(claims.iat) ||
        !Number.isInteger(claims.exp) ||
        claims.iat! > now ||
        claims.exp !== claims.iat! + 900 ||
        now >= claims.exp ||
        Object.keys(claims).some(
          (key) =>
            !['iss', 'aud', 'sub', 'sid', 'role', 'jti', 'iat', 'exp'].includes(
              key,
            ),
        )
      )
        throw new Error();
      return createAuthenticatedPrincipal({
        userId: claims.sub,
        sessionId: claims.sid,
        role: claims.role as UserRole,
        tokenId: claims.jti,
        issuedAt: new Date(claims.iat! * 1000),
        expiresAt: new Date(claims.exp * 1000),
      });
    } catch {
      throw new Error('INVALID_ACCESS_TOKEN');
    }
  }
}
