# Workspace shell, settings, people and access, and platform services

## Overall

- **Three columns of navigation squeeze every settings page.** At 1440 the page sits next to the 234px app sidebar (`AppShell.tsx:101-108`) and the 224px settings nav (`SectionLayout.tsx:126-142`), so content gets about 890px. At 1024, where the section nav first appears (`lg:block`), content gets about 480px. The settings nav has 21 items in 6 groups and is about 1,050px tall. Its `lg:sticky lg:top-[101px]` aside has no `max-h`/`overflow-y-auto`, so on a long page (Activity history) "Single sign-on" and "Activity history" are below the fold and can't be reached until you scroll to the end. The "SETTINGS" eyebrow sits right above the "WORKSPACE" group label, two uppercase labels in a row.
- **Two settings areas with overlapping names and copied registries.** "My settings" (`MySettings.tsx:37-67`, 3 pages) and workspace "Settings" (`AdminShell.tsx:52-239`, 21 pages plus 2 child pages) each have a page called "Notifications" (personal email versus the Slack channel). The command palette keeps its own hand copy of the settings list (`CommandSearch.tsx:79-98`). That copy has already drifted: it misses General, Access requests, Team access and AI activity, so typing "general" in ⌘K finds nothing. Several pages are too thin to be pages. Email delivery is one read-only alert, Candidate portal is one field, and Calendar is one status card.
- **Some controls look real but do nothing, and a demo exposes them.**
  - The "Sign in with Google / Microsoft" switches on `/admin/general` are saved but never read. `AllowGoogleLogin`/`AllowMicrosoftLogin` appear only in the GET/PUT handlers. `FindOrProvisionAtsUserAsync` (`AuthenticationServiceCollectionExtensions.cs:177-218`) ignores them.
  - A member's "Team" is never used for access. `AppUser.Department` appears in no scope filter (`AtsEndpointHelpers.cs:15-71`). Yet the Members stat card says "Members limited to one team" (`AdminUsers.tsx:147`) and the page description says "the team they see".
  - SSO, Invitations, Access requests, Team access and Notification preferences run on sample data. The SSO stats say "44 / 48 members" in a workspace that has 10.
- **RBAC is three mechanisms on the server, hand-copied about 180 times across 40 web files, and the two sides already disagree.** On the server, role policies (`AtsPolicies`) sit beside in-handler `Permissions.HasAsync` checks and `CanManage`/`Scope*` row filters. On the web, `canManageJob` (`requisition-data.tsx:29-35`) lets any Recruiter manage any job. The server's `CanManage` (`AtsEndpointHelpers.cs:62-71`) refuses a Recruiter on a confidential job they only view, so the UI shows edit and move actions that come back 404. The `templates` permission is never checked on the web at all. The model is 4 fixed roles plus 3 switches, well below Greenhouse, Ashby and Lever custom roles.
- **Every sign-in failure path is broken.**
  - When the WorkOS callback refuses someone ("not invited", "outside the company domains") it redirects to `/login?error=…` (`AuthEndpoints.cs:143,153`). There is no `/login` route: `curl` returns 404 and the reason is lost.
  - OIDC failures (`context.Fail`) have no `OnRemoteFailure` handler.
  - A session that expires mid-work shows a "Please sign in." toast (`api.ts`) instead of sending you to sign in.
  - The Sign in button hard-codes `returnUrl=/` (`LoginPage.tsx:94`), so a deep link from an email lands on the dashboard.
- **Records read like a database dump.**
  - Activity history shows "Requisition `c8d2451a-780`" and email addresses, with no link, no before/after and no names.
  - The Members table spends a column on "Last updated", which reads Oct 18 7:50 PM on every row, instead of "Last signed in".
  - On phone every table scrolls sideways and the key column is cut off (Members role, Roles matrix, Team access, Audit "Done by").

**Target experience.** One Settings area that takes over the left rail, like Linear or Notion. It has a "← Back to MyThorneAI" link, a "Your account" group (Profile, Notifications, Preferences, Calendar) and, for admins, about 12 workspace pages instead of 24. Other areas with a section nav (job record, Reports) collapse the app sidebar to the 84px icon rail automatically. People are managed in one Members hub with tabs: Members · Invited · Requests. Invites send a real email. Uninvited sign-ins become access requests instead of a 404. Permissions are computed once on the server and shipped to the browser as CASL rules, so the API and the UI cannot disagree. Admins get custom roles cloned from the four built-in ones. SSO and directory sync are set up in WorkOS's own hosted setup screens (the Admin Portal), which the installed SDK already supports. Activity history reads as sentences with links and before/after values. Webhooks show the exact payload and response of every delivery.

## Features

### Primary navigation and information architecture — COMPLETE · M
- **Where:** `src/web/src/components/layout/nav.ts`, `AppShell.tsx:328-438`, every route under `src/web/src/app/(workspace)`.
- **Today:**
  - Role-filtered list: Dashboard, Jobs, Candidates, Pipeline, Interviews, Assessments, Reports (only with the `reports` permission), Messages, then Settings and Help. Interviewers get Dashboard, Interviews, Candidates.
  - `NavItem.preview` is set on Assessments and Messages (`nav.ts:44,48`), but `NavLink` never renders it. The sidebar presents two sample-data screens as real.
  - `/approvals` and `/notifications` have no nav entry. Approvals hides under Dashboard (`match: ['/approvals']`). Notifications is only reachable through the bell's "View all".
  - Admins' "Settings" opens Members (`/admin`). Everyone else's opens `/settings/profile`.
- **Design critique:**
  - The sidebar is 234px of 49px-tall rows (`h-[49px]`, `text-md`, 22px icon gap). That is generous for 10 items, but it never gives way when a section nav appears.
  - Pipeline (a cross-job board) sits next to Jobs, whose record already has a Pipeline tab. That makes two doors to the same board.
  - The Dashboard item carries the pending-approvals count (`AppShell.tsx:344`) while the bell shows the same number. One fact is shown twice in the chrome.
- **Product critique:**
  - Ashby and Lever keep five or six top-level items and put everything waiting on you in one "Inbox". Linear does the same. We spread approvals, notifications, messages and "waiting on you" across four places.
  - Greenhouse puts "My dashboard" first and lets you pin jobs. We have no pinned or recent records in the nav.
- **Complete means:**
  - [ ] Preview items show the amber "Preview" badge in the sidebar and in the settings nav (`AdminShell.tsx:291-304` drops `preview` too), or are hidden until their backend lands.
  - [ ] One "Inbox" item (bell count) that opens `/notifications` and holds approvals, feedback due, replies and stuck work. The count moves off the Dashboard item.
  - [ ] Pipeline becomes a view inside Jobs ("Board" toggle on `/jobs`) rather than a top-level item (cross-area; Jobs owns it).
  - [ ] Up to 5 "Recent" records (jobs or candidates opened) under the main list, collapsible. Stored per user on the server, see Preferences.
  - [ ] Nav built from the user's ability (see RBAC), not from `user.role === 'Interviewer'` (`nav.ts:37`).
- **Backend:** none for the structure. Recents: `AppUser.PreferencesJson` (see Preferences).
- **Libraries:** none.

### Sidebar collapse and section-nav layout — COMPLETE · S
- **Where:** `AppShell.tsx:65-67,101-108,361-393`, `lib/collapse-pref.ts`, `SectionLayout.tsx:39-142`.
- **Today:**
  - ⌘\ and a toggle collapse the rail to 84px, saved in a cookie so the server renders it without a jump. That part works well.
  - Below `lg`, `SectionNav` turns into a native `<select>` with a fixed `id="section-nav-select"` (line 58), so two section navs on one page would share an id.
- **Design critique:**
  - Nothing ties the two sidebars together. On `/admin/*`, `/settings/*`, `/reports/*` and job records the user pays 234 + 224px of chrome.
  - The 21-item settings nav overflows the viewport while sticky (see Overall).
  - In collapsed mode the toggle moves below Thorney as a second button (lines 384-393). The expand button sits in a different place from the collapse button.
- **Product critique:**
  - Linear, Notion and Slack replace the app sidebar with the settings sidebar and show a "Back to app" link.
  - Ashby keeps a slim icon rail beside record sub-navigation.
  - Either pattern returns 150 to 230px to the content.
- **Complete means:**
  - [ ] `/admin/*` and `/settings/*` render a settings rail *in place of* the app sidebar: "← Back to MyThorneAI" at the top, then the grouped settings nav. On phone it becomes the existing drawer.
  - [ ] Any other page that renders `SidebarLayout` collapses the app sidebar to the 84px rail by default. A user who expanded it there keeps that choice (second cookie `ats-nav-collapsed-section`).
  - [ ] `SectionNav` aside gets `lg:max-h-[calc(100dvh-101px)] lg:overflow-y-auto` so every item stays reachable.
  - [ ] Use `useId()` for the select id. Use one toggle button that stays in place in both states.
- **Backend:** none.
- **Libraries:** none.

### Mobile navigation drawer — COMPLETE · S
- **Where:** `AppShell.tsx:109-121,152-160`.
- **Today:** A hand-made overlay `div` with a backdrop `button`. It closes on route change only.
- **Design critique:**
  - There is no focus trap, no Esc to close, no `aria-modal`, and no scroll lock (the page scrolls behind the drawer).
  - The drawer starts at `top-[64px]`, so the header stays live above a modal surface.
  - "Post a Job" disappears below `lg` (`max-lg:hidden`, line 182) and the drawer doesn't offer it. On a tablet a hiring manager has no visible way to post a job.
- **Product critique:** The baseline for a phone drawer is Radix or Vaul-style behaviour (trap focus, Esc closes, swipe to close).
- **Complete means:**
  - [ ] Build the drawer on the existing `Drawer` (Radix Dialog, `radix-ui@1.8.1` already installed): focus trap, Esc, `aria-modal`, scroll lock.
  - [ ] "Post a Job" appears as the first drawer item for roles that can post.
  - [ ] Account (name, role, sign out) appears at the bottom of the drawer, since the avatar menu is the only other route to sign out on phone.
- **Backend:** none.
- **Libraries:** `radix-ui@1.8.1` (installed). It replaces the hand-made overlay.

### Account menu — COMPLETE · S
- **Where:** `AppShell.tsx:262-326`.
- **Today:** Email label, "My profile" (via `window.location.assign`, a full reload, line 292), a light/dark/system theme picker, and Sign out.
- **Design critique:**
  - A full page reload for an in-app link.
  - The theme picker is the third copy of the same control (account menu, Preferences, ⌘K "Turn dark mode on or off").
  - Admins can't reach "My settings" from here except through "My profile".
- **Product critique:** Linear and Notion menus offer Preferences, Keyboard shortcuts, Help, What's new and Sign out. The theme lives in Preferences.
- **Complete means:**
  - [ ] Items: Profile, Preferences, Notifications (personal), Keyboard shortcuts (opens the existing sheet), Help, Sign out. Use `router.push`.
  - [ ] Drop the theme block from the menu. Keep it in Preferences and in ⌘K.
  - [ ] Sign out clears the query cache (already done) and returns to sign-in with no auto-login loop.
- **Backend:** none.
- **Libraries:** none.

### Notification bell — MERGE · S
- **Survivor:** the Notifications inbox (`src/web/src/features/notifications/*`). The bell becomes a popover preview of that same list.
- **Where:** `AppShell.tsx:194-254`, `features/approvals/approval-data.ts:19-25`, `features/notifications/notification-items.ts`.
- **Today:**
  - The bell title says "Waiting on you" but lists approvals only.
  - The dashboard card "Waiting on you" (same words) and `/notifications` list approvals, feedback due, candidate replies and stuck applications.
  - In the dashboard screenshot the card shows 7 items while the bell says "You are all caught up."
  - The bell polls every 60 seconds. "Done" state lives in `localStorage` (`useDoneNotifications`).
