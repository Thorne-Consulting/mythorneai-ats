# Product audit and completion plan

Started 2026-11-13 on branch `sirshak/feat/design-overhaul`. The rule from the owner: every feature is
either **complete** (the whole thing, at the bar of the best product in its class) or **removed**.
Nothing half done. No legal or compliance work (no payroll, no e-signature law, no background
checks, no webcam proctoring).

## How the audit was done

- Every route (96) was screenshotted at 1440 px and 390 px, and every API endpoint (132) and entity
  was traced.
- Eight reviewers, each a product designer and product owner, read the code end to end for one area,
  looked at every screenshot, and gave every feature a verdict with a "complete means" checklist,
  backend work, libraries and size.
- The full reviews are in [`docs/audit/`](audit/). They are the source of truth for each area's
  build order.

## Verdicts

| Area                                                                     | Features | Complete | Merge  | Remove | Done   |
| ------------------------------------------------------------------------ | -------- | -------- | ------ | ------ | ------ |
| [Dashboard, jobs, pipeline, approvals](audit/jobs.md)                    | 41       | 34       | 5      | 1      | 1      |
| [Candidates, talent, AI matching, search](audit/candidates.md)           | 38       | 33       | 4      | 1      | 0      |
| [Application record, scorecards, kits, offers](audit/evaluation.md)      | 27       | 22       | 4      | 0      | 1      |
| [Interviews end to end](audit/interviews.md)                             | 35       | 27       | 7      | 1      | 0      |
| [Messages, email, templates, notifications](audit/communication.md)      | 38       | 32       | 3      | 2      | 1      |
| [Careers site, apply, candidate portal](audit/candidate-facing.md)       | 38       | 29       | 6      | 1      | 2      |
| [Assessments, workflows, reports](audit/automation.md)                   | 71       | 52       | 11     | 5      | 3      |
| [Shell, settings, people and access, platform](audit/platform.md)        | 29       | 21       | 6      | 0      | 2      |
| **Total**                                                                | **317**  | **250**  | **46** | **11** | **10** |

## What is most wrong today

1. **Things that look finished but hurt people.** The reviewers found these, among others:
   - Calendar sync can silently cancel real interviews and email the candidate.
   - An unconfirmed application can overwrite an existing candidate's record.
   - Every board drag emails the candidate an internal stage name.
   - Sending an offer marks the person Hired.
   - Uploading a cover letter wipes the parsed resume.
   - Candidate email replies are lost.
   - Interviewers can read other scorecards before submitting their own.
   - Export downloads one page of rows.
2. **Duplicate systems.** These come in pairs or triples:
   - two inboxes (a sample-data one in the sidebar)
   - two template systems with different placeholder styles
   - three automation systems (reminder loops, webhooks, a browser-only workflow engine)
   - two schedulers
   - two settings areas, each with a "Notifications" page
   - two saved-view systems
3. **Cramped layouts.** Two sidebars side by side leave about 890 px for content at 1440. Job stage
   tiles cut off, the board shows 3 of 6 columns, the offer wizard gets a 190 px column, and the
   settings nav is taller than the screen.
4. **Meaning hangs on names and strings.** Stage behaviour comes from stage names ("Booked",
   "Hired"), hiring teams are free-text emails, permissions are copied by hand about 180 times in the
   web app, and times are printed in UTC.
5. **Preview screens.** Assessments, the Messages inbox, Workflows, SSO, Invitations, Access requests,
   Team access, Talent pools and Notification preferences run on sample data.

## Decisions that cut across areas

