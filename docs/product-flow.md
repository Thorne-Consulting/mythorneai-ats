# Hiring product specification

This document describes the hiring experience we are building. It is written
around user outcomes and product behavior rather than implementation details.

## Product promise

The ATS should make hiring organized, personal, and easy to follow. A recruiter
should always know what needs attention. A candidate should always know what
happens next. An interviewer should receive the right information at the right
time without chasing anyone.

## End-to-end product flow

The product follows one continuous path from workspace setup to a completed
hiring decision:

1. The first employee signs in and becomes the workspace owner.
2. The owner sets the company identity, allowed work email domains, and sign-in
   options, then invites the hiring team.
3. A recruiter creates a job from a company template, completes the posting,
   and publishes it.
4. A candidate reads the posting, submits an application, and verifies their
   email before the application enters the active pipeline.
5. The recruiter reviews the application, resume, answers, notes, and job-fit
   explanation, then moves the candidate to the next stage or sends a clear
   update.
6. For an interview stage, the recruiter assigns the interviewer or panel
   before asking the candidate to book.
7. The candidate chooses an available time, receives the meeting details, and
   gets reminders until the interview is complete.
8. Interviewers submit private scorecards. The recruiter reviews the feedback,
   decides the next step, and advances, holds, rejects, or hires the candidate.
9. The application closes with a clear outcome while its history remains easy
   to understand.

At every step, the next action is visible to the person who owns it. No stage
should depend on someone guessing what to do next or searching old email.

## Organization setup

The first employee who signs in becomes the owner of the company workspace.
The owner names the company and decides:

- whether employees may sign in with Google, Microsoft, or both;
- which company email domains are allowed; and
- which people may join and what each person may do.

The owner and administrators can invite recruiters, hiring managers, and
interviewers. Each person sees only the work their role allows.

The candidate is not an employee in the workspace. Candidate access is limited
to their own verified applications, requests, interview details, and messages.
Internal notes, ranking explanations, scorecards, and hiring decisions remain
private to the hiring team.

## Job creation

A recruiter can create a complete job posting in one place, including:

- title, department, location, employment type, and compensation;
- responsibilities and qualifications;
- preferred experience and skills;
- application questions;
- hiring team;
- interview stages; and
- candidate-facing instructions.

### Job description editor

The job description editor provides familiar writing components such as
headings, paragraphs, emphasis, links, bullet lists, numbered lists, quotes,
and tables where useful.

Every supported component must have a clean Markdown representation. The job
description should remain portable, readable, and reusable outside the ATS.
The editor must not require proprietary formatting or create content that only
works inside one screen.

### Company posting templates

The company can create reusable job-posting templates. A template may provide:

- company name and introduction;
- logo and brand presentation;
- standard company header;
- standard sections and section order;
- recurring benefits and working principles;
- default application questions; and
- default interview stages.

When a recruiter starts a job, they can select a template and begin with a
complete, company-ready posting. The recruiter can edit the posting without
changing the original template. A job keeps the version of the template it
started from so published postings do not unexpectedly change later.

## Public job and application experience

Candidates can browse public jobs and read the full posting before applying.
The application should be quick and welcoming. It supports personal details,
resume upload, application questions, and optional additional information.

After the candidate finishes the form, they confirm ownership of their email
with a one-time code. The application becomes active only after confirmation.
The candidate then receives a confirmation and a link to follow progress.

Candidates do not need a password, employee account, or company login.

## Candidate portal

A candidate can use their verified email to see every application associated
with them. The portal shows:

- application status;
- what stage is next;
- interview details;
- booking links;
- scheduled times;
- messages and instructions; and
- requests that need a response.

The candidate should never have to guess whether an application was received or
what is expected next.

## Candidate review and search

Recruiters can search and filter candidates by skills, experience, location,
status, tags, job, and other useful attributes. They can review resumes, edit
extracted information, add private notes, and see the complete application
history.

### Job-specific matching and ranking

When a recruiter searches for candidates for a particular job, the job's
requirements are always part of the search and ranking decision. The system
considers:

- required qualifications;
- preferred qualifications;
- relevant experience;
- skills and evidence in the resume;
- application answers;
- location and work preferences where relevant; and
- any recruiter-selected filters.

The result should be a ranked shortlist for that job, not a generic list of
people who happen to share a keyword. Each ranking should explain why a
candidate appears and identify missing or uncertain qualifications. Recruiters
remain responsible for deciding who advances.

Recruiters can also ask questions in plain language, such as “show me senior
backend candidates for this role who have worked on payment systems.” The
system turns the request into understandable search criteria and lets the
recruiter review the result.

## Application workflow

Recruiters can move an application through clear stages such as:

1. New
2. Reviewing
3. Recruiter screen
4. Interviewing
5. Decision
6. Offer
7. Hired
8. Rejected
9. Withdrawn

Every important change appears in the application's history. Private recruiter
notes are separate from messages the candidate can see.

Recruiters can reject one or many candidates using editable message templates.
They can still personalize a message before sending it.

An application history records stage changes, assignments, interview activity,
messages, notes, and decisions in time order. A recruiter can understand what
happened without reconstructing the process from separate tools.

