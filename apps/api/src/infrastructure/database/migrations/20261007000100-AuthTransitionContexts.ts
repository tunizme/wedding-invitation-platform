import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Feature 006 (CSP-1): auth contexts, intents, cookie-name ledger and the
 * context/slot columns on existing IAM tables. See
 * specs/006-iam-auth-transition-reliability/data-model.md.
 */
export class AuthTransitionContexts20261007000100 implements MigrationInterface {
  name = 'AuthTransitionContexts20261007000100';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE auth_contexts (
        id uuid PRIMARY KEY,
        binding_digest bytea NOT NULL UNIQUE CHECK (octet_length(binding_digest) = 32),
        binding_key_version smallint NOT NULL CHECK (binding_key_version > 0),
        group_id uuid NOT NULL,
        state varchar(12) NOT NULL CHECK (state IN ('PROVISIONAL','ACTIVE','RETIRED')),
        confirmed_seq bigint UNIQUE,
        revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
        current_intent_id uuid,
        current_session_id uuid REFERENCES auth_sessions(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL,
        confirmed_at timestamptz,
        last_seen_at timestamptz,
        retired_at timestamptz,
        CHECK (state <> 'PROVISIONAL' OR (confirmed_seq IS NULL AND confirmed_at IS NULL)),
        CHECK (state <> 'ACTIVE' OR (confirmed_seq IS NOT NULL AND confirmed_at IS NOT NULL)),
        CHECK ((state = 'RETIRED') = (retired_at IS NOT NULL))
      );
      CREATE SEQUENCE auth_context_confirm_seq;
      CREATE INDEX auth_contexts_group ON auth_contexts (group_id);
      CREATE INDEX auth_contexts_retention ON auth_contexts (state,last_seen_at,created_at);

      CREATE TABLE auth_intents (
        id uuid PRIMARY KEY,
        context_id uuid NOT NULL REFERENCES auth_contexts(id) ON DELETE CASCADE,
        kind varchar(20) NOT NULL CHECK (kind IN ('LOCAL_LOGIN','OAUTH','ONBOARDING_COMPLETE','LOGOUT')),
        revision bigint NOT NULL CHECK (revision > 0),
        state varchar(12) NOT NULL CHECK (state IN ('RESERVED','COMMITTED','SUPERSEDED','FAILED','EXPIRED')),
        outcome_code varchar(30),
        target_session_id uuid REFERENCES auth_sessions(id) ON DELETE SET NULL,
        oauth_started_at timestamptz,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL,
        resolved_at timestamptz,
        CHECK (expires_at > created_at),
        CHECK ((state = 'RESERVED') = (resolved_at IS NULL)),
        CHECK (kind = 'OAUTH' OR oauth_started_at IS NULL),
        UNIQUE (context_id,revision)
      );
      CREATE INDEX auth_intents_retention ON auth_intents (state,resolved_at);
      ALTER TABLE auth_contexts ADD CONSTRAINT auth_contexts_current_intent
        FOREIGN KEY (current_intent_id) REFERENCES auth_intents(id) ON DELETE SET NULL;

      CREATE TABLE auth_cookie_names (
        group_id uuid NOT NULL,
        name varchar(80) NOT NULL CHECK (length(name) > 0),
        kind varchar(8) NOT NULL CHECK (kind IN ('BINDING','SLOT')),
        owner_context_id uuid,
        owner_session_id uuid,
        last_set_digest bytea CHECK (octet_length(last_set_digest) = 32),
        unresolved_set boolean NOT NULL,
        observed_present boolean NOT NULL DEFAULT false,
        observed_at timestamptz,
        bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 4096),
        PRIMARY KEY (group_id,name),
        CHECK ((kind = 'BINDING' AND owner_context_id IS NOT NULL AND owner_session_id IS NULL)
            OR kind = 'SLOT'),
        CHECK (NOT unresolved_set OR last_set_digest IS NOT NULL)
      );

      ALTER TABLE auth_sessions
        ADD COLUMN context_id uuid REFERENCES auth_contexts(id) ON DELETE SET NULL,
        ADD COLUMN slot_tag varchar(22) UNIQUE CHECK (slot_tag ~ '^[A-Za-z0-9_-]{22}$');
      ALTER TABLE auth_sessions DROP CONSTRAINT auth_sessions_revocation_reason_check;
      ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_revocation_reason_check
        CHECK (revocation_reason IN ('LOGOUT','LOGOUT_ALL','PASSWORD_CHANGE','PASSWORD_RESET','ACCOUNT_LOCK','REFRESH_REUSE','EXPIRED','SUPERSEDED'));
      CREATE INDEX auth_sessions_context ON auth_sessions (context_id) WHERE context_id IS NOT NULL;

      ALTER TABLE oauth_transactions
        ADD COLUMN intent_id uuid REFERENCES auth_intents(id) ON DELETE SET NULL;
      ALTER TABLE pending_social_onboardings
        ADD COLUMN context_id uuid REFERENCES auth_contexts(id) ON DELETE SET NULL;
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
        'Auth transition rollback requires an isolated disposable test schema.',
      );
    }
    // Explicit operational rollback only (see quickstart cutover/rollback).
    await runner.query(`
      UPDATE auth_sessions SET revocation_reason='LOGOUT' WHERE revocation_reason='SUPERSEDED';
      ALTER TABLE pending_social_onboardings DROP COLUMN context_id;
      ALTER TABLE oauth_transactions DROP COLUMN intent_id;
      DROP INDEX auth_sessions_context;
      ALTER TABLE auth_sessions DROP COLUMN slot_tag, DROP COLUMN context_id;
      ALTER TABLE auth_sessions DROP CONSTRAINT auth_sessions_revocation_reason_check;
      ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_revocation_reason_check
        CHECK (revocation_reason IN ('LOGOUT','LOGOUT_ALL','PASSWORD_CHANGE','PASSWORD_RESET','ACCOUNT_LOCK','REFRESH_REUSE','EXPIRED'));
      DROP TABLE auth_cookie_names;
      ALTER TABLE auth_contexts DROP CONSTRAINT auth_contexts_current_intent;
      DROP TABLE auth_intents;
      DROP TABLE auth_contexts;
      DROP SEQUENCE auth_context_confirm_seq;
    `);
  }
}