| Decision         | What it means                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One inbox        | `/messages` is the real inbox on `ApplicationMessage`. The application tab renders the same thread. Candidates reply by email through a per-thread reply address. Live updates use SignalR.            |
| One template store | `/messages/templates` holds saved replies and automatic emails, edited in a Plate email editor with detail chips. Hard-coded emails move into it. Offer letters and interview invites use the same variables. |
| One automation engine | Workflows run on the server from `PipelineEvents`. Reminders become built-in workflows. Webhooks, Slack and Teams alerts, and emails become actions. No separate sequences.                       |
| One scheduler    | A full-page scheduler with an availability engine (time zones, working hours, buffers) and self-scheduling links. It replaces the drawer, the modal and "proposed" interviews.                       |
| Stage types      | Pipeline stages get a type (screen, interview, offer, hired), a candidate-facing label and "email on entry". Colours, automation, the portal and cross-job reports read the type, never the name.  |
| People, not strings | Hiring managers, recruiters and interviewers are user accounts with roles on a job.                                                                                                                |
| Permissions once | The server computes permission rules and sends them with `/api/auth/me`. The web app checks them with CASL. Custom roles come later on the same model.                                               |
| Time zones       | Every time shown or emailed is in the reader's zone, with the zone named (`TimeText` on the server).                                                                                                  |
| Rich text        | One Plate editor kit (headings, lists, links, tables, mentions, emoji) and one static renderer. Postings, kits, notes, templates and letters all use it.                                             |
| Layout           | No two sidebars side by side. A record uses tabs under its header. Settings take over the sidebar. Pages with a section nav collapse the app sidebar to icons.                                       |
| Assessments      | A lean, complete product: quizzes, written answers, file take-homes, human-graded code, taken in the candidate portal, results next to scorecards. No webcam. External providers by link.         |
| Recording        | In-app browser recording, then transcript with speakers and timestamps, then an AI summary and searchable playback. A meeting bot is phase two.                                                      |

## Libraries

Installed with exact versions, each at least two weeks old (supply-chain rule).

| Library                                                                          | Version                   | Use                                                         |
| -------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------- |
| `@platejs/list`, `link`, `autoformat`, `mention`, `emoji` and `@emoji-mart/data` | 53.3.13, 53.3.5, 53.0.0, 53.0.0, 53.1.7, 1.2.1 | The shared editor kit                                       |
| `@dnd-kit/core`, `sortable`, `utilities`                                         | 6.3.1, 10.0.0, 3.2.2      | Pipeline board and reordering, with keyboard and touch      |
| `@tanstack/react-virtual`                                                        | 3.14.24                   | Long lists and board columns                                |
| `@casl/ability`, `@casl/react`                                                   | 7.1.0, 7.1.0              | Permission checks in the web app                            |
| `@microsoft/signalr`                                                             | 10.0.11                   | Live messages and notifications                             |
| `nuqs`                                                                           | 2.10.2                    | Filters kept in the URL                                     |
| `libphonenumber-js`                                                              | 1.13.15                   | Phone numbers on apply and profiles                         |
| `@uiw/react-codemirror` and language packs                                       | 4.25.12                   | Code questions in assessments                               |
| `Ical.Net`                                                                       | 5.2.3                     | Calendar files in interview emails                          |
| `Markdig`                                                                        | 1.5.1                     | Markdown to email HTML                                      |
| `EmailReplyParser`                                                               | 2.0.1                     | Strip quoted history from email replies                     |
| `FFMpegCore`                                                                     | 5.5.0                     | Seekable recordings and audio for transcription (needs the `ffmpeg` binary) |
| `Pgvector.EntityFrameworkCore`                                                   | 0.3.0                     | Ranking at scale                                            |
| `ClosedXML`                                                                      | 0.105.1                   | Excel import                                                |

Rejected: FullCalendar and react-big-calendar (our calendar is close), Elsa, Hangfire and Quartz
(the outbox worker pattern is enough), tus (chunked upload is simple here), webcam proctoring
(legal).

## Build waves

Each wave runs one builder per area in parallel, on separate files. Every builder reads its area
review and follows its build order. Status is kept here.

### Foundations (done before wave 1)

- [x] `AtsDbContext` is partial; each area adds `Data/AtsDbContext.<Area>.cs` and
      `IEntityTypeConfiguration<T>` classes.
- [x] `TimeText` helper with tests, and `TimeZone` on users and candidates.
- [x] Bad input returns 400, not 500.
- [x] Libraries above installed and pinned.

### Wave 1: stop the harm, fix the layout

