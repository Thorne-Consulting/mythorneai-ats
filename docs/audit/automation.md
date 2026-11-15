# Assessments, automated workflows and reports

## Overall
- **Two of the three areas are browser-only toys.** Assessments and Workflows keep everything in `localStorage` (`features/preview/assessments/store.tsx:45-52`, `features/preview/workflows/sample-workflows.ts:374-384`). Nothing is sent, teammates never see each other's work, and every shared link lands on "Not saved in this browser" (`AssessmentDetail.tsx:160-184`, `WorkflowEditor.tsx:93-107`). Assessments never touch a real candidate, application or job. Invites are bare email strings (`InviteModal.tsx:87-94`). There is no page where a candidate can take a test: the only "candidate view" is a builder preview with a disabled Submit (`CandidatePreview.tsx:147-149`).
- **We say everything twice.** Every preview screen shows a Preview badge and a full-width blue Preview alert. The workflow editor shows both inside 150px of chrome (`WorkflowEditor.tsx:494-497` and `:518`). The assessments home shows the same numbers four times: stat cards, "Completion overview", "Needs your attention" and "Recent results" (`AssessmentsPage.tsx:118-420`). The reports overview repeats the left nav as cards (`ReportsOverview.tsx:44-87` against `ReportsShell.tsx:68-108`).
- **The workflow editor is cramped.** It sits inside the app shell and splits into palette 220px, canvas and inspector 340px (`WorkflowEditor.tsx:616`). At 1465×812 that leaves about 630×560px of canvas. `fitView` with `minZoom 0.25` (`:674-676`) shrinks a 7-step workflow until the cards can't be read. The minimap covers about a quarter of the canvas (`:695-710`). Every edge has dashes that never stop moving (`:481`, `:677`).
- **There are three automation systems and three template systems.** Reminders are hard-coded loops in `Infrastructure/EmailOutboxWorker.cs:111-227`. Webhooks fan out from `PipelineEvents.PublishAsync`. Workflows are a third, client-only engine. Email wording lives in three places, each with its own placeholder syntax: server templates use `{{firstName}}` (`EmailTemplates.cs:17-60`), workflows use `{{candidate.first_name}}` (`catalog.tsx:83-110`), and Messages templates use `{{first_name}}` (`sample-messages.ts:300-340`).
- **Reports are real and well built, but static.** No number can be clicked to see the people behind it. There is no period-over-period comparison and no schedule or sharing. The source filter is a free-text box that must match exactly, including case (`ReportView.tsx:103-109`, `ReportEndpoints.cs:74-75`). The overview truncates its own stat labels at 1440 ("Applicati…", "Scorecar…") and runs four full reports to show four numbers (`ReportsOverview.tsx:17-31`).
- **Chart colours break the "colour means something" rule.** The funnel paints each stage a different colour, with Interview green and Booked amber (`components/ui/chart.tsx:290`).

**Target experience.** One automation engine on the server runs everything that happens without a click: reminders, follow-up emails, approvals, sending data to other apps. Admins see it as workflows. Recruiters see it as a simple "Reminders" page of built-in workflows. Every workflow has a run history that shows exactly what was sent, to whom and why, with Retry. Assessments shrink to what an ATS should own:
- quizzes, written case studies, take-home uploads and code answers reviewed by people, sent from the application and taken inside the candidate portal;
- scored against a rubric next to the interview scorecards;
- a link-out step for specialist coding or psychometric providers.

Reports open on a dated overview with trends. Every number drills into the applications behind it. Every report can be broken down by job, department, source, recruiter or month, then saved, shared with the team or emailed every Monday.

## Features

### Assessments: scope decision (build, remove or integrate)  — COMPLETE (lean) · XL
- Where: all `/assessments/*` routes, `src/web/src/features/preview/assessments/*`, `features/preview/AssessmentsPage.tsx`, `features/preview/sample-assessments.ts`. Backend: none.
- Today: a well-built front end (builder, review screen, scoring logic with a check) running entirely on sample data. There is no backend, no candidate-taking page and no link to applications.
- Product critique: Greenhouse, Lever and Ashby do not build assessment engines. They ship a "take-home test" interview type (send a task, collect the answer, grade it with a scorecard) and partner with HackerRank, Codility, CodeSignal and TestGorilla for coding and psychometrics. Our edge is not out-building HackerRank.
- Options weighed:

  | Option | Cost | What customers get | Risk |
  |---|---|---|---|
  | Full platform (code execution sandbox, webcam proctoring, question marketplace) | XL+, 8–10 weeks plus ongoing sandbox hosting | Parity with a niche vendor | Webcam recording is biometric data (Illinois BIPA, GDPR), which is legal work and out of scope. Sandbox security is a permanent cost. |
  | Remove entirely | S (delete folder and nav item) | Nothing. Customers email PDFs and grade them in notes. | A visible gap against the Greenhouse take-home flow. We throw away a good review UI. |
  | **Lean native, plus an external-link step (recommended)** | XL, about 3–4 weeks | Screening quizzes, written cases, file take-homes and code answers graded by rubric, all on the application record, plus "External assessment" for provider links | Low. No proctoring and no code execution. |
  | Provider APIs (HackerRank, Codility, TestGorilla) | L each, plus partner agreements | Automatic scores from vendors | Do this per customer request, on top of the External assessment record. |
- Complete means: every item marked COMPLETE below, with webcam and code execution removed.
- Backend: see "Assessment engine backend".

### Assessment engine backend  — COMPLETE · L
- Where: new `src/server/Domain/Assessments.cs`, `src/server/Features/Assessments/AssessmentEndpoints.cs`, `Features/Public/PublicAssessmentEndpoints.cs`.
- Today: nothing. Scoring runs in the browser (`scoring.ts:55-71`), so a candidate or reviewer could change their score.
- Backend:
  - Entities:
    - `Assessment`: Id, Name, DepartmentId (from jobs), Instructions (Plate JSON), Minutes, Timed, PassMark, ShuffleQuestions, ShuffleOptions, IntegrityFlags (TabSwitch, Fullscreen, BlockPaste), ExpiryDays, Status, CurrentVersionId.
    - `AssessmentVersion`: Id, AssessmentId, Number, SectionsJson, PublishedAt. It never changes after publishing.
    - `AssessmentInvite`: Id, VersionId, **ApplicationId (required)**, TokenHash, Status (NotStarted, InProgress, Submitted, Expired, Revoked), InvitedBy, InvitedAt, ExpiresAt, StartedAt, DeadlineAt, ExtraMinutes, SubmittedAt, AutoPoints, ReviewPoints, MaxPoints, Percent, Decision, DecidedBy, DecidedAt, Comment, ReminderCount, LastReminderAt, IntegrityJson.
    - `AssessmentAnswer`: InviteId, QuestionId, ChoiceIds[], Text, AttachmentId (reuse `LocalFileStore` and candidate attachments), SavedAt, AutoPoints, ReviewerPoints, ReviewerEmail.
  - Staff endpoints:
    - Assessments: `GET/POST /assessments`, `GET/PUT /assessments/{id}`, `POST /assessments/{id}/publish|archive|restore|duplicate`. Duplicate makes new question ids; today's Duplicate copies them (`AssessmentsPage.tsx:241-250`).
    - Invites: `POST /applications/{id}/assessments`, `POST /applications/bulk-assessment`, `GET /assessments/{id}/invites`, `POST /assessment-invites/{id}/remind|revoke|extend|retake`.
    - Review: `GET /assessment-invites/{id}`, `PUT /assessment-invites/{id}/scores`, `POST /assessment-invites/{id}/decision`, `POST /assessment-invites/{id}/reopen` (admin only, needs a reason, writes to `Audit`).
  - Public endpoints:
    - `GET /public/assessments/{token}` shows the intro without the questions.
    - `POST .../start` sets DeadlineAt on the server.
    - `PUT .../answers/{questionId}` autosaves and refuses writes after DeadlineAt plus 30 seconds.
    - `POST .../upload`.
    - `POST .../signals` takes integrity events in batches.
    - `POST .../submit`.
  - Worker: a sweep in `EmailOutboxWorker` (or the workflow worker below) auto-submits past-deadline invites and expires stale ones.
  - Integration: publishes an `assessment.completed` event for workflows and webhooks.
  - Scoring: port `scoring.ts` to C# and keep `scoring.check.mjs` as the shared spec.
- Libraries: none new on the server.

### Assessments home and library (`/assessments`)  — COMPLETE · M
- Where: `features/preview/AssessmentsPage.tsx`.
- Today: four stat cards; a 2-column card grid that shows only 4 assessments behind a "View all 8" toggle (`:58-59`, `:82-83`, `:150-163`); Active, Drafts and Archived tabs; a right rail.
- Design critique:
  - Each library card has three ways to reach one page: the title link, a "View details →" link and the ••• menu "View details" (`:222-224`, `:460-491`).
  - Cards can't be sorted, searched or compared, and pass rate is buried in a gray meta line.
  - The page needs 1360px of scroll at 1440 for 8 assessments.
  - The right rail ends 120px below the left column. The two columns don't line up.
- Product critique: Ashby and Greenhouse show tests as a plain list with usage and pass rate, and grading work as a queue. Recruiters come here to grade, not to browse cards.
- Complete means:
  - [ ] One `DataTable` card with `Tabs`: **To review (n)** · Active · Drafts · Archived.
  - [ ] Columns: name and department (`CellStack`), questions and minutes, invited, completed, pass rate, last activity, `RowActions`.
  - [ ] Search, a department `FilterSelect`, column picker, and a `viewKey` so the choices stick.
  - [ ] Four stat cards only. Hints must add new facts, for example "Pass rate, last 30 days" rather than "Across 7 departments".
  - [ ] Header: "Create assessment" as the primary button. Remove the global "Invite candidates" button: you invite from a candidate (see the invitations feature).
  - [ ] Empty state for a new workspace with two starter templates ("Customer support writing", "Frontend take-home").
  - [ ] Phone: the table scrolls inside its card. Checked: there is no page overflow at 375px today.
- Backend: `GET /assessments?status=` returns invited, completed and pass rate counts (one grouped query).
- Libraries: none (`DataTable` exists).

### "Needs your attention" panel  — MERGE · S
- Where: `AssessmentsPage.tsx:339-398`.
- Today: the header says "26 pending" while the list shows 8. `toReview` is not limited when counted (`:344`) but is cut to 5 when listed (`:357`). "Send reminder" only shows a toast (`:385-387`).
- Survivor: the **To review** tab on the home page, with a count on the tab, plus a "Grade assessments" item in the dashboard to-do list. Reminders move to the automation engine.

### "Recent results" card  — REMOVE · S
- Where: `AssessmentsPage.tsx:280-335`. It repeats the same people as "Needs your attention" (Carl Ramos and Kleish Remando appear in both in the screenshot), and each assessment's Results tab already lists them. Delete it.

### "Completion overview" card  — REMOVE · S
- Where: `AssessmentsPage.tsx:400-420`. It shows "Completed 104 (64%)", the same as the stat card at `:132-138`. Delete it. The per-assessment "Where candidates are" card stays (`AssessmentDetail.tsx:265-286`).

### Library lifecycle actions (publish, duplicate, archive, restore, status tabs)  — COMPLETE · S
- Where: `AssessmentsPage.tsx:220-270`, `AssessmentDetail.tsx:99-113`.
- Today:
  - Publish happens instantly, with no check that the questions are valid.
  - Archive is marked as a danger action and needs no confirmation.
  - Duplicate keeps the same question ids.
