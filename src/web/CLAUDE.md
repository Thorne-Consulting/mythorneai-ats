@AGENTS.md

# MyThorneAI ATS — UI and UX rules

The interface follows the Figma file **MyThorneAI ATS (Copy)** (`figma.com/design/JomZ5fEDJWA4P7LFtU0chb`,
page "Component Collection" plus the screen frames). The running reference is the gallery at
**`/design`** (dev only), which renders every component in light and dark mode. If code and these
rules disagree, fix the code; if the Figma and the backend disagree, build the union: Figma's look,
our data.

## Stack

- Next.js (app router) + React 19 + **Tailwind 4**. No Mantine, no CSS modules, no inline `style`
  except for truly dynamic values (a computed width, a chart colour).
- Primitives: **Radix** via the `radix-ui` package. Icons: **lucide-react** only.
- Charts: Recharts, always through `@/components/ui/chart`.
- Data: TanStack Query + `api` from `@/api`. Toasts: `toast` from `@/components/ui`.
- `cn()` from `@/lib/cn` merges classes. Hooks: `@/lib/hooks` (`useDebouncedValue`, `useHotkeys`).

## Where things go

| Path                        | What                                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles.css`            | Design tokens (CSS variables, light + dark) and the Tailwind theme. The only place a hex value may appear.                                                                                           |
| `src/components/ui/*`       | The component library. Generic, no API calls, no business words. Import from `@/components/ui`.                                                                                                      |
| `src/components/status.tsx` | The single mapping from job/application/stage status to colour (`StatusBadge`, `StageBadge`, `stageTone`).                                                                                           |
| `src/components/<area>/*`   | Composites used by several pages: `layout/` (AppShell), `pipeline/` (BoardColumn, CandidateCard), `calendar/` (WeekCalendar), `messages/` (ChatBubble, ConversationRow), `workflow/` (WorkflowNode). |
| `src/features/<area>/*`     | Pages and feature components. They compose `ui` + composites and own data fetching.                                                                                                                  |
| `src/features/preview/*`    | Screens without a backend yet, on sample data (see "Preview screens").                                                                                                                               |
| `src/app/**/page.tsx`       | Thin route files. Fetch on the server if useful, render a feature component.                                                                                                                         |

Before writing markup, look in `components/ui` and the gallery. If something is missing and will
be reused, add it to `components/ui` (and a demo to the gallery) instead of styling it in a page.

## Tokens (never raw colours)

Use the Tailwind names; they switch automatically in dark mode.

- Surfaces: `bg-background` (page canvas), `bg-card`, `bg-popover`, `bg-muted` (table header,
  sunken), `bg-well` (board columns), `bg-secondary` (soft fill, disabled), `bg-accent` (hover and
  selected wash).
- Text: `text-fg` (primary), `text-fg-muted` (secondary), `text-fg-subtle` (meta, placeholders),
  `text-accent-foreground` (links and selected text on the wash).
- Lines: `border-border` (default), `border-border-subtle` (dividers inside cards), `border-input`.
- Actions: `primary`, `brand` (yellow, **only** the "Post a Job" button), `destructive`.
- Status tones: `tone-{blue|violet|green|amber|red|gray}-{bg|fg|dot}`. Prefer `<Badge tone>` or
  `<StatusBadge>` over using these by hand.
- Chrome (header and sidebar): `chrome`, `nav`, `nav-foreground`, `nav-hover`. Navy in light mode, neutral near-black in dark mode.
- Radii: `rounded-md` 7px controls · `rounded-lg` 11px menus, nav, accordions · `rounded-xl` 13px
  cards · `rounded-2xl` 16px panels and dialogs · `rounded-full` badges and avatars.
- Shadows: `shadow-card` on cards, `shadow-pop` on popovers, menus and dialogs. Nothing else.
- Type (Roboto): `text-3xl` 28px page titles · `text-lg` 18px card titles · `text-md` 16px · `text-base`
  14px body and controls · `text-sm` 13px table cells · `text-xs` 12px labels and badges · `text-2xs`
  11px supporting text. Add `tnum` to numbers that line up.

## Layout building blocks

- **`SidebarLayout` + `SectionNav`** (`components/layout/SectionLayout.tsx`): second, grouped vertical
  nav beside the content. Use it when an area has more than ~6 sub-pages or they fall into groups
  (Settings, Reports, a job record, My settings). Never stack two rows of tabs.
- **`DataTable`** (`components/data-table/DataTable.tsx`): every list of records. Give it `columns`
  (with `sortValue`/`csv` where useful), a `viewKey` so column choice, density and sort persist, the
  search/filters in `toolbar`, and `selectable` + `bulkActions` when bulk work makes sense.
  **`SavedViews`** sits above it for named filter presets.
- **`Wizard`** (`components/ui/wizard.tsx`): any form longer than one screen or with distinct
  phases (create job, apply, build an assessment, make an offer). Validate per step; put a live
  preview in `aside` when the output is visual.
- **`SplitView`** (`components/ui/split-view.tsx`): list + detail on one screen. The detail pane is
  closable and resizable; never force a permanent side panel that squeezes a table.
- **Graphs**: workflows and other node graphs use React Flow (`@xyflow/react`), styled with tokens.
- **`JobPostingView`** (`components/careers`): the one rendering of a job as applicants see it.

The page-by-page reasoning for where each of these is used lives in `docs/ui-depth-plan.md`.

## Colour means something

Blue: interview, primary action, links. Violet: screening. Green: open, hired, passed, success.
Amber: offer, on hold, pending, warning. Red: rejected, danger, destructive. Grey: applied, draft,
closed, neutral. Get stage/status colours from `components/status.tsx`; never pick one ad hoc.

## Screen anatomy

1. **Shell** (`AppShell`): navy header (brand, search, notifications, Post a Job, account) and navy
   sidebar (Dashboard, Jobs, Candidates, Pipeline, Interviews, Assessments, Reports, Messages ·
   Settings, Help, Thorney). Pages render only their content.
2. **PageHeader**: optional breadcrumbs, 28px bold title, one plain sentence saying what the page is
   for, actions on the right (secondary first, primary last, at most one primary).
3. **StatGrid** of up to four `StatCard`s when the page has headline numbers.
4. **The main card(s)**. List pages: one `Card` holding `Tabs` with counts → toolbar (`SearchInput`
   left, `FilterSelect`s and "More filters" right) → `Table` → `Pagination`. Dashboards: a grid of
   `Card`s with `CardHeader` + "View all →" (`CardLink`).
5. Record pages (candidate, application, job): identity header with stage badge and actions, then
   a main column and a right rail (`lg:grid-cols-[1fr_340px]`) for contact details, next interview
   and quick actions.
6. Settings: breadcrumbs, underline `LinkTabs` for areas, `LinkTabs variant="pills"` for sub-pages,
   cards and accordions for groups, a sticky "Discard / Save changes" pair when editing.

## Component rules

- Buttons: `variant` primary | secondary | brand | quiet | soft | danger | danger-quiet | link. One
  primary per view. Icons go in `leftIcon`. Icon-only actions use `IconButton` with a `label`.
- Fields: pass `label`, `description`, `error` straight to `Input`, `Select`, `Textarea`,
  `NumberInput`, `MultiSelect`, `TagsInput`, `Autocomplete`. Use `inset` (label inside the box, the
  Figma field) for short forms and settings; labels above for long forms and textareas. Native date
  and time inputs (`<Input type="date">`) instead of a picker library.
- Selects: `data` takes strings or `{ value, label, group?, disabled? }`; `onChange(value | null)`.
  Toolbar filters use `FilterSelect` with an `allLabel`. Long lists (people, candidates, jobs) use
  `SearchSelect` so the user can type to find an option.
- Checkbox / Switch / Radio: `checked` + `onCheckedChange` / `value` + `onValueChange`.
- Tables: `Table/THead/TBody/TR/TH/TD`. First column bold with a muted second line (`CellStack`).
  Row actions are `RowActions` (the ••• menu). Clickable rows use `TR interactive` plus a real
  link or `rowLinkProps` for keyboard access. Selection shows a `SelectionBar`.
- Overlays: `Modal` for short decisions and forms, `Drawer` for longer side tasks (schedule,
  preview), `ConfirmDialog` before anything destructive or irreversible. Never `window.confirm`.
- Feedback: `toast.success/error` after an action; `Alert` for persistent state; `EmptyState` with a
  next step and its action; `SkeletonRows` while loading, never a bare spinner on a whole page.
- Badges: `StatusBadge`/`StageBadge` for workflow state, `Badge` for everything else, `CountBadge` for
  counts on tabs.

## UX principles

- Design for the person who is here once a month (the interviewer): every screen says what it is for
  and what to do next. Recruiters get density through tables and boards, not through clutter.
- Access is enforced by the API; the UI hides what a role cannot do instead of showing disabled
  dead ends. Interviewers see a reduced sidebar.
- Structured, comparable evaluation is the point: keep scorecards locked after submit, keep
  disposition reasons mandatory, never add shortcuts around them.
- Optimistic updates (drag a card, toggle a switch) roll back with a `toast.error` on failure.
- Keyboard: `/` and ⌘K open search, ⌘\ collapses the sidebar, every interactive element is
  reachable and has a visible focus ring. Icon-only controls always have a label.
- Copy: sentence case, plain verbs ("Schedule interview", "Reject applicant"), no exclamation marks
  except the dashboard greeting. Say "Jobs" in the UI; the API still says `requisition`.
- Responsive: works from 360px. Stat grids collapse 4 → 2 → 1, tables scroll sideways inside their
  card, the sidebar becomes a drawer below `md`.
- Dark mode: neutral greys, no blue tint; blue is reserved for actions, links and selection. Tokens only,
  and check `/design` in both themes after any visual change.

## Preview screens (sample data)

Assessments, the Messages inbox, Automated workflows, Single sign-on, Access requests,
Invitations, Team access and the AI match column come from the Figma but have no backend yet. They
live in `src/features/preview/`, read from typed sample data in that folder, and show a
`<Badge tone="amber">Preview</Badge>` next to the title. When a backend lands, replace the sample
module with a query and delete the badge.

## Branding

Product name **MyThorneAI ATS**, tagline "Smarter Hiring. Brighter Futures." Assets in
`public/brand/` (`mark.png`, `thorney.png`). Thorney the mascot opens quick help; it is not a chat
assistant.

## Verifying UI changes

Run the web app (`npm run dev`) and the API, then check the page in the browser in light and dark
mode, at desktop and at 375px. Typecheck with `npx tsc --noEmit -p .`. Logic self-checks:
`node --experimental-strip-types src/lib/cn.ts` and `node --experimental-strip-types src/components/ui/page-list.check.mjs`.
