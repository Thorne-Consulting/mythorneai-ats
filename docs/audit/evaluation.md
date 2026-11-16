# Application record, scorecards, interview kits and offers

## Overall
- **The record frame fights its own content.** `ApplicationShell.tsx:179` puts a 340px right rail beside every tab. On the Offer tab the `Wizard` (step list 220px + form + 320px preview, breakpoints on the viewport in `components/ui/wizard.tsx:50-51`) is nested inside the remaining ~780px. At 1440 the form column is about 190px wide: "Currency" and "Paid per" overprint ("CurrencPaid per"), helper text wraps one word per line, and "Next" is cut off. The rail repeats the same contact card on all six tabs and pushes every phone page about 600px longer.
- **The Overview says almost nothing.** Nina Kowalski has two submitted scorecards (Yes, Strong yes), but her Overview shows "No notes yet" and a "Start offer" card. The candidate's answers to the application questions are saved (`Application.ApplicationAnswersMarkdown`) but no endpoint returns them and no screen shows them. The record has no resume, no feedback summary, no stage history and no time in stage.
- **The same object is drawn two or three times, sometimes differently.** The offer appears as the Overview `OfferPanel`, which has its own note-only draft builder, as the Offer tab wizard, and as the rail `OfferStatus` card. A pending offer is visible twice on one Overview screen. Scorecards appear as star cards on the Interviews tab and as a number table on the Scorecards tab. The scorecard form exists as a modal and as a tab.
- **The end of the funnel is a stub.** "Send acceptance email" marks the applicant Hired immediately (`OfferEndpoints.cs:229`). Offer terms are flattened into a free-text note (`offer-note.ts`). There is no offer letter, no candidate accept or decline, no debrief and no recorded hiring decision.
- **Interview kits are a markdown convention dressed as a document.** Content only saves if you type headings with exact names ("## Interviewer instructions"). Anything else, and any table row without a question, is silently dropped (`interview-kit-doc.ts:91-110`). The headings render as body text because `components/plate/ui/heading-node.tsx:15-20` still reads `--mantine-h*-font-size` variables that no longer exist. The read view also throws a hydration error, which is the "1 Issue" badge in the screenshots.
- **Stage moves have hidden side effects.** Every single move emails the candidate the internal stage name, and `DoNotContact` is ignored (`ApplicationEndpoints.cs:440-454`). "Reject" stays visible on applicants who are already rejected, so clicking it sends a second rejection email. The stage dropdown silently un-rejects an applicant and emails them. The "Withdrew" reason is saved as status Rejected.

**Target:** the application is one calm record. The header shows who the person is, where they are in the stage path (with days in stage), the one obvious next action, and a ••• menu. The Overview is a one-screen briefing: next step, feedback summary, application answers, resume highlights and pinned notes. Feedback is a single page per candidate: write your own scorecard (blind until you submit), compare the panel, read an AI draft summary, record the decision. The Offer tab is full width: structured terms, a letter rendered from a template, approvals, then a portal page where the candidate accepts or declines. Hire happens when they accept. Kits are real documents built from structured competency blocks and an organization question bank, versioned so editing a kit never rewrites scorecards already written.

## Features

### Record header and stage moves — COMPLETE · M
- Where: `/applications/[id]` layout. `ApplicationShell.tsx:57-70` (stage mutation), `:98-151` (header), `:125-136` (stage `Select`). `ApplicationEndpoints.cs:376-482` (`PATCH /applications/{id}/stage`), `:89-190` (bulk). `PipelineEvents.cs` (`StageTransitions`, webhooks, job fill).
- Today: the stage `Select` sends `PATCH` with `status: 'Active'`. The API records a `StageTransition`, writes an audit row, fires webhooks, and refuses a direct move to Hired with a clear 409, which is good. On every move it queues the `stage-update` email ("Your application has moved to: {{stage}}") with no opt-out and no `DoNotContact` check. Bulk moves send nothing, so the two paths behave differently.
- Design critique: the stage `Select` (`w-44`, no visible label) is the only stage indicator for managers. It reads as a form field, not a status. "Schedule interview" is the primary button at every stage, including Offer, Hired and Rejected (`:146` has no status guard). "Reject" shows on Rejected and Withdrawn applicants (`:137`, because `canMove` only excludes Hired). On a phone the three controls wrap onto two rows (Select + Reject, then Schedule).
- Product critique: Lever and Ashby give a one-click "Advance to <next stage>" plus J/K to move to the next applicant. Greenhouse's move dialog asks whether to email the candidate, shows the template, and can send later. Here a recruiter who moves someone from "Screen" to "Hiring manager review" has emailed the candidate an internal label without knowing it. Picking a new stage for a rejected applicant silently reactivates them and emails them too. Role-only checks (`canManageRole`, `application-data.tsx:70`) also show Reject, Add note and Start offer to hiring managers who only view the job. The API's `CanManage` (owner or recruiter only) then answers 404 and the user sees "Could not reject this applicant".
- Complete means:
  - Header: name, job link, and a compact stage stepper (Applied → … → Hired) with the current stage and "6 days in stage".
  - The primary is a split button "Move to <next stage>" with a menu of every stage. Reject sits beside it. ••• holds Schedule interview, Start offer, Copy link and Add to another job.
  - Moving opens a small confirm that shows "Email the candidate" (off unless the stage is set to notify), the rendered email, and Send now or Send tomorrow at 9:00.
  - Rejected and Withdrawn applicants show "Reopen application" instead of Reject and the stage picker. It asks for confirmation and sends no email by default.
  - Hired and Rejected applicants lose Schedule interview and Start offer.
  - The UI hides actions using permission flags from the API, not the role name.
  - Keyboard: `M` opens move, `R` opens reject.
- Backend: add `PipelineStage.NotifyCandidate` (bool) and `NotifyTemplateKey`. Add `SendEmail` and `SendAt` to `MoveApplicationRequest` (use `EmailOutboxItem.NextAttemptAt` to schedule). Skip candidate-bound emails in `EmailTemplates.QueueAsync` when the candidate is `DoNotContact`. Add `POST /applications/{id}/reopen`. Return `permissions { manage, offer, notes }` and `daysInStage` (from `StageTransitions`) in `GET /applications/{id}`.
- Libraries: none.

### Rejection with reasons — COMPLETE · M
- Where: `RejectModal.tsx`, `application-types.ts:7-16`, `features/applicants/RejectManyModal.tsx`, `PATCH /applications/{id}/stage`, `POST /ai/draft-message`.
- Today: the reason is required (good) and comes from 8 strings hard-coded in the client. "Draft a message with AI" fills a textarea. Without a draft, the template email still goes out immediately and the user never sees it. Every reason, including "Withdrew", saves `status: 'Rejected'` (`RejectModal.tsx:30-36`), so candidate withdrawals count as rejections in reports. Rejecting does not cancel upcoming interviews or withdraw an open offer (`PipelineEvents.OnMovedAsync`).
- Design critique: the modal's `description` reads "This is saved in the activity history.", which tells the user nothing about what happens next. The amber "Use job-related reasons only." alert competes with the danger button. "Other" has no note field.
- Product critique: Greenhouse splits "We rejected them" from "They rejected us", has organization-managed reasons, a rejection note, a template picker and a "send at" delay (most teams wait a day). Lever has the same with send-later. Customers expect to see and control the email before a candidate gets it.
- Complete means:
  - Two reason groups ("We decided not to move forward" and "Candidate withdrew") that map to Rejected and Withdrawn. Admins manage the reasons in Settings.
  - An optional note, required for "Other".
  - Email section: template picker, rendered preview, edit, Send now / Tomorrow 9:00 / Pick a time / Don't email. "Draft with AI" stays as a button inside the editor.
  - A scheduled rejection email shows in Activity with "Cancel email".
  - On reject: future interviews are cancelled (the interviewers are told) and any open offer is withdrawn, after a confirm that lists both.
  - The bulk reject modal uses the same reasons and email options.
- Backend: `DispositionReason` table (`Id, Label, Kind Rejected|Withdrawn, SortOrder, Active`) with seed data. Add `Application.DispositionReasonId` and `DispositionNote`. `POST /email-outbox/{id}/cancel` for pending items. The reject path cancels `Interview` rows and withdraws the open `Offer` in the same transaction.
- Libraries: none. `EmailOutboxItem.NextAttemptAt` already gives scheduled sending.