Every area's step 1 (bugs and false promises), the merges and removals that need no new model, and
the layout fixes (job tabs, settings IA, sidebar collapse). A dedicated builder owns the shared
editor kit and the posting renderer.

### Wave 2: shared models

Stage types, users on jobs, the notification table, the one template store and email editor, the
thread model and real inbox, permissions on the server and CASL in the web app, and the availability
engine.

### Wave 3 and later: complete each area

Each area's remaining build order, in its own sequence: offers end to end, feedback and debrief,
the interview page, scheduler and recording, reply by email and live updates, the workflow engine,
assessments, reports, careers branding and SEO, and portal sessions.

## Conventions for builders

- Read [`src/web/CLAUDE.md`](../src/web/CLAUDE.md) and your area review first.
- New entities: put them in your area's `Domain` file, add `Data/AtsDbContext.<Area>.cs` and a
  configuration class, then run the shared migration script. Never commit a migration named
  `WorkInProgress`; it is renamed at the end of each wave.
- Do not install packages; ask for one in your report.
- Shared UI: add new components to `components/ui` and its index; do not change an existing
  component's props without keeping old callers working.
- Every behaviour change gets a check: a backend test in `tests/server` or a `*.check.mjs` next to
  the logic.

## Editor kit progress

- **RichText (done).** `import { RichText } from '@/components/rich-text'` then
  `<RichText markdown={text} className="text-md" empty={<p>None yet</p>} />`. It renders stored
  Markdown read-only: headings, paragraphs, bold, italic, underline, links (http, https and mailto
  only, opening in a new tab with `rel="noopener noreferrer"`), bulleted, numbered and task lists,
  quotes, code, rules, tables and chips. No hooks and no random ids, so it works in server and
  client components with identical markup. Body text inherits the container's size. Check:
  `node src/web/src/components/rich-text/RichText.check.mjs` (render, link safety, stable output and
  a Markdown round trip of lists, links, tables, underline and chips).
- **Headings (done).** `heading-node.tsx` and `heading-node-static.tsx` share one `headingVariants`
  on the token scale (h1 `text-2xl` bold down to h6 `text-sm`). All three editors and the renderer
  show real headings again.
- **Postings (done).** `JobPostingView` renders the description with `RichText`. Same props, so the
  careers page, the create-job preview, the Posting tab and the gallery all render Markdown.
- **Interview kit read view (done).** `InterviewKitView` uses `RichText`; no hydration error. The kit
  editor puts the document before the save checklist on phones.
- **One editor kit (done).** `components/plate/editor/plugins/editor-kit.tsx` exports `EditorKit`,
  used by both `PlateMarkdownEditor` (field with a fixed format bar) and `DocumentEditor` (page
  with "/" blocks and a format bar over selected text). It adds lists (`@platejs/list` +
  `@platejs/indent`, "- ", "1. ", "[] " shortcuts, Tab and Shift+Tab to nest; Tab elsewhere still
  moves table cells or focus), links (`@platejs/link`: paste a web address over selected text, ⌘K
  link box, typed addresses link on space, only http, https and mailto), emoji (`:` then two letters,
  and a picker button) and chips (`@platejs/mention`). Both editors kept their props; their first
  render uses counted ids, so server and browser markup match. Shortcuts use each plugin's own
  `inputRules`: `@platejs/autoformat` is deprecated in Plate 53 and is not used.
- **Chips, for notes and templates.** Pass `chips={{ people, details }}` to either editor, each a
  list of `{ key, text, group? }`. "@" picks from `people` and is stored as `[Name](mention:key)`;
  "{" picks from `details` and is stored as `{{key}}`. Lists can change without rebuilding the
  editor. `RichText` shows `{{firstName}}` as a "First name" chip.
- **Gallery (done).** `/design#editors` shows the field editor beside its `RichText` output, and the
  document editor beside the Markdown it saves.
- **Not done (wave 1).** Code blocks only arrive from Markdown or a paste (typing one needs
  `@platejs/code-block`). No "Insert detail" menu button yet; the email editor (wave 2) can add one
  on top of `ChipItemsContext`. (Both done since: code blocks below, "Insert detail" in
  `features/templates/editor-tools.tsx`.)