- Complete means:
  - [ ] Publish runs the same checks as the builder's last step and lists any problems.
  - [ ] Archive asks for confirmation when the assessment has open invites. It says those links keep working until they expire.
  - [ ] Restore returns the assessment to Drafts.
  - [ ] Duplicate opens the copy in the builder.
- Backend: see the engine.

### Builder wizard (Details, Questions, Settings, Review, Publish)  — COMPLETE · M
- Where: `/assessments/new`, `/assessments/[id]/edit`, `assessments/AssessmentBuilder.tsx`.
- Today:
  - A 5-step `Wizard` with a summary aside and a browser-kept draft.
  - **"Save and exit" on a new assessment does not create a draft.** It shows the toast "Draft saved in this browser" and goes back to the list (`:106-114`). The Drafts tab never shows it.
  - "Save as draft" on the last step only works once every step is valid, because the Wizard blocks later steps (`wizard.tsx:44`). You can't park unfinished work.
  - Plurals are broken: "1 questions · 2 points" (`:212`) and "1 in 1 sections" (`:241`, and again at `AssessmentDetail.tsx:246`). Both are visible in the screenshot.
  - The summary aside is hidden below 1280px (`wizard.tsx:143`).
  - On phone only 3 of the 5 steps fit in the step strip. Review and Publish are off-screen with no hint to scroll (phone screenshot).
- Design critique:
  - "Pass mark (percent)" and "Duration (minutes)" put the units in the labels. Put them as suffixes inside the input instead.
  - Type ("Technical skills", "Case study") is a hard-coded label with no effect (`sample-assessments.ts:68`).
  - Department comes from a hard-coded list (`:69-77`) instead of the job departments.
- Product critique: Greenhouse's take-home setup is one screen. Five steps is a lot for "name, questions, timer". Merge Review into Questions as a "Preview as candidate" toggle, so there are 3 steps: Details, Questions, Settings and publish.
- Complete means:
  - [ ] "Save draft" always works and creates a Draft row on the server.
  - [ ] Problems show on the last step instead of blocking navigation.
  - [ ] 3 steps.
  - [ ] Instructions in Plate with links and lists.
  - [ ] Department picked from jobs. Type removed.
  - [ ] Unit suffixes in the inputs.
  - [ ] Correct plurals.
  - [ ] Summary moves under the steps below xl, not hidden.
  - [ ] Phone step strip scrolls the current step into view.
- Backend: `PUT /assessments/{id}` saves the draft. Publishing creates an `AssessmentVersion`.
- Libraries: `platejs@53.3.15` (installed) for instructions. It replaces the `Textarea` at `:293-299`.

### Question editor (sections, question types, answers, reorder, duplicate)  — COMPLETE · M
- Where: `assessments/QuestionEditor.tsx`.
- Today:
  - Sections and questions can be added, retyped, duplicated, removed, and moved up or down, including across sections (`:50-63`).
  - Inline problems appear per question (`:370-374`).
  - Removing a section deletes all its questions in one click, with no confirmation and no undo (`:81-87`).
  - Prompts are plain textareas (`:256-262`), so a question can't contain a code block, an image or a table.
- Design critique:
  - Every question card is permanently expanded with 4–6 fields. Ten questions make a 4,000px scroll.
  - The option "correct" control is a checkbox even for single-answer questions. Use a radio for single and a checkbox for multi.
- Product critique: Typeform, Google Forms and HackerRank collapse questions into a list and expand the selected one. They also let you import questions from another test.
- Complete means:
  - [ ] Questions collapse to one line (number, type icon, prompt, points, problem dot). Click expands.
  - [ ] Plate prompt with code block and image.
  - [ ] Radio or checkbox correct marker depending on type.
  - [ ] Confirmation before removing a non-empty section, plus undo in the builder (reuse the snapshot pattern from `WorkflowEditor.tsx:156-187`).
  - [ ] "Copy questions from another assessment" picker. This is the lazy question bank: no separate bank entity.
  - [ ] Optional partial credit on multi-answer questions.
- Libraries: `platejs@53.3.15` (installed). Drag reordering is optional: `react-dnd@16.0.1` is already installed, but the arrow buttons are accessible and enough.

### Auto-scoring  — COMPLETE · S
- Where: `assessments/scoring.ts`, `scoring.check.mjs`.
- Today: exact-set, all-or-nothing scoring for choice questions (`:37-44`), with reviewer points for the rest. It is correct and covered by a check, but runs only in the browser.
- Complete means:
  - [ ] Port it to C#, scored at submit time.
  - [ ] Store per-question AutoPoints.
  - [ ] Optional partial credit per question (correct picked minus wrong picked, never below 0).
- Backend: `AssessmentScoring.cs`. Keep the `.mjs` check as the shared spec.

### Code questions  — COMPLETE (human-graded) · S
- Where: `QuestionEditor.tsx:328-347`, `CandidatePreview.tsx:121-131`, `ResultReview.tsx:214-217`.
- Today: starter code and answers are monospace textareas with no highlighting, no Tab key and no line numbers.
- Product critique: candidates judge a company by its code editor. Running code against hidden tests is HackerRank's job. That part is **REMOVE**: it needs a sandbox and is XL. Send candidates to a provider through "External assessment" instead.
- Complete means:
  - [ ] CodeMirror editor for the starter code, the candidate's answer and a read-only reviewer view, with syntax highlighting for the 7 listed languages.
  - [ ] The reviewer sees a diff against the starter code.
- Libraries: `@uiw/react-codemirror@4.25.12`, `@codemirror/lang-javascript@6.2.5` (covers TypeScript), `@codemirror/lang-python@6.2.1`, `@codemirror/lang-sql@6.10.0`. CodeMirror 6 is small and works on phones. `@monaco-editor/react@4.7.0` was rejected because it is about 2MB and poor on mobile.

### File upload questions  — COMPLETE · S
- Where: `QuestionEditor.tsx:349-357`, `ResultReview.tsx:218-225` ("sample file, can't be downloaded").
- Complete means:
  - [ ] Real upload with type and size limits (25MB).
  - [ ] Inline preview for PDF and images in review, plus a download link.
  - [ ] Files kept with the candidate's attachments.
- Backend: reuse `LocalFileStore` and the `/attachments/{id}` endpoint.

### Timer, attempts, expiry, shuffle  — COMPLETE · S
- Where: `AssessmentBuilder.tsx:307-346`.
- Today: switches with no effect.
- Complete means:
  - [ ] The timer is enforced on the server (DeadlineAt). The candidate sees a countdown with a warning at 5 minutes.
  - [ ] Expiry is set per invite and can be extended.
  - [ ] Shuffling uses a seed from the invite id, so the reviewer sees the order the candidate saw.
  - [ ] **"Attempts allowed" is replaced** by an "Allow a retake" action on one invite. A global attempt count gets misused, and retakes are a case-by-case decision (the sample message "I had a power cut… can I retake it?" proves it).
  - [ ] "Extra time" per invite for candidates who ask for an accommodation.

### Integrity checks (tab switch, full screen, paste)  — COMPLETE · M
- Where: `AssessmentBuilder.tsx:347-370`, `CandidatePreview.tsx:44-60`.
- Complete means:
  - [ ] Signals are recorded with timestamps: tab left or returned (`visibilitychange`), full screen exited, paste blocked or attempted.
  - [ ] The candidate is told up front, in plain words, what is recorded.
  - [ ] The review screen shows a timeline ("Left the tab 3 times, longest 2 minutes, during question 4").
  - [ ] **Signals never auto-fail anyone.** They inform the reviewer.
  - [ ] Copy says "checks", not "cheating", to candidates.
- Backend: `POST /public/assessments/{token}/signals`, stored in `IntegrityJson`.
- Libraries: none (browser APIs).

### Webcam recording  — REMOVE · S
- Where: `AssessmentBuilder.tsx:349-354`, `sample-assessments.ts:113` (on by default for every "Technical skills" test).
- Why: recording candidates' faces is biometric data under BIPA and GDPR. It needs consent flows and retention rules, which is legal work the brief excludes. Delete the setting and the "Webcam" mention in Details (`AssessmentDetail.tsx:197`).

### Candidate preview (builder step 4)  — MERGE · S
- Where: `assessments/CandidatePreview.tsx`.
- Survivor: the real candidate-taking component. The builder renders it in preview mode, so there is one renderer and nothing drifts apart.

### Candidate-taking experience  — COMPLETE · L
- Where: missing. It should be a public route such as `/portal/assessments/[token]` inside the candidate portal shell.
- Today: nothing. A candidate who gets an invite has nowhere to go.
- Product critique: TestGorilla and HackerRank give candidates:
  - an intro page (time, number of questions, what is checked, a "Start when you're ready" button);
  - a focused page with no app chrome;
  - one section at a time with a question list, an autosave indicator ("Saved 2 seconds ago"), a sticky countdown, "Mark for review", a review-before-submit page and a thank-you page;
  - work that survives a refresh.
- Complete means:
  - [ ] Intro page.
  - [ ] Section paging and question list.
  - [ ] Autosave every answer (debounced 800ms) and resume after refresh or on another device until the deadline.
  - [ ] Countdown and auto-submit.
  - [ ] File upload.
  - [ ] CodeMirror for code questions.
  - [ ] Review page that lists unanswered questions.
  - [ ] Submit confirmation.
  - [ ] Thank-you page with what happens next.
  - [ ] Works at 360px.
  - [ ] Keyboard-only friendly.
  - [ ] Pending assessments listed on the portal application page.
- Backend: the public endpoints in the engine.
- Libraries: CodeMirror (above). Plate read-only renderer for prompts.

### Invite candidates (modal)  — COMPLETE · M
- Where: `assessments/InviteModal.tsx`, used from `AssessmentsPage.tsx:426-438` and `AssessmentDetail.tsx:141-155`.
- Today:
  - Typed emails become fake candidates through `nameFromEmail` (`store.tsx:102-108`).
  - No job, no message, no deadline.
  - The description admits "This is a preview, so no email is sent."
- Product critique: in Greenhouse you send a test from the candidate's application or from a stage, with an email you can edit, and the result appears on that application.
- Complete means:
  - [ ] Invite from the application page, from the pipeline bulk bar ("Send assessment") and from a workflow action.
  - [ ] The modal picks the assessment (`SearchSelect`), shows the email from the shared template "assessment-invite" with an edit option, and sets the due date (default from the assessment).
  - [ ] It warns when the candidate was already invited and offers "Allow a retake" instead.
  - [ ] Recipients are applications, never raw emails.
- Backend: `POST /applications/{id}/assessments`, `/applications/bulk-assessment`. Emails are queued through `EmailTemplates.QueueAsync` with key `assessment-invite`.

### Invited tab (table, search, status filter, bulk remind and revoke, export)  — COMPLETE · S
- Where: `AssessmentDetail.tsx:384-565`.
- Today: a good `DataTable`, but:
  - reminders are only toasts (`:405-411`);
  - **Revoke deletes submitted answers** (`:554-558`), so one click destroys a graded result;
  - candidate names don't link to the candidate.
- Complete means:
  - [ ] Revoke is only offered before submission. For submitted invites the action is "Remove result" with confirmation and an activity history entry.
  - [ ] Remind sends the real template and shows "Reminded 2 times, last on Nov 3".
  - [ ] Extend deadline.
  - [ ] Candidate names link to the application.
  - [ ] Add a Job column.
- Backend: invite endpoints in the engine.

### Reminders for unfinished assessments  — MERGE · S
- Where: `AssessmentsPage.tsx:381-390`, `AssessmentDetail.tsx:405-411`.
- Survivor: the automation engine's built-in "Assessment not finished" workflow (wait N days before expiry, send "assessment-reminder", stop on submit). The manual "Send reminder" button stays and queues the same template.

