# Data Model: Feature 2 — Identity & Access Management

## Conventions

- PostgreSQL 17, TypeORM migrations only; `synchronize=false`, `migrationsRun=false`.
- Application generates UUIDs and UTC `timestamptz`; API uses camelCase while columns use snake_case.
- Email is persisted only after `trim + lowercase`; no dot or `+tag` rewriting.
- Raw password, Refresh Token, CSRF token, proof, OAuth state/binding/nonce, authorization code and provider token are never persisted as plaintext.
- Cross-table invariants are enforced in one transaction and integration-tested; database `CHECK` is used only for same-row invariants.

## Enumerations

| Enum | Values |
|------|--------|
| `user_role` | `CUSTOMER`, `ADMIN` |
| `user_status` | `ACTIVE`, `LOCKED` |
| `login_method` | `LOCAL`, `GOOGLE`, `FACEBOOK` |
| `external_provider` | `GOOGLE`, `FACEBOOK` |
| `session_revocation_reason` | `LOGOUT`, `LOGOUT_ALL`, `PASSWORD_CHANGE`, `PASSWORD_RESET`, `ACCOUNT_LOCK`, `REFRESH_REUSE`, `EXPIRED` |
| `challenge_purpose` | `LOCAL_EMAIL_VERIFICATION`, `PASSWORD_RESET`, `SOCIAL_EMAIL_VERIFICATION` |
| `challenge_status` | `PENDING_DELIVERY`, `ACTIVE`, `CONSUMED`, `REVOKED`, `DELIVERY_FAILED` |
| `oauth_transaction_status` | `PENDING`, `PROCESSING`, `CONSUMED`, `FAILED`, `EXPIRED` |
| `social_onboarding_status` | `PENDING_EMAIL`, `PENDING_VERIFICATION`, `COMPLETED`, `EXPIRED`, `CANCELLED` |
| `outbox_status` | `PENDING`, `PROCESSING`, `DELIVERED`, `RETRYABLE_FAILURE`, `TERMINAL_FAILURE` |
| `admin_audit_action` | `CUSTOMER_LOCKED`, `CUSTOMER_UNLOCKED` |
| `admin_audit_outcome` | `CHANGED`, `NO_CHANGE` |

## User

Table: `users`

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | Primary key |
| `email` | varchar(254) | Required, unique, normalized trim+lowercase |
| `password_hash` | varchar(255), nullable | Argon2id PHC string; required only for LOCAL |
| `login_method` | login_method | Immutable in MVP |
| `role` | user_role | Required; public creation always CUSTOMER |
| `status` | user_status | Required; new account ACTIVE |
| `email_verified_at` | timestamptz, nullable | `emailVerified = true` iff non-null |
| `display_name` | varchar(100), nullable | Trimmed; 1–100 chars when present |
| `phone_number` | varchar(32), nullable | Trimmed optional display value; unverified |
| `avatar_url` | varchar(2048), nullable | Initial social provider URL only; no upload |
| `credentials_updated_at` | timestamptz, nullable | Password create/change/reset audit boundary |
| `credential_version` | bigint | NOT NULL, default 0, nonnegative; increment once per successful password change/reset |
| `created_at` | timestamptz | Immutable creation time |
| `updated_at` | timestamptz | Last allowed mutable change |

Constraints:

- `email = lower(btrim(email))` and length 3–254.
- `(login_method='LOCAL' AND password_hash IS NOT NULL) OR (login_method IN ('GOOGLE','FACEBOOK') AND password_hash IS NULL)`.
- `UNIQUE(email)` is the final arbiter for concurrent registration/onboarding.
- Public DTOs never accept role, status, email verification or password hash.

Relationships:

- LOCAL User has no ExternalIdentity; social User has exactly one ExternalIdentity.
- User has many AuthSessions, AuthChallenges and audit relationships.
- ADMIN creation is an operational seed/command decision in implementation, never a public endpoint.

## External Identity

Table: `external_identities`

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | Primary key |
| `user_id` | uuid | Unique FK `users.id`, `ON DELETE RESTRICT` |
| `provider` | external_provider | GOOGLE or FACEBOOK |
| `provider_subject` | varchar(255) | Provider-stable subject; never email |
| `created_at` | timestamptz | Creation time |
| `last_authenticated_at` | timestamptz, nullable | Last successful provider login |

Constraints: `UNIQUE(provider, provider_subject)` and `UNIQUE(user_id)`. Account-creation transaction checks User.login_method equals provider. Provider email/tokens are not persisted here.

