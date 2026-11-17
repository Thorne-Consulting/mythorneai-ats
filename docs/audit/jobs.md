# Dashboard, Jobs, Pipeline and Approvals

## Overall

- **The job record is squeezed by two sidebars.** At 1440 the navy sidebar (234px, `components/layout/AppShell.tsx:104`) plus page padding (64px, `AppShell.tsx:126`) plus the job's `SectionNav` (224px + 24px gap, `components/layout/SectionLayout.tsx:130,138`) leave 894px for content. Measured in the running app: the six "Candidates by stage" tiles are **77px wide** ("Intervie", "Offer ha"), and the job's pipeline board shows **3 of 6 columns** (`BoardColumn` is a fixed 260px, `components/pipeline/BoardColumn.tsx:61`). A job has only 9 sub-pages, three of which repeat each other; it does not need a second sidebar. Use underline tabs under the job header and give the 248px back to the board.
- **Every job page with a board throws a React hydration error** (the red "1 Issue" bubble on `desktop-light_jobs_…_pipeline.png`). Cause: `RequisitionShell.tsx:52` calls `useBoard(id)` with no initial data, so the server renders the "Candidates" nav item with no count and the client renders `9` (`RequisitionShell.tsx:80,86`). The job detail payload already carries per-stage counts (`RequisitionEndpoints.cs:103-116`); read the count from there.
- **Say it once is broken across the job record.** The hiring manager and recruiter appear on Overview, Details, Hiring team and Settings. "Key facts" on Overview (`JobOverview.tsx:219-235`) repeats "Job details" on Details (`RequisitionDetails.tsx:48-76`) field for field. "Candidates by stage" and "Funnel" on Overview are the same numbers twice. The Candidates page is the Pipeline page's List view with a different `viewKey`. "Edit team" and "Edit posting" both jump to Settings.
- **What recruiters write is not what candidates see.** The create wizard has a rich editor that says "You can use headings, lists, bold text and quotes" (`CreateRequisitionPage.tsx:285`). But `JobPostingView` (`components/careers/JobPostingView.tsx:31-34,64-69`) and the Details page (`RequisitionDetails.tsx:36-43`) print the raw markdown, so applicants see `## Benefits` and `**bold**`. The editor also has no list plugin, and Settings edits the same text in a plain `Textarea` (`RequisitionSettings.tsx:175`).
- **Stage behaviour hangs on stage names, not stage meaning.** Colour comes from a regex on the name (`components/status.tsx:48-56`), and the stored `PipelineStage.Color` is ignored. Booking an interview moves the candidate to a stage literally named "Booked" (`PublicInterviewBookingEndpoints.cs:227-229`). Hiring looks for "Hired" (`OfferEndpoints.cs` `FindHiredStageAsync`). The dashboard adds up stages from different pipelines by name (`DashboardEndpoints.cs:56-66`). Every drag on the board also emails the candidate the internal stage name, for example "Your application has moved to: Offer handoff" (`ApplicationEndpoints.cs:442`, `EmailTemplates.cs:21-25`).
- **People are email strings, not users.** `Requisition.OwnerEmail`, `RecruiterEmail` and `ViewerEmails` are free text (`Domain/Requisitions.cs:13-14,23`). Names are guessed from the email (`requisition-data.tsx:43-50`), so the jobs table shows "Manager" and the team card shows "Recruiter / Recruiter". Settings accepts any typed address (`RequisitionSettings.tsx:121-125,162-171`).

**Target experience.** A job is one record. A compact header holds the title, status, the next action (Open job, Submit for approval, or Find candidates) and a ••• menu. Under it sit underline tabs: Overview · Pipeline · Posting · Requirements · Interview kits · Team · Settings. The pipeline board fills the width and works with mouse, touch and keyboard. A card shows real time-in-stage, and the ••• menu has Move, Reject and Email. Stages have a type (screen, interview, offer, hired), so colours, automation, candidate-facing labels and cross-job dashboards all work without name tricks. The posting is written once in one rich editor, rendered the same everywhere, and edited in place on the Posting tab. Approvals keep their history, remind people, and can be decided from the email. The dashboard answers "what needs me today" (My work) and "how is hiring going" (Team), with no empty card space.

## Features

### Team dashboard grid and layout — COMPLETE · M

- Where: `/`, `features/dashboard/DashboardPage.tsx:132-252`, `widget-layout.ts`, `GET /api/dashboard` (`Features/Dashboard/DashboardEndpoints.cs`).
- Today: a 3-column grid of widgets in a fixed per-role order (`widget-layout.ts:17-32`). Spans are hard-coded (`DashboardPage.tsx:98-107`). It works end to end on real data.
- Design critique: "Hiring pipeline" (span 2) shares a row with "Candidate sources" (span 1, about 380px tall). The pipeline card stretches to match and leaves a ~200px empty block under five 118px tiles (`desktop-light_.png`, y 800-1010). "Coming up" leaves the same kind of gap next to "Recent candidates". The header packs the date, Customize and two tabs, but "My work (7)" vs "Team" is the main choice on the page and reads as small 13px tab text. On phone the Recent candidates table scrolls sideways and cuts off "Last activity", and the pipeline tiles show 2.5 of 5.
- Product critique: Greenhouse and Ashby homes lead with "My tasks", then pipeline health per job, then team activity. Here the Team tab leads with vanity totals and puts "Waiting on you" last for admins (`widget-layout.ts:29`).
- Complete means:
  - [ ] Set `items-start` on the grid, or pair widgets by height (pipeline with stats as a full row; sources with upcoming as one-thirds), so no card stretches.
  - [ ] Admin default order puts "Waiting on you" second.
  - [ ] Phone: Recent candidates becomes a stacked list (name, job, stage badge), not a table. Pipeline tiles become a vertical list with bars.
  - [ ] One period control (7 days, 30 days, quarter) in the header, shared by stats, sources and pipeline.
- Backend: `period` query parameter on `/api/dashboard`.
- Libraries: none.

### Key numbers (stat cards) — COMPLETE · S

- Where: `DashboardPage.tsx:422-458`, `DashboardEndpoints.cs:30-54`.
- Today: Open jobs, Active candidates, Interviews in the next 7 days, and "Hires" with the hint "On open jobs" (`DashboardPage.tsx:449-455`).
- Design critique: "Hires · 1 · On open jobs" undercounts on purpose: a job that is filled drops out. "Interviews schedul…" truncates at 1440.
- Product critique: customers judge an ATS dashboard by trend, not totals. Ashby shows each number against the previous period.
- Complete means:
  - [ ] "Hires" counts hires this period from `StageTransitions` with `ToStatus = Hired`, across all jobs.
  - [ ] Each card shows the change against the previous period.
  - [ ] Shorten the label to "Interviews" with the hint "Next 7 days".
- Backend: hires and previous-period counts in `/api/dashboard` from `StageTransitions` (already written by `PipelineEvents.RecordMove`).
- Libraries: none.

### Finish setting up checklist — COMPLETE · S

- Where: `DashboardPage.tsx:460-503`, `GET /api/admin/setup-checklist` (`ConfigurationEndpoints.cs:~340-360`).
- Today: works and links to the right settings pages.
- Design critique: steps say "Add the email sending key and sender address to the server" and "Add the OpenAI key to the server". A customer admin cannot do that. You cannot dismiss it, so it stays until all 8 steps are done.
- Complete means:
  - [ ] Every step leads to an in-product form. If a step needs us (keys), the copy says "Contact support to turn this on", or the step is hidden for hosted customers.
  - [ ] "Hide for now" stored per user.
  - [ ] Collapsed to a one-line progress bar once 6 of 8 are done.
- Backend: per-user dismissed flag (see "Customize" below for the preferences column).
- Libraries: none.

### Hiring pipeline widget — COMPLETE · M

- Where: `DashboardPage.tsx:505-539`, `DashboardEndpoints.cs:56-66`.
- Today: groups active applications by stage name across all jobs, including closed jobs.
- Design critique: tiles use generic file icons picked by tone (`stageIcons`, `DashboardPage.tsx:88-95`). "Booked" (gray) comes after "Interview" (blue), so the colour story goes backwards. Tiles are not links.
- Product critique: once a second pipeline exists ("Engineering with technical screen", see `desktop-light_admin_pipelines.png`), the widget shows "Recruiter screen", "Technical screen" and "Panel interview" as extra tiles next to "Interview", with no meaning across jobs. Lever and Ashby roll up by stage type and show conversion between steps.
- Complete means:
  - [ ] Group by stage type (Applied, Screen, Interview, Offer, Hired), only on open jobs.
  - [ ] Show the step-to-step conversion % on the arrows.
  - [ ] Each tile links to `/candidates?stageType=…`.
- Backend: depends on the stage `Type` column (see "Stage model" below).
- Libraries: none.

### Candidate sources widget — COMPLETE · S

- Where: `DashboardPage.tsx:541-569`, `/api/reports/sources`.
- Today: an all-time donut with a legend. It is hidden when the user lacks report access.
- Design critique: "All applications" all-time makes it the same chart forever.
- Complete means:
  - [ ] Follow the dashboard period.
  - [ ] Show "hires" next to "applications" per source, which is the number people actually act on.
- Backend: period and hires in `/api/reports/sources` (Reports area).
- Libraries: Recharts via `@/components/ui/chart` (installed).

### Recent candidates → Activity feed — COMPLETE · M

