# Feature Specification: Editor mở rộng với canvas 500px

**Feature Branch**: `master` (directory-based feature selection; no branch hook configured)
**Created**: 2026-10-12
**Status**: Approved
**Input**: Clone capabilities of inspected Cinelove editor into the existing admin; approved 500px plan and explicit implementation request.

Authority: approved conversation plan, followed by “Implement the plan”. New templates use a single 500px canvas, displayed at min(host width,500) with uniform scaling. Delete the existing local invitation/template/media data while preserving accounts. The product has one editor and no version selection or conversion flow. New editor-document published revisions remain immutable. Admin alone authors design; customers edit binding-derived content. Internal libraries only. No billing, payments, analytics dashboard or guest-list management.

## Clarifications

### Session 2026-10-12

- Q: Extent of clone? → A: All editor capabilities and necessary public behaviors; no billing/ecosystem expansion.
- Q: Who authors designs? → A: Admin only; customer edits content through forms.
- Q: Library source? → A: Internal stock, packaged font catalog and uploaded audio.
- Q: New customer content? → A: Extend content forms for media and widgets.
- Q: Wishes and likes? → A: Include wishes with moderation and likes per browser.
- Q: Canvas model after inspecting Cinelove? → A: New templates use one 500px design.
- Q: Must existing invitation data be preserved? → A: User explicitly instructed “bỏ dữ liệu thiệp cũ, ko cần quan tâm data có sẵn”. The follow-up instruction explicitly authorizes deleting local invitation data and removing all legacy editor/conversion entry points; acceptance uses fresh500 fixtures.

## User Scenarios & Testing

### User Story 1 - Admin designs and publishes a 500px template (Priority: P1)

Admin creates a new template, edits content/style/layout with contextual tools, saves, previews and publishes. Acceptance starts with fresh template data.

**Independent Test**: Create, save, reopen and publish a pilot; inspect it on narrow and desktop screens.

**Acceptance Scenarios**:
1. New template canvas is 500px; at 390px the complete layout scales by 0.78 and desktop never widens beyond 500px.
2. Lock, hide, multiselect, grouping, align, clipboard, crop, preset and undo/redo preserve authored data after reopening.
3. Autosave shows saved/error/conflict; two tabs never silently overwrite each other; recovery belongs only to the current user/template.
4. A fresh template is created directly as editor-document at 500px, without relying on importing or migrating existing invitation data.
5. Failed validation or publication leaves the prior public revision intact.

### User Story 2 - Admin reuses internal media and customer personalizes content (Priority: P1)

Admin chooses internal assets/presets and configures widgets; customer enters names, photos, album, audio, video and permitted custom content without editing design.

**Independent Test**: Use a media-rich pilot, fill its content as customer and publish.

**Acceptance Scenarios**:
1. Upload up to 15 images with individual progress/errors; original images survive non-destructive crop/mask/flip.
2. MP3 <=20MiB and <=10min is accepted; invalid media is rejected and referenced files cannot be deleted.
3. Binding-derived fields include album/video/audio/contact content; customer cannot mutate template geometry, effects or widget configuration.
4. Gallery/carousel/video/contact/reminder/guest name/QR/form and existing widgets display in editor, preview and public.

### User Story 3 - Guests interact and owner manages responses (Priority: P1)

Guest sends RSVP/custom form/wish and likes a published invitation. Owner reads private responses; owner/admin moderates wishes.

**Independent Test**: Submit, retry, moderate and inspect public/private projections.

**Acceptance Scenarios**:
1. New wish is pending; only approved wishes are public; moderation is audited.
2. Retry of the same submission creates one response; browser likes are idempotent and removable.
3. Unpublished/disabled widgets reject writes; previews never record real interactions.
4. Only owner reads RSVP and custom-form answers; supporting admin may moderate wishes but cannot read private answers.

### User Story 4 - Admin controls presentation and sharing (Priority: P2)

Admin configures effects, envelope, music, toolbar, autoscroll and language; shared links show published metadata.

**Independent Test**: Publish both motion-enabled and reduced-motion presentations and inspect server-rendered metadata.

**Acceptance Scenarios**:
1. Music starts after interaction; autoscroll and carousel can pause; reduced motion disables nonessential effects.
2. Vietnamese/English changes widget labels without translating authored text.
3. Capture shows opened envelope/static effects/poster and makes no external requests; share metadata never leaks draft content.

### Edge Cases

Missing assets/fonts, overflow, unsupported versions, invalid URLs/media, interrupted uploads, 24h recovery expiry, logout/account change, conflicting drafts, duplicate requests, moderation races, hidden forms, unpublish during submit and browser autoplay refusal must have bounded, explicit outcomes.

## Requirements

### Functional Requirements