### Overview tab — COMPLETE · L
- Where: `/applications/[id]`, `ApplicationRecord.tsx`. `GET /applications/{id}` (`ApplicationEndpoints.cs:192-374`).
- Today: a next-step alert (see the next feature), a "Team notes" card, and the `OfferPanel`. Nothing else.
- Design critique: at 1440 the two cards sit in a 780px column. A new applicant gets a full-width "Offer · Start offer" card on day one, which is the wrong action at the wrong time. With an offer pending, the same "Waiting for approval" status appears in the Overview card and again in the rail card below "Next interview".
- Product critique: Greenhouse and Ashby open an application with the resume beside the feedback and the application answers. Lever puts the "Feedback" summary and the resume first. Here a hiring manager has to open Scorecards, Profile and Resume separately just to answer "should we keep going?". The application answers are not shown anywhere in the product.
- Complete means:
  - Next-step banner.
  - Feedback summary card: recommendation tally ("2 Strong yes · 1 Yes · 1 missing"), average per competency, and a link to Feedback.
  - Application answers card (questions and answers from the apply form).
  - Resume card: current title, years, top skills from `ResumeProfileJson`, and "Open resume" (the candidate resume route).
  - Requirements match when the job has `RequirementsJson`.
  - Pinned notes, with the full feed living in Activity.
  - No offer card. The offer belongs to its tab and the rail chip.
- Backend: return `ApplicationAnswersMarkdown` (rendered as question and answer pairs) and a small `resume` summary from `GET /applications/{id}`.
- Libraries: none.

### Right rail (Applicant, Next interview, Offer status) — COMPLETE · S
- Where: `ApplicationShell.tsx:181-222`, `:243-301`.
- Today: contact, source, applied, last activity and tags. The next interview, and the offer status when there is one.
- Design critique: `DescriptionList` already has `gap-y-4`, and `:189` adds `space-y-3`, so each label/value pair takes about 70px and the card is 430px tall for six short facts. The Next interview card uses `bg-accent` (the selection wash), so it reads as selected, not as information. The rail renders on every tab and squeezes the Offer wizard.
- Product critique: the rail repeats the Profile page. Ashby keeps a slim sticky header with contact icons instead of a card.
- Complete means:
  - The rail shows on Overview only. Other tabs are full width.
  - Contact rows are inline: label left, value right, one line each, with copy buttons for email and phone.
  - Drop "Last activity" (Activity owns it).
  - The Next interview card uses `bg-card`.
  - The offer chip stays as the single offer summary.
  - Fix the double spacing at `:189`.
- Backend: none.
- Libraries: none.

### Next-step banner — COMPLETE · S
- Where: `ApplicationRecord.tsx:38-76`.
- Today: two cases only: "Your scorecard is due" and unread candidate messages.
- Design critique: good idea, good placement, plain copy.
- Product critique: it misses the steps that actually stall hiring.
- Complete means: add these cases, in priority order:
  - An offer waiting for your approval (Approve / Reject inline).
  - An approved offer that is not sent yet.
  - All scorecards are in and no decision is recorded ("Record decision").
  - An interview is proposed but not booked for 3 days.
  - A scheduled rejection email will go out ("Cancel").
- Backend: none. All the data is already in the detail and offer responses.
- Libraries: none.

### Record tabs and moving between applicants — COMPLETE · S
- Where: `ApplicationShell.tsx:91-97` (breadcrumbs), `:152-176` (`LinkTabs`), `components/ui/tabs.tsx:15`.
- Today: six underline tabs with counts on Interviews and Scorecards. The breadcrumb always starts at Candidates.
- Design critique: on a 390px phone the strip cuts off at "Messa" with `scrollbar-hide` and no fade. When Activity is the current tab it is off-screen (see `phone-light_…_activity.png`), because the active tab is never scrolled into view.
- Product critique: recruiters work through a stage one applicant at a time. Greenhouse and Ashby have "3 of 12 in Onsite" with previous/next and J/K. Here you go back to the board every time. Arriving from a job's pipeline, the breadcrumb sends you to Candidates instead of the job.
- Complete means:
  - Rename "Scorecards" to "Feedback".
  - Scroll the active tab into view on mount, and add an edge fade when the strip overflows (in the shared `LinkTabs`).
  - Previous/next applicant arrows with J/K when you arrive with `?from=board&stage=` (read the list from the board query cache).
  - The breadcrumb reflects where you came from (Jobs › <job> › Pipeline).
- Backend: none.
- Libraries: none.

### Team notes with mentions — COMPLETE · M
- Where: `ApplicationRecord.tsx:78-115`, `NoteModal.tsx`, `ApplicationNotesEndpoints.cs`, `ApplicationNote` (`Domain/Applications.cs:101-110`).
- Today: a plain-text modal to add a note. Always `isPrivate: false` (`NoteModal.tsx:18`). The author is shown as an email address. Notes cannot be edited or deleted. There are no mentions and no notifications. Only `ManageHiring` can post (`ApplicationNotesEndpoints.cs:32`), so interviewers, who are the people with the freshest observations, cannot leave a note. Notes belong to one application and are invisible from the candidate's other applications.
- Design critique: a modal with a 6-row textarea for a one-line note is heavy. The empty state "No notes yet." sits in a full-width card. The "Keep it about the job." helper is fine.
- Product critique: Greenhouse, Lever and Ashby all have inline composers with @mention that emails and notifies the person, a private or hiring-team visibility switch, edit and delete, and notes that follow the candidate. Mentions are how hiring managers get pulled in. Without them, people paste links into Slack.
- Complete means:
  - Inline composer at the top of the Activity feed, with ⌘↵ to post.
  - Bold, italic, lists and links.
  - `@` mentions of people who can see the job. Mentioning someone without access warns before posting.
  - Visibility: "Hiring team" or "Recruiters and hiring managers only" (`IsPrivate`).
  - Edit and delete your own note, with an "edited" label.
  - Pin a note to the Overview.
  - Display names and avatars.
  - A mention notification in the bell and by email, with a deep link to the note.
  - Notes from the candidate's other applications appear with a "<job>" chip.
  - Interviewers can add notes.
- Backend: `ApplicationNote.BodyMarkdown`, `EditedAt`, `DeletedAt`, `PinnedAt`. `NoteMention (NoteId, UserEmail)`. `PUT` and `DELETE /applications/{id}/notes/{noteId}`. Open `POST` notes to anyone in `ScopeApplications`. Add a `Notification` entity, shared with the notifications area. Queue a mention email.
- Libraries: `@platejs/mention@53.0.0` for the mention node and combobox. Reuse the existing `components/plate/ui/inline-combobox.tsx` and `@platejs/markdown@53.3.12` (installed) to store markdown. This beats a hand-rolled `@` textarea parser on caret position, IME input and keyboard selection.

### Activity history — COMPLETE · M
- Where: `/applications/[id]/activity`, `ApplicationHistory.tsx`. Audit, outbox and messages come from `GET /applications/{id}` (`ApplicationEndpoints.cs:351-371`, `Take(50)` each).
- Today: audit events show a mapped title plus the actor's email. The audit `Details` (from/to stage, reason, approver comment) are ignored, and so is the `StageTransitions` table. Emails show subject and delivery badge. Candidate messages are printed in full, which duplicates the Messages tab. The list shows 6 events, then "Show all". Applications from the careers site have no "Applied" event, because the public apply path writes no audit.
- Design critique: on Nina's record, three "Email: …" rows in a row mix an internal scorecard reminder to `manager@example.test` and a "Stalled" alert to the recruiter with the candidate's own email, with nothing to tell them apart. "Stage changed" never says from what to what.
- Product critique: Greenhouse's Activity Feed reads as sentences ("Avery moved Nina from Screen to Onsite"), lets you open any email that was sent, and filters by type. Ashby adds filter chips and a per-day grouping.
- Complete means:
  - Sentence events with names and links: moves with from/to, rejection with reason and email schedule, scorecard submitted with recommendation, approval decisions with comments, offer sent / accepted / declined.
  - Notes inline (the composer lives here).
  - Messages collapsed to one line with "Open in Messages".
  - Emails marked "To candidate" or "Internal", with a click to read the sent body and "Send again" for failures.
  - Filter chips: All, Notes, Stage, Emails, Interviews, Feedback, Offer.
  - Grouped by day, with paging from the server.
