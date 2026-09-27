import { EntitySchema } from 'typeorm';

// Constraints and indexes are owned by explicit migrations; synchronization stays disabled.
// bigint values remain strings to preserve precision.

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  login_method: string;
  role: string;
  status: string;
  email_verified_at: Date | null;
  display_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  credentials_updated_at: Date | null;
  credential_version: string;
  created_at: Date;
  updated_at: Date;
}
export const UserEntity = new EntitySchema<User>({
  name: 'User',
  tableName: 'users',
  columns: {
    id: { type: 'uuid', primary: true },
    email: { type: 'varchar', length: 254 },
    password_hash: { type: 'varchar', length: 255, nullable: true },
    login_method: { type: 'varchar', length: 10 },
    role: { type: 'varchar', length: 10 },
    status: { type: 'varchar', length: 10 },
    email_verified_at: { type: 'timestamptz', nullable: true },
    display_name: { type: 'varchar', length: 100, nullable: true },
    phone_number: { type: 'varchar', length: 32, nullable: true },
    avatar_url: { type: 'varchar', length: 2048, nullable: true },
    credentials_updated_at: { type: 'timestamptz', nullable: true },
    credential_version: { type: 'bigint', default: 0 },
    created_at: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz' },
  },
});

export interface ExternalIdentity {
  id: string;
  user_id: string;
  provider: string;
  provider_subject: string;
  created_at: Date;
  last_authenticated_at: Date | null;
}
export const ExternalIdentityEntity = new EntitySchema<ExternalIdentity>({
  name: 'ExternalIdentity',
  tableName: 'external_identities',
  columns: {
    id: { type: 'uuid', primary: true },
    user_id: { type: 'uuid' },
    provider: { type: 'varchar', length: 10 },
    provider_subject: { type: 'varchar', length: 255 },
    created_at: { type: 'timestamptz' },
    last_authenticated_at: { type: 'timestamptz', nullable: true },
  },
});

export interface AuthSession {
  id: string;
  user_id: string;
  csrf_seed: Buffer;
  csrf_key_version: number;
  created_at: Date;
  last_refreshed_at: Date | null;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  revocation_reason: string | null;
  user_agent_summary: string | null;
}
export const AuthSessionEntity = new EntitySchema<AuthSession>({
  name: 'AuthSession',
  tableName: 'auth_sessions',
  columns: {
    id: { type: 'uuid', primary: true },
    user_id: { type: 'uuid' },
    csrf_seed: { type: 'bytea' },
    csrf_key_version: { type: 'smallint' },
    created_at: { type: 'timestamptz' },
    last_refreshed_at: { type: 'timestamptz', nullable: true },
    absolute_expires_at: { type: 'timestamptz' },
    revoked_at: { type: 'timestamptz', nullable: true },
    revocation_reason: { type: 'varchar', length: 20, nullable: true },
    user_agent_summary: { type: 'varchar', length: 255, nullable: true },
  },
});

export interface RefreshCredential {
  id: string;
  session_id: string;
  token_hash: Buffer;
  hash_key_version: number;
  generation: number;
  issued_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
  replaced_by_id: string | null;
}
export const RefreshCredentialEntity = new EntitySchema<RefreshCredential>({
  name: 'RefreshCredential',
  tableName: 'refresh_credentials',
  columns: {
    id: { type: 'uuid', primary: true },
    session_id: { type: 'uuid' },
    token_hash: { type: 'bytea' },
    hash_key_version: { type: 'smallint' },
    generation: { type: 'integer' },
    issued_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz' },
    consumed_at: { type: 'timestamptz', nullable: true },
    revoked_at: { type: 'timestamptz', nullable: true },
    replaced_by_id: { type: 'uuid', nullable: true },
  },
});

export interface PendingSocialOnboarding {
  id: string;
  provider: string;
  provider_subject: string;
  email_candidate: string | null;
  display_name: string | null;
  avatar_url: string | null;
  binding_hash: Buffer;
  csrf_seed: Buffer;
  csrf_key_version: number;
  status: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  completed_user_id: string | null;
}
export const PendingSocialOnboardingEntity =
  new EntitySchema<PendingSocialOnboarding>({
    name: 'PendingSocialOnboarding',
    tableName: 'pending_social_onboardings',
    columns: {
      id: { type: 'uuid', primary: true },
      provider: { type: 'varchar', length: 10 },
      provider_subject: { type: 'varchar', length: 255 },
      email_candidate: { type: 'varchar', length: 254, nullable: true },
      display_name: { type: 'varchar', length: 100, nullable: true },
      avatar_url: { type: 'varchar', length: 2048, nullable: true },
      binding_hash: { type: 'bytea' },
      csrf_seed: { type: 'bytea' },
      csrf_key_version: { type: 'smallint' },
      status: { type: 'varchar', length: 25 },
      expires_at: { type: 'timestamptz' },
      created_at: { type: 'timestamptz' },
      updated_at: { type: 'timestamptz' },
      completed_at: { type: 'timestamptz', nullable: true },
      completed_user_id: { type: 'uuid', nullable: true },
    },
  });

