# Interviews from scheduling to recording, transcript and review

Evidence: code read end to end (web `features/interviews`, the interview parts of `features/applications`, `components/calendar`, the calendar and reminder admin pages, the portal booking UI; API `Features/Interviews`, `Features/Public/PublicInterviewBookingEndpoints.cs`, `Features/Integrations`, `Integrations/*`, `Features/AI/{AiEndpoints,CopilotEndpoints}.cs`, `Infrastructure/{EmailOutboxWorker,AiAssistant,LocalFileStore}.cs`, `Domain/Interviews.cs`). I looked at every screenshot in the set. Most of them show empty states, so I also took populated shots from the running dev app with headless Chrome (read-only, nothing booked or saved). Those are in `scratchpad/audit/iv-shots/` (`d-prep`, `d-apptab`, `d-drawer`, `d-month`, `d-agenda`, `p-interviews`, `p-prep`, `p-apptab`).

## Overall
- **One interview, two half-pages, no address.** The interviewer's page (`/interviews/[id]`) has the kit, the resume and private notes. The recruiter's view of the same interview is a card buried in the application tab (`InterviewCard.tsx`). That card holds the meeting notes, recording, transcript and AI summary. Neither page links to the other. `/interviews/[id]` only works with `?application=`, because there is no `GET /api/interviews/{id}` (`interview-links.ts:1`). A bare link shows "Open this interview from the calendar" (screenshot `desktop-light_interviews_<id>.png`). The owner wants scheduling, the interview itself, the recording, the transcript and the review each on its own page. Today none of them has a page of its own.
- **Scheduling assumes a world without time zones or working hours.** Slots are computed 24 hours a day, 7 days a week (`UserCalendarService.cs:106-112`). Emails print times as UTC `2026-11-13 16:00:00Z` (`{StartsAt:u}` in `InterviewEndpoints.cs:185,199` and `PublicInterviewBookingEndpoints.cs:247,255,337,345`). The stored time zone is whatever browser the scheduler used (`ScheduleInterviewDrawer.tsx:84`). Interviewers are typed as comma-separated emails. If even one interviewer has not connected a calendar, the availability check returns nothing at all (`UserCalendarService.cs:92-93`).
- **Calendar sync has bugs that customers will see.**
  - Calendar sync can cancel real interviews on its own and email the candidate (`IntegrationOutboxWorker.cs:160,179-199`).
  - Every edit makes a duplicate personal-calendar event (`UserCalendarService.cs:117-162` ignores `ExternalEventId`).
  - A candidate rescheduling returns HTTP 500 (unique outbox index, `AtsDbContext.cs:331`, against `PublicInterviewBookingEndpoints.cs:348`).
  - "Google Meet link" is never created for personal Google connections (`UserCalendarService.cs:354-362` sends no `conferenceData`).
- **Recording, transcript and summary exist but fall apart on real interviews.**
  - Uploads above Kestrel's default 30 MB body limit fail, and screen video reaches that in a few minutes. `LocalFileStore.cs:80` promises 1 GB.
  - Transcription runs synchronously, refuses files over 25 MB (`CopilotEndpoints.cs:85`), and returns one block of text with no timestamps or speakers.
  - The AI summary is never saved (`InterviewCard.tsx:84,109`).
  - There is no playback page and no transcript search.
- **The calendar page spends space on repeats and its grid is drawn wrong.**
  - Hour labels drift 8px per hour. I measured them 46px apart against 54px rows, so the "5 PM" label sits next to 3:40 PM (`WeekCalendar.tsx:93`, `-mt-2` on every label).
  - Overlapping interviews draw on top of each other (`WeekCalendar.tsx:137-169`).
  - 30-minute blocks clip the candidate's name ("Blake Rivera" in the screenshot).
  - Four stat cards repeat the rail and each other ("Scheduled this week 3" and "Next 7 days 2").
  - On a phone, those four cards take about 470px before the calendar. The 640px-wide week grid then shows Monday to Wednesday only (`p-interviews.png`).
- **Statuses never move with time.** Interviews stay "Scheduled" forever. Seeded interviews from October 20 still show "Scheduled", the portal offers "Change time" and "Cancel" on interviews that already happened, and the calendar API returns only `Status == Scheduled` (`InterviewEndpoints.cs:47`). Proposed, completed, no-show and cancelled interviews vanish from every calendar view.

**Target experience.** Interviews becomes a hub of real pages:
- **Calendar** (`/interviews`): a calendar that shows status, with a "Needs attention" list for proposals, overdue feedback and calendar problems.
- **Scheduler** (`/interviews/schedule`): one wizard that finds times across interviewers' working hours and time zones, schedules a single interview or a panel loop, and sends one self-scheduling link instead of N emails.
- **Interview record** (`/interviews/[id]`) with tabs:
  - **Overview:** prepare, and see when, where and who.
  - **Room:** live kit, timer and per-question notes saved to the server.
  - **Recording:** player plus a speaker-labelled transcript you can search and click to seek.
  - **Summary:** saved AI summary that cites transcript timestamps.
  - **Feedback:** your scorecard, prefilled from your notes, and the panel's scorecards once yours is in.

Candidates book from a no-login link in their own time zone and get a real calendar invite. Every change (reschedule, cancel, no-show) tells the right people in their local time.

## Features

### 1. Interview calendar (Day, Week, Month)  — COMPLETE · M
- Where: `/interviews`. `features/interviews/InterviewsPage.tsx`, `features/interviews/MonthGrid.tsx`, `components/calendar/WeekCalendar.tsx`, `GET /api/interviews` (`InterviewEndpoints.cs:17-67`).
- Today: Day, Week and Month views with an interviewer filter. A click on an empty slot opens the schedule drawer, and a click on an event goes to the prep page. The view is kept in `?view=`. The "now" line works. Only `Scheduled` interviews are returned. Every event is blue (`InterviewsPage.tsx:258`).
- Design critique:
  - Hour labels drift. `-mt-2` on each 54px label accumulates, so the labels end up 46px apart (measured: 8 AM at y=436, 6 PM at y=896, while the 6 PM line is near y=984). The fix is one class: `-translate-y-2` instead of `-mt-2` at `WeekCalendar.tsx:93`.
  - Overlapping events are absolutely positioned `left-1 right-1` and hide each other.
  - The 28px minimum height clips the title of 30-minute events.
  - At 1440, the toolbar wraps to two rows. The title row is on the left; date, filter and view switch sit alone on a second row on the right (`InterviewsPage.tsx:349-421`).
  - Clicking an event navigates away. There is no popover with Join, Prepare, Reschedule and Cancel.
  - No time zone is shown anywhere on the page.
  - On a phone, the week grid needs sideways scrolling and hides Thursday to Sunday. Phones should open on the agenda.
- Product critique: Google Calendar, Ashby and GoodTime let you:
  - colour by status or interview type;
  - see proposed holds as dashed blocks;
  - see cancelled interviews (struck through, behind a toggle);
  - drag to reschedule;
  - switch between "Mine" and "Team".

  Recruiters here cannot see what is waiting on the candidate (Proposed). No-shows and cancellations disappear.
- Complete means:
  - [ ] Hour labels aligned. Overlaps laid out side by side (column packing, about 30 lines).
  - [ ] A 30-minute block shows the time and name on one line.
  - [ ] Events coloured by status:
    - Scheduled: blue.
    - Proposed: dashed outline, "Waiting for candidate".
    - Ended without outcome: muted.
    - No-show: red.
    - Cancelled: struck through, hidden unless "Show cancelled" is on.
  - [ ] Click opens a popover: candidate, job, interviewers, meeting link, and Join, Prepare, Reschedule, Cancel. Double-click or Enter opens the interview page.
  - [ ] "Mine / Team" toggle, defaulting to Mine for interviewers. Filters for job and interviewer (`SearchSelect`), saved in the URL.
  - [ ] A "Times shown in America/Chicago" line in the toolbar, with a switch to another zone.
  - [ ] Drag to move, for people who can manage, with confirm, notify and roll back on error.
  - [ ] One-row toolbar at 1440: arrows, range title, Today on the left; filters and the view switch on the right.
  - [ ] Phones default to Agenda. The week view shows 3 days with swipe.
- Backend:
  - `GET /api/interviews` returns all statuses, with `status`, `meetingLink`, `kitName` and `calendarStatus`.
  - Optional `status=` and `mine=true` filters.
  - `from` and `to` default to the current week, and a bad range returns 400 (see feature 35).
- Libraries: `react-dnd@16.0.1` is already installed (used by Plate). Reuse it for dragging events instead of adding a calendar library. FullCalendar `@fullcalendar/react@7.1.5` and `react-big-calendar@1.20.0` were rejected. The custom grid is 184 lines and needs three fixes. FullCalendar's per-interviewer resource view is a paid add-on, and both would fight the token styling.

### 2. Agenda list and "Needs attention"  — COMPLETE · M
- Where: `/interviews?view=agenda` (`InterviewsPage.tsx:422-458`, `DataTable` with export).
- Today: a date-range table of scheduled interviews with CSV export and a Prepare link.
- Design critique: the "Agenda" title stands alone above two date inputs, a filter and the segmented control. Interviewers show as raw emails. There is no status column. "Prepare" is the only action.
- Product critique: recruiters run their day from the exceptions. Greenhouse's "Interviews" and Ashby's "Scheduling" queue show candidates who have not booked yet, overdue feedback, interviewer declines and failed invites. None of that is visible here. Calendar failures appear only as a badge on each application card.
- Complete means:
  - [ ] Tabs with counts:
    - Upcoming.
    - Waiting for candidate: Proposed interviews or open scheduling links, with age and "Remind" and "Copy link".
    - Feedback overdue: team-wide, by interviewer, with "Nudge".
    - Needs a decision: ended interviews with no outcome.
    - Calendar problems: failed or declined invites, with Retry.
    - Cancelled and no-show.
  - [ ] Columns: When, Candidate (job on the second line), Interview, Interviewers as avatars with names and scorecard state, Status, row actions.
  - [ ] Bulk: send a reminder to the selected candidates or interviewers.
