# Candidates, talent pools, resumes, AI matching and search

## Overall
- **The list page spends its first 460px on things that do not help you find a person.** At 1440 the order is: page header, 4 stat cards (labels cut to "Total candidat…", "Active applicat…"), a full-width AI "Describe who you need" bar, a search/job/sort row, then "More filters" wrapped onto a third row on its own. The column, density and Export buttons float right at a different height (y≈420 against the search row at y≈397). On a 390 phone the four stat cards stack to roughly 560px, and the first table row starts below 1,000px. The stat cards show the same numbers on every segment: "Hired" still says "In interview 12".
- **The candidate record is a viewer, not a workspace.** The header has one action ("Add to a job"). You cannot edit a name, email, phone, tags or "do not contact", even though `PUT /api/candidates/{id}` exists. Nothing in `src/web` calls it. You cannot delete a candidate, merge a duplicate, write a note, send an email or see any activity at candidate level. Notes, messages, interviews and scorecards live only on each application, so a sourced person with no job yet ("Frankie First-Year", "Taylor Morgan") cannot have a note at all.
- **Say-it-once is broken across the profile.** The stage badge and job sit in the header and again in the Overview "Applications" card. The Applications tab repeats that card as a table. The Files tab repeats the "Documents" rail card. The rail shows on every tab, so the Files tab shows the documents twice. The "Possible duplicates" card lists 8 people who share the seeded phone `+1 555 0100`, and it has no action.
- **Several things look finished but are wrong underneath:**
  - Export downloads only the 25 rows on the current page.
  - The Rejected and Withdrawn segments show "Casey Morgan · Review", because a row always shows the latest application, not the one that matched.
  - Bulk Move and Reject skip people selected on other pages.
  - Header search finds "Blake" but not "Blake Rivera".
  - Any file uploaded to a profile (a cover letter, say) is read as a resume and replaces the parsed profile.
  - Turning AI off hides nothing in the app.
- **AI is spread over five surfaces that use different numbers:**
  - the "Describe who you need" bar (sets filters)
  - "Rank for this job" (a 0–100 "Score")
  - the "AI match %" column (a separate LLM fit score)
  - "Why they rank here" (FitDrawer)
  - an unused `GET /requisitions/{id}/suggested-candidates`

  A recruiter sees "Score 72" and "AI match 65%" on the same row with no explanation.
- **Target experience.** One list page (Ashby or Gem style):
  - a left rail of segments, pools and views, each with a live count
  - one toolbar row: search with an "Ask AI" mode, Job, Sort, Filters (n), and removable filter chips beneath
  - a dense table with a sticky ••• column and a right-hand preview that has real actions
  - filters kept in the URL

  A profile works like a Lever or Greenhouse record: identity header with Email, Schedule, Add to job and a ••• menu (Edit, Tags, Add to pool, Merge, Do not contact, Delete), and a main column that is an activity feed with a note composer across every application. Resume and Files tabs, and a slim rail of editable facts.

## Features

### Candidates hub navigation (All, Active, Hired, Rejected, Withdrawn segments) — COMPLETE · S
- Where: `/candidates`, `/candidates/{active,hired,rejected,withdrawn}`. Files: `features/candidates/CandidatesHub.tsx:61-100`, `list-route.tsx:16-21`, `candidate-filters.ts:70-75`. Server: `GET /api/candidates?status=` in `Features/Candidates/CandidateEndpoints.cs:66-79`.
- Today: segments filter people who have *any* application with that status. The row still shows `person.applications[0]`, the most recent one (`CandidatesList.tsx:391-394`). On Rejected and Withdrawn, Casey Morgan shows a purple "Review" badge (screenshots `desktop-light_candidates_rejected.png`, `_withdrawn.png`). The segments have no counts. On a phone the rail becomes a native `<select>`, which is fine.
- Design critique: with no counts, the rail cannot answer "how many?". That is the only reason the stat cards exist. "Talent pools · Preview" sits beside real segments and invites a click into sample data. `/candidates/views/x` (a deleted view) renders the global "Page not found" with no hub around it, and its button says "Back to dashboard".
- Product critique: Ashby and Greenhouse show counts on every saved list and segment. There is also no segment for prospects, meaning people in no job. That is the core sourcing list, and today it can only be found by scrolling to "No job yet" rows.
- Complete means:
  - [ ] A count badge on every segment, pool and saved view, from one `GET /api/candidates/counts` call.
  - [ ] The row shows the application that matched the segment (pass `status` into `shownApp`), with "+2 more" kept.
  - [ ] A "Not in a job" segment (`hasApplications=false`).
  - [ ] An unknown view id redirects to `/candidates` with a toast ("That view was deleted"), or a `not-found.tsx` inside `(hub)` keeps the shell.
- Backend: a counts endpoint (one grouped query over scoped applications, plus `NOT EXISTS` for prospects), and a `hasApplications` filter on `GET /api/candidates`.
- Libraries: none.

### Headline stat cards on the list — REMOVE · S
- Where: `CandidatesList.tsx:1098-1127`, using `/api/dashboard` and a second unfiltered `/api/candidates` call (`:464-472`).
- Today: four cards (Total, Active applications, In interview, At offer) that ignore the segment, the filters and the saved view. Labels truncate at 1440. On a phone they take a full screen.
- Why remove: they repeat the Dashboard and cost two extra requests on every list load. Counts in the segment rail (above) answer the same question in the place you click. Remove the `everyone` and `dashboard` queries with them.

### Candidate list table — COMPLETE · M
- Where: `CandidatesList.tsx:781-927` (columns), `:1035-1063` (DataTable), `components/data-table/DataTable.tsx`.
- Today: avatar, name and email; "Applied for" with department and "+N more"; an optional AI match column; Source; Applied date with "Last active"; Stage; and a ••• menu. Click opens a preview at `lg` and up. Enter and double-click open the profile. Arrow keys walk rows. Column picker and density work. No header sorting, because no `sortValue` is set (sorting is server-side through the Sort select).
- Design critique:
  - At 1440 on All and Active, the ••• column is off-screen to the right (compare `desktop-light_candidates.png` with `_hired.png`, where it shows). Long job titles push it out. Make the actions column `sticky right-0 bg-card` and truncate "Applied for" at `max-w-[220px]`.
  - Source wraps to two lines ("Career / site", "Job / board") at `:851-856`. Add `whitespace-nowrap`, or hide Source by default and leave it in the column picker.
  - "Applied" packs two time ideas into one cell. Show only "Last active" and move the applied date into the tooltip.
  - On a phone the table scrolls sideways with only the name visible. Below `sm` it should become stacked rows (avatar, name, job and stage badge on one line).
  - Unread messages and "stalled" flags are returned by the API (`CandidateEndpoints.cs:214-218`) but never shown.
- Product critique: Greenhouse and Ashby show "needs attention" signals on the row: unread reply, stalled for N days, interview today. We already compute two of these and throw them away. There is no "Newest added" sort and no "AI match" sort.
- Complete means:
  - [ ] Sticky ••• column, no wrapping in narrow columns, a card layout below `sm`.
  - [ ] An unread-messages dot and a "No movement in N days" amber chip on the stage cell.
  - [ ] Sorts: "Newest added", and "Best match" when a job is chosen.
  - [ ] Column choice saved with a view (see Saved views).
- Backend: add `createdAt` and `fit` sorts to `GET /api/candidates`.
- Libraries: none. DataTable is enough.

### Keyword search in the list (search quality) — COMPLETE · M
- Where: toolbar `CandidatesList.tsx:931-936`. Server `CandidateEndpoints.cs:132-150`, ranking at `:162-167`.
- Today: every word must match the resume (`to_tsvector('simple', ResumeText)` computed per row, per query, with no index) or ILIKE on name, email, title, location, tags and skills. There is no typo tolerance, though `docs/resume-parsing.md` rule 3 promises "typo-tolerant search". `pg_trgm` is on, but `Candidates` has no trigram index. Phone numbers are not searchable. Results do not say *where* the word matched.
- Product critique: Gem and Ashby show a snippet ("…led the **React** migration…") under each hit, and they rank name hits above resume hits. "jordn" should find Jordan Lee.
- Complete means:
  - [ ] Name and email hits rank first, then title and skills, then resume text.
  - [ ] Typo-tolerant names (trigram similarity of 0.3 or more).
  - [ ] Phone digits match.
  - [ ] A one-line highlighted resume snippet on the row when the match came from the resume (`ts_headline`).
  - [ ] Quoted phrases ("product designer") use `phraseto_tsquery`.
- Backend: a migration adding a stored generated `tsvector` column on `Candidates` (weights A name, B title and skills, C resume) with a GIN index; GIN trigram indexes on `FirstName`, `LastName` and `Email`; a normalized `PhoneDigits` column.
- Libraries: none. Postgres FTS and `pg_trgm` are already there.

