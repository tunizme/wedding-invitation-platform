import type {
  ProviderIdentityPort,
  VerifiedProviderIdentity,
} from '../../../src/modules/identity-access/domain/provider-identity.port';

export class ProviderIdentityFake implements ProviderIdentityPort<{
  code: string;
}> {
  constructor(
    private readonly responses: ReadonlyMap<string, VerifiedProviderIdentity>,
  ) {}

  verifyCallback(callback: { code: string }) {
    const identity = this.responses.get(callback.code);
    return identity
      ? Promise.resolve(identity)
      : Promise.reject(new Error('PROVIDER_CALLBACK_REJECTED'));
  }
}
