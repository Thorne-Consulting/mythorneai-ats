# In-house ATS feature blueprint

Status: product discovery

Research reviewed: September 15, 2026

Audience: product, recruiting, HR, legal, security, and engineering

## 1. Product boundary

Build one private recruiting system for our company. It is not a multi-tenant
SaaS product and does not need subscriptions, tenant provisioning, customer
billing, a marketing or landing page, public APIs for customers, or per-customer
branding.

The project is source-available under the PolyForm Internal Use License 1.0.0.
The code may be inspected and modified for permitted internal business use, but
it may not be sold, sublicensed, transferred, or redistributed. This is not an
OSI-approved open-source license because open-source licenses allow commercial
use and redistribution.

The ATS should be the system of record from approved headcount through accepted
offer and handoff. Payroll, benefits, employee performance, and the rest of the
employee lifecycle belong in an HRIS. Candidates and approved outside agencies
may use limited external portals; that does not make the product SaaS.

The product should support many hiring processes through configuration rather
than separate code paths. A job template selects the stages, approvals,
scorecards, required documents, checks, communications, and retention policy.

### Product principles

1. A person is not an application. One person can be considered for many jobs.
2. A job is not an opening. One job may have one, many, or evergreen openings.
3. Every hiring decision must have a human owner and an auditable reason.
4. Interviewers evaluate predefined, job-related criteria before seeing other
   interviewers' feedback.
5. Collect the least sensitive data needed and limit it by role and purpose.
6. Make the candidate experience accessible, mobile-friendly, transparent, and
   fast.
7. Prefer integrations over rebuilding background checks, e-signature, video,
   calendars, identity verification, or government forms.

## 2. Hiring models the system must cover

| Hiring model | Distinct needs |
| --- | --- |
| Professional and salaried | Multi-round interviews, skills scorecards, compensation approvals, sourcing |
| Hourly and high-volume | Short application, knockout questions, bulk actions, interview events, SMS, multiple openings |
| Seasonal and evergreen | Reusable requisitions, recurring campaigns, availability, location pools, expiry rules |
| Campus and early-career | Events, schools, cohorts, graduation dates, internships, batch interviews |
| Executive and confidential | Hidden jobs, restricted candidate visibility, delegated scheduling, stronger access audit |
| Internal mobility and promotion | Internal job board, employee profile link, manager-release rules, confidential interest |
| Referral hiring | Employee submission, relationship disclosure, status visibility, reward handoff |
| Agency-supplied hiring | Approved agency portal, candidate ownership, duplicate detection, terms and fee metadata |
| Contract and contingent labor | Worker type, supplier, contract dates/rates, conversion tracking, separate compliance flow |
| Regulated or licensed roles | Credentials, expiry dates, job-specific checks, attestations, jurisdiction rules |
| Union, apprenticeship, and rules-based selection | Eligibility lists, seniority or preference rules, exams, panel rules, and exception audit |
| Remote, multi-location, and global | Time zones, work authorization, languages, location-specific forms and privacy rules |
| Rehire and returnship | Prior-employment flag, eligibility review, preserved history with restricted access |

## 3. Capability map

Priorities mean:

- **P0:** needed for a safe, useful first release.
- **P1:** needed for broad hiring coverage.
- **P2:** optimization after the workflow and data are trustworthy.

### 3.1 Organization, users, and access

- **P0:** SSO, MFA enforcement, user lifecycle, and session controls.
- **P0:** roles for ATS admin, recruiter, coordinator, hiring manager,
  interviewer, approver, HR, finance, executive viewer, and auditor.
- **P0:** scope access by department, location, job, hiring team, and candidate.
- **P0:** field-level protection for compensation, demographic data,
  accommodations, background checks, medical information, and confidential jobs.
- **P0:** impersonation-free delegation for absences, with start/end dates and
  an audit trail.
- **P1:** limited employee-referral and outside-agency accounts.

### 3.2 Workforce plan, headcount, and requisitions