- **Pictures (wave 4, done).** Both editors take pictures: the Picture button in the format bar,
  "/" then Picture in the document editor, paste, or drag and drop. PNG, JPEG, GIF or WebP up to
  5 MB; the server checks the first bytes, not the name (`POST /api/media/images`,
  `Features/Media/MediaEndpoints.cs`), stores the file with `LocalFileStore` as `media-{id}.{ext}`
  and serves it to anyone at `/public/media/{id}.{ext}` with a one-year immutable cache, so it works
  on the careers site, in the portal and in mail apps. Markdown stays the format:
  `![description](/public/media/{id}.png?size=1200x800)`; the size in the address gives `RichText`
  (and emails) the width and height, so nothing jumps while it loads. The picture shows at once from
  the file while it uploads, and its description field takes focus; the field stays red until it
  is filled, Enter goes back to writing, and ✕ removes the picture. **A description is required
  before saving**: call `imageProblem(markdown)` from `@/components/editor/images` in a save handler
  (it also catches a picture still uploading), and refuse on the server with
  `MediaEndpoints.HasImageWithoutAlt` (templates, offer letter templates and offer send do).
  Turn pictures off with `images={false}` on either editor (saved replies and the message composer
  do; a `singleLine` subject never has them). Emails get absolute addresses from the organization's
  public address (`EmailHtml.Body(…, root)`), sized to the column.
- **Code blocks (wave 4, done).** `@platejs/code-block`: type ``` on a new line, or "/" then Code
  block. Enter adds a line (with the indent above), Enter on an empty last line leaves the block,
  Tab indents. A language menu sits at the top of the block (Plain text, Shell, C#, … YAML) and is
  stored as the fence's word (```` ```python ````); `RichText` and the read-only editor show it as a
  label (`ts`, `js`, `py` and friends read as TypeScript, JavaScript, Python). No syntax colours
  (`lowlight` is not installed). Emails show them in a grey box.
- **Gallery (wave 4).** `/design#editors` samples a picture and a Python code block in both editors
  and in `RichText`. Check: `node src/web/src/components/rich-text/RichText.check.mjs` (pictures
  with size and description, a `javascript:` picture refused, the code block's language label,
  the Markdown round trip of both, and `imageProblem`).
- **For other areas.** Pictures are on by default everywhere the editors are used. Job postings,
  kits, notes, the careers intro and assessments should add the `imageProblem` check to their save
  (and `HasImageWithoutAlt` on their endpoints), or pass `images={false}` where a picture makes no
  sense. Uploaded pictures are never deleted (ponytail: sweep unused ones if storage matters).

## Coordinator notes before the first commit

These must happen before any of this work is committed.

- **Squash the migrations.** Done on 2026-11-14: the ten `WorkInProgress_*` migrations are one
  migration, `ProductCompletionProgram`, generated from the final model. EF guessed a rename of
  `Users.Department` to `WorkingHoursJson`; that was replaced by add, copy into `Departments`, and
  drop. The migration also fills `Notes.CandidateId` from each note's application. Earlier notes:
  Builders added many `WorkInProgress_<timestamp>` migrations. Replace
  them with named migrations generated from the final model. The squashed migration must carry these
  data steps, which the dev database got by hand:
  - `UPDATE "Users" SET "Departments" = ARRAY["Department"] WHERE "Department" IS NOT NULL` before
    `Department` is dropped (platform).
  - Stage types, candidate labels, template stages and job members are back-filled at startup by
    `StageRules.BackfillAsync` and the member migration (jobs), so no SQL is needed for those.
  - Existing offer decline reasons move to the fixed list as Other with the text as the note
    (evaluation, wave 3).
  - `UPDATE "RejectionReasons" SET "NeedsNote" = true WHERE "Label" = 'Other'` after the
    `NeedsNote` column is added (evaluation, wave 4; new databases seed it).
