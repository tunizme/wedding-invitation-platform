# Private object storage: MinIO now, S3-compatible adapter

User-approved replacement for API-local durable files. This is a planned contract, not an assertion that MinIO is installed or AWS has been tested.

## Ownership and portability

- API owns `AssetStore` and `S3AssetStore`, implemented with AWS SDK v3 `@aws-sdk/client-s3`. Domain services depend on the port. Production has one configured bucket/prefix; database rows retain provider-neutral keys, not endpoint URLs or credentials. Do not use MinIO-specific SDK APIs in business code.
- Required object API subset: PutObject, GetObject, HeadObject, DeleteObject and paginated ListObjectsV2 for owned test-prefix cleanup. Provisioning uses separate privileged tooling. Small bounded images/thumbnails use single PutObject, not multipart uploads. No ACL headers, public policies, object versioning dependency or MinIO-only metadata behavior.
- Compose manages MinIO and its persistent volume. API temporary files are scratch, not durable asset storage. Bundled licensed fonts remain web build assets.
- T002 must verify the selected MinIO distribution, runnable server/client images, license/setup prerequisites and SDK compatibility, then record immutable image digests and an exact SDK version. No floating `latest`, unverified image availability, silent substitute provider or production-support claim. This precedes all storage-dependent gates.

## Access and configuration

- Private buckets; anonymous GetObject and ListBucket denied. Scoped non-root API credentials permit only object read/write/delete and bucket listing under its configured namespace. Bucket creation/policy/identity administration uses infrastructure credentials, never API credentials.
- API receives uploads, validates and normalizes bytes, then writes objects. Every download checks current application authorization before streaming bytes. Return no public/presigned storage URL or redirect, including thumbnail and capture paths. Keep existing no-store/unpublish rules.
- API-only variables: `BUILDER_S3_ENDPOINT`, `BUILDER_S3_REGION`, `BUILDER_S3_BUCKET`, `BUILDER_S3_PREFIX`, `BUILDER_S3_FORCE_PATH_STYLE`, paired `BUILDER_S3_ACCESS_KEY_ID`/`BUILDER_S3_SECRET_ACCESS_KEY`, optional `BUILDER_S3_SESSION_TOKEN`. Omit both keys for the AWS SDK default credential chain; reject partial pairs and a token without explicit keys. Never log secrets or SDK error payloads.
- MinIO local: endpoint `http://127.0.0.1:9000` (Compose API uses `http://minio:9000`), region `us-east-1`, path style true. AWS later: omit custom endpoint, use target region/bucket and path style false; prefer IAM-role credentials. Custom endpoint must be a configured origin without credentials/path/query/fragment, never user input. HTTP only for explicit local/test deployment; use TLS outside that environment.
- Validate config without contacting storage during builds. No bucket creation or policy mutation on API startup. Missing/invalid configuration fails fast; runtime storage outage returns safe `503 STORAGE_UNAVAILABLE` for affected operations without changing existing publication metadata or stopping unrelated IAM routes. Existing page assets may be unavailable during an outage; do not promise uninterrupted reads.

## Bounded writes and cleanup

1. Validate/normalize in bounded memory or owned scratch. Before network write, persist an `asset_storage_writes` intent with a unique key, ownership token and deadline. Upload write deadline is 30 seconds from intent creation; thumbnail deadline is the earlier of that limit and the current publication attempt/job deadline.
2. PutObject writes the immutable key directly. There is no object rename or cross-store transaction. Compute SHA-256 from normalized bytes and persist it; do not treat ETag as a universal content checksum. Retry the same bytes/key only within that intent, never overwrite another committed asset.
3. Only after confirmed upload success, finalize asset metadata and intent in one SQL transaction. Check WRITING/token/deadline after locking; thumbnail publication also checks the current job lease. Lock order extends existing resource → job → assets order with write intents last. Do not hold SQL locks over object requests. Uncertain upload success is an error and leaves an unreferenceable intent for cleanup.
4. Expired writers cannot commit. Cleanup locks an expired intent, marks ABANDONED, then deletes its object outside the transaction after an hour grace period. COMMITTED intents are excluded; referenced assets remain protected by the existing deletion protocol. Retain ABANDONED key tombstones and periodically retry deletion so a late ambiguous PutObject cannot resurrect a permanently orphaned file. Never reuse those keys. Store `cleaned_at` for fair retry scheduling; process at most 100 intents per minute, oldest checked first. No bucket-wide age lifecycle rule may delete referenced assets.
5. Normal asset deletion locks/checks references, marks DELETING, commits, deletes the object and marks DELETED. A missing object is idempotent success; authorization/network failures stay retryable and do not mark deletion complete.