- **P0:** create a requisition from an approved headcount or exception request.
- **P0:** distinguish requisition, job, and opening; support multiple openings
  and replacement versus net-new headcount.
- **P0:** job owner, recruiter, coordinator, department, location, worker type,
  employment type, target start date, compensation band, budget code, and reason.
- **P0:** configurable, ordered approvals for headcount, job, and later offer;
  record approve/reject reason, actor, timestamp, and version.
- **P0:** draft, pending approval, approved, open, on hold, filled, cancelled,
  and closed states with valid transitions.
- **P1:** hiring plan, forecast, budget variance, and planned-versus-filled views.

### 3.3 Job design and publishing

- **P0:** reusable job templates with description, competencies, application
  form, workflow, interview plan, scorecard, and approval defaults.
- **P0:** internal and external postings with separate visibility dates and text.
- **P0:** locations, remote/hybrid/on-site, pay range, employment type,
  accessibility/accommodation contact, and required legal notices.
- **P0:** hosted, responsive career site and application confirmation.
- **P0:** posting version history and approval when controlled fields change.
- **P1:** job-board distribution, source links, campaign tracking, and schema.org
  `JobPosting` data.
- **P1:** localized postings and application forms.
- **P1:** jurisdiction packs controlling pay-transparency text, allowed questions,
  required notices, privacy wording, language, and posting duration.

### 3.4 Sourcing and talent CRM

- **P0:** manual prospect creation, resume upload, source, owner, tags, notes,
  tasks, and consent/legal-basis record where required.
- **P0:** talent pools and saved searches; convert a prospect to an application
  without duplicating the person.
- **P0:** employee referral intake and referral attribution.
- **P1:** email sequences with pause, reply detection, unsubscribe, and limits.
- **P1:** agency submissions, duplicate/ownership rules, and fee metadata.
- **P1:** event, campus, and campaign capture.
- **P2:** browser sourcing helpers and enrichment, subject to privacy review.

### 3.5 Candidate and application record

- **P0:** canonical person profile plus one application per job consideration.
- **P0:** contact details, location, work authorization questions, resume/CV,
  cover letter, links, answers, source, referral, and consent evidence.
- **P0:** resume text extraction with the original file preserved; parsing must
  never silently overwrite candidate-provided data.
- **P0:** duplicate suggestions and a reversible, permissioned merge that keeps
  provenance and application histories.
- **P0:** complete activity timeline: submissions, edits, messages, stage moves,
  notes, interviews, evaluations, decisions, exports, and access to sensitive data.
- **P0:** attachments with file-type/size controls and malware scanning.
- **P0:** candidate withdrawal and do-not-contact controls.
- **P1:** candidate portal for status, tasks, scheduling, data correction, and
  privacy requests.
- **P1:** identity aliases and conflict-safe updates from integrations.

### 3.6 Workflow and pipeline

- **P0:** per-template stages and activities, not one global pipeline.
- **P0:** common activities: application review, recruiter screen, assessment,
  interview, reference check, offer, background check, and hired handoff.
- **P0:** stage entry/exit criteria, required tasks, owners, due dates, service
  targets, and reminders.
- **P0:** move, reject, withdraw, put on hold, transfer, and hire with structured
  disposition reasons and optional private notes.
- **P0:** bulk actions with preview, authorization checks, and undo where safe.
- **P0:** prevent accidental duplicate active applications while allowing an
  intentional transfer or parallel consideration.
- **P1:** conditional branches, parallel activities, auto-created tasks, and
  carefully bounded automations.
- **P1:** evergreen and requisition-level hiring limits.
- **P1:** objective knockout rules only for approved, job-related requirements;
  preview affected candidates, record the rule version, and provide human review.

### 3.7 Review, assessment, and structured interviews

- **P0:** job-related criteria defined before interviewing.
- **P0:** interview plans and kits with assigned competencies, questions,
  instructions, and anchored rating scales.