- **What moves:**
  - The bell uses `useNotifications()` (`NotificationsPage.tsx:33-46`) and shows its open count and its top 8 items, grouped by kind.
  - "Mark as done" in the popover.
  - The Dashboard sidebar badge goes away.
- **Backend (for complete):**
  - A `Notification` table (UserId, Kind, EntityType, EntityId, Title, Href, CreatedAt, ReadAt, DoneAt), written where events already happen: approval requested, scorecard due (`EmailOutboxWorker.cs:190-223`), candidate replied, stuck application.
  - `GET /api/notifications?status=open|done`, `POST /api/notifications/{id}/done` and `/read`.
  - This replaces `localStorage` done state, so read/done follows the person across devices.
- **Libraries:** none. Knock (`@knocklabs/react@0.15.1`) and Novu (`@novu/react@3.19.2`) were considered and rejected: paid vendors for what is one table and a popover.

### Command palette (shell parts) — COMPLETE · S
- **Where:** `src/web/src/components/layout/CommandSearch.tsx`.
- **Today:**
  - `/` and ⌘K open it. It runs fuzzy matching over actions and pages plus a server search of candidates and jobs, with a correct combobox/listbox ARIA pattern.
  - Settings pages come from a hard-coded `SETTINGS` array (lines 79-98) that misses `/admin/general`, `/admin/access-requests`, `/admin/team-access` and `/admin/ai`.
  - "Schedule interview" just opens `/interviews`.
- **Design critique:** With an empty query it shows only Actions. There are no recent items, and the empty palette is mostly empty space.
- **Product critique:** Linear and Superhuman show recent records first. Typing a page name ("webhooks") jumps there. Ours does, except for the missing pages.
- **Complete means:**
  - [ ] Move the settings registry (`GROUPS`) out of `AdminShell.tsx` into `features/admin/settings-registry.ts`. AdminShell, the palette and the settings rail all read it.
  - [ ] An empty query shows 5 recent records (same store as nav Recents), then Actions.
  - [ ] Actions filtered by ability (`can('create','Job')`) instead of role lists (lines 137-158).
- **Backend:** recents in `PreferencesJson`.
- **Libraries:** none. `cmdk@1.1.1` is not needed: the existing palette already has correct keyboard handling and ARIA.

### Keyboard shortcuts sheet — DONE
- **Where:** `CommandSearch.tsx:49-76,386-394`. It is also on `/help`.
- **Why done:** `?` opens a modal listing every shortcut from one array (`SHORTCUTS`). The same list renders in Help, so the two can't drift. It gives the Ctrl/⌘ hint and is reachable by keyboard. For an app with 7 shortcuts this is the whole feature.

### Thorney quick-help popover — MERGE · S
- **Survivor:** Help (`/help`) and the shortcuts sheet.
- **Where:** `AppShell.tsx:440-484`.
- **Today:** The mascot (72px tall) opens a popover with 3 tips: `/` to search, ⌘\ to collapse, drag cards. The tips are word-for-word what Help and the `?` sheet already say.
- **What moves:**
  - Keep the mascot as brand art at the foot of the rail. Clicking it opens `/help`.
  - The 3 tips are deleted (they live in Help).
  - When collapsed, the mascot shrinks to 32px so the rail doesn't spend 48px of height on it.
- **Backend:** none.
- **Libraries:** none.

### Session expiry and access-denied handling — COMPLETE · S
- **Where:** `src/web/src/api.ts`, `src/web/src/app/providers.tsx`, `src/web/src/app/(workspace)/layout.tsx`, `AdminShell.tsx:256-266`.
- **Today:**
  - The cookie session lasts 8 hours with sliding expiry (`AuthenticationServiceCollectionExtensions.cs:70-71`).
  - A 401 mid-session becomes a toast "Please sign in." on whatever action failed. Queries stay on skeletons or error states, and nothing sends the person to sign in.
  - Deactivation does take effect on the next request (`ValidateSessionAsync`), which is good.
  - The client keeps the old `user.role` until a full reload.
- **Design critique:** A busy recruiter after lunch sees random red toasts instead of one clear "Your session ended. Sign in again" screen.
- **Complete means:**
  - [ ] `QueryCache`/`MutationCache` `onError` in `providers.tsx`. On `ApiError` 401, `window.location.assign('/auth/login?returnUrl=' + encodeURIComponent(location.pathname + location.search))`.
  - [ ] On a 403 from a mutation, toast "You don't have access to do this" and refetch `/api/auth/me` (role may have changed). Swap the `AuthProvider` value.
- **Backend:** none.
- **Libraries:** none.

### Settings information architecture — COMPLETE · M
- **Where:** `AdminShell.tsx:52-337`, `MySettings.tsx:37-67`, `settings-shared.tsx`, `CommandSearch.tsx:79-98`, every `/admin/*` and `/settings/*` route.
- **Today:**
  - 21 workspace nav items: General, Candidate portal, Reminders, Notifications, Email delivery · Members, Roles, Invitations, Access requests, Team access · Pipelines, Custom fields, Posting templates, Email templates, Approvals · Calendar, Webhooks, AI · Workflows · Single sign-on, Activity history.
  - Plus 3 personal pages under a separate shell.
  - AdminShell owns the PageHeader, so pages can't put actions in it. Invitations, Access requests and SSO paint a floating right-aligned button row with `-mt-1 mb-4 flex justify-end` (`SsoPage.tsx:50`, `InvitationsPage.tsx:51`, `AccessRequestsPage.tsx:48`). Members puts its primary button in the table toolbar instead. Three pages, three placements.
  - Email templates exist twice: `/admin/email-templates` (real API) and `/messages/templates` (Preview).
- **Design critique:**
  - A floating "Test connection" button above an info banner reads as orphaned (see `/admin/sso` screenshot).
  - `SettingsSection` always renders its sticky footer with a disabled "Save changes" (`settings-shared.tsx:58-74`), so every card carries an empty grey bar.
  - On phone (`/admin/roles`) the sticky footer covers the card title.
- **Product critique:** Greenhouse "Configure" has about 25 entries but groups them into a searchable landing page. Linear has about 15 settings pages with a search field at the top of the rail. Ours has neither a landing page nor settings search.
- **Complete means:**
  - [ ] One Settings area, one rail (see Sidebar). Groups and pages, 24 down to about 13:
    - **Your account:** Profile (with Calendar connection), Notifications, Preferences.
    - **Workspace:** General. Candidate portal address and Email delivery status become rows in General.
    - **People:** Members (tabs Members · Invited · Requests), Roles, Single sign-on and provisioning.
    - **Hiring:** Pipelines, Candidate fields, Templates (posting and email in one library with tabs), Approvals.
    - **Alerts:** Reminders and Slack/Teams in one page.
    - **Integrations:** Calendar, Webhooks, AI.
    - **Security:** Activity history.
    - Workflows stays under Hiring when its backend lands.
  - [ ] A settings search field at the top of the rail, filtering the registry by label and keywords.
  - [ ] Pages render their own `PageHeader` with `actions`. AdminShell only provides the rail and breadcrumbs, through a `useSettingsSection()` helper that reads the registry.
  - [ ] `SettingsSection` shows its footer only while dirty.
  - [ ] Preview badges shown in the rail from `section.preview`.
  - [ ] Old URLs keep working through `redirects()` in `next.config.ts` (`/admin/portal`, `/admin/email`, `/admin/invitations`, `/admin/access-requests`, `/admin/team-access`).
- **Backend:** none.
- **Libraries:** none.

### Sign-in page and sign-in errors — COMPLETE · M
- **Where:** `src/web/src/features/auth/LoginPage.tsx`, `src/web/src/app/(workspace)/layout.tsx:10-15`, `src/server/Auth/AuthEndpoints.cs`, `AuthenticationServiceCollectionExtensions.cs:146-218`.
- **Today:**
  - In production the page shows the logo, "Sign in with your company account" and one Sign in button that goes to `/auth/login?returnUrl=/` and then to WorkOS AuthKit.
  - In development it lists test accounts (good).
  - Errors from the callback go to `/login?error=…`, which 404s. The page never reads an `error` parameter.
  - The very first person to sign in becomes Admin and owner. Everyone else must already exist.
  - Sign-ins are not written to Activity history.
- **Design critique:**
  - The extra click (a card with a single button) adds a step for nothing. Most SaaS go straight to the identity provider when there is no error to show.
  - The "unavailable" alert is the only state shown.
- **Product critique:**
  - Ashby and Greenhouse show a branded sign-in with "Continue with Google / Microsoft / SSO". Someone who isn't invited sees "Ask your admin, or request access".
  - We lose the reason, lose the deep link, and show a 404.
- **Complete means:**
  - [ ] Unauthenticated requests go straight to `/auth/login?returnUrl=<current path>`. Keep the page only for dev accounts, errors and "unavailable".
  - [ ] A real `/login` route (outside `(workspace)`) that reads `error` and shows a plain message per case:
    - not invited: show "Request access", which creates an access request (see Members).
    - wrong domain: "Use your work email at acme.com".
    - provider down: "Try again".
  - [ ] An OIDC `OnRemoteFailure` handler that redirects to the same `/login?error=`.
  - [ ] The workspace name and logo on the page (from `GET /public/organization`, which already exists).
  - [ ] Audit `SignedIn`, `SignInDenied` (with reason) and `SignedOut`.
  - [ ] Store `AppUser.LastSignInAt` on every sign-in.
- **Backend:**
  - Error codes instead of English strings in the redirect.
  - `LastSignInAt`, `ProfilePictureUrl` (WorkOS returns it) columns plus a migration.
  - `Audit.Add` in the callback (the actor is the signing-in email).
- **Libraries:** `WorkOS.net` 6.4.0 (installed; 6.8.0 is current). `AuthenticateWithCodeAsync` already returns `AuthenticationMethod` and the profile picture.

### Development test accounts on sign-in — DONE
- **Where:** `LoginPage.tsx:53-85`, `AuthEndpoints.cs:216-262`.
- **Why done:** It only exists when `Auth:Mode=Development` and the environment is Development; startup throws otherwise (`AuthenticationServiceCollectionExtensions.cs:31-37`). It lists active users with role and signs in with one click. It is a dev tool and does its job. The one fix, sending people back to the page they came from instead of `/` (line 26), belongs to the sign-in page item above.

### Onboarding: owner setup, setup checklist, first run for invited people — COMPLETE · M
- **Where:** `features/admin/OrganizationSetupModal.tsx`, `features/dashboard/DashboardPage.tsx:460-500`, `ConfigurationEndpoints.cs:340-360`.
- **Today:**
  - The owner gets a modal that can't be dismissed: name, comma-separated domains, "stuck applications after N days", and two sign-in switches that do nothing.
  - Admins get an 8-step "Finish setting up" card on the dashboard. "Name your company" links to `/admin` (Members), not General (line 348).
  - "Turn on candidate emails: Add the email sending key and sender address to the server" and "Turn on AI help: Add the OpenAI key to the server" (lines 353, 355) ask a customer to edit our server.
  - Invited members (recruiters, hiring managers, interviewers) get nothing on first sign-in.
  - Query keys disagree: Settings invalidates `['setup-checklist']`, the dashboard reads `['admin','setup-checklist']`. The card doesn't update after saving settings.
- **Design critique:**
  - Domains are a comma text box in the modal but a tag input on General: two input styles for one value.
  - A reminder-days number has no place in "set up your workspace".
- **Product critique:**
  - Ashby and Gem run a short guided setup (company, invite team, first job, connect calendar) and give each role a first-run checklist.
  - An interviewer who is here once a month needs "You have 2 interviews. Here is how to submit a scorecard", not the admin dashboard.