- **Permission sweep.** Replace the remaining `user.role` checks in feature files with `useAbility()`
  calls. The platform builder's list is in `docs/audit/platform.md` (Progress, wave 2). Then remove
  `user.permissions`.
- **Unused fields.** `InterviewKit.CandidateMessage` and `InterviewMessage` are being dropped
  (integration builder); `PipelineTemplate.StageNames` can be dropped once the backfill no longer
  needs it.
- **External test side effect.** Two WorkOS organizations were created in the real WorkOS
  environment by a test before the SSO endpoints were guarded to WorkOS mode only. Delete them in
  the WorkOS dashboard.
- **Production setup.** Install `ffmpeg` and `ffprobe` in the API image (recording). Set
  `DataProtection:KeyPath` to a persistent folder (booking links, already in `compose.yaml`). Set
  `RESEND_INBOUND_DOMAIN` for reply by email. Route `/api/hubs/*` WebSocket upgrades if a proxy sits in
  front of Next.

## Cleanup (wave 4)

Hand-overs from the finished builders, done in one pass.

### Picture descriptions on every save

Pictures stay on by default in both editors. Each field that saves Markdown now either checks
descriptions (web: `imageProblem(markdown)` from `components/editor/images.ts`; server:
`MediaEndpoints.HasImageWithoutAlt`, which answers 400 with "Describe every picture…") or has
pictures turned off.

