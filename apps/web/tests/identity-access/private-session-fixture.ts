import type { AccessSession } from '../../src/features/identity-access/api/client';
import { protocolSession } from './auth-protocol-mock';
export const privateSession = (
  extra: Partial<AccessSession> = {},
): AccessSession =>
  protocolSession({
    accessToken: 'access-A',
    tokenType: 'Bearer',
    expiresIn: 900,
    csrfToken: 'csrf-A',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'person-a@example.test',
      emailVerified: true,
      loginMethod: 'LOCAL',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      displayName: 'Tên A',
      phoneNumber: null,
      avatarUrl: null,
    },
    ...extra,
  });
