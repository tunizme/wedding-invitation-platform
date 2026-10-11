# Implementation baseline — feature007

Baseline recorded2026-10-11 before application edits. Git branch master, HEAD `e784132f989f3883790e298f5370c189741637b2`. Working tree has ongoing004/005/006 changes; not discarded, committed or treated as merged. Local source hashes/status recorded in ignored `.artifacts/responsive/baseline-source-hashes.json` and `baseline-status.txt`. These contain source paths/hashes, no env values.

Toolchain: Node24.21.0, pnpm12.3.4. Stack versions follow manifests/lockfile. Production surfaces: Customer editor at /invitations/[id]/edit, public /i/[slug], Admin /admin/templates/[id]/edit, internal capture /internal/invitation-renderer. Prototype demo/popup exists only in apps/ui-prototype and is excluded from production parity.

Reviewed installed Next16 CSS Modules and Server/Client Components guides before web edits. Existing ignore files cover node_modules/build/dist/artifacts/env; apps are private, no npm publishing ignore needed. Applicable UI guidance: shared renderer, readable reflow, stable focus/state,44px targets, keyboard alternatives, image alt and reduced motion, keeping MASTER unchanged.

Legacy corpus004 remains regression oracle. Baseline runtime compatibility checks are pending runner setup; this record does not claim PASS.

## Setup and prototype evidence (2026-10-11)

- Runner unit gate: 8/8 PASS, bounded timeout, preflight, exit failures, redaction and fail-fast.
- Independent host smoke: Chromium/Firefox/WebKit PASS using owned `wedding-builder-playwright:1.63.0` container; Docker container removed in finally. Native WebKit could not launch on host because its Ubuntu libraries are absent.
- Prototype gate: PASS, run `8d376a18-353b-4454-a9ef-8a939abe080e`, three browsers, container767/768/900/1440, image grid and public RSVP value/focus/success retained across resizing with one intercepted submission. This is local fixture evidence, not publication evidence.
- Nested section/leaf wire rules remain unchanged after spike. Production will use validated typed scene2 and intrinsic leaf content rather than spike casts. Dual global capture remains separate from the independent host.