- Backend: the same list endpoint with a `queue=` parameter. "Remind" reuses the booking-reminder and scorecard-reminder templates.
- Libraries: none. `DataTable` and `SavedViews` already exist.

### 3. Stat cards on `/interviews`  — REMOVE · S
- Where: `InterviewsPage.tsx:305-345`.
- Why: "Today's interviews" repeats the rail card. "Scheduled this week" and "Next 7 days" mostly repeat each other ("3" and "2" in the screenshot). "Your scorecards due" belongs on the My feedback button as a `CountBadge`. The cards cost about 108px on desktop and a full phone screen (`p-interviews.png`), against the "Say it once" rule in `src/web/CLAUDE.md`. Delete them, and move the scorecard count onto the button.

### 4. "Today's interviews" rail card  — MERGE · S
- Survivor: an **"Up next"** rail on `/interviews`. It shows the next 3 interviews for me, with a countdown ("in 25 min"), a Join button when a link exists, and Prepare.
- What moves: the list from `InterviewsPage.tsx:492-544`. Drop the static "Scheduled" badge, which shows even after the interview ended (screenshot: the 10:00 AM card at 3:40 PM). The calendar-connection card (`:546-592`) moves to My settings (feature 16).

### 5. Interview record page `/interviews/[id]`  — COMPLETE · XL
- Where: `app/(workspace)/interviews/[id]/page.tsx`, `features/interviews/InterviewPrep.tsx`.
- Today: needs `?application=` because there is no `GET /api/interviews/{id}`. It loads the whole application and finds the interview. It shows When and where, Who (raw emails), the kit criteria, AI "Suggest questions", private notes in `localStorage`, and a resume side panel. Recording, transcript, meeting notes, summary and outcome actions are not here.
- Design critique:
  - The "Hide resume" X wraps under the card description, alone on its own line (`d-prep.png`, from `ResumeSummary` `CardHeader` action at `InterviewPrep.tsx:356-362`).
  - The status badge is violet, but the colour rule says blue means interview (`components/status.tsx:27`).
  - Interviewers show as `test@gmail.com` with a "T" avatar, not names.
  - A 10:00 interview at 3:40 PM still says "Scheduled", with no prompt to record an outcome.
  - The private-notes textarea (`:231-245`) says "saved in this browser". That is not a reassuring promise for an evaluation tool.
- Product critique: Ashby and Greenhouse give each interview a permanent URL used in calendar invites, emails and Slack. It shows logistics, the plan, live notes, the recording and feedback in one place, and its state changes as the interview moves from before to during to after. Here the link in the scorecard reminder email does not even exist.
- Complete means:
  - [ ] Works from `/interviews/[id]` alone. Every email, invite description and reminder links here.
  - [ ] Header:
    - candidate and job, both linked;
    - status badge that knows the time (Upcoming, Live now, Ended, Completed, No-show, Cancelled);
    - "in 2 h" or "ended 3 h ago";
    - actions: Join meeting, Reschedule, Cancel, and one primary that depends on state (Prepare, then Join, then Write scorecard).
  - [ ] `LinkTabs`: Overview · Room · Recording · Summary · Feedback. Tabs hide when they are not relevant yet (Recording before the start) or for your role (Summary for interviewers who have not submitted).
  - [ ] Overview:
    - when, in the viewer's zone and the candidate's zone;
    - where (meeting link with copy, or address);
    - who, with names, roles, RSVP state (accepted or declined) and scorecard state;
    - the kit and instructions;
    - the resume panel (`SplitView`, keep it);
    - an activity strip: scheduled by, rescheduled, invites sent.
  - [ ] An "Ended" banner after `endsAt` with "Mark completed", "Mark no-show" and "Reschedule".
- Backend:
  - `GET /api/interviews/{id}` (same scoping as `ScopeApplications`) returning the detail now projected inside `ApplicationEndpoints.cs:~260-345`.
  - Move that projection into one shared method, so the application endpoint and this one cannot drift.
- Libraries: none.

### 6. Application "Interviews" tab and `InterviewCard`  — MERGE · M
- Survivor: the interview record page (feature 5).
- What moves:
  - Meeting notes, recording, transcripts and the AI summary leave `InterviewCard.tsx:221-279` for the interview page's Room, Recording and Summary tabs.
  - The tab (`ApplicationInterviews.tsx`) becomes a compact **rounds list**: kit name, status, when, interviewer avatars with scorecard ticks, a "Open interview" link, and the ••• menu (Reschedule, Cancel, Mark no-show).
  - Un-booked rounds from the job's interview plan show as "Not scheduled" rows with a Schedule button. Greenhouse's "Interview plan" works this way.
- Also:
  - The card repeats the kit criteria already on the prep page.
  - It shows the jargon badge "Calendar not configured" to managers (`InterviewCard.tsx:36-45,128-133`). Show only "Invite failed" when it matters.
  - The tab's empty state adds a second primary "Schedule interview" under the header's primary (screenshot). Make the empty-state button `variant="soft"`.
  - The rail's "Next interview: Nothing scheduled · All interviews →" links to the tab you are already on.

### 7. Scheduling form (drawer on `/interviews` and modal on the application)  — MERGE · L
- Survivor: one full-page **scheduler** at `/interviews/schedule?application=…` using `Wizard` (`components/ui/wizard.tsx`). Edit and reschedule open the same wizard at the "When" step. Delete `features/applications/InterviewModal.tsx`. `ScheduleInterviewDrawer.tsx` is folded in.
- Today:
  - The two forms disagree. The drawer has candidate search, a kit-driven duration, "How to book" and a free-slot dropdown, but hardcodes `meetingLink: null` (`ScheduleInterviewDrawer.tsx:89`). The modal has a meeting link field but no availability.
  - Both take interviewers as comma-separated emails and the time zone from the browser.
  - The drawer defaults to 10:00 today even when that has passed (`:26-34`).
  - The candidate list caps at 100 people (`:39`).
  - The slot dropdown is 7 days × 48 half-hours, around the clock (`:224-248`).
- Design critique (`d-drawer.png`):
  - The label styles mix: "Candidate" above, everything else inset.
  - The suggested-times picker sits *below* the start and end fields it overwrites.
  - With one unconnected interviewer it says "No time works for everyone", which is false. Nothing is known.
  - "How to book" is a select of two sentences that changes the whole flow.
- Product critique: Ashby, GoodTime and Greenhouse show an availability grid: interviewers as rows, a week of working hours as columns, free and busy shading, and suggested slots ranked. You can then book now, or send times or a link. Here the recruiter guesses, then reads a dropdown.
- Complete means:
  - [ ] Step 1, Who and what:
    - candidate and application (`SearchSelect` against the server, no 100 cap);
    - round(s) from the job's interview plan, which sets the kit, duration and default interviewers;
    - interviewers from a people picker (feature 8).
  - [ ] Step 2, When:
    - an availability grid for the next 2 weeks in the scheduler's zone, with a zone switcher;
    - free and busy shading per interviewer, unknown for those without a calendar;
    - top 5 suggested slots;
    - working hours, buffers and load respected (features 9 and 11).
  - [ ] Step 2 offers three ways to book:
    - "Book a time now";
    - "Offer specific times", 1 to 5 picks sent in one email;
    - "Send a scheduling link" (feature 14).
  - [ ] Step 3, How:
    - meeting type: Google Meet, Teams, Zoom, phone, on-site with address, or custom link;
    - candidate message, prefilled from the kit's `CandidateMessage`;
    - "Notify candidate" and "Notify interviewers" toggles.
  - [ ] Step 4, Review: what each person receives, previewed in *their* time zone.
  - [ ] Reschedule adds a required reason and "Notify everyone" (on by default).
- Backend:
  - `ScheduleInterviewRequest` gains `meetingType`, `location`, `notifyCandidate`, `notifyInterviewers` and `candidateTimeZone`.
  - A new `POST /api/scheduling/suggestions` returns ranked slots per round.
  - `PATCH /api/interviews/{id}` gains `reason` and `notify`.
- Libraries: none. The grid is the existing `WeekCalendar` with a row per person.

### 8. Interviewer picker and people directory  — COMPLETE · S
- Where: `ScheduleInterviewDrawer.tsx:210-217`, `InterviewModal.tsx:105-110`. The only user list is `/api/admin/users`, which is admin-only (`AdministrationEndpoints.cs:222`).
- Today: free-text emails. The server lower-cases them but never checks they belong to a user. A typo silently creates an interviewer who never gets access, and `personalConnection` lookups use the un-normalized request emails (`InterviewEndpoints.cs:291-294`).
- Product critique: every competitor picks people by name, with role, time zone, today's load and calendar status next to each name.
- Complete means:
  - [ ] `SearchSelect`, multi-select, by name. Each option shows avatar, name, title, time zone, "3 interviews this week" and calendar connected or not.
  - [ ] External interviewers can still be added by email, flagged "Not a member".
  - [ ] Default interviewers come from the round.
- Backend: `GET /api/people?query=` for hiring staff (id, name, email, role, timeZone, calendarConnected, interviewsThisWeek). Validate interviewer emails on POST and PATCH against active users, or mark them external.
- Libraries: none.

### 9. Availability engine (time zones, working hours, buffers)  — COMPLETE · M
- Where: `UserCalendarService.FindCommonAvailabilityAsync` (`Integrations/UserCalendarService.cs:73-115`), `GET /api/calendar/availability` (`CalendarConnectionEndpoints.cs:70-96`), the public availability endpoint (`PublicInterviewBookingEndpoints.cs:15-61`).
- Today:
  - Slots are generated around the clock, so a 3 AM Saturday slot is valid.
  - If any interviewer has no connection, it returns zero slots.
  - Interviews already booked in MyThorneAI but not yet on the calendar are not treated as busy.
  - There is no minimum notice. The public window starts at the *proposed* date, which may be in the past (`:48`).
  - Any signed-in user can read anyone's free and busy times by email (`CalendarConnectionEndpoints.cs:70`, no policy).
