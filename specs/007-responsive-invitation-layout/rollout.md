# Feature007 rollout and rollback

This is a reviewable procedure, not deployment evidence. No deployment or database downgrade was performed by implementation.

## Readers before writers

1. Provision the documented configuration and verify dependency readiness. Apply explicit migration `20261011000100-ResponsiveInvitationDocuments.ts` before starting dependent binaries; runtime synchronization remains disabled. Migration failure blocks startup/release.
2. Release compatible web/API/trusted capture consumers that read both document/scene pairs1/1 and2/2. Preserve the exact legacy capture report1 global; protocol2 advertises supported pairs explicitly and validates request/report identity, candidate hash and canonical width. Do not enable v2 writers against v1-only API/capture/public readers.
3. Require independent app quality gates, PostgreSQL integration, legacy compatibility and responsive all gate. The verified pilot uses full390/900 layout/state checks before a final normal390px thumbnail; cover ratio/catalog contract is unchanged. Capture30s, lease45s and immutable job90s stay unchanged.
4. Enable Admin creation of section templates only with compatible consumers. Existing templates and invitations remain intact; conversion is explicit re-authoring into a separate template/revision. Review content, assets, bindings and both widths before publishing. No batch conversion or invitation repinning.
5. Monitor structured publication failures by layout/node/section and readiness. A failure preserves the prior snapshot; staging cleanup and CAS/lease fences remain active. The implementation is not evidence of production throughput or a deployed release.

## Compatible binary rollback

Once any v2 draft, revision, candidate or public snapshot exists, rollback must retain a binary that reads v2. Pause new v2 writes through operational admission if necessary, while retaining v2 public readers and asset authorization. A v1-only binary cannot safely serve this state. Restoring a previous compatible reader is separate from schema downgrade; do not downgrade constraints as part of routine binary rollback.

## Guarded database down

The new migration inspects all relevant document/revision/job/public metadata and refuses down while v2 state exists, before changing constraints or DDL. Persistence tests verify refusal leaves data/schema unchanged. Do not delete v2 rows to make down succeed. Any retirement/export/manual data operation needs its own reviewed plan covering pinned invitations, immutable snapshots/candidates and asset retention. Only after that separate operation demonstrates no v2 state may an explicit operator-run downgrade be considered. Historical migrations are unchanged.

## Public release and assets

Keep existing current-release lookup and `no-store` policy. Public asset allowlists derive from the current resolved snapshot, not all authored or hidden/fallback candidates. Retention still covers all authored nested/background/artwork/fallback references in drafts, immutable revisions and jobs. Replacement/unpublish revokes access to assets belonging only to the old public release; do not add a CDN/cache invalidation framework or weaken ownership checks.

## Evidence

[validation.md](validation.md) records real Next/Nest/PostgreSQL/MinIO/browser evidence and cleanup. [quickstart.md](quickstart.md) documents commands and ownership. The design authority in `docs/design/MASTER.md` was not changed by feature007.