- **Complete means:**
  - [ ] Owner modal: workspace name, logo (see General), time zone (prefilled from the browser), company domains as tags. Nothing else.
  - [ ] Checklist steps link to the right page and never mention server keys. Show "Candidate email: ready" as status only, and hide server-side tasks when hosted (a config flag).
  - [ ] One query key for the checklist.
  - [ ] A role-specific "Getting started" card for people whose `LastSignInAt` was null at this sign-in, with 3 to 4 steps tied to real data:
    - Interviewer: upcoming interviews, how scorecards work, connect calendar.
    - Hiring manager: your jobs, approvals.
    - Dismissible, with the dismissal stored per user.
- **Backend:**
  - `AppUser.LastSignInAt`.
  - `PreferencesJson.onboardingDismissed`.
  - Checklist hrefs fixed, server-config items hidden behind a `Hosting:Managed` setting.
- **Libraries:** none. Guided-tour libraries (`driver.js@1.14.0`, `react-joyride@3.2.0`) were rejected: a data-backed checklist teaches more than tooltips over empty screens.

### Members — COMPLETE · M
- **Where:** `/admin`, `features/admin/AdminUsers.tsx`, `UserModal.tsx`, `admin-data.ts`; `AdministrationEndpoints.cs:221-330`.
- **Today:**
  - Lists all users (one query, client-side search, role, team and status filters, 25 per page).
  - Bulk change role, deactivate and reactivate. You can't select yourself. Deactivation asks for confirmation.
  - "Add member" upserts by email and sends no email, so the person doesn't know they were added.
  - "Edit access" is offered on your own row (lines 347-350), so an admin can demote themselves. The server has no "at least one active admin" guard, and nothing stops the owner being deactivated.
  - Bulk actions fire one `POST /api/admin/users` per person with the full record (`AdminUsers.tsx:80-95`). A partial failure leaves a mixed state behind one error toast.
  - "Add member" with an existing email silently edits that person.
- **Design critique:**
  - Four stat cards (Active members, Roles in use, Interviewers, Teams) say little: "Roles in use 4" is noise, and "Members limited to one team" is false. On phone they stack 1-wide and take four screen heights before the table (`StatGrid` is 1-column at base, `card.tsx:169-176`).
  - "Last updated" shows the same timestamp on every row.
  - The role badge is outline-grey for everyone except Admin.
  - On phone the table scrolls sideways and the Role column is cut off.
- **Product critique:**
  - Linear, Slack and Ashby member lists show last active, invite status, a role selector right in the row, and pending invites and requests as tabs.
  - Greenhouse adds "Job permissions" per user.
  - Nobody hides the owner's identity. We have an owner concept (`Organization.OwnerEmail`) that isn't shown or transferable.
- **Complete means:**
  - [ ] Tabs with counts: Members · Invited · Requests. They replace the stat cards (see Invitations and Access requests).
  - [ ] Columns: Member (name, email, "Owner" badge), Role (an inline select for others; read-only on your own row), Teams, Last signed in ("Never" for invited), status, ••• menu.
  - [ ] An "Invite people" primary button in the page header. It replaces "Add member" and sends an email.
  - [ ] Guards: you can't change your own role or deactivate yourself. The last active admin can't be demoted or deactivated (API returns 409 with a plain message). The owner can't be deactivated; ownership moves via General.
  - [ ] Bulk endpoint `PATCH /api/admin/users` `{ ids, role?, isActive?, departments? }`, all or nothing.
  - [ ] Clicking a row opens a side drawer: role, teams, last sign-in, recent activity by this person (from the audit log), "Remove access".
  - [ ] On phone, rows render as stacked cards (name, role, status) instead of a sideways table.
- **Backend:**
  - Columns `AppUser.LastSignInAt`, `InvitedAt`, `InvitedByEmail`, `Departments text[]` (replaces the single free-text `Department`).
  - `PATCH /api/admin/users` (bulk). Create is a 409 when the email exists.
  - Last-admin and owner guards in one helper used by single and bulk updates.
  - Audit "RoleChanged {from,to}", not just the new value (`AdministrationEndpoints.cs:317-324`).
- **Libraries:** none.

### Invitations — MERGE · M
- **Survivor:** Members, "Invited" tab. Invite = an `AppUser` row that has never signed in, plus an email.
- **Where:** `/admin/invitations`, `features/preview/InvitationsPage.tsx`, `InviteMembersModal.tsx`, `sample-admin.ts:83-141`.
- **Today:**
  - Sample data only.
  - The modal (tag input of emails plus role) is decent.
  - Its "Expired" state and "The new link works for 7 days" promise invent a token model the product doesn't need. Access is gated by the `AppUser` row and the company's identity provider, not by a link.
- **What moves:**
  - `InviteMembersModal` becomes the "Invite people" flow: emails, role, teams, optional personal note.
  - It creates `AppUser` rows (`InvitedAt`, `InvitedByEmail`, `IsActive=true`, `LastSignInAt=null`).
  - It queues one email per person through the existing `EmailOutbox`/`EmailTemplates`: "{inviter} invited you to {workspace}", with a button to `{PublicUrl}/auth/login`.
  - The Invited tab offers "Send again" (re-queues the email, updates `InvitedAt`) and "Withdraw" (deletes the row only if it never signed in).
  - No expiry.
- **Backend:**
  - `POST /api/admin/invitations` `{ emails[], role, departments[], note? }`. It returns created and skipped (already a member), respects `AllowedEmailDomains`, and audits.
  - `POST /api/admin/invitations/{userId}/resend`.
  - `DELETE /api/admin/invitations/{userId}`.
  - Add a `member_invited` key to `EmailTemplates.Defaults` so admins can edit the wording.
- **Libraries:** none. WorkOS `UserManagement.SendInvitationAsync` exists in the installed SDK. It was rejected because it only works in WorkOS mode and would put a second invite token beside the `AppUser` row.

### Access requests — MERGE · M
- **Survivor:** Members, "Requests" tab, fed by the sign-in callback.
- **Where:** `/admin/access-requests`, `features/preview/AccessRequestsPage.tsx`, `sample-admin.ts:43-81`.
- **Today:**
  - Sample data.
  - In reality, an uninvited sign-in hits "This account has not been invited" (`AuthenticationServiceCollectionExtensions.cs:200-201`) and then the `/login` 404. There is no path from a person to a request.
  - The page also carries an "Invite members" button whose result goes nowhere ("Follow them under Invitations").
- **What moves:**
  - When the callback rejects someone whose domain is allowed, it stores an `AccessRequest` and redirects to `/login?error=pending`: "We asked your admin. You'll get an email when you're in." An optional note field on that page saves to the request.
  - Admins see it in the Requests tab and in the Notifications inbox, and get an email.
  - Approve: pick role and teams. This creates the `AppUser` and emails the person.
  - Decline: marks the request declined and blocks repeat requests for 7 days.
- **Backend:**
  - New entity `AccessRequest` (Id, Email, Name, Note, Status Pending/Approved/Declined, CreatedAt, DecidedBy, DecidedAt). Unique on pending email.
  - `GET /api/admin/access-requests`, `POST …/{id}/approve {role, departments}`, `POST …/{id}/decline`.
  - Audit both decisions. One migration.
- **Libraries:** none.

### Team access matrix and the member "Team" field — MERGE · M
- **Survivor:** department scope on each member (Members drawer) plus the job's own hiring team and confidential viewers (`RequisitionSettings.tsx`, Jobs area). "See offers" becomes a permission in Roles.
- **Where:** `/admin/team-access`, `features/preview/TeamAccessPage.tsx`, `UserModal.tsx:88-94` ("Team" free text), `AppUser.Department`.
- **Today:**
  - The matrix of teams by jobs by three switches (view, move stages, see offers) is sample data.
  - The real "Team" on a member is a free-text box that no query reads.
  - The job record already has the real per-job model: owner, recruiter, `ViewerEmails`, `IsConfidential`, all enforced in `ScopeRequisitions`.
- **Why merge:**
  - A global teams-by-jobs grid becomes unusable past about 20 open jobs and goes stale every time a job opens.
  - It duplicates the job-level hiring team.
  - Greenhouse solves the same need with per-user "department" permission scopes plus per-job hiring teams. That is the shape to copy.
- **What moves:**
  - Member gets `Departments[]`, picked from the distinct `Requisition.Department` values, not free text.
  - `ScopeRequisitions`/`ScopeApplications`: when a Recruiter or Hiring manager has departments, they see jobs in those departments plus jobs they are on. Empty means all, as today for Recruiters.
  - "See offers" goes to the Roles permission list.
  - The page and its sample data are deleted, with a redirect to `/admin`.
- **Backend:**
  - `AppUser.Departments text[]` (migrate the old `Department`).
  - Two `Where` clauses in `AtsEndpointHelpers.cs:15-59`.
  - Department picklist endpoint (`SELECT DISTINCT Department FROM Requisitions`).
- **Libraries:** none.

### Roles and permissions, custom roles — COMPLETE · XL
- **Where:** `/admin/roles`, `/admin/roles/[role]`, `features/admin/RolePermissionsSection.tsx`; `src/server/Auth/Permissions.cs`, `AtsPolicies.cs`, `ConfigurationEndpoints.cs:289-318`; `UserRole` enum.
- **Today:**
  - Four fixed roles.
  - Three switchable "extras" (Reports, Import, Templates) stored as JSON on `Organization.RolePermissionsJson`, with the Admin column as disabled "Always on" switches.
  - Role detail shows "Basic access: workspace and security" as one vague phrase, the 3 switches, and the members with that role.
- **Design critique:**
  - The overview spends a large blue alert on "Admin permissions are locked".
  - A column of four disabled switches tells you nothing.
  - "Basic access" is never spelled out. An admin can't answer "can a hiring manager see offers?" from this page.
  - On phone the matrix scrolls sideways with "Always on" cut off.
  - Role detail for Admin is three disabled switches beside a member list.
- **Product critique:**
  - Greenhouse has fully custom user permission levels (Site admin, Job admin with custom levels, Interviewer) and per-department scopes.
  - Ashby has custom roles with about 60 grouped permissions.
  - Lever has custom roles cloned from built-ins.
  - Customers above about 50 seats ask for a "Coordinator" role (schedule interviews, no offers) and an "Agency" or "Executive viewer" role on day one. With 3 switches we can't sell into them.
- **Complete means:**
  - [ ] Roles list: built-in roles (locked, can be cloned) and custom roles, each with a description, member count and "Duplicate".
  - [ ] Role editor:
    - name and description;
    - **scope** (radio): All jobs · Jobs in their teams · Jobs they're on · Only their interviews;
    - **permissions** as grouped checklists: Jobs (create, edit, close, approve), Candidates (add, import, edit, delete, export), Pipeline (move stages, reject), Interviews (schedule, see all feedback, submit feedback), Offers (see, create, approve, send), Messages (send), Reports (see, export), Templates (edit), Settings (manage members, manage workspace);
    - a "What this role can do" summary sentence generated from the checks.
  - [ ] Delete a custom role: you must reassign its members first, in the same dialog.
  - [ ] Role changes take effect on the next request (they already do through `ValidateSessionAsync`) and are audited with a before/after diff.
  - [ ] Members and Invite pick from these roles.
- **Backend:**
  - Entity `Role` (Id, Name, Description, IsBuiltIn, Scope enum, Permissions text[]). Seed the four built-ins with today's behaviour. `AppUser.RoleId` replaces `UserRole` (migration maps the enum). Drop `RolePermissionsJson`.
  - Permission catalog as one static class (`Permissions.cs` grows into it).
  - Authorization through a custom `IAuthorizationPolicyProvider` (`"perm:offer.approve"`) and one `AuthorizationHandler<PermissionRequirement>` reading the role from an `IMemoryCache` keyed by role id, cleared on save.
  - `Scope*` helpers switch on `role.Scope` instead of `IsInRole`.
  - Endpoints: `GET/POST/PUT/DELETE /api/admin/roles`.
  - Phase this after RBAC phase 1 below. Phase 1 is L, this is L more.
