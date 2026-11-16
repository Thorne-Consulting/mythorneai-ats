# Messages, email, templates and notifications

## Overall
- **Two of everything, and the sidebar points at the fake one.** "Messages" in the nav (`components/layout/nav.ts:48`, `preview: true`) opens a Preview inbox running on localStorage sample data (`features/preview/messages/*`, `sample-messages.ts`). Real candidate conversations exist only inside each application's Messages tab and in a dashboard list capped at 6 (`Features/Dashboard/DashboardEndpoints.cs:92-95`, `.Take(6)`). Templates are split the same way: Preview "saved replies" (`{{first_name}}`, localStorage) and real automatic emails in Settings (`{{firstName}}`, Postgres). Today no real screen answers "who wrote to us today?".
- **Cramped panes at 1440.** The Preview inbox puts five columns side by side: the app sidebar (234px), the folder nav (208px, `MessagesShell.tsx:156`), the list, the thread and a 256px candidate rail (`Thread.tsx:191`). The thread pane opens at 680px (`MessagesPage.tsx:131`). That leaves the list about 204px, but it is forced to 260px (`MessagesPage.tsx:135`), so the thread card overlaps the list and clips its timestamps ("9:42 A"). The page header and Preview alert take about 150px, so the thread is about 430px tall at 900px. Settings › Email templates stacks three navs: the app sidebar, the settings nav and the template list. The editor gets about 610px, and the preview only sits beside it at `2xl` (`EmailTemplateEditor.tsx:183`), so at 1440 you edit blind and scroll to check.
- **Everything is a plain textarea.** Messages are 2,000 characters of plain text. Templates show raw `{{camelCase}}` tokens as monospace chips, which breaks the plain-English rule. The real composer shows disabled "Attach a file (not available yet)" and "Formatting (not available yet)" buttons (`ApplicationMessages.tsx:146-164`), the kind of dead end `src/web/CLAUDE.md` says to hide.
- **Email is one-way and nothing is live.** The candidate's copy of a staff message says "You can reply from your candidate portal" but has no link and no Reply-To. Every message also gets the same fresh subject line (`ApplicationMessagesEndpoints.cs:34-35`). A candidate who presses Reply in Gmail writes to the sending address, and that reply is lost. Threads only refresh when the window regains focus. No SignalR, SSE or polling exists for messages or notifications.
- **Notifications are calculated lists, not events.** The bell counts approvals only (`AppShell.tsx:194-250`). /notifications mixes four kinds, each capped at 6, and keeps its "done" list in localStorage. /settings/notifications is a Preview with five switches, and four of them control things the server never does: mentions, a weekly summary, new-applicant email and a one-hour interview reminder.
- **Phone.** An open thread sits under about 330px of header, Preview alert, New message button and a native `<select>` of folders. The composer and Send button fall below the fold, and the page scrolls twice (inner list plus page). The Notifications and Templates tables scroll sideways, which pushes Reply/Open and the done tick off screen.

**Target experience.** One team inbox at `/messages`, full height under a slim header, with three panes: a 340px conversation list, the thread, and a collapsible context rail. Each conversation is one application thread. The candidate sees the same thread in their portal and gets each message by email. Replies sent by email come back into the thread through Resend inbound, and staff see them live over SignalR. The composer is the same Plate editor used for templates: formatting, detail chips, emoji, files, templates, AI draft and scheduled send, plus Sent, Delivered and Seen states. Assignment, snooze and full-text search make it a shared inbox rather than a list. One template library covers saved replies and automatic emails, with versions, a real-candidate preview and a test send. The bell opens a real notification feed with per-person settings for each event and each channel.

## Features

### Messages inbox (`/messages`)  — COMPLETE · L
- Where: `app/(workspace)/messages/{layout,page,[folder]/page}.tsx`, `features/preview/MessagesPage.tsx`, `features/preview/messages/MessagesShell.tsx`, `features/preview/sample-messages.ts`, `components/messages/Chat.tsx`. No backend: there is no inbox endpoint. The data that exists is `ApplicationMessage` (`Domain/Communication.cs:15-25`), which the client only receives embedded in `GET /api/applications/{id}` (`ApplicationEndpoints.cs:364-372`).
- Today: entirely fake. Conversations, sends, stars and drafts live in localStorage (`ats-preview:conversations:v2`, `MessagesShell.tsx:89-92`). Every action toasts "This is a preview, so nothing was sent." The UI is the better of the two inboxes: split view, folders, j/k/r/e shortcuts, a closable rail, scheduled-send chips and template insert.
- Design critique: With no conversation open, the list stretches to about 900px and the right two thirds are empty (desktop screenshot). Front and Superhuman open the first conversation or show a reading pane. With a conversation open, the thread overlaps the list at 1440 (see Overall), and the shortcut legend wraps "to archive" onto a second line. "Inbox" appears three times: page title area, folder nav and card heading. Inbox and Unread both show the badge "4", which says the same thing twice. On phone the folder nav turns into a raw native `<select>`. The list card is a fixed `h-[calc(100dvh-17rem)]` box (`MessagesPage.tsx:76`), so the list scrolls inside a page that also scrolls.
- Product critique: A recruiter can only reach a real candidate reply by opening applications one by one. Front, Intercom and Gem give a shared inbox across every conversation, with assignment, unread state per teammate and filters by job. Greenhouse at least has a candidate email feed plus a "Candidates who replied" filter. We have neither for real data.
- Complete means:
  - [ ] `/messages` lists real threads, one per application the viewer can manage (same `CanManage` rule as today). Each row shows candidate, job chip, stage badge, last message preview with a channel icon (portal or email), time, an unread dot for me, assignee avatar, a paperclip when files are attached and a clock when snoozed.
  - [ ] Layout: delete the page description and Preview alert. Fold the folder nav into a 56px icon rail, or into tabs at the top of the list. List 340px | thread flex | rail 300px, with the rail closed by default under 1600px. Full height `calc(100dvh - header)` and no page scroll.
  - [ ] The first conversation in the folder opens automatically on desktop. An empty folder shows the empty state in the reading pane, not a stretched list.
  - [ ] Phone: the list is full screen. The thread is a full-screen route (`/messages/t/[applicationId]`) with a sticky header, a back arrow and a composer pinned to the bottom with safe-area padding. Folders sit in a sheet behind the list header.
  - [ ] Filters on the list: job, stage, assignee, channel and "has files", using `FilterSelect`, with the choice saved per user.
  - [ ] Deep links: `/messages?thread=<applicationId>`, used by notifications, the dashboard and emails to the team.
  - [ ] Infinite scroll with a cursor (no "page 1 of 9").
  - [ ] Delete `sample-messages.ts`, `MessagesShell` local storage, `PreviewTitle` and `PreviewAlert`, and drop `preview: true` from `nav.ts:48`. Add an unread count badge to the Messages nav item.
- Backend: `GET /api/inbox?folder=&q=&jobId=&assignee=&cursor=` returns one row per application with messages, ordered by last message. New `MessageThreadState { UserEmail, ApplicationId, LastReadAt, Starred }` for per-person unread and star (today `ApplicationMessage.ReadAt` is one shared column, so one recruiter opening a thread marks it read for the whole team, `ApplicationMessages.tsx:52-55`). Add to `Application`: `ThreadToken` (random, for reply-by-email), `AssigneeEmail`, `SnoozedUntil`, `ThreadDoneAt`. Move messages out of the application detail payload into `GET /api/applications/{id}/messages?before=` with paging. Add an index on `ApplicationMessages(ApplicationId, CreatedAt)`.
- Libraries: none new. TanStack Query `useInfiniteQuery` (installed) for the list.

### Application Messages tab (`/applications/[id]/messages`)  — MERGE · S
- Where: `features/applications/ApplicationMessages.tsx`, `ApplicationShell.tsx:171-172`, `Features/Applications/ApplicationMessagesEndpoints.cs`.
- Today: the only real staff-to-candidate thread. Sending saves an `ApplicationMessage` and queues a plain-text email. Opening the tab marks the candidate's messages read. It refreshes on focus only. Each bubble's time line shows the author as a raw email address (`ApplicationMessages.tsx:112`). Empty state: "No messages yet / Write the first one below."
- Design critique: The card is short (665px tall at 1440) beside a 340px rail that repeats the email, phone and source already in the record header, so the thread never gets room. "They get this by email." floats above the box as a stray line. A 0/2000 counter sits next to two disabled icons. Send is grey until you type, which is fine, but nothing on the screen says the candidate can also reply in the portal.
- Product critique: This tab and the inbox should be one component, so that a reply sent from either place looks and behaves the same.
- Merge: the survivor is the shared `Thread` + `Composer` built for `/messages` (move them to `components/messages/`). This tab renders `<Thread applicationId={id} />` at full card height, with the rail hidden because the record page already has one. Delete `ApplicationMessages.tsx`. The tab keeps its unread count.
- Backend: same endpoints as the inbox thread.
- Libraries: none.

### Folders (Inbox, Unread, Starred, Sent, Archived)  — COMPLETE · S
- Where: `MessagesShell.tsx:26-36`, `MessagesPage.tsx:12-18`, `app/(workspace)/messages/[folder]/page.tsx`.
- Today: client-side filters over sample data. "Sent" really means "the last message is ours" (`MessagesShell.tsx:34`), and its empty text even says "waiting for the candidate to reply", so the label is wrong.
- Design critique: The Inbox badge counts unread, not total, which makes it identical to Unread. Icons and labels are fine.
- Product critique: Front and Superhuman folders are about who must act: Assigned to me, Unassigned, Snoozed, Scheduled, Done. Ours are about mail mechanics.
- Complete means:
  - [ ] Folders: Inbox (open, not snoozed), Assigned to me, Unassigned, Awaiting reply (renamed from Sent), Scheduled, Snoozed, Starred, Done (renamed from Archived).
  - [ ] Badges only on Inbox (unread for me) and Assigned to me.
  - [ ] The folder lives in the URL (`/messages/[folder]`, as today) and is kept for "back" on phone.
- Backend: `folder` parameter on `GET /api/inbox`, filtering on `AssigneeEmail`, `SnoozedUntil`, `ThreadDoneAt`, `MessageThreadState.Starred` and last-message direction.
- Libraries: none.

### Conversation search  — COMPLETE · M
- Where: `MessagesPage.tsx:27-32`.
- Today: substring match over the sample name, role and last message only. Older messages, files and other jobs are never searched.
- Design critique: The search box sits inside the list card under a repeated "Inbox" heading, costing 90px. It should sit in the list header row.
- Product critique: Superhuman and Front search every message body, sender and attachment name, with operators. Recruiters search for "start date" or "visa" across everyone.
- Complete means:
  - [ ] One search box over candidate name and email, job title, every message body and attachment names.
  - [ ] Results are threads with the matching message snippet highlighted. Opening one scrolls to and flashes that message.
  - [ ] `/` focuses search on the Messages page (the global `/` already opens command search, so use ⌘F or scope it while inside the inbox).
