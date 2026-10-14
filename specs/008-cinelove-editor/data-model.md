# Data model

- EditorDocument (persisted schema3): schemaVersion3, ROOT canvas{width500,height500..16000,background}, ordered leaf nodes, node options(group/crop/mask/flip/action/motion), settings(locale/share/audio/envelope/particles/autoscroll/toolbar/gradient). Native geometry is never rewritten by viewport.
- Existing primitive/widgets keep their content/bindings. Advanced nodes: Album, Carousel, YouTube, Contact, Reminder, GuestName, CustomForm; content stores label and typed configuration plus optional named customer field source.
- WeddingData2 preserves all v1 wedding fields, adds named content fields for media/list/text/contact. Only fields declared by pinned template are rendered; all referenced assets are retained.
- Preset: id/name/category/document fragment/createdBy/editVersion; separate asset-ref membership protects internal media. Insertion generates fresh identities/group IDs.
- Asset AUDIO: audio/mpeg, .mp3 key, duration in milliseconds; image dimensions remain positive for images, audio dimensions are zero. Durable writes/cleanup retain current transitions.
- Wish: invitation/name/message/PENDING|APPROVED|HIDDEN/createdAt; moderation audit records actor/time/action. Only APPROVED public.
- Like: invitation/browser UUID composite key; aggregate count is public; no verified identity claim.
- FormResponse: invitation/node ID/published revision schema/answers/idempotency key/hash/createdAt; owner-only reads. No admin support read escalation.
- Interaction rate records bound per-source/per-invitation writes to 5 new submissions/10min; retries do not consume a new submission.
- Local recovery: owner/template/version/document/sampleData/savedAt, 24h expiry; logout purges storage and superseded async completions are ignored.

All storage changes are migrations, synchronize stays false. Only the500 authoring contract is exposed; shared primitive projection validation/resolution remains internal; historical runtime readers and legacy editor UI are removed. Local invitation data is explicitly reset while preserving accounts; downgrade refuses retained3/2/new media rows.