- Where: `DashboardPage.tsx:571-624`, `DashboardEndpoints.cs:157-169`.
- Today: six applications sorted by last activity, with the stage and "13 min ago". It never says what happened.
- Product critique: Greenhouse "Recent activity" and Ashby home say "Ivy Chen booked a Technical interview" or "Priya moved Casey to Review". That is what a recruiter scans for.
- Complete means:
  - [ ] A feed of the last 20 events: stage moves, rejections, bookings, scorecards submitted, candidate replies, approvals decided. Each line has actor, verb, object, job and time.
  - [ ] Filter: My jobs or All.
  - [ ] Click goes to the application.
- Backend: `GET /api/activity?scope=mine|all&take=20`, built from `StageTransitions` plus `AuditEntries`, scoped with `ScopeApplications`.
- Libraries: none.

### Coming up (team interviews) — COMPLETE · S

- Where: `DashboardPage.tsx:399-408,680-713`.
- Today: the next 5 scheduled interviews in scope.
- Design critique: the card stretches to the row height with 2 items and ~180px of blank space. There are no interviewer avatars and no meeting link. "15 Sun" is a strange date label (`dayLabel`, `DashboardPage.tsx:773-781`).
- Complete means:
  - [ ] Group under Today, Tomorrow and dated days ("Sun, Nov 15").
  - [ ] Interviewer avatars and a "Join" button when a meeting link exists.
  - [ ] An empty state that links to Interviews.
- Backend: add `InterviewerEmails` and `MeetingUrl` to `UpcomingInterviews` in `/api/dashboard`.
- Libraries: none.

### Open jobs widget — COMPLETE · S

- Where: `DashboardPage.tsx:626-678,783-815`, `DashboardEndpoints.cs:131-156`.
- Today: every open or pending job with a one-hue stage bar.
- Design critique: the bar's segments differ only by opacity (`DashboardPage.tsx:803-808`) and have no legend, so "Booked" and "Offer" cannot be told apart. The list has no limit (12 rows at 1440, more for real customers). Counts flip between "1 new today" and "active", two different units in the same column.
- Complete means:
  - [ ] Show the top 8, sorted by "needs attention" (new applicants not reviewed, stale candidates), then "View all 12 jobs".
  - [ ] The bar uses stage-type tones with a one-line legend.
  - [ ] The right column always shows active candidates; "3 new" becomes a small badge.
- Backend: `NeedsReview` per job (applications in the first stage older than 2 days).
- Libraries: none.

### Waiting on you — COMPLETE · S

- Where: `DashboardPage.tsx:715-771`, `features/notifications/notification-items.ts`.
- Today: approvals, scorecards due, unread candidate messages and stalled applications, merged in the browser. "Done" lives in `localStorage` (`notification-items.ts:94-97`).
- Design critique: the meta lines truncate ("nothing has happen…"), and the action link ("Open") is the same for every stalled row.
- Product critique: dismissing on a laptop does not dismiss on a phone. Ashby tasks sync per user.
- Complete means:
  - [ ] Server-side done and snooze state.
  - [ ] Inline actions for stalled rows: Move, Reject, Nudge.
  - [ ] Approval rows open the approval drawer in place instead of `/approvals`.
- Backend: owned by the Notifications reviewer (see cross-area notes).
- Libraries: none.

### Customize dashboard — COMPLETE · S

- Where: `DashboardPage.tsx:138-143,197-249`, `widget-layout.ts`.
- Today: show, hide and reorder with up and down arrows, saved in `localStorage` per role.
- Design critique: arrow buttons on 8 rows work but feel clumsy. "Only this browser remembers your choice" admits the gap in the copy.
- Complete means:
  - [ ] Saved per user on the server.
  - [ ] Drag to reorder, with the arrows kept for keyboard users.
- Backend: `AppUser.PreferencesJson` (jsonb) with `GET/PUT /api/me/preferences`. Reuse it for saved views and setup dismissals.
- Libraries: `@dnd-kit/sortable@10.0.0` (shared with the board work below).

### My work tab — COMPLETE · S

- Where: `DashboardPage.tsx:254-374`.
- Today: four stat cards, Waiting on you, My interviews and My jobs. Interviews are fetched again and filtered in the browser by email (`DashboardPage.tsx:263-276`).
- Design critique: "Waiting on you" appears as a stat card and as a list right under it, so it is said twice. Remove the stat card.
- Complete means:
  - [ ] Three stat cards (Feedback to submit, My interviews, My open jobs).
  - [ ] "Waiting on you" is the main list.
  - [ ] Interviews come filtered from the server (`/api/interviews?mine=true`).
- Backend: `mine` filter on `/api/interviews`.
- Libraries: none.

### Interviewer home — COMPLETE · S

- Where: `features/dashboard/InterviewerHome.tsx`.
- Today: next interview with Prepare, feedback due with Write scorecard, and a "Later" list. Good shape for the once-a-month user.
- Product critique: Greenhouse and Ashby show "Join" and the interview kit right on the card.
- Complete means:
  - [ ] Join button when a meeting link exists.
  - [ ] Kit name and duration on the next interview.
  - [ ] Time shown in the interviewer's time zone with a label.
- Backend: `MeetingUrl` and kit name in `UpcomingInterviews`.
- Libraries: none.

### Jobs list (table) — COMPLETE · M

- Where: `/jobs`, `features/requisitions/RequisitionsPage.tsx:209-340,482-521`, `GET /api/requisitions`.
- Today: sortable, column choice, density, CSV export, row ••• menu (Open, Edit, Change status), 10 per page. All jobs load at once in the browser.
- Design critique (`desktop-light_jobs.png`):
  - The filter card has three rows: view pills with Table|Board; search with 2 filters; then a row holding only the columns, density and Export buttons (y 434-472). Put search, filters, columns, density and Export on one row and save about 50px.
  - "Applicants" numbers are blue (`RequisitionsPage.tsx:252`) and look like links but are not.
  - "Updated: 26 days ago" on 10 of 11 rows tells nothing.
  - "Hiring manager: Manager" comes from guessing a name from the email.
  - Phone: the status column is off screen (`phone-light_jobs.png`). Rows should become cards with title, status badge and counts.
- Product critique: Greenhouse and Ashby job lists show the pipeline per job (counts by stage or a mini bar), days open, and new applicants to review. That is the reason to open the list.
- Complete means:
  - [ ] Columns: Job (title, team, ID) · Pipeline (stage bar, the same component as the dashboard) · New (unreviewed) · Days open · Hiring manager (avatar and name from the user record) · Status.
  - [ ] "Updated" hidden by default.
  - [ ] Row hover shows quick actions (Pipeline, Posting).
  - [ ] Phone: card rows below `sm`.
  - [ ] Applicant count links to the job's pipeline.
- Backend: add `OpenedAt`, per-stage counts and an unreviewed count to `GET /api/requisitions`. Paginate on the server once a customer passes ~200 jobs (`skip`/`take`; the table already pages in the browser).
- Libraries: none (`DataTable` already covers it).

### Jobs stat cards — MERGE · S

- Where: `RequisitionsPage.tsx:411-439`.
- Today: Open 9, Active applications 43, Draft 1, Filled 1. They cannot be clicked (no `href`), and on phone they stack into ~470px before the list.
- Verdict: MERGE into the saved-view pills, with counts on the pills ("Open 9 · Drafts and approval 1 · On hold 1 · Closed 1"). "Active applications" moves to the dashboard, which already has it. This frees about 130px at 1440 and a whole screen on phone.

### Saved views and filters — COMPLETE · S

- Where: `RequisitionsPage.tsx:63-94,342-363,443-452`, `components/data-table/SavedViews.tsx:28`.
- Today: built-in views plus personal views in `localStorage`; filters for department and location (free-text values, so "Engineering" and "engineering" split).
- Complete means:
  - [ ] Counts on each built-in view.
  - [ ] Filters for hiring manager and recruiter (`SearchSelect`).
  - [ ] Views saved per user on the server, optionally shared with the team.
- Backend: preferences column (above). A shared view needs a `SavedView` table (Owner, Scope, StateJson); that is a shared-component change.
- Libraries: none.

### Bulk status change — COMPLETE · S

- Where: `RequisitionsPage.tsx:155-194,499-520`, `job-status.ts`.
- Today: one PATCH per job, with skipped jobs explained in the toast. No confirmation, even for Closed or Cancelled.
- Complete means:
  - [ ] Closing or cancelling shows a `ConfirmDialog` with a required reason and the choice "Reject the N active candidates with this reason and email" or "Keep them".
  - [ ] Bulk "Duplicate" and "Change hiring manager".
- Backend: see "Job status lifecycle".
- Libraries: none.

### Jobs status board (kanban by status) — REMOVE · S

- Where: `RequisitionsPage.tsx:453-461,529-603`.
- Why: jobs do not flow left to right the way candidates do, and the board makes the riskiest action (closing a job) a careless drag with no reason and no undo (`RequisitionsPage.tsx:556-563`). The table with status views does the job better. Remove the Table|Board toggle and `JobBoard`.

### Create job wizard — COMPLETE · L

- Where: `/jobs/new`, `features/requisitions/CreateRequisitionPage.tsx`, `POST /api/requisitions` (`RequisitionEndpoints.cs:383-461`).
- Today: 6 steps (Basics, Description, Requirements, Pipeline, Hiring team, Review) with a live posting preview. It saves as Draft.
- Design critique (`desktop-light_jobs_new.png`):
  - The step rail repeats each step's title and description, and the step card repeats them again ("Step 1 of 6 / Basics / Title, team and where it is based").
  - "Back" shows on step 1.
  - The preview card shows "No description has been added yet" in 18px grey, the loudest text on the page.