- **Libraries:**
  - ASP.NET Core authorization (built in) on the server. A .NET port of CASL isn't needed: conditions are a fixed vocabulary of four scopes that translate to EF `Where` clauses.
  - `@casl/ability@7.1.3` on the web (see next item).

### RBAC enforcement end to end (API guards and UI gating) — COMPLETE · L
- **Where:** `src/server/Auth/*`, `Api/AtsEndpointHelpers.cs:15-71`, the `/api` group default `RequireAuthorization(AtsPolicies.Read)` (`Program.cs:134-136`); on the web about 180 role checks in 40 files (`requisition-data.tsx:29-40`, `application-data.tsx:70-71`, `CandidatesList.tsx:161-162`, `InterviewsPage.tsx:176`, `CommandSearch.tsx:137`, `nav.ts:37-56`, ...).
- **Today (audited every endpoint in `endpoints.txt`):**
  - Every `/api` route requires a signed-in active member. Mutations carry a role policy plus `CanManage` or `Load*Managed*` row checks. Reads are row-scoped. CSRF is enforced on the group.
  - Gaps:
    1. `GET /api/organization` (`AdministrationEndpoints.cs:17-51`) uses the `Read` policy and returns `NotificationWebhookUrl`, a Slack/Teams incoming webhook that lets anyone post into the channel, plus approver emails and allowed domains, to any interviewer.
    2. No last-admin or owner guard on `POST /admin/users`.
    3. `AppUser.Department` is never enforced.
    4. The `templates` permission is checked only on the server (`ConfigurationEndpoints.cs:110,150`). The UI shows template editors to anyone, and the save fails.
    5. The web copies `CanManage` incorrectly for Recruiters on confidential jobs and for Hiring managers who are only named viewers. They see Edit and Move, then get 404.
    6. `GET /admin/webhooks` sends every signing secret to the browser, even though they are hidden in the UI.
    7. Webhook test and retry, and notification test, aren't audited.
- **Design critique:** CLAUDE.md says "the UI hides what a role cannot do". Today it hides by guessing.
- **Product critique:** Customers judge an ATS's permissions by whether a hiring manager ever sees an Offer button they can't use. Greenhouse and Ashby never show dead actions.
- **Complete means:**
  - [ ] The server computes CASL-shaped rules for the signed-in user and returns them on `/api/auth/me` as `rules`:
    - `{action:'update', subject:'Job', conditions:{managerEmails: email}}` and similar;
    - built from the same role and scope data the policies use;
    - packed with `packRules`.
  - [ ] Web: `AbilityProvider` next to `AuthProvider` (`auth.tsx`). `useAbility()` and `<Can I="update" this={job}>` replace every `role ===` and `canManage*` helper. Delete `canManageJob`, `canManageRole`, `canPostJobs` and the inline `staff` arrays.
  - [ ] API responses for records carry the fields conditions need (`ownerEmail`, `recruiterEmail`, `viewerEmails`, `isConfidential`). Most already do.
  - [ ] `GET /api/organization` becomes Admin-only, with a small `GET /api/organization/summary` (name, time zone) for everyone if needed. The list endpoint returns secrets masked; a separate audited `POST /admin/webhooks/{id}/secret` reveals one.
  - [ ] An integration test that walks `EndpointDataSource` and fails if any non-`/public` endpoint lacks `RequireAuthorization`. The existing `/api` group policy makes this a guard against future `MapGet` outside the group.
  - [ ] Audit webhook test, retry, secret reveal and notification test.
- **Backend:**
  - `Permissions.RulesFor(user, role)`.
  - `/api/auth/me` adds `rules`.
  - Tighten the two endpoints.
  - One xUnit test using the existing `Microsoft.AspNetCore.Mvc.Testing`.
- **Libraries:**
  - `@casl/ability@7.1.3` and `@casl/react@7.1.0`. They replace about 180 hand-written checks with one ability built from server rules. Conditions are checked against the actual record, which is exactly the `CanManage` logic we keep re-typing. `packRules`/`unpackRules` keep the payload small.
  - Server side stays on built-in ASP.NET Core authorization.

### Single sign-on — COMPLETE · M
- **Where:** `/admin/sso`, `features/preview/SsoPage.tsx`, `sample-admin.ts:29-39`; `AuthenticationServiceCollectionExtensions.cs`, `AuthEndpoints.cs:42-158`.
- **Today:**
  - Sample data:
    - provider radio (Okta / Google Workspace / Entra);
    - "metadata URL" field;
    - "Everyone must use single sign-on" switch, whose text promises "Owners keep a password", but the product has no passwords;
    - fake 700ms "Test connection";
    - stats claiming 48 members.
  - Real sign-in already runs through WorkOS AuthKit (or a single OIDC provider), and WorkOS does enterprise SSO.
  - **Headless crash check:** I loaded `/admin/sso` three times in headless Chrome after sign-in and watched it idle for 4 seconds each time. There were 0 DOM changes and 0 long tasks; the heap stayed at 19-25 MB with 560 nodes. There is no render loop or heavy effect. The crashes in the screenshot runs hit whichever route was 5th or 6th in one browser context (`/admin/invitations`, `/settings/preferences`, `/pipeline`, ...), so they are a harness flake.
- **Design critique:**
  - Stat card labels truncate ("Signing in with…", "Accounts set u…", "Last account u…").
  - "12 minutes ago" wraps to three lines in the 28px number style.
  - The two cards have unequal heights.
  - "Test connection" floats above the banner.
- **Product critique:**
  - Greenhouse, Ashby and Lever all sell SSO with SAML/OIDC and self-serve setup.
  - The fastest credible version is WorkOS's own Admin Portal: the customer's IT admin follows provider-specific steps inside a hosted page, and we never handle metadata XML.
  - Hand-building a SAML form (what the preview implies) is the wrong investment.
- **Complete means:**
  - [ ] Status card: connection state (Not set up / Active / Inactive), provider name, verified domains, "Last sign-in through SSO".
  - [ ] "Set up single sign-on" opens a WorkOS Admin Portal link (intent `sso`) in a new tab. "Verify domain" uses intent `domain_verification`.
  - [ ] "Require single sign-on for @acme.com": the callback rejects any `AuthenticationMethod` other than `SSO` for those domains. Owners are exempt so they can't lock themselves out, and the switch text says so.
  - [ ] "Sign-in methods" section (moved from General): Google, Microsoft, email code. Enforced in the callback (see the Sign-in methods item).
  - [ ] In `Oidc` mode the page shows "Sign-in is handled by {Auth:Authority}" read-only. In `Development` mode it explains it's off.
  - [ ] Delete the fake stats and "Test connection".
- **Backend:**
  - `Organization.WorkOsOrganizationId` (create on first open via `Organizations.CreateOrganizationAsync`) and `RequireSso`.
  - `POST /api/admin/sso/portal-link {intent}` calls `AdminPortal.GenerateLinkAsync`.
  - `GET /api/admin/sso/status` lists connections and domains.
  - Pass `OrganizationId` in `GetAuthorizationUrl` when the email domain matches, so AuthKit routes to the identity provider.
  - Audit setup changes.
- **Libraries:** `WorkOS.net` 6.4.0 (installed; `AdminPortalService`, `OrganizationsService` and `SsoService` are in this version; 6.8.0 is current). It replaces a hand-built SAML stack; the vendor already used for sign-in does the hard part.

### Directory sync (SCIM, automatic account setup) — COMPLETE · L
- **Where:** the SCIM card on `SsoPage.tsx:142-183` (sample base URL and token).
- **Today:** Fake. It shows a sample SCIM URL and token with "Create new access key". There is no SCIM endpoint.
- **Design critique:** It shows an access key in a read-only input with a copy button, all fake. If it were real, the key should be shown once.
- **Product critique:**
  - Mid-market buyers require that people removed in Okta or Entra lose access the same day. Greenhouse and Ashby support this.
  - Building a SCIM 2.0 server ourselves (users, groups, PATCH semantics, filtering) is weeks of work. WorkOS Directory Sync gives normalized users and groups.
- **Complete means:**
  - [ ] "Connect a directory" opens an Admin Portal link with intent `dsync`.
  - [ ] Group-to-role mapping table: "Okta group 'Recruiting' → Recruiter role, teams: Engineering". Unmapped groups are ignored.
  - [ ] Sync rules:
    - directory user added to a mapped group: create the `AppUser`, active, with an optional welcome email;
    - user updated: name and role follow the mapping;
    - user removed or suspended: deactivate.
    - Directory-managed members show a "From Okta" badge, and their role and name are read-only in Members.
  - [ ] Status: last sync time, users synced, errors list.
- **Backend:**
  - `DirectoryGroupRoleMapping` (GroupId, GroupName, RoleId, Departments[]).
  - `AppUser.DirectoryUserId`.
  - `Organization.WorkOsEventsCursor`.
  - A small worker polling `Events.ListEventsAsync` for `dsync.*` every minute. Polling avoids a public webhook endpoint and signature handling.
  - Audit every change with actor "Directory".
  - Depends on SSO (`WorkOsOrganizationId`) and on custom roles for the mapping target.
- **Libraries:** `WorkOS.net` 6.4.0 (installed; `DirectorySyncService`, `EventsService`, `Dsync*` event types are present). It replaces a home-grown SCIM server.

### Sign-in methods switches (Google / Microsoft) — MERGE · S
- **Survivor:** the "Sign-in methods" section on the Single sign-on page, and they get enforced.
- **Where:** `AdminSettings.tsx:386-404`, `OrganizationSetupModal.tsx:73-88`, `Organization.AllowGoogleLogin`/`AllowMicrosoftLogin`.
- **Today:** Saved, never read. The "Keep at least one way to sign in" warning protects against a lockout that can't happen.
- **What moves:**
  - The switches move to SSO.
  - The WorkOS callback checks `authentication.AuthenticationMethod` (`GoogleOAuth`, `MicrosoftOAuth`, `SSO`, `MagicAuth`) against them before provisioning, and redirects to `/login?error=method`.
  - In OIDC mode the section is hidden.
  - Removed from the owner setup modal.
- **Backend:** about 10 lines in `AuthEndpoints.cs:136-148`.
- **Libraries:** `WorkOS.net` (installed).

### General workspace settings — COMPLETE · S
- **Where:** `/admin/general`, `AdminSettings.tsx:330-406`; `PUT /api/organization` (`AdministrationEndpoints.cs:53-141`).
- **Today:**
  - Name, time zone (searchable, from `Intl.supportedValuesOf`), allowed company domains (enforced after setup), and the two dead switches.
  - The PUT needs six fields on every save, so the client resends them (`AdminSettings.tsx:74-83`).
  - The org update audit records only `Name` (line 136). "Updated Organization" ×3 in Activity history says nothing.
- **Design critique:**
  - The card title "Workspace" repeats the breadcrumb.
  - The name field uses an inset label while time zone and domains use labels above, two field styles in one short card.
  - The empty domains box has no placeholder. An empty value means anyone with an invite can sign in, and that isn't said.
- **Product critique:**
  - Greenhouse and Ashby let the admin upload the company logo and brand colour once and reuse them on the careers site, candidate portal and emails.
  - Ours shows the MyThorneAI mark to candidates. This is heavily customer-facing, so it is the most visible gap here.
  - Linear and Notion also show "Workspace owner" and "Transfer ownership".