| Field | Decision | Where |
| --- | --- | --- |
| Job posting (Posting tab) | Check | Red editor and the sentence under it on Save posting (`JobSections.tsx`); `PUT /requisitions/{id}` (`description`) |
| Create-job wizard | Check | The posting step cannot continue and says why (`posting` in the wizard's errors, `CreateRequisitionPage.tsx`); `POST /requisitions` |
| Posting templates | Check | Server on header, description and benefits (`POST/PUT /posting-templates`). Web: see the hand-over below |
| Interview kits and kit templates | Check | `validateKit(draft, imageProblem(draft.instructions))` shows it under Instructions in both editors; `InterviewKits.Validate`, which kits and templates share |
| Candidate notes | Off | `images={false}`: a note is a quick message; files belong on the Files tab |
| Application notes | Off already | A plain text box (`NoteModal.tsx`) |
| Careers site intro | Check | On Save changes (`CareersSiteSettings.tsx`); `PUT /careers-site` (`introMarkdown`) |
| Assessments (instructions, question prompts) | Check at publish | In "Before you publish" (`AssessmentBuilder.tsx`) and the server's publish problems (`AssessmentScoring.Problems`, external tests included for instructions). Drafts still save with problems, as before, but a save waits while a picture is still uploading so no `blob:` address is stored |
| Offer letters and templates | Check (done in wave 4) | Unchanged |
| Workflow email steps | Off already | A plain text box with no picture button. "Check for problems" still flags a typed `![](…)` with no description (`WorkflowGraph`) |
| Bulk email | Check (extra) | Pictures are on there (communication's choice), so Send waits for descriptions; `POST /messages/bulk` refuses |
| Saved replies, message composer, subjects | Off already | Unchanged |

**Hand-over (platform builder's file):** `features/admin/PostingTemplateEditor.tsx`, add to
`problems`: `imageProblem([draft.header, draft.description, draft.benefits].join('\n\n'))` with
`import { imageProblem } from '@/components/editor/images';`. Until then the server's sentence shows
in the "Could not save the template" toast.

### Bulk reject notes

`RejectManyModal` shows the required Note when the chosen reason asks for one ("Say why, so the team
understands later. The applicant does not see it.") and keeps Reject off until it has one. The note
goes as `dispositionNote` only for such a reason, so a note typed before switching reasons is not
sent. `POST /candidates/bulk` takes `dispositionNote`, refuses a reject without the note its reason
asks for (`RejectionReasons.NoteProblemAsync`, the stage move's rule, 400 on `dispositionNote`) and
stores it on every application it closes. The choice is built by `rejectManyChoice` (pure, exported
from the modal). Checks: `src/features/applicants/reject-many.check.mjs`; test
`Bulk_reject_needs_the_note_its_reason_asks_for`.

### The email id from `EmailTemplates.QueueAsync`

- `WorkflowEngine`, Reject step: uses the returned id. "and emailed the candidate" now means an email
  was queued, and the step's data lists only its own email (it listed every email added in that unit
  of work, which the activity feed then attached to the step).
- `WorkflowEngine`, other steps: they keep comparing the added rows before and after, because they
  queue through helpers that return no id (`AssessmentFlow.QueueEmailAsync`,
  `QueueScorecardReminderAsync`, `Notify.AddAsync`, `CreateInviteAsync`) or add several emails.
- `SchedulingEndpoints`: nothing to switch. It never calls `QueueAsync`; `PendingEmails` reads the
  unsaved rows `InterviewMailer` added, to preview them, and returns before saving. Switching would
  need the mailer to return its rows.

### Unused pictures are swept

`MediaSweepWorker` (registered in `Program.cs`) runs ten minutes after start, then daily:
`MediaEndpoints.SweepAsync(db, files, now, dryRun, ct)` deletes `media-*` files older than seven
days that no stored text mentions, and returns their names. It reads every text column of every
table that mentions `/public/media/` (from the EF model, so new Markdown fields are covered without
a list to keep), which keeps pictures in templates, versions, postings, kits, notes, assessments,
letters, the careers site, drafts, workflows and emails already sent (mail apps still load them).
Candidate files never match the `media-` prefix. `LocalFileStore.Files(prefix)` lists them.
Ceiling: one `LIKE` scan per table a day; keep a table of picture uses if that gets slow. Test:
`Unused_pictures_a_week_old_are_swept_and_a_dry_run_deletes_nothing`.

### Offers keep their letter version

`Offer.LetterTemplateVersion` (int, null for offers made before). Set from the letter's `Version`
when an offer starts from the default letter, copied by a revision, and set again when someone picks
a letter on the offer (another letter, or this one when the text is its wording today); edits for
this offer keep the version they started from. `GET /applications/{id}/offer` also returns
`letterTemplateName`. The Offer tab reads "Started from “Standard offer letter”, version 3." under
the letter's heading ("a deleted letter" when it is gone). Test:
`An_offer_keeps_the_letter_version_it_started_from`.

### Who manages assessment invites

Every invite row (`GET /assessments/{id}/invites`, `/assessment-invites/to-review`,
`/applications/{id}/assessments`) has `canManage`: whether the reader manages that row's job. The
menu shows Send reminder, Change deadline, Allow a retake and Revoke only then (open result and
Grade stay); the Invited tab hides an empty ••• menu and turns off selection when nothing is
manageable, and the bulk reminder skips rows the reader cannot manage. Test:
`A_job_viewer_reads_assessment_invites_without_managing_them` (a viewer on the team gets
`canManage: false` everywhere and 404 on remind).

### Pipeline cards

With dragging off, the card no longer gets dnd-kit's `aria-roledescription="draggable"` or its
`aria-describedby` drag instructions (`PipelineBoard.tsx`).

### Suite run

Run on 14 November with every builder's work in the tree, through `dev-test.sh` in batches.

- Unit classes (`--filter-not-class "*ApiFlowTests"`): 122 of 123 pass; 1 skipped
  (`ResumeParsingQualityTests` needs a real `OPENAI_API_KEY`, by design).
- `ApiFlowTests` in six batches by method name (it is one partial class, so a class filter would run
  all of it at once): 163 of 163 test cases pass, including the five new ones in
  `tests/server/ApiFlow/CleanupWave4Tests.cs`.
- Web: all 33 `*.check.mjs` files pass (including the new `reject-many.check.mjs` and the picture
  case added to `library-model.check.mjs`), `src/lib/cn.ts` passes, and `npx tsc --noEmit -p .` is
  clean.
- Nothing failed, so nothing else to list.

Entity change: `Offer.LetterTemplateVersion`, in migration `WorkInProgress_20261114173449`. That
migration also picked up the platform builder's pending `CustomRoles` table and `Users.CustomRoleId`,
which were in the model but not yet migrated.