### Filters: job, stage, sort and "More filters" — COMPLETE · M
- Where: `CandidatesList.tsx:489-618` (popover), `:929-975` (toolbar), `candidate-filters.ts`.
- Today: the server applies 18 filters correctly. Problems:
  1. Filters live only in React state. Refresh, Back, or sharing the link loses them, and `list-route.tsx` reads only `?job`.
  2. Active filters show only as a count badge on "More filters", so you cannot see what is narrowing the list without opening the popover.
  3. The Source select uses a fixed list of 9 values (`:85-95`), but source is free text everywhere else. CSV rows default to "Import" and resume imports to "Resume import", so those people cannot be found by source.
  4. Stage appears only after a job is picked, which is right, but in rank mode Stage still shows and is ignored.
  5. Hiring managers get filters but no "Save view", because Save view sits inside the staff-only describe bar (`:620`).
- Design critique: three rows of controls at 1440 (see Overall). Target is one row: Search (flex-1) · Job · Sort · Filters (n), with the table tools on the same row and chips below.
- Product critique: Ashby, Linear and Gem show each filter as a removable chip ("Skills: React, TypeScript ×", "Seniority: Senior and up ×") plus "Clear all". Gem lets you OR within a field and AND across fields.
- Complete means:
  - [ ] All filters in the URL (`/candidates?skills=react,typescript&seniority=Senior`). Back and refresh keep them, and the link is shareable.
  - [ ] A chip row under the toolbar, with one chip per active filter, each removable, and "Clear all".
  - [ ] Source options come from the managed source list (see Sources).
  - [ ] A Tags filter separate from Skills.
  - [ ] A filter on custom fields of select type.
  - [ ] "Save view" available to every role that can see the list.
- Backend: `GET /api/candidates?tags=` (today tags are folded into `skills`); select-type custom-field filters through `CustomFieldsJson ->> key` (jsonb); `/api/candidates/sources` (distinct values).
- Libraries: `nuqs@2.10.3` for typed URL state in the Next app router. It replaces hand-syncing `useState` with `searchParams` for 18 keys and handles shallow routing and Back.

### AI "Describe who you need" (natural language to filters) — COMPLETE · S
- Where: `CandidatesList.tsx:241-280`, `:620-678`. Server `POST /api/ai/search-filters` (`Features/AI/AiEndpoints.cs:45-91`).
- Today: works. The AI fills 10 filter keys silently, and the user sees only "More filters 4". The bar shows even when AI is turned off or no key is set: no frontend file outside `features/admin` reads `aiEnabled`, so the call fails with a 503 toast. The Delete view and Update view buttons live inside this AI bar (`:645-676`), which makes no sense.
- Product critique: Gem and Ashby AI search show "Here's what I understood" as chips you can edit. With no job chosen, the backend can rank on meaning (`/talent/rank` accepts a query with no job, `RankingEndpoints.cs:178-182`), but the UI never uses it.
- Complete means:
  - [ ] Fold the bar into the search input as an "Ask AI" mode (a sparkle toggle at the right of the search field), not a separate full-width row.
  - [ ] After it runs, the chips row shows what was set. One click undoes all of it.
  - [ ] With no job, results are ranked by meaning within those filters (call `/talent/rank` with `query`).
  - [ ] Hidden when the organization has AI off or no key. Expose `aiAvailable` on the current-user payload.
  - [ ] View actions move to the view header menu (see Saved views).
- Backend: add `aiAvailable` (configured and enabled) to the `/api/me` or session payload.
- Libraries: none.

### Rank everyone for a job ("Find candidates") — COMPLETE · L
- Where: `/candidates?job=…` (linked from the job header, job overview and pipeline). `CandidatesList.tsx:224-238`, `:680-777`, `:1064-1094`. Server `POST /api/talent/rank` (`Features/AI/RankingEndpoints.cs:168-305`), `EmbeddingWorker.cs`.
- Today: blends keyword coverage of the job's confirmed requirements (40%) with cosine similarity of embeddings (60%), filtered by min years and location. Problems:
  - It loads up to 3,000 candidates **with full resume text and 1,536-float vectors** into memory per request (`:205`), using `Take(3000)` with no order. Past 3,000 people, who gets ranked is arbitrary.
  - Only `minYears` and `location` reach the ranker (`CandidatesList.tsx:229-237`). Skills, seniority, degree, company, school and source from "More filters" are still shown and silently ignored.
  - Bulk actions in rank mode are Compare only. You cannot add 10 people to the job at once.
  - `EmbeddingWorker.cs:125,138` re-embeds whenever `UpdatedAt` moves. Once editing exists, every tag or phone edit costs an AI call.
  - `GET /requisitions/{id}/suggested-candidates` (`:438-470`) has no caller in `src/web`.
- Design critique: "Score" (a light 18px number) and "AI match %" (a second line under "This job") are two different scores on one row with no legend. "Back to the list" with an X icon reads as close.
- Product critique: Ashby and Gem show one match number, its basis ("Meets 5 of 6 must-haves"), and a "why" popover inline. They let you bulk-add or bulk-email the top 20 and remember who you skipped.
- Complete means:
  - [ ] One "Match" number per row. A popover shows must-haves met or missing (from `matched` and `missing`, already returned) and the AI fit if one has been run.
  - [ ] Every list filter applies before ranking.
  - [ ] Bulk "Add to this job", "Dismiss", "Add to pool".
  - [ ] An inline "Requirements not confirmed" banner with a link to the job's Requirements page (today it is a warning `Alert` with no link).
  - [ ] A "Rank" sort option in place of a separate mode, so the table stays the same table.
  - [ ] "People who fit from past jobs" on the job overview, using the existing `suggested-candidates` endpoint, or delete the endpoint.
- Backend: store embeddings as `vector(1536)` with an HNSW index and do the top-k in SQL, then apply filters. Re-embed only when the resume text hash changes (compare `ResumeTextHash`, not `UpdatedAt`).
- Libraries: `Pgvector.EntityFrameworkCore@0.3.0` (needs the `vector` extension). It replaces the in-memory cosine loop and the 3,000 cap with an indexed nearest-neighbour query.

### Dismiss for this job — COMPLETE · S
- Where: `CandidatesList.tsx:340-362`, `:1202-1230`. Server `POST/DELETE /requisitions/{id}/dismissals` (`RankingEndpoints.cs:376-420`).
- Today: works one row at a time, with a required free-text reason. "Show dismissed (n)" brings dismissed people back, faded.
- Product critique: Gem's "Not interested" offers preset reasons in one click. Dismissals never show on the candidate's profile, so another recruiter can add the same person to the job without knowing.
- Complete means:
  - [ ] Preset reasons (the same list as rejection reasons) plus "Other".
  - [ ] Bulk dismiss.
  - [ ] Dismissals show in the candidate activity feed and as a note in the "Add to a job" modal.
- Backend: include dismissals in the candidate activity feed. Add a bulk endpoint.

### AI fit assessment and "AI match" — COMPLETE · M
- Where: `features/talent/FitDrawer.tsx`, the AI match column `CandidatesList.tsx:829-849`, `CandidateCompare.tsx:53-58`. Server `POST /requisitions/{id}/fit/{candidateId}` (`RankingEndpoints.cs:307-374`), entity `JobFit` (`Domain/AiRecords.cs`).
- Today: on demand, one person at a time, only from the rank-mode ••• menu. Cached by a hash of resume and requirements. The result is a requirement-by-requirement table (met, partial, missing, unknown) with evidence and concerns. The column only appears once some fit exists. Compare reads fit scores from whatever list pages happen to be in the TanStack cache, so a pasted compare link shows no AI match.
- Product critique: Ashby's AI-assisted review lives on the application, where the reviewer decides, not in a sourcing menu. Greenhouse shows a requirement checklist beside the resume.
- Complete means:
  - [ ] A "How they fit" card on the application page and in the list preview, with a "Check fit" button and staleness ("Resume changed since this was checked").
  - [ ] "Check fit for the top 25" in rank mode, run in the background.
  - [ ] Compare and the list read fit from the server, not the cache.
  - [ ] The drawer's evidence links to the line in the typeset resume.
- Backend: `GET /api/applications/{id}/fit`. A batch endpoint that queues fits (reuse the `ResumeParseJobs` pattern as a `FitJobs` table plus a worker). Include `fitScore` on `GET /api/candidates/{id}` applications.
- Libraries: none.

