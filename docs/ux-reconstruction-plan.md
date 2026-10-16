# UX reconstruction plan

Written 2026-10-16, after the first full walkthrough ([ux-walkthrough-notes.md](ux-walkthrough-notes.md)). The features are in; this plan is about making the product easy to move through. It changes navigation, page structure and the component kit. It does not change the API or the data model, so every step can be verified against the same backend and the same tests.

## What is wrong today, concretely

- **Three ways to find a person.** Applications, Candidates and Talent search are three top-level pages for the same people, each with its own filters and table. A recruiter has to know which door to use.
- **Tabs where a scroll would do.** The application record is split into Overview, Interviews and History; a recruiter deciding on someone has to visit three screens. The job page splits Pipeline, Interview kits and Details the same way.
- **Settings is a maze.** Administration has 8 tabs, and Settings alone has 9 sections. Related things (email templates, posting templates, candidate fields) live in different places.
- **Nine sidebar items for a recruiter, three for an interviewer, and the home page carries everything.** The page shows stats, a chart, a checklist, approvals and lists, and the thing that needs doing is not the first thing on it.
- **Twenty-one dialogs, most of them full modals.** Create, edit and confirm all look the same, so nothing signals weight. Three features carry their own confirm dialog.
- **Big single files.** The portal is one 694-line page; ranking, reports and settings are each 500+ lines. That is why the same list row, badge and empty state are drawn five slightly different ways.
- **Inconsistent small things.** Dates in three formats, actions sometimes in the header and sometimes in the body, "Jobs" in the UI but `/requisitions` in the URL, counts on some tabs and not others.

## Principles

1. **One place per thing.** A person has one page. A job has one page. Settings has one map.
2. **The next action is the first thing on the screen.** Every page opens with what needs doing, then the detail.
3. **Every section earns its own place.** Things are not stacked into one long scroll to save a click. When a page holds more than one job to be done, each gets its own tab or its own entry in a second sidebar, the way Linear does it. One scrolling page is only for a single, short record.
4. **Room to breathe.** Today everything feels squeezed together: panels touch, headings sit on top of their content, every block has the same weight. Give each level its own spacing and its own type size so the eye can tell page, section and row apart at a glance.
5. **Role-first.** The sidebar and home page are built for the person signed in, not for every role at once.
6. **Nothing extra.** Keep the "Nothing Extra" rule from [DESIGN.md](../DESIGN.md): one accent, hairlines, colour only when it is data. Every element must carry information or an affordance.
7. **One kit.** Every page is assembled from the same dozen components, so a new page looks like the others by default.

## New information architecture

### Sidebar

| Recruiter and admin | Hiring manager | Interviewer |
|---|---|---|
| Home | Home | Home |
| Jobs | Jobs (mine) | — |
| Applications | Applications (my jobs) | — |
| Candidates | Candidates (my jobs) | Candidates (mine) |
| Interviews | Interviews | Interviews |
| Reports | Reports | — |
| Settings (admin only) | — | — |

Approvals is not a sidebar item. It is the first card on Home when something waits, with a badge on the Home item. Talent search folds into Candidates. Administration becomes Settings, and the owner's first-run checklist lives on Home until it is done.

### Routes

Every tab is a route. Old URLs are replaced in the codebase, not redirected; nobody depends on them.

| Area | Routes |
|---|---|
| Jobs | `/requisitions`, `/requisitions/[id]` (Pipeline), `/details` (Role), `/kits`, `/visibility` |
| Applications | `/applications/[id]` (Overview), `/interviews`, `/messages`, `/activity` |
| Candidates | `/candidates` (Applications), `/candidates/people`, `/candidates/find`, `/candidates/[id]` |
| Approvals | `/approvals`, reached from Home |
| Settings | `/admin/*`, one route per side-menu item |

### Settings map

A second sidebar inside the content well replaces eight tabs and the nine-section Organization
page. Every item is its own route under `/admin`, rendered on the server under one layout.

- **Workspace:** People (`/admin`), Roles, Approvals, Reminders, Team notifications, AI (`/admin/ai-settings`).
- **Hiring:** Pipelines, Candidate fields, Posting templates, Email templates.
- **Candidates:** Candidate portal, Candidate email.
- **Connections:** Microsoft and Google, Webhooks.
- **Activity:** AI activity (`/admin/ai`), Audit log.

## Hierarchy and room (applies to every page)

Reference: Linear. Calm, roomy, clearly layered. The current build is too dense: components are
tightly packed and nothing tells you what matters first.

- **Three clear levels.** Page (title, tabs), section (heading, short description), row. Each
  level gets a step up in type size and a step up in the space above it. If two levels look the
  same, one of them is wrong.