- Backend: Postgres full-text search via Npgsql (installed): a generated `tsvector` column on `ApplicationMessage.Body` (`HasGeneratedTsVectorColumn`) with a GIN index, plus `ILIKE` on candidate name and email and job title. Add `q` to `GET /api/inbox` and return `matchMessageId` and `snippet` (`ts_headline`).
- Libraries: none new. Postgres FTS beats adding a search engine at this scale.

### Star, Done (archive) and Mark unread  — COMPLETE · S
- Where: `Thread.tsx:91-126`, `MessagesPage.tsx:55-69`.
- Today: works on sample data only.
- Design critique: The star, info and ••• buttons are fine. "Mark as unread" closes the thread, which is good Superhuman behaviour, and should stay.
- Product critique: In a shared inbox Done must be shared and star must be personal. Front works this way.
- Complete means:
  - [ ] Star per person. Done shared, and it reopens automatically when the candidate writes again. Mark unread per person.
  - [ ] "Undo" in the toast for Done (5 seconds).
  - [ ] Bulk select in the list (Shift+click and `x`) for Done, Assign and Mark read.
- Backend: `PATCH /api/applications/{id}/thread { done, starred, unread }` writes `Application.ThreadDoneAt` and `MessageThreadState`. Inbound messages clear `ThreadDoneAt`.
- Libraries: none.

### Keyboard shortcuts  — COMPLETE · S
- Where: `MessagesPage.tsx:51-70` and `:108-110` (legend), `lib/hooks` `useHotkeys`.
- Today: j/k move, r focuses reply, e archives, ⌘Enter sends (`Thread.tsx:294-298`). All Preview only; the real composer has none of them.
- Design critique: The legend wraps at 1440 once the list is squeezed. Move it into a `?` help sheet and drop the footer line.
- Product critique: Superhuman-level speed is what makes a recruiter's inbox bearable.
- Complete means:
  - [ ] Keep j/k/r/e and ⌘Enter. Add `s` star, `h` snooze, `a` assign, `u` mark unread, `Esc` close, `?` shortcut sheet.
  - [ ] Shortcuts work in the application tab's thread too (r and ⌘Enter).
- Backend: none.
- Libraries: none.

### Context rail (candidate details)  — COMPLETE · S
- Where: `Thread.tsx:188-239`.
- Today: shows sample phone, location, stage and next interview. "View full profile" goes to `/candidates`, the list, not the person (`Thread.tsx:212`). "View interview" goes to `/interviews` (`Thread.tsx:231`).
- Design critique: The rail repeats the name and avatar already in the thread header (56px avatar plus name, stacked again). At 1440 it takes 256px out of a thread that is already squeezed.
- Product critique: Front and Intercom put actions in the rail, so the recruiter never leaves the conversation to act.
- Complete means:
  - [ ] Real data: job, stage with a stage changer, assignee, next interview (links to `/applications/{id}/interviews`), source, other applications by this candidate. Links go to `/applications/{id}`.
  - [ ] Quick actions: Schedule interview (opens the existing `InterviewModal`), Move stage, Reject (existing `RejectModal`).
  - [ ] No repeated name or avatar. Closed by default below 1600px wide, open state remembered.
- Backend: reuse `GET /api/applications/{id}`.
- Libraries: none.

### New message (compose)  — COMPLETE · S
- Where: `MessagesShell.tsx:213-298`.
- Today: the "To" field is a `Select` over existing sample conversations only (`:270`), so you cannot start a conversation with someone you have not written to. Plain `Textarea`. Sends locally.
- Design critique: A modal with a textarea is a step down from the thread composer: no attach, schedule or formatting.
- Product critique: Greenhouse, Lever and Ashby let you email any candidate from anywhere, choosing which application the message is about.
- Complete means:
  - [ ] "To" is a `SearchSelect` over candidates the user can manage. When a candidate has two or more applications, the user picks which job the message is about.
  - [ ] The body is the shared composer (same features as a thread reply). Sending opens the thread.
  - [ ] Blocked with a clear reason when the candidate is "do not contact", unverified or bounced. The API already returns these as 409s (`ApplicationMessagesEndpoints.cs:27-30`), so show them inline before sending.
- Backend: reuse `POST /api/applications/{id}/messages`. Add `GET /api/candidates/lookup?q=` if the existing candidate search does not fit.
- Libraries: none.

### Composer  — COMPLETE · L
- Where: Preview `Thread.tsx:244-394`; real `ApplicationMessages.tsx:128-178`; `components/plate/*`.
- Today: Preview has Template, Attach (names only), Schedule and Send. Real has a textarea limited to 2,000 characters and two disabled icons. Plain text only on both, with no links, lists or bold. The label "Reply by email" (`Thread.tsx:288`) contradicts the chat bubbles above it.
- Design critique: The Preview composer has a visible label, a placeholder, three quiet buttons and a primary button. Good bones, but the real one ships disabled controls.
- Product critique: Front, Intercom and Gmail composers offer rich text, saved replies (`#` or `/`), emoji, files, scheduling, undo send and a channel choice. Recruiters also expect "Draft with AI", and that API already exists (`/api/ai/draft-message`) but is only wired into `RejectModal.tsx`.
- Complete means:
  - [ ] Plate composer built from the existing kit in `components/plate`: bold, italic, link, bulleted and numbered lists, autoformat (`**`, `- `). No headings, tables or drag handles in messages.
  - [ ] `#` on an empty line inserts a template, reusing `TemplateKit` (`components/plate/editor/plugins/menu-kit.tsx`). Detail chips (First name, Job title) fill in for this candidate before sending, with a warning chip for any detail that has no value (the logic exists in `template-vars.ts`).
  - [ ] Toolbar: Template, Attach, Emoji, Draft with AI, Schedule, and a "Send as" choice: **Email and portal** (default) or **Portal only** (a quick chat with no email).
  - [ ] Smart email: if the candidate is online in the portal and reads the message within 2 minutes, skip the email copy (Intercom does this). Uses the outbox delay plus a `ReadAt` check at send time.
  - [ ] ⌘Enter sends, Enter adds a new line. Undo send for 5 seconds, using the same outbox delay.
  - [ ] A draft per thread is saved to the server, so it survives a reload and can be picked up on another device.
  - [ ] Character limit raised to 10,000 and shown only near the limit.
  - [ ] Remove the disabled Attach and Formatting buttons now, before the rest lands (a quick win).
- Backend: `POST /api/applications/{id}/messages { body (Markdown), attachmentIds, scheduledFor, channel, templateId }`. Store Markdown. The email copy renders Markdown to HTML with Markdig inside `EmailHtml.Wrap` (`Infrastructure/EmailSender.cs:19`), plus a plain-text part. Add to `ApplicationMessage`: `Channel` (Portal or Email), `EmailOutboxItemId`, `ScheduledFor`, `SenderName`. New `MessageDraft { UserEmail, ApplicationId, Body, UpdatedAt }`.
- Libraries: `@platejs/link@53.3.5`, `@platejs/list@53.3.13`, `@platejs/autoformat@53.0.0`. Bump `platejs` from 53.3.15 to 53.5.2 and `@platejs/markdown` to 53.5.3 so the 53.x packages stay aligned (`@platejs/link` needs `platejs >= 53.3.5`). Server: `Markdig@1.6.0` for Markdown to HTML and plain text. It replaces the hand-written paragraph splitter and linkifier in `EmailHtml.Wrap` and handles lists, links and escaping correctly (use `DisableHtml()` so a message cannot inject markup).

### Attachments (files)  — COMPLETE · M
- Where: Preview `Thread.tsx:159-171`, `:355-365` (records name and size, never uploads). Real: none. Existing storage: `LocalFileStore` and the `Attachment` entity used by `Features/Candidates/CandidateAttachmentEndpoints.cs`.
- Today: fake on Preview, absent on real.
- Design critique: Preview chips sit inside the blue bubble at `bg-card/20`, which reads poorly on primary blue. There is no image thumbnail, no download, and no drag and drop.
- Product critique: Candidates send portfolios, references and signed documents. Front and Intercom show file cards with a type icon, size, a download link, image previews and drag-drop or paste to attach.
- Complete means:
  - [ ] Drag and drop onto the thread, paste from the clipboard, and the Attach button. Several files at once. Upload progress on each chip, with remove.
  - [ ] File cards in bubbles: type icon, name, size and Download. Images show a thumbnail that opens in a lightbox. PDFs open inline using the existing `?inline=true` support.
  - [ ] Limits stated up front: for example 10 files, 25MB in total (Resend allows 40MB per email after encoding).
  - [ ] The candidate can attach from the portal too.
  - [ ] Files sent in messages also appear in the candidate's Files list.
  - [ ] Files reach the candidate as real email attachments. Above the size limit, they go as a portal link instead.
- Backend: reuse `Attachment` with a nullable `MessageId` (no new table). `POST /api/applications/{id}/messages/attachments` (multipart, stored through `LocalFileStore`, `ScanStatus` as today) returns ids. Portal twin: `POST /public/portal/applications/{id}/messages/attachments`. `ResendEmailSender.SendAsync` gains an `attachments` parameter (base64 `content` and `filename`). The outbox stores attachment ids.
- Libraries: none. Native drag events plus the existing `FileButton`; `react-dropzone` is not worth a dependency for one drop zone.

### Emoji  — COMPLETE · S
- Where: none today. Typing emoji with the OS keyboard works in both textareas.
- Today: no picker, no shortcodes, no reactions.
- Design critique: n/a.
- Product critique: The owner asked for it explicitly. Intercom and Front have a picker and `:shortcode:` autocomplete. Reactions are low value in candidate email (they do not reach Gmail), so leave them out.
- Complete means:
  - [ ] An emoji button in the composer toolbar opens a searchable picker in a `Popover`.
  - [ ] Typing `:` followed by two letters autocompletes in the Plate composer.
  - [ ] The same picker works in the portal composer.
- Backend: none. Emoji are plain Unicode, and Postgres `text` is UTF-8.
- Libraries: `@platejs/emoji@53.1.7` with its peer `@emoji-mart/data@1.2.1`. It provides `:` autocomplete and the picker inside Plate on the already-installed `@platejs/combobox`. If the portal composer stays a textarea, use `frimousse@0.4.0` there instead: unstyled, tiny, and styled with Tailwind tokens.

