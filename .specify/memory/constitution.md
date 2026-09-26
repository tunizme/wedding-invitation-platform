<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0
- Modified principles:
  - V. Verifiable Quality and Secure Configuration: merge-blocking automation is optional during
    rapid development while CI evidence remains mandatory
- Modified sections:
  - Delivery Workflow and Quality Gates: removed the unconditional merge-protection requirement
    and deferred an explicit protection decision to a release-ready or production-delivery feature
- Added sections: none
- Removed sections: none
- Follow-up TODOs: none
- Completed alignment:
  - Feature 002 aligned the Project Foundation spec, plan, tasks, quickstart, checklist, README and
    CI documentation with the optional rapid-development ruleset policy
-->

# Wedding Invitation Platform Constitution

## Core Principles

### I. Scope Discipline

Every feature MUST define explicit in-scope and out-of-scope behavior before planning. Tasks and
implementation MUST trace to an approved requirement or acceptance criterion. A future product
decision, integration provider, or anticipated module MUST NOT create placeholder code,
configuration, schema, dependencies, or external calls before a feature explicitly brings it into
scope. Scope expansion requires an updated specification and review before implementation.

Rationale: strict scope boundaries keep the MVP reviewable and prevent premature architecture,
security surfaces, and operational burden.

### II. Independent Application Boundaries

Frontend and backend MUST remain independently installable, configurable, runnable, testable,
buildable, packageable, and deployable. Shared root tooling MAY coordinate workflows but MUST NOT
own business logic or require rebuilding an unchanged application. Backend capabilities MUST begin
inside one modular monolith with explicit module boundaries. Microservices, brokers, distributed
transactions, or service discovery require a separate approved architectural change justified by
measured operational or domain needs.

Rationale: independent application lifecycles enable parallel delivery while a modular monolith
avoids distributed-system complexity during the MVP.

### III. Reproducible Developer Experience

A developer with documented prerequisites MUST be able to move from fresh clone to a healthy local
stack using version-pinned tooling, committed lockfiles, safe example configuration, documented
commands, and project-managed local infrastructure. Full-stack and application-specific workflows
MUST be repeatable and bounded. Failures MUST identify the affected component and provide an
actionable remedy. Destructive commands MUST be explicitly named and documented with their data-loss
impact.

Rationale: onboarding and local reproducibility are product capabilities for the engineering team,
not optional documentation work.

### IV. Explicit Database Evolution

Every database schema change MUST be represented by a committed, reviewable migration. Runtime
schema synchronization MUST remain disabled. Migrations MUST be applied as an explicit lifecycle
step after database readiness and before application startup or release. Integration validation
MUST use the selected database engine rather than a substitute dialect. A migration failure MUST
prevent dependent startup and MUST expose a recoverable, documented failure state.

Rationale: explicit migrations make schema state deterministic, auditable, and safe across local,
CI, and future deployment environments.

### V. Verifiable Quality and Secure Configuration

Requirements MUST be objectively testable. Each application MUST own format, lint, typecheck, unit
test, and build commands. Database and HTTP contracts MUST have integration or contract coverage
where applicable. Applicable CI checks MUST run and report failures. Repository rulesets and
automated merge blocking are OPTIONAL during rapid development unless an approved feature
specification explicitly requires them. Environment configuration MUST have documented ownership
and fail-fast validation; real secrets MUST NOT be committed, bundled into browser code, logged, or
returned by health and error responses. Health signals MUST separate process liveness from
dependency readiness and use bounded timeouts.

Rationale: observable quality evidence reduces regressions without forcing repository controls that
may slow early iteration or require an unavailable hosting plan. Explicit configuration boundaries
limit accidental secret exposure.

## Architecture and Scope Constraints

- The repository MUST use a monorepo with independently owned frontend and backend applications.
- The frontend MUST use the project-approved Next.js and TypeScript stack.
- The backend MUST use the project-approved NestJS and TypeScript stack and expose versioned REST
  contracts.
- PostgreSQL MUST be the relational database; Docker Compose MUST manage local infrastructure.
- The backend MUST remain a modular monolith until a separately approved architectural decision
  establishes a concrete need for microservices.
- Public contracts, developer commands, environment ownership, and destructive operations MUST be
  documented alongside the feature that introduces them.
- Authentication, invitation editing, payment execution, automated deployment, or any external
  provider integration MUST NOT be inferred into a foundation feature unless explicitly specified.

## Delivery Workflow and Quality Gates

1. Feature work MUST proceed through specification, clarification when needed, planning, task
   generation, cross-artifact analysis, and implementation.
2. A requirements-quality checklist MUST be reviewed before implementation. Unchecked mandatory
   items or unresolved `CRITICAL`/`HIGH` analysis findings MUST block implementation.
3. Tests and verification commands MUST be placed after their required tooling and dependencies in
   the task graph. Every phase MUST define a bounded verification command with cleanup behavior.
4. Pull requests MUST report independent frontend checks, backend checks, PostgreSQL-backed
   integration checks, and full-stack health checks when those surfaces are affected.
5. Repository rulesets and merge protection MAY be omitted during rapid development. A feature that
   introduces production delivery or declares the repository release-ready MUST explicitly decide,
   document, and validate the required merge-protection policy. CI MUST NOT deploy or publish unless
   an approved deployment feature explicitly authorizes it.
6. Reviewers MUST verify scope boundaries, migration safety, configuration secrecy, application
   independence, and documentation changes before approval.

## Governance

This constitution is the highest-authority project governance document. Specifications, plans,
tasks, code, and review practices MUST comply with it. When artifacts conflict, the constitution
prevails and the lower-level artifact MUST be corrected.

Amendments require an explicit constitution update that documents the change, rationale, migration
impact, and semantic version bump. MAJOR versions remove or redefine existing principles in a
backward-incompatible way; MINOR versions add principles or materially expand governance; PATCH
versions clarify wording without changing obligations.

Every feature analysis and pull-request review MUST check constitution compliance. Exceptions are
not implicit: any temporary exception MUST be written, narrowly scoped, time-bounded, approved, and
include a remediation plan. Complexity that exceeds these principles MUST be justified in the
implementation plan before work begins.

**Version**: 2.0.0 | **Ratified**: 2026-09-23 | **Last Amended**: 2026-09-26
