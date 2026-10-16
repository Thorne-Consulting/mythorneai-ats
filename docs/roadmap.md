# Roadmap: from core ATS to a usable internal AI ATS

Written 2026-10-15 from a read of the code at `52443e5`. This is a proof of concept that has to be a real, usable product. There are no phases and no timelines: it's one build list, then a hands-on polish pass at the end.

## Status (2026-10-16)

Sections A to E and G are built, checked locally and covered by the backend suite (41 tests). F (production readiness) and the final walk-through are not done as planned: the first walk-through is written up in [ux-walkthrough-notes.md](ux-walkthrough-notes.md), and its open items are the next work. Notes on where the build differs from the plan:

- C5: Slack and Teams notifications go to one organization-wide webhook, not per person (those webhooks are channel-level).
- B4: embeddings are stored as plain `real[]` and compared in memory instead of using pgvector, which keeps the standard Postgres image. Fine to a few thousand candidates.
- E4: configurable roles are three extra permissions (reports, import, templates) per role, plus per-job confidentiality.
- G3: outside calendar edits were already detected for personal calendars; an external cancellation now also cancels the interview in the ATS.

## Where we were


Built: auth and roles, org setup, posting templates, jobs with stages and interview kits, public apply and candidate portal, interview booking with Google/Microsoft calendars, scorecards, recordings, resume parsing and search, audit log, email and integration outboxes, three draft-only AI endpoints.

Gaps: no acceptance step after "Decision", keyword-count "ranking" instead of real matching, plain-text email only, no reporting, thin ops. And nobody has walked the whole product as each role and judged how it feels. That's the last section.

## Decisions made

- **Approvals:** yes, we build them.
- **AI:** OpenAI models. Sending resumes to OpenAI is acceptable.
- **Career page:** no. External sites use the public API.
- **Accessibility:** a fair, practical standard (keyboard, labels, contrast, focus), not formal WCAG conformance. Internal tool.

## Out of scope

Handled separately, outside this product:

- Offer signing, contracts, offer letters, anything legally binding. Official documents are produced manually.
- Legal and regulatory compliance (retention policy, candidate data requests, EEO, jurisdiction rules, AI-screening disclosure).

The ATS tracks the internal approval and sends one plain email saying the candidate has been accepted and the team will be in touch. No letters, no attachments, no candidate-side acceptance.

## Build list

### A. Acceptance email and approvals

Today "Offer" is only a stage name. Hired is a status on `Application`.

- **A1. Offer record.** Application, internal note, status (Draft, PendingApproval, Approved, Sent, Withdrawn). No letter, comp terms or contract content. One open offer per application, edits audited.
- **A2. Offer API.** Create, submit for approval, send acceptance email, withdraw. Scoped like requisitions, with role tests in the style of `HiringScopeTests`.
- **A3. Approval chain.** Per-job or org-default approvers, sequential or parallel, comments, audit events. The email can't go out until every approval is in; a rejection sends it back to Draft.
- **A4. Acceptance email.** One editable plain-text template ("you've been accepted, the team will contact you shortly") through the existing email outbox, recorded in the application history. No attachment.
- **A5. Offer UI.** Submit, approve, send, from the application. Status on the application and the dashboard. Approvers get an email or notification and a one-click review.
- **A6. Hired on send.** Sending marks the application Hired, counts toward the job's openings, and closes the job when full. A recruiter can reverse it if the candidate falls through.
- **A7. Requisition approval before opening.** Headcount sign-off, reusing A3. Job can't go Open without it when the org turns it on.

### B. AI matching and explanations

Today `ResumeEndpoints` counts keyword hits against the job description, and `IAiAssistant` is one hardwired chat-completion call.

- **B1. Model layer.** `IAiAssistant` gets model choice, JSON-schema output, and token and cost logging. OpenAI only.
- **B2. AI call log.** Every call writes purpose, model, inputs referenced, output, user, latency, cost. Admin can see what the AI said about whom.
- **B3. Job requirements extraction.** An LLM turns the job description into required vs preferred skills, years, and location rules. The recruiter edits and confirms. Stored on the requisition.
- **B4. Embeddings.** pgvector on the existing Postgres. Embed resume chunks and job requirements when a resume is parsed, plus a backfill.
- **B5. Hybrid search.** Full-text plus vector similarity, keeping the existing filters. Replaces the keyword score.
- **B6. Job-fit scoring.** For each candidate and each requirement: met, partial, missing, or unknown, with the resume quote behind it.
- **B7. Ranking UI.** A shortlist per job with the explanation panel and recruiter override or dismiss with a reason. AI never moves a stage, sends a message, or rejects anyone.
- **B8. LLM resume parsing.** A second pass over the regex parser, with a field-level diff in `ResumeProfileReviewModal`.
- **B9. Eval set.** 30 to 50 seed resumes and jobs with expected rankings, run in CI so prompt or model changes can't silently make ranking worse.
- **B10. Natural-language search.** Extend `/ai/search-filters` to use semantic search.
- **B11. Interview copilot.** Suggested questions from the kit and the resume, and a transcript summary tied to kit criteria. Always a labeled draft with sources.
- **B12. Past-candidate suggestions.** When a job opens, suggest earlier candidates who fit.

### C. Communication