## Authentication Session

Table: `auth_sessions`

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | Primary key; Access Token `sid` |
| `user_id` | uuid | FK `users.id`, `ON DELETE RESTRICT` |
| `csrf_seed` | bytea | Random 32-byte server-side seed; not a browser credential |
| `csrf_key_version` | smallint | Allows controlled key rotation |
| `created_at` | timestamptz | Login time |
| `last_refreshed_at` | timestamptz, nullable | Successful latest rotation |
| `absolute_expires_at` | timestamptz | Exactly login + 14 days; immutable |
| `revoked_at` | timestamptz, nullable | Effective family revocation |
| `revocation_reason` | session_revocation_reason, nullable | Required iff revoked_at non-null |
| `user_agent_summary` | varchar(255), nullable | Bounded operational hint; not hardware identity |

Indexes: `(user_id, created_at DESC)` and active-session partial index if query evidence requires it.

Effective state:

- `ACTIVE`: now < absolute expiry and revoked_at null.
- `EXPIRED`: now >= absolute expiry; rotation never extends expiry.
- `REVOKED`: revoked_at non-null; unlock never restores it.

## CSRF Context Derivation

CSRF token = base64url HMAC-SHA-256(versioned server key, unambiguous length-prefixed encoding of context type, context UUID, csrf_seed). Context type is `session` or `onboarding`; seed is random server-side data, not the CSRF token and not an extra browser credential. Bootstrap authenticates the current refresh credential or onboarding cookie/binding, checks context eligibility, then derives the stable token. Mutation requires exact Origin and constant-time CSRF verification. Session rotation preserves seed/key version; new login/onboarding gets a new seed. Retain old keys while their contexts remain supported. No csrf_token_hash or raw CSRF token is stored. OAuth/onboarding browser-binding checks remain separate.

## Refresh Credential

Table: `refresh_credentials`

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | Primary key |
| `session_id` | uuid | FK `auth_sessions.id`, `ON DELETE CASCADE` |
| `token_hash` | bytea | Unique 32-byte HMAC-SHA-256 digest |
| `hash_key_version` | smallint | Refresh pepper version |
| `generation` | integer | Starts 0; strictly increments |
| `issued_at` | timestamptz | Creation time |
| `expires_at` | timestamptz | Never after session absolute expiry |
| `consumed_at` | timestamptz, nullable | Set by successful rotation |
| `revoked_at` | timestamptz, nullable | Optional credential-level evidence |
| `replaced_by_id` | uuid, nullable | Unique self-FK to successor |

Constraints: `octet_length(token_hash)=32`, `UNIQUE(session_id,generation)`, `UNIQUE(replaced_by_id)`.

Lifecycle: `CURRENT → CONSUMED(replaced_by successor)`; presentation after CONSUMED/REVOKED triggers AuthSession `REFRESH_REUSE`. Full predecessor history remains until cleanup after family expiry.

## Verification / Recovery Challenge

Table: `auth_challenges`

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | Primary key |
| `purpose` | challenge_purpose | Purpose binding prevents cross-flow use |
| `credential_version_snapshot` | bigint, nullable | Required and nonnegative only for PASSWORD_RESET; null for other purposes |
| `status` | challenge_status | Delivery/use lifecycle |
| `user_id` | uuid, nullable | FK User for local verify/reset |
| `social_onboarding_id` | uuid, nullable | FK PendingSocialOnboarding for social verify |
| `email` | varchar(254) | Normalized delivery/ownership target |
| `token_hash` | bytea, nullable | Unique 32-byte digest; populated before delivery |
| `token_key_version` | smallint | Hash/encryption key version |
| `generation` | bigint | Monotonic per owner/purpose, allocated under owner lock |
| `attempt_count` | integer | Default 0; max 5 |
| `created_at` | timestamptz | Creation time |
| `expires_at` | timestamptz | Verify 24h; reset 30m; social min(created + 30m, onboarding expiry) |
| `activated_at` | timestamptz, nullable | Provider accepted email |
| `consumed_at` | timestamptz, nullable | Successful one-time completion |
| `revoked_at` | timestamptz, nullable | Superseded/aggregate completion |
| `delivery_failed_at` | timestamptz, nullable | Terminal delivery evidence |