### Results tab (score distribution and results table)  — COMPLETE · S
- Where: `AssessmentDetail.tsx:574-692`.
- Today: six buckets in a full-width 280px chart with no pass-mark marker; "middle score" in the caption.
- Product critique: the most useful assessment analytic is **question analysis**: the share of candidates who got each question right, and whether strong candidates got it right. It finds broken questions. Codility and TestGorilla show it. We don't.
- Complete means:
  - [ ] Distribution with a pass-mark `ReferenceLine`.
  - [ ] Half-width chart next to a "Question analysis" card: percent correct per question and average reviewer points, with questions under 20% or over 95% flagged.
  - [ ] Results table gains a Job column and an Integrity column (flag count).
  - [ ] Caption keeps "middle score" (plain English). "Pass mark 60%" moves onto the chart as the reference line label, so it is said once.
- Libraries: `recharts@3.10.1` `ReferenceLine` (installed), added to `components/ui/chart.tsx`.

### Result review (question by question)  — COMPLETE · M
- Where: `/assessments/[id]/results/[resultId]`, `assessments/ResultReview.tsx`. Checked live: `/assessments/a1/results/a1-i2`.
- Today: the strongest screen in the area. It has:
  - a numbered question strip coloured right, wrong, to-score or scored (`:140-175`);
  - ← and → to move between questions;
  - the rubric with quick "Not met, Partly met, Met" scoring (`:257-278`);
  - a suggested decision from the pass mark, and a warning when you go against it (`:90-92`, `:367-371`);
  - "Next to review".
- Gaps:
  - The candidate name is not a link to the application.
  - No integrity timeline. No time spent per question.
  - The score card shows a big "—" while questions are pending.
  - The reviewer is stored as the literal "You" (`:375`).
  - The rail repeats Email and Invited, which belong on the application.
- Product critique: Greenhouse grades take-homes with the job's scorecard. Grading here should also feed the application's evaluation. Structured, comparable evaluation is the product principle.
- Complete means:
  - [ ] Header links to the application and shows the job.
  - [ ] Optional **blind grading**: hide the name and email until the decision is submitted.
  - [ ] Integrity timeline card.
  - [ ] Time per question.
  - [ ] Score card shows "12 of 28 points so far" while pending.
  - [ ] Decision posts to the application's activity and shows next to scorecards.
  - [ ] "Next to review" walks the To review queue across assessments.
- Backend: `GET /assessment-invites/{id}`, `PUT .../scores`, `POST .../decision`.

### Decision lock  — COMPLETE · S
- Where: `ResultReview.tsx:336-349` ("Decisions can't be changed").
- Today: locking is right, but a mistaken click is permanent with no way out.
- Complete means:
  - [ ] Admins can "Reopen grading" with a required reason, recorded in the activity history (`Infrastructure/Audit.cs`).
  - [ ] The original decision stays visible in that history.

### Editing an assessment after submissions  — COMPLETE · S
- Where: `AssessmentBuilder.tsx:195-200` warns "Changing questions or points changes their scores."
- Fix: never rescore silently. Publishing an edit creates a new `AssessmentVersion`. Existing invites keep the version they started. The detail page shows "Version 3 · 12 results on older versions".

### Assessment linked to job and pipeline stage  — COMPLETE · M
- Where: missing. Nothing connects an assessment to a job.
- Complete means:
  - [ ] A job's interview plan (job record) can include "Assessment: Frontend take-home" on a stage.
  - [ ] Moving a candidate into that stage offers to send it (or the built-in workflow sends it).
  - [ ] The result shows on the pipeline card as a small score badge.
- Backend: `RequisitionStage.AssessmentId` (nullable), maintained in the jobs area. See Cross-area notes.

### External assessment (provider link)  — COMPLETE · S (+L per provider API later)
- Where: new question-free assessment kind.
- Complete means:
  - [ ] An assessment of kind "External" stores a provider name and a link template.
  - [ ] The invite email carries the link.
  - [ ] The reviewer types the score and attaches the report PDF.
  - [ ] Later, a provider webhook (`POST /public/assessment-providers/{provider}/webhook`, HMAC-verified like `WebhookWorker` signatures) fills the same fields.
- Backend: `Assessment.Kind` (Native or External), `ProviderName`, `ExternalUrl`.

### Assessment type and department lists  — MERGE · S
- Where: `sample-assessments.ts:68-77`, `AssessmentBuilder.tsx:42-50`, `store.tsx:110-120` (department icons and tones).
- Survivor: departments from requisitions (the Department field). "Type" is removed: it is a label nobody filters on. Icons fall back to one assessment icon.

### Browser-only preview store and Preview alerts  — REMOVE · S
- Where: `assessments/store.tsx`, `sample-assessments.ts`, the `PreviewAlert`s, the `nav.ts:44` `preview: true` flag.
- Why: replace them with TanStack queries when the API lands, per the project rule. Until then, show one Preview badge only and drop the alert, so it isn't said twice.

### Single automation model (workflows absorb reminders and sequences; webhooks and notifications become actions)  — COMPLETE · XL
- Where: `features/preview/workflows/*`, `Infrastructure/EmailOutboxWorker.cs:79-227`, `Infrastructure/PipelineEvents.cs`, `Infrastructure/WebhookWorker.cs`, `/admin/reminders`, `/admin/webhooks`, `/admin/notifications`, `/admin/approvals`.
- Decision: **one engine, the workflow runtime. Everything that happens without a click is a workflow run.**
  - **Events:** `PipelineEvents.PublishAsync` is already the one place state changes go out. It keeps queuing webhook deliveries and also inserts `WorkflowRun` rows for active workflows whose trigger matches, in the same transaction. No new event bus.
  - **Time triggers:** "Application idle for N days", "Interview ended N hours ago and scorecards are missing", "Booking link unanswered for N days", "Assessment due in N days". A sweeper starts runs for these. The three hard-coded loops in `EmailOutboxWorker.cs:111-227` become three **built-in workflows** (marked built-in: they can be edited or switched off but not deleted). `/admin/reminders` becomes a simple view of those three, with their day counts and on/off switches, so the person here once a month never sees a graph.
  - **Email sequences** (follow-ups until the candidate replies) are just workflows: Send email → Wait → Check "Candidate replied?" → Send email, with "stop when the candidate replies" as an entry rule. There is no separate sequence engine.
  - **Webhooks** stay as the integration surface. The workflow action "Send to another app" picks a configured endpoint (signed and SSRF-guarded already).
  - **Team notifications** (Slack or Teams) and the in-app feed are delivery channels for the "Alert a teammate" action.
  - **Approvals:** offer and job approval *policy* stays in `/admin/approvals`. The workflow "Ask for approval" step creates ordinary `Approval` rows, so they show in the existing approvals inbox and bell.
- Backend:
  - Entities:
    - `Workflow`: Id, Name, Status, IsBuiltIn, BuiltInKey, DraftGraphJson, PublishedVersionId, Scope (job filter), EntryRules (once per application; stop on rejected, withdrawn or hired; quiet hours), CreatedBy, UpdatedAt.
    - `WorkflowVersion`: Id, WorkflowId, Number, GraphJson, PublishedBy, PublishedAt. It never changes after publishing.
    - `WorkflowRun`: Id, WorkflowId, VersionId, ApplicationId, TriggerType, Status (Running, Waiting, Completed, Failed, Cancelled), CurrentNodeId, NextRunAt, LockedUntil, Attempts, LastError, StartedAt, FinishedAt. A unique index on (WorkflowId, ApplicationId) enforces "once per application".
    - `WorkflowStepRun`: RunId, NodeId, Kind, Status, StartedAt, FinishedAt, BranchTaken, OutputJson (email outbox id, delivery id, approval id), Error.
  - `WorkflowWorker` copies the `WebhookWorker` loop (pick due, lock, run nodes until a wait, approval or end):
    - Waits set NextRunAt. Business hours use `Organization.TimeZone` and `EmailOutboxWorker.InQuietHours`.
    - Actions write to existing outboxes (`EmailOutbox`, `WebhookDeliveries`, `Approvals`) and move stages through the same code as `PATCH /applications/{id}/stage`, so history and webhooks fire.
    - Loop guard: actions record ActorEmail `workflow:{id}`, and events caused by a workflow do not trigger that same workflow.
    - Retries: 1, 5, 30 and 120 minutes, then the run is marked Failed.
    - Before each step after a wait, the run re-checks that the application is still Active.
  - Endpoints:
    - Workflows: `GET/POST /workflows`, `GET/PUT /workflows/{id}` (draft), `POST /workflows/{id}/publish|pause|resume|duplicate`, `DELETE /workflows/{id}` (only without runs; otherwise Archive), `GET /workflows/{id}/versions`.
    - Dry run: `POST /workflows/{id}/test` takes `{applicationId}`. It runs on the server with no side effects and returns the path and rendered emails.
    - Runs: `GET /workflows/{id}/runs?status=`, `GET /workflow-runs/{id}`, `POST /workflow-runs/{id}/retry|cancel`.
    - Lookups: `GET /workflows/lookups` returns stages, jobs, reasons, people, templates, webhook endpoints and custom fields.
  - Validation: port `graph.ts validate()` to C#. The server refuses to publish an invalid graph. Keep `graph.check.mjs`.
- Libraries considered: Elsa 3.9.0 (rejected: its own designer, persistence and runtime, far heavier than a 15-step catalog needs), Hangfire.Core 1.8.25 and Quartz 4.7.3 (rejected: Postgres polling on `NextRunAt` is the pattern every worker here already uses). `ponytail:` one polling worker. Switch to `FOR UPDATE SKIP LOCKED` batches if runs pass about 100k per day.

### Workflow list (`/admin/workflows`)  — COMPLETE · M
- Where: `features/preview/workflows/WorkflowList.tsx`.
- Today: a decent `DataTable` (name, trigger, status, edited, runs this week, ••• menu).
- Design critique:
  - "Create workflow" floats on its own 60px row above the alert (`:164-168`), because the Settings shell owns the header.
  - The Preview alert repeats the badge (`:169-172`).
  - "Runs this week" is a fake seed number (`sample-workflows.ts:319-325`).
  - Status can only be changed from the ••• menu.
  - Phone: the search box is cut to "Search work" and Status scrolls off-screen (phone screenshot).
- Product critique: a list of automations should answer "is anything broken?" at a glance, as Zapier's "Zap runs" and HubSpot's workflow list do: last run, errors and enrollment counts.
- Complete means:
  - [ ] "Create workflow" in the page header (needs AdminShell header actions; see Cross-area notes).
  - [ ] An inline status `Switch` per row (activation validates and shows problems in a toast with "Open").
  - [ ] Columns: Workflow (name and trigger summary), Status, Last run (relative time with a coloured dot), Runs in 30 days, **Failed** (red count linking to the runs tab filtered to failures), Owner, Edited.
  - [ ] A "Built-in" section for the reminder workflows.
  - [ ] Delete only when there are no runs; otherwise Archive.
  - [ ] Phone: full-width search on its own row.
- Backend: `GET /workflows` with run aggregates.

### Create workflow (modal and templates)  — COMPLETE · S
- Where: `WorkflowList.tsx:253-319`, `sample-workflows.ts:72-260`.
- Today: a name field and a radio list of 5 templates, with "Interview acceptance" preselected.
- Product critique: HubSpot and Zapier open a template gallery with a picture of each flow.
- Complete means:
  - [ ] A gallery of cards (title, one sentence, 3–4 step icons in a row).
  - [ ] "Start from scratch" as the last card.
  - [ ] The name defaults to the template name and can be edited after.
  - [ ] **Drop the "Offer approval" template** (`sample-workflows.ts:165-205`): offers already have an approval policy in `/admin/approvals` (`Organization.RequireOfferApproval`, `DefaultApproverEmails`). Two ways to approve offers will contradict each other.
  - [ ] Add "Follow up until they reply" and "Send assessment when moved to a stage".

