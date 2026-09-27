import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { UserProfile } from '../../src/features/identity-access/api/client';
import {
  canShowCapability,
  type FrontendCapability,
} from '../../src/features/identity-access/authorization/capabilities';

const user = (role: UserProfile['role']): UserProfile => ({
  id: role === 'ADMIN' ? 'admin-id' : 'customer-id',
  email: `${role.toLowerCase()}@example.test`,
  emailVerified: true,
  loginMethod: 'LOCAL',
  role,
  status: 'ACTIVE',
  displayName: null,
  phoneNumber: null,
  avatarUrl: null,
});

function CapabilityLink({
  capability,
  principal,
}: {
  capability: FrontendCapability;
  principal: UserProfile | null;
}) {
  return canShowCapability(principal, capability) ? (
    <a href="#allowed">Capability</a>
  ) : null;
}

afterEach(() => cleanup());

describe('frontend authorization visibility', () => {
  it.each([
    [null, 'SELF_SERVICE', false],
    [null, 'ADMIN_CUSTOMERS', false],
    [user('CUSTOMER'), 'SELF_SERVICE', true],
    [user('CUSTOMER'), 'ADMIN_CUSTOMERS', false],
    [user('ADMIN'), 'SELF_SERVICE', true],
    [user('ADMIN'), 'ADMIN_CUSTOMERS', true],
  ] as const)(
    'maps principal %s and capability %s to visibility %s',
    (principal, capability, visible) => {
      render(<CapabilityLink capability={capability} principal={principal} />);
      expect(screen.queryByRole('link')).toBe(
        visible ? screen.getByRole('link') : null,
      );
    },
  );

  it('does not expose an ownership or authorization decision API', () => {
    expect(
      canShowCapability(
        { ...user('CUSTOMER'), id: 'forged-owner', role: 'CUSTOMER' },
        'ADMIN_CUSTOMERS',
      ),
    ).toBe(false);
    expect(canShowCapability.length).toBe(2);
  });
});