Constraints: exactly one of `user_id`, `social_onboarding_id` is non-null; password reset/local verification require user owner, social verification requires onboarding owner. Index `(user_id,purpose,created_at DESC)` and `(social_onboarding_id,purpose,created_at DESC)`.

Resend creates PENDING_DELIVERY challenge/outbox under owner lock with unique `(owner,purpose,generation)` (separate partial unique indexes for User and onboarding owners). It does not revoke an older ACTIVE proof. Accepted delivery activates only a still-eligible proof: owner/context valid, not expired/consumed/revoked and no newer generation already ACTIVE or consumed. Activation revokes older siblings; valid completion consumes the selected proof and revokes all siblings, including pending delivery. Out-of-order delivery cannot revive stale proof or revoke newer active proof. Failed resend leaves the previous ACTIVE proof valid.

### Password-reset credential binding

Reset challenge creation locks User and snapshots credential_version. Completion locks User → Sessions → Challenges and requires snapshot equality with the current User version, alongside purpose/status/expiry checks. A successful password reset/change increments credential_version exactly once and atomically updates hash/timestamp, consumes the selected proof when applicable, revokes sibling reset challenges (including pending delivery), and revokes all sessions. Rollback changes none of those effects. Opportunistic hash-parameter upgrade without a password change does not increment the version. credentials_updated_at remains audit metadata, never the version comparator. Version/snapshot are internal and excluded from public DTOs.

Outbox finalize for PASSWORD_RESET checks the snapshot under User lock; stale versions cannot activate a proof even if delivery succeeded. Tests cover simultaneous resets (one succeeds), reset versus password change, delayed delivery after change and transaction rollback.

## OAuth Transaction

Table: `oauth_transactions`

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | Public state handle component |
| `provider` | external_provider | Provider allowlist |
| `state_hash` | bytea | Unique 32-byte digest of state secret |
| `browser_binding_hash` | bytea | Digest of short-lived HttpOnly transaction cookie |
| `nonce_hash` | bytea, nullable | Required Google; absent Facebook |
| `pkce_verifier_ciphertext` | bytea, nullable | AES-256-GCM transient; required Google |
| `encryption_key_version` | smallint, nullable | Required with ciphertext |
| `return_target_key` | varchar(50) | Enum-like allowlist key, never arbitrary URL |
| `status` | oauth_transaction_status | One-time callback lifecycle |
| `created_at` | timestamptz | Start time |
| `expires_at` | timestamptz | Start + 10 minutes |
| `claimed_at` | timestamptz, nullable | PENDING→PROCESSING before network exchange |
| `consumed_at` | timestamptz, nullable | Successful terminal time |
| `failure_code` | varchar(50), nullable | Safe internal category; no provider code/token |

Callback claim is atomic. No DB transaction remains open during provider network calls. Any repeat after PROCESSING is rejected and user starts a new flow.

## Pending Social Onboarding

Table: `pending_social_onboardings`

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | Primary key and cookie-bound handle |
| `provider` | external_provider | GOOGLE or FACEBOOK |
| `provider_subject` | varchar(255) | Verified provider subject |
| `email_candidate` | varchar(254), nullable | Normalized candidate only |
| `display_name` | varchar(100), nullable | Provider initial value |
| `avatar_url` | varchar(2048), nullable | Provider initial value |
| `binding_hash` | bytea | Onboarding HttpOnly-cookie binding |
| `csrf_seed` | bytea | Random 32-byte server-side seed, distinct from browser binding |
| `csrf_key_version` | smallint | Versioned server HMAC key |
| `status` | social_onboarding_status | Lifecycle |
| `expires_at` | timestamptz | Creation + 30 minutes |
| `created_at`, `updated_at` | timestamptz | Audit timestamps |
| `completed_at` | timestamptz, nullable | Terminal completion |
| `completed_user_id` | uuid, nullable | FK created User after completion |

Constraint: partial unique index on `(provider,provider_subject)` WHERE status IN ('PENDING_EMAIL','PENDING_VERIFICATION'). Historical COMPLETED/EXPIRED/CANCELLED rows do not occupy this slot. Do not use expires_at > now() in the index predicate. ExternalIdentity keeps its unconditional provider/subject uniqueness and is the source of truth after completion.

Restart requires a newly verified, single-use OAuth callback, never only the old onboarding cookie or proof. First resolve ExternalIdentity; an existing identity follows the normal status-checked login flow. Otherwise, in a transaction, lock the current pending context and its challenges, mark it EXPIRED when past expiry or CANCELLED otherwise, revoke all nonterminal challenges, then insert a new context with fresh ID/browser binding/CSRF seed/expiry. No proof or verification evidence is transferred. Expiration is materialized during restart, without waiting for retention cleanup.