- **P0:** scorecards with evidence notes, overall recommendation, completion
  deadline, and no editing after decision without an audited reopen.
- **P0:** hide peer feedback until an interviewer submits their own feedback.
- **P0:** debrief view that separates evidence, ratings, and final decision.
- **P0:** accommodation request path kept out of ordinary evaluator views.
- **P1:** work-sample and assessment integrations with accessible alternatives.
- **P1:** interview training acknowledgement and interviewer-quality reporting.
- **P2:** redacted or blind initial review where useful and legally reviewed.

Greenhouse documents scorecards as predetermined job criteria used by
interviewers in a structured process. That supports treating interview plans and
scorecards as core data, not free-form notes.

### 3.8 Scheduling

- **P0:** Google or Microsoft calendar availability, time-zone safe scheduling,
  conferencing links, rooms, interviewer conflicts, and calendar updates.
- **P0:** candidate availability collection and self-scheduling within allowed
  windows.
- **P0:** interview panels, sequential/parallel sessions, breaks, reschedule,
  cancel, reminders, and no-show status.
- **P0:** candidate itinerary and interviewer briefing with least-privilege data.
- **P1:** reusable scheduling templates, interviewer pools, load balancing, and
  high-volume interview events.

### 3.9 Candidate communication

- **P0:** send and receive email on the candidate record; log delivery, reply,
  bounce, and sender.
- **P0:** approved templates with variables, localization, preview, and test send.
- **P0:** acknowledgements, scheduling messages, reminders, delay updates,
  rejection, offer, and withdrawal confirmations.
- **P0:** delayed send, cancellation window, quiet hours, and safeguards against
  bulk messages to the wrong group.
- **P0:** keep sensitive internal notes separate from candidate-visible content.
- **P1:** SMS with explicit consent, opt-out enforcement, and jurisdiction review.
- **P1:** service-level dashboards for candidates waiting too long.

### 3.10 Offer and close

- **P0:** structured offer details: title, level, manager, location, employment
  type, salary/rate, bonus, equity or other components, start date, and conditions.
- **P0:** compensation-band guardrails and configurable approval chains.
- **P0:** versioned offer templates and documents; draft, approve, send, view,
  accept, decline, expire, rescind, and renegotiate states.
- **P0:** e-signature integration, signer identity, timestamp, and immutable
  signed copy.
- **P0:** accepted-offer lock and controlled correction/reapproval.
- **P1:** offer scenarios, localized clauses, and acceptance/decline reason data.
- **P1:** multiple currencies, pay periods, exchange-rate date, and local number,
  date, address, and name formats.

### 3.11 Checks, credentials, and pre-employment work

- **P0:** consent and disclosure tasks before a third-party background check.
- **P0:** track provider order/status without exposing the full report broadly.
- **P0:** pre-adverse and final-adverse action workflow with notices, report copy,
  waiting state, dispute, and evidence of delivery where applicable.
- **P0:** references, right-to-work task status, licenses, certifications, expiry,
  drug/health checks where lawful, and role-specific contingencies.
- **P0:** configurable sequencing because jurisdictions restrict what can be
  asked or checked and when.
- **P1:** screening, reference, credential, and employment-eligibility provider
  integrations.

Do not invent an electronic I-9 flow inside the ATS. Use an approved I-9 or HRIS
integration and track only the task status unless legal and security approve a
larger scope.

### 3.12 Hired handoff

- **P0:** final hire record linked to the accepted offer and opening consumed.
- **P0:** HRIS export with idempotency key, status, errors, retry, and reconciliation.
- **P0:** configurable handoff checklist for payroll/HRIS, IT, facilities,
  manager, immigration, and onboarding owners.
- **P0:** preserve recruiting history under the correct retention and access rules.
- **P1:** rehire, internal transfer, and contingent-worker handoffs.

### 3.13 Search, tasks, and recruiter operations

- **P0:** global search across permitted candidates, applications, jobs, and
  requisitions, including exact filters and saved views.