- Bugs:
  - Picking a posting template puts only the "Role description" section in the editor (`CreateRequisitionPage.tsx:274-281`). The server then adds the template's header and benefits around it (`RequisitionEndpoints.cs:411-415`). So the preview and the Review step show a different posting from the one that gets saved.
  - Picking another template silently overwrites what you typed.
  - Markdown is not rendered in the preview (`JobPostingView.tsx:31-34`).
  - The editor has no lists, although the helper text promises them.
- Product critique: Greenhouse and Ashby job creation asks for compensation range, employment details, department and office from managed lists, the interview plan and the hiring team as real users. They also offer "Start from an existing job".
- Complete means:
  - [ ] "Start from" picker on step 1: blank, a template, or an existing job (duplicate).
  - [ ] Team and Location use an `Autocomplete` over existing values, so spellings converge.
  - [ ] Optional compensation range (min, max, currency, period) with a "Show on posting" switch.
  - [ ] Description step shows the full composed posting (header, description, benefits) as separate editable blocks. Changing the template asks first.
  - [ ] The preview renders markdown (Plate static renderer).
  - [ ] Requirements use the same bullet editor as the job page, not `TagsInput`.
  - [ ] Hiring team picks users only (`SearchSelect`), with an "Invite someone" link.
  - [ ] Final step offers "Create as draft", plus "Create and open" or "Create and submit for approval".
  - [ ] Draft autosaved to the server after step 1, so leaving does not lose work.
- Backend: `SalaryMin`, `SalaryMax`, `SalaryCurrency`, `SalaryPeriod`, `ShowSalary` on `Requisition` (plain fields, no jurisdiction rules). `POST /api/requisitions/{id}/duplicate`. The create request takes `submitForApproval` and `open` flags. Owner and recruiter as user ids (see Team).
- Libraries: `@platejs/list@53.3.13` and `@platejs/autoformat@53.0.0` (lists and "- " shortcuts in `PlateMarkdownEditor`); `@platejs/link@53.3.5` (links in postings). They fit the installed `platejs@53` line and replace nothing hand-rolled.

### Job record layout (shell and section nav) — COMPLETE · M

- Where: `/jobs/[id]/*`, `features/requisitions/RequisitionShell.tsx`, `components/layout/SectionLayout.tsx`.
- Today: breadcrumbs, title with status, code and meta, Change status and Find candidates, the approval card, then a 224px section nav with 3 groups and 9 items.
- Design critique: the nav math in "Overall". The hydration error (`RequisitionShell.tsx:52,80`). On phone the header stacks title, badge, code chip, meta, two buttons and a native `<select>` (~380px) before any content (`phone-light_jobs_…png`). The "JOB / THE JOB / PEOPLE" group labels add nothing for 7 items.
- Product critique: Greenhouse and Ashby job records use a horizontal tab bar under a compact header. Linear keeps detail views single-column with tabs.
- Complete means:
  - [ ] `LinkTabs` under the header: Overview · Pipeline (count) · Posting · Requirements · Interview kits (count) · Team · Settings. They scroll sideways on phone. `SectionNav` stays for Settings and Reports only.
  - [ ] Candidate count read from `requisition.stages[].count`; fixes the hydration error.
  - [ ] The job title in the breadcrumb is a job switcher (`SearchSelect` of open jobs) that keeps the current tab. This replaces `/pipeline`.
  - [ ] Header: title + status on one line; code, team, location, work mode and "Open 23 days" on the second line; one context-aware primary button (Draft: "Open job" or "Submit for approval"; Open: "Find candidates"; Closed: "Reopen"); a ••• menu (Change status, Duplicate, View on careers site, Copy link).
  - [ ] The approval card becomes a one-line `Alert` with an action that opens a modal. Today it pushes every tab down (`RequisitionShell.tsx:179`, `RequisitionApproval.tsx:81-95`).
- Backend: none.
- Libraries: none.

### Job status lifecycle — COMPLETE · M

- Where: `RequisitionShell.tsx:54-70,147-176`, `job-status.ts`, `PATCH /api/requisitions/{id}/status` (`RequisitionEndpoints.cs:509-563`), `PipelineEvents.OnMovedAsync` (auto Filled).
- Today: seven statuses. Opening is gated by approval. "Reason" exists in the API but the UI always sends `null`. Closing leaves every active candidate active and unanswered. No webhook fires for job events.
- Product critique: Lever and Greenhouse ask why a job closed (filled, budget, on hold, cancelled) and offer to reject or move the open candidates. That is the candidate experience customers are judged on.
- Complete means:
  - [ ] Close, Cancel and On hold open a `ConfirmDialog` with a reason (preset list plus other).
  - [ ] Closing offers "Reject N active candidates with reason X and send the rejection email" or "Leave them". On hold says "Hidden from the careers site".
  - [ ] Draft → Open on a job that was never approved shows "Submit for approval" in place of "Open".
  - [ ] Status history (who, when, why) on Overview.
  - [ ] "Reopen" from Filled or Closed.
- Backend: `ClosedReason` and `ClosedAt` on `Requisition`. The status endpoint requires a reason for Closed, Cancelled and OnHold. `rejectActive: { reason, sendEmail }` reuses `/applications/bulk-stage` logic (`ApplicationEndpoints.cs:90`). Publish `job.opened` and `job.closed` via `PipelineEvents.PublishAsync`.
- Libraries: none.

### Job overview — COMPLETE · M

- Where: `/jobs/[id]`, `features/requisitions/JobOverview.tsx`.
- Today: Candidates by stage, Funnel (active only), Next steps, Hiring team and Key facts.
- Design critique: the 77px stage tiles. Two cards show the same numbers. "Funnel" counts only _active_ people, so "Review 56%" is not a conversion rate. People who were rejected never "reached" anything (`pipeline-stats.ts:17-25`). The right rail repeats the Team and Details pages. Next steps tells you to "Use Change status" instead of giving the button (`JobOverview.tsx:35`).
- Product critique: Ashby's job overview is the job's health page: conversion by stage including rejected, average days in stage, where candidates come from, upcoming interviews, feedback still owed, and days open versus target start.
- Complete means:
  - [ ] One "Pipeline" card: horizontal rows per stage with label, count in stage, and the share who reached the stage (from `StageTransitions`, including rejected). Labels sit on the left, so nothing truncates.
  - [ ] "Health" row: days open, average days to first review, feedback owed (count with link), next interview.
  - [ ] Next steps items carry real buttons (Open job, Submit for approval, Add a kit).
  - [ ] Right rail: Next steps, Upcoming interviews for this job, Sources (top 3). Remove Key facts and the Hiring team card (they live on Posting and Team).
  - [ ] Activity for this job (the dashboard feed filtered to `requisitionId`).
- Backend: `GET /api/requisitions/{id}/stats` (reached per stage from `StageTransitions`, median days in stage, sources, feedback owed).
- Libraries: none.

### Job details page — MERGE · S

- Where: `/jobs/[id]/details`, `RequisitionDetails.tsx:25-80`.
- Verdict: MERGE. "About the role" is already on Posting, the facts are on Overview's Key facts, and the stages are on Overview. Survivor: Posting (description and facts as the posting header) and Overview. Redirect `/details` to `/posting`.

### Job candidates page — MERGE · S

- Where: `/jobs/[id]/candidates`, `JobSections.tsx:48-103`.
- Verdict: MERGE into Pipeline's List view (`PipelineView.tsx:86-95`); it is the same `ApplicantsTable`. The "Candidates" nav count moves to the Pipeline tab. Redirect `/candidates` to `/pipeline?view=list`.

### Job pipeline board and list — COMPLETE · L