- **C1. Template library.** One template per event (confirmation, status, booking, reminder, rejection, acceptance), org default with per-job and per-round override and merge fields. History shows which template version was sent.
- **C2. HTML email.** Company branding with a plain-text fallback.
- **C3. Delivery tracking.** Resend webhooks for delivered, bounced, opened, shown on the application timeline. A bounce flags the candidate.
- **C4. Reminder rules.** Configurable days per reminder type, quiet hours, max reminders. Replaces the single stale-days setting.
- **C5. Slack and Teams notifications.** Assignment, scorecard due, stale item, approval waiting. Opt-in per user.
- **C6. Candidate messaging.** A thread in the portal and on the application. Candidate-visible and private notes stay separate.
- **C7. Candidate withdraw, reschedule and cancel** from the portal, per job settings.

### D. Reporting

- **D1. Stage-transition history table.** Stage changes live only in audit and activity today. Time-in-stage can't be computed without it.
- **D2. Funnel and conversion** per job, source and recruiter.
- **D3. Time-to-fill and time-to-hire.**
- **D4. Interviewer load and feedback latency.**
- **D5. Source effectiveness, and whether high-ranked candidates actually got hired.** Feeds back into the eval set (B9).
- **D6. Reports UI** with saved views and CSV export.

### E. Admin and configuration

- **E1. Settings UI** for what is env-only today: email, AI, integrations status.
- **E2. Custom pipelines** per job type, plus custom candidate fields and tags.
- **E3. Bulk candidate import** from CSV or another ATS export, with dedupe.
- **E4. Configurable roles** and per-job confidentiality.
- **E5. Guided first-run setup** for the workspace owner.
- **E6. Accessibility pass** against the practical standard above.

### F. Production readiness

- **F1. Postgres backups and a tested restore.**
- **F2. Error monitoring, structured logs, basic metrics.** Alert on worker failures and outbox backlog.
- **F3. S3-compatible file storage** instead of local disk, plus virus scan on uploads. `LocalFileStore` becomes one of two stores.
- **F4. Staging environment and a deploy pipeline** that runs migrations.
- **F5. Frontend and end-to-end tests** for apply, book, scorecard, acceptance email, run in CI.
- **F6. Load test** on the public apply and portal endpoints.
- **F7. Secret rotation** for data-protection keys and OAuth secrets.
- **F8. Worker health view** for the email, integration and resume-parse queues.

### G. External integrations

- **G1. Webhooks out:** application created, stage changed, hired.
- **G2. HRIS hand-off on hire.** Webhook or export first.
- **G3. Calendar change sync back.** External edits reflected in the ATS.

Not doing: career page, job board and LinkedIn posting, e-signature, offer letters.

## Final pass: walk the whole product by hand

This is the part a feature list can't capture, and it only gets done by using the product. It happens after A to G are in, and it's not optional. The goal is that the product feels considered: the small moments, the quality-of-life details, the edges.

**How to do it.** Run the app, sign in as each role, and do the real job end to end. Click through every screen the way a person would, on a laptop and on a phone-width window. Write down everything that makes you hesitate, squint, re-read, or click twice. Fix those, then do it again. Browser-driven checks can catch broken states, but the "does this feel right" judgment is a person's.

**Journeys to walk, one per role:**

1. **Owner, day one.** Sign in, set up the company, invite the team, create a posting template, publish the first job. What does an empty workspace say to you?
2. **Recruiter, a normal morning.** Open the app and know in five seconds what needs attention. Screen new applicants, shortlist with AI, move people, schedule, chase feedback, reject with a kind message, send an acceptance.
3. **Hiring manager.** Open one job, see the pipeline, read feedback, approve an acceptance. How few clicks to a decision?
4. **Interviewer, once a month.** Get an assignment, prepare in two minutes, run the interview, submit the scorecard, and never be asked to learn the tool. This is the primary user in `PRODUCT.md`.
5. **Candidate.** Apply, verify email, check status, book, reschedule, withdraw. Every state tells them what happens next.
6. **Admin.** Add and remove people, read the audit log, check integrations, see why something failed.

**Things to look at on every screen:**

- **Empty states:** a first-time screen with no data should say what it's for and offer the next action.
- **Loading and errors:** skeletons not spinners where it helps, errors that say what to do, and nothing that silently fails.
- **Feedback on action:** every save, send and move gets a visible confirmation, and destructive actions can be undone where practical (undo for stage moves and rejections, not just "are you sure").
- **Keyboard and speed:** shortcuts for screening (next, previous, advance, reject), command palette or the global search reaching everything, focus in the right place after every modal.
- **Defaults and memory:** filters and sort remembered per person, forms prefilled from what we already know, sensible defaults for time zone, duration and interviewers.
- **Context without clicking:** hover or peek for a candidate's summary, the resume beside the scorecard, a candidate's past applications visible while reviewing.
- **Copy:** consistent wording (Jobs, Applications, Candidates), human error messages, no jargon leaking from the API.
- **Dates and time zones:** always clear whose time zone a time is in, relative times where they help ("2 days ago"), and no ambiguity on interview times.
- **Attention to edges:** very long names, no resume, parse failures, duplicate candidates, a candidate with five applications, a job with a hundred, an interviewer with no calendar connected, a booking that fails.
- **Visual rhythm:** spacing, alignment, hierarchy and motion that feel intentional, checked in light and dark. `DESIGN.md` is the reference.
- **Notifications that matter:** nothing that nags, nothing missing. Check that each email and message is worth sending and reads well.
- **Speed:** pages and searches that feel instant. Anything slow gets fixed or gets a good loading state.

**Output of the pass:** a short list of what was found, fixed, and deliberately left, kept in this folder so the next pass starts from it.