- **P0:** personal/team task inbox, mentions, due dates, reminders, ownership,
  and completed-task history.
- **P0:** recruiter and hiring-manager home views showing work needing action,
  not vanity metrics.
- **P1:** configurable alerts for stalled candidates, missing feedback, expiring
  offers, unfilled openings, and integration failures.
- **P1:** auditable CSV import/export with permission and formula-injection safety.

### 3.14 Reporting and audit

- **P0:** live pipeline counts and aging, time to review/interview/offer/fill,
  stage conversion, acceptance, source, opening status, and workload.
- **P0:** every report states its population, date basis, filters, and exclusions;
  drill down to authorized source records.
- **P0:** immutable audit log for access, exports, configuration, permissions,
  approvals, decisions, merges, and deletion.
- **P0:** operational data-quality report for missing source, disposition,
  scorecard, owner, or required evidence.
- **P1:** candidate-experience, interviewer, hiring-plan, source quality/cost,
  funnel cohort, and forecast dashboards.
- **P1:** restricted EEO/demographic reporting and selection-rate/adverse-impact
  analysis by job and selection step; small-group suppression is required.
- **P1:** scheduled, access-checked report delivery.

### 3.15 Administration and integration

- **P0:** manage departments, locations, legal entities, job families, levels,
  reasons, custom fields, templates, permissions, retention, and workflows.
- **P0:** sandbox/test mode for workflow and template changes.
- **P0:** import validation, dry run, error file, reconciliation, and rollback plan.
- **P0:** integration health, last successful sync, failures, retries, owner, and
  secret rotation.
- **P1:** stable internal API and signed webhooks for approved company systems.
- **P1:** configuration versioning, staged publishing, and rollback.

## 4. AI and automation policy

AI can assist with clerical work, but the first release should not automatically
rank, advance, reject, or hire people.

Allowed after review:

- extract resume fields while preserving source text and confidence;
- draft job descriptions and messages from approved templates;
- summarize candidate history with links back to evidence;
- suggest possible duplicates, skills, interview questions, or search terms;
- summarize operational reports without changing records.

Each AI action needs a visible AI label, human confirmation before writes,
model/prompt/version provenance, input/output audit, confidence or uncertainty,
and a non-AI path. Never infer protected traits, emotion, personality, health,
disability, or trustworthiness from names, photos, voices, video, or writing.

Before any AI materially influences a selection decision, require legal review,
a documented purpose and job-related validity, impact testing, candidate notice
and consent/alternative where required, monitoring, an appeal/human-review path,
and a kill switch. NIST frames AI risk work as continuous **govern, map, measure,
and manage** activities; this should be the operating model.

## 5. Data, privacy, compliance, and security baseline

This is product guidance, not legal advice. Counsel must turn the jurisdictions
where the company hires into versioned policy rules.

### Records and privacy

- Store the source, purpose/legal basis, notice version, consent where needed,
  and retention class for candidate data.
- Keep applications, resumes, interview notes, evaluations, decisions, search
  results where required, and communications in readable exportable form.
- Apply retention by record type and jurisdiction, with notice, review queue,
  defensible deletion, and legal holds. Never use one hard-coded duration.
- Support verified access, correction, restriction, portability, objection, and
  deletion requests; log deadlines, decisions, exemptions, exports, and deletion
  across integrations and backups.
- Separate voluntary demographic data from selection views. Report only to
  authorized users with aggregation and small-number suppression.
- Record structured disposition reasons at the time of a decision and preserve
  the criteria/version used.

The EEOC says covered employers generally retain personnel or employment records
for one year, while other rules can require different periods. OFCCP guidance
also requires covered federal contractors to retain applicant materials and
electronic search results in a readable, usable form. The correct system feature
is therefore a policy engine plus legal hold, not a universal delete timer.

### Fair selection and background checks

- Apply the same job-related criteria to people in the same process and record
  exceptions with approval.