### Candidate preview side panel — COMPLETE · S
- Where: `features/candidates/CandidatePreview.tsx`, `SplitView` in `CandidatesList.tsx:1129-1163`.
- Today: a good fact sheet: years, level and degree tiles; applications; experience and education with "show people like this" filter links; skills, contact and source. Actions are only "Open profile" and "Copy email". Arrow keys move it. It opens only at `lg` and up.
- Product critique: Superhuman-style triage (Ashby's "Review" mode) puts Advance, Reject, Email and Add note in the panel with keys. Today the recruiter must open the full profile for anything.
- Complete means:
  - [ ] Panel actions: Add to job, Email, Add tag or pool, Reject (when a job is chosen), and a ••• menu.
  - [ ] Next and previous buttons with a "3 of 25" position.
  - [ ] A resume thumbnail or "Read the resume" link.
  - [ ] Shortcut hints (J and K, E for email).
- Backend: none.

### Row actions (••• menu) — COMPLETE · S
- Where: `CandidatesList.tsx:891-926`.
- Today: Open profile, "Open {each job}", Copy email, and "Reject from {job}…" (managers).
- Complete means:
  - [ ] Add to job, Add to pool, Edit tags, Mark do not contact, Email.
  - [ ] Group the per-job entries under one "Applications" submenu, so a 5-job person does not get a 9-item menu.
- Backend: none beyond the edit endpoints below.

### Bulk actions — COMPLETE · M
- Where: `CandidatesList.tsx:977-1025`, `:409-417`, `:287-326`. `features/applicants/RejectManyModal.tsx`. Server `PATCH /api/applications/bulk-stage`, `PATCH /api/applications/{id}/stage`.
- Today: Compare is enabled for 2 or 3 people. Move to stage and Reject appear only when a job filter is set. Selection is kept across pages by id (`DataTable.tsx:269,311`), but `selectedApps` reads only the current page (`:409-416`). "5 selected" can therefore move 2. Reject runs one PATCH per application in a loop (`:306-311`): no partial-failure summary, and no option to send the rejection email.
- Product critique: Greenhouse and Lever bulk actions include add to job, tag, email with a template, add to pool or list, export selected, and reject with an email that can be sent later. Ashby shows "Select all 312 matching".
- Complete means:
  - [ ] Actions with no job: Add to job, Add tags, Add to pool, Email (template), Export selected, Mark do not contact.
  - [ ] Actions with a job: Move, and Reject with an optional rejection email and send delay.
  - [ ] "Select all N matching", driven by the current filters on the server.
  - [ ] One request per bulk action, and a result toast ("18 moved, 2 skipped: already rejected").
- Backend: `POST /api/candidates/bulk` (`{ ids | filter, action, payload }`) for tags, pools, DNC and add-to-job. `POST /api/applications/bulk-reject` with `sendEmail`. Bulk email through the existing email outbox and templates.
- Libraries: none.

### Export — COMPLETE · S
- Where: `DataTable.tsx:171-181` (client CSV of `sorted`, which is the page's 25 rows), `exportName="candidates"` at `CandidatesList.tsx:1039`.
- Today: "Export" on a 56-person list downloads 25 rows. Restricted email exports as "Name <Restricted>". No custom fields, tags or every application.
- Complete means:
  - [ ] Export downloads every row matching the current filters, or only the selected rows.
  - [ ] Columns include tags, source, custom fields (by label), every application with its stage, and last activity.
  - [ ] Over 5,000 rows, a background export with a download link in Notifications.
- Backend: `GET /api/candidates/export?{same filters}` streaming CSV with the existing `Csv` helper. Set `exportable={false}` on the list DataTable.
- Libraries: none. Writing CSV by hand is a few lines, and `Csv` already exists server-side.

### Saved views — COMPLETE · M
- Where: `CandidatesHub.tsx:54-59,88-99`, `CandidatesList.tsx:363-385,645-676`, `list-route.tsx:24-32`. Server `GET/POST/DELETE /api/saved-views` (`Features/Administration/ConfigurationEndpoints.cs:493-529`), `SavedView` in `Domain/Reporting.cs`.
- Today:
  - Personal only (`OwnerEmail`).
  - Upsert by name, so "Update view" with a new name creates a second view instead of renaming.
  - No rename, share, reorder or pin.
  - Columns and density are not saved with the view: they are per browser through `viewKey`.
  - The view name never appears as a page heading.
  - Delete view is a red button inside the AI bar.
  - The shared `components/data-table/SavedViews.tsx` (Jobs, Report builder) stores views in localStorage, a second, incompatible system.
- Product critique: Linear and Ashby views are shareable with the team, show counts, and carry their columns.
- Complete means:
  - [ ] A view header showing the name and a ••• menu: Rename, Share with team or Make private, Duplicate, Delete.
  - [ ] "Save changes" appears only when the filters differ from the saved ones.
  - [ ] Columns, density and sort saved in the view.
  - [ ] Team views listed under "Team views" in the rail, with counts.
- Backend: add `Shared bool`, `SortOrder`, a `PUT /saved-views/{id}` (rename or update by id), and the column state inside `ParamsJson`. Scope GET to mine or shared.
- Libraries: none.

### Recently viewed — MERGE · S
- Where: `/candidates/recent`, `RecentCandidates.tsx`, `recent.ts` (localStorage, 20 entries).
- Survivor: the command palette's empty state. Opening search with nothing typed shows "Recent" (the last 8 profiles) above Actions. Remove the "Recently viewed" rail item and route. It is per browser (empty on the phone shot, 1 entry on desktop), shows table tools above an empty state, and says "Showing 1–1 of 1 profiles". Keep `rememberCandidate()` as is.

### Talent pools — COMPLETE · M
- Where: `/candidates/talent-pools`, `TalentPools.tsx`, `sample-talent-pools.ts` (fictional data, "Preview" badge and alert). No backend.
- Today: entirely fake. Five sample pools with made-up owners.
- Product critique: "Silver medalists", "Boomerangs" and "Campus 2027" are how agencies and in-house teams re-hire. Greenhouse prospect pools, Lever lists and Ashby talent pools all let you add from anywhere, open a pool as a filtered list, and email the pool. Without pools the only grouping is free-text tags.
- Complete means:
  - [ ] Create, rename or delete a pool (name, description, owner).
  - [ ] Add people to a pool from a profile, the preview, a row, a bulk action, rank mode, and import.
  - [ ] Opening a pool shows the standard candidate list filtered to it (`/candidates/pools/{id}`, same table, chips and bulk actions), with "Added by" and "Added on" columns.
  - [ ] Remove from pool.
  - [ ] Pools listed in the rail with counts.
  - [ ] Bulk email the pool through email templates.
  - [ ] Pool membership shown on the profile.
  - [ ] Skip automated nurture sequences (that is a CRM product). Add them only if customers ask.
- Backend: `TalentPool` (Id, Name, Description, OwnerEmail, CreatedAt) and `TalentPoolMember` (PoolId, CandidateId, AddedBy, AddedAt, unique pair). `GET/POST/PUT/DELETE /api/talent-pools`, `POST/DELETE /api/talent-pools/{id}/members`. A `poolId` filter on `GET /api/candidates`. Migration. Delete `sample-talent-pools.ts` and the Preview badge.
- Libraries: none.

### Add candidate (manual form) — COMPLETE · S
- Where: `CreateCandidateModal.tsx`, the header button, and the command palette. Server `POST /api/candidates` (`CandidateEndpoints.cs:366-434`).
- Today: name, email, phone, title, location, free-text source, LinkedIn and tags. A duplicate email returns 409 and shows only a toast. You cannot attach a resume, pick a job or set custom fields. After saving you stay on the list, and the new person may not be on page 1.
- Product critique: Greenhouse's "Add a candidate" is one form: resume (prefills), job and stage, source and referrer, tags. On a duplicate it says "Blake Rivera already has this email. Open profile."
- Complete means:
  - [ ] An optional resume drop at the top that prefills the fields (absorbs "Import from a resume", below).
  - [ ] An optional "Add to job" with a stage.
  - [ ] Source as a select from the managed list, with a "Referred by" person field when the source is Referral.
  - [ ] Custom fields.
  - [ ] On a duplicate email: an inline error with "Open {name}" and "Attach this resume to {name}".
  - [ ] After saving, open the new profile.
- Backend: `POST /api/candidates` accepts an optional file and `requisitionId`, or the client calls attachments and applications after. The 409 body already carries the duplicate's id and name.

### Import from a resume (single) — MERGE · S
- Where: Import menu, then "From a resume". `features/talent/ResumeImportModal.tsx`, `POST /api/resumes/parse` and `/api/resumes/import` (`Features/Resumes/ResumeEndpoints.cs`).
- Survivor: "Add candidate" (above) gets the resume drop. The Import menu becomes "Many resumes" and "Spreadsheet (CSV)". What moves:
  - the parse preview (`/api/resumes/parse`)
  - the "Confirm the candidate" identity fields
  - the 409-on-email handling
- New, under "Many resumes" (M): drop up to 50 PDF or DOCX files. Each becomes a row in a review table (Reading… → name, email, "Already here" → Add or Attach to existing or Skip). Optionally put all of them in a job or pool. Server: a batch endpoint that stores files and enqueues `ResumeParseJobs`, plus a status poll. The parse is already a background worker, so the UI no longer waits 7–15s per file (see the "parse resume" latencies on `/admin/ai`).
- Also fix: this modal accepts `.pdf,.docx` (`ResumeImportModal.tsx:148`), while the profile upload accepts `.pdf,.doc,.docx` (`CandidateTabs.tsx:198`, `CandidateSidebar.tsx:211`), and `ResumeTextExtractor.cs:27-30` rejects `.doc`. Accept PDF and DOCX everywhere, and say so.

### Spreadsheet (CSV) import — COMPLETE · M
- Where: `ImportCandidatesModal.tsx`. Server `POST /api/candidates/import` (`ConfigurationEndpoints.cs:532-602`).
- Today: a good dry run (will add, already here, problems, with a line table). Limits:
  - It only understands fixed header names (`:550-555`).
  - Custom fields are ignored, though `/admin/fields` says the key is used "when you import or export candidates" (`CustomFieldsSection.tsx:92`).
  - Duplicates can only be skipped, never updated.
  - No "add everyone to job, pool or tag".
  - No `.xlsx`.
  - The 2,000-row cap runs synchronously.
  - No import history and no undo.
  - The modal description is 4 sentences long.
- Product critique: Ashby, Lever and Gem imports have a column-mapping step ("Your column → Our field", auto-matched) and "Update existing records".
- Complete means:
  - [ ] Step 1, file. Step 2, map columns (auto-matched, with each unmatched column a select of fields, custom fields included). Step 3, review the dry run, then import. Use `Wizard`.
  - [ ] On duplicates: Skip, or Fill empty fields.
  - [ ] Tag, pool and job for every imported row.
  - [ ] A downloadable "rows with problems" CSV.
  - [ ] Import history under Settings with who, when and counts, and "Undo import" within 24 hours.
  - [ ] `.xlsx` accepted.
- Backend: dry run returns `headers[]` and accepts a `mapping` JSON. Write `CustomFieldsJson`. An `ImportBatch` entity (id, by, counts, created ids) for history and undo. Read `.xlsx` server-side.
- Libraries: `ClosedXML@0.105.1` (server) to read `.xlsx`, so both formats go through one dry-run path. Skip client CSV parsers: the server dry run already parses.

### Duplicates and merging — COMPLETE · L
- Where: `PotentialDuplicates.tsx`, rail card. Server `GET /api/candidates/{id}/duplicates` (`CandidateEndpoints.cs:487-530`). Create, CSV and resume import block on exact email only.
- Today: detection only. "We never merge records for you", and there is no merge at all. The phone match compares raw strings (`:503`, `x.Phone == candidate.Phone`) and then labels with normalized digits. Same-name matches count alone, so common names flood the card. The seeded profile shows 8 "Same phone" matches with no ranking, no cap and no "Not a duplicate".
- Product critique: Greenhouse and Lever merge with a side-by-side picker (keep which email, phone, name). Applications, notes, files and activity move to the survivor, and the merge can be undone. Ashby flags duplicates at application time.
- Complete means:
  - [ ] Duplicates ranked by confidence (email or LinkedIn high, phone medium, name only low and hidden unless it also shares location or employer). Show the top 3 and "Show all".
  - [ ] "Merge…" opens a side-by-side modal: radio per conflicting field, the union of tags, and a list of applications, files and notes that will move.
  - [ ] "Not the same person" dismisses the pair for good.
  - [ ] A "Possible duplicates" segment or report for admins.
  - [ ] A banner on the new record when a public application matches an existing person.
  - [ ] Merge is recorded in activity and undoable for 7 days.
- Backend:
  - `POST /api/candidates/{id}/merge { otherId, keep: {field: id} }` in one transaction, re-parenting `Applications`, `Attachments`, notes, messages, `JobFits`, `CandidateDismissals`, pool members and saved-view references. Keep a tombstone `MergedIntoId` so old links redirect.
  - `CandidateDuplicateDismissal (A, B)`.
  - A `PhoneDigits` normalized column with an index, so phone matching is SQL equality.
- Libraries: none.

### Tags — COMPLETE · S
- Where: header chips (`CandidateShell.tsx:115-123`), create form and CSV import. Server `Candidate.Tags`, used as skills in filters and ranking (`CandidateEndpoints.cs:124-130`, `RankingEndpoints.cs:263`).
- Today: tags are set only at creation and can never be changed (no UI calls `PUT /api/candidates/{id}`). The CSV column "skills" also writes to tags. Tags and skills are mixed together, so a "silver-medalist" tag counts as a skill in ranking.
- Product critique: Lever and Greenhouse tags are edited inline on the profile with autocomplete, added in bulk, filtered on, and managed (rename or merge) by admins.
- Complete means:
  - [ ] Inline tag editor on the profile header, with autocomplete from existing tags.
  - [ ] Bulk add and remove.
  - [ ] A Tags filter.
  - [ ] Admin page to rename, merge or delete a tag across all candidates.
  - [ ] Tags no longer count as skills in search and ranking.
  - [ ] The CSV `skills` header maps to nothing, or to tags only when the user picks it.
- Backend: `PATCH /api/candidates/{id}/tags`, `GET /api/tags` (distinct with counts), `POST /api/admin/tags/rename`. Drop `Tags` from the skills predicates.

### Sources — COMPLETE · S
- Where: free text in Create and Edit (`CreateCandidateModal.tsx:103-108`), a fixed list of 9 in the filter (`CandidatesList.tsx:85-95`), "Import" and "Resume import" written by the importers, "Existing candidate" written on applications by Add to job.
- Today: three vocabularies that do not meet. Source is stored on the person, while the list shows it beside the latest *application*.
- Product critique: Greenhouse has a managed source list grouped by type (Job board, Referral, Agency, Sourced), with a referrer person on referrals. That is what source-of-hire reporting needs.
- Complete means:
  - [ ] An admin-managed source list in Settings → Hiring.
  - [ ] A select everywhere (create, edit, import mapping).
  - [ ] A Referred by field.
  - [ ] Unknown values from imports map to "Other (value)".
  - [ ] The filter reads the managed list.
- Backend: a `Source` table (Name, Group, Active), a seed, a migration that backfills distinct values, and `Candidate.ReferrerUserId`.

### Edit candidate details, do not contact, email bounced — COMPLETE · S
- Where: `PUT /api/candidates/{id}` (`CandidateEndpoints.cs:436-485`) has no caller. The `doNotContact` badge shows (`CandidateShell.tsx:95-99`) but cannot be set. `EmailBouncedAlert` (`CandidateCustomFields.tsx:40-46`) says "Check the address" with no way to change it.
- Today: no editing of name, email, phone, title, location, LinkedIn, GitHub or portfolio. The entity has `GitHubUrl`, `PortfolioUrl` and `OtherUrls`, but the rail shows only LinkedIn.
- Complete means:
  - [ ] An "Edit details" drawer from the header ••• and from the Contact card.
  - [ ] Every identity field, plus links (LinkedIn, GitHub, portfolio, other).
  - [ ] A "Do not contact" switch with an optional reason. While on, Email actions disappear and bulk email skips the person.
  - [ ] The bounced alert gets "Edit email". Saving a new email clears `EmailBounced`.
  - [ ] Duplicate email returns inline "Another candidate has this email: Open".
- Backend: return the duplicate's id in the PUT 409. Clear `EmailBounced` when the email changes. Add `DoNotContactReason`. Do not bump the resume embedding (see ranking).

### Delete a candidate — COMPLETE · S
- Where: missing. No `DELETE /api/candidates/{id}`.
- Today: test records, spam applicants and accidental imports stay forever. (Legal erasure workflows are out of scope. This is plain data hygiene.)
- Complete means:
  - [ ] Admin-only "Delete candidate…" in the header ••• menu, behind `ConfirmDialog`, listing what goes (3 applications, 2 files).
  - [ ] Bulk delete for admins.
  - [ ] The delete is recorded in activity history.
- Backend: `DELETE /api/candidates/{id}` (cascade applications, attachments, files on disk, fits, dismissals, pool members). Audit event.

### Profile header and actions — COMPLETE · M
- Where: `CandidateShell.tsx:84-149`.
- Today: avatar, name, a stage badge for the most recently active application, title, location, job link, tags, and one button, "Add to a job". On a phone the button sits alone on its own row under the name.
- Design critique: the job and stage in the header are repeated by the Overview Applications card. Tags are 11px gray chips with no affordance.
- Product critique: every best-in-class record has Email, Schedule, Add note, Move or Reject (for the current job), and a ••• menu at the top. Greenhouse and Ashby add "Next candidate ›" when you arrive from a list.
- Complete means:
  - [ ] Actions, in order: Email (secondary), Schedule interview (secondary, needs a current application), Add to job (primary), and ••• (Edit details, Add to pool, Tags, Merge, Do not contact, Copy link, Delete).
  - [ ] An application switcher when there is more than one active job.
  - [ ] Previous and next arrows when opened from a list (pass the list query in `?from=`).
  - [ ] Tags editable inline.
- Backend: none beyond the edit, merge and delete endpoints.

### Overview tab → candidate activity and notes — COMPLETE · L
- Where: `/candidates/{id}`, `CandidateTabs.tsx:39-100`, `CandidateApplications.tsx`. Notes, messages, interviews and scorecards exist per application (`features/applications/*`, `ApplicationNote` in `Domain/Applications.cs:101`).
- Today: an Applications card and a resume summary. With no resume, the main column is an empty-state card ("Go to files"). There is no history, no notes and no messages at candidate level. People in no job cannot be noted at all.
- Product critique: Lever's profile is a feed of every touch (emails, notes, stage moves, interviews, feedback) across all opportunities, filterable, with a composer on top. Greenhouse's Activity Feed works the same way. This is what makes a candidate record useful to a second recruiter.
- Complete means:
  - [ ] A main column of applications (compact, one line each), then a note composer (with @mentions and private or team visibility), then the activity feed.
  - [ ] The feed covers stage moves, notes, emails in and out, interviews, scorecards submitted, offers, dismissals, merges, file uploads and resume read.
  - [ ] Filter chips on the feed: All, Notes, Emails, Interviews, Feedback.
  - [ ] Each item links to its application.
  - [ ] Resume summary moves to the Resume tab header.
- Backend:
  - `CandidateNote` (CandidateId, optional ApplicationId, Body, Visibility, AuthorEmail) or a nullable `ApplicationId` on `ApplicationNote`.
  - `GET /api/candidates/{id}/activity?type=&cursor=`, a union over audit events, notes, messages, interviews, scorecards and dismissals, scoped by `ScopeApplications`.
  - Note text should use the Plate editor already installed (`components/plate`).
- Libraries: `platejs@53.3.15` (installed) for the note composer with mentions. Do not add another editor.

### Applications tab — MERGE · S
- Where: `/candidates/{id}/applications`, `CandidateTabs.tsx:109-186`.
- Survivor: the Overview applications block. What moves: the "Last activity" column and the rejected-at-stage text ("Rejected at Review"). Delete the tab, the duplicate `ApplyModal` instance and its Export button. A 1–5 row table does not need column pickers.

### Resume tab — COMPLETE · S
- Where: `/candidates/{id}/resume`, `ResumeDocument.tsx`. Server `GET /api/candidates/{id}/resume`. Rules in `docs/resume-parsing.md`.
- Today: strong. A typeset, read-only resume with amber marks on values not found in the file, "Compare with the original", "Read it again", and polling while reading. Gaps:
  - The empty state says "Upload one under Documents" (`:194`) but has no upload button, and the tab is called Files.
  - The original opens in a new tab rather than side by side at `xl`.
  - The search terms from the list are not highlighted.
  - Inferred values (seniority, degree level) look the same as facts.
- Complete means:
  - [ ] Empty state with "Upload resume" (FileButton).
  - [ ] Side-by-side original and parsed view at 1280 and up.
  - [ ] List search terms highlighted (pass `?q=`).
  - [ ] An "Inferred" label on model judgments.
  - [ ] A Download button.
- Backend: none.

### Files tab and file types — COMPLETE · M
- Where: `/candidates/{id}/files`, `CandidateTabs.tsx:189-305`. Server `POST /api/candidates/{id}/attachments` (`CandidateAttachmentEndpoints.cs:14-27`), `ResumeParseWorker.cs:73-87`, `LocalFileStore.cs`.
- Today: **every upload is queued as a resume** (`CandidateAttachmentEndpoints.cs:21`), and the worker replaces the parsed profile with whatever it read (`ResumeProfileWriter.ApplyAsync`). Uploading a cover letter or work sample therefore overwrites the resume profile and the embedding. Other gaps:
  - No delete, rename or "set as resume".
  - Only `.pdf`, `.doc` and `.docx` are accepted, and `.doc` then fails to read.
  - `ScanStatus = "ValidationOnly"`: no malware scan.
  - Preview works for PDF only.
  - The table shows an Export button and column tools for a list of 1–3 files.
- Product critique: Greenhouse files have a type (Resume, Cover letter, Offer, Other), one primary resume, drag and drop, and inline preview of Word files.
- Complete means:
  - [ ] Pick a type on upload (Resume, Cover letter, Portfolio or work sample, Other). Only Resume is read.
  - [ ] "Use as the resume" on any PDF or DOCX.
  - [ ] Delete (with confirm) and rename.
  - [ ] Drag and drop anywhere on the tab, several files at once.
  - [ ] DOCX preview as extracted text.
  - [ ] Images (PNG, JPG) allowed for portfolios.
  - [ ] Remove Export and column tools for this table.
- Backend:
  - `Attachment.Kind` and `Candidate.PrimaryResumeAttachmentId`, with a migration (backfill: the most recently parsed file is the resume).
  - `DELETE` and `PATCH /api/attachments/{id}`.
  - Enqueue a parse only for `Kind == Resume`.
  - Add a ClamAV scan step if the deployment has one. Otherwise label it honestly in the UI.

### Documents rail card — MERGE · S
- Where: `CandidateSidebar.tsx:203-267`.
- Survivor: the Files tab. In the rail, keep one line, "Resume · alex-rivera.pdf · Preview", under Contact. Remove the full list, because it renders twice on the Files tab (see `desktop-light_…_files.png`).

### Profile rail (contact, next interview, skills, details) — COMPLETE · S
- Where: `CandidateSidebar.tsx:137-274`, `CandidateCustomFields.tsx`.
- Today:
  - Contact shows "Updated 48 min ago", which is noise.
  - The phone is not a `tel:` link and has no copy button.
  - Next interview fetches *every* interview in the organization for 180 days (`:55-65`) and filters on the client.
  - Skills repeat the resume, though the comment says "Nothing here repeats the resume".
  - "Details" shows "Not provided" twice in gray for empty custom fields.
- Complete means:
  - [ ] Contact: email and phone with copy buttons, links (LinkedIn, GitHub, portfolio), source, added. Inline edit with a pencil.
  - [ ] Next interview shows "Nothing scheduled · Schedule" when empty.
  - [ ] Drop the Skills card (the Resume tab owns skills), or show it only when no resume is read.
  - [ ] Hide empty custom fields behind "Add details".
- Backend: `GET /api/interviews?applicationIds=` or include `nextInterview` on `GET /api/candidates/{id}`.

### Add to a job — COMPLETE · S
- Where: `ApplyModal.tsx`, server `POST /api/applications`.
- Today: picks one open job and posts with `source: 'Existing candidate'`. It lists jobs the person is already in (the server answers 409), and it never shows dismissals.
- Complete means:
  - [ ] A searchable job select (`SearchSelect`) that hides or disables jobs they are already in ("Already in this job").
  - [ ] A starting stage.
  - [ ] An optional "Email them about this job" (template).
  - [ ] A warning if they were dismissed for this job, with the reason.
  - [ ] Bulk version (see Bulk actions).

### Compare candidates — COMPLETE · M
- Where: `/candidates/compare`, `CandidateCompare.tsx`, `compare.ts`.
- Today: 2–3 people side by side on resume facts, with shared skills colored. It is not tied to a job, so it cannot compare against requirements, scorecards or interview ratings. AI match comes from whatever list data is cached (`:53-58`), so a shared link loses it. Compare is reachable only from list selection: you cannot add a person on the page, or start from a job or pipeline.
- Product critique: Greenhouse and Ashby compare in a job's context. The rows are the job's must-haves (met or missing per person), then scorecard averages per attribute, then interviewer recommendations.
- Complete means:
  - [ ] A job picker (defaults to the shared job).
  - [ ] Requirement rows from `JobFit`, scorecard averages per attribute, the latest stage, and interviewers' overall recommendations.
  - [ ] "Add person" (SearchSelect) for up to 4 people.
  - [ ] A sticky name row.
  - [ ] "Show only differences".
  - [ ] Compare from a pipeline column's selection.
- Backend: `GET /api/requisitions/{id}/compare?candidateIds=` returning fit rows and scorecard aggregates for applications on that job.

### Custom candidate fields (admin) — COMPLETE · M
- Where: `/admin/fields`, `features/admin/CustomFieldsSection.tsx`. Profile `CandidateCustomFields.tsx`. Server `GET /api/custom-fields`, `PUT /api/admin/custom-fields`, `PUT /api/candidates/{id}/custom-fields` (`ConfigurationEndpoints.cs`).
- Today:
  - Four types (text, number, date, pick one).
  - The "Key" stays editable after creation (`:128`) although the copy says it "never changes". Saving replaces every definition (`RemoveRange` at `ConfigurationEndpoints.cs:243`), so a renamed key orphans every stored value without warning.
  - Delete has no confirm.
  - Not used by import, export, the list, the filters or create.
- Design critique: the trash icon is in a different place per row (next to Options for list fields at x≈1008, next to Type for text fields at x≈773). On a 390 phone the sticky "Save changes" bar covers the second field's Label input (`phone-light_admin_fields.png`). The preview card is good. Keep it.
- Product critique: Greenhouse and Ashby custom fields add yes/no, multi-select, URL and long text, plus required, help text, ordering, and "show as a list column and filter".
- Complete means:
  - [ ] Types: text, long text, number, date, yes/no, pick one, pick many, link.
  - [ ] Help text, a required-on-create flag, and drag to reorder.
  - [ ] The key is generated from the label and hidden (shown read-only under "Advanced").
  - [ ] Delete confirms with "12 candidates have a value".
  - [ ] Fields appear in Add candidate, Edit details, CSV mapping, export, list columns and filters (pick types).
  - [ ] Each field is a collapsible row with a fixed ••• position.
  - [ ] The phone save bar no longer overlaps content.
- Backend: give definitions stable ids, use upsert by id instead of replace-all, `Required` and `HelpText`, `SortOrder`. Validate values by type on PUT. Store values as jsonb for filtering.
- Libraries: `@platejs/dnd@53.3.8` and `react-dnd@16.0.1` (installed) for reorder. Do not add another drag-and-drop library.

### AI assistance settings — COMPLETE · S
- Where: `/admin/ai-settings`, `AdminSettings.tsx:497-560`. Server `Organization.AiEnabled` and `AiModel`, enforced only server-side in `AiAssistant.cs:178-180`.
- Today:
  - The switch says "When this is off, we … hide AI features", but no web code reads it.
  - Model is free text (`:526-534`), so a typo breaks every AI call.
  - The page shows "No AI key on the server" in a small gray badge under the save button while the switch is on.
  - The page title and card title are both "AI assistance".
  - The info Alert sits inside `SwitchList`, which draws a divider through its top border (visible at y≈523 in `desktop-light_admin_ai-settings.png`).
  - The status card repeats the four stats from the Activity tab.
- Product critique: customers want per-feature control (some turn off ranking but keep resume reading) and a clear "AI is not working because…" state.
- Complete means:
  - [ ] A top-of-page `Alert` when no key is set ("AI is on, but the server has no AI key. AI features are hidden until one is added.").
  - [ ] A model select (Server default plus the supported models).
  - [ ] Per-feature switches: Reading resumes, Matching and ranking, Fit checks, Drafting messages, Interview summaries and transcripts.
  - [ ] Every AI control in the app hides when its feature is off.
  - [ ] Keep only the status line and a "See activity" link. Stats live on the Activity tab.
- Backend: an `AiFeatures` jsonb on Organization. Expose `ai: { available, features }` on the session payload. `AiAssistant` checks the per-feature flag through `AiContext.Purpose`.

### AI activity log — COMPLETE · S
- Where: `/admin/ai`, `AdminAi.tsx`. Server `GET /api/admin/ai/status`, `/admin/ai/log` (`RankingEndpoints.cs:472-519`).
- Today:
  - The `PURPOSES` map (`AdminAi.tsx:55-67`) has `resume-profile`, but the server logs `parse-resume` (`ResumeEndpoints.cs:38,86`, `ResumeParseWorker.cs:85`). Half the rows read in lowercase "parse resume".
  - Stat labels truncate ("AI requests, la…", "Text processe…").
  - "No AI key" renders as a two-line 28px value.
  - It uses a raw `Table`, not `DataTable`.
  - The subject (Candidate or Requisition id) is not a link.
  - Filters are by purpose only.
  - `/admin/ai/status` loads 30 days of logs, with full prompt text, into memory just to count (`:479`).
- Complete means:
  - [ ] Fix the purpose key.
  - [ ] Shorter stat labels ("Requests (30 days)", "Tokens").
  - [ ] An estimated cost card (tokens × model price from config).
  - [ ] Filters: purpose, person, failed only, date range.
  - [ ] The subject links to the candidate or job.
  - [ ] Move to `DataTable` with an expandable row.
- Backend: aggregate with `GROUP BY` in SQL. Add `?userEmail=&failed=&from=&to=` to the log.

### Header search and command palette — COMPLETE · M
- Where: `components/layout/CommandSearch.tsx`. Server `GET /api/search` (`Features/Search/SearchEndpoints.cs`).
- Today:
  - The whole query is one `Contains` against first name, last name or email (`:29,55-57`), so **"Blake Rivera" returns nothing**. No phone, title or skills. 8 results per type.
  - Candidate rows show name and email only: no current job, stage or avatar.
  - No "See all results" handoff to the list.
  - On an empty query it shows Actions. Recent profiles are not offered.
  - The actions, Go to and settings lists are good. The combobox is hand-rolled but accessible.
- Product critique: Linear and Superhuman palettes show recent items first, match words in any order, show context ("Data analyst · Booked"), and let you act on a result (Tab → Email, Schedule, Add to job). Greenhouse search ends with "See all results for 'x'".
- Complete means:
  - [ ] Split the query into words. Each word must match some field (first, last, email, phone digits, title).
  - [ ] Typo-tolerant ranking (trigram).
  - [ ] Candidate rows: avatar, name, "Current job · Stage".
  - [ ] Jobs: title, code, status.
  - [ ] Empty query shows Recent (from Recently viewed), then Actions.
  - [ ] A final row "See all results for "x"" goes to `/candidates?search=x`.
  - [ ] Tab on a candidate opens a sub-list of actions (Open, Email, Schedule interview, Add to job, Copy email).
- Backend: rewrite `/api/search` to reuse `SearchTerms` and the new search index (see Keyword search). Return `currentJob` and `stage`.
- Libraries: `cmdk@1.1.1`, if you add the nested action pages. Its `Command.List` and page stack replace about 120 lines of keyboard and `aria-activedescendant` handling (`:262-345`). Without nested pages, keep the current code.

### Resume reading pipeline (worker, OCR, retries) — COMPLETE · M
- Where: `ResumeParseWorker.cs`, `ResumeTextExtractor.cs`, `ResumeExtractor.cs`, `ResumeProfileWriter.cs`, `LocalResumeOcr.cs`, `docs/resume-parsing.md`.
- Today: a queue with 3 attempts and backoff, a one-hour in-memory cache by text hash, verification marks, and OCR only if `ocrmypdf` is installed on the host. Otherwise the file is "scanned, so the text could not be read" with a "Try reading again" link that cannot succeed. Status reaches the user only as a lowercase phrase in the file row ("being read", "read"). Nothing shows how many resumes are waiting except `/admin/ai`. It runs for every upload (see Files).
- Complete means:
  - [ ] Parse only resume-type files.
  - [ ] Ship OCR in the API container, or hide "Try reading again" for `NeedsOcr` and say "Upload a text PDF or Word file".
  - [ ] A "Reading resume…" chip on the profile header while pending.
  - [ ] A notification to the uploader when reading fails.
  - [ ] Bulk "Read again" for failed files on `/admin/ai`.
- Backend: the `Attachment.Kind` check in the upload endpoint and worker; failure notification through the notifications table; OCR binary in the Dockerfile. (Do not build images in this pass; note it.)

## Cross-area notes
- **DataTable (shared):**
  - Built-in Export only covers the rows it is given. Every server-paginated list (Candidates, Jobs, probably Applications) exports one page. Add an `onExport` prop that calls a server export, and default `exportable` to false when `pagination` is set.
  - Hide the column, density and export tools when the table is empty or under about 5 rows (Files, Applications, Recently viewed).
  - Add a card layout below `sm`.
  - Add a sticky actions column option.
  - Selection survives paging, but no caller handles off-page ids. Either clear selection on page change or add "select all matching" support.
- **StatCard** truncates labels at about 200px card width (Candidates, AI activity). Let labels wrap to two lines, or set a minimum width per card in `StatGrid`.
- **Two saved-view systems.** `components/data-table/SavedViews.tsx` (localStorage, used by `RequisitionsPage.tsx` and `ReportBuilder.tsx`) and `/api/saved-views` (Candidates, Reports). Make the component read and write `/api/saved-views` with `area`, then delete the localStorage path.
- **AI availability flag.** Every AI control (Jobs requirements extract, Interview summaries and questions, Messages draft) should read one `ai.available` and feature flag from the session (see AI settings).
- **RBAC.** Candidate permissions are checked three ways: role lists in `useCandidateAccess` (`CandidateShell.tsx:37-43`), `user.permissions.includes('import')` in `CandidatesHub.tsx:53`, and policies on the server. A single ability definition (`@casl/ability@7.1.3`, `@casl/react@7.1.0`), shared from the session payload, would replace them. This belongs to the RBAC area.
- **Jobs area.** `/jobs/{id}/candidates` (`features/requisitions/JobSections.tsx`) is a second candidate list with better job columns (Rating, Experience, Next interview) but no bulk actions. "Find candidates" then sends you to `/candidates?job=` for a third view. Merge: the job tab should render `CandidatesList` with `jobId` fixed and a "Find more people" toggle (rank mode). Also, the job overview should use `GET /requisitions/{id}/suggested-candidates`, which nothing calls today.
- **Applications area.** Notes, messages, interviews and scorecards need a candidate-level read (activity feed) and nullable `ApplicationId` notes. Coordinate the note model with that area.
- **Messages and email templates.** Bulk email and "Email" on the profile need the template picker from the email templates area (Plate editor).
- **Seed data.** 9 seeded people share `+1 555 0100`, which makes the duplicates card look broken in every demo. Give seeds unique phones.

## Build order
1. **Data-integrity fixes (S each, no dependencies).**
   - Parse only resume uploads (`CandidateAttachmentEndpoints.cs:21`, plus an `Attachment.Kind` migration).
   - Server-side export of all matching rows.
   - Segment rows show the matching application.
   - Bulk actions use off-page selections, or selection clears on page change.
   - Header search splits words.
   - `parse-resume` purpose label.
   - Custom-field key locked after creation, with confirm on delete.
   - Unknown saved view redirects.
   - Re-embed on resume hash only.
2. **Edit details, do not contact, tags, delete, and header actions** (S–M). Wires the existing `PUT /api/candidates/{id}`. Unblocks bulk tag and DNC.
3. **List page cleanup** (M): remove stat cards, add segment counts and the "Not in a job" segment, a one-row toolbar with filter chips, filters in the URL (`nuqs`), "Ask AI" inside search, AI controls hidden when unavailable (needs the session `ai` flag), sticky actions column, phone card rows.
4. **Profile restructure** (M): merge the Applications tab and Documents card, Files tab with types, delete and primary resume, rail cleanup, Resume tab empty state.
5. **Bulk actions and Add to job** (M): bulk endpoint (tags, add to job, DNC, pool-ready), bulk reject with email, select-all-matching. Depends on 2.
6. **Duplicates and merge** (L): confidence ranking, merge modal and endpoint, "not a duplicate", `PhoneDigits`. Depends on 2 and on 7's activity events for the merge record.
7. **Candidate activity feed and notes** (L): candidate notes (Plate), activity endpoint, Overview rebuilt. Coordinate with the Applications area.
8. **Talent pools backend** (M): entity, endpoints, pool lists in the rail, add-to-pool everywhere, bulk email. Depends on 5.
9. **Add candidate merged with resume import, plus bulk resumes and CSV mapping** (M each): managed sources (S) first, then the merged Add form, then many resumes, then CSV mapping with custom fields and `.xlsx` (`ClosedXML`).
10. **Saved views: share, rename, columns, counts** (M). Then switch the shared `SavedViews` component to the API (cross-area).
11. **Search quality and command palette** (M): tsvector column and GIN, trigram names, phone digits, snippets; palette with recent items, context and actions (`cmdk` if nested actions).
12. **Ranking at scale and one match number** (L): `Pgvector.EntityFrameworkCore`, filters respected, bulk add or dismiss, fit card on the application, batch fit jobs, suggested candidates on the job overview.
13. **Compare by job** (M): depends on 12's fit data and the scorecard aggregates.
14. **Custom fields types and list integration** (M), then **AI settings per feature and the activity log polish** (S).

## Progress (wave 1)

Finished:
- **Files tab and file types**: uploads carry a kind (Resume, Cover letter, Portfolio or work sample, Other); only resumes are read, so a cover letter can no longer replace the profile. Upload several files by button or drag and drop, with a kind per file; rename, change kind, "Use as the resume", "Read it again", delete with confirm. `.doc` is refused as a resume with a plain message. No column tools on this short table.
- **Export**: `GET /api/candidates/export` writes every row matching the filters (or the selected ids) with tags, custom fields by label, every application and last activity. The list's Export button and "Export to a spreadsheet" in bulk use it. DataTable hides its one-page export when a table pages on the server.
- **Candidates hub navigation**: one `GET /api/candidates/counts` call gives every segment a count; new "Not in a job" segment (`hasApplications=false`); segment rows show the application that matched the segment; a deleted view redirects to `/candidates` with a toast.
- **Headline stat cards on the list**: removed, with the extra `/api/dashboard` and unfiltered list requests.
- **Candidate list table**: sticky ••• column (DataTable `sticky`), phone card rows (DataTable `card`), no wrapping in Source and Job, Source and Tags in the column picker, "Last active" with the applied date in a tooltip, unread dot and "No movement in N days" on the stage, "Newest added" sort, job column hidden when a job is chosen.
- **Filters**: all filters in the address bar with `nuqs` (Back, refresh and shared links keep them), one toolbar row (search, job, stage, sort, Filters (n)), removable chips with Clear filters, a separate Tags filter, Source options from the values in use, "Save as a view" beside the chips, "Save changes" on a view when the filters differ.
- **AI "Describe who you need"**: folded into the search box as an "Ask AI" toggle; the chips show what it set with one-click Undo; hidden when the server has no AI key or the organization turned AI off (`aiEnabled` on `/api/auth/me`). View actions moved to the view header menu.
- **Keyword search in the list**: stored weighted `SearchVector` (name A, title B, resume C) with GIN, trigram indexes on names and email (typo-tolerant "jordn"), `PhoneDigits` computed column, quoted phrases, best name matches first, a highlighted resume snippet when the match came from the resume.
- **Header search and command palette (data)**: `/api/search` splits words, tolerates typos, matches phone digits, ranks by name similarity and returns `currentTitle`, `currentJob` and `stage` per person and `status` per job. The palette UI is unchanged.
- **Edit candidate details, do not contact, email bounced**: Edit details drawer (identity, contact, links, source, do not contact with reason); 409 shows "Open {name}"; a new email clears the bounce flag; the bounced alert has "Edit email".
- **Tags**: inline editor in the record header with autocomplete (`GET /api/candidates/tags`, `PATCH /api/candidates/{id}/tags`); bulk add or remove; tags no longer count as skills in filters, ranking or embeddings.
- **Delete a candidate**: admin-only, from the header menu and bulk, with a confirm that lists what goes; recorded in activity history; files removed from disk.
- **Profile header and actions**: Email, Schedule interview, Add to a job, ••• (Edit details, do not contact, Copy link, Delete); secondary buttons fold into the menu on phones; "Reading resume" badge while a resume is read.
- **Applications tab**: merged into Overview (compact rows with last activity and "at {stage}"); the route redirects.
- **Documents rail card**: replaced by one "Resume · file · Preview" line in Contact.
- **Profile rail**: Contact with copy buttons, `tel:` link, LinkedIn, GitHub and portfolio links, no "Updated"; next interview comes with the record (no more 180-day calendar fetch) and offers "Schedule"; Skills card dropped (skills show in the resume summary); empty custom fields wait behind "Add details".
- **Resume tab**: empty state with "Upload resume", a Download link, plain-English failures, no "Read it again" when AI is off or the file is scanned.
- **Bulk actions**: `POST /api/candidates/bulk` (one request) for add or remove tags, do not contact, add to job at a chosen stage, move, reject with an optional rejection email (the reason "Withdrew" closes as Withdrawn with no email, through `statusForReason`, like the single reject), and delete; works on the selection or "Select all N matching" (the filters, on the server); result toast says how many were skipped and why.
- **Add to a job**: searchable open jobs, "already in this job" disabled, a starting stage, and a warning with the reason when they were dismissed from that job.
- **Add candidate** (merged with Import from a resume): optional resume drop that fills the form when AI is on and is kept as their resume either way, source autocomplete, tags, optional job, inline duplicate with "Open {name}" and "Add this resume to {name}", then opens the new profile.
- **Import from a resume (single)**: removed from the Import menu (merged above). New "Many resumes": up to 50 files read three at a time, a review list with names and emails to correct, "Add to {existing person}" for known emails, optional job.
- **Spreadsheet (CSV) import**: three steps (file, match columns, check and import); CSV or Excel (.xlsx, ClosedXML); auto-matched columns with a select per column, custom fields included; duplicates skipped or "Fill in their empty fields"; tags and a job for everyone imported; "Download these rows" for problems. Endpoint `POST /api/candidates/imports`.
- **Custom candidate fields (admin)**: the key is made from the label and locked once saved; removing a saved field asks first; the trash sits in the same place on every row.
- **AI activity log**: the `parse-resume` purpose reads "Reading a resume".
- **Rank everyone for a job** (part): "Find candidates" opens `/candidates?find={job}`; one "Match %" column; bulk "Add to this job"; re-embedding happens only when the resume is read again, not on every edit.

Started, not finished:
- Profile: previous and next arrows from the list, and an application switcher.
- Sources: the list offers sources in use; the managed source table, "Referred by" and the Settings page are not built (the Settings page belongs to the platform area).
- Spreadsheet import history and "Undo import".
- Many resumes reads in the browser; a server batch with a status poll is the upgrade if people import hundreds at once.
- Not started (wait for wave 2): candidate activity and notes, talent pools, bulk email with templates, failure notifications.

## Progress (wave 2)

Finished:
- **Overview tab → candidate activity and notes**: the Overview is the applications block, then a note composer (the shared Plate editor with "@" mentions, "which job it is about", and "Only recruiters and hiring managers"), pinned notes, and one feed grouped by day: notes, applications, stage moves, messages and emails to the candidate, interviews and cancellations, feedback submitted (the call stays hidden while you owe your own), offers, files and resumes read, dismissals, profile changes and pool changes. Filter chips: All, Notes, Emails, Interviews, Feedback, Stages, Files. Edit and delete your own note ("edited" label), pin to the top, ⌘Enter posts, a warning before mentioning someone who cannot see the person. Notes are one model: `ApplicationNote` now always carries `CandidateId` and an optional `ApplicationId`, so application notes show here too. Mentions are `NoteMention` rows kept in step with the text by `Mentions.RecordAsync` (the hook for the notification table). Endpoints: `GET /api/candidates/{id}/activity?types=&before=&limit=`, `GET /api/candidates/{id}/people`, `POST /api/candidates/{id}/notes`, `PUT|DELETE /api/notes/{id}`, `PUT|DELETE /api/notes/{id}/pin`. The resume card left the Overview (the Resume tab shows the summary).
- **Talent pools**: real pools (`TalentPool`, `TalentPoolMember`); create, rename and delete (`/api/talent-pools`); add and remove through `POST /api/candidates/bulk` (`addToPool`, `removeFromPool`) from a row, the selection or "everyone matching", rank mode, and the profile (••• menu and a "Talent pools" rail card with remove). Pools sit in the left rail with counts; `/candidates/pools/{id}` is the same list filtered by `poolId`, with "Added to the pool" (who and when), a "Added to the pool" sort, rename and delete in its header, and "Remove from this pool". `/candidates/talent-pools` lists every pool. Sample data and the Preview badge are gone. Bulk email to a pool waits for the template store.
- **Saved views**: on the server for every list (`/api/saved-views`, moved out of the admin endpoints): yours and the team's, rename by id, share or make private, pin, duplicate or "Save a copy for me", delete. A candidate view keeps its filters, the list query (so the rail shows a live count), the Ask AI text and its columns, row size and sort (DataTable `layout` and `onLayoutChange`); "Save changes" shows when the filters or columns differ. The rail has "Your views" and "Team views". The shared `SavedViews` component (jobs list, gallery) uses the same API with share, pin, rename, delete and "Save changes".
- **Rank everyone for a job**: every list filter applies in SQL before ranking (`filter` on `POST /api/talent/rank`); the database marks which requirements each person meets from the stored search vector and sends only ids, names and embeddings; scoring happens in the app with a deterministic order (score, name, id) and paging. One "Match" number with a popover: requirements met and missing, closeness in meaning, and the AI fit check with its date. Bulk "Add to this job", "Not a fit" (preset reasons, `dismiss` bulk action), "Add to a pool" and Compare. "Check fit for the top 25" queues `FitJob` rows that `FitWorker` runs in the background, with a live "N left". The requirements banner links to the job's Requirements page. `GET /requisitions/{id}/suggested-candidates` uses the same ranking, so it returns the same number (not placed in the UI yet). The separate "AI match" column is gone from the list.
- **Compare candidates**: by job. A job picker (defaults to a job everyone is in, or `?job=`), then "For {job}": match, where each person is in the job, one row per requirement (from the AI fit check when there is one, else from the resume), the AI fit check, the panel's calls and competency averages (hidden while you owe your feedback), then the resume rows. Up to four people, "Add a person", a sticky name row from `md` up, and "Show only differences". `GET /api/requisitions/{id}/compare?candidateIds=`.
- **Custom candidate fields (admin)**: types text, number, date, pick one, pick many and link, checked by type on save; pick-many answers are lists. Every field is a column in the list's column picker (hidden until turned on; DataTable keeps later-added hidden columns hidden), pick-one and pick-many fields are filters (`cf=key=value` in the address bar and the API) with chips, and the CSV import splits pick-many cells on semicolons. The endpoints moved to `Features/Candidates/CustomFieldEndpoints.cs`.
- **Spreadsheet (CSV) import** (history): every import is an `ImportBatch`; the import window lists recent imports with who, when and counts, and "Undo import" deletes the people it added for 24 hours.
- **Recently viewed**: removed from the rail; `/candidates/recent` redirects to the list (the ⌘K palette shows recent profiles).
- **Stage types**: the list, profile, preview and compare APIs return `stageType` and `stageColor`, and every `StageBadge` here passes them; the bulk rejection email uses the stage's candidate-facing label.

Not done:
- Managed sources (the source table, "Referred by" and its Settings page) and required or help text on custom fields.
- Bulk email to a pool and from the list (needs the template store).
- Mention notifications: rows are recorded; `Mentions.RecordAsync` returns who to notify for the communication builder to wire up.
- The preview panel's actions, previous and next on the profile, and the application switcher.
- pgvector: ranking loads embeddings for the filtered people and scores in memory (fine into the tens of thousands); move to an indexed nearest-neighbour query when the database has the `vector` extension.

## Progress (wave 4)

Finished:
- **Sources (managed list)**: a `Source` table (name, kind: job board, career site, referral, agency, sourced, event, other; on or off; link codes). People and applications keep the name as text, so reports and filters did not change shape. The starting list is seeded once; at startup every name in use that the list lacks joins it (filed by its words, for example "Career fair" as Event), and names that differ only in case are rewritten to the list's spelling (`Sources.EnsureAsync`). Settings, Hiring, **Candidate sources** (`/settings/sources`): grouped by kind with how many people have each and its link codes; add, edit (name, kind, link codes, on or off), "Merge into another source" (everyone and the codes move, the source goes) and delete when nobody has it. A rename rewrites the name on every person and application. Endpoints: `GET|POST /api/sources`, `PUT|DELETE /api/sources/{id}`, `POST /api/sources/{id}/merge`; `/api/candidates/sources` now returns the managed names.
- **Referred by**: `Candidate.ReferrerId` (a teammate, set null if the account goes). Add candidate and Edit details show "Referred by" (search your team) when the source is a referral; the server drops it on other sources. The rail reads "Referral, referred by Priya Raman".
- **Sources from careers links**: `?src=` and `utm_source` pick a managed source by its code or name, ignoring case (`Sources.ForCareersAsync` in `ApplicationIntake.SubmitAsync`); otherwise the careers page's own guess or Career site, as before. Unknown codes never add sources from the public site.
- **The managed list everywhere**: Add candidate and Edit details pick from the list, grouped by kind (a person keeps a source that was turned off); the spreadsheet import has "Source for everyone imported" (or "for rows without one" when the file has a Source column, whose unknown values join the list); Many resumes has a Source picker; the list's Source filter reads the list. API callers that send a name the list lacks add it, for an admin to merge.
- **Stage type filter**: `stageType=` on `GET /api/candidates` (and export, counts, bulk and views). Without a job the toolbar's stage picker is a stage-type picker (New, Screening, Interview, Offer, Hired); with a job it is that job's stages and the type shows as a chip. `openJobs=true` narrows to applications on open jobs. Rows show the application in that stage type.
- **Application answer filters**: in Filters, "Application answers": with a job chosen, pick a question with choices, then any of its answers (`questionId=`, `answer=`, on the same application as the other application filters), plus "Flagged answers only" (`flagged=true`, with or without a job). Chips name the question. Changing the job clears the question.
- **Dashboard tiles**: each Hiring pipeline step opens `/candidates/active?stageType=…&openJobs=true` (the people behind the number); Hired opens the hires report.
- **Bulk reject** (hand-over from the offers builder): the bulk reject dialog (list, row menu, pipeline selection bar) uses the reasons from Settings in the same grouped picker as the single dialog, and offers "Cancel upcoming interviews", "Withdraw open offers" and "When" for the rejection email. `POST /api/candidates/bulk` takes `sendAt`, `cancelInterviews` and `withdrawOffer`, reads Withdrawn from the reason's group (so "Withdrew" and other "They decided" reasons never email), and uses the single path's `QueueRejectionAsync`, `CancelUpcomingInterviewsAsync` and `WithdrawOfferAsync`.
- **Bug fixed**: any filter in the address bar crashed the list (`f.custom is not iterable`): the saved-view flag and the custom-field filter shared the `custom` key. The flag is now `edited`.

Not done:
- Required fields and help text on custom fields; bulk email to a pool; previous and next on the profile; the application switcher; pgvector (unchanged from wave 2).
- "Other (value)" for unknown import values: unknown values join the list instead, so nothing is lost and an admin merges them.
