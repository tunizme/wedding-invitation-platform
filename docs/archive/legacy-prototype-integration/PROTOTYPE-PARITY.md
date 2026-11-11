# Complete prototype → product mapping

Approved 2026-10-11: implement all supported prototype product UI and improve Admin creation/authoring. Historical functional acceptance did not establish visual parity. This matrix is the acceptance ledger for module005 US8–US10; pending means work/review remains.

Compare prototype `http://localhost:3300/#/...` with actual `http://localhost:3000/...` at390×900 and1440×1000 after fonts/images settle. Hide only prototype review/scenario/role controls. Compare composition, copy, spacing, tokens, responsive behavior, focus/recovery, not generated IDs or elapsed dates. Pixel heatmaps are diagnostic; inspected paired images and named geometry decide gap disposition.

| Surface | Prototype | Production | Gap / acceptance | Status |
| --- | --- | --- | --- | --- |
| Home | /home | / | Editorial hero, style strip, illustrative featured cards, statement, steps, CTA | Pending |
| Header/footer/avatar | shared | product shell | Brand/nav/avatar + three-part footer, real session roles | Pending review |
| Gallery | /templates | /templates | Editorial heading, supported filter presentation/cards | Pending |
| Template popup | /template/:id | gallery modal | Rectangle390, protected renderer/QR/details/CTA/focus | Pending review |
| Demo/opening | /demo/:id | /templates/:id/demo | Opening600, actual sample images when available, adaptive900 | Pending review |
| Overview | /overview | /overview | Welcome, loaded-page statistics/recent invitations/CTA | Pending |
| Invitations | /invitations | /invitations | Cards/actions/empty/recovery, true public-link copy | Pending |
| Account | /account | /account | Profile/password cards, read-only email, confirmed milestone retained | Pending |
| Login | /login | /login | Editorial story + actual form/recovery | Pending |
| Register | /register | /register | Editorial story + actual email/password | Pending |
| Verify email | /verify-email | /verify-email | Story + proof hygiene/resend/confirmation | Pending |
| Forgot password | /forgot-password | /forgot-password | Story + generic actual feedback | Pending |
| Reset password | /reset-password | /reset-password | Story + fragment proof/password/recovery | Pending |
| Social onboarding | /social-onboarding | /social-onboarding | Story + actual server intent | Pending |
| OAuth result | /oauth-result | /oauth-result | Story + actual confirmed/recoverable outcome | Pending |
| Customer editor | /editor/:id | /invitations/:id/edit | Accordion720, tabs390, image drawer, timezone-correct date, success dialog | Pending |
| Media library | drawer | actual asset library | Scoped search/filter/upload/select/delete and retained field context | Pending |
| RSVP management | /rsvps/:id | /invitations/:id/rsvps | Heading/controlcard/table→cards, real control version | Pending |
| Public/unavailable | /i/:id | /i/:slug | Authored renderer/public RSVP; isolated friendly unavailable | Pending review |
| Admin customers/detail | /admin/customers | /admin/customers + /:id | Table/filter/detail controls and prototype hierarchy | Pending |
| Admin templates | /admin/templates | /admin/templates | Header/filtercards/duplicate/empty/recovery | Pending |
| Admin create | /admin/templates/new | /admin/templates/new | Guided metadata/version selection, clear validation/create/cancel | Pending |
| Legacy authoring | /admin/editor/:id | /admin/templates/:id/edit | Complete toolbar/components/layers/canvas/contextualproperties | Pending |
| Responsive authoring | /admin/editor/:id | /admin/templates/:id/edit | Sections/design controls, desktop/mobile panel navigation | Pending |

Intentional contract differences: no prototype review strip/mock messages; real identity/data/status/error messages; manual save instead of mock autosave; no Customer design controls; summary lacks couple names/covers/global totals, so truthful fallback or bounded owner-scoped detail only; no invented taxonomy endpoint; authored invitation renderer output stays actual template rather than prototype mock designs. Public/renderer CSS is isolated. Existing IAM/security/version/publication/recovery tests remain mandatory.

Iteration ledger and screenshots will be appended after implementation. No screen is accepted solely because functional tests pass.
