import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  createAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
} from '../../../src/modules/identity-access/authorization/principal';
import { OwnershipPolicy } from '../../../src/modules/identity-access/authorization/ownership.policy';

function principal(
  role: AuthenticatedPrincipal['role'],
  userId = randomUUID(),
) {
  return createAuthenticatedPrincipal({
    userId,
    sessionId: randomUUID(),
    role,
    tokenId: randomUUID(),
    issuedAt: new Date('2026-09-26T00:00:00.000Z'),
    expiresAt: new Date('2026-09-26T00:15:00.000Z'),
  });
}

describe('authorization principal and ownership policy', () => {
  it('creates a closed immutable principal from verified token claims', () => {
    const customer = principal('CUSTOMER');
    expect(Object.isFrozen(customer)).toBe(true);
    expect(Object.keys(customer).sort()).toEqual([
      'expiresAt',
      'issuedAt',
      'role',
      'sessionId',
      'tokenId',
      'userId',
    ]);
    expect(() => {
      (customer as { role: string }).role = 'ADMIN';
    }).toThrow();
  });

  it('enforces the Guest, CUSTOMER and ADMIN ownership matrix', () => {
    const owner = principal('CUSTOMER');
    const other = principal('CUSTOMER');
    const admin = principal('ADMIN');
    const policy = new OwnershipPolicy();
    const resource = { persistedOwnerUserId: owner.userId };

    expect(policy.allows(undefined, resource)).toBe(false);
    expect(policy.allows(owner, resource)).toBe(true);
    expect(policy.allows(other, resource)).toBe(false);
    expect(policy.allows(admin, resource)).toBe(false);
    expect(policy.allows(admin, { ...resource, allowAdmin: true })).toBe(true);
  });

  it('ignores forged role/userId/ownerId fields and denies cross-owner access', () => {
    const owner = principal('CUSTOMER');
    const attacker = principal('CUSTOMER');
    const policy = new OwnershipPolicy();
    const untrustedRequest = {
      role: 'ADMIN',
      userId: owner.userId,
      ownerId: attacker.userId,
    };

    expect(untrustedRequest.role).toBe('ADMIN');
    expect(
      policy.allows(attacker, { persistedOwnerUserId: owner.userId }),
    ).toBe(false);
    expect(() =>
      policy.authorize(attacker, { persistedOwnerUserId: owner.userId }),
    ).toThrow(ForbiddenException);
  });
});
