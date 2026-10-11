# Contract: Rendering and trusted publication

## Render entry and surfaces

`InvitationRenderer` accepts supported scene pair(1,1)|(2,2) and RenderContext; dispatches to version adapter. V1 render/measurement unchanged. V2 keeps one logical DOM with stable node/section keys, shared widget logic and intrinsic content frames.

`InvitationViewport` host has explicit width:100% and named inline-size query containment, outside capped invitation child. `adaptive` mode follows actual content-box width. `mobile` mode caps host390 and never picks desktop. V1 continues historical scale-to-fit branch. V2 does not transform-scale or hardcode canvas height; root height auto. Admin width inspection may constrain host390/900; Customer has no selector. Matrix viewport and actual host width both recorded.

Query at768 uses host width, inclusive. Width767 yields mobile max480, width768 yields adaptive768, width900/1440 yields900. Nested layout queries use the same named host, not accidental section ancestor. Opening envelope, product chrome and dialogs do not become the invitation sizing source.

V2 layout only changes CSS rules; node IDs/order/React keys remain stable. Resize does not re-resolve data, fetch assets or remount RSVP. Dialogs if present portal outside clipped artwork/query layers; preserve focus and existing widget state.

## Measurement

After fonts, img decode, CSS background decode and two settled animation frames, measure root, section/content bounds, horizontal scroll, text clipping and enabled controls. Natural height increase is allowed. Detect actual clipping rather than compare flow content to v1 authored height; artwork clipped by design is not functional overflow. Recheck at both widths; diagnostics on late loads cannot commit before readiness.

Publication validates normal frozen state plus existing RSVP open/error/validation-error/submitting/success/closed/unavailable/rate-limited combinations and countdown worst-case/expired. All width/state passes use one frozen asOf; screenshot restored to normal state. Capture never submits RSVP or calls external map/bank/provider services.

## Harness handshake

Protocol choice uses TWO globals, preserving legacy binary compatibility:

| Global | Supported requests | Contract |
| --- | --- | --- |
| `window.invitationRenderer` | scene1/renderer1 only | Existing `{version:1, render(request1)}` API and exact report1 fields stay unchanged |
| `window.invitationRendererV2` | scene1/renderer1 or scene2/renderer2 | `{protocolVersion:2, supportedScenePairs:[[1,1],[2,2]], render(request2)}` |

Old consumers keep the first global. New consumer selects legacy global for scene1 and V2 global for scene2; absence of V2 support rejects scene2, never falls back to the legacy renderer. New consumer verifies advertised protocol/pair before rendering. Both globals expose capture-only APIs; no preview/public test controls are added to these globals.

Request2 has required strict keys: `protocolVersion:2`, `candidateHash` (64 lowercase hex), `scene`, `context` (existing RenderContext with mode:capture), `states:'publication-validation'`, `containerWidth:390|900`, `scenePair:[1,1]|[2,2]`, `correlationId:UUID`. scenePair must agree with scene JSON. Protocol2 requests for pair[1,1] permit containerWidth390 only (legacy geometry); pair[2,2] permits390/900. A new correlationId is used for each width/pass; retain one candidateHash and frozen asOf for all passes. Reject unknown fields or concurrent requests on the same harness instance; run passes sequentially.

Report2 has required keys: `protocolVersion:2`, `candidateHash`, `scenePair`, `containerWidth`, `correlationId`, `ready:boolean`, `issues:Issue[]`, `rootRect:Rect`, `captureRect:Rect`, `hasVisibleRsvp:boolean`. Rect is `{x:number,y:number,width:number,height:number}` with finite coordinates and positive dimensions. rootRect measures uncropped natural scene bounds with width equal to requested390/900 within1 CSS px. captureRect origin is0/0, width equals requested width, height520; wrapper pads short scenes with deterministic background and clips only the screenshot crop, not functional measurement. Thumbnail screenshot uses mobile captureRect only after both width reports pass.

Issue has required `path:string,code:string` and optional `nodeId:UUID,sectionId:UUID,layout:'mobile'|'desktop'`. Sanitation retains only known codes/valid paths/UUIDs/layout and caps aggregated issues100. A requested width390 maps mobile,900 maps desktop; actual DOM must agree. Stale/mismatched protocol/hash/pair/width/correlation/geometry fails as RENDER_VERSION_MISMATCH. Invalid requests reject before rendering; fonts/assets/overflow use existing failure categories with sanitized diagnostics.

Trusted Chromium verifies readiness, hash/version/width/geometry, positive finite rectangles and allowed URLs; retain off-origin and method allowlist, harness origin/path validation and signed asset origin controls. Width/hash/pair mismatch fails publication, never silently uses mobile fallback for v2 desktop check.

## Commit, thumbnails and budgets

V1 takes existing pass. V2 requires BOTH width390 and900 pass; worker commit atomic only afterward. Candidate bytes/hash, lease, request idempotency, CAS, deadline and current-release checks stay enforced. Failed desktop pass leaves previous public snapshot intact; retry cannot commit stale candidate.

Keep one390×520 PNG thumbnail per existing revision contract, generated from mobile normal frozen scene after both widths pass. Desktop screenshots are validation evidence, not a new catalog asset. Existing cover override wins by current rules. For content shorter than crop, use deterministic background fill; avoid changing stored thumbnail dimension.

Capture operation baseline30s total, lease45s, job deadline90s. Browser/context sharing may optimize resource readiness but cannot mix candidates. Every wait bounded by remaining capture/job deadline; readiness timeout is explicit failure. Preserve staged-thumbnail refs/cleanup and heartbeat/fencing. Any budget change requires measured justification and updated constraints/tests.

## Compatibility acceptance

Seed real v1 draft/revision/jobs/public scenes before migration; publish each version afterward, render legacy fixture geometry and existing widgets. Upgrade readers before writers, reject unknown versions. Public current-release URL/asset allowlist behavior and no-store stay unchanged. Cache additions are out of scope; existing publicVersion bumps only upon commit and draft changes never invalidate the public snapshot.

## Independent renderer test host and gate prerequisites

Before prototype checks, create `apps/web/e2e/responsive-host/index.html`, `mount.tsx` and `vite.config.ts`. This is a web-owned test fixture served on a runner-owned loopback port by exact dev-only Vite8.3.0; no Next app route, prototype-app dependency or production global is introduced. Host accepts synthetic scene/context/host width and an injected prototype or production adapter, exposes test-only readiness/measurement, and mounts the same adapter once while width changes. Use Playwright intercepted RSVP HTTP responses for public-mode state/no-duplicate checks; these are local component evidence, not a published API snapshot.

T006 provisions/smoke-tests the host with a stub; T007 supplies prototype adapter; T008 runs `--phase prototype`. T028 switches it to production shared renderer, T030 uses `--phase rendering --story US1`. T039 later updates trusted capture protocol independently. Mandatory real production parity is Customer editor preview↔public at common mobile widths, and Admin preview↔public at390/900 in US3. Test-host popup wrapper proves mobile container policy only; UI-prototype demo/popup is excluded from production acceptance.

Persistence phase includes only direct-DB migration/version/metadata/ref checks and reference/asset deletion races. It does not execute capture/finalization, desktop publication failure, lease or CAS publication tests; those run in publication phase after T039–T044. Bare rendering runs both US1 and US2 subsets once both exist; early gates always pass explicit story selector.