Concurrent restarts that observed the same prior context must not silently replace a winner committed meanwhile: after acquiring locks, recheck the observed context ID/state; if it changed, abort with a safe restart-required result. When no pending context was observed, the partial unique index arbitrates competing inserts; the loser rolls back rather than retrying as replacement. After waiting on a context lock, recheck ExternalIdentity to handle a completion that won the race; follow normal identity resolution outside the onboarding transaction. Completion rechecks pending state/expiry/binding under lock. Thus a replaced context/proof cannot complete; completed contexts are never revived. Integration tests cover expiry-before-cleanup, missing browser binding, two restarts, restart versus completion and old proof/cookie rejection.

Completion transaction locks onboarding/challenge and atomically inserts User, ExternalIdentity, AuthSession, first RefreshCredential; consumes/revokes proofs; marks onboarding complete. Any email/identity conflict rolls back everything.

## Authentication Rate-Limit Bucket

Table: `auth_rate_limit_buckets`

| Field | Type | Rules |
|-------|------|-------|
| `action` | varchar(40) | REGISTER, LOGIN, VERIFY_REQUEST, RESET_REQUEST, PROOF_ATTEMPT, OAUTH_START, REFRESH |
| `subject_hash` | bytea | HMAC of IP/email/session/challenge subject; no raw value |
| `hash_key_version` | smallint | Limiter pepper version |
| `window_started_at` | timestamptz | Fixed-window boundary |
| `count` | integer | Atomic upsert increment |
| `expires_at` | timestamptz | Cleanup boundary |

Composite primary key `(action,subject_hash,window_started_at)`. Multiple applicable buckets (IP and email) must all allow the request. Response remains generic and includes `Retry-After` only.

## Email Outbox

Table: `email_outbox`

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | Primary key; provider idempotency component |
| `challenge_id` | uuid | Unique FK `auth_challenges.id` |
| `template_key` | varchar(50) | Allowlisted template, no arbitrary content |
| `recipient_email` | varchar(254) | Normalized address |
| `payload_ciphertext` | bytea, nullable | Encrypted transient payload; cleared on delivery/terminal failure |
| `encryption_key_version` | smallint, nullable | Present iff payload_ciphertext exists |
| `status` | outbox_status | Delivery lifecycle |
| `attempt_count` | integer | Bounded retries |
| `next_attempt_at` | timestamptz | Retry schedule |
| `lease_owner` | uuid, nullable | Fresh unique claim token for each claim/reclaim, not reusable worker ID |
| `lease_expires_at` | timestamptz, nullable | Bounded claim deadline |
| `provider_message_id` | varchar(255), nullable | Non-secret delivery correlation |
| `last_error_code` | varchar(50), nullable | Redacted category only |
| `created_at`, `updated_at` | timestamptz | Lifecycle timestamps |
| `delivered_at` | timestamptz, nullable | Provider accepted time |

Worker claims bounded batches using `FOR UPDATE SKIP LOCKED` in a short transaction, sets PROCESSING plus a fresh lease_owner/deadline, then calls the provider outside the transaction. Expired leases are reclaimable with a new owner token. Finalize locks owner → challenges → outbox and requires matching lease_owner with unexpired deadline; a stale worker cannot finalize. Provider retry uses the same purpose/challenge/template idempotency key; SMTP may deliver duplicates, so no exactly-once delivery guarantee.

Accepted delivery atomically clears ciphertext/key metadata, marks outbox DELIVERED and activates the challenge only if the eligibility/generation checks above pass. Otherwise the proof remains terminal or becomes REVOKED, never resurrected. Terminal failure clears ciphertext/key metadata and marks a still-pending proof DELIVERY_FAILED; it does not overwrite CONSUMED/REVOKED or invalidate older ACTIVE proof. Retryable failure keeps encrypted payload. Finalization clears lease fields; constraints require paired lease fields in PROCESSING and paired payload/key fields. No network call retains database locks. Crash tests cover claim-before-send, acceptance-before-finalize, reclaim races, and proof consumption before finalize.

## Admin Audit Event

Table: `admin_audit_events`