- **Complete means:**
  - [ ] Fields: workspace name, logo (square PNG or SVG, previewed on a fake email header), brand colour (used as the accent on careers and portal), time zone, company domains (with "Empty means anyone you invite can sign in").
  - [ ] Read-only rows merged from the removed pages: "Candidate portal address" (editable `PublicUrl`) and "Candidate email: ready / not ready".
  - [ ] "Owner: Avery Admin" plus "Transfer ownership" (owner only, pick an active admin, confirm).
  - [ ] Field-level diff in the audit entry.
  - [ ] PUT accepts partial updates (all nullable) so clients send only what changed.
- **Backend:**
  - `Organization.LogoFileId`, `BrandColor`.
  - `POST /api/organization/logo` using the existing `LocalFileStore`.
  - `POST /api/organization/transfer-ownership`.
  - Contract fields nullable.
  - Diff helper (see Activity history).
- **Libraries:** none.

### Activity history (audit log) — COMPLETE · M
- **Where:** `/admin/audit`, `features/admin/AdminAudit.tsx`, `admin-data.ts:8-15`; `Infrastructure/Audit.cs`, `GET /api/admin/audit` (`AdministrationEndpoints.cs:332-344`), `AuditEvent` (`Domain/Operations.cs:30-39`), index `(EntityType, EntityId, OccurredAt)` (`AtsDbContext.cs:344-351`).
- **Today:**
  - 47 call sites write events, with `Details` JSON.
  - The API returns the newest 250 (optionally by type). Search, actor filter and paging happen in the browser over those 250.
  - The UI type drops `details`, so what changed is never shown.
  - No sign-in events, although the empty state promises "Sign-ins, role changes and other important actions appear here" (line 115).
  - No index on `OccurredAt` alone for the default query.
- **Design critique:**
  - Rows read "Updated · Organization `0a2dfbd2-267` · admin@example.test".
  - The record type says "Requisition" although the UI rule is "Jobs".
  - The truncated id chip is meaningless and not clickable.
  - The actor is an email with an initial avatar, never a name.
  - Four identical "Stage changed" rows don't say from or to.
  - The search placeholder truncates ("…record number or per…").
  - On phone only Event and half of Record fit. Done by and Time are off-screen.
- **Product critique:**
  - Greenhouse's change log and Linear's audit log read as sentences with links. They have date ranges and CSV export.
  - Ashby shows field-level before/after.
  - Admins open this page to answer "who changed X and when". Today they can't.
- **Complete means:**
  - [ ] Each row is a sentence: "**Avery Admin** moved **Blake Rivera** from Review to Interview on **Data analyst**", with relative time and exact time on hover. Records link to their page.
  - [ ] Clicking a row opens a drawer with before/after for each changed field and the raw details folded.
  - [ ] Filters done on the server: person (search-select), record type (with plain labels), action, date range, and a record link ("history of this job").
  - [ ] Cursor pagination ("Load more"), no 250 cap.
  - [ ] Export the current filter to spreadsheet (CSV) with the existing `Csv.Escape`.
  - [ ] New events: sign-in, sign-in denied, sign-out, invite sent, access request decided, role created or edited, webhook secret revealed, SSO changed.
  - [ ] On phone, rows become stacked cards.
- **Backend:**
  - `AuditEvent.ActorName`, `EntityLabel` (denormalized at write time so the list needs no joins), `Before`/`After` JSON (or `Changes`).
  - An EF `SaveChangesInterceptor` that fills `Changes` for tracked entities (`Organization`, `AppUser`, `Requisition`, `Offer`, `Role`). That is built into EF Core and saves editing 47 call sites.
  - `GET /api/admin/audit?cursor&from&to&actor&type&action&entityId` and `/export`.
  - Index `(OccurredAt DESC, Id)`.
  - Migration.
- **Libraries:** none. EF Core interceptors are built in. `Audit.EntityFramework.Core@33.0.0` (Audit.NET) was considered and rejected: one interceptor covers it.

### Webhooks — COMPLETE · M
- **Where:** `/admin/webhooks`, `features/admin/AdminWebhooks.tsx`; `ConfigurationEndpoints.cs:42-64,375-489`, `Infrastructure/WebhookWorker.cs`, `SsrfGuard.cs`, `PipelineEvents.cs:32-64`, `WebhookEndpoint`/`WebhookDelivery` (`Domain/Configuration.cs:24-51`).
- **What works end to end:**
  - Add, edit, pause and delete endpoints, with optimistic pause.
  - HMAC-SHA256 `X-ATS-Signature`.
  - Event filter with "empty = everything".
  - Ping test.
  - Last 50 deliveries with status code and error, and "Send again" on failures.
  - Retries with 4× backoff up to 6 attempts.
  - SSRF checks at save time and at connect time (DNS re-check, no redirects). This is solid.
- **Limits:**
  - Only 3 events (`application.created`, `application.stage_changed`, `application.hired`).
  - The signature has no timestamp, so a captured delivery can be replayed.
  - The secret can't be rotated, and the list endpoint returns every secret.
  - The request body and the response body aren't stored or shown.
  - Deliveries go out one at a time globally with a 10-second timeout, so one dead receiver delays everyone's events.
  - An endpoint that fails for days stays on.
  - Test and retry aren't audited.
- **Design critique:**
  - The page description is two sentences and mentions payroll. The empty state repeats it.
  - The developer paragraph about the header sits under the list in muted text, where developers won't find it.
  - "History" is a modal showing only status. You can't see what was sent.
- **Product critique:**
  - Stripe, Svix and Ashby show an event catalog with sample payloads, each delivery's request and response, "Resend", secret rotation, and automatic disabling with an email.
  - Greenhouse webhooks cover about 20 events: candidate, application, offer, job and interview.
  - An integration builder needs payloads to build against. Today they must trigger real hires to see one.
- **Complete means:**
  - [ ] An events catalog of about 12: `candidate.created`, `application.created`, `application.stage_changed`, `application.rejected`, `application.hired`, `interview.scheduled`, `interview.cancelled`, `scorecard.submitted`, `offer.approved`, `offer.sent`, `offer.accepted`, `job.opened`, `job.closed`. Each has a one-line meaning and a sample payload you can expand and copy in the Add modal.
  - [ ] Signing per the Standard Webhooks spec (`webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64 HMAC(id.timestamp.body)>`), keeping `X-ATS-Signature` for existing receivers. Docs block: "Verify with any Standard Webhooks library".
  - [ ] Secret shown once at creation. "Rotate secret" keeps the old secret valid for 24 hours. Reveal is audited.
  - [ ] Delivery drawer: request headers and body, response status, the first 2 KB of the response body, duration, and an attempt timeline. "Send again" and "Send all failed again".
  - [ ] Automatic pause after 3 days of only failures. Email the admins and show a red banner on the endpoint.
  - [ ] Audit test, retry, rotate and reveal.
- **Backend:**
  - `WebhookDelivery.ResponseBody` (truncated), `DurationMs`, `RequestHeaders`.
  - `WebhookEndpoint.PreviousSecret`, `PreviousSecretExpiresAt`, `DisabledReason`, `FailingSince`.
  - `PipelineEvents.PublishAsync` calls from the interview, offer and job endpoints.
  - Worker: claim a batch with `FOR UPDATE SKIP LOCKED` and send up to 4 in parallel, with at most one in flight per endpoint so order holds. Only needed once there are several endpoints.
  - Endpoints `POST /admin/webhooks/{id}/rotate`, `POST /admin/webhooks/{id}/deliveries/retry-failed`.
- **Libraries:** none needed. Standard Webhooks signing is about 10 lines with `HMACSHA256`; `StandardWebhooks@1.1.2` (NuGet) exists if you'd rather import it. The customer-facing win is that receivers can verify with off-the-shelf libraries in any language.

### Profile — COMPLETE · S
- **Where:** `/settings/profile`, `features/preview/ProfilePage.tsx:45-84`.
- **Today:**
  - Read-only card: initials avatar, name, email, role badge, Department "—", Workspace.
  - "Your workspace admin manages these details."
  - The calendar connection a user actually needs lives on the Interviews page (`InterviewsPage.tsx:190-200`).
- **Design critique:**
  - A full page for five read-only facts.
  - "—" breaks the copy rule ("Not set").
  - "Department" contradicts "Team" everywhere else.
  - The Preferences link line duplicates the section nav.
- **Product critique:** Linear and Ashby profiles let you edit your display name and photo, connect your calendar, set an email signature, and see what you can access.
- **Complete means:**
  - [ ] Editable display name (locked with "Managed by Okta" when directory-synced).
  - [ ] Photo from the identity provider (`ProfilePictureUrl`, stored on sign-in). No upload.
  - [ ] "Your access": role name plus the generated "what you can do" sentence from abilities, and teams.
  - [ ] Calendar: connected account, connect or disconnect for Google or Microsoft (reuse the Interviews endpoints `/api/calendar/*`).
  - [ ] Email signature used when sending candidate messages (cross-area: Messages).
- **Backend:**
  - `PUT /api/me { displayName, signature }`.
  - `AppUser.ProfilePictureUrl`, `Signature`.
  - Audit the name change.
- **Libraries:** none.

### Preferences — COMPLETE · S
- **Where:** `/settings/preferences`, `MySettings.tsx:90-197`, `lib/theme.ts`, `AppShell.tsx:70-84`, `DataTable.tsx:136`.
- **Today:**
  - Theme, table density (rewrites every remembered table key), start page (applied once per browser session when landing on `/`), and reset table views (clears `ats-table:*` and `ats-views:*`).
  - Everything is per browser ("We save these in this browser only").
  - The start page list (`MySettings.tsx:27-34`) isn't filtered by role. An interviewer can pick Jobs, Pipeline or Approvals.
  - Reset says it clears saved views, but candidate and report saved views live on the server (`/api/saved-views`) and are untouched.
- **Design critique:** Four cards for four controls, each with a header and a divider. One card with four rows would read faster. Table density's description runs to two lines.
- **Product critique:** Linear and Notion keep preferences with the account, so a new laptop looks the same.
- **Complete means:**
  - [ ] One card, four rows: Theme, Density, Start page, Reset table layout.
  - [ ] Saved to the account and mirrored to `localStorage` so the theme paints before React loads (the existing `themeScript` keeps working).
  - [ ] Start page options from the user's ability.
  - [ ] Reset copy says exactly what it clears. Server saved views get their own "Manage saved views" link (cross-area).
- **Backend:**
  - `AppUser.PreferencesJson`.
  - `GET/PUT /api/me/preferences` (theme, density, startPage, recents, onboardingDismissed).
- **Libraries:** none.

### Notification preferences — COMPLETE · M
- **Where:** `/settings/notifications`, `ProfilePage.tsx:86-123`; real senders in `EmailOutboxWorker.cs:79-223`, `OfferEndpoints.cs`.
- **Today:**
  - Sample switches: New applicants, Interview reminders (1 hour before), Scorecards due, Mentions, Weekly summary.
  - In reality the server sends stuck-application reminders to the recruiter, scorecard reminders to interviewers, and approval-decided emails to requesters. These are controlled only by org-wide settings.
  - Nobody can turn off their own.
  - Mentions and a weekly summary don't exist anywhere in the product. There is no "new applicant" or "1 hour before" email to staff.
- **Design critique:** The amber Preview badge appears both in the section nav and in the title, plus the info banner. That is three warnings for one fact.
- **Product critique:** Greenhouse and Ashby let each person choose email versus in-app per event, plus a daily digest. Interviewers especially want reminders before interviews and fewer emails otherwise.
- **Complete means:**
  - [ ] A table: event by channel (Email · In app) for events that actually fire:
    - Approval waiting on you, Feedback due, Candidate replied, Application stuck (owners), New applicant on my jobs, Interview tomorrow (morning digest), Offer decided.
  - [ ] "Pause email for…" (1 day, 1 week) for vacations.
  - [ ] Drop the Mentions and Weekly summary switches until those features exist. They are promises we can't keep.
  - [ ] Every sender checks the preference before queueing.