- Backend: `GET /applications/{id}/activity?cursor=&types=` returning typed events (audit with parsed details, transitions, outbox, notes, messages). Write a `Created` audit row in `PublicJobEndpoints`. `GET /email-outbox/{id}` for the body.
- Libraries: none.

### Writing a scorecard — COMPLETE · M
- Where: `/applications/[id]/scorecards`, `ApplicationScorecards.tsx:143-185` (`OwedScorecard`), `ScorecardModal.tsx:74-243` (`useScorecardForm`, `ScorecardFields`), `POST /interviews/{id}/scorecards` (`InterviewEndpoints.cs:410-520`).
- Today: one block per competency (stars, required evidence), an overall star rating, a 5-point recommendation with "Mixed", and a decision summary, strengths and concerns, all required (`ScorecardModal.tsx:108-113`). The draft is saved in `localStorage` only (`:85-101`). The scorecard is locked after submit. The form also appears for interviews that have not happened ("has not happened yet", `ApplicationScorecards.tsx:157`), and the API accepts a scorecard before the interview starts.
- Design critique: an interviewer here once a month faces 3 + 2N required text boxes. "No concerns" works by writing the literal string "None observed" into the field (`:236-240`). Stars carry no meaning per point. The overall star rating and the recommendation ask the same question twice.
- Product critique: Greenhouse and Ashby use a 4-point overall call (Strong no / No / Yes / Strong yes) that forces a lean. They make notes per competency optional, and autosave drafts on the server so you can start on your laptop and finish on your phone. Greenhouse lets a recruiter submit feedback on behalf of an interviewer who sent it by email.
- Complete means:
  - Required: a rating for each competency, the recommendation (4 points, no "Mixed") and a summary. Notes per competency, strengths and concerns are optional but prompted.
  - Drop the separate overall star rating. The weighted competency score is the number.
  - Scale labels on hover and under the stars (1 "Well below", 3 "Meets", 5 "Well above"), plus the kit's "good looks like".
  - Server drafts that autosave every few seconds, with a "Saved" indicator.
  - Not available until the interview starts. Before that, show "Open interview prep".
  - "Add a correction" after submit: a timestamped addendum, not an edit.
  - "Submit on behalf of" for recruiters.
  - The same form is embedded in the interview prep page so notes go straight in (interviews area).
- Backend: `ScorecardDraft (InterviewId, InterviewerEmail, Json, UpdatedAt)` with `PUT`/`GET /interviews/{id}/scorecard-draft`. Make `Scorecard.Rating` nullable (or derived). Reject submissions where `StartsAt > now`. `ScorecardAddendum` table. Add `OnBehalfOf` to the request, allowed for `CanManage`.
- Libraries: none. Debounce with `useDebouncedValue` from `@/lib/hooks`.

### Scorecard modal shortcut — MERGE · S
- Where: `ScorecardModal.tsx:246-327`, opened from `InterviewCard.tsx:332` and the `?scorecard=` deep link.
- Survivor: the Feedback (Scorecards) tab form. "Write scorecard" on an interview card links to `/applications/{id}/scorecards?interview=…`, which already scrolls to the form. Delete the modal and its keep-or-discard draft dialog. Server drafts make the dialog unnecessary.

### Blind until submit — COMPLETE · S
- Where: `ApplicationEndpoints.cs:297-308`, `ApplicationScorecards.tsx:125-136`, `InterviewCard.tsx` notice.
- Today: scorecards are hidden per interview. `ScorecardsVisible = !i.InterviewerEmails.Contains(me) || i.Scorecards.Any(mine…)` means an interviewer who still owes feedback on interview A, or who has interview B tomorrow, can read every scorecard from the candidate's other interviews.
- Design critique: the lock row copy is good ("so your scores stay your own").
- Product critique: Greenhouse hides all feedback on the candidate until you submit your own. That is the point of blind review, and the day-2 interviewer is exactly the person it protects. The leak also breaks the promise in the scorecard form's warning ("Other interviewers' scorecards stay hidden until you submit yours").
- Complete means:
  - If I am on any non-cancelled interview for this application without a submitted scorecard, I see no scorecards and no AI feedback summary for the whole application.
  - The Feedback tab says "Submit your scorecard for <interview> to see the panel's feedback".
  - An organization setting can exempt hiring managers.
- Backend: compute `blinded` once per request in `GET /applications/{id}` and apply it to every interview's `Scorecards`. Apply the same rule to the AI summarize endpoints.
- Libraries: none.

### Panel comparison per interview — COMPLETE · S
- Where: `ApplicationScorecards.tsx:196-329` (`PanelComparison`).
- Today: competencies down, interviewers across, an average column, a weighted total, the overall rating, the recommendation, and the written feedback behind "Read written feedback".
- Design critique: column headers are email local parts ("tomas.interviewer", `:33`, `:217`). "Weighted total" and "Overall rating" sit in consecutive rows with near-identical numbers (4.3 / 4 and 4.8 / 5), which invites "which one counts?". Bare numbers with no tone make a 2 next to a 5 easy to miss. The written evidence, which is the most useful part, is collapsed at the bottom. The Interviews tab shows the same scorecards as stars, so there are two visual languages for one thing.
- Product critique: Ashby's feedback view colour-codes each score and shows the note on hover or click. Greenhouse shows each interviewer's "key take-aways" first.
- Complete means:
  - Display names.
  - One total row.
  - Score cells tinted with the `tone-*` scale (1-2 red, 3 amber, 4-5 green, with the number always visible).
  - Clicking a cell shows that competency's evidence in a popover.
  - Written feedback expanded by default, one column per person on wide screens.
  - Missing interviewers listed as "Waiting on Asha".
- Backend: return `interviewerName` with each scorecard.
- Libraries: none.

### Feedback summary and hiring decision (debrief) — COMPLETE · L
- Where: new section at the top of `/applications/[id]/scorecards` (Feedback). `POST /ai/summarize-interview` exists per interview only (`InterviewCard.tsx:107-110`).
- Today: none. There is no candidate-level view across interviews and no record of the decision. Automatic scorecard reminders exist (`EmailOutboxWorker.SendScorecardRemindersAsync`), but the email has no link and no candidate name ("Please complete your scorecard for the X interview (Y)"), and there is no manual nudge.
- Design critique: none yet.
- Product critique: Greenhouse's scorecard summary and Ashby's debrief view put every interview and competency in one grid with the overall calls. Ashby adds an AI summary and a "Decision" record, and Lever has "Advance or Archive" right on the feedback page. Without this, the decision happens in Slack and the ATS never knows why someone was hired or rejected.
- Complete means:
  - Header tally of recommendations and "3 of 4 scorecards in".
  - "Remind" next to each missing interviewer.
  - A competency × interview grid with tinted averages.
  - "Summarize all feedback" (an AI draft, clearly labelled, built from submitted scorecards only).
  - A Decision panel: Advance to <stage> / Make offer / Reject, plus a rationale. It saves the decision (who, when, why), performs the move, and appears in Activity.
  - An optional finalist comparison for the job: up to 4 candidates side by side on the same competencies.
- Backend: `HiringDecision (ApplicationId, Decision, Rationale, DecidedBy, DecidedAt)`. `POST /applications/{id}/decision`. `POST /interviews/{id}/remind` (rate-limited). `POST /ai/summarize-application`. Add `{{scorecardLink}}` and `{{candidateName}}` to the `scorecard-reminder` template.
- Libraries: none. The grid is a table with tone classes, so a chart library is not needed.

### Scorecards on the Interviews tab — MERGE · S
- Where: `InterviewCard.tsx:286-330` renders every submitted scorecard with stars, strengths, concerns and every competency.
- Survivor: the Feedback tab. The interview card keeps one line, "2 of 2 scorecards · Yes, Strong yes · View feedback →". On Nina's record this removes about 600px from the Interviews tab (the screenshot is 2215px tall).

### Scorecard math — DONE
- Where: `scorecard-math.ts` with `scorecard-math.check.mjs`.
- Why done: pure functions, weights handled, a fallback with no competencies, and a runnable check. When the overall star rating is dropped, `weightedScore`'s fallback becomes the recommendation's numeric value. That is a one-line change.

