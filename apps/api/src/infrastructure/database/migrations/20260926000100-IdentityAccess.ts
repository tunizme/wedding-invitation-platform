import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IdentityAccess20260926000100 implements MigrationInterface {
  name = 'IdentityAccess20260926000100';

  async up(runner: QueryRunner): Promise<void> {
    // Extensions are database-wide; never own one inside a disposable IAM schema.
    await runner.query('SELECT pg_advisory_xact_lock(73003, 1)');
    await runner.query(
      'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public',
    );
    const extensionRows: unknown = await runner.query(
      "SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'",
    );
    const [extension] = extensionRows as { schema: string }[];
    const operatorSchema = `"${extension.schema.replaceAll('"', '""')}"`;
    await runner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        email varchar(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
        password_hash varchar(255),
        login_method varchar(10) NOT NULL CHECK (login_method IN ('LOCAL','GOOGLE','FACEBOOK')),
        role varchar(10) NOT NULL CHECK (role IN ('CUSTOMER','ADMIN')),
        status varchar(10) NOT NULL CHECK (status IN ('ACTIVE','LOCKED')),
        email_verified_at timestamptz,
        display_name varchar(100) CHECK (display_name = btrim(display_name) AND length(display_name) > 0),
        phone_number varchar(32) CHECK (phone_number = btrim(phone_number) AND length(phone_number) > 0),
        avatar_url varchar(2048),
        credentials_updated_at timestamptz,
        credential_version bigint NOT NULL DEFAULT 0 CHECK (credential_version >= 0),
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CHECK ((login_method = 'LOCAL' AND password_hash IS NOT NULL) OR (login_method IN ('GOOGLE','FACEBOOK') AND password_hash IS NULL))
      );
      CREATE INDEX users_admin_page ON users (role,status,created_at DESC,id DESC);
      CREATE INDEX users_email_search ON users USING gin (email ${operatorSchema}.gin_trgm_ops);
      CREATE INDEX users_name_search ON users USING gin (display_name ${operatorSchema}.gin_trgm_ops);
      CREATE TABLE external_identities (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
        provider varchar(10) NOT NULL CHECK (provider IN ('GOOGLE','FACEBOOK')),
        provider_subject varchar(255) NOT NULL CHECK (length(provider_subject) > 0),
        created_at timestamptz NOT NULL,
        last_authenticated_at timestamptz,
        UNIQUE (provider,provider_subject)
      );
      CREATE TABLE auth_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        csrf_seed bytea NOT NULL CHECK (octet_length(csrf_seed) = 32),
        csrf_key_version smallint NOT NULL CHECK (csrf_key_version > 0),
        created_at timestamptz NOT NULL,
        last_refreshed_at timestamptz,
        absolute_expires_at timestamptz NOT NULL CHECK (absolute_expires_at = created_at + interval '336 hours'),
        revoked_at timestamptz,
        revocation_reason varchar(20) CHECK (revocation_reason IN ('LOGOUT','LOGOUT_ALL','PASSWORD_CHANGE','PASSWORD_RESET','ACCOUNT_LOCK','REFRESH_REUSE','EXPIRED')),
        user_agent_summary varchar(255),
        CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL))
      );
      CREATE INDEX auth_sessions_user ON auth_sessions (user_id,created_at DESC);
      CREATE TABLE refresh_credentials (
        id uuid PRIMARY KEY,
        session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
        token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
        hash_key_version smallint NOT NULL CHECK (hash_key_version > 0),
        generation integer NOT NULL CHECK (generation >= 0),
        issued_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
        consumed_at timestamptz,
        revoked_at timestamptz,
        replaced_by_id uuid UNIQUE REFERENCES refresh_credentials(id),
        UNIQUE (session_id,generation)
      );
      CREATE TABLE pending_social_onboardings (
        id uuid PRIMARY KEY,
        provider varchar(10) NOT NULL CHECK (provider IN ('GOOGLE','FACEBOOK')),
        provider_subject varchar(255) NOT NULL CHECK (length(provider_subject) > 0),
        email_candidate varchar(254),
        display_name varchar(100),
        avatar_url varchar(2048),
        binding_hash bytea NOT NULL CHECK (octet_length(binding_hash) = 32),
        csrf_seed bytea NOT NULL CHECK (octet_length(csrf_seed) = 32),
        csrf_key_version smallint NOT NULL CHECK (csrf_key_version > 0),
        status varchar(25) NOT NULL CHECK (status IN ('PENDING_EMAIL','PENDING_VERIFICATION','COMPLETED','EXPIRED','CANCELLED')),
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        completed_at timestamptz,
        completed_user_id uuid REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX onboarding_pending_subject ON pending_social_onboardings (provider,provider_subject) WHERE status IN ('PENDING_EMAIL','PENDING_VERIFICATION');
      CREATE TABLE auth_challenges (
        id uuid PRIMARY KEY,
        purpose varchar(30) NOT NULL CHECK (purpose IN ('LOCAL_EMAIL_VERIFICATION','PASSWORD_RESET','SOCIAL_EMAIL_VERIFICATION')),
        credential_version_snapshot bigint,
        status varchar(20) NOT NULL CHECK (status IN ('PENDING_DELIVERY','ACTIVE','CONSUMED','REVOKED','DELIVERY_FAILED')),
        user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        social_onboarding_id uuid REFERENCES pending_social_onboardings(id) ON DELETE RESTRICT,
        email varchar(254) NOT NULL CHECK (email = lower(btrim(email))),
        token_hash bytea UNIQUE CHECK (octet_length(token_hash) = 32),
        token_key_version smallint NOT NULL CHECK (token_key_version > 0),
        generation bigint NOT NULL CHECK (generation >= 0),
        attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
        activated_at timestamptz,
        consumed_at timestamptz,
        revoked_at timestamptz,
        delivery_failed_at timestamptz,
        CHECK ((purpose = 'PASSWORD_RESET' AND credential_version_snapshot IS NOT NULL AND credential_version_snapshot >= 0) OR (purpose <> 'PASSWORD_RESET' AND credential_version_snapshot IS NULL)),
        CHECK ((purpose IN ('PASSWORD_RESET','LOCAL_EMAIL_VERIFICATION') AND user_id IS NOT NULL AND social_onboarding_id IS NULL) OR (purpose = 'SOCIAL_EMAIL_VERIFICATION' AND user_id IS NULL AND social_onboarding_id IS NOT NULL))
      );
      CREATE UNIQUE INDEX challenges_user_generation ON auth_challenges (user_id,purpose,generation) WHERE user_id IS NOT NULL;
      CREATE UNIQUE INDEX challenges_onboarding_generation ON auth_challenges (social_onboarding_id,purpose,generation) WHERE social_onboarding_id IS NOT NULL;
      CREATE INDEX challenges_user_created ON auth_challenges (user_id,purpose,created_at DESC);
      CREATE INDEX challenges_onboarding_created ON auth_challenges (social_onboarding_id,purpose,created_at DESC);
      CREATE TABLE oauth_transactions (
        id uuid PRIMARY KEY,
        provider varchar(10) NOT NULL CHECK (provider IN ('GOOGLE','FACEBOOK')),
        state_hash bytea NOT NULL UNIQUE CHECK (octet_length(state_hash) = 32),
        browser_binding_hash bytea NOT NULL CHECK (octet_length(browser_binding_hash) = 32),
        nonce_hash bytea CHECK (octet_length(nonce_hash) = 32),
        pkce_verifier_ciphertext bytea,
        encryption_key_version smallint,
        return_target_key varchar(50) NOT NULL,
        status varchar(15) NOT NULL CHECK (status IN ('PENDING','PROCESSING','CONSUMED','FAILED','EXPIRED')),
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        claimed_at timestamptz,
        consumed_at timestamptz,
        failure_code varchar(50),
        CHECK ((pkce_verifier_ciphertext IS NULL) = (encryption_key_version IS NULL)),
        CHECK (provider <> 'FACEBOOK' OR (nonce_hash IS NULL AND pkce_verifier_ciphertext IS NULL)),
        CHECK (provider <> 'GOOGLE' OR status NOT IN ('PENDING','PROCESSING') OR (nonce_hash IS NOT NULL AND pkce_verifier_ciphertext IS NOT NULL))
      );
      CREATE TABLE auth_rate_limit_buckets (
        action varchar(40) NOT NULL,
        subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
        hash_key_version smallint NOT NULL CHECK (hash_key_version > 0),
        window_started_at timestamptz NOT NULL,
        count integer NOT NULL CHECK (count > 0),
        expires_at timestamptz NOT NULL,
        PRIMARY KEY (action,subject_hash,window_started_at)
      );
      CREATE TABLE email_outbox (
        id uuid PRIMARY KEY,
        challenge_id uuid NOT NULL UNIQUE REFERENCES auth_challenges(id) ON DELETE RESTRICT,
        template_key varchar(50) NOT NULL,
        recipient_email varchar(254) NOT NULL,
        payload_ciphertext bytea,
        encryption_key_version smallint,
        status varchar(20) NOT NULL CHECK (status IN ('PENDING','PROCESSING','DELIVERED','RETRYABLE_FAILURE','TERMINAL_FAILURE')),
        attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_attempt_at timestamptz NOT NULL,
        lease_owner uuid,
        lease_expires_at timestamptz,
        provider_message_id varchar(255),
        last_error_code varchar(50),
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        delivered_at timestamptz,
        CHECK ((payload_ciphertext IS NULL) = (encryption_key_version IS NULL)),
        CHECK ((status = 'PROCESSING' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL) OR (status <> 'PROCESSING' AND lease_owner IS NULL AND lease_expires_at IS NULL)),
        CHECK ((status IN ('DELIVERED','TERMINAL_FAILURE') AND payload_ciphertext IS NULL) OR (status NOT IN ('DELIVERED','TERMINAL_FAILURE') AND payload_ciphertext IS NOT NULL))
      );
      CREATE INDEX outbox_claim ON email_outbox (status,next_attempt_at,lease_expires_at);
      CREATE TABLE admin_audit_events (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        action varchar(20) NOT NULL CHECK (action IN ('CUSTOMER_LOCKED','CUSTOMER_UNLOCKED')),
        outcome varchar(10) NOT NULL CHECK (outcome IN ('CHANGED','NO_CHANGE')),
        previous_status varchar(10) NOT NULL CHECK (previous_status IN ('ACTIVE','LOCKED')),
        new_status varchar(10) NOT NULL CHECK (new_status IN ('ACTIVE','LOCKED')),
        occurred_at timestamptz NOT NULL,
        request_id varchar(100) NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}',
        CHECK (actor_user_id <> target_user_id),
        CHECK ((previous_status = new_status AND outcome = 'NO_CHANGE') OR (previous_status <> new_status AND outcome = 'CHANGED')),
        CHECK ((action = 'CUSTOMER_LOCKED' AND new_status = 'LOCKED') OR (action = 'CUSTOMER_UNLOCKED' AND new_status = 'ACTIVE'))
      );
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const options = runner.connection.options;
    if (
      process.env.NODE_ENV !== 'test' ||
      !('schema' in options) ||
      typeof options.schema !== 'string' ||
      !/^iam_test_[a-f0-9]{32}$/.test(options.schema)
    ) {
      throw new Error(
        'IAM rollback requires an isolated disposable test schema.',
      );
    }
    // Explicit operational rollback only; never remove shared extensions or foundation history.
    await runner.query(`DROP TABLE admin_audit_events, email_outbox, auth_rate_limit_buckets,
      oauth_transactions, auth_challenges, pending_social_onboardings,
      refresh_credentials, auth_sessions, external_identities, users`);
  }
}