- **Backend:**
  - `UserNotificationPreference` (UserId, Kind, Email bool, InApp bool), or one JSON column on `AppUser`.
  - The `Notification` table from the bell item, for the in-app channel.
  - A preference check in the reminder sweeps and in the approval and offer emailers.
  - Two new senders (new applicant, interview digest) using `EmailTemplates`.
- **Libraries:** none.

### Help — COMPLETE · S
- **Where:** `/help`, `features/preview/HelpPage.tsx` (real page that lives in `preview/`), `CommandSearch.tsx` (`ShortcutList`).
- **Today:**
  - 11 hard-coded how-to cards in 5 categories, with search and pill filters, a Thorney card, keyboard shortcuts, and a dev-only Design system link.
  - Not role-aware: an interviewer sees "Post a job", "Approve a job or an offer" and "Build a custom report", which they can't do.
- **Design critique:**
  - Eleven equal cards in a 2-column grid make an 1,980px page where everything has the same weight.
  - The Thorney card says "Click me in the sidebar any time", which duplicates the sidebar.
  - Every card ends with a link even when it's "Back to the dashboard".
- **Product critique:**
  - Ashby, Greenhouse and Linear link to a searchable help centre, show "What's new", and offer "Contact support".
  - We sell this to customers and there is no way to reach a human from inside the product.
- **Complete means:**
  - [ ] Guides filtered by ability (`can(...)` per guide). The interviewer view leads with "Submit a scorecard" and "Connect your calendar".
  - [ ] A compact layout: guides as an accordion list grouped by task, shortcuts beside them.
  - [ ] "Contact support" (mailto or support URL from configuration) and "What's new" (link to a changelog URL from configuration).
  - [ ] Move the file to `features/help/HelpPage.tsx`. It isn't a preview.
  - [ ] Remove the Thorney card. The mascot already lives in the rail.
- **Backend:** two configuration values (`Support:Email`, `Support:ChangelogUrl`) exposed on `/api/auth/me` or a small `/api/app-info`.
- **Libraries:** none.

## Cross-area notes

- **Shared components:**
  - `StatGrid` (`components/ui/card.tsx:169-176`) is 1 column below `sm`. Four stat cards then take four phone screens (Members, SSO). Make it `grid-cols-2` at base.
  - `StatCard` truncates labels (`truncate`, line 136). At 4-up inside a settings column the labels cut. Allow two lines, or never use 4-up inside a section-nav layout.
- **`SettingsSection`** (`features/admin/settings-shared.tsx:58-74`) should render its sticky footer only when `dirty`. Every settings page in other areas (Pipelines, Approvals, AI, Reminders) picks this up.
- **`SectionNav`/`SidebarLayout`** (`components/layout/SectionLayout.tsx`): add max-height and scroll on the sticky aside, use `useId` for the select id, and expose a flag that the shell reads to collapse the app sidebar. Jobs, Reports and Candidates all use it.
- **Email templates live twice:** `/admin/email-templates` (real, `EmailTemplateEditor.tsx`) and `/messages/templates` (Preview). The Messages area should own one template library with a Plate editor; Settings links to it.
- **Saved views live twice:** server `/api/saved-views` (Candidates, Reports) and browser `SavedViews` (`components/data-table/SavedViews.tsx:28`). Unify on the server so views follow the user and Preferences' "Reset" is honest.
- **Calendar connection** sits on the Interviews page. Also surface it in My settings → Profile (same endpoints).
- **Pipeline** top-level nav duplicates the job record's Pipeline tab. Jobs should own a board view.
- **Dashboard "Finish setting up"** shows server tasks to customers ("Add the OpenAI key to the server"). Hide them for hosted workspaces.
- **Job-level access** (owner, recruiter, `ViewerEmails`, confidential) is the real per-job access model and the survivor of Team access. The Jobs area should make the job "Team" tab the obvious place to grant someone access to one job.
- **Notes need @mentions** before a "Mentions" notification can exist (Candidates or Applications area).
- **All feature areas:** replace `user.role` checks with `useAbility()` once RBAC phase 1 lands. That covers 40 files, including `features/requisitions/*`, `features/applications/*`, `features/pipeline/*` and `features/candidates/*`.
- **Copy rules broken in this area:**
  - "—" on Profile.
  - "Requisition" in Activity history.
  - "Department" versus "Team".
  - The two different "Notifications" settings pages.

## Build order

1. **Stop the false promises and broken paths (about 2 days, all S):**
   - Add a `/login` error page and send people back to the page they came from.
   - Enforce or move the Google/Microsoft switches.
   - Make `GET /api/organization` Admin-only and mask secrets in `GET /admin/webhooks`.
   - Add the last-admin and owner guards.
   - Remove the "Members limited to one team" hint until departments are enforced.
   - Make the bell use the full notification list.
   - Global 401 → sign in.
   - Fix the checklist href and query key.
   - Settings registry shared with ⌘K.
   - Sticky nav overflow.
   - Preview badges in the nav.
   - No dependencies.
2. **Shell and settings IA (M):**
   - Settings takes over the rail.
   - The app sidebar auto-collapses beside section navs.
   - One Settings area with the 13-page grouping, redirects and settings search.
   - Pages own their header actions.
   - Radix drawer on phone.
   - Account menu cleanup.
   - Depends on 1 (registry).
3. **Members hub with Invitations and Access requests (M):**
   - Invite emails through `EmailOutbox`.
   - Requests created by the sign-in callback.
   - `LastSignInAt`, bulk PATCH, member drawer.
   - Depends on 1 (`/login` page) and 2 (tabs live in the new Members page).
4. **RBAC phase 1, CASL on the web fed by server rules, plus department scope (L):**
   - `@casl/ability@7.1.3` and `@casl/react@7.1.0`.
   - `rules` on `/api/auth/me`, `AppUser.Departments`.
   - Delete Team access.
   - Endpoint-guard test.
   - Can overlap with 3.
5. **Activity history upgrade (M):**
   - Readable rows and a diff drawer.
   - Server filters, export.
   - Sign-in and invite events.
   - Depends on 3 for the new events.
6. **Single sign-on through WorkOS Admin Portal plus sign-in methods and "require SSO" (M):** depends on 1.
7. **My settings made real (M):**
   - Profile with calendar and name.
   - Preferences on the server.
   - Notification preferences plus the `Notification` table and inbox.
   - Depends on 4 for ability-filtered options.
8. **Onboarding and Help (M):** role-specific first run, cleaned checklist, ability-filtered Help, contact support. Depends on 3 (`LastSignInAt`) and 4.
9. **Webhooks completion (M):** event catalog and samples, Standard Webhooks signing, rotation, delivery drawer, automatic pause. Independent, so it can run in parallel from step 3 on.
10. **Custom roles, RBAC phase 2 (L):** `Role` entity, permission policy provider, role editor. Depends on 4.
11. **Directory sync through WorkOS (L):** group-to-role mapping, events poller. Depends on 6 and 10.
12. **General settings branding (S):** logo, brand colour, transfer ownership. Can ship any time after 2, and the Careers and Portal areas consume it.

## Progress (wave 1)

Finished:

- **Sign-in page and sign-in errors**: a real `/login` route reads `error` (not_invited, domain, pending, declined, deactivated, method, provider, state, session) and shows a plain message with the next step; it keeps `returnUrl` everywhere (callback, OIDC `OnRemoteFailure`, dev accounts, inline sign-in); on the live site it forwards straight to the sign-in service unless there is something to say; sign-out lands on `/login?signedOut=1` with no auto sign-in loop. Callback redirects carry codes, not English. `SignedIn`, `SignInDenied` (with reason) and `SignedOut` are audited; `AppUser.LastSignInAt` is stored on every sign-in.
- **Sign-in methods switches**: enforced in the WorkOS callback against `AuthenticationMethod` (`MethodAllowed`); email code and SSO always work, so the lockout warning is gone. The switches moved out of the owner modal into General → "Who can sign in", hidden in OIDC mode.
- **Session expiry and access-denied handling**: a 401 from any API call sends the person to `/login?error=session&returnUrl=…` once; a 403 on a change says "Your role may have changed" and refreshes the signed-in user.
- **RBAC gaps 1, 2 and 6**: `GET /api/organization` is Admin only; last-admin, owner and self guards in one helper (`AccessChangeProblemAsync`) used by single and bulk updates (409 with a plain message); `GET /admin/webhooks` returns masked secrets.
- **Notification bell (merge)**: the bell shows the Notifications inbox's own items (open count, top 8 grouped by kind, "Mark as done"); the Dashboard nav badge is gone.
- **Onboarding (checklist part)**: checklist links point at the new settings pages and `/jobs/new`, never mention server keys, and hide server tasks when `Hosting:Managed` is set; settings saves invalidate the dashboard's `['admin','setup-checklist']` key. The owner modal asks only for name, time zone (from the browser) and domains as tags.
- **Settings information architecture**: one `/settings` area with one registry (`features/admin/settings-registry.ts`) read by the rail, the settings search, page headers and ⌘K. Groups: Your account · Workspace · People · Hiring · Alerts · Integrations · Security. Portal address and email status are rows in General; Reminders and the Slack/Teams channel share "Reminders and alerts"; posting and email templates are tabs of Templates; AI activity is a tab of AI. Every old `/admin/*` URL answers with a 307 to its new home (`movedSettingsHref`, checked by `settings-registry.check.mjs`). Pages render their own header and actions (`SettingsHeader`); `SettingsSection` shows its save bar only while dirty.
- **Sidebar collapse and section-nav layout**: `/settings/*` replaces the app sidebar with the settings rail ("Back to MyThorneAI", search, grouped pages). Any page using `SidebarLayout` gets the 84 px icon rail by default, picked by CSS `:has([data-section-nav])` so the server render is already right; the choice there is kept in `ats-nav-collapsed-section`. One toggle that stays in place; the section nav aside scrolls; `useId` for its select.
- **Mobile navigation drawer**: Radix dialog (focus trap, Esc, scroll lock) with Post a Job first and the account with Sign out at the bottom; on settings pages it holds the settings rail.
- **Account menu**: Profile, Preferences, Notification settings, Keyboard shortcuts, Help, Sign out; router navigation; no theme block.
- **Primary navigation (part)**: Preview items say "Preview" under their label (and in the settings rail); Thorney opens Help and shrinks with the rail; Help lost its Thorney card.
- **Command palette (shell parts)**: settings entries come from the registry, so every page (and other areas' additions, such as Calendar and hours) is findable. An empty palette starts with the 5 candidates opened last (the candidates area's `rememberCandidate` store), then Actions; people show their title and stage on their current job, jobs show their status.
- **Interviews nav count**: the Interviews item shows how many scorecards you still owe (`GET /api/me/scorecards` `counts.due`), a dot on the icon rail.
- **Members, Invitations, Access requests**: one Members page with tabs Members · Invited · Requests. Invite people (emails, role, team, note) creates members and queues an email through `EmailOutbox`; Invited offers Send again and Withdraw. Uninvited sign-ins at an allowed company domain become an `AccessRequest` (admins get an email; the person can add a note from `/login`); Approve picks role and team and emails them; Decline blocks new requests for 7 days. Members table: Owner and You badges, inline role select, Last signed in, status; all-or-nothing `PATCH /api/admin/users`; a drawer with name, role, team, sign-in and invite facts, recent activity and Remove access; stacked cards on phone. The preview Invitations, Access requests and Team access pages and their sample data are deleted; "Members limited to one team" is gone and the team field says it does not limit access yet.
- **Activity history**: rows read as sentences with links ("Avery Admin moved Blake Rivera from Review to Interview on Data analyst"), names instead of emails, plain record types; a drawer with before and after for every changed field (filled by an EF `SaveChangesInterceptor` from tracked entities, no call-site edits) and the details folded; server filters (person, record type, action, date range, one record), cursor paging with "Show older activity", spreadsheet (CSV) export of the current filter; index on `(OccurredAt, Id)`.
- **Webhooks**: a catalog of 14 events with plain descriptions and copyable examples in the Add dialog (`candidate.created`, `application.created|stage_changed|rejected|hired`, `interview.scheduled|cancelled`, `scorecard.submitted`, `offer.approved|sent|accepted|declined`, `job.opened|closed`); the new ones are raised from tracked changes by the same interceptor, so no endpoint can forget one. Standard Webhooks signing (`webhook-id`, `webhook-timestamp`, `webhook-signature`) beside the old `X-ATS-Signature`; secret shown once at creation, "Show signing secret" audited, "Replace signing secret" keeps the old one signing for 24 hours; a History drawer with each message's headers, body, the first 2 KB of the answer, duration and an attempt timeline, plus "Send again" and "Send all failed again"; automatic pause after 3 days of only failures with an email to admins and a red banner; test, retry, rotate and reveal are audited.
- **General workspace settings (part)**: partial `PUT /api/organization` (only sent fields change), field-level diff in the audit entry, Owner row and "Transfer ownership" (owner only, to an active admin).