## Interview rounds

Each job can have several ordered interview rounds. A round defines its name,
purpose, length, interviewers, panel requirements, candidate instructions, and
the message used to invite the candidate.

Examples include:

- recruiter conversation;
- technical interview;
- portfolio review;
- hiring manager conversation; and
- final panel.

Different jobs may use different rounds. A candidate can be advanced, held,
rejected, or moved back after any round.

After an interview, each assigned interviewer receives a focused scorecard for
the round. A scorecard supports a rating, evidence, strengths, concerns, and a
recommendation. Submitted feedback is private to the hiring team and is not
shown to the candidate.

## Interview assignment and booking

The recruiter assigns the candidate to the interviewer or panel first. The
interviewer receives an assignment message with the candidate, job, round
details, and instructions.

The candidate then receives a round-specific message asking them to book the
interview. The booking page shows only times when all required interviewers are
available.

When the candidate chooses a time:

1. the time is held while the booking is confirmed;
2. the interview is placed on the interviewers' calendars;
3. the candidate receives the meeting details;
4. interviewers and recruiters receive confirmation; and
5. the candidate's application moves to the booked stage.

Candidates can reschedule or cancel according to the job's settings. Calendar
changes made outside the ATS are reflected in the application and communicated
to the people affected.

## Communication and reminders

Every stage has clear, configurable communication. Messages may include:

- application confirmation;
- verification request;
- status updates;
- interviewer assignment;
- booking request;
- booking confirmation;
- interview reminders;
- rescheduling or cancellation;
- scorecard reminders;
- next-round invitation;
- rejection; and
- offer communication.

The company can decide how many days may pass before a reminder is sent. The
system can remind candidates to book, remind interviewers to complete feedback,
and alert recruiters when a process has gone stale.

Messages are tailored by job and interview round. The application timeline
shows what was sent, when it was sent, and what happened afterward.

## Calendar connections

Each interviewer connects their own Google or Microsoft calendar. The product
uses those calendars to find real availability, prevent double booking, create
meeting invitations, and notice changes.

The recruiter should not need to manage calendar details manually for every
interview.

An interviewer can connect one Google or Microsoft calendar from their own
account and can replace or disconnect it later. A missing or expired connection
is shown as an action for that interviewer rather than silently producing bad
availability.

## Candidate protection and abuse controls

The initial candidate experience does not use a visible CAPTCHA. Email
verification, submission limits, duplicate detection, upload restrictions, and
review of suspicious activity provide the first layer of protection.

The application should remain easy for genuine candidates while making large
volumes of fake submissions difficult.

## AI assistance

AI helps recruiters work faster without making hiring decisions on its own. It
can help with:

- resume organization;
- matching candidates to a specific job;
- explaining ranking results;
- natural-language search;
- drafting recruiter messages; and
- summarizing interview notes.

Recruiters can review and adjust AI-assisted results before any hiring action
is taken.

AI output is always presented as a draft, explanation, or summary. It must not
change a candidate's stage, send a message, or make a hiring decision without a
recruiter choosing that action.

## Configuration and ownership

The owner can configure the parts of the experience that vary by company:

- allowed sign-in providers and company email domains;
- team roles and invitations;
- job-posting templates and company presentation;
- application questions and interview rounds;
- candidate-facing messages and reminder timing; and
- interview booking and cancellation rules.

Jobs and applications keep the choices that were active when they were
created. Updating a template or message later should not rewrite an already
published job or change a candidate's history unexpectedly.

## Clear-state rules

The product uses plain, consistent language for the important states:

- **Draft:** being prepared and not visible to candidates.
- **Open:** accepting applications.
- **New:** received and waiting for review.
- **In review:** being evaluated by the hiring team.
- **Interviewing:** at least one interview round is in progress.
- **Booked:** an interview time is confirmed.
- **Decision:** feedback is being reviewed or a decision is pending.
- **Offer:** an offer is being prepared or discussed.
- **Hired:** the candidate was selected.
- **Rejected:** the process ended without selection.
- **Withdrawn:** the candidate ended their application.

Every visible state has a next action, an owner, and an appropriate candidate
message. When no action has happened for the configured number of days, the
responsible person receives a reminder and the recruiter sees the stale item.

## Success criteria

The product is working well when:

- a company can set up its workspace without engineering help;
- a recruiter can publish a polished job quickly using a company template;
- job descriptions remain portable as Markdown;
- candidates can apply and check their status without creating a password;
- recruiters can find the best candidates for one specific job;
- interviewers can connect their calendars and receive clear assignments;
- candidates can book interviews without back-and-forth email;
- every stage sends the right communication;
- stale work is surfaced automatically; and
- the entire history of an application is easy to understand.

## Deferred product decisions

- Enterprise SSO connections such as Okta or customer-specific Entra setups.
- Calendar aggregation through Nylas.
- Visible CAPTCHA or Turnstile.
- Candidate identities in the employee identity system.
- Customer-facing API-key management.
- Dedicated search infrastructure before the current search experience proves insufficient.