- Where: `/jobs/[id]/pipeline`, `features/pipeline/PipelineView.tsx`, `PipelineBoard.tsx`, `StageStrip.tsx`, `ApplicantsTable.tsx`, `components/pipeline/BoardColumn.tsx`, `CandidateCard.tsx`, `GET /api/requisitions/{id}/board`, `PATCH /api/applications/{id}/stage`.
- Today: search, stage chips that filter, Board|List, compact cards, drag or ••• to move, optimistic with rollback. Active candidates only.
- Design critique (`desktop-light_jobs_…_pipeline.png`):
  - 3 of 6 columns are visible, and the 4th is cut mid-word ("Booke").
  - The card footer clock shows `lastActivityAt` but is called `timeInStage` (`PipelineBoard.tsx:137`), so "49 min ago" means "last touched", not "in stage for".
  - Every card shows the same "R" avatar (the job's recruiter, `PipelineBoard.tsx:138`), which is noise.
  - Column headers have no menu (`menu={<span />}`, `PipelineBoard.tsx:120`).
  - The "Hired" column says "Drop a candidate here", but the server always refuses with 409 (`ApplicationEndpoints.cs:426`), so the card jumps there and then back with an error toast. The ••• menu offers "Hired" too (`PipelineBoard.tsx:165-177`).
  - In the List view, Source wraps to two lines ("Career / site"), because `ApplicantsTable.tsx:64` is missing `whitespace-nowrap`.
  - Drag uses HTML5 DnD, which does not work on touch and has no keyboard move.
- Product critique:
  - Lever and Ashby cards show days in stage with a warning colour past the stage target, the average score, who owes feedback, and a reject action.
  - Clicking a card opens a side preview (Ashby, Gem), not a full page change.
  - Board and list both support multi-select with bulk move, reject and email; `/api/applications/bulk-stage` already exists (`ApplicationEndpoints.cs:90`) and is used only by the Candidates list.
  - There is no way to see rejected or withdrawn people for this job.
- Complete means:
  - [ ] Columns use the full width (after the tab change). Columns are 248px, or 220px in compact mode. A sticky column header shows the count and the average days in stage.
  - [ ] Card: name, current title, source chip, score, "4 days in stage" (amber past target, red past 2×), next interview or "Feedback owed by 2". No repeated owner avatar.
  - [ ] Card ••• menu: Move to (only valid stages, Hired hidden), Reject (reason modal with optional email), Send email, Schedule interview, Open.
  - [ ] The Hired column takes no drops. It shows "Hired through an accepted offer".
  - [ ] Click opens a `SplitView` preview (resume, scores, activity) with "Open full application".
  - [ ] Multi-select (shift-click, checkbox on hover) in board and list, with a `SelectionBar` for Move, Reject and Email, through `bulk-stage`.
  - [ ] "Show rejected" toggle adds an Archived lane, or a filter in list view, with the reason.
  - [ ] Keyboard: arrows move focus between cards; `m` opens Move to; `r` opens Reject. Drag works on touch.
  - [ ] Column header menu: Sort by (days in stage, score, applied), Email all in stage.
- Backend:
  - Board payload adds `EnteredStageAt` (last `StageTransition.ToStageId == current`), `ScoreAverage` and `FeedbackOwed`.
  - Add `status=Rejected|Withdrawn` to the board query (or a `GET …/board?include=archived`).
  - Per-stage `TargetDays` (Stage model).
  - Index on `StageTransitions(ApplicationId, CreatedAt)`.
- Libraries:
  - `@dnd-kit/core@6.3.1` and `@dnd-kit/sortable@10.0.0`. They replace the hand-rolled HTML5 DnD in `BoardColumn.tsx:39-59`, `PipelineBoard.tsx:139-146` and `PipelineTemplatesSection.tsx:199-223`. They give touch, a keyboard sensor, screen-reader announcements and auto-scroll at the board edge. The installed `react-dnd@16` (a Plate dependency) has none of these with its HTML5 backend.
  - `@tanstack/react-virtual@3.14.26` for columns over ~100 cards.

### Stage-change candidate emails — COMPLETE · M

- Where: `ApplicationEndpoints.cs:440-455` (every move queues "stage-update"), `EmailTemplates.cs:21-25`.
- Today: every drag, even an accidental one or a move back, emails the candidate "Your application … has moved to: {internal stage name}". The recruiter is never told an email went out and cannot skip it.
- Why it matters: the most visible part of the product is the candidate inbox. Lever, Greenhouse and Ashby send stage emails only when a stage is set up to, show the email before sending, allow "don't send", and delay or batch so moves back and forth send nothing.
- Complete means:
  - [ ] Each stage has a candidate-facing label (for example "Interviewing" for "Panel interview") and "Email candidate on entry: off, ask, always".
  - [ ] "Ask" shows a move dialog with the email preview, editable, plus "Skip email".
  - [ ] Emails queue with a 5-minute delay. A move back inside the window cancels it, and the undo toast says "Email cancelled".
  - [ ] Internal names are never sent.
- Backend: `PipelineStage.CandidateLabel`, `PipelineStage.EmailOnEntry` (enum). `MoveApplicationRequest.SendEmail` and `Message` (Message already exists). `EmailOutboxItem.NotBefore` with cancellation on a reverse move. Remove the unconditional `QueueAsync` at line 441.
- Libraries: none.

### Stage model (types, colours, automation keys) — COMPLETE · M

- Where: `Domain/Requisitions.cs:52-62` (`PipelineStage`), `Domain/Configuration.cs:3-11` (`PipelineTemplate.StageNames`), `components/status.tsx:48-56`, `PublicInterviewBookingEndpoints.cs:227-229`, `OfferEndpoints.cs` `FindHiredStageAsync`, `SeedData.cs:74-91`.
- Today: stages are names. Colour is guessed by regex. `Color` is stored ("indigo", "grape" and other tones that do not exist in the token set) and never read. Automation looks for the words "Booked" and "Hired".
- Complete means:
  - [ ] Each stage has a `Type` (Applied, Screen, Interview, Offer, Hired) that drives colour (`stageTone(type)`), dashboard roll-ups, the booking move (to the first Interview-type stage after the current one, not "Booked") and the hire.
  - [ ] Each stage has `CandidateLabel`, `EmailOnEntry` and `TargetDays`.
  - [ ] Rename the default "Booked" and "Offer handoff" to stages a customer understands ("Interview scheduled", "Offer").
- Backend: migration that adds `Type`, `CandidateLabel`, `EmailOnEntry` and `TargetDays` to `PipelineStage`, backfilled from the name regex. Replace `PipelineTemplate.StageNames string[]` with a `PipelineTemplateStage` table holding the same fields. Drop `Color`.
- Libraries: none.

### Per-job stage editing — COMPLETE · M

- Where: missing. Stages are copied from a template at create time (`RequisitionEndpoints.cs:433-445`) and no endpoint changes them later.
- Product critique: Greenhouse "Interview plan" and Ashby "Interview plan" are edited per job all the time (add a take-home for one role).
- Complete means:
  - [ ] Pipeline tab ••• "Edit stages": add, rename, reorder, set type and target days.
  - [ ] Delete a stage only after choosing where its candidates go.
  - [ ] The Hired stage is fixed.
- Backend: `PUT /api/requisitions/{id}/stages` (whole list with ids). It moves candidates out of removed stages and writes a `StageTransition` for each.
- Libraries: `@dnd-kit/sortable@10.0.0`.

### Requirements — COMPLETE · S

- Where: `/jobs/[id]/requirements`, `RequisitionRequirements.tsx`, `PUT /requisitions/{id}/requirements`, `POST …/requirements/extract` (`AI/RankingEndpoints.cs:110,139`).
- Today: bullet lists that you edit in place, AI draft from the description, minimum years and location. It works.
- Design critique (`desktop-light_jobs_…_requirements.png`): the read view ends with "At least 10 years of experience · 10". The location has no label (`RequisitionRequirements.tsx:168-177`). The card fills 894px with 6 short bullets. Seed data is keyboard mash ("sdsdsd"), which is a demo risk.
- Product critique: the create wizard edits the same data with `TagsInput` chips. Pick one editor. Ashby shows on the pipeline list which requirements each candidate meets.
- Complete means:
  - [ ] The read view says "Based in: Tuscaloosa, AL" and "At least 10 years".
  - [ ] The same bullet editor in the wizard.
  - [ ] A "Meets must-haves" column (x of y) in the pipeline list, from the existing fit scoring (`/requisitions/{id}/fit/{candidateId}`).
- Backend: return per-application must-have matches on the board payload (cached from ranking).
- Libraries: none.

### Job posting page — COMPLETE · M

- Where: `/jobs/[id]/posting`, `JobSections.tsx:196-270`.
- Today: public link with copy and open, a warning when the job is not open, and a preview. "Edit posting" jumps to Settings.
- Design critique (`desktop-light_jobs_…_posting.png`): the link is a raw GUID URL in monospace. The preview's disabled "Apply for this job" looks broken. Markdown is not rendered.
- Product critique: Greenhouse and Ashby edit the posting where you preview it, show a short slug URL, and list where the job is advertised (careers site, Indeed, LinkedIn) with a switch for each.
- Complete means:
  - [ ] Edit in place: the description blocks (Plate), compensation display switch, and application questions (next item) on this tab. Settings no longer edits the description.
  - [ ] Slug URL (`/careers/community-programs-coordinator-prg-008`) with copy, QR and "Open".
  - [ ] "Where it's posted" list: Careers site (status-driven), plus a feed toggle for Indeed and LinkedIn limited listings (XML feed; this belongs to the Careers reviewer).
  - [ ] The preview's apply button is styled as a non-interactive sample, not a disabled control.
- Backend: `Requisition.Slug` (unique, set on open) and `GET /careers/{slug}`.
- Libraries: Plate static render (`components/plate/ui/editor-static.tsx` already exists) in `JobPostingView` and Details. No `react-markdown` needed.

### Application questions — COMPLETE · M

- Where: `Requisition.ApplicationQuestionsMarkdown` (`Domain/Requisitions.cs:16`), set only from a posting template at create time (`RequisitionEndpoints.cs:428`). Parsed by guesswork in `features/careers/questions.ts:20-31`.
- Today: recruiters cannot see or edit a job's questions anywhere. `GET /requisitions/{id}` does not return them. The template starter text "Add any default questions for applicants." is a paragraph not starting with `#`, so `parseQuestions` turns it into a real question on the apply form if the admin leaves it. The template editor cannot make list items (no list plugin), which is the format the parser prefers.
- Product critique: every competitor has a question builder with types and required flags; Greenhouse and Lever add knockout answers.
- Complete means:
  - [ ] A builder on the Posting tab: short text, long text, yes/no, single choice, file upload; required; reorder; "Reject automatically if answer is …" for yes/no and choice.
  - [ ] Template provides a default set.
  - [ ] Answers show on the application.
- Backend: `ApplicationQuestionsJson` (typed list) replaces the markdown. Answers become `AnswersJson`. Migration converts existing markdown with the current parser once. The apply endpoint validates required answers. Knockout sets `Rejected` with the reason "Did not meet a requirement" and sends the rejection template.
- Libraries: `@dnd-kit/sortable@10.0.0` for reorder.

### Hiring team page — MERGE · M

- Where: `/jobs/[id]/team`, `JobSections.tsx:120-193`, plus "People" and "Who can see this job" in `RequisitionSettings.tsx:156-209`.
- Verdict: MERGE into one "Team" tab that is both view and edit. Survivor: the Team tab. What moves: the hiring manager and recruiter pickers and the confidential and viewer controls from Settings.
- Complete means (Team tab):
  - [ ] Members as users, with role (Hiring manager, Recruiter, Coordinator, Sourcer, Can view), avatar and email.
  - [ ] Add with `SearchSelect`; change role inline; remove with a confirm.
  - [ ] Allow more than one hiring manager.
  - [ ] "Confidential job" switch with an explanation.
  - [ ] "Default interviewers" pool, used to pre-fill scheduling (today an `Alert` says interviewers are chosen per interview).
- Backend: `RequisitionMember (RequisitionId, UserId, Role)` replaces `OwnerEmail`, `RecruiterEmail` and `ViewerEmails`. `ScopeRequisitions` and `CanManage` (`Api/AtsEndpointHelpers.cs:15-36`) join on it. Migration maps emails to users. `GET/PUT /api/requisitions/{id}/members`.
- Libraries: `@casl/ability@7.1.3` and `@casl/react@7.1.0` if the RBAC reviewer adopts CASL. `canManageJob` (`requisition-data.tsx:29-36`) then becomes `can('manage', subject('Job', job))`, so the UI and the API rules come from one definition.

### Job settings — COMPLETE · S

- Where: `/jobs/[id]/settings`, `RequisitionSettings.tsx`, `PUT /api/requisitions/{id}`, `PUT /api/requisitions/{id}/settings`.
- Today: auto-save on blur for job fields, people, description, visibility and self-service.
- Design critique (`desktop-light_jobs_…_settings.png`): two save indicators ("Saved" twice, `RequisitionSettings.tsx:136,180`) because two endpoints back one page. "About the role" is a 4-row plain textarea, while creation used a rich editor. People fields accept any typed string.
- Complete means:
  - [ ] After the moves above, Settings holds the job fields (title, team, location, work mode, type, openings, target start, compensation) and candidate self-service. That is it.
  - [ ] One save status for the page.
  - [ ] Team and Location as `Autocomplete` from existing values.
- Backend: none beyond the merges.
- Libraries: none.

### Candidate self-service toggles — DONE · S

- Where: `RequisitionSettings.tsx:210-226`, enforced in `PublicPortalEndpoints.cs`, `PublicInterviewBookingEndpoints.cs` and `PublicCandidateMessagingEndpoints.cs`.
- Why done: two clear switches, saved right away, and honoured by every public endpoint that offers the action. Only the copy needs a touch ("from their portal or the links in our emails" is fine). It moves with Settings.

### Job approval (submit, waiting, rejected) — COMPLETE · M

- Where: `RequisitionApproval.tsx`, `POST /requisitions/{id}/submit-for-approval`, `GET /requisitions/{id}/approval` (`OfferEndpoints.cs:328-392`).
- Today: draft jobs show a full card with the approver picker above every tab. Pending shows a timeline. Rejection shows a red alert with the comment.
- Design critique: the card sits above the tabs and repeats on every sub-page. The rejection alert says "did not approve this job" but does not show _what_ they saw.
- Product critique: Greenhouse shows approval status in the job header and lets the requester "Cancel request" or "Nudge". Ashby keeps every round of the approval history.
- Complete means:
  - [ ] Header status reads "Waiting for approval (1 of 2)" with a popover timeline.
  - [ ] Submit is a header button that opens a modal (approvers, order, note to approvers).
  - [ ] Requester can "Withdraw request" and "Send a reminder".
  - [ ] Every past round stays visible.
- Backend: see "Approval engine".
- Libraries: none.

### Pipeline page (/pipeline) — MERGE · S

- Where: `/pipeline`, `features/pipeline/PipelinePage.tsx`.
- Verdict: MERGE into the job's Pipeline tab. It is the same `PipelineView` with a plain `Select` job picker (long lists should use `SearchSelect` by the UI rules). It shows only Open jobs (`PipelinePage.tsx:27`) and says "Add candidate" for the same link the job page calls "Find candidates". Survivor: `/jobs/[id]/pipeline` with the breadcrumb job switcher. `/pipeline` redirects to the last job the user viewed (preference) or the first open job. The sidebar item stays and points there.
- Removed on 2026-11-16: the sidebar item and `/pipeline` are gone. The item only redirected to one job's board, which Jobs and the breadcrumb job switcher already reach, and a global "Pipeline" that opens one job confused people. `/pipeline` redirects to `/jobs` for old links. The dashboard's Hiring pipeline card links to the active candidates list instead.

### Approvals inbox (/approvals) — COMPLETE · M

- Where: `/approvals`, `features/approvals/ApprovalsPage.tsx`, `ApprovalDetail.tsx`, `ApprovalParts.tsx`, `GET /api/approvals/mine`, `POST /api/approvals/{id}/decide`.
- Today: approvals waiting on me, with tabs by kind, a detail drawer, approve (optional comment) and reject (required reason). Reached only from the bell or the dashboard. The sidebar highlights "Dashboard" on this page by design (`components/layout/nav.ts:29`).
- Design critique (`desktop-light_approvals.png`): all three tabs are subsets of "Waiting on me", so they never show anything else. An approver must leave the page ("Open application" or "Open job") to see what they are approving. The drawer shows only a string like "PRG-008 · Community programs · 1 opening(s)" (`OfferEndpoints.cs` `/approvals/mine`, which also breaks the "(s)" copy rule). `ConfirmModal` (`ApprovalParts.tsx:53-96`) is dead code.
- Product critique: Greenhouse and Ashby show the full subject (job details, or offer terms and candidate summary) in the approval view, keep "Requested by me" and "Done" lists, and let people approve from the email or Slack.
- Complete means:
  - [ ] Tabs: Waiting on me · Requested by me · Done.
  - [ ] Drawer shows the subject inline. For a job: title, team, location, openings, hiring manager, compensation range and the posting summary. For an offer: candidate, job, stage history and scores.
  - [ ] Approve and Reject in the drawer footer (exists).
  - [ ] One-click approve from the email through a signed link, landing on the drawer with the decision pre-selected.
  - [ ] Row shows how long it has waited ("2 days").
  - [ ] Delete `ConfirmModal`.
- Backend:
  - `GET /api/approvals?scope=waiting|requested|done` with the subject summary in one query. `/approvals/mine` does 2-3 queries per row (`OfferEndpoints.cs:410-470`).
  - Signed decision token (Data Protection, 7-day expiry) in the `approval-request` email.
  - The email copy says "Open the ATS" (`EmailTemplates.cs:60`); the UI rules say "MyThorneAI", and it should include the link.
- Libraries: none.

### Approval engine (backend) — COMPLETE · M

- Where: `OfferEndpoints.cs` (`ResolveApproversAsync`, `AddApprovals`, `NotifyEligibleApproversAsync`, `ApplyDecisionAsync`), `Domain/Offers.cs:36-49`.
- Today: parallel or sequential chains, no self-approval, admin defaults added for non-admins, rejection resets the subject to Draft.
- Problems:
  - Resubmitting deletes the previous round (`OfferEndpoints.cs:178,353`), and a rejection deletes the other pending rows (`OfferEndpoints.cs:735`). The history of who rejected what, and why, is gone after one resubmit.
  - No reminders, no escalation, no reassignment when an approver is out or deactivated (the chain sticks forever).
  - The rejection email is built inline, outside the template system.
- Complete means:
  - [ ] Rounds are kept and shown.
  - [ ] Reminder after N days (organization setting), then every N days, up to `MaxReminders`.
  - [ ] Admin or requester can "Replace approver".
  - [ ] Requester can withdraw.
  - [ ] Rejection uses an `approval-rejected` template with a link.
- Backend: `Approval.Round` (int) instead of deleting. `POST /api/approvals/{id}/reassign`. `POST /api/approvals/withdraw?subject=…`. Approval reminders inside `EmailOutboxWorker.RunRemindersAsync` (next to the stale, booking and scorecard reminders, `EmailOutboxWorker.cs:79-215`). Add the `approval-rejected` template default.
- Libraries: none.

### Approval rules (admin) — COMPLETE · M

- Where: `/admin/approvals`, `AdminSettings.tsx:159-220`, `PUT /api/admin/organization`.
- Today: two switches (offers, new jobs), "one at a time", and one list of default approvers for both.
- Design critique (`desktop-light_admin_approvals.png`): the help text says "We ask these people, in this order", but a `MultiSelect` cannot be reordered; the order is the click order. The chips are long ("Morgan Manager (manager@example.test)").
- Product critique: Greenhouse has separate "Approvals to start recruiting" and "Approvals to make an offer" chains per department or office. Ashby adds conditions (department, level, compensation above X).
- Complete means:
  - [ ] Two chains: Opening a job, and Accepting a candidate. Each is an ordered list (drag handle and arrows) with "all at once or in order".
  - [ ] Optional rules "When team is …, use this chain instead".
  - [ ] "Hiring manager of the job" as a dynamic approver.
- Backend: `ApprovalPolicy (SubjectType, Department?, Steps jsonb [{ approver: userId | "hiringManager", sequence }])` replaces `DefaultApproverEmails`, `ApprovalsSequential` and the two `Require*` booleans. `ResolveApproversAsync` picks the policy.
- Libraries: `@dnd-kit/sortable@10.0.0`.

### Hiring pipelines (admin templates) — COMPLETE · M

- Where: `/admin/pipelines`, `features/admin/PipelineTemplatesSection.tsx`, `/api/pipeline-templates`, `/api/admin/pipeline-templates*` (`ConfigurationEndpoints.cs:183-210`).
- Today: list with stage chips, a modal editor (name, reorder by handle or arrows, up to 12, default) and delete with a confirm. It works.
- Design critique (`desktop-light_admin_pipelines.png`): "Set as default" is missing from the ••• menu; you have to open Edit. The stage colours come from the name regex, so "Booked" is grey between two blues.
- Product critique: Ashby and Greenhouse interview plans carry per-stage type, a default interview kit, auto-email and a target duration. "Apply to open jobs" is a common ask.
- Complete means:
  - [ ] Each stage row: name, type, candidate label, email on entry, target days.
  - [ ] ••• menu: Set as default, Duplicate, Delete.
  - [ ] "Used by N jobs".
  - [ ] Optional "Update stages on jobs that use this pipeline" with a preview of moves.
- Backend: `PipelineTemplateStage` table (Stage model). `PipelineTemplateId` on `Requisition` for "Used by". The apply-to-jobs endpoint reuses the per-job stage editing logic.
- Libraries: `@dnd-kit/sortable@10.0.0` replaces the HTML5 drag in `PipelineTemplatesSection.tsx:199-223`.

### Posting templates (list) — COMPLETE · S

- Where: `/admin/templates`, `features/admin/PostingTemplates.tsx`, `GET/POST /api/posting-templates` (`PostingTemplateEndpoints.cs`).
- Today: a list of name and version with a "Ready to use" badge that never changes (`PostingTemplates.tsx:71-73`). Rows cannot be opened, edited, archived or deleted; the API has no GET-by-id, PUT or DELETE. Saving with an existing name makes a new version, but every version stays `IsActive`, so the list and the wizard picker show "Engineering standard · version 1" and "· version 2" side by side.
- Design critique (`desktop-light_admin_templates.png`): the empty state shows two identical "New template" buttons (`PostingTemplates.tsx:43,53`).
- Complete means:
  - [ ] Rows open the editor.
  - [ ] List shows the latest version only, with "Updated by, when" and "Used by N jobs".
  - [ ] ••• menu: Duplicate, Archive.
  - [ ] Version history in the editor, with restore.
  - [ ] Hide the header "New template" when the list is empty.
- Backend: `GET /api/posting-templates/{id}`, `PUT` (new version, previous set `IsActive = false`), `POST …/{id}/archive`. The list query filters to the latest active version per name.
- Libraries: none.

### Posting template editor — COMPLETE · M

- Where: `/admin/templates/new`, `PostingTemplateEditor.tsx`, `lib/markdown-sections.ts`.
- Today: one Plate document whose H1 headings must keep their exact text ("Keep the headings. They tell us where each part goes"). Sections are cut out by heading name. Bold, italic, underline, H1-H3 and quote are available; there are no lists or links.
- Design critique (`desktop-light_admin_templates_new.png`): 5 giant H1s in the editing surface. If an admin renames "Benefits and principles", that section is silently dropped. "Interview stages" is stored (`InterviewStagesMarkdown`) and never used anywhere. "Application questions" feeds the guesswork parser described above.
- Complete means:
  - [ ] Three labelled editors (Company intro, Role description starter, Benefits), no magic headings.
  - [ ] A live preview using `JobPostingView` (same renderer as careers).
  - [ ] Variables `{{company}}` and `{{jobTitle}}` with an insert menu (the Plate combobox is installed).
  - [ ] Default application questions use the question builder.
  - [ ] Remove "Interview stages" (pipelines own that).
- Backend: drop `InterviewStagesMarkdown`. `ApplicationQuestionsJson` on the template.
- Libraries: `@platejs/list@53.3.13`, `@platejs/link@53.3.5`; `@platejs/combobox@53.0.0` (installed) for variables.

## Cross-area notes

- **Shared Plate renderer.** `JobPostingView` (Careers area) must render the markdown the editor writes. Use the Plate static renderer at `components/plate/ui/editor-static.tsx` so careers, posting preview, the wizard and Details all match. Add `@platejs/list` to `components/editor/PlateMarkdownEditor.tsx`, which every template editor shares.
- **`BoardColumn` and `CandidateCard`** (`components/pipeline`) are shared. The dnd-kit move, the real time-in-stage and the removal of the always-on owner avatar change them for every board.
- **`SectionNav` + `SidebarLayout`** stay for Settings and Reports. `src/web/CLAUDE.md` ("Use it when an area has more than ~6 sub-pages") should say record pages (job, candidate) use `LinkTabs`, so this squeeze does not come back.
- **Notifications reviewer:** "Waiting on you" done state is in `localStorage` (`notification-items.ts:94-97`). The same items show in four places (dashboard My work, Team "Waiting on you", `/notifications`, bell popover); approvals add a fifth (`/approvals`). Agree on one server-side inbox model that all of them read.
- **Candidates reviewer:** "Find candidates" and "Add candidate" both go to `/candidates?job=…`. Agree on one label and what it does (search the database and add to this job). `bulk-stage` (`ApplicationEndpoints.cs:90`) should back pipeline bulk actions too.
- **Offers reviewer:** the "Offer handoff" default stage and `FindHiredStageAsync` depend on the stage `Type` change here. Offer approvals share `ApprovalParts.tsx` and the approval engine changes (rounds, reminders, one-click links).
- **RBAC reviewer:** job access is email matching in `ScopeRequisitions` (`Api/AtsEndpointHelpers.cs:15-36`), duplicated in the browser as `canManageJob`. `RequisitionMember` with user ids is the data the CASL rules would read.
- **Admin settings shell:** the Settings section nav has 21 items in 6 groups (`desktop-light_admin_*.png`). Its overload is the Admin reviewer's, but approvals, pipelines and posting templates live there.
- **Seed data:** the demo job's requirements are keyboard mash ("sdsdsd", `desktop-light_jobs_…_requirements.png`), names come from emails ("Recruiter", "Manager"), and seed job codes ("PRG-008") do not match generated ones ("REQ-7KQ2MX", `RequisitionEndpoints.cs:625-642`). Fix the seed before any customer demo and pick one code format.
- **Saved views** (`components/data-table/SavedViews.tsx:28`) are `localStorage` everywhere. A per-user preferences endpoint (proposed above) serves every table.

## Build order

1. **Job record tabs and hydration fix** (M). Replace `SectionNav` with `LinkTabs` on the job record. Merge Details into Posting and Overview, and Candidates into Pipeline. Read the candidate count from `requisition.stages`. Add the breadcrumb job switcher and redirect `/pipeline`. This fixes the 77px tiles, the 3-of-6 board and the error bubble. No dependencies.
2. **Render the posting properly** (S). Plate static renderer in `JobPostingView` and Details; `@platejs/list`, `@platejs/link` and autoformat in the editor; move description editing to the Posting tab. Applicants stop seeing raw markdown.
3. **Stop leaking stage names to candidates** (S, stop-gap). Remove the unconditional `stage-update` queue in `ApplicationEndpoints.cs:441`. Keep rejection emails. Hide Hired as a drop target and menu item. The full per-stage email work comes in step 5.
4. **Stage model** (M). Stage `Type`, `CandidateLabel`, `EmailOnEntry`, `TargetDays`, and `PipelineTemplateStage`. Backfill, then switch colour, booking, hire and dashboard grouping to the type. Rename the default stages. Admin pipelines editor gains the fields. Needed by 5, 6, 10 and 11.
5. **Pipeline board complete** (L, needs 4). dnd-kit with keyboard and touch; time in stage from `StageTransitions`; Reject from the card; move dialog with optional email and an undo window; `SplitView` preview; multi-select with `bulk-stage`; archived lane; per-job stage editing.
6. **Job status lifecycle and job header** (M). Close, cancel and hold reasons; handling of active candidates; context-aware primary action; Duplicate; job webhooks. Remove the jobs status board.
7. **Hiring team as users** (M, coordinate with RBAC). `RequisitionMember` migration; Team tab with editing and confidential access; names from user records everywhere (jobs list, overview, approvals).
8. **Approvals complete** (M). Keep rounds; reminders in `EmailOutboxWorker`; signed one-click email links; Waiting, Requested and Done tabs with the subject inline; withdraw and reassign; then admin chains per subject with ordered approvers (`ApprovalPolicy`).
9. **Create job wizard and templates** (L, needs 2 and 7). Start from template or job; composed preview; managed team and location values; compensation fields; question builder (`ApplicationQuestionsJson`, with Careers); posting template edit, version and archive with labelled sections; drop interview stages text.
10. **Job overview health** (M, needs 4). `GET /requisitions/{id}/stats`; a single pipeline card with true conversion; health row; per-job activity.
11. **Dashboard** (M, needs 4 and the activity endpoint from 10). Roll-up by stage type; activity feed; period control and trends; real hires metric; no stretched cards; server-side layout and setup dismissal; phone list layouts.
12. **Jobs list polish** (S–M, needs 4 and 7). Counts on view pills instead of stat cards; pipeline bar, new and days-open columns; one-row toolbar; phone card rows; hiring manager and recruiter filters; server-side saved views.

## Progress (wave 1)

Finished:

- **Job record layout (shell and section nav)**: the job's `SectionNav` is gone. A compact header (title and status; code, team, location, work mode and "Open N days"; one context-aware button; a ••• menu) sits over underline tabs: Overview · Pipeline (count) · Posting · Requirements · Interview kits (count) · Team · Settings. The candidate count comes from the job payload, which fixes the hydration error. The job title in the breadcrumb is a job switcher that keeps the tab. The approval card is now a one-line alert with a modal.
- **Job details page (merge)**: `/jobs/[id]/details` redirects to Posting. The facts live on the posting header; Created and Updated were dropped.
- **Job candidates page (merge)**: `/jobs/[id]/candidates` redirects to `/jobs/[id]/pipeline?view=list`. The Pipeline tab honours `?view=list|board`.
- **Pipeline page (merge)**: `/pipeline` redirects to `?job=`, else the last job viewed (cookie, if still hiring), else the first open job. With none, a page points to Jobs.
- **Hiring team page (merge)**: one Team tab, view and edit. Change the hiring manager and recruiter in the row (directory pickers by role), give or remove view access (with a confirm), and switch Confidential. Settings no longer has people or visibility.
- **Job settings**: only the job fields and candidate self-service, one save status for the page, Team and Location suggest the values other jobs use.
- **Job posting page**: the description is edited in place with the shared `PlateMarkdownEditor`; the preview renders through `JobPostingView` (now `RichText`); the apply button is a non-interactive sample. Settings no longer edits the description.
- **Jobs status board (remove)**: the Table|Board toggle and `JobBoard` are gone.
- **Jobs stat cards (merge)**: removed; each built-in view pill shows its count.
- **Job status lifecycle**: hold, filled, closed and cancelled open a dialog with preset reasons and Other. The server requires a reason for hold, closed and cancelled. Closing offers "Reject all N" (reason "Position closed", optional rejection email) or "Leave them". `StatusReason` and `ClosedAt` on `Requisition`; reopening clears them. Draft shows "Submit for approval" when the job was never approved. Status history (who, when, why, how many rejected) on Overview from `GET /requisitions/{id}/status-history`. Duplicate (`POST /requisitions/{id}/duplicate`: a draft with the posting, requirements, stages, kits, team and settings). The row menu and bulk change use the same dialog.
- **Jobs list (table)**, parts without users on jobs: one-row toolbar (search, filters, columns, density, export), Candidates column with a stage-coloured `PipelineBar` linking to the pipeline, New (still in the first stage), Days open, Updated hidden by default, phone card rows (`DataTable` `card`), 25 per page. `GET /api/requisitions` now returns `stages`, `newApplications`, `openedAt` and `closedAt`.
- **Job overview**, parts without stage types: one "Candidates by stage" card with labels on the left (no truncation) instead of tiles plus a funnel; Key facts and Hiring team cards removed (they live on Posting and Team); Next steps point to Posting.
- **Job pipeline board and list**, parts without stage types: columns 248px (220px compact), so 4.5 columns show at 1440 instead of 3; no repeated owner avatar; the clock says "Last activity", not time in stage; the Hired column takes no drops and is not in the Move menu (the board payload now sends `isTerminal`); the List view keeps the stage chips on the same row as its column and export tools, shows phone card rows, and Source no longer wraps.
- **Requirements**: the read view says "Based in …".
- **Dashboard**, layout parts: the Team grid no longer stretches cards (`items-start`), "Waiting on you" is second for admins, the stat label is "Interviews", day labels read "Sun, Nov 15", and My work drops the duplicate "Waiting on you" stat card. The Open jobs widget uses the shared `PipelineBar`.

Not done (needs wave 2 or another area):

- Job webhooks (`job.opened`, `job.closed`): left for the one automation engine; the admin event list lives in Administration.
- Stage types, time in stage, dnd-kit board, card reject and preview, multi-select on the board, archived lane, per-job stages, true conversion on Overview, users on jobs (hiring manager names, HM and recruiter filters), approval rounds and tabs, dashboard roll-up and activity feed, slug URLs and the application question builder.

## Progress (wave 2)

Finished:

- **Stage model (types, colours, automation keys)**: `PipelineStage` has `Type` (Applied, Screen, Interview, Offer, Hired, Other), `CandidateLabel`, `EmailOnEntry` (Off, Ask, Always; off by default), `TargetDays`, and a nullable `Color` that overrides the type's colour only when it is one of our tones. Pipelines keep their stages in a `PipelineTemplateStage` table; jobs remember the pipeline they came from (`Requisition.PipelineTemplateId`, for "Used by N jobs"). `Infrastructure/StageRules.cs` holds the lookups (`Hired`, `FirstInterview`, `NextInterview`, `Tone`, `CandidateLabel`, `DefaultLabel`), the default pipelines and the backfill. The backfill runs at startup after the migration (the shared `WorkInProgress` migration is regenerated, so it cannot carry SQL) and only touches rows not done yet: it guesses each old stage's type from its name, writes the candidate label, clears the old rainbow colours, renames "Booked" to "Interview scheduled" and "Offer handoff" to "Offer", and turns old pipeline stage names into stage rows. Default stages: New · Review · Interview · Interview scheduled · Offer · Hired. `components/status.tsx` colours stages by `stageTone(type, color)`, never by name; `StageBadge` takes `type` and `color` (grey without them). Scheduled interviews are blue.
- **Hiring pipelines (admin templates)**: each stage row has name, type, what candidates see, email on entry and target days; drag to reorder (`@dnd-kit/sortable`, mouse, touch and keyboard); the ••• menu has Edit, Make default, Duplicate and Delete; each pipeline says "Used by N jobs". The endpoints moved to `Features/Requisitions/PipelineTemplateEndpoints.cs`.
- **Per-job stage editing**: "Edit stages" on the Pipeline tab: add, rename, reorder, set type, label, email and target days; removing a stage asks where its people go; Hired stays last (`PUT /requisitions/{id}/stages`, which moves people and records a stage change for each).
- **Job pipeline board and list**: `@dnd-kit` drag with mouse, touch and keyboard (Space, arrows jump a column, Space to drop), screen-reader announcements and edge scrolling; arrow keys move between cards, M opens Move, R opens Reject, X selects. Cards show days in stage from `StageTransitions` (amber past the stage's target, red past twice), scorecards owed, rating; the ••• menu has Move to, Reject (the application's reject dialog), Send email, Schedule interview, Open application. Column headers show the average days in stage and a menu to order cards and select everyone in the stage. A move into an "Ask" stage opens the move dialog with the exact email in the stage's candidate wording (editable for one person); "Always" sends it; every move shows Undo for 10 seconds, and the email waits a minute so Undo takes it back (`/stage-emails`, `/stage-emails/cancel`). Clicking a card opens a `SplitView` preview (below `lg` it opens the application). Shift-click or the hover checkbox selects several, in the board or the list; the selection bar moves (`bulk-stage`) or rejects (`/candidates/bulk`, optional email). "Show rejected" adds a Rejected and withdrawn lane with the reason. Columns over 40 cards are virtual (`@tanstack/react-virtual`). The Hired column says "Hired through an accepted offer".
- **Stage-change candidate emails**: the board side (above). Internal names are never sent; the email uses `CandidateLabel`.
- **Hiring team page**: `RequisitionMember` (user, role: hiring manager, recruiter, interviewer, viewer). The Team tab adds people with a picker of accounts and a role, changes roles in the row, removes with a confirm, and keeps at least one hiring manager; Confidential stays on the tab. Members are mirrored into `OwnerEmail`, `RecruiterEmail` and `ViewerEmails` (first hiring manager, first recruiter, everyone else) so other areas keep working; jobs without members get them from those fields at startup; `PUT /requisitions/{id}` still accepts the two emails and swaps that member.
- **Jobs list**: hiring manager and recruiter names come from user records (with an avatar), not guessed from the email.
- **Job overview**: a health row (days open, average days to first review, feedback owed, next interview), one Pipeline table with how many are in each stage now, how many ever reached it (including people rejected later) and the median days there (amber past the target), recent activity for the job, and a rail with next steps, coming interviews, top sources and status history (names from user records, with "All changes" to the activity history for admins). `GET /requisitions/{id}/stats`.
- **Dashboard**: one period control (7, 30, 90 days) for the numbers and sources; Hires counts hires in the period from `StageTransitions` across all jobs, with the change against the period before; the Hiring pipeline rolls up open jobs by stage type with the share who went on to each next step, and becomes a list with bars on phones; Recent candidates became Recent activity (`GET /api/activity?scope=mine|all&requisitionId=`), a list that works on phones; Open jobs shows the top 8 with a stage-type legend and "N new" as a badge. "Write scorecard" links go to the scorecard page.
- **Approvals inbox**: `/approvals?open={id}` opens that approval's details.
- **Job posting page**: the preview is the real public job page (`PostingPreview`, desktop or phone), refreshed after each save.
- **Posting templates (list)**: links point at `/settings/templates`, the header button sits in the settings header and hides when the list is empty, and the "Ready to use" badge that never changed is gone.

Not done:

- Booking still moves people by the name "Booked" (`PublicInterviewBookingEndpoints.cs`, interviews area), so it does nothing on renamed stages until it uses `StageRules.NextInterview`.
- Server-side stage emails for moves made outside the board (application page, bulk moves elsewhere) wait for the application endpoints to call the same logic.
- `ScopeRequisitions` and `CanManage` still read the email fields, so a second hiring manager or recruiter only gets view access until permissions read members.
- Dashboard tiles link to the pipeline, not to `/candidates?stageType=`; customize and setup dismissal are still per browser; the wizard's team step still takes addresses.

## Progress (wave 3)

Finished:

- **Approval engine (backend)**: every submit is a new round (`Approval.Round`); resubmitting, a rejection, a withdrawal or changed offer terms never delete rows, they mark whoever had not answered `Cancelled`. The engine lives in `Features/Offers/ApprovalEndpoints.cs` (offers keep `OfferEndpoints.cs`). Modes: one after another, all at once, or any one (`ApprovalMode`). With "any one", only an approver the organization's chain named settles the round (`Approval.FromPolicy`); people the requester added do not. Only an admin can ask less of approvers than the chain (a weaker mode is refused); everyone else keeps the chain's approvers and may add more. Decisions tell the requester through `Notify` (`approval-decided`); requests and reminders go through the `approval-request` template (and its `approval-requested` notification). No hand-written emails are left in the approval code.
- **Reminders**: `ApprovalPolicy.ReminderDays` (default 2, 0 turns them off): an approver whose turn it is gets the approval email again after that many days without an answer, then every that many days, up to the organization's `MaxReminders`, outside quiet hours, through the email outbox (`SendApprovalRemindersAsync`, one line in `EmailOutboxWorker.RunRemindersAsync`). "Send a reminder" by hand waits 6 hours between nudges.
- **One-click email links**: the approval email has "Approve it" and "Reject it" links (`{{approveLink}}`, `{{rejectLink}}`) to `/approve/{token}`. The token is a Data Protection, time-limited payload naming one approval step, one approver and one decision (7 days). Opening the link only shows the request (scanners decide nothing); the decision is a POST from that page (`/public/approvals/{token}`). A link stops working once its step is decided, given to someone else or withdrawn, and a changed token is refused. Rejecting still needs a reason.
- **Approvals inbox**: tabs Waiting on me · Requested by me · Done (`GET /api/approvals?scope=`, one query per kind of subject, not per row; `/approvals/mine` stays for the dashboard). Rows say what is asked in one line (job: code, team, openings, location, pay; offer: job and salary) and how long it has waited. The drawer shows the subject (job: team, place, openings, hiring manager, pay, the start of the posting; offer: candidate, job, stage, applied, scorecard tally, terms, the requester's note), the approvers with their turn, reminders and replacements, and earlier rounds folded under one line. The requester can withdraw a request, send a reminder or replace an approver; an approver can hand their own step to someone else; a step the chain requires can be handed on only by an admin or that approver (recorded with who did it). `ConfirmModal` is gone.
- **Job approval (submit, waiting, rejected)**: the job's alert reads "Waiting for approval (1 of 2)" and names who answers next; its modal has the timeline with reminders and replacements, "Withdraw request" and the earlier rounds. Submitting asks for approvers (the chain prefilled; non-admins can add, not remove), how they decide and a note to approvers.
- **Approval rules (admin)**: Settings, Approvals is now two cards, Opening a job and Offers (`ApprovalPolicy`, one per kind): required or not, approvers in order (drag or arrows), "Hiring manager of the job" as an approver, how they decide, and the reminder days. Saving also keeps the organization's `Require…Approval` flags and `DefaultApproverEmails` in step for the screens that still read them. The old Approvals section in `AdminSettings.tsx` is no longer routed (platform's file; it can be deleted).
- **Create job wizard**: 7 steps. Start from blank, a posting template (the template's three parts and its questions; picking another one asks before replacing what you wrote) or another job (its posting, questions, team, pay, place and requirements fill the form, and its stages and interview kits are copied, `copyFromId`). Team suggests the values other jobs use (`GET /requisitions/values`). Location and pay: work mode, "a place other jobs use", city, region, country, and for remote jobs the countries people may work from; pay from, to, currency, per, and "Show the pay range on the posting". The posting is three labelled editors (company, role, benefits) plus the question builder, and the preview beside it is the real `JobPostingView` with the pay and "What we will ask you". The hiring team step picks people with accounts and their role (`/requisitions/people`), with at least one hiring manager. Review offers Keep it as a draft, or Open it now (or Send it for approval when approval is on). The server saves the composed posting as sent (it no longer wraps the template around it) and takes `members`, `place`, `salary`, `questions`. The free-text interview stages are gone (kits own rounds). Each step says why Next is off.
- **Job settings**: the location is city, region, country and remote countries (old jobs keep their text as the city until changed); a Pay card edits the range, currency, period and "show on the posting".
- **Posting templates (list)**: rows open the editor; latest version only, "Used by N jobs", "Last changed … by …"; the ••• menu has Edit, Duplicate, Archive or Restore; archived ones hide behind "Show archived". The question bank sits below.
- **Posting template editor**: name, Company intro, Role description starter and Benefits as labelled editors (no magic headings), default questions with the builder, a live preview with `JobPostingView`, and versions with View and Restore (restoring saves it as the newest version). `InterviewStagesMarkdown` is dropped; `ApplicationQuestionsMarkdown` on templates moves to `QuestionsJson`.
- **Application questions**: the Posting tab has an "Application questions" card to read and edit them (`PUT /requisitions/{id}/questions`). Types: short answer, paragraph, yes or no, one choice, several choices, number, date, file upload, web link; required, help text, choices, drag to reorder, and "Flag for review" on yes or no and choice answers (nothing is rejected automatically). The question bank (`/question-bank`) is shared: add from it in any builder, "Save to question bank" from a question, and manage it in Settings, Templates. See the candidate-facing progress for the apply side.
- **Dashboard**: the Team tab's cards are saved with the account (`GET/PUT /api/dashboard/layout`, `AppUser.DashboardJson`), reordered by dragging or with the arrows. "Finish setting up" has "Hide for now" (it joins the hidden cards; Customize brings it back) and folds to one progress line once three quarters are done.
- **Job overview**: a "Suggested candidates" card (top 5 from `/requisitions/{id}/suggested-candidates`, "See all" to `/candidates?find={id}`).
- **Pipeline board and list**: "Send assessment" in the selection bar (`SendAssessmentModal`); a red flag on a card whose application has a flagged answer.
- **Jobs list**: each row of `GET /api/requisitions` now carries `isConfidential` and `members` (email and role), so `can('update', asJob(row))` works without the email mirrors.

Not done:

- Dashboard pipeline tiles still link to the pipeline: the candidates list has no `stageType` filter yet (candidates area).
- Approval chains per department ("When team is …, use this chain instead") and escalation past `MaxReminders`.
- The wizard does not save a draft to the server after step 1; leaving the page loses the form.
- Template variables (`{{company}}`, `{{jobTitle}}`) with an insert menu.
- Linking an assessment to a stage (`PipelineStage.AssessmentId`) and a score badge on cards (assessments note, left for time).
- Remaining build order items 12 (jobs list polish) were not touched beyond checking the list still renders with the server-side saved views.

## Progress (wave 4)

Finished:

- **Stage to assessment link**: `PipelineStage.AssessmentId` and `PipelineTemplateStage.AssessmentId` (set null when the assessment goes). "Edit stages" on a job and the admin pipeline editor have an Assessment field per stage (published assessments; an archived one is refused); new jobs copy it from their pipeline, Duplicate copies it. The board column says "Assessment: {name}" under the stage, and every card with a submitted result shows a score badge in its footer: the percent once scored ("To score" while a reviewer still has work), green once passed, red once failed, with the assessment's name for screen readers. The board payload carries `assessmentId`, `assessmentName` per stage and `assessment { name, percent, decision, pendingCount }` per card (read from `AssessmentInvites`; no change to the assessments files). Sending the assessment on stage entry is the workflows builder's.
- **Create job wizard drafts**: the wizard saves its whole state to the server a second after each change once the job has a title (`PUT /api/requisitions/drafts/{id}`, `JobDraft`, one person's own), shows "Draft saved …" by the title, and the address becomes `/jobs/new?draft={id}` so a refresh resumes. The Jobs list shows "Unfinished jobs" (yours only) with the step you stopped at, Continue and "Discard draft". Creating the job (`draftId` on `POST /api/requisitions`) removes the draft in the same save. Old drafts fill in fields added later (`restoreDraft`).
- **Approval chains per team**: `ApprovalPolicy.Departments`; a chain for some teams wins over the organization's chain for jobs (and their offers) in those teams; the chain naming the team with the fewest teams wins, and each team has at most one chain per kind. Settings, Approvals: under each kind, "Use a different chain for some teams" adds a card with Teams (suggested from jobs), approvers, how they decide and reminder days; Remove asks first. `PUT /api/approval-policies/{kind}` with `departments` (and `id`) saves a team chain, `DELETE /api/approval-policies/{id}` removes one. Reminders use each request's own chain.
- **Escalation**: once an approver has had the organization's `MaxReminders` and another reminder period passes without an answer, the requester and every admin get one "Approval is stuck with {name}" notification through `Notify.AddAsync` (kind `approval-requested`, link `/approvals?open={id}`), and the step records `EscalatedAt`.
- **Team channel**: approval requests post with the `approval-requested` kind and a link to the approval, so admins can turn them off (new entry in `TeamChannel.Events`, on by default).
- **Platform cleanup**: the unrouted Approvals section is gone from `AdminSettings.tsx`.

Not done:

- Template variables (`{{company}}`, `{{jobTitle}}`) with an insert menu, and the remaining jobs list polish (unchanged from wave 3).