- Product critique: Calendly and GoodTime respect each person's working hours and zone, a minimum notice (for example, 24 h), buffers between interviews, a daily cap, and holidays. Partial knowledge is shown honestly as "2 of 3 calendars checked".
- Complete means:
  - [ ] Each interviewer's working hours and time zone (feature 10) bound the slots. The candidate side can add "no earlier than 8 AM my time".
  - [ ] MyThorneAI's own Scheduled and Proposed interviews count as busy.
  - [ ] Buffers before and after, a minimum notice and a daily cap per person.
  - [ ] Unknown calendars do not zero the result. Slots come back with `confidence` ("everyone checked" or "Priya not checked").
  - [ ] Results are capped and grouped by day, about 20 to 40 per week, not 672.
  - [ ] The free and busy endpoint requires the ManageHiring policy.
- Backend: the same service, with a pure slot function that leaves one runnable check behind (zones, a DST edge, buffers). `TimeZoneInfo` handles IANA zones on Linux and macOS.
- Libraries: none. Use native `TimeZoneInfo` on the server and `Intl.DateTimeFormat({ timeZone })` on the web. `Intl.supportedValuesOf('timeZone')` already feeds the zone list in `AdminSettings.tsx`.

### 10. My availability and time zone (My settings)  — COMPLETE · M
- Where: none exists. `/settings/preferences` (`features/admin/MySettings.tsx:90-196`) holds theme, density, start page and table reset, all in `localStorage`. `AppUser` has no time zone (`Domain/Users.cs:3-12`). Only `Organization.TimeZone` exists.
- Product critique: Calendly's "Availability" page and Ashby's interviewer profile set weekly hours, zone, date overrides and interview limits. Without them, feature 9 has nothing to respect.
- Complete means:
  - [ ] New `/settings/calendar` "Calendar and availability" page in the My settings `SectionNav`, holding:
    - the calendar connection (moved from `/interviews`, feature 16);
    - time zone (auto-detected, editable);
    - weekly hours per weekday (two `<Input type="time">` per day, plus "Add another range");
    - date overrides (out of office);
    - maximum interviews per day and per week;
    - buffer minutes.
  - [ ] Preferences links here. Preferences itself is out of scope.
- Backend: `AppUser.TimeZone`, `AppUser.WorkingHoursJson` (weekday to ranges), `MaxInterviewsPerDay`, `MaxInterviewsPerWeek`, `BufferMinutes`. `GET/PUT /api/me/availability`. One migration.
- Libraries: none. Use native time inputs.

### 11. Interviewer load  — COMPLETE · M
- Where: none.
- Product critique: Ashby and GoodTime balance load across a pool of trained interviewers, so the same three engineers do not run every screen. Here there is no count, cap, pool or rotation.
- Complete means:
  - [ ] The people picker and the availability grid show this week's interview count against the person's cap. Suggestions rank lower-loaded people first.
  - [ ] A round can name a **pool** ("any 1 of these 5") instead of fixed people. The scheduler picks the least-loaded free person.
  - [ ] A "Team load" view under Reports (cross-area): interviews per person per week.
- Backend: `InterviewKit.InterviewerPoolEmails[]` and `PoolPickCount`. Load is computed from `Interviews` (no new table). The cap comes from feature 10.
- Libraries: none.

### 12. Panel and multi-round (loop) scheduling  — COMPLETE · L
- Where: none. One POST creates one interview. Kits have `SortOrder` and `DurationMinutes` (`Domain/Interviews.cs:33-47`), which is already an interview plan in all but name.
- Product critique: Greenhouse and Ashby schedule an "onsite": 3 or 4 back-to-back sessions with different panels, found in one search and sent as one itinerary. Here a recruiter repeats the form 4 times and the candidate gets 4 emails.
- Complete means:
  - [ ] In the scheduler, select several rounds. "Find times" returns back-to-back sequences (with optional breaks) where each round's panel is free.
  - [ ] One itinerary email and one .ics per round. The candidate sees a single "Onsite, Thu 14 Nov" card with the sessions inside.
  - [ ] The rounds list (feature 6) groups sessions that belong to one loop.
- Backend: `InterviewLoop` (id, applicationId, createdBy) and `Interview.LoopId`. A sequence search over the per-round slot sets. `POST /api/applications/{id}/interview-loops`.
- Libraries: none.

### 13. "Let the candidate confirm this time" (Proposed interviews)  — MERGE · S
- Survivor: scheduling requests and links (feature 14). "Offer specific times" becomes one request holding 1 to 5 times.
- Why:
  - Each proposed time is its own `Interview` row, and *each* POST queues a "booking-request" email (`InterviewEndpoints.cs:162-179`). Three offered times means three emails.
  - The same block also emails interviewers "Interview assignment" for times that may never happen (`:193-201`).
  - Proposed times put no hold on interviewers' calendars, so they get double-booked.
  - Booking one cancels **every** Proposed interview on the application, including other rounds (`PublicInterviewBookingEndpoints.cs:208-216`).
  - Moving the application to a stage literally named "Booked" is a magic string (`:227-229`).
  - The portal shows each offered time as a separate card with the same title.
- What moves: the `Proposed` status is replaced by `SchedulingRequest.OfferedSlots`. Booking sends one confirmation and ties the auto stage move to a stage *setting*, not a name.

### 14. Candidate self-scheduling links  — COMPLETE · L
- Where: today only through the portal (sign in with an emailed code), "Find another time" (`ApplicationParts.tsx:57-207`), `GET …/availability` and `POST …/book`.
- Today:
  - The candidate must sign in to the portal first.
  - "Find another time" lists every free half-hour for 14 days as full-width buttons (`Slots`, `ApplicationParts.tsx:209-231`).
  - Times show in the browser zone with no label.
  - Any unconnected interviewer gives "There are no other times open right now".
  - The server takes the duration from the *request*, so a candidate can book 5 minutes or 8 hours. With any calendar missing, it accepts any time at all (`PublicInterviewBookingEndpoints.cs:177-207`).
- Product critique: Calendly, Greenhouse and Ashby send a tokenized link with no sign-in. It shows a month calendar on the left, the day's times on the right, a time zone selector auto-detected from the browser, interviewer names and photos, duration and format. After booking it gives a confirmation page with "Add to Google, Outlook or Apple calendar", and later reschedule and cancel links.
- Complete means:
  - [ ] Recruiter: "Send a scheduling link" in the scheduler, with a window (for example, next 10 business days), minimum notice, round(s), pool, and expiry. "Copy link" lives in the Needs-attention list.
  - [ ] Candidate page `/book/[token]` (public, no sign-in, rate-limited like `public-candidate`):
    - company brand, job, interview name, duration, format, interviewers;
    - a month picker, then the day's times in the detected zone, with a zone switcher;
    - a confirm step with an optional note.
  - [ ] Confirmation page plus email with .ics and "Add to calendar" links. Reschedule and cancel links reuse the token.
  - [ ] The portal Interviews page shows the same request and opens the same picker.
  - [ ] The server validates the chosen slot against the request (duration, window, live availability), and the booking is idempotent.
- Backend:
  - `SchedulingRequest`: id, applicationId, kit(s), interviewers or pool, duration, window, minNotice, offeredSlots[], tokenHash, expiresAt, status, bookedInterviewId.
  - `GET /public/scheduling/{token}`, `GET …/slots?from&to&tz`, `POST …/book`.
  - Reminder sweep switches from Proposed interviews to open requests (`EmailOutboxWorker.cs:150-188`).
- Libraries: none. Native `Intl` for zones, `<Input type="date">` for the month on phones.

### 15. Candidate reschedule and cancel (portal)  — COMPLETE · M
- Where: `ApplicationParts.tsx:144-205`, `POST /public/applications/{a}/interviews/{i}/reschedule|cancel` (`PublicInterviewBookingEndpoints.cs:63-136,271-358`). Portal list at `PublicPortalEndpoints.cs:35-38`.
- Today:
  - Reschedule adds a second `CreateCalendarEvent` outbox row. The unique index on `(Operation, EntityId)` (`AtsDbContext.cs:331`) throws, so any interview that was ever sent to a calendar returns HTTP 500 on candidate reschedule.
  - With no calendar set up at all, reschedule still sets `CalendarStatus = "Queued"` (`:331`), and the worker fails it 5 times into "Calendar invite failed".
  - Past interviews stay "Booked" with Change time and Cancel buttons.
  - No reason is captured. There is no cut-off ("can't change within 24 h").
- Design critique (`phone-light_candidate-portal_interviews.png`): at 390px the title "Technical interview: Sun, Nov 15, 10:00 AM" squeezes into 4 lines beside the Booked badge and the Join button. Put the time on its own line under the title, and the actions in a full-width row below.
- Complete means:
  - [ ] Upcoming and Past groups. Past items show "Completed" with no actions.
  - [ ] Reschedule opens the same picker as feature 14. Cancel asks for an optional reason.
  - [ ] Both are blocked inside a configurable notice window, with "Message the team" instead.
  - [ ] The team is notified with the reason. The calendar event is updated, not duplicated.
  - [ ] The time zone is labelled on every time.
- Backend: upsert the outbox row (reset it, as PATCH does at `InterviewEndpoints.cs:307-323`). Only queue when a calendar exists. Add `CancelReason` and `CancelledBy`.
- Libraries: none.

### 16. Personal calendar connection  — COMPLETE · M
- Where: the right-rail card on `/interviews` (`InterviewsPage.tsx:546-592`), `GET /api/calendar/connect/{provider}`, `/auth/calendar/callback` (`CalendarConnectionEndpoints.cs:16-59`), `Domain/Users.cs:48-60`.
- Today:
  - OAuth to Google or Microsoft works, and tokens are encrypted with DataProtection.
  - After consent, the callback sends **everyone** to `/admin/integrations?calendar=connected` (`:58`). Recruiters and interviewers see the "admin only" wall, and nothing reads `?calendar=connected`.
  - Callback errors render as raw JSON in the browser (`:35-40`).
  - `ProviderAccountEmail` is set to the MyThorneAI email, not the Google or Microsoft account actually connected (`:52`).
  - Disconnect deletes the row without revoking the token at the provider. Combined with the sync bug in feature 17, disconnecting cancels all of that person's interviews.
