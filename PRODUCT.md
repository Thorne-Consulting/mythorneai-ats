# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the interviewer.** An employee who is pulled into hiring occasionally, not
professionally. They arrive for one scheduled interview, need to prepare quickly, run it, and
leave structured feedback — then they are gone until the next one. When the interviewer's needs
conflict with a full-time recruiter's, the interviewer wins: focused single-task screens over
dense overviews.

Also served, as implemented roles:

- **Recruiter** — creates jobs, screens applications, moves people through the pipeline,
  schedules interviews, chases feedback. The heaviest user by volume, but not the role the
  product is designed around.
- **Hiring manager** — owns a job, reviews its pipeline, makes the call. Scoped to jobs they own.
- **Administrator** — manages who may sign in and reviews the audit log.

Access is scoped by role in the API, not just the UI: an interviewer sees only candidates they
are scheduled to interview, and candidate contact details come back as `Restricted`.

## Product Purpose

Self-hosted applicant tracking for a single company: resume review, applicant decisions,
interview scheduling, structured evaluation, and feedback. Success is a hiring team running a
job end to end inside the tool — no spreadsheet alongside it, no third-party ATS.

## Positioning

**Confirmed:** no per-seat cost. Everyone who touches hiring can have an account without budget
pressure. This is the stated reason the company runs its own ATS rather than Greenhouse, Ashby,
or Lever.

**Not claimed as positioning.** Self-hosting, structured evaluation, and the audit trail are all
implemented, but the team did not name them as the reason the product exists. Treat them as
capabilities to preserve, not as the pitch, until someone says otherwise.

Explicitly not a SaaS product. There is no marketing or landing surface and none should be
built; the only unauthenticated screen is sign-in.

## Operating Context

- Deployed by one company for its own hiring. Docker Compose, PostgreSQL, a .NET API and a
  Next.js web client behind it.
- Authentication is company SSO (OIDC) in every real environment. A development-only login
  exists for local work and must never be the production mode.
- Calendar delivery to Microsoft 365 or Google Workspace is optional. With no provider
  configured the product runs in internal-only mode and interviews live solely in the ATS.
- Interview invitations carry an online meeting link when a provider is configured.
- Interview recordings are captured from the browser and stored by the application itself.
  Recording is gated behind an explicit confirmation that every participant agreed.

## Capabilities and Constraints

Confirmed and implemented:

- Jobs (requisitions) with an ordered pipeline of stages, per-job interview kits, and status
  through draft, open, on hold, filled, closed, cancelled.
- Applications across jobs with filtering, bulk stage moves, and bulk rejection.
- Candidate records that persist across multiple applications, with resume and document
  attachments.
- Interviews with structured scorecards: criteria carry weights, a submitted scorecard is locked,
  and other interviewers' feedback stays hidden until you submit your own.
- Meeting notes on an interview, pasted or imported from a meeting assistant.
- Rejections require a job-related disposition reason chosen from a fixed list.
- An append-only audit log of hiring and access events.

Constraints:

- Licensed under PolyForm Internal Use 1.0.0: permitted internal business use only, and it may
  not be sold, sublicensed, transferred, or redistributed.
- Company-agnostic. The product must not hardcode any one company's identity, branding, or
  hiring policy.
- Terminology in the interface: **Jobs**, **Applications**, **Candidates**. Internally the API
  and database still call a job a `requisition`; the UI does not use that word.

## Brand Commitments

- The product calls itself **Internal ATS** in the interface.
- "Internal use only" is stated in the application chrome and is a real constraint, not decoration.
- No public marketing surface, no landing page, no external-facing content of any kind.

## Evidence on Hand

- Development seed data is fictional throughout (`example.test`, `example.com` addresses and
  invented candidates). It is demo material and must never be presented as real usage.
- There are no customers, testimonials, benchmarks, case studies, logos, pricing, or adoption
  numbers. Future work must not invent any.
- Real assets that do exist: 21 backend integration tests, a package selection catalog at
  `docs/package-catalog.md`, and the license.

## Product Principles

1. **Design for the person who is here once a month.** The interviewer should be able to prepare
   and submit feedback without being taught the system.
2. **A seat costs nothing, so never ration access.** Anyone involved in a hire can have an
   account; the design should not treat extra participants as an edge case.
3. **One company, no outside audience.** Every screen is behind sign-in and speaks to colleagues,
   not prospects.
4. **Comparable beats convenient.** Structured kits, locked scorecards, and job-related
   disposition reasons exist so candidates can be compared fairly; do not add shortcuts that
   route around them.
5. **Stay company-agnostic.** No customer's name, policy, or hiring philosophy gets baked in.

## Accessibility & Inclusion

Accessibility is a stated product commitment: the interface must stay fully usable, and
minimalism is never allowed to pay for itself by removing an affordance. **No specific standard
has been named yet** as of 2026-09-18 — the commitment is real, the conformance target is
undecided. Do not claim WCAG conformance anywhere in the product or its docs until a target is
set, and do not treat the missing target as permission to skip access work.

Work already done that a future standard would build on: keyboard-operable table rows with
visible focus, labelled controls, and scheme-aware color tokens. This is groundwork, not
conformance.
