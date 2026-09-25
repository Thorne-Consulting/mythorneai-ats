# ATS product flow

This document records the agreed product direction. It is a living scope
document; implementation details may change as the product is built.

## Decisions

- WorkOS AuthKit is the default authentication system for internal employees.
- Google and Microsoft social login are enabled by organization policy.
- The first successful employee login creates the organization and owner.
- The owner configures company name, allowed email domains, and login policy.
- Enterprise SSO connections are deferred until they are needed.
- Candidates live in the ATS database, not WorkOS.
- One candidate can have multiple applications.
- Candidate access is passwordless, using one-time email codes and database-backed sessions.
- Each interviewer connects their own Google or Microsoft calendar.
- Google Calendar and Microsoft Graph are integrated behind one application-owned interface.
- Resend sends transactional email.
- OpenAI is the initial model provider behind the AI SDK.
- Turnstile and Nylas are not required initially.
- A public API-key management portal is deferred.

## Employee authentication and organization setup

1. The first employee signs in with an allowed Google or Microsoft account.
2. The application creates the organization, owner membership, and local ATS user.
3. The owner configures company name, allowed domains, enabled providers,
   timezone, reminder defaults, and interview defaults.
4. Admins invite later employees and assign ATS roles.
5. WorkOS verifies identity; the ATS database remains the source of truth for
   ATS roles, permissions, and organization data.

Initial roles are owner/admin, recruiter, hiring manager, and interviewer.

## Jobs and public applications

Recruiters create detailed jobs with a rich description, requirements,
application questions, hiring team, interview rounds, and message templates.
Jobs have public listing and detail pages plus public JSON/OpenAPI endpoints.

Candidates complete the application form, upload a resume, and submit. The
application remains `PendingVerification` until the candidate confirms a
one-time email code. Only then does it become an active application and appear
in the recruiting workflow.

Candidates do not need a WorkOS account, password, or Google/Microsoft login.

## Candidate portal

The candidate portal uses a short-lived email code to create a secure,
database-backed session cookie. It shows the candidate's applications, status,
interview rounds, booking links, scheduled interviews, and candidate-visible
messages.

Candidate profiles and applications are stored locally so one verified email
can access multiple applications.

## Candidate processing and recruiter tools

- PDF resume upload, extraction, OCR fallback, retries, and review.
- Duplicate candidate detection.
- Full-text search and recruiter filters.
- Tags, internal notes, application timeline, and communication history.
- Natural-language candidate search and ranking with explanations.
- Bulk selection, assignment, status changes, rejection, and batch actions.

AI converts recruiter requests into validated structured filters. Database
search remains the source of truth; AI does not directly change hiring data.

## Interview workflow

Jobs define ordered interview rounds. Each round can specify its type,
duration, interviewers, panel requirements, booking window, candidate
instructions, email templates, and reminder timing.

1. A recruiter advances a candidate and assigns the next round's interviewer(s).
2. The system checks that each interviewer has a connected calendar.
3. Interviewers receive assignment emails and portal links.
4. The candidate receives a round-specific booking email.
5. The system computes available slots from all required interviewers,
   working hours, timezone, duration, holds, and existing events.
6. The candidate selects a slot.
7. The system rechecks availability, creates the calendar event, and creates a
   Google Meet or Microsoft Teams link when supported.
8. Candidate, interviewer, and recruiter receive confirmations.
9. Completion and scorecards advance the candidate to the next round.

The flow supports panels, skipped rounds, rescheduling, cancellation, and
rejection after any round.

## Calendar integration

The application owns a provider-neutral calendar interface with Google and
Microsoft implementations. It covers connection, token refresh, calendar
listing, free/busy lookup, availability, event creation, updates,
cancellation, and change notifications.

Provider webhooks reconcile externally changed events. Background jobs renew
Google and Microsoft subscriptions, process webhook events idempotently, and
notify the affected people when a scheduled interview changes.

## Email and reminders

Resend's official .NET SDK is used behind one application email service.
Templates support variables, round-specific wording, recruiter notes, and
candidate instructions.

Messages include verification, application receipt, status updates, interviewer
assignment, calendar connection, booking, confirmations, reminders,
rescheduling, cancellation, scorecard reminders, next-round invitations,
rejection, and offer messages.

An application timeline records sent messages and important state changes.
Reminder jobs handle stale verification, unbooked interviews, incomplete
scorecards, and other configurable delays.

## Abuse controls

Turnstile is intentionally deferred. Initial protection is email verification,
rate limits, verification cooldowns, duplicate detection, IP/email/job velocity
checks, upload validation, file limits, optional honeypot fields, and
quarantine/review for suspicious submissions.

## AI

The AI SDK provides a provider-neutral interface with OpenAI as the initial
provider. Initial uses are resume extraction, job/resume matching,
natural-language recruiter search, candidate ranking, message drafting, and
interview-note summaries.

## Delivery order

1. Finish organization setup, WorkOS authentication, invitations, and roles.
2. Finish job authoring, publishing, public APIs, applications, verification,
   and the candidate portal.
3. Finish resume processing, recruiter search, notes, timeline, and AI search.
4. Add configurable interview rounds, assignment, scorecards, and templates.
5. Complete Google and Microsoft calendar adapters, availability, events, and
   webhooks.
6. Add candidate booking, reminders, rescheduling, cancellation, and full
   communication automation.
7. Run end-to-end tests for authentication, applications, calendar changes,
   email delivery, reminders, and webhook idempotency.

## Deferred items

- WorkOS enterprise SSO connections such as Okta or customer-specific Entra SSO.
- Nylas calendar aggregation.
- Turnstile.
- Candidate identities in WorkOS.
- Customer-facing API-key management.
- Dedicated search/vector infrastructure before measured need.