- Design critique: the card sits on the calendar page for every visit, even after connecting. "Reconnect Google" and "Connect Microsoft" both show when connected to Google.
- Complete means:
  - [ ] Lives in `/settings/calendar` (feature 10). A one-time nudge banner on `/interviews` and on the interviewer home while not connected.
  - [ ] It shows the real account, which calendars are checked for busy times (multi-select), and which calendar gets new events.
  - [ ] Errors come back to the page as an `Alert` in plain words. Success shows a toast.
  - [ ] Disconnect revokes the token at the provider and warns: "Your 4 upcoming interviews stay booked. New ones won't check your calendar."
  - [ ] An expired refresh token shows a "Reconnect" `Alert` instead of failing silently in the worker.
- Backend:
  - Redirect to `/settings/calendar?calendar=connected`.
  - Read the account email from the ID token or userinfo.
  - `CalendarConnection.BusyCalendarIds[]` and `LastError`.
  - Revoke on delete (Google `oauth2.googleapis.com/revoke`; Microsoft has no single revoke, so delete only).
- Libraries: `Google.Apis.Auth@1.75.0` is already installed. Use it to validate and read the ID token.

### 17. Calendar sync (create, update, cancel, read back)  — MERGE · L
- Survivor: one `ICalendarProvider` per connection kind, built on the **installed SDKs** (`Google.Apis.Calendar.v3@1.75.0.4206`, `Microsoft.Graph@6.6.0`). They already do update, conference creation and attendee updates correctly in `GoogleWorkspaceIntegration.cs:40-110` and `Microsoft365Integration.cs`. Delete the hand-written HTTP in `UserCalendarService.cs:117-238,354-377`. Personal tokens plug into the same SDK clients.
- Today:
  - **Duplicates.** The personal path always POSTs a new event (`UserCalendarService.cs:130-135`) and ignores `ExternalEventId`. Every recruiter edit or reschedule adds another invite to everyone's calendar, and the old one stays.
  - **Auto-cancel.** The sync reads the event as `InterviewerEmails.FirstOrDefault()` (`IntegrationOutboxWorker.cs:160`), but the organizer is the first *connected* interviewer (`UserCalendarService.cs:124`). `GetEventAsync` returns `null` when that person has no connection (`:195-200`), and `null` is treated as "cancelled". So the interview is cancelled and the candidate is emailed "Your interview was cancelled" (`IntegrationOutboxWorker.cs:179-199`). The same happens to every interview of someone who disconnects.
  - **Cancel never reaches the calendar.** Cancel uses the same wrong organizer (`:316-324`) and returns silently.
  - **Starvation.** The sync takes 100 interviews with no order and no future-only filter (`:148-157`). Past interviews that are still "Scheduled" crowd out future ones.
  - Interviewer RSVPs (declined) are never read.
- Product critique: Greenhouse and Ashby show "Declined by Priya" within minutes and update one event in place, never a second invite.
- Complete means:
  - [ ] Store `OrganizerEmail` and `ExternalCalendarId` on `Interview`. Create once, then update in place (Google `Events.Update`, Graph `PATCH`), and cancel through the organizer.
  - [ ] "Not found" is cancelled only when the organizer's connection is healthy. A missing connection is an error state ("Calendar disconnected") and never a cancellation.
  - [ ] The read-back covers future interviews, ordered by `StartsAt`. It reads attendee `responseStatus` and shows Declined badges plus an item in Needs attention.
  - [ ] An external time change still emails people, but in their local time.
- Backend: migration for the new columns. The outbox upsert becomes a helper used by all four call sites (`InterviewEndpoints.cs:153,307`, `PublicInterviewBookingEndpoints.cs:126,259,348`). Add one runnable check for "missing connection is not a cancellation".
- Libraries: installed SDKs only. Polling stays. Push channels (Google `watch`, Graph subscriptions) are YAGNI until polling is measurably late.

### 18. Calendar admin page `/admin/integrations`  — COMPLETE · M
- Where: `features/admin/AdminIntegrations.tsx`, `GET /api/admin/integrations`, `retry-failed`. The global provider comes only from environment configuration (`IntegrationOptions.cs:6`).
- Today: read-only status plus "Resend failed invitations".
- Design critique: two cards say the same thing ("No calendar connected / Interviews show only in MyThorneAI" and "Calendar: Internal scheduling only"), and the stat value wraps over 2 lines in `text-xl` (screenshot). On a phone it is 4 stacked cards for one fact.
- Product critique: admins expect to see who on the team is connected, failures with the reason, and the defaults for meeting type and working hours. Today they cannot see who has *not* connected, which is why availability fails.
- Complete means:
  - [ ] One status card: provider and health, plus the waiting and failed counts inline.
  - [ ] Members table: name, role, calendar (connected, expired, none), last sync. Bulk "Ask to connect" (email with the deep link).
  - [ ] Failed deliveries table: interview, candidate, error in plain words, Retry for each row.
  - [ ] Workspace defaults:
    - meeting type (Meet, Teams, Zoom);
    - default working hours and zone for people who have not set theirs;
    - default buffer and minimum notice.
  - [ ] Zoom connect (feature 19).
- Backend: extend `GET /api/admin/integrations` with members and failures. `PUT /api/admin/scheduling-defaults` (columns on `Organization`).
- Libraries: none.

### 19. Video meeting links (Google Meet, Teams, Zoom)  — COMPLETE · M
- Where: the modal's "Meeting link" field (`InterviewModal.tsx:111-116`). The drawer has none. Creation is in `UserCalendarService.cs:354-377` and `GoogleWorkspaceIntegration.cs:65-75`.
- Today:
  - The copy promises "Leave blank to add a Teams or Google Meet link". Teams works on both paths.
  - Google Meet works only for the global service-account path. Personal Google connections send no `conferenceData`, so there is never a Meet link.
  - There is no Zoom option.
  - The link is taken from the calendar event, so no calendar means no link.
- Product critique: Calendly, GoodTime and Ashby create Zoom, Meet or Teams per interview from a meeting-type choice, and show "Join" on the candidate portal, invite and reminder.
- Complete means:
  - [ ] Meeting type picker in the scheduler, with the workspace default.
  - [ ] Google Meet and Teams created through the calendar event (SDK path). Zoom created through the Zoom API and written into the event.
  - [ ] The link appears in the invite, the emails, the portal, the interview header and the reminders. It is regenerated if the meeting type changes.
- Backend: `Interview.MeetingType` and `MeetingProviderId`. Zoom: one admin-level server-to-server OAuth app (`POST /users/me/meetings`, `PATCH`, `DELETE`) via `HttpClient`.
- Libraries: none new. The Zoom REST API is three calls, so an SDK is not worth it.

### 20. Interview notifications and calendar files (.ics)  — COMPLETE · M
- Where: `QueueEmail` calls in `InterviewEndpoints.cs:180-201`, `PublicInterviewBookingEndpoints.cs:110-124,243-257,333-347`, and `IntegrationOutboxWorker.cs:220-247`.
- Today:
  - Times are sent as UTC `2026-11-13 16:00:00Z`.
  - There are no interviewer names, no join link, no link to the interview page, and no .ics.
  - When a **recruiter** reschedules or cancels (`PATCH /api/interviews/{id}`), nobody gets an email. Only the calendar invite changes, and only if a calendar is connected. Without one, the candidate is never told.
  - The bodies are hardcoded strings, not templates (except booking-request and booking-reminder).
- Product critique: every scheduler sends the confirmation, the update and the cancellation in the recipient's zone, with an .ics carrying a stable UID and an increasing SEQUENCE. That way Outlook and Apple Calendar update one entry instead of adding duplicates.
- Complete means:
  - [ ] Templated emails: interview-scheduled, interview-rescheduled (old time struck through), interview-cancelled (with reason and a rebook link if offered), and interviewer-assigned (with the prep page link).
  - [ ] Each email shows the time in the recipient's zone with the zone named. The candidate's zone comes from booking, the interviewer's from their profile.
  - [ ] An .ics attachment, or an "Add to calendar" link to `/public/interviews/{token}.ics`. Use `METHOD:REQUEST`, or `METHOD:CANCEL` with the same UID.
- Backend: replace `QueueEmail` strings with `EmailTemplates.QueueAsync` keys (cross-area: templates editor). Add `Interview.IcsSequence`, and attachment support on `EmailOutboxItem` or the public .ics route.
- Libraries: `Ical.Net@5.2.4`. It handles VTIMEZONE, line folding, escaping, UID and SEQUENCE. Hand-rolled .ics files get these wrong in Outlook.

### 21. Reminders before the interview  — COMPLETE · M
- Where: none. The reminder sweep (`EmailOutboxWorker.cs:79-89`) only does stale applications, booking reminders and scorecard reminders.
- Product critique: Calendly, GoodTime and Greenhouse send the candidate a 24 h and a 1 h reminder with the join link, and the interviewer a 15 to 30 min "your interview starts soon, here is the kit" reminder. Missed interviews are the most expensive failure in recruiting, and this is the cheapest fix for it.
- Complete means:
  - [ ] Candidate: 24 h and 1 h before (configurable, each can be turned off), with time in their zone, a Join link, and reschedule and cancel links if allowed.
  - [ ] Interviewers: 30 min before, with a deep link to the Room tab and a one-line kit summary.
  - [ ] No reminder for cancelled interviews or ones made inside the window. Quiet hours do **not** apply to these, because they are time-bound.
- Backend: `Interview.CandidateRemindersSent` and `InterviewerReminderSentAt` (or a small `InterviewReminder` table). Run every minute in the existing worker, outside the quiet-hours check. New templates.
- Libraries: none.

