# Research

## Editor integration

Decision: one native500 freeform editor using functional module names and the existing paired schema3/renderer3 wire identifiers. Shared primitive projection validation/resolution/rendering is retained; legacy authoring, section rendering and capture dispatch are removed. Migration history and font asset IDs remain stable. All draft/public reader boundaries accept only the current design/scene; content1/2 is a separate data contract.


## Frontend and UI UX Pro Max

Decision: retain original platform identity, Lucide, existing PrivateOwner/operation lifetimes, contextual panels and scaled public wrapper. The user later explicitly approved a scoped Cinelove-style white/gray/blue editor layout from supplied screenshots. Rationale: existing public canvas already has ResizeObserver and scaled-height handling. Searches: `dragging movements --domain ux` verified visible/keyboard alternatives; `client components --stack nextjs` verified interactive leaf boundaries. No match for `editor contextual panels --stack nextjs`; narrowed query succeeded. Read installed Next docs for client/server boundaries. Global platform tokens remain unchanged; the editor refinement is documented in docs/design/MASTER.md.

## Media and interactions

Decision: extend durable AssetWriteService and reference locks for audio/presets; separate invitation-interactions module reuses principal/ownership and idempotency/rate-limit patterns. Rationale: image-only MIME, object-key extension, dimensions and multipart request guards all require coordinated changes. Preserve off-origin capture prohibition with static poster/audio-free capture. Alternative separate upload/storage bypass would violate retention and cleanup invariants.

Research collected through three read-only agents, as required by speckit-plan: contract/publication, frontend/session and media/interactions. No unresolved technical unknown remains before tasks.