- Preserve the applicant population and each selection step so impact can be
  analyzed. The federal Uniform Guidelines use selection rates and the four-fifths
  rule as a rule of thumb, not a final legal conclusion.
- For consumer reports, keep disclosure and authorization separate from the job
  application and support the required pre-adverse and adverse action steps.
- Provide a private accommodation route and accessible alternative for tests or
  interview formats.

### AI-specific controls

- NYC requires certain automated employment decision tools to have a recent bias
  audit, public audit information, and candidate/employee notices before use.
- Illinois requires notice, an explanation, and consent before AI analysis of an
  applicant video interview for an Illinois-based position.
- GDPR-style privacy rules create rights concerning automated decisions and
  profiling, access, correction, erasure, restriction, portability, and objection.
- Maintain a jurisdiction-controlled feature flag, decision-impact inventory,
  notices, consent, alternatives, audit evidence, and model disable switch.

### Security and reliability

- Encrypt data in transit and at rest; manage keys and secrets outside source code.
- Enforce least privilege, SSO/MFA, automatic deprovisioning, access reviews, and
  field-level rules. Log sensitive views, downloads, exports, and admin actions.
- Redact secrets and highly sensitive fields from logs, analytics, support tools,
  and AI inputs.
- Scan uploads, isolate file processing, rate-limit public forms, prevent spam,
  and protect against account takeover and bulk data extraction.
- Use tested backups, point-in-time recovery, restore drills, monitoring,
  incident response, and defined recovery objectives.
- Make candidate and internal critical flows conform to WCAG 2.2 AA, including
  keyboard use, focus, labels, errors, status messages, contrast, target sizes,
  accessible authentication, and no forced repeated entry.

## 6. Core data model and invariants

Minimum first-class records:

`Person`, `ContactPoint`, `Prospect`, `Application`, `Requisition`, `Job`,
`Opening`, `Posting`, `HiringTeam`, `WorkflowTemplate`, `Stage`, `Activity`,
`StageTransition`, `InterviewPlan`, `Interview`, `Scorecard`, `Assessment`,
`Decision`, `Disposition`, `Offer`, `Approval`, `Communication`, `Task`,
`Attachment`, `Source`, `Referral`, `AgencySubmission`, `Consent`, `Notice`,
`PrivacyRequest`, `RetentionPolicy`, `LegalHold`, `IntegrationRun`, and
`AuditEvent`.

Non-negotiable invariants:

1. Historical applications never collapse into the person record.
2. Stage history is append-only; corrections create new events.
3. A hire consumes a specific opening unless the job is explicitly evergreen.
4. A decision identifies the accountable human, reason, criteria version, and time.
5. An approved offer is immutable; a material edit creates a new version and can
   trigger reapproval.
6. Candidate-visible and internal-only content are different data classes.
7. Sensitive fields are denied by default, including through search, export,
   reporting, notifications, and integration payloads.
8. Deletion must respect legal holds and leave a non-identifying compliance receipt.
9. Integration delivery is idempotent and reconcilable.

## 7. Recommended delivery slices

### Slice 0: policy and foundation

- Confirm hiring countries/states, federal-contractor status, company identity
  provider, email/calendar system, HRIS, e-signature and screening providers.
- Approve the role/permission matrix, data classification, retention schedule,
  disposition list, AI policy, and incident owner.
- Define the canonical data model, audit event format, and workflow state machine.

### Slice 1: usable core ATS

- SSO/RBAC, requisitions and approvals, jobs/openings, job templates and postings.
- Career site/application, person/application records, duplicates, attachments.
- Configurable pipeline, tasks, structured disposition, activity timeline.
- Interview plans, scorecards, basic scheduling and email.
- Offers/approval/e-signature handoff, HRIS export, core reports, audit, retention.

This slice should support professional, referral, internal, and moderate-volume
hiring without spreadsheets becoming a second system of record.

### Slice 2: broad hiring coverage