### 22. Booking and scorecard reminders, and the Reminders admin page  — COMPLETE · S
- Where: `/admin/reminders` (`AdminSettings.tsx:223-327`), `EmailOutboxWorker.cs:150-235`, templates in `EmailTemplates.cs:39-55`.
- Today:
  - Four day counts plus quiet hours.
  - The stale-application field allows up to 60 (`AdminSettings.tsx:251`) but the server clamps to 30 (`AdministrationEndpoints.cs:86`), so typing 45 silently saves 30.
  - Scorecard reminders only query `Status == Scheduled` (`EmailOutboxWorker.cs:197`). Clicking "Mark completed" stops them.
  - The scorecard-reminder email has no link (`EmailTemplates.cs:53`).
  - The first scorecard reminder fires within 5 minutes of the end, and the "after (days)" label implies otherwise.
- Design critique:
  - Quiet hours are two raw 0 to 23 number boxes plus a paragraph explaining 24-hour time. Use two time selects ("8:00 PM").
  - On a phone, the sticky "Save changes" bar covers the quiet-hours paragraph mid-card (`phone-light_admin_reminders.png`).
  - One "Reminders" card under a "Reminders" page title repeats the heading.
- Complete means:
  - [ ] Group by audience:
    - Candidates: before the interview (feature 21), booking.
    - Interviewers: before the interview, feedback.
    - Job owners: stuck applications.

    Each group has an on/off switch, timing, and a "Preview email" link to its template.
  - [ ] Matching min and max on the client and the server. Quiet hours as time selects.
  - [ ] Scorecard reminders include Completed interviews, link to the Feedback tab, and say "first reminder: right after the interview".
  - [ ] Fix the sticky bar on phones (`settings-shared.tsx:59`): it needs a page-level bottom inset, not an overlap inside the card.
- Backend: fix the clamp and the status filter. Add the link variable.
- Libraries: none.

### 23. Live interview room (kit, notes, timer)  — COMPLETE · L
- Where: none as a mode. The prep page shows the kit and notes. Recording lives only on the application tab.
- Product critique: Ashby's interview view, BrightHire and Metaview give the interviewer a focused screen during the call:
  - questions as a checklist;
  - a note box per question;
  - elapsed and remaining time;
  - one Join button;
  - recording status.

  Notes flow straight into the scorecard. Here, notes go into one `localStorage` box per browser, and the kit is a static list.
- Complete means:
  - [ ] Room tab, the default between 10 minutes before the start and 30 minutes after the end:
    - a sticky top bar with Join meeting, elapsed and remaining time against `endsAt`, a soft "5 minutes left, leave time for their questions" cue, and Record status;
    - left pane: kit criteria as a stepper (question, "what good looks like", a "Covered" tick, a notes box per criterion, autosaved);
    - right pane: resume (the existing `ResumeSummary`).
  - [ ] Keyboard: J and K move between questions, ⌘Enter marks one covered.
  - [ ] Works on a tablet. On a phone it stacks with the timer kept visible.
  - [ ] "Suggest questions" (feature 26) can add a question to my list for this interview.
- Backend: `InterviewNote` (interviewId, authorEmail, criterionId nullable, body, covered, updatedAt), private to its author until the scorecard is submitted. `GET/PUT /api/interviews/{id}/my-notes`.
- Libraries: none. Use `Textarea` and `useDebouncedValue` from `@/lib/hooks`.

### 24. Private notes on the prep page (browser storage)  — MERGE · S
- Survivor: server-saved notes for each interviewer (feature 23).
- What moves: `InterviewPrep.tsx:64,231-245` (`useLocalStorageState('interview-notes:<id>')`). Notes kept in one browser are lost on another device and never reach the scorecard. On first load, migrate any local value into the server note once, then delete the key.

### 25. Shared "Meeting notes" field and its "source"  — MERGE · S
- Survivor: personal notes (feature 23) plus **imported transcripts** on the Recording tab (feature 28).
- Why:
  - `Interview.MeetingNotes` is one shared field, last write wins, editable by any assigned interviewer (`InterviewEndpoints.cs:349-406`).
  - It is returned to interviewers who have **not** submitted their scorecard (`ApplicationEndpoints.cs` projection), so one panelist's impressions can anchor another's. That breaks the "independent evaluation" rule in `src/web/CLAUDE.md`.
  - The "Where these notes came from (Fireflies, Fathom, Otter)" input really means "I pasted a transcript from another tool".
- What moves: "Import a transcript or notes" (paste, or upload .txt, .vtt or .srt) becomes a transcript source on the Recording tab. The summary reads it like our own transcript.

### 26. AI "Suggest questions"  — COMPLETE · S
- Where: `features/applications/InterviewQuestions.tsx`, `POST /api/ai/interview-questions` (`CopilotEndpoints.cs:19-63`).
- Today: works. It opens a drawer, groups questions by criterion, shows a "why", and has copy and regenerate. A clean feature.
- Gaps: results vanish when the drawer closes, and every open on another page regenerates (cost). It cannot add a question to the interview, and it is not logged as used.
- Complete means:
  - [ ] "Add to my questions" puts the question into the Room's list (feature 23).
  - [ ] The last result is cached per interview on the server for 24 h.
- Backend: `InterviewNote` rows with `criterionId` and `isSuggested`. Cache table or column.
- Libraries: none.

### 27. Recording  — COMPLETE · L
- Where: `InterviewRecorder.tsx`, `POST /api/interviews/{id}/recordings` (`InterviewRecordingEndpoints.cs:14-33`), `LocalFileStore.SaveRecordingAsync` (`LocalFileStore.cs:75-105`). Recordings are stored as local files.
- Today:
  - The browser records the shared screen and tab audio (`getDisplayMedia`, VP9 WebM, 1 s chunks kept in memory), then uploads the whole file at Stop.
  - Kestrel's default 30,000,000-byte body limit is not raised anywhere (`Program.cs` has no `MaxRequestBodySize`), so screen video longer than a few minutes is rejected. The "1 GB" check in `LocalFileStore.cs:80` can never be reached, and the form limit (128 MB) would stop it next anyway.
  - Closing the tab loses everything.
  - Chrome's MediaRecorder writes WebM with no duration or seek index, so the player shows no length and jumping to a time is unreliable. That breaks click-to-seek from a transcript.
  - `getDisplayMedia` does not exist on iOS Safari or Android Chrome, but the button shows on phones (`p-apptab.png`).
  - "Copy recording link" copies a raw `/api/...` file address.
