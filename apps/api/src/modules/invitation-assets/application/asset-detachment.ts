import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { canonicalHash } from '../../invitation-builder/domain/validation-helpers';

/** Caller has authorized and locked the asset and set its DELETING tombstone. */
export async function detachImage(
  manager: EntityManager,
  id: string,
): Promise<void> {
  await manager.query("SELECT set_config('builder.deleting_asset',$1,true)", [
    id,
  ]);
  // Resource writes normally lock the resource before its assets. The caller
  // retries deadlocks so a competing save either commits before this redaction
  // or observes DELETING and rejects the stale asset; it cannot resurrect it.
  const templates = await manager.query<{ id: string }[]>(
    `
    WITH changed AS (UPDATE invitation_templates t SET
      draft_document=builder_remove_asset(t.draft_document,$1::text),
      draft_sample_data=builder_remove_asset(t.draft_sample_data,$1::text),
      cover_asset_id=CASE WHEN cover_asset_id=$1::uuid THEN NULL ELSE cover_asset_id END,
      edit_version=edit_version+1,updated_at=clock_timestamp()
    WHERE cover_asset_id=$1::uuid
      OR draft_document IS DISTINCT FROM builder_remove_asset(draft_document,$1::text)
      OR draft_sample_data IS DISTINCT FROM builder_remove_asset(draft_sample_data,$1::text)
      OR EXISTS(SELECT 1 FROM template_design_revisions r WHERE r.template_id=t.id AND (
        r.document IS DISTINCT FROM builder_remove_asset(r.document,$1::text)
        OR r.sample_data IS DISTINCT FROM builder_remove_asset(r.sample_data,$1::text)))
    RETURNING t.id) SELECT id FROM changed`,
    [id],
  );
  await manager.query(
    `
    DELETE FROM template_draft_asset_refs refs USING invitation_templates t
    WHERE refs.template_id=t.id AND (refs.asset_id=$1::uuid OR (t.id=ANY($2::uuid[]) AND NOT refs.asset_id=ANY(
      builder_asset_ids(t.draft_document)||builder_asset_ids(t.draft_sample_data))))`,
    [id, templates.map((row) => row.id)],
  );

  const revisions = await manager.query<
    {
      id: string;
      document: unknown;
      sample_data: unknown;
    }[]
  >(
    `
    SELECT id,builder_remove_asset(document,$1::text) AS document,builder_remove_asset(sample_data,$1::text) AS sample_data
    FROM template_design_revisions
    WHERE document IS DISTINCT FROM builder_remove_asset(document,$1::text)
      OR sample_data IS DISTINCT FROM builder_remove_asset(sample_data,$1::text)
    ORDER BY id FOR UPDATE`,
    [id],
  );
  for (const row of revisions) {
    // A rendered thumbnail can still contain the removed image. Invalidate it;
    // the next explicit publication produces a fresh thumbnail.
    await manager.query(
      `UPDATE template_design_revisions SET document=$2,sample_data=$3,
      document_hash=$4,thumbnail_asset_id=NULL WHERE id=$1`,
      [
        row.id,
        row.document,
        row.sample_data,
        canonicalHash({ document: row.document, data: row.sample_data }),
      ],
    );
    await manager.query(
      `DELETE FROM template_revision_asset_refs refs USING template_design_revisions r
      WHERE refs.revision_id=r.id AND r.id=$1 AND NOT refs.asset_id=ANY(
        builder_asset_ids(r.document)||builder_asset_ids(r.sample_data))`,
      [row.id],
    );
  }
  await manager.query(
    `DELETE FROM template_revision_asset_refs refs USING template_design_revisions r
    WHERE refs.revision_id=r.id AND refs.asset_id=$1::uuid
      AND NOT refs.asset_id=ANY(builder_asset_ids(r.document)||builder_asset_ids(r.sample_data))`,
    [id],
  );

  const invitations = await manager.query<{ id: string }[]>(
    `
    WITH changed AS (UPDATE invitations SET
      draft_document=builder_remove_asset(draft_document,$1::text),
      draft_wedding_data=builder_remove_asset(draft_wedding_data,$1::text),
      published_wedding_data=builder_remove_asset(published_wedding_data,$1::text),
      published_scene=builder_remove_asset(published_scene,$1::text),
      public_version=public_version+CASE WHEN
        published_wedding_data IS DISTINCT FROM builder_remove_asset(published_wedding_data,$1::text)
        OR published_scene IS DISTINCT FROM builder_remove_asset(published_scene,$1::text) THEN 1 ELSE 0 END,
      edit_version=edit_version+1,updated_at=clock_timestamp()
    WHERE (editing_mode='FORM_ONLY' AND design_revision_id=ANY($2::uuid[]))
      OR draft_document IS DISTINCT FROM builder_remove_asset(draft_document,$1::text)
      OR draft_wedding_data IS DISTINCT FROM builder_remove_asset(draft_wedding_data,$1::text)
      OR published_wedding_data IS DISTINCT FROM builder_remove_asset(published_wedding_data,$1::text)
      OR published_scene IS DISTINCT FROM builder_remove_asset(published_scene,$1::text)
    RETURNING id) SELECT id FROM changed`,
    [id, revisions.map((r) => r.id)],
  );
  await manager.query(
    `DELETE FROM invitation_asset_refs refs USING invitations i
    WHERE refs.invitation_id=i.id AND (refs.asset_id=$1::uuid OR (i.id=ANY($2::uuid[]) AND NOT refs.asset_id=ANY(
      builder_asset_ids(CASE WHEN refs.slot='DRAFT' THEN i.draft_wedding_data ELSE i.published_wedding_data END)||builder_asset_ids(CASE WHEN refs.slot='DRAFT' THEN i.draft_document ELSE i.published_scene END))))`,
    [id, invitations.map((row) => row.id)],
  );

  const presets = await manager.query<{ id: string; edit_version: number }[]>(
    `
    SELECT p.id,p.edit_version FROM editor_presets p WHERE EXISTS (
      SELECT 1 FROM editor_preset_revisions r WHERE r.preset_id=p.id
        AND r.document IS DISTINCT FROM builder_remove_asset(r.document,$1::text)) ORDER BY p.id FOR UPDATE`,
    [id],
  );
  for (const preset of presets) {
    await manager.query(
      `UPDATE editor_preset_revisions SET document=builder_remove_asset(document,$2::text)
      WHERE preset_id=$1 AND document IS DISTINCT FROM builder_remove_asset(document,$2::text)`,
      [preset.id, id],
    );
    await manager.query(
      `DELETE FROM editor_preset_asset_refs refs USING editor_preset_revisions r
      WHERE refs.revision_id=r.id AND r.preset_id=$1 AND NOT refs.asset_id=ANY(builder_asset_ids(r.document))`,
      [preset.id],
    );
    const revisionId = randomUUID();
    await manager.query(
      `INSERT INTO editor_preset_revisions(id,preset_id,revision,document)
      SELECT $1,preset_id,revision+1,document FROM editor_preset_revisions WHERE preset_id=$2 AND revision=$3`,
      [revisionId, preset.id, preset.edit_version],
    );
    await manager.query(
      `INSERT INTO editor_preset_asset_refs(revision_id,asset_id)
      SELECT $1,unnest(builder_asset_ids(document)) FROM editor_preset_revisions WHERE id=$1`,
      [revisionId],
    );
    await manager.query(
      'UPDATE editor_presets SET edit_version=edit_version+1,updated_at=clock_timestamp() WHERE id=$1',
      [preset.id],
    );
  }

  // A worker holding old candidate bytes must never commit a deleted image.
  const jobs = await manager.query<{ id: string }[]>(
    `
    SELECT id FROM publication_jobs j WHERE status IN ('PENDING','RUNNING') AND (
      EXISTS(SELECT 1 FROM publication_job_asset_refs r WHERE r.job_id=j.id AND r.asset_id=$1::uuid)
      OR candidate_document IS DISTINCT FROM builder_remove_asset(candidate_document,$1::text)
      OR candidate_data IS DISTINCT FROM builder_remove_asset(candidate_data,$1::text)) ORDER BY id FOR UPDATE`,
    [id],
  );
  const jobIds = jobs.map((row) => row.id);
  if (jobIds.length) {
    await manager.query(
      `UPDATE publication_jobs SET status='FAILED',error_code='ASSET_UNAVAILABLE',
      candidate_document=NULL,candidate_data=NULL,completed_at=clock_timestamp(),
      staged_thumbnail_key=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE id=ANY($1::uuid[])`,
      [jobIds],
    );
  }
  await manager.query(
    'DELETE FROM publication_job_asset_refs WHERE asset_id=$1::uuid OR job_id=ANY($2::uuid[])',
    [id, jobIds],
  );
  // Prune obsolete reverse indexes as well as the JSON itself.
  await manager.query(
    'DELETE FROM editor_preset_asset_refs WHERE asset_id=$1',
    [id],
  );
}