- SMS, self-scheduling, high-volume events, evergreen/multi-opening workflows.
- Talent CRM, campaigns, agencies, campus, confidential search, contingent workers.
- Screening and credential integrations, localized workflows, candidate portal.
- Advanced privacy operations, adverse-impact reporting, integration monitoring.

### Slice 3: optimization

- Workforce forecasts, interviewer/load optimization, deeper analytics, approved
  AI assistance, and additional sourcing or job-board integrations.

Do not begin Slice 3 until decision data, disposition data, and audit coverage are
reliable. Automation built on incomplete data hides problems rather than solving them.

## 8. First-release acceptance bar

The first release is ready only when:

- a requisition can be approved, posted, filled, and reconciled to one opening;
- a candidate can apply by keyboard and mobile, request accommodation, withdraw,
  and receive timely status messages;
- recruiters can find, deduplicate, move, communicate with, reject, offer, and
  hire candidates without a shadow spreadsheet;
- interviewers can see only needed information and submit independent scorecards;
- an accepted offer hands off exactly once and failures are visible and retryable;
- every material access, change, decision, approval, export, and deletion is audited;
- privacy retention/deletion and legal-hold tests pass for at least two different
  policies;
- permissions, public forms, uploads, exports, backups, accessibility, and the
  main workflow have automated tests plus human verification;
- dashboards reconcile to source records for a seeded end-to-end hiring cohort.

## 9. Decisions needed before architecture work

1. Which countries and US states will the company hire in during the next 24 months?
2. Is the company a US federal contractor or subcontractor?
3. Which identity provider, HRIS/payroll, email/calendar, e-signature, background
   check, job boards, and messaging provider already exist?
4. What peak open-job count, annual applications, recruiting-team size, and
   employee count should the system support?
5. Will candidates have accounts, magic-link access, or account-free applications?
6. Which hiring types are needed on day one?
7. Is any AI-assisted selection in scope, or only clerical AI?
8. Who owns retention policy, privacy requests, accommodations, and security incidents?

## 10. Research sources

Product patterns:

- [Greenhouse scorecard overview](https://support.greenhouse.io/hc/en-us/articles/4414777492891-Scorecard-overview)
- [Greenhouse recruiting setup overview](https://learn.greenhouse.io/start-hiring-with-greenhouse)
- [Ashby enterprise recruiting capabilities](https://www.ashbyhq.com/enterprise)
- [Ashby approvals](https://docs.ashbyhq.com/approvals)
- [Lever ATS and CRM](https://www.lever.co/lever-trm)
- [Workday talent acquisition capabilities](https://doc.workday.com/admin-guide/en-us/workday-feature-descriptions/workday-talent-management/future--talent-acquisition.html)

Rules and standards:

- [EEOC recordkeeping requirements](https://www.eeoc.gov/employers/recordkeeping-requirements)
- [EEOC recruiting and hiring guidance](https://www.eeoc.gov/employers/small-business/3-im-recruiting-hiring-or-promoting-employees)
- [OFCCP applicant recordkeeping Q&A](https://www.dol.gov/sites/dolgov/files/ofccp/CAGuides/files/Applicant-Recordkeeping-FAQ-WEB_080119_CONTR508c.pdf)
- [EEOC Uniform Guidelines Q&A](https://www.eeoc.gov/laws/guidance/questions-and-answers-clarify-and-provide-common-interpretation-uniform-guidelines)
- [FTC background-check guidance for employers](https://www.ftc.gov/business-guidance/resources/background-checks-what-employers-need-know)
- [USCIS Form I-9 instructions](https://www.uscis.gov/sites/default/files/document/forms/i-9instr.pdf)
- [NYC automated employment decision tools](https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page)
- [Illinois AI Video Interview Act](https://www.ilga.gov/Legislation/ILCS/Articles?ActID=4015&ChapterID=68&Print=True)
- [European Commission: individual GDPR rights](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en)
- [ICO recruitment and selection privacy guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/recruitment-and-selection/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [W3C Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
