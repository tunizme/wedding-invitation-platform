# Implementation Plan: Cinelove capabilities and 500px canvas

**Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

## Summary

Keep independent Next.js/NestJS apps, modular monolith, PostgreSQL JSONB and S3. Add strict editor-document freeform contract and separate editor/renderer; reuse primitive/widgets and existing binding/publication services. The product has one500 editor; old authoring UI and conversion endpoints are removed. Shared low-level primitive projection algorithms remain internal; historical migrations remain immutable and no alternate editor or runtime legacy reader remains. Preserve optimistic concurrency, owner scopes, asset retention, idempotency and immutable snapshots.

Order: 500 contract/migration/capture -> workspace/commands/autosave/recovery -> media/library/presets/customer fields -> interactions -> effects/sharing and whole-stack acceptance. Creation has no version or fallback flag.

## Technical Context

TypeScript; Next.js16/React19, React document history/Moveable, CSS Modules/Lucide/current Warm Ivory tokens; NestJS11 modular monolith, TypeORM/PostgreSQL JSONB, S3-compatible storage, trusted Chromium. Each app owns independent runtime/schema. Tests: Vitest, PostgreSQL contract/integration, Playwright Chromium/Firefox/WebKit. MP3 metadata is parsed before persistence; no audio transcoding/provider API. New editor-document uses ROOT freeform nodes and native width500, not section reflow. Operational ceilings retain existing 1MiB design/256KiB wedding data/200 nodes/30 widgets; editor-document height16000.

## Constitution Check

Approved scope and architecture reviewed against constitution I–V: no new service, no runtime DB synchronization, no shared app runtime, no credentials or foreign assets copied. Known hazards: hardcoded scene dispatch/capture width, strict wedding JSON CHECK, audio image-only storage and private session lifetimes; changes must cover each before completion.

Pre-design and post-design: scope PASS; independence PASS; reproducible DX PASS; explicit migration PASS; verifiable quality/secrecy PASS. Requirements checklist and artifact analysis precede coding. Approval already exists in conversation; no additional review request is needed.

## Project Structure

Feature documents: spec, research, data-model, contracts, quickstart, tasks and checklist in this directory. Backend code: invitation-builder/domain and publication; invitation-assets; invitation-interactions. Frontend code: invitation-builder/document/editor/renderer and invitations content forms. Tests remain in each owning app. No new service or shared root business module.

## Complexity Tracking

No constitution exception. The single editor/renderer reuses primitive geometry, widgets and lifecycle services; persisted schema identifiers remain stable during source cleanup.

## Single-editor revision

Supersedes compatibility/creation-gate decisions above: remove legacy UI dispatch and conversion endpoint, fix template creation/save/duplication to the500 design contract, remove fallback flags, and provide an explicitly destructive local-only invitation reset command. Stop the local API while resetting to avoid publication races; preserve users and authentication. Validate the one-editor path with schema rejection contracts and the fresh-data browser pilot.

### Source cleanup

Replace version-named current modules with functional names; remove obsolete authoring and runtime rendering dispatch, extracting reusable primitives. Preserve migration history, REST API namespace and persisted schema/protocol numbers. Verify imports, current editor tests and trusted publication after refactoring.