### Workflow editor layout and canvas  — COMPLETE · M
- Where: `/admin/workflows/[id]`, `WorkflowEditor.tsx`, `catalog.tsx:556-605`. Checked live in Chrome at 1465×812.
- Today: React Flow canvas with palette, inspector, minimap, controls and "Tidy up" auto-layout (`graph.ts:79-100`).
- Design critique:
  - The canvas gets about 630px between the app sidebar, the palette (220px) and the inspector (340px) (`:616`).
  - The preview alert and toolbar take 150px.
  - `fitView` plus `minZoom 0.25` renders 7 steps at about 30%, so the 240px cards can't be read.
  - The minimap covers about a quarter of the canvas.
  - Edges never stop animating (`:481`, `:677`), which is visual noise.
  - The canvas card runs past the viewport bottom (`lg:h-[calc(100dvh-15rem)]` doesn't account for the alert).
  - Layout is left to right, so branches grow tall and long flows need sideways panning.
- Product critique: modern automation builders (Zapier, HubSpot, Customer.io, Make) use a **top-to-bottom** flow with a "+" on every connector. You rarely place nodes by hand. People here once a month build by clicking "+", not by dragging from a palette.
- Complete means:
  - [ ] Full-bleed editor route: collapse the app sidebar on entry (⌘\ restores it), no Settings shell, no alert.
  - [ ] 56px top bar: back, name, status switch, save state, Test, Runs, Versions, Publish.
  - [ ] Top-to-bottom layout (swap x and y in `graph.ts layout`) with a "+" button on every edge and under every open output. It opens a searchable step menu (the existing mobile "Add step" menu, `:712-736`, reused).
  - [ ] The left palette becomes a collapsible "Steps" popover.
  - [ ] Inspector as a closable, resizable right panel (`SplitView`) that opens on selection.
  - [ ] Open at 100% zoom centred on the trigger, not fit-all.
  - [ ] Minimap hidden until there are more than 12 steps.
  - [ ] Static edges. Animate only the test-run path.
  - [ ] Hide the React Flow attribution: the MIT licence allows `proOptions={{ hideAttribution: true }}`, which the maintainers ask paying users to support.
  - [ ] Free dragging still works.
- Libraries: `@xyflow/react@12.12.0` (installed). No `@dagrejs/dagre@3.1.3` or `elkjs@0.12.1`: the existing layered layout is enough once its axes are swapped.

### Step palette  — COMPLETE · S
- Where: `WorkflowEditor.tsx:617-646`.
- Today: a list grouped under "Start when", "Check or wait", "Approvals" and "Then do". Drag or click.
- Complete means:
  - [ ] Becomes the "+" menu with search, the group labels as sections, and a one-line help text under each step (already in `StepDef.help`).
  - [ ] When the graph has no trigger, the menu shows only triggers.

### Triggers  — COMPLETE · M
- Where: `catalog.tsx:126-229`.
- Today:
  - Six triggers, but jobs, stages and reasons are hard-coded lists (`:61-71`, `:207-218`) that don't match real jobs, per-job pipelines or the organization's reasons.
  - "Offer accepted… when a candidate signs their offer" (`:191-199`) implies e-signature, which is out of scope, and offers have no accepted state (`Domain/Offers.cs:3-10`).
- Complete means:
  - [ ] Options come from `/workflows/lookups`: real jobs and departments, stage names across pipelines, reasons.
  - [ ] Add these triggers:
    - Assessment completed.
    - Interview scheduled.
    - Candidate replied.
    - Offer sent.
    - Application idle for N days (time-based).
    - Scorecard overdue (time-based).
  - [ ] "Offer accepted" waits until the offers area records a candidate response (no signature). Rename it to "Candidate accepts offer".
  - [ ] Each trigger's summary names real values ("Moves to Onsite in Senior Engineer").

### Logic steps (Yes or no check, Wait, Split into paths)  — COMPLETE · S
- Where: `catalog.tsx:231-294`, `graph.ts:187-204`.
- Today: they work in the test run. The fields cover 7 candidate details, with no custom fields. "Value" is free text even for Stage, Source and Rating.
- Complete means:
  - [ ] Field list includes custom fields, Job, Department, Assessment score and Tags.
  - [ ] The value input matches the field: select for Stage and Source, number for Rating and Score, tags for Tags.
  - [ ] Wait supports "until a date field" (for example 2 days before the start date) as well as a fixed time.
  - [ ] **Fan-out rule:** `isValidConnection` (`WorkflowEditor.tsx:272-279`) allows two edges from one plain output, but `runPath` follows only the first (`graph.ts:178-180`), so a parallel branch silently never runs in the test. Pick one: forbid fan-out (lazy, recommended) or run branches in parallel on the server. Add a validation rule for it.

### Approval step  — MERGE · S
- Where: `catalog.tsx:296-355`.
- Survivor: the existing `Approval` entity and the `/approvals` inbox and bell. The step creates `Approval` rows (SubjectType "WorkflowRun"). Deciding resumes the run. "If nobody answers" maps to NextRunAt. "Specific person" uses `SearchSelect` over the directory instead of a free-text name (`:315-321`).

### Send email action  — MERGE · S
- Where: `catalog.tsx:357-390`, `EMAIL_TEMPLATES` at `:93-110`, inspector textarea and `EmailPreview` (`Inspector.tsx:218-231`).
- Survivor: the server email templates (`/admin/email-templates`, versioned, keyed). The step stores `templateKey` plus optional overrides. Editing happens in the shared Plate template editor with the one placeholder vocabulary. The preview renders with a real candidate. Drop the hard-coded copies and their `{{candidate.first_name}}` syntax.

### Alert a teammate action  — MERGE · S
- Where: `catalog.tsx:391-413`.
- Today: the channels offered are "In app, Email, Slack, Microsoft Teams". In-app has no backing feed (the bell shows only approvals, `AppShell.tsx:206-210`). Slack and Teams share one organization webhook URL (`Organization.NotificationWebhookUrl`), so offering both is misleading.
- Survivor: the channels "Email" and "Team channel" (whatever `/admin/notifications` has), plus "In app" once the notifications feed exists.

### Change stage action  — COMPLETE · S
- Where: `catalog.tsx:414-433`.
- Today: the reason defaults to "None" even when the new stage is Rejected. That breaks "keep disposition reasons mandatory".
- Complete means:
  - [ ] The reason is required when the stage is Rejected (a validation problem otherwise).
  - [ ] Stages come from the job's pipeline, or by name across jobs.
  - [ ] Optional "send the rejection email" checkbox using the template.

### Create task action  — REMOVE · S
- Where: `catalog.tsx:434-459`.
- Why: there is no task entity or to-do list anywhere in the product, so the step can never do anything. Bring it back when a tasks feature lands (Cross-area notes). Until then "Alert a teammate" covers it.

### Add tag action  — COMPLETE · S
- Where: `catalog.tsx:460-474`. It writes `Application.Tags` (exists in `Domain/Applications.cs:14`).
- Complete means: tags autocomplete from existing tags, plus a "Remove tag" variant.

### Send to another app (webhook) action  — MERGE · S
- Where: `catalog.tsx:475-503`.
- Survivor: `/admin/webhooks` endpoints. The step picks a configured endpoint, which is signed with its secret and SSRF-guarded (`SsrfGuard.cs`). It does not type a raw URL. The PUT and "What to send" options go: the payload is the standard event payload from `PipelineEvents.PublishApplicationAsync`.

### Step inspector  — COMPLETE · S
- Where: `features/preview/workflows/Inspector.tsx`.
- Today: clean field rendering, placeholder chips that insert at the cursor (`:49-61`), and a Paths list showing what is connected (`:179-203`).
- Complete means:
  - [ ] The email body uses the shared template editor.
  - [ ] Placeholder chips come from the one vocabulary.
  - [ ] Delete step asks for confirmation when the step has outgoing connections.
  - [ ] Fields validate inline (subject required, approver person required when "Specific person").

### Check for problems (validation)  — COMPLETE · S
- Where: `graph.ts:103-161`, `WorkflowEditor.tsx:768-799`.
- Today: good coverage (no trigger, two triggers, edge into trigger, cycle, unconnected branch, orphan steps) with click-to-focus.
- Complete means:
  - [ ] Add rules: Rejected without a reason, fan-out on a plain output, email with an empty subject, approval with no person, step options that reference a deleted stage, job or template.
  - [ ] Run the same rules on the server at publish.

### Test run  — COMPLETE · M
- Where: `WorkflowEditor.tsx:375-460`, `:800-901`, `sample-workflows.ts:327-368`.
- Today:
  - Steps through the path with one of three invented candidates.
  - Placeholders are filled with hard-coded values: "Senior Software Engineer", "Jerick Dayoha", "Tuesday at 10:00" (`:421-434`).
  - An Approve or Reject toggle covers every approval.
- Product critique: Zapier's "Test step" uses a real record. That is what makes people trust automation.
- Complete means:
  - [ ] Pick a real application (`SearchSelect`).
  - [ ] The server dry-run returns the path, every rendered email (subject and body in the real template) and the stage change that would happen.
  - [ ] Per-approval Approve or Reject choice.
  - [ ] "Send test email to me".

### Versions  — COMPLETE · S
- Where: `WorkflowEditor.tsx:541-567`, `MAX_VERSIONS 10`.
- Today: a menu of unnamed saves ("Saved 3 hours ago · 7 steps"). Restore replaces the canvas.
- Complete means:
  - [ ] A draft and a published version. Publish creates the version (with an optional note).
  - [ ] Runs record their version.
  - [ ] The versions panel shows who and when, plus a change summary ("Added Wait, changed email subject").
  - [ ] Restoring loads it as the draft.
  - [ ] No limit of 10 on the server.

### Undo, redo and keyboard shortcuts  — DONE · S
- Where: `WorkflowEditor.tsx:156-187`, `:232-250`.
- Why done: snapshots before every change, typing grouped into one undo step per field, ⌘Z, ⇧⌘Z, ⌘Y and ⌘S that respect text fields, a warning before leaving with unsaved changes (`:251-256`), and a shortcut sheet. Nothing to add.

### Activate, pause and entry rules  — COMPLETE · S
- Where: `WorkflowEditor.tsx:219-230`, `WorkflowList.tsx:50-60`.
- Today: activation needs no problems and saved changes. Nothing defines who enters, how often, or when they leave.
- Complete means:
  - [ ] A Settings tab on the workflow:
    - "Runs once per application" (default) or "every time".
    - "Stop when the candidate is rejected, withdraws or is hired" (default on).
    - "Respect quiet hours" (default on).
    - Job scope.
  - [ ] Activating asks "Only new events" (default) or "Also candidates already in this stage (12 now)", showing the count.
  - [ ] Pausing keeps waiting runs paused and resumes them later. Deleting cancels them.

### Run history and logs  — COMPLETE · L
- Where: missing.
- Product critique: without a run log nobody can answer "why did this candidate get that email?". That is the first support ticket every automation product gets. Zapier's Zap history and HubSpot's enrollment history are the bar.
- Complete means:
  - [ ] A "Runs" tab in the editor: `DataTable` of runs (candidate, job, started, status, current step, last error), filtered by status. Failed runs are pinned to the top.
  - [ ] A run detail drawer showing each step with time, branch taken and output (link to the email in the outbox with delivery status, webhook response code).
  - [ ] Retry and Cancel buttons.
  - [ ] The application's activity timeline shows "Workflow 'Rejection follow-up' sent 'Your application…'" with a link to the run.
  - [ ] Failures alert the workflow owner once a day.
- Backend: `WorkflowRun` and `WorkflowStepRun`, plus the run endpoints in the engine.

### Reminders settings (`/admin/reminders`)  — MERGE · S
- Where: `AdminSettings.tsx` section "reminders", `Organization.StaleReminderDays/BookReminderDays/ScorecardReminderDays/MaxReminders/QuietHours*`.
- Survivor: the built-in workflows. The page stays as the friendly front for them: each reminder shows a switch, "after N days", "up to N times" and "Customize in Workflows →". The values move from `Organization` columns to those workflows' step values. Quiet hours stay organization-wide.

### `WorkflowNode` component  — MERGE · S
- Where: `components/workflow/WorkflowNode.tsx` (75 lines). It is used only by the design gallery (`features/design-system/Gallery.tsx:1272`).
- Survivor: `StepNodeView` (`catalog.tsx:556-603`), moved to `components/workflow/StepNode.tsx`, with the gallery rendering it inside a small read-only `ReactFlow`. Delete `WorkflowNode` and `WorkflowArrow`. Today there are two looks for one thing.

### Reports area shell and navigation  — COMPLETE · S
- Where: `features/reports/ReportsShell.tsx`, `app/(workspace)/reports/layout.tsx`.
- Today: a grouped second sidebar (Pipeline, Speed, Sources, Team, Custom, Saved views). The 403 state is handled (`:52-64`).
- Design critique:
  - Below `lg` the nav becomes a native `<select>` that looks unstyled next to everything else (phone screenshots). This is a shared `SectionNav` issue.
  - The "Report builder" link carries a Preview badge in the nav and again on the page and the overview card.
- Complete means:
  - [ ] Groups become Pipeline (Funnel, Velocity, Rejection reasons), Speed (Time to hire), Sources (Source quality, AI fit), Team (Interviewers, Offers), People (Hires).
  - [ ] "Saved views" and "Shared with me" groups.
  - [ ] Styled mobile picker (cross-area).
- Backend: catalog additions below.

### Reports overview (`/reports`)  — COMPLETE · M
- Where: `features/reports/ReportsOverview.tsx`.
- Today:
  - Four headline stat cards. Each runs a full report query (`:17-31`) just to read one stat.
  - Labels truncate at 1440: "Applicati…", "Average …", "Scorecar…". The hint is the report title and wraps to 3 lines (`:26`).
  - Below them, link lists repeat the left nav exactly.
  - There's no time period, so "57 applications" means "ever".
- Product critique: Ashby and Greenhouse open reports on a dashboard of trend tiles for a chosen period, with change against the previous period.
- Complete means:
  - [ ] Date range control (Last 30 days, Last 90 days, This quarter, This year, Custom).
  - [ ] 4 KPI cards with deltas ("+12% versus previous 30 days"): Applications, Hires, Median days to hire, Offer acceptance. Labels never truncate: drop the report-name hint and put the arrow link in the corner.
  - [ ] A 2×2 grid of mini charts (funnel, hires over time, source quality, interviewer overdue). Each card's header links to its report.
  - [ ] "Pinned views" row for saved views the user pins.
  - [ ] Delete the link-list cards.
- Backend: `GET /reports/overview?from&to` returns KPIs and previous-period values in one query set.

### Report filters (job, source, applied dates)  — COMPLETE · M
- Where: `ReportView.tsx:85-137`, `ReportEndpoints.cs:70-85`.
- Today:
  - Source is a free-text input matched exactly and case-sensitively. "linkedin" returns nothing.
  - The dates are two bare `mm/dd/yyyy` inputs with only aria labels.
  - There is no department or recruiter filter.
  - The applied-date filter is the only time axis, so "hires in Q3" isn't possible: hires are filtered by application date, not hire date.
- Complete means:
  - [ ] Date preset menu plus custom range, labelled "Applied between" or "Hired between" depending on the report.
  - [ ] Job (`SearchSelect`), Department, Source (`FilterSelect` from distinct normalized sources), Recruiter.
  - [ ] Active filters show as removable chips.
  - [ ] Filters stay in the URL (they already do).
- Backend: `department`, `recruiterEmail`, `dateField` (applied or hired) parameters. Compare sources case-insensitively after trimming. `GET /reports/sources` returns the options.

### Hiring funnel report  — COMPLETE · M
- Where: `/reports/funnel`, `ReportEndpoints.cs:169-206`, `components/ui/chart.tsx:273-300`.
- Today: counts reaching each stage (from stage history), conversion from the previous stage, applications over time.
- Design critique:
  - Rainbow bars (blue, violet, green, amber, blue, pale): colour has no meaning here and contradicts the stage colours.
  - 3 stats in a 4-column grid leave a hole (`card.tsx:173`).
  - The details table repeats the chart's numbers without a "%" suffix ("71.9").
  - The table's "Share of applicants" column duplicates the chart's right-hand column.
- Product critique:
  - With "All jobs" it merges stages by *name* across different pipelines and averages their order (`:177-186`). "Review" in one job and "Screen" in another become separate rows.
  - Greenhouse normalizes on stage categories.
  - No drop-off reasons per stage, and no comparison between jobs.
- Complete means:
  - [ ] Single-hue bars (primary), with drop-off shown in the gap.
  - [ ] Normalize by stage kind when several jobs are included.
  - [ ] "Break down by" job, department, source or recruiter, shown as a grouped table of conversion rates.
  - [ ] Click a stage to drill down.
  - [ ] Show top rejection reasons between stages.
  - [ ] Percent columns formatted with "%".
- Backend: `PipelineStage.Kind` (cross-area). `groupBy` parameter. Drill endpoint.

### Time to hire and fill report  — COMPLETE · S
- Where: `ReportEndpoints.cs:208-258`.
- Today:
  - Averages are skewed by one slow hire (`:231`, `:248`).
  - The hire date falls back to `LastActivityAt` when no transition exists (`:230`), which silently changes old numbers whenever someone edits a hired application.
  - No trend over time.
- Complete means:
  - [ ] Median and 75th percentile next to the average.
  - [ ] Monthly trend line of median days to hire.
  - [ ] Breakdown by department and source.
  - [ ] Hires with no recorded hire date are shown as "Hire date unknown" and left out, never guessed.
  - [ ] Drill into hires.

### Time in each stage, becoming Pipeline velocity  — COMPLETE · M
- Where: `ReportEndpoints.cs:260-300`.
- Today: average and longest stay per stage, for stays recorded since stage history started.
- Product critique: velocity is "how fast are we moving people now, and who is stuck". Ashby's pipeline reports show throughput per week and a stuck list.
- Complete means:
  - [ ] Rename to "Pipeline velocity".
  - [ ] Median days in stage.
  - [ ] Moves per week per stage (throughput trend).
  - [ ] Conversion to the next stage.
  - [ ] **"Stuck now"** list: active applications over the organization's stale threshold, grouped by stage, with owner and a "Remind" action that starts the built-in reminder workflow.
- Backend: from `StageTransitions` (exists). Add an index on `StageTransitions(ApplicationId, OccurredAt)` if it is missing.

### Source effectiveness, becoming Source quality  — COMPLETE · M
- Where: `ReportEndpoints.cs:354-384`.
- Today: applications, interviewed, hired, rejected, interview and hire rates per raw Source string.
- Product critique: quality means how far a source's candidates get, not just volume. Gem and Ashby show pass-through to onsite and offer per source, and time to hire per source.
- Complete means:
  - [ ] Columns: Applications, Reached interview %, Reached offer %, Hired %, Median days to hire, Share of hires.
  - [ ] Normalized source names (trimmed, case-folded, with an alias map maintained in the candidates area).
  - [ ] Bubble or bar chart of volume against hire rate.
  - [ ] Drill down.

### Interviewer load and feedback report  — COMPLETE · S
- Where: `ReportEndpoints.cs:302-352`.
- Today: interviews, upcoming, finished, scorecards in, overdue and average hours to submit per interviewer. The query loads every user to map names (`:309`).
- Complete means:
  - [ ] Add "Interviews per week (last 4 weeks)" to show load balance.
  - [ ] Add a recommendation spread per interviewer (share of Yes and No: calibration).
  - [ ] Overdue links to the overdue scorecards with a "Remind" action.
  - [ ] Look up names only for the emails in the result.

### Offer acceptance report  — COMPLETE · M
- Where: missing. The catalog has no offers report (`ReportEndpoints.cs:33-42`), and `OfferStatus` has no Accepted or Declined (`Domain/Offers.cs:3-10`).
- Complete means:
  - [ ] Offers sent, accepted, declined, still waiting.
  - [ ] Acceptance rate.
  - [ ] Median days to respond.
  - [ ] Decline reasons.
  - [ ] Breakdown by department and job.
  - [ ] Trend by month.
  - [ ] Drill into offers.
- Backend: the offers area adds `Accepted` and `Declined`, `RespondedAt` and `DeclineReason` (a candidate-portal button or a recruiter marking it; no e-signature). The report reads those. Until then, a fallback is "Sent then Hired" against "Sent then Rejected or Withdrawn".

### Rejection reasons report  — COMPLETE · S
- Where: missing. `Application.DispositionReason` exists (`Domain/Applications.cs:75`) but nothing reports on it.
- Complete means: reasons by count and share, by stage reached, by job; trend; drill down. It answers "why do we lose people at Onsite?".

### Hires report  — COMPLETE · S
- Where: `ReportEndpoints.cs:430-460`, `ReportView.tsx:259-264`, `report-data.ts:35`.
- Today: a list of hires with contact and job details. The title is "Hires (for payroll and HR hand-off)" (`:41`). The page tells users to "send it to HR and payroll".
- Complete means:
  - [ ] Drop the payroll framing (it pulls us toward payroll, which is out of scope). It's a "Hires" list.
  - [ ] Hire-date filter.
  - [ ] Rows link to the application.
  - [ ] Phone stays in the CSV export but leaves the on-screen table.

### AI fit versus outcome report  — COMPLETE · S
- Where: `ReportEndpoints.cs:386-428`.
- Today: buckets of fit score against interviewed, hired and rejected, with a scatter of fit against stage reached and a small-numbers caveat note. A good differentiator.
- Complete means:
  - [ ] Hide the charts and show only the caveat until there are at least 30 outcomes.
  - [ ] Clicking a scatter dot opens that application.
  - [ ] Breakdown by job, since fit is per job.

### Drill-down from any number  — COMPLETE · M
- Where: missing everywhere. `ReportView.tsx:315-335` renders the table with no `onRowOpen`. `chart.tsx` charts take no click handlers.
- Product critique: in Ashby and Greenhouse every count is a link to the people. Without it, a report can't be acted on.
- Complete means:
  - [ ] Clicking a table row, a funnel bar, a bar or a scatter point opens a `Drawer` listing those applications (candidate, job, stage, dates).
  - [ ] Each row links to the application.
  - [ ] "Export these" button.
- Backend: one generic `GET /reports/applications` that takes the same filters plus `stageName|source|status|interviewer|reason|bucket`, with the same role scoping (`ScopeApplications`). Each report row carries its drill parameters.

### Charts component (`components/ui/chart.tsx`)  — COMPLETE · S
- Today: tokenized Recharts wrappers (Line, Bar, Donut, FunnelBars, Scatter) with a shared tooltip. The donut has animation off. Funnel colours come from the series palette by index (`:290`).
- Complete means:
  - [ ] An `onSelect(datum)` prop on every chart for drill-down.
  - [ ] `ReferenceLine` support (pass mark, target).
  - [ ] Single-tone `FunnelBars` by default.
  - [ ] A comparison series style (dashed previous period).
  - [ ] Wider label column in `FunnelBars` (88px truncates "Final interview").
- Libraries: `recharts@3.10.1` (installed).

### Report export: spreadsheet (CSV)  — DONE · S
- Where: `ReportEndpoints.cs:99-105`, `Csv.Escape` (`ConfigurationEndpoints.cs:668-674`).
- Why done: generated on the server from the same filtered, role-scoped query; formula injection guarded; dated filename; works through the same-origin rewrite with cookies. Only change: move it into an "Export" menu (see the next item).

### Report export: PDF (browser print)  — COMPLETE · S
- Where: `ReportView.tsx:228-236`, print-only filter summary at `:265-268`.
- Today: `window.print()` with nav hidden. Fine for the size. The action row is "Saved views", "Download PDF" and a **primary** "Download spreadsheet (CSV)", so exporting is styled as the page's main job.
- Complete means:
  - [ ] One secondary "Export" menu (Spreadsheet (CSV), PDF).
  - [ ] Print header shows organization name, report, filters and date.
  - [ ] Charts avoid page breaks (already `break-inside-avoid`).
  - [ ] No `@react-pdf` needed.

### Saved views (reports)  — COMPLETE · M
- Where: `ReportView.tsx:342-393` (modal, server `SavedView` per owner, `ConfigurationEndpoints.cs:493-529`), `ReportBuilder.tsx:146-155` (`SavedViews` chips in `localStorage`).
- Today: two systems in one area. Views are private (`OwnerEmail` only, `:497`). There's no rename.
- Product critique: Ashby and Greenhouse let you share a report with the team and pin it to a dashboard.
- Complete means:
  - [ ] One UI: the `SavedViews` chips row under the report header, backed by the server.
  - [ ] Save, rename, delete.
  - [ ] Visibility: Only me or Everyone with report access.
  - [ ] "Shared with me" in the nav.
  - [ ] Pin to the overview.
  - [ ] Copy link (URLs already carry filters).
- Backend: `SavedView.Visibility`, `PinnedByEmails` or a per-user pin table, `PUT /saved-views/{id}`. Shared views are listed for anyone with `Permissions.Reports`.

### Scheduled report emails  — COMPLETE · M
- Where: missing.
- Complete means:
  - [ ] "Email me this" on any saved view: weekly or monthly, day, hour (organization time zone), recipients chosen from workspace members with report access.
  - [ ] The email contains headline stats with deltas and a link. CSV attachment is optional once email attachments exist.
  - [ ] Pause and unsubscribe links.
  - [ ] **Data is rendered as the recipient** (their scope), never the owner, so confidential jobs don't leak.
- Backend: `ReportSubscription` (Id, SavedViewId, OwnerEmail, Recipients[], Frequency, DayOfWeek or DayOfMonth, Hour, NextSendAt, LastSentAt, Paused). A sweep in `EmailOutboxWorker` reuses `EmailTemplates.QueueAsync` with key `report-digest`. The next send time is computed with `TimeZoneInfo` (stdlib).
- Libraries: none. `Cronos@0.13.0` only if custom cron expressions are ever asked for. `ClosedXML@0.105.1` was skipped because CSV opens in Excel.

### Report builder (`/reports/builder`)  — MERGE · M
- Where: `features/reports/ReportBuilder.tsx`, `report-data.ts:95-140`.
- Today:
  - It re-aggregates the rows of standard reports, which are already aggregated (one row per stage, source or interviewer) (`:101-108`). "Hire rate by source" averages one number per source, so it redraws the same data.
  - Only the Hires report has row-level data.
  - The "Calculate" select sits empty and disabled for row counts (screenshot).
  - It talks about "Rows", which is jargon.
  - Views are saved only in `localStorage`.
- Product critique: a real builder (Ashby's) needs a modelled layer over row-level facts, which is XL. Teams of the size we sell to need "the standard report, broken down my way, saved".
- Survivor: the standard report pages. Each gains a "Break down by" select and a chart-type toggle. The builder's four presets become built-in saved views ("Hires by department" is Hires broken down by Department). Delete the route, the nav item and `aggregate()`/`columnKinds()`.

### No report access state  — DONE · S
- Where: `ReportsShell.tsx:52-64`, `Permissions.Reports`, the nav hides Reports without permission (`nav.ts:46-47`).
- Why done: the API enforces it, the nav hides it, and the empty state says who to ask.

## Cross-area notes
- **One email template system** (templates and messages area): server `EmailTemplate` stays the store. Plate becomes its editor with variables and preview. One placeholder vocabulary (pick the server's `{{firstName}}` style and map the others). Workflow steps and assessment invites reference a `templateKey`. Remove `EMAIL_TEMPLATES` in `catalog.tsx:93-110` and the Messages sample templates' syntax.
- **Offers**: add a candidate response (`Accepted`/`Declined`, `RespondedAt`, `DeclineReason`), recorded from a portal button or by the recruiter, with no e-signature. This unblocks the Offer acceptance report and the "Candidate accepts offer" trigger.
- **Pipelines**: add `PipelineStage.Kind` (Applied, Screen, Interview, Offer, Hired, Other), chosen in the pipeline template editor, so funnels across jobs line up.
- **Jobs**: interview plan stages can reference an assessment (`AssessmentId`). Assessment results appear on the application next to scorecards and as a badge on pipeline cards. Add a pipeline bulk action "Send assessment".
- **Candidate portal**: hosts the assessment-taking pages and lists pending assessments on the application page.
- **Candidates and applications**: normalize `Source` (trim, case, alias list). The activity timeline shows workflow runs and assessment events.
- **Notifications**: an in-app notification feed (the bell shows only approvals today, `AppShell.tsx:206-210`) for workflow "Alert a teammate" and failed-run alerts.
- **Tasks**: no task entity exists. The workflow "Create task" step returns only when a to-do list exists, probably on the dashboard.
- **Approvals**: the inbox must show workflow approvals (SubjectType "WorkflowRun") with a link to the run.
- **Settings shell** (`features/admin/AdminShell.tsx:269`, `:308-320`): allow header actions so "Create workflow" sits beside the title. The full-bleed exception for `/admin/workflows/` should also collapse the app sidebar. Reminders and Webhooks pages link to the workflows that use them.
- **Shared UI**: `StatGrid` (`components/ui/card.tsx:173`) should size columns to its children (3 cards leave a hole). `SectionNav`'s mobile `<select>` needs the styled `Select`. `PreviewAlert` and the Preview badge should never both show.
- **Email outbox**: attachments, if scheduled reports should carry the CSV.
- **RBAC** (CASL in the access area, `@casl/ability@7.1.3`, `@casl/react@7.1.0`): this area needs `read Report`, `manage Workflow`, `review AssessmentResult` and `manage Assessment`. Today Workflows is admin-only through `AdminShell`, and Assessments has no permission at all.

## Build order
1. **Automation engine core** (XL): `Workflow`, `WorkflowVersion`, `WorkflowRun` and `WorkflowStepRun`; `WorkflowWorker`; trigger matching inside `PipelineEvents.PublishAsync`; server validation; email, stage, tag, webhook and notify actions writing to existing outboxes. Needs the one-template-store work (cross-area) for the email action.
2. **Built-in workflows replace the three hard-coded reminders**, with `/admin/reminders` as their simple front (S). Customers see it immediately, and it proves the engine on known behaviour.
3. **Workflow list and editor wired to the API**: real lookups, inline status, run history and logs with retry, the server dry-run test (L). Then the full-bleed top-to-bottom editor layout (M). Remove the Create task action and the Offer approval template.
4. **Report drill-down and filters**: the generic `/reports/applications` endpoint, chart `onSelect`, the drawer, the source, department and recruiter filters, and date presets (M). It is the highest value for each day of work in reports.
5. **Reports overview rebuild with period deltas, and the funnel fixes** (single hue, stage kinds once pipelines add `Kind`, breakdown) (M).
6. **New standard reports**: Pipeline velocity with a stuck list (uses the reminder workflow from step 2), Source quality, Rejection reasons (M). Offer acceptance once offers record responses (M, depends on the offers area).
7. **Saved views merged, shared and pinned, then scheduled emails** (M + M). Delete the report builder and move its presets into saved views.
8. **Assessment engine backend**: entities, versions, staff endpoints, server scoring (L).
9. **Candidate-taking experience in the portal** (L), then invites from the application and pipeline with templates, and the built-in reminder workflow (M). Remove webcam, the attempts setting, and the localStorage store.
10. **Assessments home redesign, review screen completion, results question analysis, reopen grading** (M + M + S).
11. **CodeMirror for code questions, real file uploads, integrity timeline** (S + S + M).
12. **External assessment kind**, then provider webhooks per customer demand (S, then L each).

## Progress (wave 1): reports

Finished:
- **Drill-down from any number**: `GET /api/reports/applications` takes the report filters plus `reached`, `stage`, `status`, `reason`, `interviewer`, `overdue`, `stuck`, `interviewed` and `fit`, with the same role scoping. Every stat, table row, bar, point, slice and funnel row carries its drill parameters and opens a drawer that lists the applications (linked), says what they count, and exports them all as CSV.
- **Report filters**: date presets (last 30 or 90 days, this quarter, this year, between dates) resolved in the organization's time zone and labelled "Applied", "Hired" or "Interviewed" by report; job, department, source and recruiter lists from `GET /api/reports/options`; sources match without regard to case or spaces; "Clear filters".
- **Reports overview**: one request (`GET /api/reports/overview`) for four numbers (applications, hires, median days to hire, interviews held) with change against the previous period of the same length, pinned views, and four small charts (funnel, hires with the previous period dashed, interview rate by source, overdue scorecards) that drill down and link to their reports. Labels wrap; nothing truncates.
- **Hiring funnel**: one hue, furthest stage reached, "Left at this stage" and the top reason for leaving, "Break down by" job, department, source or recruiter as a table of conversion rates, percent columns shown with "%". Stage kinds plug in at `ReportEngine.StageKey`.
- **Pipeline velocity** (was Time in each stage; old links redirect): median and average days per stage, moved forward %, moves out per week, a stuck list (the organization's stale threshold) with "Remind recruiters", which emails each recruiter their stuck applications.
- **Source quality** (was Source effectiveness): reached interview, offer and hire %, median days to hire, share of hires.
- **Rejection reasons**: new report by reason, rejected versus withdrew, where people left by stage, trend, breakdown by stage, job, department or source.
- **Time to hire and fill**: median, 75th percentile and average; monthly trend; breakdown by job, department, source, recruiter or month; hire-date filter; hires with no recorded hire date are counted apart, never guessed.
- **Interviewer load and feedback**: interviews per week over the last 4 weeks, median hours to submit, yes and no share, overdue scorecards (24 hours after the interview) with "Send reminders"; names looked up only for the people in the report.
- **Hires**: payroll framing removed, hire-date filter, rows open the application, email and phone stay in the CSV and are hidden on screen until shown, breakdowns (the old builder presets "Hires by department" and "Hires per month" are built-in views).
- **AI fit versus outcome**: charts wait for 30 outcomes, a dot opens its application, breakdown by job.
- **Charts component**: `onSelect` on every chart, `references` (target lines), dashed comparison series, single-hue funnel, wrapped category labels, units on value axes.
- **Saved views (reports)**: one chips row under each report (built-in views plus saved ones), stored on the server, rename, update with current filters, share with everyone or keep private, pin to the overview, copy link, delete; "Saved views" and "Shared with me" in the nav. API under `/api/reports/views`.
- **Scheduled report emails**: weekly or monthly at a day and hour in the organization's time zone, recipients chosen from people with report access, numbers rendered in each recipient's own scope with change against the previous period, sent through the email outbox by `ReportDigestWorker`; `/reports/subscriptions` lists them with pause, change, stop and "Stop sending it to me".
- **Report builder**: deleted (route, nav item, `aggregate()`); `/reports/builder` redirects to the overview.
- **Report export: PDF**: one secondary "Export" menu (spreadsheet or print to PDF); the print view hides the app header and nav and prints the organization, report, filters and date.

Not done:
- Offer acceptance report: waits for the offers area to record responses.
- Stage kinds in the funnel: wave 2 (`StageKey` is the seam).
- "Remind" on stuck applications sends an email to the recruiter; it moves to the built-in reminder workflow when the automation engine lands.
- Chart-type toggle per report and a CSV attachment on scheduled emails (the outbox has no attachments).
- A styled mobile section picker (shared `SectionNav`).

## Progress (wave 2): workflows

Finished:
- **Single automation model**: one server engine. `Workflow`, `WorkflowVersion`, `WorkflowRun`, `WorkflowStepRun` (`Domain/Workflows.cs`, `Data/AtsDbContext.Workflows.cs`). Events are read from what each save changes (`Features/Workflows/WorkflowTriggers.cs`, called from `ChangeInterceptor` next to `WebhookEvents.CollectAsync`), so no endpoint can forget one; the run row is written in the same save as the change. `WorkflowWorker` (`Infrastructure/WorkflowWorker.cs`) claims one due run at a time (atomic `LockedUntil` update), runs steps until a wait or the end, writes each step's effects, log row and the move to the next step in one save (a unique `(RunId, NodeId)` row makes a step happen once), retries a failing step after 1, 5, 30 and 120 minutes then marks the run Failed, re-checks that the application is still open before every step, holds emails and alerts until quiet hours end, and emails the owner (admins for built-ins) once a day about failed runs. Loop guard: a workflow's own changes never start it again, and chains stop 4 workflows deep.
- **Triggers**: new application, moves into a stage, leaves a stage, candidate rejected (reason), interview scheduled, finished, no-show, scorecard submitted (recommendation), offer sent, candidate accepts offer, candidate declines offer, candidate replies, tag added, assessment completed (from `PipelineEvents.PublishAsync("assessment.completed")`: `WorkflowTriggers.Published` queues it on the context and the save starts the run; its score is the "Assessment score" detail in checks); time triggers stuck in a stage (N days with no activity), interview time not picked (N days), feedback overdue (N days after the interview, per interview), assessment not finished (after each assessment's own "remind after" days). Jobs filter by job or team, stages by kind (`StageType`) or by name across jobs, assessments by assessment.
- **Actions**: send email (a built-in automatic email through `EmailTemplates.QueueAsync`, so per-job wording applies, or the step's own subject and message with the `{{firstName}}` details; seam `WorkflowEmails` for the template store), alert a teammate (notification feed through `Notify` with the new `workflow-alert` kind, plain email, or the team channel), change stage (the same follow-ups as a person's move: history, webhooks, actor `workflow:{id}`; never into Hired), reject (reason required, optional rejection email), add tag, remove tag, send to another app (a delivery to a configured webhook, signed and retried by `WebhookWorker`), wait (time or business days, optionally into business hours), yes or no check, split into paths. Create task and Ask for approval are gone.
- **Check for problems**: one rule set on the server (`WorkflowGraph.Validate`), used live by the editor (`POST /api/workflows/check`) and refused at publish: starting step, cycles, orphans, one step per output, reject without reason, email without subject or message, missing recipient, deleted job, stage, template or webhook, bad waits and day counts.
- **Built-in reminders**: booking reminder, scorecard reminder, stuck applications and assessment reminder (one per invite, using `AssessmentFlow.QueueEmailAsync`) are seeded as published built-in workflows (`BuiltInWorkflows.cs`) with the organization's old day counts and limit; editable, pausable, not deletable. They stay off until `Workflows:BuiltInReminders` is true (see Not done).
- **Reminders settings**: Settings, Reminders and alerts now shows the three built-ins (on or off, days, most reminders, runs in 30 days, "Change the emails and steps") above Quiet hours and the team channel. Saving a day count publishes a new version with only that change.
- **Workflow list**: real data; "Create workflow" in the header; inline on/off switch (optimistic, with "Open" on failure); columns Workflow with its trigger in words, Status, Last run with a coloured dot, Runs in 30 days, Failed (links to failed runs), Owner, Edited; a Built-in reminders card; Delete only for workflows that never ran, otherwise Archive and Restore; Preview badge and browser store deleted.
- **Create workflow**: a gallery of cards with step icons: Follow up until they reply, Keep strong runners-up, Fast-track referrals, Nudge the team about stuck candidates, Thank candidates after an interview, Start from scratch. The name defaults to the template's. Offer approval template removed.
- **Workflow editor layout and canvas**: full window with its own 56px bar (back, name, on/off, save state, Steps, Runs, Versions, Settings, Check for problems, Test, Publish). Top-to-bottom layout, a "+" on every connector and under every open output that opens a searchable step menu with one line of help per step; triggers only when there is none. Opens at 100% (75% at least) with the start at the top; minimap only past 12 steps; static lines, only the test path moves; attribution hidden; dragging still works; Tidy up. The draft saves itself; Publish makes it live. Phones get a read-only canvas and step details.
- **Step inspector**: closable, resizable side panel; real lookups (jobs, teams, stages, reasons, sources, tags, people, templates, webhooks, custom fields); value inputs that match the detail; plain-English detail chips; the step's problems at the top; delete asks first.
- **Test run**: pick a real application; the server walks the draft with the same step code and saves nothing; each step's outcome, the path taken, and every email as it would read; the path lights up on the canvas.
- **Versions**: each publish keeps a version with who, when, an optional note and a change summary; "Load as draft"; runs record their version; no limit.
- **Activate, pause and entry rules**: Settings tab with once per application or every time (with a limit), stop when the application closes, respect quiet hours. Publishing a "moves into a stage" workflow asks whether to include the candidates already there and shows how many. Pausing keeps waiting runs where they are; archiving stops them.
- **Run history and logs**: Runs tab (failed first, filter by status) and a run drawer with every step's time, path, output, email delivery status and webhook answer, plus Try again and Stop run.
- **`WorkflowNode` component**: replaced by `components/workflow/StepNode.tsx` (`StepCard`, `StepIcon`), used by the editor and the gallery.

Not done:
- **Switch the old reminder loops off.** In `Infrastructure/EmailOutboxWorker.cs` (as of this wave) delete lines 172 to 174 (the calls to `SendStaleRemindersAsync`, `SendBookingRemindersAsync` and `SendScorecardRemindersAsync` in `RunRemindersAsync`) and the three methods at lines 199 to 243, 245 to 304 and 306 to 355. Keep `NotificationSweep.RunAsync`, `InQuietHours` and the approval reminders at line 175 (`SendApprovalRemindersAsync`, `ApprovalPolicy.ReminderDays`): approvals belong to jobs and offers, not to one application, so they stay outside the workflow engine. In `Features/Assessments/AssessmentFlow.cs` delete the `if (sendReminders) { … }` block in `SweepAsync` (lines 268 to 312; keep the expiry part above it) and the `sendReminders` argument (line 338). Then set `Workflows:BuiltInReminders` to true (or change its default in `WorkflowWorker.BuiltInRemindersOn`) and drop the mirror into `Organization.*ReminderDays` in `WorkflowEndpoints.SaveReminderAsync`. Until then the old loops send the reminders, reading the day counts the Reminders page mirrors into the organization.
- Ask for approval step: the approvals inbox and decide flow treat every non-offer approval as a job (`OfferEndpoints.cs`), so a "WorkflowRun" subject would break them.
- Activity timeline entries for workflow steps (candidates area); stage moves and rejections already write activity with the workflow's name.
- "Send test email to me", waits until a date field, and the "Send assessment when moved to a stage" template (needs a "Send assessment" action that creates invites through the assessments area).
- Undo, redo and shortcuts: kept as they were.

## Progress (wave 2): assessments

Finished:
- **Assessments: scope decision**: the lean product is built on the API. The preview store, sample data and Preview badge are gone (`features/preview/assessments`, `AssessmentsPage.tsx`, `sample-assessments.ts` deleted); everything lives in `features/assessments`. No webcam, no proctoring video, no code execution.
- **Assessment engine backend**: `Domain/Assessments.cs` (`Assessment`, `AssessmentVersion`, `AssessmentInvite`, `AssessmentAnswer`, and the `AssessmentContent` JSON with sections and questions), `Data/AtsDbContext.Assessments.cs`, `Features/Assessments/*`. Staff endpoints under `/api` (library, invites, review), scoped like applications (`ScopeApplications`, `CanManage`); interviewers get 403. Candidate endpoints under `/public/assessments` on the portal session cookie with their own rate limit. `AssessmentWorker` submits run-out attempts, expires unopened links and sends the one reminder. Submitting publishes `assessment.completed` through `PipelineEvents`.
- **Auto-scoring**: `AssessmentScoring.cs` scores at submit time and stores per-answer points; optional partial credit on several-answer questions; blank written, code and file answers score 0 with nobody to grade them. `scoring.check.mjs` and `AssessmentScoringTests` check the same cases.
- **Editing an assessment after submissions**: publishing freezes a version only when the content changed; invites keep their version once started (unstarted ones move to the newest version when they start). The detail page shows "unpublished changes" with Publish or Discard, and "N results came from older versions".
- **Decision lock**: scores lock with the decision; only admins reopen, with a required reason; the first decision stays in the activity history and the review page's History card.
- **Candidate-taking experience**: `/candidate-portal/assessments/[id]` inside the portal shell: intro (time, questions, due date, instructions, the checks in plain words), server-timed countdown that survives reloads (server time offset, amber at 5 minutes, auto-submit), section paging with a question strip, autosave per answer (debounced, retries, saves on the way out), mark to check again, review page listing unanswered questions, confirmation, and a thank-you page. Closed and revoked links say what to do next. Pending assessments show on portal Home and on the application page.
- **Code questions**: CodeMirror (`CodeEditor`, loaded on first use) for starter code, answers and the read-only reviewer view, themed from the tokens in light and dark; JavaScript, TypeScript, Python and SQL packs plus a small highlighter for Java, C# and Go. Reviewers can switch to "Changes from the starter code" (line diff).
- **File upload questions**: up to 25 MB, type list per question, content checked by signature, kept with the candidate's files (`Attachment`, kind Other); the review shows PDFs and images inline with a download link.
- **Timer, attempts, expiry, shuffle**: timer and expiry enforced on the server (answers refused after the deadline plus 30 seconds); "Attempts allowed" removed in favour of "Allow a retake" per invite; "Change deadline" sets a new date and extra minutes; shuffles seeded by the invite so the reviewer sees the candidate's order.
- **Integrity checks**: tab switches, full-screen exits and blocked pastes are recorded with times and the question, told to the candidate up front, summarised and shown as a timeline for the reviewer; they never fail anyone.
- **Webcam recording**: removed.
- **Candidate preview**: merged; the builder's "Preview as applicant" renders the same `QuestionInput` as the real page.
- **Invite candidates**: `SendAssessmentModal` for one application or many: published assessments in a `SearchSelect`, due date, personal note, a live preview of the email, and a clear message when someone already has it (with retake as the way). Emails go through the outbox with a one-click portal link (`CandidateLinks.CreateAsync`).
- **Invited tab**: candidate links to the application, Job column, reminders ("Reminded 2 times, last on Nov 3"), Change deadline, Allow a retake, Revoke link before submission and Remove result after it (with confirmation and history), bulk reminders.
- **Reminders for unfinished assessments**: one automatic reminder N days after the invite (a setting per assessment, sent in working hours) plus the manual "Send reminder"; both use the `assessment-reminder` email.
- **Results tab**: score spread with the pass mark as a reference line beside a Question analysis card (percent right, top-half percent right, average reviewer points, very hard or very easy questions flagged); results table with Job, Checks, Decided by and Version.
- **Result review**: header links to the application and shows the job; blind grading option; rubric scoring with quick Not met, Partly met, Met, a points field and a note, saved as you go; time per question; "12 of 28 points so far" while pending; checks timeline; History; other attempts; "Next to review" walks the queue across assessments.
- **Assessments home and library**: four stat cards, one card with To review · Active · Drafts · Archived tabs, search and department filter, `DataTable` with saved column choices, row actions; the starter templates ("Customer support writing", "Frontend take-home") on an empty workspace. "Recent results", "Completion overview", "Needs your attention" and the global "Invite candidates" button are gone.
- **Library lifecycle actions**: publish runs the server's checks and lists problems; archive confirms when links are open; restore returns to Drafts; duplicate makes new ids and opens the copy in the builder.
- **Builder wizard**: three steps (Details, Questions, Settings and publish), "Save draft" works at any time and creates the row on the server, problems listed on the last step instead of blocking, instructions in the Plate editor, department from the jobs, Type removed, unit suffixes, correct plurals.
- **Question editor**: one line per question until opened, Plate prompts (code blocks by Markdown or paste), radio or checkbox correct marker by type, partial credit switch, undo from the toast after removing a question or section, confirmation before removing a section with questions, "Copy from another assessment".
- **External assessment**: kind External with provider name and a link that fills in {{email}}, {{firstName}}, {{lastName}}; the invite email carries the link; the portal page opens it and records that it was opened; the reviewer types the score, attaches the report and records the decision.
- **Assessment type and department lists**: departments come from jobs (`GET /api/assessments/options`); Type removed.
- **Browser-only preview store and Preview alerts**: removed, with the Preview flag on the nav item.

Not done:
- **Assessment linked to job and pipeline stage**: needs `RequisitionStage.AssessmentId` and the pipeline card badge (jobs area). The bulk "Send assessment" is ready as `SendAssessmentModal` with `applicationIds`.
- The `assessment-invite` and `assessment-reminder` texts live in `AssessmentFlow.Fallback` until the template store lists those keys; `AssessmentFlow.QueueEmailAsync` switches to `EmailTemplates` by itself once `EmailTemplates.Defaults` has them.
- Provider webhooks for External results (`POST /public/assessment-providers/{provider}/webhook`): per customer request; `PUT /api/assessment-invites/{id}/result` is the field they fill.
- Images inside prompts (the editor kit has no image upload yet).

## Progress (wave 2): reports

Finished:
- **Hiring funnel**, **Time in each stage, becoming Pipeline velocity**, **Reports overview** and **Rejection reasons**: stages add up by type when several jobs are in a report ("Onsite" and "Panel" both count as Interview), in the order Applied, Screening, Interview, Other, Offer, Hired. A combined funnel leaves Other stages out because they mean something different in each pipeline. With one job picked, the report keeps that job's own stage names and order. `ReportEngine.StageKey` decides this once, so drill-down keys (`reached`, `stage`) match whatever the report shows. Stage charts say when stages are combined. In velocity, moving between two stages of the same type counts as one stay; the stuck list still shows days in the named stage.
- **Drill-down from any number**: the drawer's stage badges get the stage's type and colour.
- **Offer acceptance report** (new, `/reports/offers`, in Team): offers sent, acceptance rate (accepted out of answered), median days to answer, waiting, expired (unanswered after the last day to accept) and withdrawn; a donut of what happened to each offer, decline reasons, sent and accepted per week or month; one row per offer that opens the application; break down by job, department, recruiter or month, with revisions counted. Every number drills down (`offer=sent|accepted|declined|waiting|expired|withdrawn`, `declineReason`), filtered by the day the offer was sent.
- **Source quality**: "Reached offer" now means an offer was sent (or they were hired), read from the offers; drafts and offers waiting for approval no longer count.
- **Reports overview**: the fourth number is now Offer acceptance (as this review planned), with its change against the previous period shown in points. Report emails also describe a rate's change in points.
- **Interviewer load and feedback** and **Pipeline velocity** reminders: "Send reminders" uses the evaluation area's scorecard reminder (candidate name and a link to the form), and "Remind recruiters" uses the standard team email (`notification`), so no email goes out with unfilled details. `/reports/stuck`, where the "applications have gone quiet" notification points, opens Pipeline velocity.
- Report tables on a phone scroll sideways instead of squeezing dates and words; the row count under a table uses the same word as above it ("8 offers", not "8 candidates"). A funnel counts every hire as reaching Hired, even an old record whose stage was never moved.

Not done:
- Report emails still have no spreadsheet attachment (the outbox has no attachments).
- A styled mobile section picker (shared `SectionNav`).

## Progress (wave 4): workflows

Finished:
- **Ask for approval step** (`action.approval`): approvers (the job's recruiter, its hiring manager, or named admins, recruiters and hiring managers), how they decide (everyone, everyone in order, any one) and what to approve, with details such as `{{candidateName}}`. The run waits with no clock. Approvers get the usual approval email with one-click links, reminders, escalation and the Approvals list. Approved goes down the Approved path; a rejection (its reason is in the run log) or a withdrawn request goes down Not approved. A test run takes the Approved path and asks nobody. A run that stops (Stop run, archived, application closed) takes its request out of the approvers' lists within a minute (`WorkflowEngine.CloseStaleApprovalsAsync` in the worker's sweep).
- **Approval engine, third subject `WorkflowRun`**: rounds, order, reminders, escalation and reassigning are the engine's own. A decision only wakes the run; the engine then reads the round's outcome, so the decision and the path never disagree. The workflow part lives in `Features/Workflows/WorkflowApprovals.cs`, a part of the same `AtsEndpoints` class (`RequestWorkflowApprovalAsync`, `WorkflowApprovalOutcomeAsync`, `ApplyWorkflowDecisionAsync`, `WorkflowApprovalItemAsync`). The exact edits in `Features/Offers/ApprovalEndpoints.cs` (candidates plus jobs builder's file), job and offer behaviour unchanged:
  1. Withdraw endpoint, before the job branch: `else if (request.SubjectType == WorkflowRunSubject) await WakeWorkflowRunAsync(db, request.SubjectId, ct);`
  2. `ApprovalLabelAsync`, before the job lookup: `if (approval.SubjectType == WorkflowRunSubject) return approval.Note ?? "a workflow step";`
  3. `ApplyDecisionAsync`, first statement: `if (decided.SubjectType == WorkflowRunSubject) return await ApplyWorkflowDecisionAsync(db, all, decided, actorEmail, ct);`
  4. `ApprovalItemsAsync`, between the offer and job branches: `else if (row.SubjectType == WorkflowRunSubject) { if (await WorkflowApprovalItemAsync(db, row.SubjectId, ct) is not { } run) continue; (title, detail, subjectStatus, var appId, summary) = run; applicationId = appId; }`
  5. `EscalateApprovalAsync`: the requester is told only when `RequestedBy` is an email (`row.RequestedBy.Contains('@') ? row.RequestedBy : null`), because a workflow's request names the workflow ("Workflow: Fast lane").
- **Approvals UI** (candidates plus jobs builder's files), one line each: `approval-data.ts` adds `'WorkflowRun'` to `type`; `ApprovalDetail.tsx` labels it "Workflow step", opens the application (not its Offer tab), and shows the candidate summary for every subject that is not a job; `ApprovalLinkPage.tsx` the same for the email-link page. The item reads: the candidate's name, "Job (code) · Workflow: name", the question as the note, and the candidate summary with scorecards.
- **Workflow steps in the activity timelines**: every step that acts writes one `WorkflowStep` audit row on the application (`Features/Workflows/WorkflowActivity.cs`): "Workflow: {name} · {step}", what it did, and a link to the run (`/settings/workflows/{id}?tab=runs&run={runId}` opens the run drawer). Workflow stage moves and rejections no longer write a second "StageChanged" row. The candidate feed merges them with one call in `CandidateActivityEndpoints.cs` (`WorkflowActivity.MergeAsync`): the step's own stage move or email is replaced by the step's row (keeping the email's delivery status), so each thing shows once; the run link goes to admins only; email, alert and webhook rows follow the feed's contact-detail rule; old rows no longer show a "workflow:…" actor.
- **UI lines still needed in other areas' files** (the server data is in place):
  - `features/applications/ApplicationHistory.tsx` (offers builder): in the audit map, after `body: event.actorEmail,` add `...(workflowStepRow(event) ?? {}),` with `import { workflowStepRow } from '@/components/workflow/workflow-activity';`. Until then the row reads "Workflow step" with a "workflow:…" line.
  - `features/candidates/CandidateActivity.tsx` (candidates builder): add `runHref?: string | null` to `data`, `workflow: Workflow` (lucide) to `ICONS`, and in `EventRow` after the Messages link `{item.data?.runHref && <Link href={item.data.runHref} className="text-accent-foreground hover:underline">See the run</Link>}`. Until then the rows show with the default icon and no run link.
- **Send a test email to me**: email steps have the button under the message (`POST /api/workflows/{id}/test-email`). The step's email, filled with the newest active application's details, goes only to you with the subject "Test: …"; the toast names whose details it used. Nothing else is kept.
- **Wait until a date**: the Wait step is "For a set time" or "Until a date": interview time (the run's interview, else the next one booked), offer expiry, offer start date, assessment due date, or any custom date field, with a time before or after. When the run wakes it looks again, so a moved interview moves the wait. No such date skips the step; a time already passed goes straight on. New gallery template "Remind candidates the day before".
- **Send assessment step** (`action.send_assessment`): the same invite and email as the Send assessment button, through the assessments area's `CreateInviteAsync` (now `internal`, taking who invites as text; its three callers pass `principal.Email()`). Anyone who already has it open or took it is skipped; a deleted or unpublished assessment is a problem in Check for problems and fails the step with a plain reason. It can also send "the assessment set on the stage they entered" (`PipelineStage.AssessmentId`, from the event's stage): stages without one are skipped, and an application never gets the same assessment twice.
- **Built-in workflow "Send the stage's assessment when someone enters the stage"** (`BuiltInWorkflows.StageAssessment`): moves into any stage, then sends the stage's assessment. It is added paused (off until the organization turns it on in the Workflows list's "Built-in workflows" card, renamed from "Built-in reminders"), has no run limit (the step avoids repeats), and is not listed on the Reminders page (`Definition.Reminder`, `StartsOff`, `NoLimit`).
- Editor: a select whose choice is empty ("Write my own" email) now shows it instead of "Choose one". The runs list says "waiting for an answer" for a run at an approval step.

Not done:
- An interview moved earlier than a date wait's wake time is noticed only at the old wake time. Wake date waits on interview changes if that matters.
- The two UI lines above (not my files).

Tests: `WorkflowEngineTests` 20 of 20 pass. New: an approval step's Approved and Not approved paths, a stopped run leaving the approvers' list, and job and offer approvals deciding through the same engine; workflow steps once in the application history and the candidate feed; a wait until the interview that follows a move; send assessment once, and a test email only to the person asking; the built-in stage assessment starts off, sends the entered stage's assessment, skips a stage without one and never sends it twice.