- Design critique: the recorder is a grey box inside the application card. A consent checkbox gates a soft "Record interview" button with a red dot. It shows the same way for future and past interviews.
- Product critique: Metaview and BrightHire (and Ashby's notetaker) record with a **bot that joins the Zoom, Meet or Teams call**. The interviewer does nothing, every speaker is captured, and the recording arrives with speaker names. Screen capture from one person's browser is a fallback, not a product.
- Complete means:
  - [ ] Phase 1 (fix what exists):
    - record **audio first**: Opus at about 32 kbps (about 15 MB an hour), mixing the mic with the shared tab audio, with video optional;
    - upload in chunks *while recording*, so a crash keeps everything up to that point;
    - server remux adds duration and cues;
    - hide the recorder on devices without `getDisplayMedia`;
    - "Upload a recording" accepts MP4 or M4A from Zoom, Teams or Meet downloads.
  - [ ] Phase 2: "Record with notetaker" per interview, on by default per workspace. A bot joins at the start time, named "MyThorneAI Notetaker", and the recording plus speaker timeline arrive by webhook.
  - [ ] Consent: keep the single "everyone agreed" tick for browser recording. The bot announces itself, and the candidate's confirmation email says the interview may be recorded. No legal workflow.
  - [ ] Recordings list on the Recording tab with length, who started it and Delete (managers). Links point to `/interviews/[id]/recording?t=…`.
- Backend:
  - `POST /api/interviews/{id}/recordings` to start, `PUT …/recordings/{rid}/chunks/{n}` to append, `POST …/complete` to finalize.
  - A `RecordingWorker` remuxes and extracts audio, then queues transcription.
  - `InterviewRecording` gains `DurationSeconds`, `Status` (Uploading, Processing, Ready, Failed), `Source` (Browser, Upload, Bot) and `AudioStoredFileName`.
  - Phase 2: `POST /api/webhooks/recall` plus a bot-scheduling call when an interview with a video link is booked.
- Libraries:
  - `FFMpegCore@6.0.0`, plus the `ffmpeg` binary in the API image. It remuxes WebM (`-c copy`) so seeking works, makes a 16 kHz mono Opus audio file for transcription, and normalises uploaded MP4s. Writing an EBML or MP4 muxer by hand is not realistic.
  - Recall.ai meeting-bot API (plain `HttpClient`, no SDK) for Phase 2. It replaces building three separate Zoom, Meet and Teams recording integrations.
  - `tus-js-client@4.3.1` was rejected. MediaRecorder already produces 1-second chunks, and a 3-endpoint append is smaller than a tus server.

### 28. Transcription  — COMPLETE · M
- Where: `POST /api/interview-recordings/{id}/transcribe` (`CopilotEndpoints.cs:67-101`), `OpenAiAssistant.TranscribeAsync` (`AiAssistant.cs:130-160`, `whisper-1`), `RecordingTranscripts.tsx`. Stored in `InterviewRecording.Transcript` (string).
- Today:
  - A manager clicks "Transcribe". It runs **inside the HTTP request**, and anything over 25 MB is refused, which is almost every screen recording.
  - It returns plain text with no timestamps and no speakers.
  - The transcript is returned to every viewer of the application, including interviewers who have not submitted, even though only managers see the button.
- Product critique: best-in-class transcripts are speaker-labelled ("Priya (interviewer)", "Victor (candidate)"), timestamped by sentence, searchable, and start on their own when the recording lands.
- Complete means:
  - [ ] Automatic after a recording is Ready. There is no button, only "Transcribing… about 2 minutes", then Ready.
  - [ ] Segments carry `start`, `end`, `speaker` and `text`. Speakers are mapped to names (bot timeline, or "Who is speaker 2?" once per interview).
  - [ ] Imported transcripts (.vtt or .srt, or pasted text) are parsed into the same shape.
  - [ ] Visibility follows scorecard rules: managers always; interviewers after they submit.
  - [ ] Failures show a plain message and Retry.
- Backend: `TranscriptSegment` (recordingId, startMs, endMs, speaker, text) or `InterviewRecording.SegmentsJson`, plus `TranscriptionWorker` (same pattern as `ResumeParseWorker`). Postgres `tsvector` on the text for search (feature 30).
- Libraries / service:
  - **Pick: Deepgram `nova-3` pre-recorded API** (`diarize=true&utterances=true&smart_format=true`), called with `HttpClient` (the `Deepgram@7.5.1` SDK is optional). Speaker diarization and utterance timestamps come in one call, files up to 2 GB, so the 25 MB ceiling and the chunking code go away.
  - **No-new-vendor fallback:** keep OpenAI `whisper-1` with `response_format=verbose_json` and segment timestamps, fed the about-15 MB-an-hour Opus audio from feature 27. This gives timestamps but no speakers.
  - With Phase 2 recording, the bot vendor can deliver the transcript directly.

### 29. AI interview summary  — COMPLETE · M
- Where: the "Summarize" button on `InterviewCard.tsx:235-245`, `POST /api/ai/summarize-interview` (`AiEndpoints.cs:95-138`), `AiSummary.tsx`.
- Today: it builds a prompt from the kit, the shared meeting notes, transcripts cut to 12,000 characters, and scorecards. It returns plain text with headings, which are parsed with a regex. The result is kept only in React state and lost on reload. Every click costs a new call. It runs even with no notes or transcript ("No meeting notes were provided."). Managers only.
- Product critique: Metaview and BrightHire give a saved summary per interview:
  - highlights for each kit criterion, each with **clickable timestamps** into the recording;
  - the candidate's questions;
  - follow-ups for the next round.

  It is regenerated only on request and clearly marked as AI.
- Complete means:
  - [ ] Generated automatically when a transcript is Ready (or on demand from imported notes). Saved with model, time and inputs.
  - [ ] Structured: overview; per criterion, evidence quotes with `[12:34]` links that seek the player; candidate's questions; open questions.
  - [ ] Never a hire recommendation. That rule is already in the prompt; keep it.
  - [ ] Visibility: managers, plus interviewers after they submit.
  - [ ] "Regenerate" with a reason, and the older version kept.
- Backend: `InterviewSummary` (interviewId, model, createdAt, json). Structured output through the installed `Microsoft.Extensions.AI` `IChatClient` (already used for resume parsing), not regex over plain text. Transcript chunks over the context limit are summarised per segment, then merged.
- Libraries: `Microsoft.Extensions.AI@10.11.0` and `Microsoft.Extensions.AI.OpenAI@10.11.0` are already installed. Use `GetResponseAsync<T>` for typed JSON.

### 30. Playback with transcript search  — COMPLETE · M
- Where: none. Today it is a bare `<video>` in the application card, and the transcript is a `whitespace-pre-wrap` paragraph under "Show transcript".
- Product critique: Gong, BrightHire and Grain all offer:
  - the video or audio player beside a transcript that scrolls along with playback;
  - click a line to seek;
  - search with hits marked on the scrubber;
  - speaker filter;
  - 1× to 2× speed;
  - captions;
  - "copy link at this moment".
- Complete means:
  - [ ] Recording tab: player on top (video if there is one, otherwise audio with a waveform-free scrubber), then the transcript list below or to the right on wide screens.
  - [ ] The active line highlights and follows playback. Click seeks. A search box filters and highlights, with ↑ and ↓ to step through hits and hit markers on the scrubber.
  - [ ] Speaker chips filter. Speed 1×, 1.25×, 1.5× and 2×. Captions from a generated WebVTT `<track>`.
  - [ ] "Copy link at 12:34" gives `/interviews/[id]/recording?t=754`.
  - [ ] Cross-interview search lives in the candidate's activity or global search (cross-area): "find where anyone said 'Kubernetes'".
- Backend: `GET /api/interview-recordings/{id}/transcript` (segments) and `…/captions.vtt`. Full-text search endpoint over `tsvector`.
- Libraries: none. Native `<video>`/`<audio>`, `<track kind="captions">`, `timeupdate`, and Postgres full-text through Npgsql.

### 31. Interview outcome: ended, completed, no-show  — COMPLETE · S
- Where: the "Mark completed" and "Mark no-show" menu items (`InterviewCard.tsx:182-185`) send the full PATCH payload with a new status. The `InterviewStatus` enum is in `Domain/Enums.cs:31`.
- Today:
  - Nothing changes with time, so past interviews stay Scheduled everywhere: calendar, portal, rail.
  - No-show has no reason, no follow-up to the candidate and no count on the candidate.
  - After either action the interview disappears from the calendar (feature 1).
- Product critique: Greenhouse and GoodTime prompt "Did this interview happen?" after the end. A no-show sends the candidate a "we missed you, pick a new time" link and is tracked for reporting.
- Complete means:
  - [ ] The display state comes from time: Upcoming, Live now, Ended (awaiting outcome).
  - [ ] An "Ended" banner on the interview page and a Needs-attention row with Completed, No-show and Reschedule.
  - [ ] If nobody acts within 24 h, the sweep marks the interview Completed (scorecard reminders continue).
  - [ ] No-show: who did not attend (candidate or interviewer), an optional note, "Send a rebook link" (feature 14) ticked by default. The no-show count appears on the candidate profile.
- Backend: `Interview.OutcomeAt`, `OutcomeBy` and `NoShowParty`. Auto-complete is one `ExecuteUpdateAsync` in `RunRemindersAsync`. A small `POST /api/interviews/{id}/outcome` replaces sending the whole interview to change a status.
- Libraries: none.

### 32. Cancelling an interview (team side)  — COMPLETE · M
- Where: `InterviewCard.tsx:186-188,355-367` (`ConfirmDialog`), PATCH with `Status = Cancelled`.
- Today: the confirm says "The calendar invite is cancelled for everyone on it". That is true only with a connected calendar, and for personal calendars it often is not (feature 17). The candidate gets no email (feature 20). There is no reason and no "reschedule instead".
- Product critique: Greenhouse asks for a reason, lets you edit the candidate message, and offers "Send availability request" in the same step.
- Complete means:
  - [ ] The dialog has a reason (candidate asked, interviewer unavailable, job filled, other), "Notify candidate" with an editable message, and "Ask the candidate for new times instead", which creates a scheduling link.
  - [ ] Cancelled interviews stay visible (struck through) on the record and the calendar toggle, with who and why.
- Backend: `CancelReason`, `CancelledBy`, `CancelledAt`. `POST /api/interviews/{id}/cancel` sends the template email and updates the calendar.
- Libraries: none.

### 33. My feedback queue `/interviews/feedback`  — COMPLETE · S
- Where: `features/interviews/FeedbackQueue.tsx`. Data comes from `GET /api/dashboard` `scorecardsDue`, which takes 10 (`DashboardEndpoints.cs:68-78`, `FeedbackQueue.tsx:14-15`).
- Today: a clean table (Candidate, Interview, Waiting, Write scorecard) with a good empty state.
- Design critique: column-picker, density and Export buttons on a list of at most 10 personal rows is chrome for its own sake. The page shows a blank card with three toolbar icons when empty (screenshot).
- Complete means:
  - [ ] A dedicated `GET /api/me/feedback-due` with no limit, including Completed interviews.
  - [ ] Sections: "Due" (oldest first, amber after 24 h) and "Coming up" (my next interviews with Prepare).
  - [ ] Each row opens the interview's Feedback tab with my notes beside the form.
  - [ ] Drop the column, density and Export controls (`DataTable` props).
  - [ ] The count shows as a `CountBadge` on the "My feedback" header button (from feature 3).
- Backend: the endpoint.
- Libraries: none.

### 34. Hand-off from interview to scorecard  — COMPLETE · M
- Where: "Write scorecard" goes to `/applications/[id]/scorecards?interview=` (`InterviewPrep.tsx:108`), `ScorecardModal.tsx` (`useScorecardForm`, draft in `localStorage`), and the scorecard reminder email.
- Today: the scorecard is good and locked after submit. Hiding others' scorecards until you submit is enforced by the API. But the interviewer's notes (kept in this browser) and the transcript never reach the form. The reminder email has no link. Marking an interview Completed silences reminders (feature 22). Notes and transcripts leak before submission (feature 25).
- Product critique: Ashby and BrightHire put your own notes, and AI-suggested evidence from the transcript, beside each criterion. The scorecard is still yours to write and submit.
- Complete means:
  - [ ] Feedback tab on the interview page with the scorecard form inline (reuse `useScorecardForm`).
  - [ ] Above each criterion's evidence box: "Your notes" (feature 23), with "Insert". If a transcript exists, add "Quotes from the interview" with timestamps and "Insert quote".
  - [ ] No auto-filled ratings or recommendation. That would be a shortcut around structured evaluation.
  - [ ] After submit: the panel comparison (the existing `PanelComparison`) and the AI summary appear.
  - [ ] Scorecard drafts move from `localStorage` to the server, so they work on another device.
- Backend: `ScorecardDraft` (interviewId, interviewerEmail, json) or reuse `InterviewNote`. Fix the projection so `MeetingNotes`, transcripts and summary follow the same "after you submit" rule as scorecards.
- Libraries: none.

### 35. Interviews API contract (`GET /api/interviews` and by id)  — COMPLETE · S
- Where: `InterviewEndpoints.cs:17-67`, `Program.cs:97`.
- Today:
  - `GET /api/interviews` without `from` and `to` returns **HTTP 500**. I confirmed it against the running API. Root cause: in Development, minimal APIs throw `BadHttpRequestException` for missing required query values (`RouteHandlerOptions.ThrowOnBadRequest`), and `app.UseExceptionHandler()` turns every exception into 500. In Production the same request gives a bare 400 with no message.
  - There is no `GET /api/interviews/{id}`.
  - The list hides every status except Scheduled.
- Complete means:
  - [ ] Fix it once for every endpoint: `app.UseExceptionHandler(new ExceptionHandlerOptions { StatusCodeSelector = ex => ex is BadHttpRequestException bad ? bad.StatusCode : 500 })` (.NET 9+, the project is on net10.0).
  - [ ] Make `from` and `to` optional (default: the current week) with a readable 400 for a bad range.
  - [ ] Add `GET /api/interviews/{id}` (feature 5) and the status filter (feature 1).
- Libraries: none.

## Cross-area notes
- **Global error mapping** (`Program.cs:97`): the `StatusCodeSelector` fix in feature 35 turns every endpoint's missing or invalid parameter from 500 into 400. Platform owner.
- **Upload size**: Kestrel's default 30 MB request limit applies to every upload. Recordings need a chunked endpoint (feature 27). Other areas that accept large files should set `RequestSizeLimit` per endpoint, not raise it globally.
- **File storage**: `LocalFileStore` writes to local disk. Recordings in hundreds of MB need object storage (S3 or Azure Blob) and range-capable signed URLs before multi-instance hosting. Platform.
- **Email templates and editor** (templates area, Plate): new keys are needed: `interview-scheduled`, `interview-rescheduled`, `interview-cancelled`, `interviewer-assigned`, `interview-reminder-candidate`, `interview-reminder-interviewer`, `missed-interview`, `scheduling-link`. `scorecard-reminder` needs `{{scorecardLink}}`. Variables need a time-in-recipient-zone helper. `EmailOutboxItem` needs attachments (or use the public .ics route).
- **Interview kits** (jobs area, `features/requisitions/InterviewKitEditor.tsx`): kits need to become an ordered **interview plan**. Add default interviewers or a pool, meeting type, location, and a candidate-facing description, so the scheduler can prefill.
- **Status colours** (`components/status.tsx:27`): `Scheduled` is violet, but the rule in `src/web/CLAUDE.md` is "Blue: interview" and the calendar already uses blue. Pick blue.
- **Application record** (`ApplicationShell.tsx`): the "Next interview" rail should link to the interview page with Join and a countdown. The Interviews tab's empty state must not add a second primary button.
- **Scorecards area**: the application payload (`ApplicationEndpoints.cs` interview projection) returns `MeetingNotes` and `Recordings[].Transcript` to assigned interviewers before they submit. This breaks the independent-scorecard rule.
- **RBAC**: `GET /api/calendar/availability` has no policy, so any signed-in user can read anyone's free and busy times. The `canSchedule` role list is hardcoded in `InterviewsPage.tsx:176`. Fold both into the RBAC rework.
- **People directory**: `GET /api/people` (feature 8) is also what messages, @mentions and approvers need. The only list today is admin-only.
- **Reports**: no-show rate, time to schedule, feedback turnaround and interviewer load (features 11 and 31) belong in Reports once the data exists.
- **Candidate portal** (portal reviewer): the desktop and phone screenshots of `/candidate-portal/applications/<id>/interviews` show "Application not found", because the shot used another candidate's application id. That is a screenshot artefact, not judged here. The portal's general layout belongs to that reviewer. Booking behaviour is covered in features 14 and 15.
- **Dashboard**: `InterviewerHome.tsx` reads the same top-10 `scorecardsDue`. Switch it to the feature 33 endpoint.

## Build order
1. **Fix the bugs customers already hit (M, about 2 days, no dependencies).**
   - Sync auto-cancel and the wrong organizer (feature 17).
   - Duplicate personal events: update in place (feature 17).
   - Candidate reschedule 500: outbox upsert helper (feature 15).
   - Google Meet `conferenceData` on the personal path (feature 19).
   - Hour-label drift, `-translate-y-2` (feature 1).
   - `GET /api/interviews` 400 and the global `StatusCodeSelector` (feature 35).
   - OAuth callback redirect to `/settings/calendar` (feature 16).
   - Scorecard reminders for Completed, plus the link (feature 22).
   - Emails in the recipient's local time (feature 20, first pass).
   - Close the notes and transcript leak (feature 25).
2. **Interview record page** (features 5 and 35): `GET /api/interviews/{id}`, Overview tab, and the application tab becomes a rounds list (feature 6). This gives every later feature a home.
3. **Calendar page cleanup** (features 1 to 4): status colours, overlap layout, popover, Up next rail, remove the stat cards, Needs attention. Depends on 2 for links.
4. **Outcome, cancel and notifications** (features 31, 32 and 20, with `Ical.Net`): time-aware states, no-show flow, cancel reason, templated emails and .ics. Depends on the templates keys (cross-area).
5. **My availability and the availability engine** (features 10, 9 and 8): user time zone, working hours, buffers, people picker, honest partial results.
6. **One scheduler** (features 7, 11 and 12): Wizard page with the availability grid, meeting types, load-aware suggestions and panel loops. Retire the drawer and modal. Depends on 5.
7. **Self-scheduling links** (features 14, 13 and 15): no-login booking page, retire Proposed, portal reschedule and cancel on the same picker. Depends on 5 and 6.
8. **Pre-interview reminders and the Reminders page** (features 21 and 22). Depends on 4 for templates.
9. **Calendar sync on the installed SDKs, admin calendar page, Zoom** (features 17, 18, 16 and 19). Builds on the step 1 fixes.
10. **Live room, server notes and scorecard hand-off** (features 23, 24, 26, 33 and 34). Depends on 2.
11. **Recording v1 → transcription → playback → summary** (features 27, 28, 30, 29, with `FFMpegCore`, Deepgram and `Microsoft.Extensions.AI`). Merge the shared notes into imported transcripts (feature 25). Depends on 2 and 10 for the tabs, and object storage (cross-area) before production.
12. **Recording v2: meeting notetaker bot** (feature 27 Phase 2, Recall.ai). Depends on 11's pipeline and 19's meeting links.

## Progress (wave 1)

Finished:
- **17. Calendar sync**: the organizer is stored (`Interview.OrganizerEmail`) and every update, cancel and read-back goes through them; personal events update in place (Google `PATCH`, Graph `PATCH`) instead of adding a duplicate; a missing connection is "Disconnected", never a cancellation (`CalendarSync.Classify`, tested); the read-back covers upcoming interviews only, soonest first; reconnecting re-sends stuck invites. Still open: moving to the installed SDKs, RSVP read-back.
- **15. Candidate reschedule and cancel** (backend): one outbox helper (`CalendarOutbox.QueueAsync`) for every call site, so reschedule no longer returns 500 and nothing is queued without a calendar; blocked once the interview has started; the length comes from the interview, not the request; slots are checked against the availability engine. The portal UI (Upcoming and Past groups, picker) is still the candidate-facing area's.
- **19. Video meeting links**: personal Google connections now create a Meet link (`conferenceData`); Teams unchanged. Zoom and a meeting-type picker are wave 2.
- **1. Interview calendar**: hour labels sit on their lines; overlapping interviews sit side by side (`event-layout.ts`, checked); short blocks show time and name on one line; colours and looks by time-aware state; Show cancelled; Mine and Team; a popover with Join, Prepare, Reschedule and Cancel (Enter or double-click opens the page); one-row toolbar at 1440; "Times in …" line; phones open on Agenda. Not done: drag to move, switching the display zone, 3-day swipe on phones.
- **2. Agenda and Needs attention**: agenda has a Status column and names instead of emails; a "Needs attention" rail lists interviews that ended without an outcome, calendar invites that failed, and times waiting for the candidate (`GET /api/interviews/attention`). The full tabbed queue with bulk reminders is not done.
- **3. Stat cards**: removed; the scorecards-due count is a badge on My feedback.
- **4. Up next rail**: my next three interviews with a countdown, Join when it is close, and Prepare. The calendar card moved to My settings.
- **5. Interview record page**: `GET /api/interviews/{id}` (shared `InterviewProjection`); `/interviews/[id]` works on its own with a time-aware header (Upcoming, Live now, Ended, Completed, No-show, Cancelled), Join, Write scorecard, a ••• menu, an Ended banner, Cancelled and No-show banners, and tabs: Overview (when in your zone and the candidate's, where, who with scorecard state, the kit, your notes, activity, resume), Recording (recorder, transcripts, shared notes), Summary (AI draft, managers), Feedback (the scorecard form when you owe one, then the panel's scorecards). Room is not built: it needs server notes (feature 23).
- **6. Application Interviews tab**: a rounds list (state, time, avatars with scorecard ticks, Open, •••), plus "Not scheduled" rows for the job's rounds with a Schedule button; the empty state's button is soft.
- **8. Interviewer picker**: `GET /api/people` and a picker by name with this week's load and calendar state; outside people by email.
- **9. Availability engine**: `AvailabilityService` (own class) respects each person's zone, weekly hours, buffers, daily and weekly limits, MyThorneAI's own Scheduled and Proposed interviews and connected calendars; unknown calendars no longer zero the result ("2 of 3 calendars checked"); results are capped; the free and busy endpoint needs ManageHiring; candidates get 12 hours' notice. Pure slot function tested for zones, a DST change, buffers, limits and notice. Not done: date overrides (out of office), candidate-side "no earlier than".
- **10. My availability**: `/settings/availability` ("Calendar and hours" in Your account): calendar connection with plain errors and a disconnect warning, time zone (unset means the workspace zone), weekly hours with several ranges a day, break around interviews, daily and weekly limits. `GET/PUT /api/me/availability`.
- **16. Personal calendar connection** (part): the OAuth callback returns everyone to `/settings/availability` with a plain status instead of the admin page or raw JSON; the connected account's real email is read from the ID token. Not done: token revoke on disconnect, choosing which calendars count as busy.
- **20. Notifications and .ics** (first pass, no template store): every interview email (scheduled, booked, moved, cancelled, no-show, calendar changes) names the time in the reader's zone with `TimeText`, names the interviewers, links interviewers to the interview page, and, when no calendar invite went out, links to a calendar file (`/public/interviews/{token}/invite.ics`, Ical.Net, stable UID and rising SEQUENCE). A recruiter's reschedule or cancel now emails everyone. Templated keys wait for the template store.
- **22. Scorecard reminders**: Completed interviews keep getting reminders (the link was done by the evaluation builder).
- **25. Shared notes**: notes and transcripts are hidden from a panelist until their scorecard is in, on both the application and the interview page, and they cannot overwrite them before then.
- **31. Outcome**: states move with the clock; `POST /api/interviews/{id}/outcome` (Completed or No-show with who and a note, optional "we missed you" email); a sweep marks interviews Completed a day after they end. No-show count on the candidate profile is not done (candidates area).
- **32. Cancel (team side)**: `POST /api/interviews/{id}/cancel` with a required reason, an optional note to the candidate and "Email the candidate"; cancelled interviews stay visible, struck through, with who and why. "Ask for new times instead" waits for scheduling links.
- **18. Calendar admin page** (part): one status card instead of four repeating ones. Members table, failure list and workspace defaults are not done.

## Progress (wave 2)

Finished:
- **7, 11, 12. One scheduler**: `/interviews/schedule` (`ScheduleInterview.tsx`, `Wizard`) replaces the drawer and the modal (both deleted). Steps: rounds and panel (rounds from the job's plan or without a kit, a people picker with this week's load and calendar state, a break between rounds), time (an availability grid per person across working hours, busy times and MyThorneAI interviews, "Open for everyone" bands, top 5 suggestions ranked by the panel's load and spread over days, a zone switcher, a typed start time with a warning when not everyone is free), how you meet (Google Meet, Teams, another video link, phone, in person, a message to the candidate, notify switches), review (each person's email, previewed from the server in their own zone). Several rounds book back to back on one day as a loop (`Interview.LoopId`): one itinerary to the candidate, each interviewer their own session. Reschedule and edit open the same page at the Time step. Every entry point (calendar button and empty-slot click, popover, interview page, application header and rounds list) goes here. Backend: `POST /api/scheduling/suggestions` (grid data plus ranked loops, `SchedulingPlanner`), `POST /api/applications/{id}/interviews/schedule` (1 to 6 sessions, `preview: true` returns the emails unsaved); the single-interview POST now routes through the same code.
- **Stages and kits**: booking (by the team, through a link, or the older proposed path) moves an active application to its next interview-type stage (`InterviewStages`, `StageRules.NextInterview`), never by stage name. New interviews take only current kits (not old versions or archived); a reschedule keeps the kit it has; old versions show as "Name (version N)". The scheduler pre-picks the kit for the application's current stage. The kit's candidate and interviewer messages are not used anywhere, so they can be dropped.
- **19. Meeting type**: `Interview.MeetingType` and `Location`. The calendar makes a Meet room only for Google Meet and a Teams meeting only for Teams (`OutboundCalendarEvent.CreatesMeetingOn`), and a new event goes to a panelist whose calendar can make the chosen room. Phone and in-person show the number or address in emails, invites and the interview page. Zoom is a follow-up: it needs a new server-to-server OAuth app.
- **13, 14. Self-scheduling links**: `SchedulingRequest` with offered times (up to 5) or "any open time between two dates", notice, expiry, meeting details and a message. The token is a DataProtection key naming the request (`InterviewMailer.LinkToken`), so the team can copy it again; the row decides whether it still works. No-sign-in page `/book/{token}` (`app/book`, under the employer's `PublicFrame`): month and times in the detected zone (changeable), confirm with an optional note, then a confirmation with Join, Google, Outlook and .ics. The same link moves or cancels the booking until the notice window. Booking is checked against the request and live availability, claimed atomically (a double click books once), and sets the candidate's zone if unknown. The team sees open links on the application's Interviews tab (copy, email a reminder, cancel) and in Needs attention (copy); a sweep reminds the candidate every `BookReminderDays` up to `MaxReminders`. Offering a time as a "proposed" interview is refused with a pointer to the link; old proposed rows still book through the old public endpoints.
- **20. Calendar files attached**: interview, reschedule, cancel and loop emails carry `invite.ics` (`InlineFile*` on the outbox) when no calendar invite goes out; `METHOD:REQUEST` or `CANCEL` with an organizer when `Resend:From` is set, `PUBLISH` otherwise. The link stays as a fallback.
- **23, 24, 26, 34. Room and notes**: Room tab (`InterviewRoom.tsx`) with a sticky clock (starts in, elapsed and left, a 5-minute cue), Join and Record, the kit questions each with a "covered" tick and a note, my own questions (typed, or "Add to my questions" from Suggest questions), other notes, and the resume beside them. J and K move, ⌘ Enter marks covered. Notes save to the server as you type (`InterviewNote`, `GET/PUT /api/interviews/{id}/my-notes`, private to the author); a note kept in the browser by the old box moves to the server once. The Overview note box uses the same store. The Feedback tab puts your notes, by question with Copy, beside the scorecard form. An "Open the room" header button shows around the start.
- **27, 28, 30, 29. Recording, transcript, playback, summary**: the recorder records audio first (microphone mixed with the shared tab's sound, Opus at 32 kbit/s, screen optional; microphone only on phones) and uploads 1 MB pieces while recording (`POST …/recordings/uploads`, `POST /api/interview-recordings/{id}/chunks/{n}`, `…/complete`), so nothing nears Kestrel's limit and a crash keeps what arrived (uploads idle for 10 minutes finish on their own). "Upload a recording" takes MP4, M4A, WebM, MP3, OGG or WAV the same way. `RecordingWorker` joins the pieces, and with ffmpeg (detected at runtime, `MediaTools`) makes the file seekable, reads its length and extracts 16 kHz Opus audio; then it transcribes with `IAiAssistant.TranscribeDetailedAsync` (whisper-1 verbose segments, speakers with a diarize model; pieces of 20 minutes over 25 MB with ffmpeg, otherwise a plain "too long without ffmpeg" message) and writes the summary. The old in-request transcribe endpoint now only queues. Recording tab: player with speed, captions from `captions.vtt`, "Copy link at 12:34" (`?t=`), transcript that follows playback, click to seek, search with up and down and hit markers on a scrubber, speaker filter. Summary tab: the saved summary (`InterviewSummary`, versions kept), times link to the recording, edit, "Write it again" with a reason. Transcripts, captions and summaries are hidden from a panelist until their scorecard is in; the Summary tab shows for the people who run the job and for the panel after they submit.
- **15. Portal reschedule and cancel**: the portal's "Change time" opens the shared `SlotPicker` (`components/scheduling`) in a dialog, in the candidate's zone, with a confirm step; "Cancel interview" asks for an optional reason (`POST …/cancel` now takes `{ reason }`). Open scheduling links show on the portal as "pick a time" cards that open `/book/{token}` (`GET /public/applications/{id}/scheduling-links`). Interview emails link into the portal with one-click sign-in (`CandidateLinks`, `#interviews`).
- **16, 17. Calendar leftovers**: disconnect revokes the Google grant (Microsoft has no per-app revoke; the tokens are deleted) and is logged; the read-back stores each attendee's answer (`AttendeeResponsesJson`), the Who card shows "Accepted" or "Declined", and Needs attention lists upcoming interviews someone declined.

Not done:
- Zoom meeting links: need a Zoom server-to-server OAuth app (account id, client id and secret) and an admin setting.
- Interviewer pools ("any 1 of these 5"): need pool fields on `InterviewKit` (jobs area). Suggestions already rank lighter-loaded panels first.
- Speaker names ("Who is speaker B?") and importing a .vtt or .srt transcript; meeting notes stay as they were.
- Summaries of very long transcripts are cut at 60,000 characters instead of summarized in parts.

## Progress (wave 4)

Finished:
- **Interviewer pools** (features 11 and 12): a kit names a pool and how many people go on each interview (`InterviewKit.PoolEmails`, `PoolPick`). The kit page has an "Interviewer pool" card under the kit that saves as you change it; it is not part of the kit's versions, because who interviews does not change what is asked (`GET/PUT /api/interview-kits/{kitId}/pool`, active team members only, up to 30). In the scheduler, each round with a pool lists it best first (`POST /api/interview-kits/{kitId}/pool/suggest`, `InterviewerPools.Rank`): people with open times in the two weeks the scheduler shows, then whoever ran this round least in the last 30 days, then whoever waited longest since their last turn, then the lightest week. An empty panel is filled with the suggestion once ("Their turn"); "Use the suggestion" puts it back; each person can be added or removed.
- **Speaker names** (feature 28): "Name speakers" on a transcript, for the panel and the people who run the job once they may read it. Pick someone from the panel or the candidate, or type a name; each speaker shows their first line to help. Names show in the transcript, the speaker filter and the captions, and the next summary uses them (`InterviewRecording.SpeakerNamesJson`, `PUT /api/interview-recordings/{id}/speakers`; blinded panelists get 403).
- **Import a transcript** (feature 25): "Add a transcript" beside "Upload a recording" takes WebVTT (Zoom, Teams, Meet), SubRip (.srt) or plain text, up to 2 MB (`POST /api/interviews/{id}/transcripts`, `TranscriptFiles.Parse`): times, speakers from voice tags or "Name:" lines, and one person's split cues joined back. It shows like a recording without a player: searchable, nameable, behind the scorecard rule. The recording worker writes the summary from it.
- **Long transcripts summarized in parts** (feature 29): no 60,000-character cut. Over 40,000 characters the transcript is split on whole lines, each part gets factual notes with its times kept, and the summary is written from the notes (`InterviewSummaries.Parts`).

Not done:
- Zoom meeting links: need a Zoom server-to-server OAuth app (account id, client id and secret) that the owner must create, and an admin setting.

Entity changes: `InterviewKit.PoolEmails` (text[]), `InterviewKit.PoolPick`, `InterviewRecording.SpeakerNamesJson`; imported transcripts are recordings with `Source = "Transcript"` and no stored file. Migration `WorkInProgress_20261114161655`.

Tests: `InterviewSchedulingTests` (pure, 15 of 15): pool ranking with fair turns, transcript files (VTT, SRT, plain text), parts that never lose or cut a line, speaker names in captions. `RecordingTranscriptionTests` (2 of 2): an imported transcript is never sent for transcription, a long one is summarized in parts with its first and last lines read, speakers renamed in the captions, unknown speakers refused, a blinded panelist refused.