- **Tabs for separate jobs.** A record with distinct activities (a job's pipeline vs. its setup,
  an application's work vs. its history) uses tabs under the header. Tabs are routes, so they
  bookmark and the back button works.
- **A second sidebar for anything with many areas.** Settings, and any future area with more than
  five pages, gets its own grouped left menu inside the content well, next to the main sidebar.
  Not a row of eight tabs.
- **Space between sections is generous.** At least 40px between sections, 24px between a section
  heading and its content, 16–20px inside a panel. Panels never touch each other.
- **Fewer boxes.** Not every section needs a border. Use a heading and whitespace first; reach for
  a panel only when the content is a list or a group of controls.
- **Every tab and every second-sidebar item is its own route.** `/requisitions/[id]/kits`,
  `/candidates/people`, `/admin/webhooks`. Never a `?view=` query or a `#hash` to switch what is
  shown. Each route fetches its own data on the server, so it renders complete on first load
  (SSR), can be linked and bookmarked, works with back/forward, and shares the header through a
  layout. Query strings are only for filters inside a view (`?job=`, `?stage=`).
- **One section, one purpose.** If a section can't be named in two or three words, split it.

## Page anatomy (every page)

```
Header      breadcrumb · title · status badge · ONE primary action · "…" menu for the rest
Attention   (optional) one strip: what needs doing on this page, with its action
Body        main column (sections, each a SectionCard) + right rail (facts, people, dates)
```

- A **drawer** from the right for create and edit forms (job, interview, kit, template). The page stays visible behind it.
- A **dialog** only to confirm something hard to undo (send acceptance, reject, withdraw, reverse). One shared `ConfirmDialog`, with the consequences written out.
- A **popover** for small picks (stage move, approver, filter).
- **Tables** are clickable rows with a hover affordance, never a trailing arrow button. Dense numbers right-aligned and tabular.
- **Empty, loading and error** come from one set: `EmptyState` (what the screen is for plus the next action), `LoadingBlock` (skeleton shaped like the content), `LoadError` (what happened plus retry).
- **Dates:** one helper. Relative for activity ("2 days ago"), absolute for scheduled things ("Thu, Oct 17, 11:40 PM"), both with the time zone when it matters.
- **Copy:** Jobs, Applications, Candidates. Sentence case everywhere. No API words.

## Page by page

### Home

One page, three variants by role, same skeleton: **Needs you** first, then **Today**, then the rest.

- **Recruiter:** Needs you (approvals, unread candidate messages, stalled applications, scorecards you owe) → Today (interviews today, applications since yesterday) → Pipeline across jobs (the donut becomes a stage bar per open job) → Recently active.
- **Hiring manager:** Needs you (approvals, feedback to read) → My jobs with their pipeline bars.
- **Interviewer:** Scorecards waiting → Upcoming interviews. Already done; keep.
- **Owner, first run:** the checklist replaces Needs you until it is complete.

### Application record (one page)

Sticky left rail: name, title, location, contact, job, stage with a popover to move, status, applied and last-activity dates, tags, links to resume and candidate record.

Main column, in order of decision-making:

1. **Next step** strip: whatever is pending (approval waiting, scorecards owed, interview to book, message to answer) with its button. Empty when nothing is pending, which is the signal.
2. **Acceptance** (only once the candidate is past interviews, or as a collapsed row before that).
3. **Interviews and feedback:** each interview as a compact card, scorecards inline, Prepare with AI and summary where they belong.
4. **Messages with the candidate.**
5. **Team notes.**
6. **Resume** preview (existing attachments, inline).
7. **History** as a collapsed timeline at the bottom, with emails and their delivery status.

Header actions: primary is the next step; "…" holds Reject, Add note, Schedule interview, Open candidate.

### Job page (tabs)

Header: crumbs, title, code · team · location, status, approval state, status control.

Tabs: **Pipeline** (the board, full width, with past candidates who might fit), **Role** (about the
role and what this job needs, with the facts rail), **Interview kits**, **Visibility**. Each tab is
a route. Each tab has room: no stacking of unrelated sections into one scroll.

### Candidates (one page, two modes)

- **Search** mode: the current candidate list and the profile search merged. One search box, one filter bar (job, stage, source, tags, has resume, location, years). Result rows show the person once with their active applications as chips.
- **Find for a job** mode: pick a job, optional plain-language request, ranked list with the fit assessment drawer. This is today's Rank for a job, moved here.
- Import and Add candidate in the header "…".
- Candidate record keeps its sidebar, with custom fields, bounce warning and resume profile review already in place.

### Applications (the inbox)

Stays a list because triage is a list job, but reads as an inbox: unread messages, stalled and AI fit are already there; add a default sort of "needs attention first", saved filters, and keyboard moves (j/k, a to advance, r to reject) for screening sessions. Bulk actions in a sticky footer when rows are selected.

### Interviews

Week calendar as now, plus a left list "Waiting on you" (scorecards owed, bookings not yet made). Interviewer and recruiter see the same page; the data is already scoped.

### Settings

Four pages per the map above, each with a sticky in-page index and sections that save independently (the `SettingsSection` pattern exists). People and roles move in from the Users tab. Posting templates get a drawer editor instead of a sub-route.

### Candidate portal

One card per application with a plain "Next for you" line at the top (book a time, reply to a message, nothing to do), then the details, then the actions. Company name in the header. Split the 694-line page into `features/portal/*` components: sign-in, application card, booking, messages, withdraw.

## Component kit

Everything in `src/web/src/components/ui`. Features import from here and nowhere else for these.

| Component | Replaces |
|---|---|
| `PageHeader` (breadcrumb, title, badges, primary action, menu) | three header variants |
| `AttentionStrip` | ad-hoc alerts at the top of pages |
| `SectionCard` (title, description, action, collapsible) | SectionCard, Paper+Title combos |
| `RightRail` and `FactList` (label/value rows) | Applicant card, Job details card, candidate sidebar facts |
| `ListRow` (avatar, title, meta, trailing) | five hand-rolled list rows |
| `DataTable` (clickable rows, sticky header, empty state) | per-page tables |
| `FilterBar` (search + filter chips + saved views) | applicants, candidates, talent, reports filters |
| `FormDrawer` | create/edit modals |
| `ConfirmDialog` | ApprovalParts.ConfirmModal, portal confirms, inline confirms |
| `StatusBadge`, `StageBadge`, `ScoreBadge` | Badges.tsx plus inline badges |
| `Timeline` | history page, approval timeline |
| `EmptyState`, `LoadingBlock`, `LoadError` | existing, kept, used everywhere |
| `date.ts`: `formatDate`, `formatDateTime`, `formatRelative`, `formatRange` | portal's own formatters, inline `toLocale*` calls |

## File moves

```
features/applicants/*            → features/applications/list/*
features/talent/*                → features/candidates/find/*
features/admin/*                 → features/settings/{workspace,hiring,connections,activity}/*
features/approvals/ApprovalParts → components/ui/ConfirmDialog + features/approvals/*
app/candidate-portal/page.tsx    → features/portal/* with a thin page
app/(workspace)/requisitions/*   → app/(workspace)/jobs/* (+ redirects)
app/(workspace)/applicants       → app/(workspace)/applications (+ redirect)
app/(workspace)/admin/*          → app/(workspace)/settings/* (+ redirects)
```

Files over ~300 lines get split along their sections (RankForJob, ReportsPage, AdminSettings, InterviewsPage, DashboardPage).

## Order of work

Each step ends with a role walkthrough of the pages it touched, `tsc`, prettier, the axe scan, and the backend suite (unchanged). Old routes keep working through redirects until the last step.

1. **Kit first.** Build the component kit and the date helper; swap them into two existing pages (Approvals, Interviews) to prove them. Nothing moves yet.
2. **Navigation and routes.** New sidebar per role, Settings map, `/jobs`, `/applications`, `/settings/*` routes with redirects from the old ones. Pages still render the old content.
3. **Home.** The three role variants on the new skeleton.
4. **Application record** as one page.
5. **Job page** as one page with drawers.
6. **Candidates** merged with Find for a job; delete Talent search.
7. **Settings** regrouped into four pages.
8. **Applications inbox** polish: attention sort, keyboard moves, sticky bulk footer.
9. **Portal** split and "Next for you".
10. **Delete** old routes, dead components and duplicate helpers. Update [PRODUCT.md](../PRODUCT.md) and [DESIGN.md](../DESIGN.md) with the final anatomy and kit.

## Decisions to confirm

1. **Candidates absorbs Talent search** (one page, two modes). Alternative: keep Talent search as its own page under Candidates.
2. **Application and job records become single scrolling pages.** Alternative: keep tabs but make Overview complete enough that most people never leave it.
3. **Approvals leaves the sidebar** and lives on Home plus the direct URL. Alternative: keep it as a sidebar item for recruiters and admins.
4. **URLs change** to `/jobs`, `/applications`, `/settings` with redirects. Alternative: leave URLs and only change labels.
5. **Keyboard screening** (j/k/a/r) on the applications inbox is in scope for this pass. Alternative: later.

## Out of scope for this pass

API and database changes; the public career-site API; dark mode (the app pins light); new features beyond what the walkthrough notes list as open.
