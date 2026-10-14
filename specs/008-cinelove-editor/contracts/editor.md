# HTTP and document contracts

Existing versioned REST base /api/v1 remains. Existing template draft PATCH accepts document3/sampleData2 and expectedVersion; stale writes return409. Create-template accepts metadata only and always creates the500 design contract with content2/fields defaults. Version-selection properties are rejected, old design writes are rejected and the copy-conversion endpoint is removed. No configuration flag selects another editor.

Admin preset GET/POST/PATCH/DELETE under /admin/editor-presets; expectedVersion on mutations, bounded pagination, template-only referenced assets. Existing asset list/upload/read/delete remains; audio uploads have separate20MiB multipart boundary and validated MP3 duration. Internal font catalog is packaged with web app.

Public invitation endpoints: GET/POST wishes; POST/DELETE likes; POST forms/:nodeId/responses. Submission Idempotency-Key is a UUID; reusing with different payload returns409, exact retry returns same receipt. Limit5 new writes/10min/source/invitation with Retry-After. Availability and current published widget configuration are checked inside write transaction.

Owner invitation endpoints: GET form responses and wishes; PATCH wishes/:wishId status. Admin assistance may moderate wishes with audited actor, never read private form/RSVP answers. Public projections contain only published presentation, approved wishes and like count.

Form fields max20: text/textarea/email/tel/number/date/select/multiselect, unique stable IDs, bounded labels/options/answers and required flags. No HTML/scripts. Links limited to https/http/tel/mailto or validated internal element anchors. YouTube video IDs are11 characters; iframe markup is not accepted. Guest URL name120 Unicode characters.

Scene3 renderer3 capture validates native500 then narrow390, restoring500 before screenshot. Capture report correlates candidate hash and visibleRSVP and actual root bounds. No external resource requests/audio/effects/envelope blocker during capture.