### Scheduled send  — COMPLETE · S
- Where: Preview `Thread.tsx:366-382`, `:141-179`, `MessagesShell.tsx:123,128-137`.
- Today: Preview only, and nicely done: a native `datetime-local` with a 5-minute minimum, an amber "Sends Fri…" chip, "Cancel and edit" on a pending bubble, and a past-time check.
- Design critique: The popover holds a bare date input. Superhuman offers presets.
- Product critique: Recruiters write at night and send at 9am in the candidate's time zone.
- Complete means:
  - [ ] Presets: "Tomorrow 9:00 AM", "Monday 9:00 AM" and "Custom". Times shown in the sender's time zone with the candidate's local time next to them when known.
  - [ ] A Scheduled folder. Pending bubbles get "Cancel and edit" and "Send now".
  - [ ] Scheduled messages are not visible to the candidate until sent.
- Backend: set `ApplicationMessage.ScheduledFor` and the outbox item's existing `NextAttemptAt` (`Domain/Operations.cs:55`) to the send time. The worker already only picks up rows where `NextAttemptAt <= now` (`EmailOutboxWorker.cs:44-47`). The portal and inbox hide rows with `ScheduledFor > now`. `DELETE /api/messages/{id}` cancels while pending. Record the candidate's browser time zone when they book or use the portal (`Candidate.TimeZone`).
- Libraries: none.