| Field | Type | Rules |
|-------|------|-------|
| `id` | bigint identity | Primary key, append order |
| `actor_user_id` | uuid | FK User, `ON DELETE RESTRICT` |
| `target_user_id` | uuid | FK Customer, `ON DELETE RESTRICT` |
| `action` | admin_audit_action | Requested CUSTOMER_LOCKED or CUSTOMER_UNLOCKED |
| `outcome` | admin_audit_outcome | CHANGED or NO_CHANGE |
| `previous_status` | user_status | State before transition |
| `new_status` | user_status | State after transition |
| `occurred_at` | timestamptz | Server event time |
| `request_id` | varchar(100) | Required server correlation ID; no secret |
| `metadata` | jsonb | Allowlisted non-secret metadata, default `{}` |

No update/delete repository method. Actor must be ADMIN; target must be CUSTOMER and cannot be actor. Every accepted lock/unlock writes an audit event, including repeated requests: equal previous/new status requires NO_CHANGE; differing status requires CHANGED. No-op is state-idempotent, not audit-idempotent. Audit failure rolls back the operation. Successful lock ensures all target refresh sessions are revoked even on NO_CHANGE; unlock never restores sessions.

## Transaction and Concurrency Matrix

| Operation | Locks / arbiter | Atomic effects |
|-----------|-----------------|----------------|
| Local registration | `UNIQUE(users.email)` | User + verify challenge + outbox; generic result on conflict |
| Local verification | User → Challenge | email_verified_at; consume/revoke sibling proofs |
| Password reset | User → Sessions → Challenges | password hash/timestamp; consume proof; revoke all sessions |
| Login | User | status/verified/password checks; Session + first RefreshCredential |
| Refresh | User → Session → Credential | consume predecessor; insert successor; or revoke session on reuse |
| Logout current | Lookup then User → Session → Credential when needed; recheck | idempotent session revocation + cookie clear |
| Logout all/change password | User → Sessions → Challenges when invalidating reset proofs | credential change if any + all-session revocation |
| OAuth callback | conditional OAuthTransaction claim | no partial user; provider network outside transaction |
| Social completion | Onboarding → Challenge → User uniqueness | User + Identity + Session + first RefreshCredential + completion |
| Social restart | Observed pending Onboarding → Challenges; partial unique index for new context | expire/cancel old context, revoke proofs, create fresh context; conflict/stale observation rolls back |
| Admin lock | actor/target User in UUID order → target Sessions | status LOCKED + revoke sessions + audit event |
| Admin unlock | actor/target User in UUID order | status ACTIVE + audit CHANGED/NO_CHANGE; no session restore |
| Outbox finalize | Owner User/Onboarding → Challenges → Outbox | lease/state/generation recheck, terminal payload cleanup and eligible activation |

Canonical lock order for existing aggregates: Users → Sessions → RefreshCredentials → Challenges → Audit/Outbox writes. Lock same-type rows in stable UUID order. Social completion locks Onboarding → Challenge then inserts new User/Identity/Session only; uniqueness conflict rolls back, never locks/links an existing User as fallback. Outbox claim holds only outbox locks and commits before network/finalize. All database work inside a TypeORM transaction uses only its provided EntityManager. Deadlock retry is bounded and only for classified PostgreSQL serialization/deadlock failures; business requests are not blindly replayed.

## Search and Pagination

- Admin list is CUSTOMER-only, ordered `(created_at DESC,id DESC)`.
- Cursor contains last tuple and filter fingerprint, signed/opaque; default limit 20, maximum 100.
- `q` is trimmed, maximum 100; searches case-insensitive substring on email/display_name.
- Index `(role,status,created_at DESC,id DESC)` plus migration-managed `pg_trgm` GIN indexes for email/display name.
- Response omits total count; concurrent changes do not cause offset-style skipping.

## Retention and Cleanup

| Data | Retention |
|------|-----------|
| OAuthTransaction | Purge 24h after terminal/expiry |
| Pending onboarding | 7d after expiry/cancel; 30d after completion |
| Challenge | 30d after consumed/revoked/expiry/failure |
| Session + RefreshCredential | 30d after absolute expiry/revocation; never before reuse window closes |
| Rate-limit bucket | 24h after its window expires |
| Email outbox | Ciphertext cleared immediately after delivery/failure; metadata 30d |
| Admin audit | 2 years |

Cleanup uses bounded 1.000-row batches, records count/duration/failure metrics and relies on PostgreSQL autovacuum. Retention values are server configuration with safe minimum/maximum bounds; audit retention changes require privacy/legal review before production.