### My feedback queue — COMPLETE · M
- Where: `/interviews/feedback`, `features/interviews/FeedbackQueue.tsx`. It reads `GET /dashboard` `scorecardsDue` (`DashboardEndpoints.cs:68-90`, `Take(10)`).
- Today: a `DataTable` of up to 10 owed scorecards, with "Waiting N days" in amber at 2 or more. The row opens the prep page, while the button opens the scorecard page: two destinations for one row.
- Design critique: Export, column and density toggles sit above an empty personal to-do list (desktop and phone). On a phone it is a sideways-scrolling table. "Today" is shown for anything under 24 hours, even when the interview ended 20 hours ago.
- Product critique: Greenhouse "My interviews" and Lever "Feedback" have tabs for Needs feedback, Upcoming and Submitted, and show a badge in the nav. Interviewers, who see a reduced sidebar, need this as their home.
- Complete means:
  - Tabs: Needs feedback (n) and Submitted (read-only, with links).
  - No Export or density controls.
  - Phone layout as a list of cards.
  - Row click goes to the scorecard (the prep page embeds it).
  - Hours since the interview ended, coloured against the organization's reminder days.
  - Owed count badge on the sidebar's Interviews item.
  - No limit of 10.
- Backend: `GET /me/scorecards?status=due|submitted&cursor=`.
- Libraries: none.

### Interview kit list per job — COMPLETE · M
- Where: `/jobs/[id]/kits`, `RequisitionKits.tsx`, `POST`/`PUT /requisitions/{id}/interview-kits` (`RequisitionEndpoints.cs:147-340`).
- Today: list and create. No delete or archive (no endpoint), no duplicate, no reorder (`SortOrder` exists but nothing sets it), no copy from another job. The row says "4 questions" when it means competencies.
- Design critique: a clean list, but one row in a 900px card looks unfinished. A kit's meta line lists every competency name, which truncates at about 60 characters.
- Product critique: Greenhouse and Ashby build an interview plan: each stage lists its interviews and kits, and scheduling picks the kit from the stage automatically. Here the scheduler picks a kit by hand from a list.
- Complete means:
  - Rows show name, duration, competency count, the stage it belongs to, and "Used in 6 interviews".
  - ••• menu: Duplicate, Move up/down (or drag), Archive (blocked with a reason while upcoming interviews use it).
  - "Copy from another job".
  - A stage picker on each kit so scheduling pre-selects it.
  - An empty state that starts from templates.
- Backend: `InterviewKit.PipelineStageId`, `ArchivedAt`. `POST …/interview-kits/{kitId}/duplicate`. `PUT …/interview-kits/order`. `DELETE` (archive). `GET /interview-kits?search=` across jobs for copying.
- Libraries: `react-dnd@16.0.1` (installed, already used by `@platejs/dnd`) for drag reorder, or buttons only.