export interface AuthChallenge {
  id: string;
  purpose: string;
  credential_version_snapshot: string | null;
  status: string;
  user_id: string | null;
  social_onboarding_id: string | null;
  email: string;
  token_hash: Buffer | null;
  token_key_version: number;
  generation: string;
  attempt_count: number;
  created_at: Date;
  expires_at: Date;
  activated_at: Date | null;
  consumed_at: Date | null;
  revoked_at: Date | null;
  delivery_failed_at: Date | null;
}
export const AuthChallengeEntity = new EntitySchema<AuthChallenge>({
  name: 'AuthChallenge',
  tableName: 'auth_challenges',
  columns: {
    id: { type: 'uuid', primary: true },
    purpose: { type: 'varchar', length: 30 },
    credential_version_snapshot: { type: 'bigint', nullable: true },
    status: { type: 'varchar', length: 20 },
    user_id: { type: 'uuid', nullable: true },
    social_onboarding_id: { type: 'uuid', nullable: true },
    email: { type: 'varchar', length: 254 },
    token_hash: { type: 'bytea', nullable: true },
    token_key_version: { type: 'smallint' },
    generation: { type: 'bigint' },
    attempt_count: { type: 'integer', default: 0 },
    created_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz' },
    activated_at: { type: 'timestamptz', nullable: true },
    consumed_at: { type: 'timestamptz', nullable: true },
    revoked_at: { type: 'timestamptz', nullable: true },
    delivery_failed_at: { type: 'timestamptz', nullable: true },
  },
});

export interface OAuthTransaction {
  id: string;
  provider: string;
  state_hash: Buffer;
  browser_binding_hash: Buffer;
  nonce_hash: Buffer | null;
  pkce_verifier_ciphertext: Buffer | null;
  encryption_key_version: number | null;
  return_target_key: string;
  status: string;
  created_at: Date;
  expires_at: Date;
  claimed_at: Date | null;
  consumed_at: Date | null;
  failure_code: string | null;
}
export const OAuthTransactionEntity = new EntitySchema<OAuthTransaction>({
  name: 'OAuthTransaction',
  tableName: 'oauth_transactions',
  columns: {
    id: { type: 'uuid', primary: true },
    provider: { type: 'varchar', length: 10 },
    state_hash: { type: 'bytea' },
    browser_binding_hash: { type: 'bytea' },
    nonce_hash: { type: 'bytea', nullable: true },
    pkce_verifier_ciphertext: { type: 'bytea', nullable: true },
    encryption_key_version: { type: 'smallint', nullable: true },
    return_target_key: { type: 'varchar', length: 50 },
    status: { type: 'varchar', length: 15 },
    created_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz' },
    claimed_at: { type: 'timestamptz', nullable: true },
    consumed_at: { type: 'timestamptz', nullable: true },
    failure_code: { type: 'varchar', length: 50, nullable: true },
  },
});

export interface AuthRateLimitBucket {
  action: string;
  subject_hash: Buffer;
  hash_key_version: number;
  window_started_at: Date;
  count: number;
  expires_at: Date;
}
export const AuthRateLimitBucketEntity = new EntitySchema<AuthRateLimitBucket>({
  name: 'AuthRateLimitBucket',
  tableName: 'auth_rate_limit_buckets',
  columns: {
    action: { type: 'varchar', length: 40, primary: true },
    subject_hash: { type: 'bytea', primary: true },
    hash_key_version: { type: 'smallint' },
    window_started_at: { type: 'timestamptz', primary: true },
    count: { type: 'integer' },
    expires_at: { type: 'timestamptz' },
  },
});

export interface EmailOutbox {
  id: string;
  challenge_id: string;
  template_key: string;
  recipient_email: string;
  payload_ciphertext: Buffer | null;
  encryption_key_version: number | null;
  status: string;
  attempt_count: number;
  next_attempt_at: Date;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  provider_message_id: string | null;
  last_error_code: string | null;
  created_at: Date;
  updated_at: Date;
  delivered_at: Date | null;
}
export const EmailOutboxEntity = new EntitySchema<EmailOutbox>({
  name: 'EmailOutbox',
  tableName: 'email_outbox',
  columns: {
    id: { type: 'uuid', primary: true },
    challenge_id: { type: 'uuid' },
    template_key: { type: 'varchar', length: 50 },
    recipient_email: { type: 'varchar', length: 254 },
    payload_ciphertext: { type: 'bytea', nullable: true },
    encryption_key_version: { type: 'smallint', nullable: true },
    status: { type: 'varchar', length: 20 },
    attempt_count: { type: 'integer', default: 0 },
    next_attempt_at: { type: 'timestamptz' },
    lease_owner: { type: 'uuid', nullable: true },
    lease_expires_at: { type: 'timestamptz', nullable: true },
    provider_message_id: { type: 'varchar', length: 255, nullable: true },
    last_error_code: { type: 'varchar', length: 50, nullable: true },
    created_at: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz' },
    delivered_at: { type: 'timestamptz', nullable: true },
  },
});

export interface AdminAuditEvent {
  id: string;
  actor_user_id: string;
  target_user_id: string;
  action: string;
  outcome: string;
  previous_status: string;
  new_status: string;
  occurred_at: Date;
  request_id: string;
  metadata: Record<string, unknown>;
}
export const AdminAuditEventEntity = new EntitySchema<AdminAuditEvent>({
  name: 'AdminAuditEvent',
  tableName: 'admin_audit_events',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    actor_user_id: { type: 'uuid' },
    target_user_id: { type: 'uuid' },
    action: { type: 'varchar', length: 20 },
    outcome: { type: 'varchar', length: 10 },
    previous_status: { type: 'varchar', length: 10 },
    new_status: { type: 'varchar', length: 10 },
    occurred_at: { type: 'timestamptz' },
    request_id: { type: 'varchar', length: 100 },
    metadata: { type: 'jsonb', default: {} },
  },
});

export const identityEntities = [
  UserEntity,
  ExternalIdentityEntity,
  AuthSessionEntity,
  RefreshCredentialEntity,
  PendingSocialOnboardingEntity,
  AuthChallengeEntity,
  OAuthTransactionEntity,
  AuthRateLimitBucketEntity,
  EmailOutboxEntity,
  AdminAuditEventEntity,
];
