# UI depth plan

Page-by-page decisions for the second pass of the redesign: where a screen is too tight, what
moves to its own tab, sub-sidebar or route, and which new flows the frontend adds. Backend is
unchanged; anything without an API runs on sample data under `features/preview` with a Preview
badge (see `src/web/CLAUDE.md`).

## Shared building blocks (added first)

| Block | Why |
|---|---|
| `SidebarLayout` + `SectionNav` (`components/layout/SectionLayout.tsx`) | Areas with many sub-pages (Settings had 20 routes in two tab rows, Reports 7 report tabs in one row) need a grouped vertical nav, not tab rows that wrap. Turns into a select below `lg`. |
| `DataTable` + `SavedViews` (`components/data-table`) | Every list repeated search, sort, paging by hand. One table with column picker, density, sorting, CSV export, selection and bulk actions; views remembered per browser. |
| `Wizard` (`components/ui/wizard.tsx`) | Create job, apply to a job, build an assessment and make an offer were single long forms. Steps with validation, a step list and a sticky Back / Next bar. |
| `SplitView` (`components/ui/split-view.tsx`) | List + preview layouts squeezed the table. The preview becomes a resizable, closable side pane. |
| React Flow (`@xyflow/react`) | Workflows are graphs: branches, merges, parallel paths. A DAG editor instead of a fixed row of four cards. |

## Decisions by page

| Page | Problem today | Decision |
|---|---|---|
| Dashboard | One fixed layout for every role; all widgets always on. | **Customize** drawer: show/hide and reorder widgets (per browser). Tabs **My work / Team**. New `/notifications` page for everything waiting on you. |
| Jobs list | Basic table, filters inline. | `DataTable` with saved views (Open, Drafts, My jobs, Needs approval), column picker, export, bulk status change. Board view kept. |
| Job record | Four underline tabs; overview, team and posting had no home. | Second sidebar: **Overview** (new: funnel, stage counts, team, next steps), **Pipeline**, **Candidates** (new: table of this job's applicants), **Details**, **Requirements**, **Interview kits**, **Hiring team** (new), **Job posting** (new: live preview of the careers page), **Settings**, **Activity**. |
| Create job | One long page. | `/jobs/new` as a **Wizard**: Basics → Description → Requirements → Pipeline → Hiring team → Review, with a live posting preview beside it. |
| Pipeline | Board only. | Board / **List** toggle, stage filter chips, compact cards, "my candidates" filter, stage summary strip. |
| Candidates list | Table and always-on preview squeeze each other; filters crowd the toolbar. | Second sidebar of **segments** (All, Active, Hired, Rejected, Talent pools, Recently viewed, saved views). Preview becomes a closable, resizable `SplitView`. `DataTable` with column picker. **Compare** up to 3 candidates side by side (`/candidates/compare`). |
| Candidate profile | Everything on one page. | Routes `/candidates/[id]/{overview,resume,applications,activity,notes,files}` under a header with tabs; rail keeps contact and next interview. |
| Application | Scorecards and offer lived in modals/panels. | New tabs **Scorecards** (full page: write, compare submitted ones per criterion) and **Offer** (builder wizard + approvals). |
| Interviews | Week calendar only. | Views **Day / Week / Month / Agenda** (routes or tabs), **My feedback** queue (`/interviews/feedback`), interview detail and **prep** page (`/interviews/[id]`: kit, questions, resume side by side, notes, submit feedback). |
| Reports | Seven report tabs in one row; one page holds everything. | Second sidebar grouped by **Pipeline / Speed / Sources / Team / Custom**; each report is its own route `/reports/[slug]`; `/reports/builder` (preview) to compose a chart from metric + dimension. |
| Approvals | Fine; small. | Add a detail drawer with the full approval chain and history. |
| Messages (preview) | Three panes fixed width. | Folder sidebar (Inbox, Unread, Sent, Archived, **Templates**), resizable panes, template picker in the composer. |
| Assessments (preview) | One overview page. | `/assessments/[id]` (questions, invited, results tabs), `/assessments/new` **builder** (sections, multiple choice / text / code questions, timer, pass mark), `/assessments/[id]/results/[resultId]` review with rubric. |
| Settings | Seven underline tabs + a pill row; 20 routes. | `SidebarLayout` with groups **Workspace / People & access / Hiring / Communication / Integrations / Automation / Security**. Deeper editors: pipeline stage editor (drag reorder), custom field builder with live preview, email template editor with variables panel and preview, per-role permission page `/admin/roles/[role]`. |
| Workflows (preview) | Fixed row of four nodes, one workflow. | `/admin/workflows` list of workflows (status, trigger, last run); `/admin/workflows/[id]` **React Flow DAG editor**: node palette (triggers, conditions with yes/no branches, delays, approvals, actions), drag to connect, inspector panel to edit every node, validation, versions, test run. Stored per browser. |
| My settings | One profile page. | `/settings/{profile,notifications,preferences}` with a sub-sidebar; preferences: density, start page, default views, theme. |
| Help | Static list. | Searchable, with categories and the shortcut sheet; `?` opens the shortcut dialog anywhere. |
| Command palette | Search only. | Adds **actions** (create job, add candidate, schedule interview, go to any settings section). |

## Applicant side

| Page | Decision |
|---|---|
| Careers site (new) | `/careers`: branded job board on the public API, search and filters (department, location, work mode). `/careers/[id]`: job page with a sticky apply card. `/careers/[id]/apply`: **Wizard** (contact → resume upload → questions → review) → confirmation. |
| Candidate portal | Split the single page into sign-in (`/candidate-portal`), an applications home, and `/candidate-portal/applications/[id]` with a **status timeline**, interviews (book, reschedule, cancel), messages and documents. |