### Interview kit document editor — COMPLETE · L
- Where: `/jobs/[id]/kits/new`, `/kits/[kitId]/edit`. `InterviewKitEditor.tsx`, `interview-kit-doc.ts`, `components/plate/document-editor.tsx`, `components/plate/ui/heading-node.tsx`.
- Today: a Plate page serialized to markdown and parsed back by heading names and the first table under "## Scorecard". Competency identity is matched by name (`InterviewKitEditor.tsx:47-53`). Renaming a competency that has been scored looks like a delete, and the API answers 409 (`RequisitionEndpoints.cs:302-316`). Editing a kit changes the competencies of interviews already scheduled or scored, because kits have no versions.
- Design critique: headings render at body size because `heading-node.tsx:15-20` uses `--mantine-h1-font-size` and similar, which `styles.css` no longer defines. The kit title, the "Interviewer instructions" section and "Scorecard" all look like paragraphs. The editor sits inside the job shell (job header + section nav + a 260px checklist), so the document gets about 610px and the competency table cuts off at "What good l". A new kit is a blank page whose only hint is "Type # for a template, / for a block". On a phone the "Before you create" card with a disabled "Create kit" comes before the document. Template copy hard-codes "Suggested length: 45 minutes" while the duration field says 60.
- Product critique: owners want a real document. Today one wrong heading ("## Instructions") silently loses content, and a table row with no question disappears on save with no warning. Notion-style kit builders (Ashby's interview library, Greenhouse kits) use structured blocks inside a rich page.
- Complete means:
  - Focused full-width page: breadcrumb back to the job, a title field, duration in the header, and a sticky Save / Discard bar.
  - Rich-text instructions: headings, lists, links, callouts.
  - A custom "Competency" block (name, question, follow-ups, what good looks like, weight 1–5) that carries a hidden id, inserted with `/competency` or from the question bank. Drag to reorder.
  - Inline validation on the block itself, not silent drops.
  - The two kit emails move to an "Emails" side tab with variable chips and a preview.
  - Templates gallery when you start a new kit.
  - Saving creates a new version. Scheduled interviews keep their version, and a banner says "3 interviews use version 2".
  - Fix the heading variables so all three editors render headings.
- Backend: `InterviewKitVersion (KitId, Version, SnapshotJson, CreatedBy, CreatedAt)`. `Interview.InterviewKitVersion`. Competencies keep ids across versions (sent by the client, never matched by name). Store `InstructionsMarkdown`.
- Libraries: `@platejs/list@53.3.13` (lists in instructions; none installed today). `platejs` static rendering (`createStaticEditor`/`PlateStatic` from `platejs/static`, already in `platejs@53.3.15`, with the `*-node-static.tsx` components already in `components/plate/ui`) for the read view. A custom element via `createPlatePlugin` for the competency block. No new editor library.

### Kit read view and separate edit route — MERGE · S
- Where: `/jobs/[id]/kits/[kitId]` (`InterviewKitView.tsx`) and `/kits/[kitId]/edit` (`EditInterviewKit.tsx`).
- Survivor: one page, `/jobs/[id]/kits/[kitId]`. Managers edit in place with the sticky save bar. Everyone else sees the static render. `/edit` redirects. This also removes the hydration error: `InterviewKitView.tsx:57-61` server-renders an interactive `DocumentEditor`, and the console reports "A tree hydrated but some attributes … didn't match". The static renderer is SSR-safe. The Weight column clipped at the card edge goes away with the full-width layout.

### Kit templates and question bank — COMPLETE · L
- Where: today only `kitTemplates` and `kitBlocks` constants in `interview-kit-doc.ts:178-420`, reached by typing `#`.
- Today: six good, well-written templates, hidden behind a keystroke nobody will guess. There is no organization library, no saved questions and no "save as template".
- Design critique: no visible entry point.
- Product critique: Ashby's interview library and Lever's feedback templates let a talent team keep approved competencies and questions in one place and reuse them across jobs. Consistency across jobs is the selling point of structured hiring.
- Complete means:
  - Settings › Interview library has two lists. Templates (whole kits) and Question bank (competencies with question, follow-ups, good-looks-like, default weight, tags such as "Leadership" or "Engineering").
  - A search side panel in the kit editor to insert competencies.
  - "Save to library" on any competency block.
  - "Save kit as template".
  - "Suggest competencies from this job's requirements" (AI, from `RequirementsJson`, inserted as normal blocks).
  - The six current templates become seed rows.
- Backend: `KitTemplate (Id, Name, SnapshotJson, UpdatedAt, Version)` and `QuestionBankItem (Id, Name, Question, FollowUps, GoodLooksLike, Weight, Tags[], UsageCount, ArchivedAt)`, with CRUD under `/interview-library/*` (admin and recruiter). Reuse `/ai/interview-questions` for suggestions.
- Libraries: none beyond the editor ones.

### Offer terms builder — COMPLETE · L
- Where: `/applications/[id]/offer`, `ApplicationOffer.tsx:118-387`, `offer-note.ts`, `components/ui/wizard.tsx`. `PUT /offers/{id}`, `POST /applications/{id}/offer`.
- Today: a 4-step wizard (Compensation, Terms, Approvers, Review). The terms are composed into one text `Note` (`offer-note.ts:42-57`) and the structured draft lives only in `localStorage` (`ApplicationOffer.tsx:133-138`). From another device the terms come back as free text. Nothing is prefilled from the job (`Requisition.EmploymentType`, `WorkMode`, `Location`, `TargetStartDate`). Currencies are a hard-coded list of 7 (`:116`).
- Design critique: at 1440 the wizard is crushed to about 190px inside the record grid (see Overall). Labels overprint, inputs are about 60px wide, Next is clipped. The fix is the rail rule plus container queries in `Wizard` (`@container` with `@3xl:` instead of `lg:`/`xl:`), so it lays out by its own width anywhere. "Withdraw this draft" floats under the wizard as a lone quiet xs button.
- Product critique: Greenhouse and Ashby store offer fields as data. That feeds offer reports (acceptance rate, time to accept, comp against range), the letter, approvals and the HRIS hand-off. A text note feeds none of these.
- Complete means:
  - Structured fields: base, currency, pay period, bonus, equity, start date, employment type, work mode, location, expiry date, and custom fields from Settings.
  - Prefilled from the job.
  - The job's salary range shown beside base salary, with an amber note when outside it.
  - Saved to the server on every step.
  - Revising after a decline creates a new offer version and keeps the old one readable.
  - Full-width layout with the letter preview as the aside.
  - Currencies from `Intl.supportedValuesOf('currency')`, defaulting to the organization's currency.
- Backend: columns on `Offer` (`BaseSalary decimal`, `Currency`, `PayPeriod`, `Bonus`, `Equity`, `StartDate DateOnly`, `EmploymentType`, `WorkMode`, `Location`, `ExpiresAt`, `CustomFieldsJson`, `ReplacesOfferId`). Keep `Note` as the approver note. `PUT /offers/{id}` takes the structured body. Salary range on `Requisition` (job details area).
- Libraries: none. `Intl` is native.

### Offer panel on the Overview — MERGE · S
- Where: `ApplicationRecord.tsx:117-124`, `OfferPanel.tsx` (its Draft branch `:175-208` is a second, note-only offer builder with its own `ApproverPicker`), and the rail `OfferStatus` (`ApplicationShell.tsx:283-301`).
- Survivor: the Offer tab owns building, approving, sending and responses. The rail chip stays as the single summary. "Start offer" moves to the header ••• menu and the Decision panel. Today, starting from the Overview creates an empty draft and drops the user into a different editor than the Offer tab: one object, two builders.

### Offer approvals — COMPLETE · M
- Where: `OfferEndpoints.cs:144-197` (submit), `:477-517` (decide), `:685-786` (apply decision), `features/approvals/*`, `OfferPanel.tsx:210-221`.
- Today: approvers run in parallel or in sequence, organization defaults apply, only an admin can drop default approvers, you cannot approve your own request, and a rejection needs a comment and sends the offer back to Draft. Approvers and requester get emails. This is a solid core.
- Design critique: approvers see "Note from admin" (the email local part) and a text blob. The pending approver row says "Has not answered yet" with no way to nudge.
- Product critique: the `approval-request` email says "Open the ATS and review it under Approvals." with no link (`EmailTemplates.cs:57-61`). Greenhouse approvers approve from the email or Slack link, see the comp next to the band, and are re-asked if terms change after approval.
- Complete means:
  - The approver view shows the structured terms, the letter preview, the salary band and the feedback summary.
  - A deep link in every approval email.
  - "Remind" on pending approvers.
  - A reminder after N days.
  - Editing an approved offer resets it to Draft and says so.
  - Names instead of email local parts everywhere.
- Backend: an `{{approvalLink}}` variable. `POST /approvals/{id}/remind`. A reminder in `EmailOutboxWorker`. A guard that resets approvals when an approved offer is edited.
- Libraries: none.

### Offer letter generation — COMPLETE · L
- Where: new. `Domain/Offers.cs:19` says the offer "holds no letter or contract content". The candidate gets the generic `acceptance` email ("you've been accepted … the team will contact you shortly").
- Today: none.
- Design critique: none yet.
- Product critique: every competitor generates the letter from a template filled with the offer fields, lets the recruiter tweak it per candidate, and freezes what was sent. Candidates judge the company by this page. (No e-signature or legal wording is needed. The letter is a document the candidate reads and responds to.)
- Complete means:
  - Settings › Offer letters: templates in the shared Plate editor with variable chips (`{{firstName}}`, `{{jobTitle}}`, `{{baseSalary}}`, `{{startDate}}`, `{{expiresAt}}`, `{{managerName}}`, …), a live preview with a sample candidate, and versions.
  - In the offer: pick a template, then edit this candidate's copy (marked "edited from template v3").
  - The letter renders in the approver view and the candidate portal, and prints cleanly through a print stylesheet ("Download PDF" uses the browser's print to PDF).
  - What was sent is frozen on the offer.
- Backend: `OfferLetterTemplate (Id, Name, BodyMarkdown, Version, IsDefault, UpdatedAt)`. `Offer.LetterTemplateId`, `LetterMarkdown`, `LetterHtmlSent`. `POST /offers/{id}/letter/preview`. Reuse `EmailTemplates.Fill` for variables.
- Libraries: `@platejs/mention@53.0.0`, configured a second time with key `variable` and trigger `{`, for variable chips; this is the same picker UX as mentions. Static rendering from `platejs@53.3.15` for the frozen HTML. PDF stays native (print CSS). Only if customers need PDF attachments: `QuestPDF@2026.9.2`, whose Community licence is free only under $1M revenue, so check before adopting.

### Candidate offer response in the portal — COMPLETE · L
- Where: new. The portal only guesses from the stage name ("The team is preparing an offer", `candidate-portal/ApplicationFrame.tsx:173`).
- Today: the candidate cannot see or answer an offer. "Send" means Hired.
- Design critique: none yet.
- Product critique: Greenhouse, Ashby and Lever all send a link to an offer page where the candidate accepts or declines, with an expiry. Recruiters see the response instantly. That is the moment a hire happens.
- Complete means:
  - "Send offer" emails a portal link. The status becomes "Sent".
  - The portal page `/candidate-portal/applications/[id]/offer` shows the letter, the key terms, "Accept offer" (type your full name to confirm, with no legal claims) and "Decline" (optional reason).
  - "Questions? Message the team" opens the existing thread.
  - The expiry date is shown, with a reminder email 48 hours before. After it, the offer becomes "Expired".
  - Recruiters can "Record response" for verbal accept or decline.
  - The recruiter and hiring manager are notified either way.
- Backend: `OfferStatus` gains `Accepted`, `Declined`, `Expired`. `Offer.RespondedAt`, `RespondedName`, `DeclineReason`, `RespondedBy` (candidate or recruiter). Portal endpoints `GET /portal/applications/{id}/offer`, `POST …/offer/accept`, `POST …/offer/decline` (portal session auth). `POST /offers/{id}/record-response`. An expiry and reminder sweep in `EmailOutboxWorker`. A new `offer-sent` template with `{{offerLink}}`.
- Libraries: none.

### Hire and undo hire — COMPLETE · M
- Where: `OfferEndpoints.cs:199-266` (send → Hired), `:289-332` (reverse), `PipelineEvents.OnMovedAsync` (job fill, `application.hired` webhook).
- Today: Hired is set when the recruiter sends the email. Reverse restores the earlier stage and reopens a Filled job. Webhooks and the Slack notice fire.
- Design critique: "Undo hire" is a quiet xs button under a sentence. That is fine for a rare action.
- Product critique: hire should follow the candidate's acceptance. When the last opening fills, Greenhouse prompts you to close out the remaining applicants. Here they stay Active forever and keep getting stale reminders.
- Complete means:
  - Accepted (or a recorded acceptance) moves the application to the Hired stage, carrying the start date.
  - Banner: "Job filled. 14 applicants are still active. Reject them with 'Position closed'?" This opens bulk reject with the reason and email preselected.
  - Undo hire stays.
  - No onboarding, payroll or contracts.
- Backend: move the hire logic from `/send` to the accept and record-response paths. Add `Application.StartDate`. Return a job-filled flag so the client can prompt.
- Libraries: none.

### Load, error and offline states — COMPLETE · S
- Where: `application-data.tsx:9-44`, `ApplicationOffer.tsx:52-65`.
- Today: each tab has skeletons, a load error with retry, and an offline notice. A deleted or forbidden application shows "This application is no longer available" with only "Try again", which can never succeed.
- Complete means: the 404 state offers "Back to candidates" (or the job). Errors say what to do next. Remove the duplicate empty-state primaries (the Interviews tab shows a primary "Schedule interview" in the empty card under the header's primary of the same name).
- Backend: none.

## Cross-area notes
- **Plate editors (templates area):** two separate Plate setups exist. `components/plate/document-editor.tsx` is used by kits, and `components/editor/PlateMarkdownEditor.tsx` by job posting templates. Merge them into one editor with plugin presets (document, letter, note composer). The broken `--mantine-*` heading variables in `components/plate/ui/heading-node.tsx` affect every user of the first editor. Email templates, offer letters and kit emails should share one variable-chip plugin and one versioned template store.
- **RBAC:** the web decides actions with `canManageRole(role)`, while the API uses per-job `CanManage` (owner or recruiter). Hiring managers who only view a job see buttons that 404. Have `GET /applications/{id}` and `GET /requisitions/{id}` return computed permission flags. If the RBAC reviewer adopts `@casl/ability@7.1.3` and `@casl/react@7.1.0`, build abilities from those flags.
- **Email (messages and templates area):** `EmailTemplates.QueueAsync` should refuse candidate-bound mail for `DoNotContact` in one place. Today only some callers check. Internal emails (reminders, stalled alerts) are logged against the application and mixed into candidate history. Add an `Audience` field on `EmailOutboxItem`.
- **Interviews area:** the prep page keeps private notes in `localStorage` and tells interviewers to "copy what matters into your scorecard". Embed the scorecard form there instead. The header "Schedule interview" uses `InterviewModal` (comma-separated emails), while `/interviews` uses `ScheduleInterviewDrawer`. Pick one.
- **Notifications:** mentions and offer responses need a real `Notification` entity. The bell currently derives from `/api/dashboard`.
- **Candidates area:** `Application.Rating` is only set by seed data, yet the candidates list filters on `minRating`. Derive it from scorecards or delete it. Application answers should also show on the candidate profile's Applications tab.
- **Shared UI:** `LinkTabs` needs active-tab scroll-into-view and an overflow fade. `Wizard` should use container queries so it fits inside any column.
- **Pipeline area:** stage settings gain "Email the candidate when they reach this stage" plus a template, and bulk moves use the same email options as single moves.
- **Job details:** add a salary range to `Requisition` for the offer band check.

## Build order
1. **Fix the visible bugs (S each, no dependencies).**
   - Heading variables in `heading-node.tsx`, and the static render for the kit read view (fixes the hydration error).
   - Hide Reject and Schedule on Rejected, Withdrawn and Hired, and add "Reopen".
   - "Withdrew" maps to Withdrawn.
   - `DoNotContact` check on stage emails.
   - Close the blind-review leak.
   - No scorecard before the interview starts.
   - Right rail on Overview only, so the offer wizard is usable.
   - Deep links in the scorecard reminder and approval emails.
2. **Merges (S).** Remove the Overview `OfferPanel` and its second builder, the `ScorecardModal`, and the scorecards on the Interviews tab. Combine the kit view and edit routes.
3. **Overview rebuild (L).** Application answers from the API, the feedback summary card, the resume card, the stage stepper with days in stage, and the expanded next-step banner. Rename the tab to Feedback.
4. **Stage move and rejection redesign (M + M).** Stage notify settings, the move dialog with email preview and send-later, configurable reasons, and cancelling interviews and offers on reject. Depends on the pipeline-area stage settings.
5. **Feedback page (M + L).** Scorecard form changes and server drafts, then the comparison polish, then the debrief decision, the AI summary and remind buttons. Then the feedback queue endpoint and tabs (M).
6. **Offers, end to end (L + M + L + L + M).** Structured terms, then approvals with deep links and reminders, then offer letter templates, then the candidate portal response, then hire on accept with the close-out prompt. Each step ships on its own. The letter depends on the shared Plate variable plugin from the templates area.
7. **Notes and activity (M + M).** The note composer with mentions, then the typed activity feed with filters. Mentions depend on the `Notification` entity.
8. **Interview kits (L + L + M).** Structured competency blocks with ids and kit versions, then the interview library (templates and question bank), then kit list management and the stage plan.

## Progress (wave 1)

Finished:
- **Record header and stage moves** (part): stage stepper with days in stage; primary "Move to <next stage>" split button with every stage in its menu (`M`), Reject beside it (`R`), ••• for Schedule interview, Make an offer and Copy link. Rejected and Withdrawn show only "Reopen application" (`POST /applications/{id}/reopen`, no email); Hired shows no move or schedule. The stage `PATCH` refuses to quietly un-reject (409, "Reopen first"). Actions follow the API's `canManage` flag, not the role. The move dialog with email preview and send-later waits for stage notify settings (wave 2).
- **Stage-move emails**: the "Your application has moved to {stage}" email is gone. Only a new rejection emails the candidate, never twice, and never when the candidate is Do not contact (also on the decision path and the offer send).
- **Rejection with reasons** (part): reasons are grouped; "Withdrew" saves as Withdrawn and sends nothing. The AI draft is an action in the email notice. Configurable reasons, notes and send-later wait for wave 2.
- **Blind until submit**: `GET /applications/{id}` computes `blinded` once (any non-cancelled interview on this application where you have not submitted) and hides every other scorecard, the meeting notes and transcripts; it also returns `blindedBy`. `/ai/summarize-application` and `/ai/summarize-interview` refuse while blinded. The Feedback tab and the Overview say which scorecard to submit. Hiring-manager exemption setting not built.
- **Writing a scorecard**: 4-point recommendation (Mixed refused), required rating per competency and a summary, optional notes per competency, strengths and concerns, no overall star (the server derives `Rating` from the weighted competencies or the recommendation). Scale words under the stars. Server drafts (`ScorecardDraft`, `GET/PUT /interviews/{id}/scorecard-draft`) autosave with a "Draft saved" line. The API refuses a scorecard before the interview starts; the page shows "opens when the interview starts" and Open interview prep. Recruiters can enter feedback for an interviewer (`onBehalfOf`, saved with `Scorecard.SubmittedBy`). "Add a correction" adds a dated `ScorecardAddendum`.
- **Scorecard modal shortcut** (merged): `ScorecardModal.tsx` deleted; the form lives on the Feedback tab (`ScorecardForm.tsx`).
- **Panel comparison per interview**: display names, one weighted score row, tinted score chips, click a chip for that competency's notes, written feedback open by default in columns, "waiting on" names.
- **Feedback summary and hiring decision**: tally and "N of M in", Remind and "Enter their feedback" per missing interviewer (`POST /interviews/{id}/remind`, one per person per 6 hours), "Summarize all feedback" (`POST /ai/summarize-application`, submitted scorecards only), a competency × interview grid, and a Decision panel (`HiringDecision`, `POST /applications/{id}/decision`: move forward, make an offer, or reject with a reason) that shows in Activity. The finalist comparison across candidates is not built.
- **Scorecards on the Interviews tab** (merged): removed from the card (one line with a "View feedback" link). The interviews builder is now rewriting that card; it should keep scorecards out.
- **Overview tab**: next-step banner, feedback summary card, application answers (returned as question and answer pairs), resume card (summary, recent roles, skills, Open resume), team notes with names. No offer card. Pinned notes and requirements match are not built.
- **Right rail**: Overview only; inline contact rows with copy buttons, no Last activity, Next interview on `bg-card`, the offer chip as the single offer summary.
- **Next-step banner**: offer waiting for your approval (Approve / Reject inline), your scorecard is due, approved offer not sent, all feedback in with no decision, interview proposed and not booked for 3 days, unread messages. The scheduled rejection case waits for send-later.
- **Record tabs**: Scorecards renamed Feedback (the route stays `/scorecards`). Active-tab scroll, previous and next applicant, and the breadcrumb from the board are not built.
- **My feedback queue**: `GET /me/scorecards?status=due|submitted`, tabs with counts, a list that works on a phone, row goes to the scorecard, "Ended N hours ago" tinted against the organization's reminder days, no limit of 10. The sidebar count badge is not built (platform's AppShell).
- **Kit read view and separate edit route** (merged): one page, `/jobs/[id]/kits/[kitId]`; managers get the editor, everyone else the read view; `/edit` redirects. The kit list says "competencies".
- **Offer panel on the Overview** (merged): `OfferPanel.tsx` and `offer-note.ts` deleted. The Offer tab owns the offer.
- **Offer terms builder**: structured terms on `Offer` (base salary, currency, pay period, bonus, equity, start date, employment type, work mode, location, open until), prefilled from the job, saved on every step (`PUT /offers/{id}` replaces the terms), currencies from `Intl.supportedValuesOf`, full width with a live summary. A declined or withdrawn offer makes room for a revision that starts from it (`ReplacesOfferId`), and earlier offers stay readable. Custom fields and the salary band (needs a job salary range) are not built.
- **Offer approvals**: deep link in every approval email (`{{approvalLink}}`: the Offer tab when the approver can see the job, else Approvals), Remind on waiting approvers (`POST /approvals/{id}/remind`), changing an approved offer sends it back to draft and says so, names instead of email parts, structured terms in `/approvals/mine`. The automatic reminder after N days is not built (`EmailOutboxWorker`).
- **Hire and undo hire**: Send no longer hires (optional email, required off for Do not contact). "Mark as accepted" hires (`POST /offers/{id}/response`), "Mark as declined" records the reason. When the job fills, a banner points to the applicants still active. Undo hire returns the offer to Sent.
- **Load and error states**: the 404 state offers "Back to candidates".
- **Email deep links**: `scorecard-reminder` now names the candidate and links straight to the form (`{{candidateName}}`, `{{scorecardLink}}`).

Not started (need wave 2 or later): stage notify settings and the move dialog, configurable reasons and send-later, note mentions and the activity feed, offer letters, the portal accept flow and expiry, kit versions and the interview library.

## Progress (wave 2)

Finished:
- **Interview kit document editor**: a kit is a name, a length, a stage, rich-text instructions (the shared field editor) and structured competency blocks (name, question, follow-ups, what a good answer shows, weight 1 to 5, share of the score). Blocks carry their competency id, drag to reorder (keyboard too), and show their own errors; nothing is dropped because of a heading name. The page has a sticky save bar with "Unsaved changes", Discard, and a warning before leaving with unsaved work. Headings parsing (`interview-kit-doc.ts`) is gone.
- **Kit versions**: saving a kit that interviews use freezes the old content as a version row (`InterviewKit.VersionOfId`), moves those interviews and their scorecards onto it, and gives the kit new rows with the same competency ids (`InterviewCriterion.CompetencyId`). Scheduled and scored interviews never change; removing a scored competency is now allowed. A kit nobody uses is edited in place. A save with no visible change makes no version. The editor says "N interviews use this version" and links earlier versions still in use, which open read only. Frozen versions and archived kits are not offered when scheduling.
- **Kit templates and question bank**: Settings › Interview library has Templates (whole kits, with an editor that reuses the kit form) and a Question bank (competency, question, follow-ups, good answer, weight, tags; search and tag filter; add, edit, archive, restore). The six old templates are seed rows, and their 22 competencies seed the bank with tags. A new kit starts from a template gallery (or `?template=`); the kit editor has "Add from question bank" (a search side panel), "Save to question bank" on each block and "Save as template". Reads: anyone who manages hiring; changes: admins and recruiters.
- **Interview kit list per job**: rows show the stage, length, competency count, version and "Used in N interviews (M upcoming)". The ••• menu has Move up and down (the order of the rounds), Stage, Duplicate and Archive; an archived kit moves to an "Archived" section with Restore. Archiving is refused with the reason while upcoming interviews use the kit. The empty state starts from the first templates.
- **Record tabs and moving between applicants**: "3 of 12 in Review" with previous and next (K and J) in the header, from `GET /applications/{id}/neighbors`. The stage stays in the address (`?stage=`) so moving someone on keeps your place, and you stay on the same tab. `LinkTabs` scrolls the current tab into view on phones.
- **Team notes**: pinned notes come first on the Overview with a Pinned label, and ••• pins or unpins (the candidates area's `/notes/{id}/pin`). Notes render as Markdown and include notes about the person.
- **Finalist comparison**: "Compare" on the Feedback tab picks up to 3 other applicants on the job (`/applications/{id}/peers`), then `/applications/compare?ids=` shows them side by side: stage, latest decision, offer status (and salary for hiring staff), scorecards in and the calls made, and every competency's average with the best one ringed. Competencies line up by competency id across kit versions. Anyone still owing a scorecard on an applicant sees that applicant's feedback hidden.
- **Record header and stage moves** (the rest): the server queues the stage email itself on every move into an "Always" stage (single and bulk moves; `SendEmail: false` skips it; never for Do not contact), held for a minute so it can be taken back, and returns the queued ids. On the record, moving into an Always or Ask stage opens a dialog with the email the candidate will get (subject, body, the stage's candidate label) and a switch to skip it (on for Always, off for Ask, unavailable for Do not contact); Ask stages send through the jobs area's `/stage-emails`. The toast offers "Don't send" during the wait. Hired is found by stage type everywhere (`StageRules.Hired` in offers; `IsHiredStage` checks `StageType.Hired`).
- **Documents asked for**: the candidate-facing area's `DocumentRequestsCard` sits on the Overview under the resume (editable by people who manage the job, while the application is active).
- **One interview view**: `GET /applications/{id}` returns interviews through `InterviewProjection.Detail`, so the record and the interview page show the same thing. Scorecard corrections and interview creation times come back as `addenda` and `interviewsCreatedAt`. Message read marks in that response are per person.

Not done:
- The kit's two messages (candidate booking and interviewer assignment) are stored but no email uses them, so the editor no longer shows them. The scheduler should either use them or they should be dropped.
- A competency block inside the Plate document (a `/competency` element) needs a `plugins` prop on the shared `DocumentEditor`; the blocks sit under the instructions instead.
- "Copy from another job" and "Suggest competencies from this job's requirements" (AI) are not built; templates and the question bank cover reuse for now.
- Send-later on the move dialog, configurable rejection reasons, offer letters and the portal accept flow remain from wave 1's list.

## Progress (wave 3)

Finished:
- **Offer letter generation**: offer letters live in the one template store (`EmailTemplate`, `TemplateKind.OfferLetter`: name, body, version). Settings › Offer letters (`/settings/offer-letters`, `features/offer-letters`) lists them ("New offers start here" on the first by name) and edits each one with the shared `PlateMarkdownEditor`, offer detail chips and "Insert detail" (candidate name, first name, job title, company, salary, currency, pay period, bonus, equity, start date, employment type, work mode, location, manager, offer open until, your name, and "All terms", a list of only the terms the offer has), beside a live preview with sample details. The standard letter is seeded once (`OfferLetters.EnsureAsync`); the last letter cannot be deleted. API: `GET/POST /api/offer-letters`, `PUT/DELETE /api/offer-letters/{id}`, `POST /api/offer-letters/preview` (edits need the templates permission).
- **The letter on an offer**: a new offer copies the first letter (a revision copies the previous offer's letter) into `Offer.LetterMarkdown`. The offer wizard has a Letter step (Pay, Terms, Letter, Approvers, Review): "Start from" another letter (asks before replacing edits), this candidate's copy marked "Changed for this offer", and the aside shows the letter filled from this offer with the details it is still missing (`PUT /api/offers/{id}/letter`, `POST /api/offers/{id}/letter/preview`). Before sending, "Edit letter" opens the editor in a drawer (approvals stay; the approved terms fill the details).
- **Frozen on send**: `POST /offers/{id}/send` fills the letter and saves it in `Offer.LetterSent`, never changed after (the letter PUT answers 409, and editing a template does not reach it). A letter that needs a detail the offer lacks cannot be sent (400 naming the details). Send also fixes `Offer.ExpiresAt`: the end of the last day in the organization's time zone.
- **Download PDF**: the browser's print, with a print stylesheet in `styles.css` (`print-region`: only the letter prints, dark on white, in either theme). On the Offer tab and the candidate's offer page.
- **Offer email**: the `acceptance` automatic email (key kept for stored wording and workflows) is now "Your offer for {{jobTitle}} at {{company}}" with a one-click signed link to the offer page (`CandidateLinks.CreateAsync`, `/candidate-portal/applications/{id}/offer`).
- **Candidate offer response in the portal**: `/candidate-portal/applications/[id]/offer` (`features/candidate-portal/offer`) shows the letter as a document (company and date on top; the terms alone when the team sent no letter), the deadline in the candidate's time zone with the zone named ("Please answer by Tuesday, December 1 at 11:59 PM EST", and "3 days left" on the answer card in the last week), "Questions? Message the hiring team", and "Download PDF". "Accept offer" asks them to type their full name (any case and spacing) and says plainly it is not a signature on a contract; "Decline offer" takes a reason from the list (required) and an optional note. Accepting hires through the same code as the team's "Mark as accepted" (`AcceptOfferAsync`), keeps the typed name (`Offer.RespondedName`) and prints "Accepted by … on …" under the letter. Both answers notify the recruiters (`NotificationKinds.OfferResponse`) and the team channel. The Home to-do and the application page link to the offer page. API: `GET /public/portal/applications/{id}/offer` (204 when no offer was sent), `POST …/offer/accept`, `POST …/offer/decline` (portal session). The dev seed's `offer@local.dev` offer gained structured terms and a sent letter (fresh dev databases only).
- **Expiry**: past its deadline an offer reads Expired in the portal at once and cannot be answered (409). `OfferExpiryWorker` (every 5 minutes, `AtsEndpoints.ExpireOffersAsync`) sets `OfferStatus.Expired` and tells the recruiters. The Offer tab says it closed and offers "Start a revised offer", and the team can still record a late answer; the Overview banner says "The offer closed before … answered".
- **Decline reasons as a list**: Compensation, Accepted another offer, Role or level, Location or remote, Start date, Personal, Other (`OfferDeclines`). Stored as a key in `Offer.DeclineReason` plus `Offer.DeclineNote`. Free text from before (or from an old client) becomes Other with the text as the note: at startup once (`OfferDeclines.BackfillAsync`) and on every answer (`OfferDeclines.Normalize`). The team's "Mark as declined" uses the same list.
- **Rejection reasons in Settings**: `RejectionReason` (label, Rejected or Withdrawn, order, archived). Settings › Rejection reasons (`/settings/rejection-reasons`, `features/rejection-reasons`): two lists, "We decided not to move forward" and "They decided", drag (or keyboard) to reorder, rename in place, archive and restore, add, "Used for N applications". Renaming also renames it on every application closed with it, so reports keep one group; each group keeps at least one reason. The reject dialog and the Feedback tab's Decision panel read them (`useRejectionReasons`, with the old list as a fallback while loading). The ten seeded reasons include the old eight labels, so existing applications keep working. API: `GET /api/rejection-reasons[?all=true]`, `POST`, `PUT /{id}`, `POST /{id}/archive|restore`, `PUT /order` (changes: admins).
- **Reject cleanup**: the reject dialog lists what is still open and offers "Cancel the upcoming interview(s)" (names and times; interviewers are emailed and calendars updated through the interview cancellation path) and "Withdraw the offer" (says which state it is in; waiting approvals are dropped), both on by default. `PATCH /applications/{id}/stage` takes `cancelInterviews` and `withdrawOffer`. When the rejection email goes, the candidate is not also emailed per interview; with no rejection email, each cancellation tells them.
- **Send later**: the reject dialog has "Email {name}" (off sends nothing) and "When": Now, Later today, Tomorrow morning, Next Monday (9:00 your time) or a picked time. The move dialog has the same "When" for the stage email. `PATCH /applications/{id}/stage` takes `sendAt` (up to 60 days; the outbox's `NextAttemptAt`), and "Ask" stages now send through the move itself (`sendEmail: true`), so both stage kinds schedule the same way. The toast offers "Cancel email"; the Overview banner shows "The rejection email to … goes out Tomorrow, 9:00 AM" with "Cancel email" (`POST /applications/{id}/emails/{emailId}/cancel`, pending rejection and stage emails only). `GET /applications/{id}` returns each email's `nextAttemptAt`.
- **Offer tab**: earlier approval rounds stay readable (`previousRounds`) beside the live round and under the wizard. Accepted says whether the candidate accepted in the portal (with the typed name) or who recorded it.
- Tests: `tests/server/ApiFlow/OfferResponseTests.cs` (letter freezing and missing details, portal accept with the typed name, decline with a reason, expiry in the portal and the sweep, decline reason migration, reject cleanup with a scheduled email and its cancel, send later on an Ask stage, rejection reasons rename and archive). Web check: `node --experimental-strip-types src/features/candidate-portal/offer/offer.check.mjs` (typed name rule, deadline in two time zones, days left).

Not done:
- A reminder email 48 hours before an offer closes.
- Rejection notes ("Other" with a required note), a rendered preview of the rejection email in the dialog, and the same reasons and send-later in the bulk reject modal (`features/applicants/RejectManyModal.tsx`, `features/candidates/CandidatesList.tsx` still use the built-in list, which matches the seeded labels).
- The Decision panel's reject does not offer the interview and offer cleanup yet.
- Letter template versions are counted but have no history view; offers do not record which template version they started from.
- Custom offer fields and the salary band check (wave 1 list).

## Progress (wave 4)

Finished:
- **Offer reminder**: two days before a sent offer closes, the candidate gets the new `offer-reminder` automatic email ("Your offer for {{jobTitle}} closes soon", the deadline in their time zone as `dueDate`, and a one-click signed link to the offer page), and the job's recruiters and the conversation's owner get a notification ("Alex Rivera's offer for Designer closes in 2 days"). Once per offer (`Offer.ReminderSentAt`), only for offers that were open longer than two days, and never an email to someone marked Do not contact (the notification says so). `AtsEndpoints.RemindOffersAsync` runs in `OfferExpiryWorker` before the expiry sweep. The notification kind "A candidate answers an offer" is now "Offer answers and deadlines".
- **Notes on a reason**: `RejectionReason.NeedsNote`. "Other" asks for one (seeded); in Settings › Rejection reasons the ••• menu has "Ask for a note" or "Make the note optional" on any reason, and the row says "Asks for a note". The reject dialog shows a required Note ("Say why, so the team understands later. Pat does not see it.") and keeps Reject disabled until it has one. The API refuses a close without it on `PATCH /applications/{id}/stage` and `PATCH /applications/bulk-stage` (`dispositionNote`, up to 2,000 characters; 400 on `dispositionNote`). Stored in `Application.DispositionNote`, returned by `GET /applications/{id}`, shown under "Rejected at this stage: Other" in the record header, cleared on reopen and on accept.
- **Rejection email preview**: "Preview the email" in the reject dialog shows the subject and the email exactly as it goes out (this job's wording or the AI message, filled with the candidate's details, in the branded layout), through `GET /api/templates/rejection?requisitionId=` and `POST /api/templates/preview`.
- **Decision panel cleanup**: choosing Reject on the Feedback tab offers the same "Close out what is still open" choices as the dialog (cancel upcoming interviews, withdraw the offer; `useCloseOut` and `CloseOutChoices` in `RejectModal.tsx`). `POST /applications/{id}/decision` takes `cancelInterviews` and `withdrawOffer` and uses the same `CloseOutAsync` as the stage move. The decision's "Why" is saved as the note, so a reason that asks for one always has it.
- **Offer letter history**: saving or creating a letter in Settings › Offer letters keeps a version (`EmailTemplateVersion`, keyed by the letter's id). "History" on the letter opens the same drawer as the template editor (`VersionHistoryDrawer` in `features/templates/editor-tools.tsx`): every version with who and when, read it, "Restore this version" (saved as a new version). API: `GET /api/offer-letters/{id}/versions` (a letter saved before versions were kept shows its current wording), `POST /api/offer-letters/{id}/restore`.
- **Pictures in letters**: letters can hold pictures (see the editor kit in `docs/product-audit.md`). A letter template with a picture that has no description cannot be saved, and an offer whose letter has one cannot be sent (400 on `letter`).
- Tests: `tests/server/ApiFlow/EditorAndOfferWave4Tests.cs` (the reminder, once and not for fresh offers; the note rule on the stage move, an admin-chosen reason, reopen, and the Decision panel's reject with cleanup; letter versions and restore). Passing, with the existing reject, decision and stage-move tests.

Not done:
- Offers still do not record which letter version they started from.
- The bulk reject modal (`features/applicants/RejectManyModal.tsx`, candidates and jobs area) must send `dispositionNote` when the reason asks for one: the API now refuses it without. `CandidateBulkEndpoints.cs` closes applications without checking the note.
- Custom offer fields and the salary band check (wave 1 list).