- FR-001: Versioned design/content, strict validation and immutable published editor-document revisions; no existing-data migration or preservation requirement.
- FR-002: New-template 500px default; height 500–16000; public scale preserves geometry/state; no dependency on existing invitation data. Only the500 editor can be created/opened/imported; no version selector, conversion action or creation fallback is exposed.
- FR-003: Admin workspace with contextual tools/properties, layers, multiselect, group, duplicate, clipboard, align/distribute, snapping, crop/mask/flip, typography, gradient and undo/redo.
- FR-004: Automatic draft saving after 1500ms idle, conflict preservation; user/template-scoped local backup, 24h expiry and logout cleanup.
- FR-005: Internal stock/audio/preset library, multi-file upload (15), MP3 <=20MiB/10min; media references retained across drafts/published revisions/presets. Font catalog is packaged locally.
- FR-006: Album/carousel/YouTube/contact/calendar reminder/guest name/QR Box/custom form and existing widgets; customer field expansion is content only.
- FR-007: Public wishes pending moderation, likes per browser, owner-only form responses, owner/admin wish moderation with audit; public availability, rate-limit and idempotency checks.
- FR-008: Effects, envelope, particles, music, toolbar, autoscroll, vi/en widget labels, published sharing metadata; reduced motion and pause controls. Preview/capture cannot write interactions.
- FR-009: Trusted capture uses 500px, measures narrow display too, disables motion/audio/external embeds and opens envelope; errors retain prior publication.

- FR-010: One product editor only:500 creation/open/import/duplication, metadata-only create requests, no version selector, conversion endpoint or fallback flag; reject old design authoring.
- FR-011: Explicitly delete local invitation/template/publication/interaction/preset/media data and stored objects while preserving accounts/authentication; provide a bounded local-only reset command with documented data-loss impact.
- FR-012: Match the supplied Cinelove new-blank layout: compact single header, left icon rail, collapsible library, gray workspace with centered500 canvas, floating zoom, right customization/share preview, background palettes and file dropzone; accessible mobile drawers remain available.

### Key Entities

Template/draft/revision, design node/group/preset, content field/media reference, audio/stock asset, publication snapshot, wish/moderation event, browser like and custom-form response.

## Success Criteria

### Measurable Outcomes

- SC-001: Complete admin -> customer -> publication -> guest -> owner pilot succeeds for all four stories with no lost authored properties.
- SC-002: New designs preserve their proportions at 320/375/390/500px; desktop stays capped at 500px, without horizontal page overflow.
- SC-003: The complete pilot uses fresh editor-document templates and content2 invitations; no existing invitation data or conversion is needed.
- SC-004: Same-request retries produce one stored submission; zero cross-owner private answers or draft values appear publicly.
- SC-005: Saved recovery expires within 24h and disappears on logout; invalid/missing media or failed publication cannot replace current public content.
- SC-006: Every core editor operation is usable through keyboard or visible controls; effects honor reduced motion and moving public features can pause.

- SC-007: The local reset preserves the account count; fresh create/open/save/reopen uses one editor, version-selection requests and old draft writes fail, and conversion routes are absent.
- SC-008: Desktop expanded/collapsed library, background and image panels visually follow the supplied reference; mobile panels preserve keyboard focus and the editor has no horizontal page overflow.

## Assumptions

Existing platform branding remains authoritative. No arbitrary scripts/iframe markup; YouTube uses video IDs/posters. Guest name is a bounded, transient URL value rather than a guest list. Likes indicate browser identities rather than verified people. Defaults and operational contracts are documented in plan/data-model/contracts.


## Superseding scope — single editor (2026-10-12)

The user explicitly requires one Cinelove-style editor and deletion of old invitation data. All create/open/edit/import flows use the native500 editor. No product version selector, legacy editor route, conversion action or feature flag can select another editor. Existing local templates, invitations, publications, interactions, presets and their stored media are deleted; accounts/authentication remain. Internal schema identifiers and reusable rendering primitives are implementation details, not selectable product versions. New publications remain immutable.

Layout refinement: follow the supplied Cinelove new-blank screenshots: compact single header, left icon rail, collapsible contextual library, centered500 canvas on neutral gray workspace, floating zoom and persistent right properties/share preview. Use original platform identity; no third-party artwork or billing upsell.

### Source cleanup revision (2026-10-12)

- FR-013: Remove obsolete authoring implementations and legacy runtime editor/rendering branches. Name the single current editor and its modules by function rather than v1/v2/v3. Shared primitive validation, resolution and rendering remain reusable modules. Immutable database migrations and persisted numeric schema identifiers are not product versions and remain stable.
- FR-014: Editor operations parity (2026-10-13 survey): cut, right-click context menu, strikethrough, triangle shape, colour pickers, height stepper, per-side border, separate text shadow, locate-by-ID, whole-page preset entrance animations.
- FR-015: Free-widget configuration parity: calendar, countdown, call button, map, reminder, RSVP labels/colours, carousel transitions/autoplay with pause.
- FR-016: Library taxonomy and local seed: categorised stock/preset/music, music trim and icon style/colour; seed copies category structure only, with original or generated assets.
- Exclusions (user, 2026-10-13): premium Cinelove features are out of scope: envelope/intro effects, falling/particle effects, album/YouTube/custom form/guest-name/QR multi-account, advanced RSVP fields, own-music upload, watermark/plans, template gallery publishing.
- SC-010: Every FR-014..016 item is covered by tests and demonstrated in the three-browser pilot.
- SC-009: No version-named editor module or selectable legacy editor remains; current creation, save, recovery, rendering and trusted publication pass bounded verification.