### Draft with AI  — COMPLETE · S
- Where: `Features/AI/AiEndpoints.cs:15-43` (`/api/ai/draft-message`), used only by `RejectModal.tsx:21`.
- Today: the endpoint works but the composer does not use it.
- Design critique: n/a.
- Product critique: Gem, Ashby and Greenhouse all ship "write with AI" in the email composer.
- Complete means:
  - [ ] A "Draft with AI" button in the composer opens a one-line "What should it say?" input. The result fills the composer for editing and is never sent automatically.
  - [ ] Uses the last 5 messages of the thread as context, with private notes excluded (the endpoint's system prompt already forbids internal notes).
  - [ ] Hidden when AI is off (`organization.AiEnabled`).
- Backend: add `threadContext` to `DraftMessageRequest`. The server loads the messages itself rather than trusting the client.
- Libraries: none.

### Read receipts and delivery status  — COMPLETE · S
- Where: `components/messages/Chat.tsx:31-38` ("Delivered" with a check, Preview only); `ApplicationMessage.ReadAt` (set by the portal, `PublicCandidateMessagingEndpoints.cs:54-66`); `EmailOutboxItem.DeliveryStatus` (from the Resend webhook); `ApplicationHistory.tsx:81-97` shows email delivery badges in Activity only.
- Today: the data exists, but the real thread shows none of it. A staff message has no link to its email (`ApplicationMessage` has no `EmailOutboxItemId`), so a bounce never shows on the message that bounced.
- Design critique: The Preview's "9:38 AM · Delivered ✓✓" line is right. Extend it rather than invent a new pattern.
- Product critique: Intercom shows "Seen", Superhuman shows "Read". Recruiters most need to know "did it bounce?", which today appears only in Activity.
- Complete means:
  - [ ] Status line on our bubbles: Scheduled, Sending, Sent, Delivered, Opened (only if open tracking is on), Seen in portal, or Failed / Bounced in red with "Retry" or "Edit address".
  - [ ] Incoming bubbles show "Read by Sam 2:14 PM" on hover (per-person read state).
  - [ ] Author avatar and name on team messages, not the raw email (`ApplicationMessages.tsx:112`).
- Backend: `ApplicationMessage.EmailOutboxItemId`. Thread messages return `deliveryStatus` and `seenAt`. The Resend webhook pushes `DeliveryUpdated` over SignalR.
- Libraries: none.

### Reply by email (outgoing message email and inbound replies)  — COMPLETE · L
- Where: `ApplicationMessagesEndpoints.cs:33-35`, `PublicCandidateMessagingEndpoints.cs:46-48`, `Infrastructure/EmailSender.cs:79-87`, `Features/Public/ResendWebhookEndpoints.cs`.
- Today: staff messages go out as "A message about your X application", with the body wrapped in "{company} sent you a message: … You can reply from your candidate portal." There is no portal link, no Reply-To, no `Message-ID`/`In-Reply-To` headers, and every message has the same subject, so Gmail threading is luck. The candidate's emailed reply goes to the From address and is lost. When a candidate writes in the portal, only `Requisition.RecruiterEmail` is emailed ("Reply from the application in the ATS", again with no link). The webhook ignores `email.received` (`ResendWebhookEndpoints.cs:30-34` only ranks delivery statuses).
- Design critique: The candidate email reads like a system notice, not a note from a person. The From name is the bare `Resend:From` and the HTML header is the company name in bold text (`EmailSender.cs:29`).
- Product critique: This is the owner's "reply via email or just text". Greenhouse and Lever send from the recruiter's own mailbox through Gmail or Outlook sync. Gem does too, and pulls the reply in. That approach needs Google restricted-scope verification (a third-party security assessment) and per-user OAuth, which drags us towards compliance. A per-thread reply address on our own domain gets the same experience for candidates without that.
- Complete means:
  - [ ] Outgoing email is from "Avery at Acme <hiring@acme.com>" with Reply-To `reply+{threadToken}@{inboundDomain}`. The subject stays the same per thread ("Your Software Engineer application at Acme"). It sets `Message-ID` and `In-Reply-To`/`References` so Gmail and Outlook thread it. The body is the message itself, then a quiet footer: "Reply to this email or open your messages: {portal link}".
  - [ ] Candidate replies by email appear in the thread within seconds, with the quoted history and signature stripped (a "Show full email" toggle keeps the original) and attachments saved.
  - [ ] Matching order: plus token, then the `In-Reply-To` header, then the sender's address when it belongs to exactly one candidate with an open application. Anything unmatched goes to an "Unmatched email" list in the inbox, where a recruiter attaches it to a candidate or discards it.
  - [ ] Sender check: a reply from an address other than the candidate's still posts, labelled "From jane@other.com". Never auto-trust it as the candidate.
  - [ ] Staff can reply by email too. The "Karen wrote" email to the team carries a staff reply address, and a reply from a team member with access posts as them.
  - [ ] Emails a candidate sends to the team land in the same thread as portal messages, with a small "via email" or "via portal" tag.
- Backend: Resend inbound on a subdomain (MX for `reply.acme.com`, or the account's `<id>.resend.app` while testing). Handle `email.received` in the existing `/webhooks/resend` (Svix signing is already verified). Fetch the full received email (text, headers, attachment download links) from Resend's Receiving API, then match, clean and save `ApplicationMessage { FromCandidate, Channel = Email, ExternalMessageId }` plus `Attachment` rows. Deduplicate on `svix-id` and `ExternalMessageId`. Push over SignalR and create notifications. Config: `Resend:InboundDomain`. Add `ReplyTo`, `Headers` and `Attachments` to `IEmailSender.SendAsync` (Resend's `/emails` takes `reply_to`, `headers` and `attachments`). Store the outgoing `Message-ID` on the outbox row. New `UnmatchedInboundEmail` table.
- Libraries: `EmailReplyParser@2.0.1` (NuGet), a port of GitHub's reply parser that strips quoted text and signatures; hand-rolling this misses Outlook and Gmail quote styles. Markdig (see Composer) for the outgoing HTML. Store only the plain-text part of inbound mail. Add `HtmlSanitizer@11.0.26` only if inbound HTML is ever rendered.

### Live updates (real-time)  — COMPLETE · M
- Where: nothing yet. `application-data.tsx:51` polls only while calendar sync is pending, and `approval-data.ts:23` polls approvals every 60 seconds.
- Today: a new candidate message appears only after a window refocus or a manual reload. The candidate portal is the same.
- Design critique: n/a.
- Product critique: "Live chat" means seeing it arrive. Intercom and Front show new messages, typing indicators and collision warnings ("Sam is replying").
- Complete means:
  - [ ] New messages, read receipts, delivery changes, assignment, snooze and Done appear live in the inbox, the thread, the application tab and the portal.
  - [ ] Typing indicator in both directions ("Karen is typing…").
  - [ ] Collision warning: "Sam is viewing" or "Sam is replying" on a thread.
  - [ ] The bell count and the Messages nav badge update live.
  - [ ] Reconnects quietly. After a reconnect the client refetches, so nothing is missed.
  - [ ] Optional desktop alerts through the browser Notification API, switched on in notification settings.
- Backend: ASP.NET Core SignalR (part of the .NET 10 shared framework, so no NuGet package). One `InboxHub` at `/api/hubs/inbox` with groups `user:{email}`, `application:{id}` and `candidate:{id}`. Staff authenticate with the existing cookie. The portal passes its `X-Candidate-Session` token through `accessTokenFactory`, validated with `CandidateIdFromTokenAsync`. Endpoints and the Resend webhook push through `IHubContext` after `SaveChangesAsync`. Client methods: `Typing(applicationId)`, throttled to once every 3 seconds. Routing: Next rewrites (`next.config.ts:10-19`) do not carry WebSocket upgrades, so in production route `/api/hubs/*` straight to the API at the proxy or ingress. SignalR falls back to Server-Sent Events or long polling through the rewrite until then. One API instance needs no backplane; add the Redis backplane only when running more than one.
- Libraries: `@microsoft/signalr@11.0.0`. It gives reconnection, transport fallback and groups. Plain SSE (`TypedResults.ServerSentEvents` in .NET 10) would need hand-built fan-out and a second channel for typing.

### Assignment  — COMPLETE · M
- Where: none. Only `Requisition.RecruiterEmail` exists, and only that address is emailed on inbound messages.
- Today: nobody owns a conversation. A hiring manager who messages a candidate never hears the reply unless they are the job's recruiter.
- Design critique: n/a.
- Product critique: Front's core feature. Without it, a shared inbox becomes "everyone thought someone else answered".
- Complete means:
  - [ ] Each thread has an assignee, defaulting to the job's recruiter. Change it from the thread header (an avatar button with `SearchSelect`) or with `a`.
  - [ ] Inbound messages notify the assignee. If there is none, they notify the job's recruiter.
  - [ ] A staff member who sends a message on an unassigned thread becomes the assignee (Front's "assign on reply").
  - [ ] "Assigned to me" and "Unassigned" folders. An assignee filter.
  - [ ] Assignment changes appear in the thread as a small event line.
- Backend: `Application.AssigneeEmail`. `PATCH /api/applications/{id}/thread { assignee }` checks the assignee can manage the job. Audit event. Notification to the new assignee.
- Libraries: none.

### Snooze  — COMPLETE · S
- Where: none.
- Today: absent.
- Design critique: n/a.
- Product critique: Superhuman, Front and Lever all have snooze ("Remind me Monday if she hasn't answered").
- Complete means:
  - [ ] Snooze with presets (Later today, Tomorrow, Next week, Custom) and the option "Unsnooze early if they reply".
  - [ ] Snoozed threads leave Inbox and come back to the top with a "Snooze ended" notification.
  - [ ] A Snoozed folder shows when each thread returns.
- Backend: `Application.SnoozedUntil`. The inbox query treats a thread as snoozed while `SnoozedUntil > now`. `EmailOutboxWorker`'s 5-minute sweep (`EmailOutboxWorker.cs:23-27`) creates "Snooze ended" notifications. An inbound message clears `SnoozedUntil`.
- Libraries: none.

### Bulk email  — COMPLETE · M
- Where: none. The `DataTable` already supports `selectable` and `bulkActions`.
- Today: absent. Emailing 30 people at the Screen stage means 30 visits to 30 tabs.
- Design critique: n/a.
- Product critique: Greenhouse, Lever and Ashby all have "Email selected candidates" with templates and personalization. It is the most common recruiter batch task after moving stages.
- Complete means:
  - [ ] "Email" as a bulk action on the Candidates table, the job pipeline and stage columns.
  - [ ] Opens a drawer with the composer, a template picker and a preview that steps through recipients ("1 of 30 · Karen") showing details filled in. People with a missing detail are flagged before send.
  - [ ] People who are do-not-contact, unverified or bounced are listed and skipped, with the reason shown.
  - [ ] Send now or schedule. Each recipient gets their own message in their own thread, so replies come back individually.
  - [ ] A summary toast and an Activity entry ("Emailed 28 candidates, skipped 2").
- Backend: `POST /api/messages/bulk { applicationIds[], templateId?, body, scheduledFor? }` creates one `ApplicationMessage` and outbox row per application in one transaction. Cap at 500 per request. The worker sends one at a time, so there is no burst. Each send is checked with `CanManage`.
- Libraries: none.

### Sequences (multi-step automated follow-ups)  — REMOVE · —
- Where: none. Nothing to delete, so this is a "do not build".
- Why: Multi-step nurture campaigns are Gem's sourcing-CRM territory. Done properly they need reply detection across sequences, per-step metrics and sending throttles, which is weeks of work for a small slice of customers. "If no reply in 3 days, send the reminder template" belongs in the Workflows area as one action that uses this area's templates.

### Email signatures  — COMPLETE · S
- Where: none. `sender_name` is hard-coded to "Alex Morgan" in `template-vars.ts:59`.
- Today: messages end however the recruiter types them. Templates use `{{sender_name}}` with a fake value.
- Design critique: n/a.
- Product critique: Every email product has a personal signature. Candidates want to know who is writing and how to reach them.
- Complete means:
  - [ ] My settings › Email signature, edited in the same Plate editor (name, title, links).
  - [ ] Added to emailed messages automatically, not shown in the portal bubble.
  - [ ] `{{senderName}}` in templates uses the real sender.
- Backend: `UserProfile.EmailSignature` (Markdown), used when rendering the outbox row.
- Libraries: none.

### Saved message templates (Preview `/messages/templates`, `/new`, `/[id]`)  — MERGE · S
- Where: `features/preview/messages/TemplatesPage.tsx`, `TemplateEditor.tsx`, `template-vars.ts` (+ `.check.mjs`), sample data in `sample-messages.ts:283-344`.
- Today: create, edit, duplicate, delete and category filter all work, but only in localStorage. The editor offers a "Preview for candidate" select over sample people and a clickable placeholder list that tracks the cursor.
- Design critique: A full `DataTable` with column chooser, density and Export (CSV) for six templates is heavy. On phone the toolbar breaks: the search box is cut to "Search temp", "All categories" wraps onto two lines, and the table scrolls sideways so the Category column is clipped. The "Placeholders" rail repeats `{{first_name}}` with "First name, like Karen" for eight rows. The new-template screen stacks the form, then the preview, then the placeholders. "Template not found" offers a text link where a button belongs.
- Product critique: Recruiters need personal and shared saved replies (Front's message templates, Intercom macros, Greenhouse "My templates" versus organization templates). The concept is right; the storage and editor are not.
- Merge: the survivor is the Template library (next feature). What moves: categories, duplicate, the real-candidate preview picker, unknown-variable warnings, and the personal versus team ownership idea. Delete `sample-messages.ts` templates and the localStorage key `ats-preview:message-templates:v1`. Move the `template-vars.ts` fill and missing-value logic to the server renderer. Pick one variable syntax: camelCase, because stored overrides already use `{{firstName}}`.

### Template library and automatic emails (`/admin/email-templates`, becomes `/messages/templates`)  — COMPLETE · L
- Where: `features/admin/AdminEmailTemplates.tsx`, `EmailTemplateEditor.tsx`, `Features/Administration/ConfigurationEndpoints.cs:70-178`, `Infrastructure/EmailTemplates.cs`, `Domain/Communication.cs:3-13`.
- Today: eight built-in automatic emails (Acceptance, Status update, Rejection, Booking request, Booking reminder, Still reviewing, Scorecard reminder, Approval request). Each can be edited for all jobs or overridden per job, with variable validation on save, a server-rendered HTML preview and "Go back to standard wording". Editing is a `Textarea`.
- Design critique: At 1440 the editor column is about 610px because of the three navs, and the preview only sits beside it at 2xl. "Edit for: All jobs" takes a whole card for one select (`AdminEmailTemplates.tsx:18-36`). The template list never says who receives each email or when it goes out. "Scorecard reminder" and "Approval request" go to staff, but they sit mixed in with candidate emails. Variables are monospace `{{firstName}}` pills, which is jargon. Clicking another template while you have unsaved changes silently throws them away, because the editor remounts on key (`EmailTemplateEditor.tsx:72-101`) and there is no guard. On phone the sticky Save bar floats over the middle of the message field, and the template list becomes a sideways strip cut off at "Intervie…".
- Product critique: The owner wants "a proper WYSIWYG editor in Plate, not a textarea". Ashby and Greenhouse templates are rich text with variable chips, test sends, and per-job or per-office variants. Ours are plain text and only cover 8 of the roughly 20 emails we actually send (see Hard-coded emails).
- Complete means:
  - [ ] One library at `/messages/templates` with two tabs: **Saved replies** (anyone can create; personal or shared with the team) and **Automatic emails** (fixed list, editable by people with the `templates` permission). Settings › Email templates links here. Delete `/admin/email-templates`.
  - [ ] Automatic emails are grouped by recipient (To candidates / To your team). Each row says when it is sent ("When you reject an applicant"), whether it was changed, which jobs override it, and when it was last edited and by whom.
  - [ ] Editor: subject plus a Plate body (`EmailKit`: bold, italic, link, lists, `#` to insert another template, detail chips inserted with `{{` or from an "Insert detail" menu with plain-English labels like "First name"). It opens as its own page with breadcrumbs, not inside the settings frame. Editor and live preview sit side by side from 1280px.
  - [ ] Unsaved-changes guard (`ConfirmDialog`) when switching templates or leaving the page.
  - [ ] Per-job override picker as a compact select in the editor header. A "Changed for 3 jobs" link lists them.
  - [ ] Duplicate, categories and search for saved replies. Deleting a shared template asks for confirmation.
  - [ ] Phone: the template list is a full-screen list and the editor is a full-screen page. The save bar sits at the bottom of the viewport and never on top of the field.
- Backend: extend `EmailTemplate` to `{ Id, Kind (Automatic|Saved), Key?, Name, Category?, OwnerEmail? (null means shared), RequisitionId?, Subject, Body (Markdown), Version, UpdatedAt, UpdatedBy }`. CRUD at `/api/templates`; automatic keys stay non-deletable (reset only). Markdown renders through Markdig in `EmailTemplates.RenderAsync`. Migration: existing rows become `Kind = Automatic` with their `Key`.
- Libraries: the Plate kit already installed, plus `@platejs/link`, `@platejs/list` and `@platejs/autoformat` (see Composer). Variables are a 20-line inline void element following the existing `TemplateInputPlugin` pattern (`components/plate/editor/plugins/menu-kit.tsx:15-22`) with the installed `@platejs/combobox`. A custom `@platejs/markdown` rule writes them as `{{key}}` and reads them back as chips. `@platejs/mention` is not needed.

### Template details (placeholders)  — COMPLETE · S
- Where: Preview `template-vars.ts:3-12` (snake_case); real `EmailTemplates.cs:12-63` (camelCase per template), validation in `ConfigurationEndpoints.cs:118-127`.
- Today: two vocabularies. The real one validates unknown variables on save. The Preview one only warns.
- Design critique: The raw token is shown to users. Labels exist only on the Preview side ("First name, like Karen").
- Product critique: Greenhouse and Ashby show tokens as named chips and let you set fallbacks ("there" when first name is missing).
- Complete means:
  - [ ] One registry on the server: key, label, example, which templates or contexts allow it. Served at `GET /api/templates/variables`.
  - [ ] Chips show the label. Hover shows the example. Unknown keys are impossible to insert from the editor and flagged if pasted.
  - [ ] Optional fallback per chip ("Hi {{firstName|there}}").
  - [ ] Saved replies get the thread variables (candidate, job, stage, next interview, sender, company, portal link).
- Backend: the registry replaces `EmailTemplateDefault.Variables` and `templateVariables`. `EmailTemplates.Fill` supports `|fallback`.
- Libraries: none.

### Template preview  — COMPLETE · S
- Where: `ConfigurationEndpoints.cs:163-178`, `EmailTemplateEditor.tsx:123-134` and `:277-298`; Preview `TemplateEditor.tsx:220-251`.
- Today: the real preview fills sample values, but the sample dictionary has no `portalLink` or `roundMessage` (`ConfigurationEndpoints.cs:169-175`). The Status update, Booking request, Booking reminder and Still reviewing previews therefore show a literal `{{portalLink}}`, a bug a customer will see. The iframe is fixed at 360px tall.
- Design critique: The preview is a grey frame inside a card inside a card. A subject line plus an inbox-like frame is right, but it is too small at 360px.
- Product critique: Previewing as a real candidate (the Preview editor's best idea) beats "Alex, Senior Engineer".
- Complete means:
  - [ ] Fix the missing sample values now (quick win) by running the preview through `RenderAsync`'s `Tidy` and adding `portalLink` and `roundMessage`.
  - [ ] A "Preview as" `SearchSelect` of real candidates on a chosen job. Missing details show as amber chips in the preview.
  - [ ] Desktop and phone width toggle. The iframe sizes to its content.
- Backend: `POST /api/templates/{id}/preview { applicationId? }` renders with real values when given.
- Libraries: none.

### Template versions  — COMPLETE · M
- Where: `EmailTemplate.Version` int; the editor shows "Version 3" (`EmailTemplateEditor.tsx:192`); `EmailOutboxItem.TemplateVersion` records which version was sent.
- Today: the counter goes up but old text is overwritten. You cannot see or restore a previous version, and "reset to standard" is not audited (`ConfigurationEndpoints.cs:146-161`).
- Design critique: "Version 3" with nothing behind it is a dead label.
- Product critique: The owner asked for versioning. Notion-style history (list, diff, restore) is the bar. Greenhouse keeps template history for audit.
- Complete means:
  - [ ] A "History" drawer lists versions with editor, date and a one-line summary.
  - [ ] Pick a version to see it rendered and a diff against the current one. "Restore this version" creates a new version.
  - [ ] Sent emails link to the version used (from the outbox row in Activity).
- Backend: `EmailTemplateVersion { TemplateId, Version, Subject, Body, EditedBy, EditedAt }`, written on every save and reset. `GET /api/templates/{id}/versions`, `POST /api/templates/{id}/restore/{version}`. Audit the reset action.
- Libraries: none. A word-level diff is about 30 lines over `Intl.Segmenter`. Only add `diff@9.0.0` if a richer diff view is wanted.

### Send a test email  — COMPLETE · S
- Where: none.
- Today: absent.
- Design critique: n/a.
- Product critique: Every email tool has "Send me a test". Rendering in Gmail and Outlook differs from our iframe.
- Complete means:
  - [ ] A "Send me a test" button in the template editor and in the bulk email drawer. The test goes to the signed-in user with "[Test]" in the subject, using real or sample values.
- Backend: `POST /api/templates/{id}/test`, which queues an outbox row to `principal.Email()` with no `ApplicationId`. Rate limit 10 per hour per user.
- Libraries: none.

### Per-job wording  — COMPLETE · S
- Where: `AdminEmailTemplates.tsx:19-32`, `EmailTemplates.RenderAsync` (`EmailTemplates.cs:76-84`).
- Today: works. You can only discover which jobs have overrides by picking each job in turn.
- Design critique: The override switcher should sit in the editor header, not in a full-width card above everything.
- Product critique: Greenhouse shows overrides per office and department in one list.
- Complete means:
  - [ ] Each automatic email lists the jobs that override it, with links. The job's Settings tab shows its overridden emails.
  - [ ] "Copy from all jobs" when starting an override (today it starts from the effective text, which is right; keep that).
- Backend: `GET /api/templates/{id}` returns `overrides: [{ requisitionId, title, updatedAt }]`.
- Libraries: none.

### Hard-coded emails  — COMPLETE · M
- Where: `QueueEmail` and direct `new EmailOutboxItem` with literal text in `ApplicationMessagesEndpoints.cs:34`, `PublicCandidateMessagingEndpoints.cs:46,100,104,106`, `PublicInterviewBookingEndpoints.cs:110,118,243,251,333,341`, `InterviewEndpoints.cs:181,194`, `OfferEndpoints.cs:737,774`, `IntegrationOutboxWorker.cs:211,229,239`, `EmailOutboxWorker.cs:135`, `PublicJobEndpoints.cs:163`.
- Today: about 20 emails cannot be edited, including the message wrapper, interview scheduled, booked, rescheduled and cancelled, the withdrawal confirmation and recruiter alerts. Eight of them print times as `{interview.StartsAt:u}`. Candidates and interviewers read "2026-11-14 15:00:00Z", in UTC and in machine format (`InterviewEndpoints.cs:185`, `PublicInterviewBookingEndpoints.cs:122,247,255,337,345`, `IntegrationOutboxWorker.cs:211`).
- Design critique: n/a (email body).
- Product critique: "Complete templates" means every candidate-facing email can be edited and every time reads like "Friday, November 14 at 10:00 AM EST".
- Complete means:
  - [ ] Every candidate-facing email has a template key: interview scheduled, rescheduled, cancelled, booked, withdrawal confirmed, application received, verification code (subject only).
  - [ ] Team alerts become notifications (see Notification feed) rather than one-off emails.
  - [ ] An `{{interviewTime}}` variable formatted in the candidate's time zone when known, otherwise the organization's, always with the zone name.
  - [ ] Fix the `:u` formatting now as a quick win, before the template move.
- Backend: add keys to `EmailTemplates.Defaults` and replace each `QueueEmail(…)` with `EmailTemplates.QueueAsync`. A shared `FormatWhen(DateTimeOffset, string timeZone)`. `Candidate.TimeZone` is captured by the portal and booking page.
- Libraries: none. `TimeZoneInfo` and `CultureInfo` cover formatting.

### Email settings (`/admin/email`)  — COMPLETE · M
- Where: `features/admin/AdminSettings.tsx:129-150` (`EmailSection`), setup checklist item `email`.
- Today: one red Alert, "Candidate email is off… Ask whoever runs your server to add the Resend email key…". When configured, one green Alert. Nothing else. The nav says "Email delivery", the page heading says "Email delivery" and the card says "Candidate email".
- Design critique: A whole settings page for one alert. The text is a dead end: no setting names, no "Check again", no link to Resend.
- Product critique: Admins need to answer "did Karen get the email?" and "why are we in spam?". Greenhouse and Ashby show a sent-email log and let you send from your own domain with DNS records to copy.
- Complete means:
  - [ ] **Status**: connected or not. When not, show the exact settings to add (`Resend__ApiKey`, `Resend__From`, `Resend__InboundDomain`) and a "Check again" button.
  - [ ] **Sender**: display name format ("{sender} at {company}" or "{company} hiring team"), From address, reply domain.
  - [ ] **Your domain**: add a sending domain, see the DNS records to copy (SPF, DKIM, MX for replies) with copy buttons and a Verified, Pending or Failed badge for each.
  - [ ] **Sent email log**: a `DataTable` over `EmailOutbox` with recipient, subject, template, sent time and status, filters for Failed, Bounced and Scheduled, a row drawer showing the exact content sent, and actions Retry and Cancel (scheduled).
  - [ ] **Blocked addresses**: candidates with `EmailBounced`, with "Allow again".
  - [ ] **Open tracking** switch (off by default), which drives the "Opened" receipt.
  - [ ] Rename the nav item and page to "Email" and drop the extra card title.
- Backend: `GET /api/admin/email/status`, `GET /api/admin/email/log?status=&q=&cursor=`, `POST /api/admin/email/log/{id}/retry`, `DELETE /api/admin/email/blocked/{email}`. Domain setup calls Resend's Domains API (create, get records, verify) with the server key. Store `Organization.SenderNameFormat`, `SendingDomain` and `OpenTracking`.
- Libraries: none. Plain `HttpClient` calls, as `ResendEmailSender` does today.

### Email layout and branding  — COMPLETE · S
- Where: `Infrastructure/EmailSender.cs:16-41` (`EmailHtml.Wrap`).
- Today: a grey page and a white card with the company name in bold text. The link colour `#2563eb` is hard-coded. No logo and no footer.
- Design critique: Looks like a system notice. There is no sign of which company or person it is from beyond a bold word.
- Product critique: Ashby, Greenhouse and Lever emails carry the company logo, a sender signature and a footer linking to the careers site or portal.
- Complete means:
  - [ ] The company logo in the header (from the portal branding), with a brand colour for links and buttons.
  - [ ] The sender signature for person-to-person emails.
  - [ ] A footer: company name, "View your application" (portal link) and the careers site link.
  - [ ] Renders well in Gmail, Outlook and Apple Mail, light and dark (inline styles, a table layout for Outlook).
  - [ ] A layout preview in Email settings.
- Backend: `EmailHtml.Wrap(company, html, branding, signature)` takes Markdig output. Needs `Organization.LogoUrl` and `BrandColor`, which belong to the candidate portal or branding area.
- Libraries: none. Keep the hand-written wrapper; MJML or React Email would add a Node render step to a .NET server.

### Resend delivery webhook  — COMPLETE · S
- Where: `Features/Public/ResendWebhookEndpoints.cs`.
- Today: solid. Svix signatures are checked with a 5-minute window and constant-time compare, status only moves forward, and bounces and complaints block the address and post to Slack. Gaps: `email.failed` and `email.suppressed` are not in `DeliveryRank` (`:12-15`), so a failed send stays "sent". `email.received` is ignored. There is no deduplication on `svix-id`.
- Design critique: n/a.
- Product critique: n/a.
- Complete means:
  - [ ] Handle `failed` and `suppressed` as terminal red states.
  - [ ] Handle `email.received` (see Reply by email).
  - [ ] Deduplicate retries on `svix-id`.
  - [ ] Push delivery changes over SignalR.
  - [ ] Bounce notifications go to the sender of that message, not only to Slack.
- Backend: as listed. A `ProcessedWebhook(svixId)` table, or a unique index on the inbound `ExternalMessageId`.
- Libraries: none.

### Email outbox worker  — DONE
- Where: `Infrastructure/EmailOutboxWorker.cs`.
- Why done: a queue with lease locking (`LockedUntil`), exponential backoff, at most 5 attempts, permanent failure for bounced addresses, quiet hours in the organization's time zone (with midnight wrap tested in `InQuietHours`), and reminder sweeps with per-item caps. It is invisible to users and correct. Scheduled send, attachments and reply headers only add fields that the sender passes through; they do not change the worker.

### Header bell  — MERGE · S
- Where: `components/layout/AppShell.tsx:194-250`.
- Today: shows pending approvals only (badge, popover titled "Waiting on you", "View all" to /notifications), refreshed every 60 seconds. In the screenshots the bell shows no badge while /notifications says "To do (7)", including an unread candidate message.
- Design critique: The bell and the page disagree on what a notification is. The popover lists "Offer approval · …" rows with no icon or unread state.
- Product critique: Linear's and GitHub's bells are a window onto the same feed as the full page.
- Merge: the survivor is the Notification feed. The bell becomes its popover: the 8 latest entries with icon, unread dot and relative time, "Mark all as read", and "Open notifications". The badge is the unread count (capped at "9+") and updates live over SignalR. Delete the approvals-only query here.

### Notifications page (`/notifications`)  — COMPLETE · L
- Where: `features/notifications/NotificationsPage.tsx`, `notification-items.ts`. Data from `GET /api/dashboard` plus pending approvals.
- Today: computes "to do" items from dashboard lists (approvals, scorecards due, unread messages, stalled). Each list is capped at 6 by the dashboard query (`DashboardEndpoints.cs:92-95` and its siblings), so the seventh unread message never appears and nothing says so (only stalled has a "26 more" note). "Done" is kept in localStorage per browser (`notification-items.ts:94-97`). The message "Reply" link goes to the application overview, not the thread (`notification-items.ts:75`). There are no events at all: nothing for assignment, mentions, bounces, a candidate booking, a withdrawal or a snooze ending. Those only reach the Slack webhook.
- Design critique: A `DataTable` with column chooser, density and Export is the wrong pattern for a feed. The Type column repeats the tab. Tabs show "Approvals (0)" and "Feedback due (0)". On phone the Type, When and action columns are off screen, so Reply, Open and the done tick are hard to reach, and the tabs overflow ("Me…"). The "To do / Done" toggle sits at top right, away from the list it controls.
- Product critique: Linear's Inbox has an event feed, read and unread, snooze, grouping by issue, keyboard support, and per-event and per-channel settings. Stalled applications are a state, not news: 33 rows of "nothing has happened" drown the one candidate reply. The dashboard already lists them.
- Complete means:
  - [ ] A real feed of events for me: candidate replied (on my threads), assigned to me, mentioned in a note, approval needed or decided, scorecard due, interview in 1 hour or tomorrow, candidate booked, rescheduled or withdrew, email bounced, snooze ended, new applicant on my job.
  - [ ] Grouped by record ("Karen Dela Cruz · 3 updates"). Unread first. Read and unread tabs, plus a kind filter as chips (only kinds that have items).
  - [ ] A list layout, not a table: icon, title, one-line detail, time, unread dot, and hover actions (Mark read, Done, Open). Keyboard j/k/e/Enter.
  - [ ] Each entry deep-links to the exact place (the thread at `/messages?thread=`, the scorecard, the approval).
  - [ ] Done and read state stored on the server and shared across devices. "Mark all as read".
  - [ ] Stalled applications become one daily entry ("6 applications on your jobs have had no activity for 30 days or more"), not a row each.
  - [ ] Phone: a full-width list with swipe-free buttons and no sideways scroll.
- Backend: `Notification { Id, UserEmail, Kind, Title, Body, Href, EntityType, EntityId, GroupKey, CreatedAt, ReadAt, DoneAt }`. A `Notify.Add(db, recipients, kind, …)` helper called beside every existing `PipelineEvents.NotifyAsync` call, plus the new events. It checks preferences and pushes `NotificationCreated` over SignalR. `GET /api/notifications?status=&kind=&cursor=`, `POST /api/notifications/read { ids | all }`, `POST /api/notifications/done { ids }`. The worker deletes entries older than 90 days and writes the daily stalled summary. Index on `(UserEmail, ReadAt, CreatedAt)`.
- Libraries: `@microsoft/signalr` (shared with Live updates).

### Notification settings (`/settings/notifications`)  — COMPLETE · M
- Where: `features/preview/ProfilePage.tsx:19-43`, `:86-123` (`NotificationPrefsPage`).
- Today: a Preview with five switches held in React state and lost on reload. Four describe things the product never does: new-applicant email, an interview reminder an hour before, mentions and a weekly summary. Only the scorecard reminder exists, and that is an organization setting.
- Design critique: Fine as a list of switches, but there is a page-level Preview badge and a Preview alert, plus a "Preview" chip in the settings nav, which says the same thing three times.
- Product critique: Linear, GitHub and Slack offer a matrix: each event × channel (in app, email, Slack, desktop) with a digest option.
- Complete means:
  - [ ] A table of the same events as the feed. Columns: In app and Email, plus Desktop once live alerts exist. Sensible defaults (email on for candidate replied, assigned and mentioned; off for the rest).
  - [ ] Email summary: Off, Daily at 8:00 AM or Weekly on Monday, in the user's time zone. It bundles the unread feed and open to-dos (scorecards due, stalled on my jobs).
  - [ ] "Pause email notifications until…" for holidays.
  - [ ] Saves on toggle (optimistic update with rollback, per `src/web/CLAUDE.md`).
  - [ ] Remove the Preview badges once it is real.
- Backend: `NotificationPreference { UserEmail, Kind, InApp, Email }`, `UserProfile.DigestFrequency` and `NotificationsPausedUntil`. `GET`/`PUT /api/me/notification-preferences`. Email delivery uses a `notification` template, sent at once or held for the digest. The digest runs in `EmailOutboxWorker`'s sweep, once per user per period.
- Libraries: none.

### Team notifications (Slack or Teams, `/admin/notifications`)  — COMPLETE · S
- Where: `AdminSettings.tsx:438-492`, `ConfigurationEndpoints.cs:362-373`, `Infrastructure/PipelineEvents.cs:140-153`.
- Today: one incoming-webhook address for the whole organization. Every event posts one line of text `{ text }`: approvals, every candidate message (with the candidate's name), withdrawals, bookings, bounces, stalled and scorecards overdue. Test message button. There is no way to pick events and no record of whether posts are failing. The nav says "Notifications", the page says "Team notifications" and the card says "Slack or Teams channel".
- Design critique: "Send a test message" sits above the field it depends on and is disabled until you save. Put it after the field with the helper text. Each stalled application posts its own message, which floods the channel.
- Product critique: Greenhouse and Ashby Slack apps let you choose events and include a link back to the record. Microsoft is retiring Office 365 connector webhooks in favour of Workflows webhooks, which expect an Adaptive Card body; check that `{ text }` still posts to new Teams webhooks.
- Complete means:
  - [ ] Event checkboxes: which kinds post to the channel (defaults: approvals, bounces, withdrawals; candidate messages off).
  - [ ] Each post includes a link to the record (`Organization.PublicUrl`) and, for Slack, uses blocks.
  - [ ] Stalled applications post as one daily summary.
  - [ ] Last delivery status under the field ("Last post 5 minutes ago" or "Last post failed: 404, check the address"). `WebhookDeliveries` already records this.
  - [ ] Teams payload as an Adaptive Card when the address is a Teams or Power Automate URL.
- Backend: `Organization.ChannelNotificationKinds string[]`. `PipelineEvents.NotifyAsync(db, kind, text, href)` filters by kind. Read the last `WebhookDelivery` with `EventType == "notification"`.
- Libraries: none.

### Notifications table extras (Export, column chooser, density)  — REMOVE · S
- Where: `NotificationsPage.tsx:113-211` through `DataTable` defaults.
- Why: A spreadsheet of to-dos and a column chooser for four columns add three buttons of noise to a personal feed. No customer exports their notifications. They go away with the switch to a list layout.

## Cross-area notes
- **Candidate portal** (`features/candidate-portal/ApplicationParts.tsx:236-300`, `PortalHubs.tsx:89-170`): the candidate side of the same thread needs the same features: live updates and typing over the hub's `candidate:{id}` group, attachments, emoji, Seen receipts and a composer pinned at the bottom on phone. The portal's separate "Emails" tab (`ApplicationFrame.tsx:70,145-156`) should merge into Messages as small "We emailed you: Interview booked" entries in the thread, so the candidate has one place. The portal is also where the candidate's time zone should be recorded.
- **Applications** (`ApplicationShell.tsx`, `ApplicationRecord.tsx:46-57`): the Messages tab renders the shared `Thread`. The record's right rail should not repeat email and phone if the header shows them. Notes (`ApplicationNote`) need @mentions to feed the "Mentioned" notification. Keep notes separate from the candidate thread.
- **Dashboard** (`DashboardEndpoints.cs:92-118`): the unread messages and stalled widgets should link to `/messages?thread=` and `/messages?folder=assigned`, and stop being the data source for /notifications.
- **Interviews**: every interview email uses `{StartsAt:u}` (UTC, machine format). Move them to templates with `{{interviewTime}}` in the candidate's time zone. Interview reminders an hour before are promised in the notification settings, but the interviews area must create them.
- **Workflows (Preview)**: owns "after N days or on stage change, send template X". It must use this area's template library and `EmailTemplates.QueueAsync`, which replaces sequences.
- **Candidates and Pipeline**: add an "Email" bulk action to the Candidates `DataTable` and the pipeline selection, opening the bulk email drawer.
- **Shared editor**: there are two Plate stacks: `components/plate/document-editor.tsx` (Notion-style, used by interview kits) and `components/editor/PlateMarkdownEditor.tsx` (toolbar, used by job postings and posting templates). Consolidate on `components/plate`, with kits per use: `DocumentKit`, `PostingKit` and `EmailKit` (composer and templates).
- **Shared components**: `components/messages/Chat.tsx` needs a status line (Scheduled, Sending, Sent, Delivered, Seen, Failed with retry), an author avatar for team messages, a channel icon (email or portal), file cards and a "show quoted text" toggle. `ConversationRow` needs assignee, job chip, attachment and snooze icons. Update the `/design` gallery. `components/ui/split-view.tsx` should give `main` a real `minWidth` and clamp `side` to the space available, so the side pane can never overlap the main pane.
- **RBAC**: the existing `Permissions.Templates` gates automatic emails. Saved replies need "Manage shared saved replies". Interviewers keep no inbox. The inbox endpoint must apply the same `CanManage(requisition)` rule as the thread endpoints.
- **Settings IA** (`AdminShell.tsx`): rename "Email delivery" to "Email", point "Email templates" at `/messages/templates?tab=automatic`, and make the "Notifications" nav label match the page title ("Team notifications"). Branding fields (logo, brand colour) used in emails live with the candidate portal settings.

## Build order
1. **Quick fixes, no new model (S, about 1 day):** fix the missing sample values in template preview (`ConfigurationEndpoints.cs:169`). Replace `{StartsAt:u}` with formatted local times. Remove the disabled Attach and Formatting buttons. Point the notification "Reply" link at `/applications/{id}/messages`. Add the portal link to the staff-message email. Add an unsaved-changes guard to the template editor. Handle `email.failed` and `email.suppressed`.
2. **Thread model and real inbox (L):** `ApplicationMessage` fields, `MessageThreadState`, the `Application` thread columns, `GET /api/inbox`, paged messages. Rebuild `/messages` on real data with the fixed three-pane and phone layout. The application tab renders the shared `Thread`. Delete the Preview inbox, sample data and badge. Add Sent, Delivered and Seen states and the context rail with actions. Depends on 1.
3. **Reply by email (L):** Reply-To token, threading headers and stable subject. Resend inbound through `email.received`, reply parsing, matching and the Unmatched list. Staff reply-by-email. This is the largest trust gap: candidate replies are lost today. Depends on 2.
4. **Composer and template library on Plate (L):** `EmailKit` (formatting, detail chips, `#` templates, emoji), Markdown storage and Markdig HTML, attachments, scheduled send, undo send, AI draft. One template library at `/messages/templates` (saved replies plus automatic emails), merging the Preview templates, then test send, versions and per-job override lists. Move the hard-coded emails into templates. Depends on 2. Attachments in email also need 3's sender changes.
5. **Live updates (M):** SignalR hub, groups and pushes from endpoints and the webhook. Typing, collision and live badges in the inbox, thread and portal. Route `/api/hubs` past the Next proxy in production. Depends on 2. Can run beside 4.
6. **Notification feed, bell and settings (L + M):** the `Notification` entity and `Notify` helper, the feed page as a list, the bell as its popover, the settings matrix, digests and the daily stalled summary. Depends on 5 for live badges, but works without it.
7. **Shared-inbox tools (M):** assignment (with notifications from 6), snooze, Done and star semantics, full-text search, filters and the full shortcut set. Depends on 2 and 6.
8. **Bulk email (M):** drawer from the Candidates and Pipeline selections, per-recipient preview, skip list. Depends on 4.
9. **Email settings and branding (M + S):** sent-email log with retry, blocked addresses, sending and reply domain setup through the Resend Domains API, sender name format, open tracking, logo and signature in the layout. Depends on 3 for the reply domain and on the portal area for the logo.
10. **Team notifications (S):** event choice, links back to records, delivery status, Teams Adaptive Card. Depends on 6's event kinds.

## Progress (wave 1)

Finished:
- **Messages inbox (`/messages`)**: rebuilt on real data. `GET /api/inbox` (folder, search over names, jobs and every message body, offset cursor) lists one row per application thread the viewer can manage. Three panes at full height (list 300 to 340px, thread, details rail closed by default below 1600px and overlaid when the card is narrower than 1100px); phones get the list, then the thread with Back. The first conversation opens by itself on desktop; an empty folder says so once, in the reading pane. Deep links: `/messages?thread=<applicationId>`. Preview inbox, `sample-messages.ts` conversations, `MessagesShell`, the Preview badge and alert are deleted; the sidebar item lost `preview` and shows a live unread count.
- **Application Messages tab**: renders the same `Thread` (no header, no rail) at screen height; `r` focuses the reply.
- **Folders**: Inbox, Unread, Starred, Awaiting reply (was Sent; `/messages/sent` redirects), Done (`/messages/archived` redirects), plus Unmatched email for admins and recruiters. Folders sit in a menu in the list header instead of a second sidebar. Badge only on Inbox (unread for me). "Mark all as read" in the same menu.
- **Star, Done and Mark unread**: star and unread are per person (`MessageThreadState`); Done is shared (`Application.ThreadDoneAt`) and reopens when the candidate writes. `PATCH /api/applications/{id}/thread`.
- **Keyboard shortcuts**: j, k, r, e, s, u, c, ⌘F, Esc (phone back), ? opens a shortcut sheet; ⌘Enter sends.
- **Context rail**: stage changer, Schedule interview (links to the interviews tab), Reject (`RejectModal`), next interview, contact details, source, other applications (open their threads). No repeated name or avatar.
- **New message**: "To" is a `SearchSelect` over open applications (`GET /api/inbox/recipients`); choosing one opens the thread with the full composer. Blocked threads (unconfirmed, do not contact) show the reason instead of the composer; bounced addresses show a warning.
- **Composer**: plain text up to 10,000 characters (count shown only near the limit), ⌘Enter sends, draft kept per thread in this browser, emoji picker, files (button, drag and drop on the thread, paste), disabled Attach and Formatting buttons gone.
- **Attachments**: `POST /api/applications/{id}/messages/attachments` (PDF and Word, 10 MB each, 10 per message) on `Attachment` with `MessageId` and `Kind = Other`; removing a file before sending deletes it. Files show as cards with download in both directions, appear in the candidate's files, and go out as real email attachments (link-only above 25 MB in total).
- **Emoji**: `EmojiPicker` in `components/ui` (searchable, `@emoji-mart/data` loaded on first open), demo in the gallery. Ready for the portal composer.
- **Read receipts and delivery status**: team bubbles show author name, then Sending, Sent, Delivered, Opened, Seen (candidate read it in the portal) or Email bounced / Email not sent in red. Incoming email replies say "by email" and "from x@y" when the sender is not the candidate.
- **Reply by email**: the candidate copy comes from "Avery at Acme", with `Reply-To: reply+{token}@{Resend:InboundDomain}`, a stable subject ("Your Software Engineer application at Acme"), `In-Reply-To`/`References` to a per-thread reference, and a footer linking to the portal thread. `email.received` on the existing `/public/webhooks/resend` fetches the email and files from Resend's Receiving API, strips quotes and signatures with `EmailReplyParser` ("Show full email" keeps the original), matches by token, then thread reference, then a sender with exactly one open application, deduplicates on the provider id, and reopens Done. The recruiter's alert carries their own reply token, so a reply from their mailbox posts as them and is emailed to the candidate; anyone else using it lands in Unmatched. Unmatched email can be attached to a thread or discarded. Development: `POST /public/webhooks/resend/test-inbound` (Development only). Settings: `RESEND_INBOUND_DOMAIN` / `Resend__InboundDomain`.
- **Live updates (real-time)**: `InboxHub` at `/api/hubs/inbox` (SignalR), staff by cookie and candidates by portal token (`access_token`), groups `staff`, `application:{id}`, `candidate:{id}`. Endpoints and the webhook push `threadChanged` (ids only; clients refetch); `typing` shows "Avery is typing…". Inbox, thread, application tab and the sidebar badge update live and refetch after a reconnect.
- **Email sender**: `EmailOutboxItem` gained `FromName`, `ReplyTo`, `ThreadReference`, `AttachmentIds` and one generated text file (`InlineFileName`, `InlineFileContentType`, `InlineFileText`, for example an interview's `.ics` with `text/calendar; method=REQUEST`). `IEmailSender.SendAsync` takes an optional `EmailExtras`.
- **Resend delivery webhook**: `failed` and `suppressed` are final states; `suppressed` blocks the address like a bounce; delivery changes push live.
- **Template preview** (quick fix): every variable has a sample (`portalLink`, `roundMessage`, `candidateName`, `approvalLink`, `scorecardLink`, plus a readable fallback for new ones) and the text runs through `Tidy`.
- **Template library** (quick fix only): unsaved-changes guard when switching emails or jobs and when leaving the tab.
- **Notifications page** (quick fixes): "Reply" opens `/messages?thread=`; "Write" opens `/applications/{id}/scorecards?interview=`.

Started, not finished:
- Saved replies stay a Preview on browser storage (`features/preview/messages/sample-templates.ts`) until the wave 2 template store; the inbox composer has no Template button yet.
- Assignment, snooze, the "Assigned to me" and "Unassigned" folders, undo for Done and bulk select wait for wave 2 (they need the notification table).
- Conversation search uses `ILIKE`; the full-text index and highlighted snippets are still to do.
- Scheduled send, Draft with AI, Markdown and Plate formatting, collision warnings ("Sam is viewing") and desktop alerts are not built.
- The candidate portal still renders its own thread; the portal builder can join the hub with the session token and use `EmojiPicker`.

## Progress (wave 2)

Finished:
- **Template library and automatic emails**: one library at `/messages/templates` with two tabs, Saved replies (personal or shared with the team) and Automatic emails (grouped To candidates and To your team, each with when it is sent, whether it was changed, how many jobs have their own wording, and who edited it last). The Preview saved templates (`features/preview/messages/*`) and `/admin/email-templates` (`AdminEmailTemplates`, `EmailTemplateEditor`) are deleted; `/settings/templates/email` redirects to the Automatic tab. `EmailTemplate` gained `Kind`, `Name`, `Category`, `OwnerEmail`, `CreatedAt`, `UpdatedBy`; `Key` is null for saved replies. API: `/api/templates` (list, get, create, save, delete or reset, versions, restore, preview, test).
- **Template editor**: its own page with breadcrumbs; subject plus the shared `PlateMarkdownEditor` with `chips={{ details }}` and an "Insert detail" menu (plain labels such as "First name"); editor and live preview side by side from 1280px; unsaved-changes guard; sticky save bar.
- **Template details (placeholders)**: one registry on the server (`EmailTemplates.Details`, key, label, example), served with the library. `{{stage}}` fills with the stage's candidate label, never the internal name. One style everywhere, `{{camelCase}}`; the old `{{first_name}}` style is read as `{{firstName}}` and saved that way. Unknown details are refused on save with a plain message.
- **Template preview**: server-rendered with sample details or "Preview as" a real application (details with no real value are listed in amber), desktop and phone widths, a frame that sizes to the email, and the careers brand.
- **Template versions**: `EmailTemplateVersion` row on every save, restore and reset; a History drawer lists versions, shows each one, and "Restore this version" saves it as a new version. Numbers keep counting across resets.
- **Send a test email**: "Send me a test" in the editor sends to the signed-in person with "[Test]", 10 an hour.
- **Per-job wording**: job picker in the editor header; the organization wording lists the jobs with their own wording, with links.
- **Email layout**: bodies are Markdown, rendered by Markdig (`DisableHtml`, only http, https and mailto links, inline styles for mail apps) inside the branded layout; mentions `[Name](mention:key)` show as plain names; the text part spells out links.
- **Hard-coded emails** (this area's files): the message copy (`message`), the team alert (`message-alert`), the withdrawal confirmation (`withdrawal-confirmed`), the interviewer cancellation on withdrawal (`interview-team-update`) and the recruiter's withdrawal email (now a notification) use templates. The message email now carries a one-click signed portal link (`CandidateLinks.CreateAsync`). Defaults also exist for other areas' emails so they can switch: `application-received`, `application-already-applied`, `application-confirm-reminder`, `portal-code`, `document-request`, `interview-booked`, `interview-rescheduled`, `interview-cancelled`, `interview-no-show`, `interview-choose-time`, `interview-team-update`, `member-invited`, `notification`, `digest`. Server API for them: `EmailTemplates.QueueAsync(db, key, requisitionId, recipient, details, applicationId, ct)` or `EmailTemplates.RenderAsync(db, key, requisitionId, details, ct)`.
- **Composer**: the same Plate editor (no headings in messages), Template button with search, `#` on an empty line for saved replies, detail chips filled in for the candidate when sent (an unknown detail blocks the send), emoji, files, Draft with AI (`POST /api/applications/{id}/messages/draft`, last 5 messages, hidden when AI is off), Send later (Later today, Tomorrow morning, Next Monday or a picked time), and Undo for 10 seconds (the outbox waits; `DELETE /api/messages/{id}` returns the text and files to the box). Scheduled messages show "Sends Tomorrow, 9:00 AM" with Send now and Cancel and edit, sit in a Scheduled folder and stay hidden from the candidate until sent.
- **Notifications page (`/notifications`)**: a real feed on `Notification` with Unread and All tabs, mark read (one or all), deep links, older pages. Events: candidate wrote (assignee, else the job's recruiter), mention (`Notify.MentionAsync`, called from `Mentions.RecordAsync`), assigned, approval requested and scorecard due (from the `approval-request` and `scorecard-reminder` templates), interview in an hour, snooze ended, candidate withdrew, and the daily "gone quiet" summary. `Notify.AddAsync` follows each person's settings and pushes `notificationsChanged` over the hub after save.
- **Header bell**: `NotificationBell` is a popover on the same feed (8 latest, Mark all as read, Open notifications) with a live count (9+).
- **Notification settings (`/settings/notifications`)**: per person and per kind, In the app, Email right away and In the daily summary; saves on each click with rollback. The daily summary goes out once a day after quiet hours end; the stalled summary is one notification per recruiter per day instead of one email per application.
- **Assignment**: owner per thread (`Application.AssigneeEmail`), set from the thread header or `a`, checked against the job (same rule as opening it, team limits included), assign on reply, a notification for the new owner, Assigned to me and Unassigned folders, initials on list rows. With nobody assigned, candidate messages go to the job's recruiters on its hiring team (`RequisitionMember`).
- **Snooze**: Later today, Tomorrow morning, Next Monday or a picked time, or `h`; a Snoozed folder; a candidate reply ends it; the worker brings it back and tells whoever snoozed it.
- **Star, Done and Mark unread**: Undo in the Done toast; bulk select (hover checkbox, `x`, Shift and click for a range) for Done, Move to inbox, Mark read, Mark unread and Assign (`POST /api/inbox/bulk`).
- **Conversation search**: Postgres full-text search over message bodies (a generated `tsvector` with a GIN index), plus names, emails, jobs and file names; results show the matching words highlighted.
- **Bulk email**: `BulkEmailDrawer` (`features/messages/BulkEmailDrawer.tsx`) with a saved reply to start from, per-person preview ("3 of 28 · Karen"), the skip list (do not contact, bounced, no email, unconfirmed, a detail with no value) and Send or Send later. `POST /api/messages/bulk/preview` and `/api/messages/bulk` take `applicationIds`, `candidateIds`, `filter` (the Candidates list's query string for "everyone matching") or `poolId`, up to 500 people; each application gets a message in its own thread, a person with no job gets a direct email that replies to the sender.

Not done:
- **Email settings** (sent-email log, blocked addresses, domain status, sender name format) and **Team notifications** event choice and links (steps 9 and 10).
- Interviews, candidate-facing, evaluation, reports and platform emails still build their own text; the coordinator hands each call site its template key.
- Fallback text per chip (`{{firstName|there}}`), word diffs between versions, desktop alerts and "Sam is viewing" collision warnings.
- The subject field is still a plain text box, so its details show as `{{jobTitle}}` (the body uses chips).

## Progress (wave 3)

Finished:
- **Hard-coded emails (interviews)**: `InterviewMailer` sends every interview email from the template store. Candidate side: Scheduled or Booked use `interview-booked`, Rescheduled or CalendarMoved `interview-rescheduled`, every cancel `interview-cancelled`, NoShow `interview-no-show`; each interviewer gets `interview-team-update` with `title` (Interview, Booked, New time, Cancelled), `interviewDetails` and `link`. A loop's itinerary uses `interview-booked` (its "interview" is the "interview day"); the self-scheduling link and its reminder use `interview-choose-time` (its standard wording now has `{{interviewDetails}}`: length, choice and when the link closes; reminders add "Reminder:" to the subject). `interviewTime` is `TimeText.Range` in the reader's zone; `interviewDetails` holds when, who, how to join and the calendar link. The `.ics` attachment and the one-click portal link (`#interviews`) stay. Outbox rows now carry `TemplateKey` and `TemplateVersion`.
- **Hard-coded emails (candidate-facing)**: `ApplicationIntake` (`application-received`, `application-already-applied`, `application-confirm-reminder` with `confirmLink` and `code`; the old `Compose` is gone), the portal sign-in code (`portal-code` with `code` and `signInLink`) and document requests (`document-request` with `documentName`, `note` and the `#documents` portal link; `DocumentRequestEmail` is gone).
- **Assessment emails**: `assessment-invite` and `assessment-reminder` are in `EmailTemplates.Defaults` with the details `assessmentName`, `dueDate` and `timeNote` registered; `AssessmentFlow` sends both from the template store and its hard-coded `Fallback` wording is deleted.
- **Notifications from other areas**: an offer accepted or turned down tells the job's recruiters and the conversation's owner (`offer-response`, never the person who recorded it), and posts to the team channel; a finished spreadsheet import tells the person who ran it (`import-finished`, not for a dry run).
- **Bulk email entry points**: "Email" in the Candidates selection bar (the chosen people, or "everyone matching" as the list's filter), "Email everyone in this pool…" in a pool's ••• menu, and "Email" in the pipeline's selection bar (board and list share it; application ids), each shown when `useAbility().can('send', 'Message')`. Fixed: the drawer previewed "everyone matching" and pools but sent only ids; preview and send now share one body (`bulk-recipients.ts`).
- **Portal thread**: team messages render as Markdown (`MessageBody` in `components/messages/Chat.tsx`, shared with the staff thread), the "We emailed you" notes render their Markdown, and conversation previews are plain lines (`plainPreview` moved to `inbox-format.ts`).
- **Subject line with detail chips**: `PlateMarkdownEditor singleLine` (one line, no Markdown, `{{key}}` in and out through `components/editor/single-line.ts`) and `SubjectField` in `features/templates/editor-tools.tsx`, used by the template editor and the bulk email drawer. Read-only subjects show chips too.
- **Email settings (`/settings/email`)**, three tabs in the settings registry (`/admin/email` now lands here):
  - Sending: what is set up, from the server's settings, in plain words with the setting names to pass on (`RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET` with the webhook address to copy, `RESEND_INBOUND_DOMAIN`), the sending domain's SPF and DKIM step, and "Check again". Hidden on managed hosting. Sender name: "Avery at Acme" or "Acme hiring team" (`Organization.SenderNameFormat`, used by thread messages and bulk email).
  - Sent emails: every outbox row, newest first, with search (address or subject), a status filter (Failed, Bounced, Scheduled), statuses in plain words (Scheduled, Sending, Retrying, Sent, Delivered, Opened, Bounced, Failed), older pages, and a drawer with who, from, reply address, files, the error and the text. Send again (failed, refused for a blocked address) and Cancel (scheduled; conversation messages are cancelled in their conversation). Sign-in code emails show no text; one-click sign-in and approval links are hidden. Admins only.
  - Blocked addresses: candidates whose email bounced, was marked as spam or refused, with why and since when, and "Allow again" (with a confirm).
- **Team notifications (Slack or Teams)**: `TeamChannelSettings` replaces the old card on Reminders and alerts. Choose which events post (offer answers, withdrawals and bounces on by default; bookings, candidate messages and the daily quiet summary off), every post links back to the record, Slack gets blocks with a button, Teams and Power Automate addresses get an Adaptive Card, others plain text. The last post's result shows under the address ("Last post 5 minutes ago" or the failure), and the test message goes out after saving. `Organization.ChannelNotificationKinds`; `PipelineEvents.NotifyAsync(db, text, ct, kind, href)` keeps its old signature working (no kind always posts).
- **Reminder sweep fixed and split**: the daily summary's "start of today" went to Postgres with the organization's offset (for example -06:00), which Npgsql refuses, so the whole reminder sweep failed every 5 minutes and the stale, booking, scorecard and approval reminders never ran. `NotificationSweep.DayStart` is now UTC, and `EmailOutboxWorker` runs each sweep in its own scope (`RunEachAsync`): one that fails is logged and the others still run.
- **Reminders moved to workflows**: the stale, booking and scorecard loops in `EmailOutboxWorker` and the assessment reminder in `AssessmentFlow.SweepAsync` are gone; the built-in reminder workflows send them, and `Workflows:BuiltInReminders` now defaults to true (code and `appsettings.json`). Approval reminders and the notification sweep stay in the worker. The Reminders page still copies its day counts to the organization because the daily summary, reports, the dashboard, feedback due dates and scheduling-link and approval reminders read them. A workflow's "Send email" step lists every automatic email whose details a workflow can fill (plus the assessment and scorecard reminders, which their areas build); emails that need a booking link, a sign-in code or an approval link are left out, and "Application received" (it needs a confirm link and code) is no longer offered. The team channel's "late scorecard or unbooked interview" choice is gone: those posts come from the reminder workflows' own steps.
- **Template wording**: `member-invited` says "Your role: {{role}}." instead of "as a {{role}}" ("as a admin"); no other template puts "a" or "an" before a detail.
- **Interview kits**: `InterviewKit.CandidateMessage` and `InterviewerMessage` are gone, with the same two unused fields on `KitTemplate`, the request fields, the seed's booking texts and the web model's fields.

Not done:
- Approval requests still post without a kind, so they always go to the channel: `ApprovalEndpoints.cs` (jobs area) should pass `kind: "approval-requested"` once a matching `TeamChannel.Events` entry is added, and an href to the approval.
- Domain checks through Resend's Domains API (live Verified or Pending per DNS record), open tracking as a switch, and the email layout preview: the page explains the steps instead.
- The setup checklist's "Turn on candidate emails" still points at `/settings/general` (`ConfigurationEndpoints.cs`); it should point at `/settings/email`.
- Fallback text per chip, word diffs between versions, desktop alerts and collision warnings (unchanged from wave 2).

## Progress (wave 4)

Finished:
- **Send later on automatic emails**: `EmailTemplates.QueueAsync(…, bodyOverride, sendAt)` returns the queued email's id (null when a team email became only a notification) and holds it until `sendAt`. The rejection path uses it; the workaround that looked up the row it had just added is gone. `SchedulingEndpoints.cs` and `WorkflowEngine.cs` still look up their rows the old way and can switch.
- **Offer letters from the template library**: the Automatic emails tab ends with an "Offer letters" row that opens Settings › Offer letters.
- **Email layout preview**: Settings › Email › Sending has "How emails look": the branded wrapper with a sample message, desktop and phone widths, and a link to Careers site for the icon and colour (through `POST /api/templates/preview`).
- **Pictures in emails**: our pictures (`/public/media/…`) get the organization's public address in the email HTML, a width and height scaled to the 512 px column (from `?size=` in the address) and `max-width:100%`; a picture from elsewhere over plain http is dropped. The text part shows a picture's description. Code blocks get a grey box. `EmailHtml.Wrap(company, markdown, brand, root)`. Saved replies and the message composer have pictures turned off (pasted files stay attachments); automatic emails and bulk email have them. Template saves refuse a picture without a description.
- **Approval stuck**: a separate `approval-stuck` notification kind ("An approval is stuck", on for the app and email) and team channel event ("An approval is stuck after every reminder", on by default); the escalation in `ApprovalEndpoints.cs` uses both.
- **Template history scope**: `GET /api/templates/{id}/versions` and `POST /api/templates/{id}/restore` now return 404 for a job's own wording to anyone who cannot manage that job (they read it before).
- Tests: `tests/server/MediaRenderingTests.cs` (pictures and code in email HTML and text), `tests/server/ApiFlow/EditorAndOfferWave4Tests.cs` (send later and the returned id, pictures refused without a description, the history scope with a recruiter not on a confidential job). Passing, with `TemplateRenderingTests` and the approval escalation test.

Not done:
- Domain checks through Resend's Domains API and open tracking as a switch.
- The setup checklist's "Turn on candidate emails" still points at `/settings/general`.
- Fallback text per chip, word diffs between versions, desktop alerts and collision warnings.