Each SDK operation has an end-to-end 10-second timeout including retries and response-body consumption, at most two total attempts, and respects a shorter request/job/runner deadline. Abort/close streams on client disconnect or timeout. Existing decoder limits remain separate. Upload/thumbnail failures preserve old public pointers, but cannot guarantee storage availability during an outage.

## Local provisioning and real integration tests

- Setup, before T012: pin Compose MinIO server/client, add bounded readiness, `pnpm builder:storage:init` (60-second deadline), private development/test bucket provisioning and non-root identities. API-owned provisioning script contains storage policies; root script only orchestrates. Host storage/console ports bind loopback; console is not an application route. Root credentials belong to local/CI infrastructure secrets.
- Test runner requires all six `BUILDER_TEST_S3_*` variables below and rejects a test bucket equal to the configured development bucket. Provisioning receives separate development/test credentials from local configuration or CI secrets and creates two scoped non-root identities without logging secrets. The test identity can access only the test bucket under `tests/`, not development data.
- Runner validates test configuration before starting dependent processes, then maps the six variables to their corresponding `BUILDER_S3_*` names only in child-process environments. It generates `BUILDER_S3_PREFIX=tests/<uuid>/` itself; no caller-supplied test prefix. Clear inherited `BUILDER_S3_SESSION_TOKEN` for these static MinIO test credentials. Missing or invalid variables fail fast with variable names only; never fall back to development credentials or the AWS default credential chain. Parent environment remains unchanged. IAM-only unit/build checks need no live storage; builder foundation and later storage suites use real MinIO.

| Test variable | Rule |
|---------------|------|
| `BUILDER_TEST_S3_ENDPOINT` | Required configured MinIO origin |
| `BUILDER_TEST_S3_REGION` | Required; local `us-east-1` |
| `BUILDER_TEST_S3_BUCKET` | Required; different from development bucket |
| `BUILDER_TEST_S3_ACCESS_KEY_ID` | Required separate test identity |
| `BUILDER_TEST_S3_SECRET_ACCESS_KEY` | Required test identity secret |
| `BUILDER_TEST_S3_FORCE_PATH_STYLE` | Required strict boolean; local `true` |

- Every story/phase budget includes a reserved final 30 seconds: `hardDeadline = startedAt + phaseBudget`, `workDeadline = hardDeadline - 30 seconds`. Workload commands use the remaining work budget. On success, error, handled signal or workDeadline, stop accepting work and terminate owned writers/streams before cleanup. Shutdown and cleanup together get at most `min(30 seconds, hardDeadline - now)`; never extend the total phase budget.
- Cleanup only the owned prefix: paginate listings, bound each storage operation to `min(10 seconds, remaining cleanup budget)` including retries/body consumption, and start no retry after cleanup deadline. Drop only the owned schema/scratch and release owned resources. Never drop a shared bucket, unrelated prefix or volume. If writers cannot be stopped within budget, report failure rather than claiming complete cleanup.
- Incomplete cleanup exits nonzero even when tests passed. Record `cleanup: FAILED`, the test bucket/prefix, remaining owned resources (or explicitly unknown inventory if listing failed), and a sanitized reason; no secrets or private payloads. Setup runner self-tests cover workload timeout entering cleanup, hanging storage respecting hardDeadline, scope refusal and failure reporting. SIGKILL or host shutdown cannot guarantee cleanup; preserve safe run identifiers early for later recovery.
- Foundation verifies Put/Get/Head/Delete, private bucket policy, byte SHA-256 round-trip, missing keys, bad credentials, endpoint outage/timeouts, write-intent fencing and namespace isolation against real MinIO. Later asset/publication tests cover upload-success/SQL-failure, ambiguous write completion, stale thumbnail worker, referenced delete race, storage outages and immediate authorization after unpublish.
- Keep MinIO integration as the MVP storage gate. Passing it is not evidence of a live AWS deployment. Preserve four existing CI job names; add MinIO setup/health/cleanup to affected integration/full-stack jobs without requiring it for independent app builds.

## Future AWS move

Reuse the S3 adapter and asset IDs. Provision a private S3 bucket and least-privilege IAM policy, copy all retained objects under identical relative keys/prefix mapping, verify inventory/byte sizes/SHA-256 against database records, and coordinate writes during cutover. Then change endpoint/region/bucket/credentials/path-style settings and verify reads, writes, deletion and authorization against AWS. Back up PostgreSQL and object data consistently. Production migration/deployment is a separately authorized operation; switching environment variables alone does not move existing images.