Not done (and why):

- Nav built from abilities, ability-filtered actions, Help and start page: need RBAC phase 1 (wave 2, step 4).
- Inbox nav item and server-stored done state: needs the Notification table (wave 2).
- Recent records in the nav and ⌘K, Preferences on the server, Profile editing: need `PreferencesJson` (step 7).
- Single sign-on through the WorkOS Admin Portal (step 6), directory sync (step 11), custom roles (step 10): not started.
- Logo and brand colour (step 12): not started.
- Webhook worker parallelism (batch claim, one in flight per endpoint): skipped until several endpoints share one install.
- The `member-invited` email text lives in code; move it into the template store when it lands.
- Removed the unused `POST /api/candidates/import` (the candidates area's `/api/candidates/imports` replaces it; its old test is covered by `CandidateRecordTests`).

## Progress (wave 2)

Finished:

- **RBAC enforcement end to end (phase 1)**: the server computes each person's rules once (`Auth/Abilities.cs`, `Abilities.RulesFor`) from their role, the role extras, their teams and their place on each job's hiring team, and sends them as CASL rules in `rules` on `/api/auth/me`. Job rules match `members` (`$elemMatch` on email and role) and, for list rows without members, the owner, recruiter and viewer mirrors. The web app reads them through `src/web/src/lib/ability` (`AbilityProvider` inside `AuthProvider`, `useAbility`, `<Can>`, `asJob`, `abilityFor` for server components, `describeAbility`). The shell nav, the Post a Job button (header and phone drawer), ⌘K actions and pages, the settings rail and its admin gate, `/settings` home, the start page and Help all read abilities; `canPostJobs` and `isAdmin` are gone. Checks: `tests/server/AbilitiesTests.cs`, `src/web/src/lib/ability/rules.check.mjs`.
- **Hiring team as the source of job access**: `ScopeRequisitions`, `ScopeApplications` and `CanManage` (`Api/AtsEndpointHelpers.cs`) read `RequisitionMember`: anyone on the team sees the job, its hiring managers and recruiters change it, so a second recruiter or hiring manager manages the job. Members and their users load with every job (`RequisitionAccessConfiguration`, EF auto-include), so all ~70 `CanManage` callers see the whole team. The per-job settings `viewerEmails` now become Viewer members (people already on the team keep their role) and the mirrors are recomputed. Test: `A_second_recruiter_on_the_team_manages_the_job_and_a_viewer_only_sees_it`.
- **Team access matrix and the member "Team" field (merge)**: `AppUser.Departments` (teams, picked from job departments through `GET /api/admin/departments`) replaces the free-text `Department`. A recruiter with teams sees only open jobs in them plus jobs they are on; a hiring manager with teams also sees the open jobs there but still only changes their own; enforced in the scope helpers and `CanManage` from session claims (`ats_department`, refreshed when an admin changes them). Members, Invite people and Approve request use one "Teams" field that says what it does for the role picked; the Members table says "Their own jobs", "Their interviews" or "All teams" when empty. Test: `Teams_limit_recruiters_and_widen_what_hiring_managers_see`.
- **Endpoint guard**: `Every_endpoint_has_an_authorization_rule` walks `EndpointDataSource` and fails on any route without an authorization rule unless it is on the explicit public list (candidate `/public`, sign-in, health, docs, the inbox hub, development sign-in); it also fails on any `/api/admin/*` route without the admin policy.
- **Single sign-on**: `/settings/sso` is real. Identity provider card (Not set up, Not finished, Active; provider; last sign-in through SSO from the activity history), "Set up single sign-on" and "Verify a domain" open WorkOS's Admin Portal in a new tab (`POST /api/admin/sso/portal-link`, creates the WorkOS organization on first use), company domains with Verified or Waiting for proof, and Sign-in methods on the same page (email code and SSO always on, Google and Microsoft switches, and "Require single sign-on for @domain" once a connection is active and a domain verified). The WorkOS callback refuses other methods at a verified domain with `/login?error=sso`; the owner is always exempt. OIDC mode shows who handles sign-in; development mode says SSO is off. General keeps only company domains. The sample SSO page and its data are deleted.
- **Profile**: `/settings/profile` (moved out of `preview/`): edit your name and picture colour (`PUT /api/me`, audited), "Your access" with role, which jobs you see and a plain list of what you can do (from your rules), and time zone plus calendar status linking to Calendar and hours.
- **Preferences**: one card with Theme, Table density, Dates (browser, Nov 13 2026, 13 Nov 2026, 2026-11-13), Start page (only pages you may open) and Reset table layout, saved to the account (`AppUser.PreferencesJson`, `PUT /api/me/preferences`, sent back on `/api/auth/me`) with the browser copy as a cache, so the theme still paints before load. ⌘K's dark mode action saves too. Date order applies through `formatDate`/`formatDateTime`.
- **Onboarding (first run)**: an invited person's first sign-in sets `welcome`; the shell shows a welcome dialog with what they can do and three next steps for what they can do (admin, recruiter, hiring manager, interviewer; the interviewer step counts scorecards owed). Closing it saves `welcome: false`. Development test accounts skip it, so screenshots open straight on the page.
- **Help**: `features/help/HelpPage.tsx`; how-tos as an accordion grouped by task and filtered by abilities (interview guides lead for people without jobs, including a new "Connect your calendar"), `?guide=` opens one, Contact support by email (`Support:Email`) and What's new (`Support:ChangelogUrl`) when configured, shortcuts beside.
- **Roles**: each role's page lists what it can always do, generated from the same rules people get.
- **Hand-overs from the template store and notifications**: invitation and approval emails use the editable `member-invited` template (`EmailTemplates.QueueAsync`); access requests and webhook auto-pause notify admins through `Notify.AddAsync` with a new `workspace-alert` kind (in-app and email by default); the unused preview notification page is deleted; the inbox scope `ManageableThreads` reads members like `CanManage`.
- **Webhooks**: `assessment.completed` is in the event catalog with a description and an example (raised by the assessments area).
- **Workspace logo**: no new brand fields. `/api/auth/me` sends `workspaceIconUrl` from the careers site's square icon; the settings rail shows it beside the workspace name and the sign-in page uses it instead of our mark. `/admin/portal` now redirects to `/settings/careers`.

Not done (and why):

- Custom roles (step 10): a role editor is only honest if every permission is enforced on the server, which means per-permission checks in other areas' endpoints. Do it after the coordinator's sweep below moves the web to `can(...)`.
- Sweep of other areas' role checks: listed in the wave-2 report for the coordinator, not edited here.
- Directory sync (step 11): depends on custom roles for its group-to-role mapping.
- Job list rows (`GET /api/requisitions`) carry no `members` or `isConfidential`, so `asJob(row)` falls back to the owner and recruiter mirrors there; the jobs area should add both.

## Progress (wave 3)

### Permission sweep

Part 1 (candidates, talent, applicants, assessments, jobs, pipeline, dashboard, approvals, interview library, sources, careers settings, candidate portal staff card, interviews, workflows, scheduling, calendar, workspace route files). Every permission decision there now reads the server's rules through `useAbility()` or `abilityFor(user.rules)`; none compares `user.role` or reads `user.permissions`.

Finished:

- **Helpers removed**: `canManageJob` and `useCanManage` (`requisition-data.tsx`) are gone. Job tabs, the job list, the pipeline and the job header use `can('update', asJob(job))`. Job list rows now carry `members` and `isConfidential`, so a hiring manager who is only a viewer on a job no longer sees Edit posting, Duplicate, Change status or bulk selection for it.
- **Mapping used** (server policy, then the check):
  - Admin only: `delete Candidate` (delete candidate), `delete Note` (delete someone else's note), `manage Workspace` (setup checklist, "All changes" link to the activity history).
  - Admins and recruiters (`ManageCandidates`, `IsHiringStaff`): `create Candidate` (Add candidate), `import Candidate` (Import), `update Candidate` (edit, tags, pools, do not contact, upload files, document requests, AI ranking and "Find candidates", suggested candidates, "Not in a job").
  - The hiring team (`ManageHiring`, Admin, Recruiter, HM): `create Application` (Add to a job, saved views, tag and source filters), `schedule Interview` (Schedule interview, the scheduler), `create Job` (Post a job, empty pipeline page), `send`/`read Message` (Email, the Emails filter), `update Note` (pin, private notes).
  - Per job (`CanManage`): `update asJob(job)` for moving, rejecting, emailing from the board, rescheduling and cancelling from the calendar, job settings, kit templates.
  - "Works on jobs" (team dashboard instead of the interviewer home): `read Job`, as the nav does.
- **New rule**: `update Note` for recruiters and hiring managers (`Abilities.cs`, `Note` added to the web `SubjectName`). It matches `CanSeeContact` and the pin endpoints. Test: `Interviewers_see_their_interviews_and_extras_follow_the_role_settings` asserts interviewers have no note rule, hiring managers have `update Note` and recruiters no `delete Note`.
- **Hidden, not disabled, and not refused**: found by signing in as admin, recruiter, two hiring managers and an interviewer and opening each page (`SCRATCH/shots/perm-probe.mjs` lists every 4xx API call and every button and menu item). Fixed:
  - Job overview: suggested candidates (403 for hiring managers) and "Find candidates" (ranking is recruiters' only) now show only to people who keep candidate records.
  - Candidates list: reject from a job, bulk move and reject, and "Find more people" check the job itself; reject dialogs mount only for the hiring team (the reasons list was a 403 for interviewers).
  - Candidate compare: the job side-by-side loads only for people who see that job (403 for interviewers).
  - Pipeline: bulk assessment and reject dialogs mount only for managers (assessments and reasons were 403 for viewers and interviewers); "Send email" on a card needs the job (the messages API refuses otherwise); cards are no longer marked `aria-disabled` when dragging is off, so their menu reads as usable.
  - Interview kits tab: templates load only for people who add kits (403 for interviewers).
  - Job settings by typed address redirects to the overview for people who can't change the job (the form's saves were refused).
  - `/assessments/*` redirects home without `read Assessment`; `/interviews/schedule` redirects to Interviews without `schedule Interview`.
  - Document requests on an application need `update Candidate` too (hiring managers saw "Request documents" and got 403).
  - Dashboard: "Finish setting up" and "Candidate sources" leave the grid and Customize for people who can't see them.
  - Interviews calendar: Reschedule and Cancel in an event's popover only on jobs you manage.
- **Walkthroughs** (candidates list and profile, a job's tabs, pipeline, assessments, dashboard, interviews calendar, an interview and its feedback, the scheduler): admin, recruiter, hiring manager (own jobs, and as a viewer on Platform engineer, added for the test and removed after) and interviewer. After the fixes no page calls an API that refuses it, and nothing they may do is hidden.
- **Hand-over**: the candidate activity feed shows "See the run" on workflow steps (`data.runHref`, admins only) with the workflow icon.
- Checks: `lib/ability/rules.check.mjs` covers job list rows with members, hiring manager versus interviewer versus admin for candidates, notes and jobs. Typecheck clean. `AbilitiesTests` 4 of 4 pass.

Left for part 2 (other files):

- Role checks still in owned-elsewhere files: `features/messages/inbox-data.ts:188` and `InboxPage.tsx:120`, `features/applications/application-data.tsx:88` (`canManageRole`) and `ApplicationMessages.tsx:18`. `ProfilePage.tsx:140` describes access by role (wording, not a gate). No file reads `user.permissions` any more, so part 2 can drop it from `/api/auth/me` and `User` once those four are swept.
- Assessment invite rows (`GET /assessments/{id}/invites`) carry no per-row `canManage`, so Remind, Revoke, Extend and Retake show on invites for jobs a hiring manager only views. The assessments endpoints should add it (as `GET /applications/{id}/assessments` already does).
- Pipeline cards still carry dnd-kit's `aria-roledescription="draggable"` when dragging is off (cosmetic for screen readers).
- Personalization by role is unchanged on purpose: dashboard default tab and layout keys, `widget-layout.ts`, `JobSections` `rolesFor` (about other people's accounts), the creator's default team role in `CreateRequisitionPage`, the approver picker in `approval-data.ts`, and `workflows/catalog.tsx` (both list other people by role).

## Progress (wave 4)

Finished:

- **Permission sweep, part 2**: the last four role checks read the server's rules. The inbox (`useHasInbox`) needs `read Message`; the unmatched-email folder needs `create Candidate` (unknown senders become candidates, and the API keeps that folder for people with the candidates capability); the application's Messages tab uses the server's per-application `canManage` (the same `CanManage` the thread endpoint applies, and what `can('update', asJob(job))` mirrors; the application payload carries no hiring team to build `asJob` from). `canManageRole` is deleted. `permissions` is gone from `/api/auth/me` and the web `User` type; `/me` adds `roleName`, and the shell, Profile and the account menu show it. Profile's "Jobs you see" reads the rules (`changesEveryOpenJob`), not the role. A final grep finds `user.role` only in personal defaults (dashboard layout and default tab, the creator's default team role, the development accounts list).
- **Walkthrough** (`SCRATCH/shots/walk-w4.mjs`, admin, recruiter, hiring manager, interviewer, plus a member on a custom "Coordinator" role) on Messages, the unmatched folder and an application's Overview, Messages, Offer, Feedback and Activity tabs, plus Candidates, Jobs, Pipeline, Reports, Assessments and Profile for the custom role. Fixed what it found: interviewers reached `/messages` by typed address and the page called `/api/inbox` (403), so `/messages` now redirects home without `read Message` and `/messages/unmatched` back to the inbox without `create Candidate` (route files, same pattern as Assessments); the application page asked interviewers for rejection reasons (403), document requests (404) and the offer (404), so `useRejectionReasons` waits for `read Job`, `useOffer` for a new `read Offer` rule (people who work on jobs: their jobs' offers and the ones they approve), and the document requests card renders only for people who change the job. After the fixes no page in the walk calls an API that refuses it.
- **Custom roles (build order step 10)**. Seven capabilities, each one something the API already told apart and each enforced on the server:
  - Manage the workspace (`workspace`): the Admin policy and every `IsInRole("Admin")` check; includes everything.
  - Jobs they are on (`jobs`): the ManageHiring policy.
  - Every open job (`all_jobs`, needs `jobs`): the recruiter scope in `ScopeRequisitions`, `ScopeApplications`, `CanManage` and the inbox scope.
  - Add and edit candidates (`candidates`, needs `jobs`): the ManageCandidates policy and `IsHiringStaff` (all candidates, kits library, assessments).
  - Import candidates (`import`, needs `candidates`), See reports (`reports`), Edit shared templates (`templates`, needs `jobs`): the checks that already read the old switches.
  The four built-in roles are fixed sets in `Auth/Permissions.cs` (`BuiltIn`); custom roles are `CustomRole` rows. Sessions carry the capabilities as `ats_permission` claims plus role claims that each mean one capability (Admin = workspace, Recruiter = every open job, HiringManager = works on jobs, Interviewer = neither), so the roughly 60 `IsInRole` checks in other areas follow a custom role without edits. Policies require the capability claim; `Abilities.RulesFor` takes capabilities; `Permissions.HasAsync` reads the claim. `AppUser.Role` keeps the built-in role a custom one behaves like (`Permissions.KindOf`), updated when the role changes, so queries such as "every admin" and personal defaults stay right. Changes reach open sessions on the next request (`ValidateSessionAsync` compares the claims).
  - API: `GET/POST /api/admin/roles`, `PUT/DELETE /api/admin/roles/{id}` (delete takes `?moveTo=` for the people on it). Names are unique, built-in names included. Members, Invite people and Approve request take a role key (a built-in name or a custom role id); member rows return `roleKey` and `roleName`. Edits and deletes go through `AccessChangeProblemAsync`: nobody takes "manage the workspace" from their own role or the owner's, and at least one admin remains. Role changes are audited by name (`{"Role":{"from":"Recruiter","to":"Coordinator"}}`, through a new `changes` argument on `Audit.Add` that the interceptor merges with the other changed fields); role edits are audited with a before and after, and activity rows link to the role.
  - The old per-role switches (`Organization.RolePermissionsJson`) are read once at startup (`CarryOverRoleSwitchesAsync`): a role whose switches differed from today's defaults becomes "Recruiter (your settings)" (and so on) for the people who had it, so nobody gains or loses access; the column is then cleared. `/api/admin/role-permissions` is gone.
  - Web: `/settings/roles` lists Built-in roles and Your roles, each with a one-line summary, member count and Duplicate; "New role" (name, start from, description). A built-in role's page lists every capability with a tick or a dash and offers Duplicate. A custom role's page edits the name, description and capabilities in one card: a Workspace switch, a Jobs radio (only interviews they are on, jobs they are on, every open job), Candidates (with Import underneath once on), Reports and Templates, each in plain words with what it allows; things that need something missing are hidden, not disabled. The workspace switch is locked with the reason while you or the owner have the role. Delete asks for the new role of the people on it. People with the role sit in the rail. The Members role select, filter and bulk "Change role", the member drawer, Invite people and Approve request list the custom roles (grouped once there are some); the Teams field follows the role's capability. Help has "Make a role of your own" for admins.
- **Hand-over**: posting templates refuse to save while a picture has no description (`imageProblem`), as the server does.

Checks:

- `tests/server/ApiFlow/RolesTests.cs`: `Each_capability_of_a_custom_role_is_enforced_by_the_api` turns each capability on and off on one role and calls an endpoint only it opens (admin users, inbox counts, a job the person isn't on, talent pools, import, reports, shared templates), then checks `/me` has `roleName`, rules and no `permissions`; `Custom_roles_are_assigned_and_cannot_lock_the_workspace_out` covers unique names, an admin-capable custom role, the owner and self guards on edit and delete, assignment giving and taking access, and delete with `moveTo`.
- `Every_endpoint_has_an_authorization_rule` now also fails on any policy that isn't one of the capability policies, and checks each policy against principals built from custom capabilities.
- `AbilitiesTests` has a custom-capability case (rules, `Normalize`, role claims, `KindOf` for every built-in role). `Admins_can_change_what_each_role_may_do` uses a custom role. Two stale assertions fixed (`update Note` has no conditions; the role change is named).
- Results: `AbilitiesTests` 5 of 5; 27 access-related API tests (access rules, candidate access, hiring scope, messages, reports, platform, roles, authentication, confidential jobs) pass. Web: typecheck clean; `role-permissions.check.mjs` (new), `rules.check.mjs`, `settings-registry.check.mjs`, `audit-text.check.mjs` pass. Roles pages checked at 1440 and 390, light and dark; the full flow (duplicate Recruiter, narrow it, save, give it to a member, delete it moving them back) driven in headless Chrome (`SCRATCH/shots/roles-flow-w4.mjs`).

Not done (and why):

- **Directory sync (step 11)**: not built. The sync itself could be tested against a fake event source, but its setup (the WorkOS Admin Portal link, the directory's group list for the mapping table) only exists in WorkOS mode, and a sync that deactivates people should not ship unexercised. Design, ready to build once a WorkOS sandbox (not the production environment) is available for a manual run:
  - Data: `DirectoryGroupRoleMapping` (Id, DirectoryGroupId, GroupName, RoleKey, Departments text[]), `AppUser.DirectoryUserId` (unique, null for people added by hand), `Organization.WorkOsEventsCursor` and `DirectorySyncedAt`, `DirectorySyncError`.
  - `IDirectoryEvents` with one method, `ListAsync(after, ct)` returning normalized events (user created, updated, deleted, added to group, removed from group, with email, name, state and group ids). `WorkOsDirectoryEvents` wraps `EventsService` (`dsync.user.*`, `dsync.group.user_added|removed`) and is registered only in WorkOS mode, like the SSO endpoints; tests register a fake. Nothing in tests can reach WorkOS because the WorkOS client is never registered outside WorkOS mode.
  - `DirectorySyncWorker` (every minute, skipped unless WorkOS mode and a directory is connected): read events after the cursor; for each directory user compute the target from their groups (the first mapped group by a fixed order wins; unmapped groups ignored); create the `AppUser` if missing and active (optional welcome email through `member-invited`); update name and role through `AccessChangeProblemAsync` so a sync can never remove the last admin or the owner; deactivate on `dsync.user.deleted`, suspended state, or removal from every mapped group; save the cursor in the same transaction; audit each change with the actor "Directory".
  - API: `POST /api/admin/sso/portal-link {intent:"dsync"}` (already generic), `GET /api/admin/directory` (connection state, last sync, users synced, last error), `GET/PUT /api/admin/directory/mappings` (groups from `DirectorySyncService.ListGroups`).
  - Web: a "Directory" card on Single sign-on (Connect a directory, status, mapping table of group to role and teams), a "From Okta" badge on directory members in Members with role and name read-only there.
  - Tests: the worker against the fake source (create, map, re-map, suspend, remove from group, last-admin refusal, cursor kept on failure).
- Assessments and interview kits share the candidates capability. A separate "Build interview kits and assessments" capability needs the assessment endpoints to check it; that folder was being changed by the cleanup builder this wave, so it waits.
- The "who can see this candidate" list for note mentions (`CandidateNotesEndpoints`) still treats the built-in kind Recruiter as "sees every candidate"; for a custom role with every open job but no candidates capability it over-reports. Informational only; the candidates area can switch it to `Permissions.MembersWithAsync`.
- `/messages` once showed a hydration warning in the headless walk (admin and the custom role); it did not reproduce in three more runs. Worth a look by the communication area.

Edits outside my files (small): `Features/Reports/ReportDigest.cs` (report readers come from `Permissions.MembersWithAsync`), `Program.cs` (one startup line), `Features/Administration/ConfigurationEndpoints.cs` (old endpoints removed; mine), `src/web/src/features/applications/offer-data.ts` and `features/rejection-reasons/rejection-reasons-data.ts` (queries wait for the ability), `features/applications/ApplicationRecord.tsx` (document requests card for people who change the job), `app/(workspace)/messages/layout.tsx` (new) and `messages/[folder]/page.tsx` (redirects), `features/messages/inbox-data.ts` and `InboxPage.tsx` and `features/applications/*Messages*`/`application-data.tsx` (the assigned sweep sites), `tests/server/ApiFlow/ProductCompletionTests.cs` (the old role-switch test now uses a custom role).
