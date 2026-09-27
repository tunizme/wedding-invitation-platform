export type ExternalProvider = 'GOOGLE' | 'FACEBOOK';

export interface VerifiedProviderIdentity {
  provider: ExternalProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ProviderIdentityPort<TCallback = unknown> {
  verifyCallback(callback: TCallback): Promise<VerifiedProviderIdentity>;
}
