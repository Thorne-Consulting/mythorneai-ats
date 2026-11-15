# Careers site, application form and candidate portal

## Overall
- **The careers site is invisible to Google and wears the vendor's brand, not the employer's.** Every public page is a client component (`'use client'` + `useQuery`), so the server HTML for `/careers/[id]` has no job text at all (checked: `curl` of the job page contains 0 words of the description). The `<title>` is "Careers · MyThorneAI ATS" and the meta description is our own tagline "Smarter hiring. Brighter futures." (`src/web/src/app/layout.tsx:14-18`, `src/web/src/app/careers/layout.tsx:4`). No per-job metadata, no Open Graph, no JobPosting JSON-LD, no sitemap. The header logo, favicon and title suffix are the MyThorneAI mascot (`PublicFrame.tsx:29-37`). An Acme candidate sharing a job on LinkedIn sees our tagline. The `Organization` entity has no logo, colour, website or intro (`src/server/Domain/Users.cs:15-45`). This is the biggest gap against Ashby and Greenhouse boards.
- **The apply flow loses people and the data model leaks.** The application only counts after the candidate types a 6-digit code, but nothing reminds them, so a closed tab means the application is quietly lost (`ApplicationStatus.PendingVerification`, with no reminder and no cleanup). Worse, an *unverified* submission already overwrites an existing candidate's name and phone and attaches a resume. That resume is then parsed into their profile and replaces it (`PublicJobEndpoints.cs:105-110, 134-149`, `ResumeProfileWriter.cs:43-58`). No "application received" email exists in the product. The portal shows one only because the seed data inserts it (`Data/Seed/DevelopmentLocalCandidates.cs:147`).
- **Self-scheduling is a dead end for most teams.** "Find another time" and "Change time" return zero slots unless *every* interviewer has connected a calendar (`UserCalendarService.cs:92-93`). When they all have, it offers every 30 minutes, around the clock, for 14 days, as a flat list of full-width buttons, including 3 a.m. slots and slots in the past (`UserCalendarService.cs:106-112`, `ApplicationParts.tsx:209-232`). Times never show a time zone (`portal.ts:135-142`). Candidate emails print raw UTC like "booked for 2026-11-14 15:00:00Z" (`PublicInterviewBookingEndpoints.cs:247,337`, `InterviewEndpoints.cs:185`).
- **The portal has two parallel navigations for a person who usually has one application.** There are global hubs (Overview, Applications, Interviews, Messages, Help) and per-application tabs (Overview, Interviews, Messages, Emails) that render the *same* components (`PortalHubs.tsx` reuses `Interviews`, `Thread` and `EmailsList` from `ApplicationParts.tsx`). Emails duplicate the chat: every team message also appears as an email copy, and both show up in "Recent activity". The sidebar puts a grey "1" beside all four items, each counting something different (`PortalShell.tsx:59-88`). On a 390px phone the pill tabs cut off "Messages" and hide Help, and the header truncates the brand to "MyThorne…" (phone screenshots).
- **Several screens promise things that do not exist.** "You will get a reminder before your interview" (`ApplicationFrame.tsx:171`): there is no candidate interview reminder in `EmailOutboxWorker`. "You can share one later by messaging the team" (`ApplyWizard.tsx:300`): messages are text only. "This is exactly what applicants see" (`JobSections.tsx:239`): the preview has a different layout and no questions section. "Your offer is almost ready" appears as soon as a stage *name* contains "offer", before any offer exists or is approved (`portal.ts:150-151,196-204`).
- **The candidate cannot see what they submitted.** There is no resume, no answers, no contact details and no way to add a document or update a phone number.

**Target experience.** The careers site is server-rendered under the employer's logo, colour and domain. It is one dense, filterable list like Linear's or Ashby's, and each job page renders rich text, pay, posting date and the interview process, with JSON-LD so it appears in Google for Jobs. Applying starts with the resume, which fills the form. Questions are typed (yes/no, choice, text, link, file). The application reaches the team at once, and a one-click email link confirms it. The candidate gets a branded "we received it" email with a link that signs them in. The portal is three places: **Home** (every application with a plain-words status, what to do now and the next interview), **Interviews** (a Calendly-grade picker in the candidate's own time zone, plus add-to-calendar, prep notes and reschedule) and **Inbox** (one thread per application, with names, files, read state, and replies by email). Every email is branded, in the candidate's time zone, with a magic link back.

## Features

### Careers board (job list, grouping, search) — COMPLETE · M
- Where: `/careers`; `src/web/src/features/careers/CareersBoard.tsx`, `PublicFrame.tsx`, `public-api.ts`; API `GET /public/jobs` in `src/server/Features/Public/PublicJobEndpoints.cs:14-65`.
- Today: Works. Search goes to the API (`ILIKE` on title, department and description). Results are grouped by department into 2-column card grids, with "Show more jobs" paging 50 at a time. Empty states for "no jobs" and "no match" are good. Jobs sort by `UpdatedAt` (`:45`), so editing an old job moves it to the top. Rendered client-side only.
- Design critique (desktop 1440 shot, 1510px tall for 9 jobs): six of seven department groups hold one job. Each lone card sits in a `md:grid-cols-2` grid (`CareersBoard.tsx:193`) with the right half empty, so the page reads lopsided and is about 3x taller than it needs to be. The grey count after each heading ("Data 1") is noise. The "9 of 9 jobs" counter floats at the far right on its own (`:133-137`). "Jobs at MyThorneAI" repeats the brand already in the header, and the description "Apply in a few steps. Then follow your application in the candidate portal." is product copy, not employer copy. The "N openings" badge is green, which the colour rules reserve for open, hired and success. There is no posting date, so a candidate cannot tell a fresh job from a stale one. On phone each card wraps its badges onto two lines and the page is 1876px long.
- Product critique: Linear and Vercel show one line per job (title left; location and type right) under department headings, so 40 jobs fit on one screen. Ashby adds compensation in the row and a team and location sidebar. Greenhouse boards have an embed for the employer's own site. We have no hero or intro, no "why work here", and no embed or JSON feed for the customer's own website. There is also no "general application" route when nothing fits.
- Complete means:
  - [ ] Server-rendered page (route `page.tsx` fetches `/public/jobs` on the server; the client only handles filter changes).
  - [ ] One-line rows: title (link) · location · work mode · type, with pay when set and "Posted 3 days ago". Group by department with a sticky group label. No per-group count.
  - [ ] Employer header: logo, an intro paragraph and an optional "Life at {company}" link, all from branding settings.
  - [ ] Sort by `OpenedAt` descending (the field exists on `Requisition`).
  - [ ] An embed mode (`/careers?embed=1`: no header or footer, links open in a new tab) and a documented public JSON feed (the `/public/jobs` shape already exists), so customers can show jobs on their own site.
  - [ ] Optional per-org "general application" entry when no job fits (a hidden job used as a talent pool).
  - [ ] Phone: rows collapse to title plus one meta line; no card chrome.
- Backend: expose `OpenedAt` (as `postedAt`) and pay fields in `GET /public/jobs`; order by `OpenedAt`. Exclude confidential or unlisted jobs (see "Job visibility" under Cross-area notes).
- Libraries: none. Server components and Tailwind cover it.

### Department, location and work-mode filters — COMPLETE · S
- Where: `CareersBoard.tsx:53-131`; API `department` and `location` query parameters (`PublicJobEndpoints.cs:36-39`).
- Today: The filters run on the client over the pages already loaded (`:74-79`). Their options are built from those same loaded jobs (`:114,120,126`). With more than 50 jobs, the options miss departments and the results miss matches beyond page one. The API already supports `department` and `location` but the page never sends them. Filters are not in the URL, so "all Engineering jobs in Boston" cannot be shared or bookmarked. Work mode is filtered only on the client.
- Design critique: three bordered `FilterSelect`s plus a wide search box take a whole row on desktop and three rows on phone (phone shot). The empty "All departments" labels give no counts.
- Product critique: Ashby and Greenhouse show counts per option ("Engineering (12)"), keep the state in the URL, and let you pick several locations. Remote is its own top-level choice.
- Complete means:
  - [ ] Filter state in the query string (`?department=&location=&mode=&q=`), read on the server.
  - [ ] Options and counts come from the API (facets over all open jobs), not from loaded pages.
  - [ ] Multi-select for location; "Remote" as a location option when `WorkMode` is remote.
  - [ ] On phone, one "Filters" button opening a `Drawer` with the three groups and a live count.
- Backend: add `GET /public/jobs/facets` (distinct department, location and work mode with counts), and add `workMode` to `GET /public/jobs`. Match exact values, not `ILIKE %x%` (`:37,39`: "Design" currently also matches "Product design ops").
- Libraries: none.

### Departments and locations as data — COMPLETE · M
- Where: `Requisition.Department`, `Location` and `WorkMode` are free strings (`src/server/Domain/Requisitions.cs:8-11`). They are entered as free text in `CreateRequisitionPage.tsx`.
- Today: Any spelling goes, so "Remote, US", "Remote (US)" and "US Remote" become three filter options. `distinct()` only trims (`CareersBoard.tsx:23-24`).
- Product critique: Ashby has Departments (nested) and Locations (with a remote flag and an address). Google for Jobs needs `addressLocality`, `addressRegion` and `addressCountry`. For remote jobs it needs `jobLocationType: TELECOMMUTE` plus an `applicantLocationRequirements` country.
- Complete means:
  - [ ] Department and location fields on job create and edit become `Autocomplete` over existing values (type to reuse; a new value is allowed), so there are no near-duplicates.
  - [ ] Location gets structured parts: city, region, country (ISO code) and "remote allowed in" countries.
  - [ ] A one-time cleanup screen in Settings that merges duplicate values (rename across jobs).
- Backend: add `LocationCity`, `LocationRegion`, `LocationCountry` and `RemoteCountries` (string array) to `Requisition` plus a migration that parses existing "City, ST" values. Add `GET /api/jobs/values` for the autocomplete lists. Add a rename endpoint for the merge screen.
- Libraries: none (`Autocomplete` is already in `components/ui`).

### Job page (public posting) — COMPLETE · M
- Where: `/careers/[id]`; `src/web/src/features/careers/JobPage.tsx`, `src/web/src/components/careers/JobPostingView.tsx`; API `GET /public/jobs/{id}`.
- Today: Title, badges, description, "What we will ask you", an apply card with Copy link and Share, "Other open jobs", and a sticky Apply bar on phone. Closed or missing jobs get a good "no longer open" state, but it is a client-side 200 (a soft 404 for search engines). **The description is shown as plain text split on blank lines** (`JobPostingView.tsx:31-34,67`). The job description is written in a Plate Markdown editor at creation (`CreateRequisitionPage.tsx:257`), and the server joins the posting template's header, description and benefits Markdown (`RequisitionEndpoints.cs:411-415`). So any heading, bold, list or table appears to applicants as raw `##`, `**` and `|`. The seed descriptions are single sentences, which hides this in the screenshots.
- Design critique (desktop shot): the left column holds a 2-line description, and the right rail ("Interested?" plus 5 "Other open jobs") is about 3x taller than the content, so the page looks like a sidebar with a footnote. The eyebrow "MyThorneAI" in blue above the title repeats the header brand (`JobPostingView.tsx:38`). The department badge is blue (`:41`), and blue means interview, action and links in this system. The breadcrumb has one item ("Open jobs"), so a plain "← All jobs" link would say the same with less weight. The apply card's helper text puts friction first: "We email you a code to confirm it is really you." On phone, the sticky Apply bar covers the 4th "Other open jobs" row, and Share is missing from the bar (`JobPage.tsx:200-207`).
- Product critique: Ashby and Greenhouse postings render rich text with sections, and show pay range, employment type, location, posting date and team. Ashby also shows the interview process. We have `PostingTemplate.InterviewStagesMarkdown` and `BenefitsMarkdown` (`Requisitions.cs:41-45`) but never show the interview stages. There is no pay field at all.
- Complete means:
  - [ ] Description rendered as rich text on the server with Plate's static renderer (headings, lists, bold, links, tables, quotes), matching what the editor showed.
  - [ ] Header: title, then one meta line (team · location · work mode · type · pay · "Posted Nov 3"), with the Apply button in the header on phone and in the rail on desktop. Drop the company eyebrow.
  - [ ] Sections from the template: About the role, Benefits, and "How we hire" (the interview stages as a numbered list).
  - [ ] Pay range (min, max, currency, period, and a "show on posting" switch) on the job, shown as "$95k – $120k a year".
  - [ ] Rail: the apply card only (Apply, Copy link, Share), sticky. Short copy: "Takes about 3 minutes."
  - [ ] A missing or closed job returns a real 404 (`notFound()`), with the same friendly page.
  - [ ] Phone: the sticky bar holds Apply plus a share icon.
- Backend: add `PayMin`, `PayMax`, `PayCurrency`, `PayPeriod` and `ShowPay` to `Requisition` (and the job editor, cross-area). Store the template sections as separate fields rather than joining them into `Description` (`RequisitionEndpoints.cs:411-415`), or keep the join but render Markdown. Expose `OpenedAt`, the pay fields and the interview stages in `GET /public/jobs/{id}`.
- Libraries: `platejs@53.3.15` (installed): `platejs/static` (`createStaticEditor`, `PlateStatic`, `serializeHtml`) with `@platejs/markdown@53.3.12` `deserializeMd` (installed). Use these instead of the paragraph splitter. It is the same node set as the editor, so the posting looks exactly as authored, and it renders on the server.

### "Other open jobs" rail — MERGE · S
- Where: `JobPage.tsx:77-80,170-195`.
- Today: The rail fetches `/public/jobs?limit=6` with no relation to the current job and shows 5 jobs, each with full badge rows.
- Critique: The rail competes with Apply and is taller than most descriptions. Greenhouse, Ashby and Linear do not show it on the posting.
- Survivor: a short "More jobs in {department}" list (up to 3 jobs from the same department, title plus location in one line) **below** the description, and an "All N open jobs" link under the apply card. The `JobMeta` badge stacks move out of the rail.

### "What we will ask you" questions preview — DONE
- Where: `JobPage.tsx:112-126`.
- Why done: It works and is ahead of Greenhouse and Ashby, which do not preview questions. It lists the questions so candidates can prepare. The only follow-up is to read the new typed questions when they land (covered under "Custom application questions").

### Copy link and share — COMPLETE · S
- Where: `JobPage.tsx:81-104,141-166`; public link card in `JobSections.tsx`.
- Today: Copy link and the Web Share API (shown only when the browser supports it). URLs are raw GUIDs: `/careers/c8d2451a-7807-4c63-a8c3-4f63653dcc15` (posting shot).
- Product critique: Ashby and Lever links carry the job name for readability. Recruiters post the same job on LinkedIn, Indeed and a newsletter and want to know which one brought people. We have no per-channel links.
- Complete means:
  - [ ] Readable URL `/careers/{slug}-{shortId}` (for example `/careers/product-designer-3f9a`), with the GUID path redirecting to it.
  - [ ] On the job's "Job posting" page, "Copy link for…" LinkedIn, Indeed, Email or Referral, each adding `?src=` (feeds Source tracking).
  - [ ] Phone sticky bar gets a share icon.
- Backend: add `Requisition.Slug` (generated from the title, unique), and make `GET /public/jobs/by-slug/{slug}` or the id route accept both.
- Libraries: none.

### SEO and share previews — COMPLETE · M
- Where: `src/web/src/app/careers/**`, `src/web/src/app/layout.tsx`.
- Today: No `generateMetadata`, `sitemap.ts`, `robots.ts`, Open Graph or JSON-LD (grep finds none). The server HTML is a skeleton.
- Product critique: Google for Jobs is free traffic, and Ashby and Greenhouse boards emit `JobPosting` structured data by default. Slack, LinkedIn and iMessage previews are the first impression of a job.
- Complete means:
  - [ ] `/careers` and `/careers/[slug]` render on the server (fetch from the API in the route; the client hydrates filters only).
  - [ ] `generateMetadata`: title "{Job} · {Company} careers", description = the first 155 characters of the plain description, and a canonical URL built from `Organization.PublicUrl`.
  - [ ] An Open Graph image per job from `opengraph-image.tsx` (company logo, job title, location; brand colour background).
  - [ ] JSON-LD `JobPosting`: `title`, `description` (HTML from Plate `serializeHtml`), `datePosted` (`OpenedAt`), `validThrough`, `employmentType` (map "Full time" to `FULL_TIME`), `hiringOrganization` (name, logo, website), `jobLocation` (structured address) or `jobLocationType: TELECOMMUTE` plus `applicantLocationRequirements`, `baseSalary` when shown, `identifier` (job code), `directApply: true`.
  - [ ] `app/sitemap.ts` listing open jobs with `lastModified`; `app/robots.ts` allowing `/careers` and disallowing `/candidate-portal` and the workspace.
  - [ ] Closed jobs return 404 so Google drops them.
  - [ ] The site title suffix and favicon use the employer's name and logo on public routes, not "MyThorneAI ATS".
- Backend: the fields from "Job page" and "Departments and locations", plus `Organization.LogoUrl` and `WebsiteUrl` (see branding). The public rate limit is per IP at 60 a minute for all of `/public` (`Program.cs:77-85`). Server rendering sends requests from the Next server, so either forward the client IP (`X-Forwarded-For` is already honoured) or give the read-only job endpoints a separate, larger policy.
- Libraries: built into `next` 16 (Metadata API, `next/og` `ImageResponse`, `sitemap.ts`, `robots.ts`). Optional: `schema-dts@2.1.0` (types only, dev dependency) to type the JSON-LD object. Skip it if a plain object is enough.

### Employer branding and careers settings (`/admin/portal`) — COMPLETE · M
- Where: `/admin/portal` → `OrganizationSettings section="portal"` → `PortalAddressSection` (`src/web/src/features/admin/AdminSettings.tsx:409-436`); `PublicFrame.tsx`; `Organization` (`Domain/Users.cs:15-45`); `EmailHtml.Wrap` (`Infrastructure/EmailSender.cs:19-33`).
- Today: The page holds one field, "Web address of this app", used to build portal links in emails. Nothing else about the public site can be set. The public header shows our mark and the workspace name (`PublicFrame.tsx:29-38`), and the footer says "Powered by MyThorneAI ATS".
- Design critique (admin shot): a full settings page with breadcrumb, title and card for one input. The title "Candidate portal" with the description "The web address candidates use to follow their applications" is wrong for a field that also drives every email link.
- Product critique: Ashby, Greenhouse and Lever all let you set a logo, brand colour, intro text and a custom domain, and they preview the board. A customer judges the ATS by how their own careers page looks.
- Complete means:
  - [ ] Rename the page "Careers site" and group it: **Brand** (logo upload with light and dark variants, square icon for the favicon, accent colour with a contrast check, company website), **Careers page** (intro paragraph in the Plate editor, optional hero image, "Life at…" link, show or hide pay, require a resume or allow skipping), **Address** (public URL, with custom-domain steps shown as copyable DNS records), **Portal** (support email shown on portal Help, a short welcome line).
  - [ ] A live preview pane (`SplitView`) of the board and a job page at desktop and phone width.
  - [ ] `PublicFrame` reads the brand: employer logo plus name, the accent colour as `--primary` on public routes only (a computed CSS variable, the one allowed dynamic style), and a subtle "Powered by" line.
  - [ ] Emails use the same logo and accent (see "Candidate emails").
- Backend: `Organization` gains `LogoUrl`, `LogoDarkUrl`, `IconUrl`, `AccentColor`, `WebsiteUrl`, `CareersIntroMarkdown`, `CareersHeroUrl`, `SupportEmail`, `ShowPay` and `RequireResume`. An image upload endpoint reuses `LocalFileStore` with an image allow-list. `GET /public/organization` returns the public subset (today it returns only `name`, `PublicPortalEndpoints.cs:55-56`).
- Libraries: none. Colour contrast check: a 10-line WCAG luminance function (no library).

### Job posting preview in the workspace (`/jobs/[id]/posting`) — COMPLETE · S
- Where: `src/web/src/features/requisitions/JobSections.tsx:196-266`.
- Today: A public link card plus a "Preview" that renders `JobPostingView` with a disabled Apply button in the header. The public page instead puts Apply in a rail and adds questions, so the claim "This is exactly what applicants see" (`:239`) is false.
- Design critique (posting shot): the preview's grey Apply button under the badges is a layout applicants never see. The raw GUID link in monospace is hard to read and share.
- Complete means:
  - [ ] Render the real public job component (the same server component used at `/careers/[slug]`) inside the preview, with a Desktop and Phone toggle.
  - [ ] A draft or closed job shows the preview with a "Not public" ribbon (keep the existing alert).
  - [ ] Link card shows the slug URL and the per-channel copy menu (see "Copy link and share").
- Backend: `GET /api/jobs/{id}/posting-preview` returning the public shape for jobs that are not open yet.
- Libraries: none.

### Apply wizard (steps, layout, validation, accessibility, mobile) — COMPLETE · M
- Where: `/careers/[id]/apply`; `src/web/src/features/careers/ApplyWizard.tsx`, `src/web/src/components/ui/wizard.tsx`.
- Today: Steps are Contact, then Resume, then Questions (if any), then Review. Contact checks name and email. LinkedIn must be an `https://` link. Phone and location are free text. Review has Edit links. It submits either multipart (with a resume) or JSON.
- Design critique (apply shots): three columns at 1440 (step list 220px, form, 320px aside). The aside holds only three badges and "Read the job description" (`ApplyWizard.tsx:206-218`), so it wastes a third of the width and squeezes the form. The page title "Apply for Community programs coordinator" wraps to two lines on phone. "Back" shows on step 1 in a disabled state (`wizard.tsx:118-125`). "Next" is a grey disabled button until the form is valid (`:131-137`), and the only clue is a sentence under the form, "Add your first name, last name and email to continue." No field turns red and focus does not move. The steps are not a `<form>`, so Enter does nothing. On step change, focus stays on the clicked button, so screen readers do not hear the new step. On phone the step pills cut "Review" (phone shot), and the sticky Back and Next bar takes about 72px of an 844px screen above the keyboard.
- Product critique: Ashby and Greenhouse apply on **one page** (resume first, then contact, then questions), and Lever pre-fills from the resume. Our 3–4 step wizard adds clicks to a form with 6 fields. The `Wizard` rule in CLAUDE.md applies to forms "longer than one screen", and this one is not.
- Complete means:
  - [ ] One page with three titled sections (Resume, Your details, Questions) and a single "Submit application" button. Use the wizard only when a job has more than 6 questions.
  - [ ] Layout: one centered column of 640px max, with the job title and meta line as a compact header ("Applying for Product designer · New York · Hybrid"). No aside.
  - [ ] Validate on submit and on blur: errors under each field, focus the first invalid field, and an `aria-live` summary at the top ("2 fields need attention").
  - [ ] A real `<form>` with `autocomplete` on every field (already set for most).
  - [ ] Phone field with country code and formatting. Location with a hint "City, country".
  - [ ] Honeypot field plus the existing rate limit as spam protection.
  - [ ] Phone: sticky submit bar only after scrolling past the resume section; 16px gutters; no horizontal step list.
- Backend: none beyond the items below.
- Libraries: `libphonenumber-js@1.13.16` (use the `min` metadata). It validates and formats international numbers so the team gets dialable numbers. A regex cannot do that across countries.

### Resume upload and autofill — COMPLETE · M
- Where: Resume step `ApplyWizard.tsx:278-304`; `POST /public/jobs/{id}/applications/resume` (`PublicJobEndpoints.cs:121-156`); `LocalFileStore.SaveValidatedAsync`; `ResumeTextExtractor`, `ResumeExtractor` (AI), `ResumeParseWorker`.
- Today: The resume comes **after** contact details, so nothing is pre-filled. The upload happens only at final submit. The resume is parsed later, in the background, into the candidate profile for recruiters. The candidate never benefits from it.
- Design critique: The `FileDrop` "Remove file" button has no visible focus ring (`components/ui/file-input.tsx:71-77`).
- Product critique: Lever, Ashby and Workday all do "Autofill from resume". Typing contact details that are already in the PDF is the most-complained-about step in applying.
- Complete means:
  - [ ] Resume is the first section: drop or browse, with a progress bar.
  - [ ] On upload, call a parse endpoint and fill first name, last name, email, phone, location and LinkedIn. Fields filled this way get a small "From your resume" hint and stay editable. Never overwrite what the person already typed.
  - [ ] The upload returns a short-lived file token, so final submit does not upload the file again.
  - [ ] It works without AI: contact fields come from the extracted text by regex (email, phone, LinkedIn URL, first line as name). The AI extractor adds location and current title when configured.
  - [ ] Clear error copy for a scanned PDF with no text ("We could not read this file. Fill in your details below.").
- Backend: `POST /public/resume/parse` (multipart, rate limited) stores the file in a temporary area and returns `{ fileToken, fields }` using `ResumeTextExtractor` plus regex, and `ResumeExtractor` when AI is on. Apply accepts `fileToken`. A worker deletes unused temporary files after 24 hours.
- Libraries: none new. `FieldCure.DocumentParsers` and the AI client are already referenced in the server project.

### Apply without a resume — COMPLETE · S
- Where: Checkbox at `ApplyWizard.tsx:295-302`.
- Today: Allowed for every job. The helper promises "You can share one later by messaging the team from the candidate portal", but portal messages cannot carry files.
- Complete means:
  - [ ] A per-job (default: per-org) "Resume required" switch. When it is off, keep the "Apply without a resume" option.
  - [ ] Change the promise to point at the real upload in the portal ("You can add one later in the candidate portal"), which exists once "Profile, documents and data" ships.
- Backend: `Requisition.ResumeRequired` (nullable, falls back to `Organization.RequireResume`). Enforce it in `POST /public/jobs/{id}/applications`.
- Libraries: none.

### Custom application questions — COMPLETE · L
- Where: `src/web/src/features/careers/questions.ts` (parser), questions step `ApplyWizard.tsx:306-323`; `Requisition.ApplicationQuestionsMarkdown`; `Application.ApplicationAnswersMarkdown`.
- Today: The questions are free Markdown, guessed into a list by three heuristics (list items, else lines ending in "?", else paragraphs). Required is marked with "(required)" or "*". Every answer is a textarea. Answers are saved as one Markdown blob ("### Question\n\nAnswer"). Questions are copied from the posting template **only at job creation** (`RequisitionEndpoints.cs:428`). There is no way to add or edit questions on an existing job: no endpoint takes them after create, and the job Settings page has only a description textarea (`RequisitionSettings.tsx:175`).
- Product critique: Greenhouse and Ashby have a question builder with types (short text, long text, yes/no, single and multiple choice, number, link, file, date), required flags, help text, a reusable question bank, and "knockout" answers that auto-tag or reject. Answers are structured, so recruiters can filter "Authorized to work in the US = No". A Markdown blob cannot be filtered, scored or reported on.
- Complete means:
  - [ ] Question types: short text, long text, yes/no, single choice, multiple choice, number, link, file upload, date.
  - [ ] Per question: label, help text, required, and options. Drag to reorder.
  - [ ] An org-level question bank (reuse "Work authorization", "Notice period", "Salary expectation"). Posting templates pick from it.
  - [ ] An editor on the job's "Job posting" page and in job creation, with a live preview of the apply form.
  - [ ] Optional per-option outcome for yes/no and choice questions: tag the application or flag it for review (no automatic rejection without a person, to keep evaluation human).
  - [ ] The apply form renders typed controls with validation. The review section and the recruiter's application view show question and answer pairs.
  - [ ] Recruiter filters on answers in the candidate list (cross-area).
- Backend: `ApplicationQuestion` (Id, RequisitionId or null for the bank, Type, Label, HelpText, Required, OptionsJson, SortOrder, BankQuestionId) and `ApplicationAnswer` (ApplicationId, QuestionId, ValueJson, AttachmentId). A migration parses `ApplicationQuestionsMarkdown` with the same rules as `questions.ts` into text questions, and old answers stay in the Markdown column, read-only. Add `PUT /api/jobs/{id}/questions`, the bank CRUD, a public job payload with typed questions, and apply validation per type.
- Libraries: none. `@platejs/dnd@53.3.8` and `react-dnd` are installed for reordering. Existing `Select`, `Checkbox`, `RadioGroup`, `NumberInput` and `FileDrop` cover the controls.

### Save and resume later — COMPLETE · S
- Where: `ApplyWizard.tsx:64-72` (React state only).
- Today: A reload, a back-swipe on phone or a closed tab loses everything typed.
- Product critique: Workday saves drafts on the server behind an account, which is heavy. For a short form, the right bar is "nothing typed is ever lost on this device".
- Complete means:
  - [ ] Autosave contact details and answers to `localStorage` keyed by job id (not the file). Restore on return with a quiet "We restored what you typed. Start over" line. Clear it on submit.
  - [ ] Wrap the read and write in try/catch (private mode).
- Backend: none.
- Libraries: none.

### Email confirmation before the application counts (and duplicate applies) — COMPLETE · M
- Where: `PublicJobEndpoints.cs:89-174`, `PublicCandidateAccessEndpoints.cs:14-33`, `ConfirmApplication` in `ApplyWizard.tsx:399-545`.
- Today: Submit creates the candidate and a `PendingVerification` application and queues a code email. The team sees nothing until the code is typed within 15 minutes. "Send a new code" re-posts the whole application as JSON. Several defects:
  - **No recovery.** Close the tab and the application is lost unless the person applies again from scratch, including the resume, which creates a second `Attachment`. No reminder, no expiry clean-up, and orphan candidates build up.
  - **Unverified data overwrites real records.** For an existing email, the JSON path overwrites `FirstName`, `LastName`, `Phone`, `Location` and `LinkedInUrl` (`:105-110`). The resume path attaches a file and queues a parse (`:148-149`), and the parse replaces the candidate's whole work history (`ResumeProfileWriter.cs:43-58`). Anyone who knows a candidate's email can rewrite that candidate's profile without confirming anything.
  - Verify picks the **newest** pending application for the email (`PublicCandidateAccessEndpoints.cs:16-18`). Apply to job A, then job B, and A's code no longer works, so A stays pending forever.
  - Already applied: the API returns the same 202 "Check your email" (`PublicJobEndpoints.cs:98-99,132-133`) but sends nothing. The page tells people to wait for a code that never comes, with a footnote about it (`ApplyWizard.tsx:530-540`).
  - The resume path does not update phone, location or LinkedIn for existing candidates (`:135-136`), unlike the JSON path.
- Product critique: Greenhouse, Ashby and Lever accept the application immediately. Gating it behind a code is an unusual conversion cost, and doing it without a magic link or reminder makes it worse.
- Complete means:
  - [ ] Submit is final. The application reaches the team at once with an "Email not confirmed" badge. The candidate sees "Your application is in" straight away.
  - [ ] The "We received your application" email holds a one-click "Confirm and open your portal" link (a signed token, valid 7 days) **and** the 6-digit code for people on another device. A reminder goes out after 24 hours if unconfirmed.
  - [ ] Profile changes from an unconfirmed submission are held on the application ("Submitted details") and merged into the candidate record only after confirmation. New candidates are created as today.
  - [ ] Codes are per application, and verify matches the application the code was sent for (send `applicationId` back from apply).
  - [ ] Already applied: send an email "You already applied for {job}. Open your application" with a magic link, and say on screen "If you have applied before, we emailed you a link to your application."
  - [ ] Clean-up worker: unconfirmed applications older than 30 days are closed and their unmerged files deleted.
- Backend: `Application.EmailConfirmedAt`, `Application.SubmittedProfileJson`, and a `CandidateMagicLink` table (TokenHash, CandidateId, ApplicationId, Purpose, ExpiresAt, UsedAt). Change the apply endpoints to create `Active` applications. Add `POST /public/magic/{token}`, which signs in and confirms. Add the reminder and clean-up passes in `EmailOutboxWorker`.
- Libraries: none.

### Confirmation screen — COMPLETE · S
- Where: `ApplyWizard.tsx:459-485`.
- Today: A green check, "Your application is in", and "See other jobs" or "Track your application". Clean.
- Product critique: The moment after applying is when people are most engaged. Greenhouse shows what happens next. Ashby shows the job and a summary.
- Complete means:
  - [ ] Three-step "What happens next" (We review → you hear back by email → interviews), using the job's "How we hire" stages when set.
  - [ ] The address the confirmation email went to, with "Not you? Fix your email".
  - [ ] A "Track your application" button that works without typing a code (the session is created on submit and held in a cookie; see "Sign-in and session").
- Backend: return a session on apply (see "Sign-in by code and session").
- Libraries: none.

### Source tracking — COMPLETE · S
- Where: `Source = "Career site"` hard-coded on the candidate and application (`PublicJobEndpoints.cs:102,114,135,141`).
- Today: Every careers application reads "Career site", whether it came from LinkedIn, an Indeed ad or a referral link.
- Product critique: Source of hire is the first report every recruiting lead asks for. Greenhouse and Ashby read the `src` and `gh_src` parameters and UTM tags.
- Complete means:
  - [ ] Read `?src=` and `utm_source`/`utm_medium`/`utm_campaign` on the board and job page, keep them through to apply (`sessionStorage`), and send them with the application.
  - [ ] Optional "How did you hear about us?" question type in the bank.
- Backend: `Application.Source` takes a sanitized `src` (allow-list per org, fallback "Career site"). Add `Application.UtmJson`.
- Libraries: none.

### Sign-in by code and session — COMPLETE · M
- Where: `/candidate-portal`; `PortalSignIn.tsx`, `PortalProvider.tsx`, `portal.ts:39-63`; `PublicCandidateAccessEndpoints.cs:35-77`.
- Today: Enter your email to get a code, then enter the code. The server session lasts 30 days (`:74`), but the token lives in `sessionStorage` (`portal.ts:39-63`), so **every new tab or visit needs a new emailed code**. Every link from an email opens a new tab, so every click means another code. "Sign out" only clears the browser copy (`PortalProvider.tsx:70-78`), and the token stays valid on the server. The code request sends email directly with `IEmailSender` (`:44`) instead of the outbox, so it skips the bounce check and retries. After the code is sent there is no "Send a new code" button, only "Use a different email" (`PortalSignIn.tsx:119-142`). The code input has no `maxLength` and does not submit on the 6th digit.
- Design critique (browser check of the sign-in page): a lone 448px card titled "Candidate portal". Whose portal is only in the small header text. No employer logo.
- Product critique: Slack and Notion use magic links with a code fallback. Ashby links candidates straight into their scheduling page. Emails from us should open the right page signed in.
- Complete means:
  - [ ] Session in an `httpOnly`, `Secure`, `SameSite=Lax` cookie with 30-day sliding expiry. No token in JavaScript.
  - [ ] Every candidate email link is a magic link to the exact page (application, interview picker, thread). A link that is expired or already used falls back to "Email me a code" with the email pre-filled.
  - [ ] Code screen: a single numeric input, `maxLength=6`, submits on the 6th digit, "Send a new code" with a 30-second countdown, and "Use a different email".
  - [ ] Sign out revokes the server session.
  - [ ] The sign-in card shows the employer logo and "Sign in to follow your applications at {company}".
- Backend: issue the cookie on verify, the magic link and apply. Read the cookie in `CandidateIdFromTokenAsync` and keep the header for one release. Add `POST /public/portal/sign-out` (delete the session row), and send access codes through `EmailOutbox` (`TemplateKey = "portal-code"`). The four copies of the token lookup in `PublicInterviewBookingEndpoints.cs` should call the shared `CandidateIdFromTokenAsync`.
- Libraries: none. ASP.NET Core cookies are built in. Skip `input-otp@1.5.0`: a native input with `autocomplete="one-time-code"` does the job.

### Portal shell and navigation — COMPLETE · M
- Where: `PortalShell.tsx`, `PortalProvider.tsx:136-151`, `PublicFrame.tsx`.
- Today: A desktop sidebar with avatar, name and "Applying to {company}", then Overview, Applications, Interviews and Messages, then Support → Help. On phone this becomes scrolling pills.
- Design critique: The counts mean four different things (to-dos, active applications, booked-or-to-book interviews, unread). All are grey, so a booked interview looks as urgent as an unread message (desktop home shot: four "1"s). Interviews shows an amber "Pick a time" badge instead of a count only when there is something to book (`:79-85`), which is good but inconsistent with the rest. On a 390px phone the pills cut off "Messages" and hide "Help" (phone shots). The header holds brand plus "Open jobs", "Portal" and "Sign out", and the brand truncates to "MyThorne…".
- Product critique: A candidate usually has one or two applications. Intercom's Messenger and Calendly's invitee pages put the next action first and keep navigation to two or three items.
- Complete means:
  - [ ] Three destinations: **Home**, **Interviews**, **Inbox**. Help moves to the footer and a "Need help?" link (see Help).
  - [ ] Badges only for things that need action: unread messages (blue dot with a number) and times to pick (amber). No totals.
  - [ ] Phone: a bottom tab bar with the three items (fits 390px), with the account (name, "Sign out") in an avatar menu in the header.
  - [ ] Employer logo in the header (from branding).
- Backend: none.
- Libraries: none.

### Home (to-do, applications, next interview) — COMPLETE · S
- Where: `/candidate-portal/home`; `PortalOverview.tsx`.
- Today: A greeting, then "To do" (pick a time, unread messages, offer), "Active applications" (cards with a 4-segment bar), "Recent activity", and a "Next interview" card on the right at xl.
- Design critique: Good bones, and the strongest page in the area. The "Next interview" card is the most time-critical thing, but on phone it is at the very bottom, below 6 activity rows (phone shot). The application card's 4-segment bar is `aria-hidden` and unlabelled, so sighted users do not know what the segments mean either. The time "Sun, Nov 15, 10:00 AM" has no time zone.
- Product critique: Lead with the one thing that matters: "Your interview is tomorrow at 10:00 a.m. PST. Join · Add to calendar".
- Complete means:
  - [ ] Order: the next interview (if within 7 days) as a full-width banner with Join and Add to calendar, then To do, then all applications (active first, closed in a collapsed "Closed applications" group).
  - [ ] Progress shown as labelled steps ("Review → **Interviews** → Decision"), not unlabelled bars.
  - [ ] Every time shows the candidate's zone ("10:00 AM PST").
  - [ ] Remove "Recent activity" from Home (see the MERGE below).
- Backend: none.
- Libraries: none (`Intl.DateTimeFormat` with `timeZoneName: 'short'`).

### Recent activity feed — MERGE · S
- Where: `PortalOverview.tsx:138-158`, `activityFeed` in `portal.ts:229-266`.
- Today: The latest 6 entries mixing messages and email copies. Every team message appears twice: "The hiring team wrote to you" and the email copy "A message about your … application" (desktop home shot, first two rows).
- Survivor: the per-application timeline on the application page (real events: applied, moved to interviews, interview booked, message received). Home keeps only To do.

### Applications list page — MERGE · S
- Where: `/candidate-portal/applications`; `ApplicationsHome.tsx`.
- Today: Active, Closed and All tabs over the same `ApplicationCard`s that Home shows. For one application, the 2-column grid leaves the right half empty (desktop shot).
- Survivor: Home's application list (active first, closed collapsed). The `/applications` route redirects to Home.

### Application page and its tabs — COMPLETE · M
- Where: `/candidate-portal/applications/[id]` plus the `interviews`, `messages` and `emails` routes; `ApplicationFrame.tsx`.
- Today: Breadcrumb, job title, plain-words status, "View job posting", then tabs: Overview (status timeline, "What happens next", next interview, a "Changed your mind?" withdraw card), Interviews, Messages and Emails. The **screenshots for this route show "Application not found"**: the captured id belongs to a different candidate. I checked the real page in the browser as a seeded candidate.
- Design critique (browser check at 1280): the right rail holds a single card, "Changed your mind? Withdraw application". It is the only thing in the rail and gives a destructive action more prominence than anything positive. "What happens next" is a full card for one sentence. Nothing shows what the candidate sent. The tabs duplicate the global hubs.
- Product critique: Candidates want "where am I, what's next, what did I send, how do I reach someone" on one screen. Greenhouse's MyGreenhouse and Workday's candidate home are single-page records.
- Complete means:
  - [ ] One scrolling page with no tabs. Header: job title, status in plain words, "View job". Main column: status timeline with real dates, Interviews (the same cards as the Interviews hub), the latest messages with "Open conversation", and "What you sent" (resume, answers, details; see Profile). Footer: "Withdraw application" as a quiet link.
  - [ ] The `/interviews`, `/messages` and `/emails` sub-routes redirect to anchors or the Inbox.
- Backend: add the submitted answers, the resume file name and link, and the stage history (from the existing pipeline move records) to `GET /public/portal`.
- Libraries: none.

### Status timeline and plain-words status — COMPLETE · M
- Where: `portal.ts:65-133` (`phaseOf`, `whatHappensNext`, `statusSteps`), `StatusCard` in `ApplicationParts.tsx:24-55`, `nextSteps` in `ApplicationFrame.tsx:161-178`.
- Today: The phase is guessed by substring matching on internal stage names ("review", "screen", "interview", "booked", "offer", "decision"). A custom stage like "Onsite" or "Take-home" falls into `other`, and the candidate reads "Current step: Take-home", exposing internal names. The bar parks it at position 1. The timeline steps after "Application received" carry only "Done" or "Coming up", with no dates. `nextSteps` promises an interview reminder that does not exist (`:171`).
- Product critique: Ashby and Greenhouse let admins set a candidate-facing name per stage, or hide stages. That is the only reliable way to keep internal names out.
- Complete means:
  - [ ] Each pipeline stage gets a candidate phase (Received, Review, Interviews, Decision) and an optional candidate label. The defaults come from the pipeline template.
  - [ ] Timeline entries carry the real date each phase was reached.
  - [ ] Per-phase "What happens next" copy, editable per org, with honest defaults. Drop the reminder line until reminders ship (see emails).
- Backend: `PipelineStage.CandidatePhase` (enum) and `CandidateLabel`, and the same on pipeline templates. A migration maps current names with today's `phaseOf` rules. The portal payload returns the phase and per-phase dates instead of `Stage`. The "Booked" stage lookup by name in `PublicInterviewBookingEndpoints.cs:227-229` becomes a stage flag (cross-area with pipelines).
- Libraries: none.

### Offer to-do ("Your offer is almost ready") — COMPLETE · S
- Where: `isOfferStage` (`portal.ts:150-151`), to-do at `:196-204`.
- Today: Triggered when a stage name contains "offer" or "decision". If a recruiter moves someone to "Offer" while the offer is still waiting for approval, or is never approved, the candidate is told an offer is coming.
- Complete means:
  - [ ] The to-do appears only when an offer has actually been sent (from the Offer record), reads "Your offer is ready. Check your email from {recruiter}", and links to the thread.
- Backend: add the latest sent offer's status (no amounts) to `GET /public/portal`. Viewing or accepting offers in the portal stays out of scope (e-signature and legal).
- Libraries: none.

### Interview self-scheduling (pick a time, find another time) — COMPLETE · L
- Where: `Interviews` in `ApplicationParts.tsx:57-207`, `Slots` (`:209-232`); `PublicInterviewBookingEndpoints.cs:15-61,138-269`; `UserCalendarService.FindCommonAvailabilityAsync` (`:73-115`); proposals created in `InterviewEndpoints.cs:162-178` and `ScheduleInterviewDrawer.tsx:188`.
- Today: The recruiter offers one time per `Interview` row (status `Proposed`). The candidate sees one card per row ("Phone screen: pick a time", one "Book Sat, Nov 14, 3:00 PM" button, "Find another time"). Issues:
  - "Find another time" returns nothing unless every interviewer has a connected calendar (`UserCalendarService.cs:92-93`). The candidate then reads "There are no other times open right now. Message the team." For most new customers this is the only path.
  - When it does return, it offers every 30 minutes for 14 days, 24 hours a day (`:106-112`). There are no working hours, no buffer and no minimum notice, and slots before now are included (the window starts at the proposed date at midnight). They render as up to hundreds of stacked full-width buttons (`ApplicationParts.tsx:218-231`).
  - Booking one proposal **cancels every other proposed interview on the application**, whatever its title (`PublicInterviewBookingEndpoints.cs:208-216`). The UI groups proposals by title as alternatives for one interview (`portal.ts:170-182`), so two different rounds cancel each other.
  - Each proposed time sends its own "Book your interview" email (`InterviewEndpoints.cs:164-178`), so three offered times mean three emails.
  - When any interviewer lacks a calendar connection, the server accepts **any** start and end time the client posts (`:198-204`).
  - No time zone label. `Interview.TimeZone` is returned (`PublicPortalEndpoints.cs:36`) but never used.
- Product critique: Calendly, GoodTime and Ashby self-scheduling all show a day strip, then time chips in the invitee's zone. They respect working hours, buffers and minimum notice, and confirm with a summary and a calendar invite. The candidate can switch time zones.
- Complete means:
  - [ ] One "interview request" per round, with N offered times or an "any free time" window, and one email with a magic link.
  - [ ] Picker: a 14-day strip of days that have slots, then time chips for the chosen day, in the browser's zone with a zone switcher ("Times in Pacific Time · Change"). Show duration and who the candidate will meet.
  - [ ] Confirm step: "Tuesday Nov 18, 10:00–10:45 AM PST with Dana (Design lead), video call", then Book.
  - [ ] After booking: Add to Google, Outlook or Apple (an `.ics` download), and the confirmation email carries the `.ics`.
  - [ ] Availability respects interviewer working hours (per user, default 9–5 in their zone), a 15-minute buffer, 24-hour minimum notice, never the past, and at most 3 slots per day shown first with "More times".
  - [ ] Without calendar connections: the recruiter-offered times are the choices, and "None of these work" sends a structured message with the candidate's preferred windows.
  - [ ] The server validates every booked time against the offered set or the computed availability, always.
- Backend: `InterviewRequest` (ApplicationId, Title, DurationMinutes, InterviewerEmails, KitId, Mode = OfferedTimes | Window, WindowStart, WindowEnd, Status) and `InterviewRequestSlot` (RequestId, StartsAt, EndsAt). Booking creates the `Interview`. `UserWorkingHours` (UserEmail, TimeZone, DaysJson, Start, End). `FindCommonAvailabilityAsync` filters by working hours, notice and now. Proposed `Interview` rows migrate into requests grouped by application and title. `Candidate.TimeZone` is captured from the browser at apply and at sign-in.
- Libraries: `Ical.Net@5.2.4` (NuGet) for `.ics` attachments with `METHOD:REQUEST` and `CANCEL`, and `UID`/`SEQUENCE`, so reschedules update the same calendar entry instead of adding a second one. That update logic is what hand-rolled `.ics` usually gets wrong. Skip `react-day-picker@10.0.2`: a 14-day strip is a few lines of Tailwind and matches the native-first rule in `src/web/CLAUDE.md`.

### Reschedule and cancel — COMPLETE · M
- Where: "Change time" and "Cancel interview" in `ApplicationParts.tsx:165-206`; `/reschedule` and `/cancel` in `PublicInterviewBookingEndpoints.cs:63-136,271-358`.
- Today: Both are gated by the per-job `AllowCandidateReschedule`. "Change time" has the same zero-slots problem as above. Cancel needs no reason and leaves the candidate with nothing to do next. The recruiter is not emailed on a booking or reschedule (only interviewers are). Reschedule always queues a calendar event (`:348-354`) and sets `CalendarStatus = "Queued"` even with no integration. Every email uses raw UTC (`:337,345`). There is no rule against moving a 10 a.m. interview at 9:55.
- Product critique: Calendly gives "Reschedule" and "Cancel" with an optional reason, a cutoff ("changes allowed up to 24 hours before"), and one updated invite.
- Complete means:
  - [ ] "Change time" opens the same picker as booking, with the current time shown and kept until a new one is confirmed.
  - [ ] "Can't make it?" replaces bare Cancel. It offers "Pick another time" or "Cancel and tell the team why" (reason required, sent into the thread).
  - [ ] A per-org cutoff (default 12 hours). Inside it, the buttons become "Message the team to change this".
  - [ ] The recruiter and the interviewers get one email, and the calendar invite updates (same UID, SEQUENCE + 1).
- Backend: `Organization.CandidateChangeCutoffHours`. Notify `RecruiterEmail` on book, reschedule and cancel. Queue the calendar update only when an integration is on. Post the cancel reason as an `ApplicationMessage`.
- Libraries: `Ical.Net@5.2.4` (as above).

### Interview details (time, join link, prep) — COMPLETE · M
- Where: Booked cards in `ApplicationParts.tsx:144-185`, "Next interview" on Home (`PortalOverview.tsx:161-202`).
- Today: Title, start time (no end, no zone), "Booked", and "Join meeting" when a link exists. The interview kit has a `CandidateMessage` (used only inside the booking-request email, `InterviewEndpoints.cs:175`), which never appears in the portal. The calendar invite description the candidate receives reads "Candidate: … Role: PRG-008 · … Application: {guid}" (`IntegrationOutboxWorker.cs:273`): internal codes in the candidate's calendar.
- Design critique (interviews shot, phone): "Technical interview: Sun, Nov 15, 10:00 AM" wraps into four lines in a 120px column beside the badge and button. The "Booked" badge says nothing the context does not already say.
- Product critique: GoodTime and Ashby confirmation pages show who you meet (name, title, photo), how (video link, phone number or address with a map link), how long, what to prepare, and a "Join" button that turns primary 10 minutes before.
- Complete means:
  - [ ] Card: date block, "10:00–10:45 AM PST (45 min)", format (video, phone or on-site with address), interviewer names and titles, prep notes from the kit's `CandidateMessage`, Add to calendar, and Join (primary from 10 minutes before).
  - [ ] Candidate-friendly calendar invite text: "Interview with {company} for {job}. Join: {link}. Questions? Reply in your portal: {magic link}".
- Backend: add the end time, zone, format, location, interviewer display names and titles (from users), and kit `CandidateMessage` to the portal payload. Fix the invite description in `IntegrationOutboxWorker.cs:273`. Add `Interview.Format` and `Location` (cross-area with interviews).
- Libraries: none.

### Interview tips card — MERGE · S
- Where: "Tips for the day" in `PortalHubs.tsx:61-82`.
- Today: Three hard-coded generic tips shown beside every interview list, including when nothing is booked.
- Survivor: the per-interview prep notes from the interview kit (see Interview details). Keep the generic tips only as the default text of a new kit's `CandidateMessage`.

### Inbox: messages hub and conversation thread — COMPLETE · L
- Where: `/candidate-portal/messages` (`PortalHubs.tsx:90-197`), `Thread` (`ApplicationParts.tsx:234-300`), `components/messages/Chat.tsx`; `PublicCandidateMessagingEndpoints.cs:28-66`; staff side `ApplicationMessagesEndpoints.cs`.
- Today: One thread per application. Plain text up to 2,000 characters. The unread flag is set by opening the thread. Sending reloads the whole portal. Team messages are labelled "Hiring team" even though `AuthorEmail` is stored. The candidate's message goes to the recruiter by email and Slack. The team's message goes to the candidate as an email whose whole body is the message, followed by "You can reply from your candidate portal" with no link (`ApplicationMessagesEndpoints.cs:34-35`). There are no files, no reply by email, no live updates, and no sign that the team has read a message, although `ReadAt` is stored for candidate messages.
- Design critique (messages shot): the conversation row's avatar shows the job title's initials ("CC" for Community programs coordinator), and the title truncates to "Community programs …" at 300px. The "0/2000" counter is always visible. "Send message" is a grey disabled block until you type. The "new" marker is the plain word "· new" in the timestamp line. The Conversations tab count shows unread while the Emails tab count shows the total. On phone the list shows one row, and tapping it replaces the list with no URL change, so Back leaves the portal.
- Product critique (owner's bar: emoji, files, live, reply by email, read state, threads, search): Intercom and Front show the teammate's name and avatar, attachments with previews, "Seen" receipts, live arrival, and replies from email that land in the thread.
- Complete means:
  - [ ] Each team message shows the author's name, photo and title. The conversation header shows the recruiter as the contact.
  - [ ] Attachments in both directions (PDF, Word, images, up to 10 MB each, previews for images and PDF), plus the emoji picker from the shared composer (cross-area).
  - [ ] "Seen" under the candidate's last message once the team has read it.
  - [ ] Live updates: poll the thread every 15 seconds while it is open and when the window regains focus. Send optimistically.
  - [ ] Reply by email: every team-message email has a per-thread Reply-To address, and the reply lands in the thread (quoted history stripped).
  - [ ] Email copies of team messages show a "View in portal" magic link and the message text. They do not appear again as "Emails" (see the MERGE below).
  - [ ] A URL per conversation (`/candidate-portal/messages/[applicationId]`), so Back works on phone. The list avatar is the company logo or the recruiter's photo. The counter appears only above 1,800 characters. ⌘/Ctrl+Enter sends.
- Backend: `ApplicationMessage.AttachmentIds`, or a link table to `Attachment`. Add a candidate upload endpoint `POST /public/portal/applications/{id}/attachments` (reuse `LocalFileStore`) and a download endpoint that checks the session. Add author display fields in the portal payload. Add `GET /public/portal/applications/{id}/messages?after=` for polling. Inbound email: a Reply-To of `reply+{threadToken}@{inbound domain}` and an inbound webhook endpoint next to `ResendWebhookEndpoints.cs` that verifies the signature, maps the token to the application and strips quotes. The staff side of messaging is cross-area.
- Libraries: none for polling (TanStack Query `refetchInterval`, installed). `@microsoft/signalr@11.0.0` only if polling proves too slow (SignalR is built into the ASP.NET Core server). Inbound mail: Resend's inbound webhooks if the account has them, otherwise any inbound-parse provider. Same verification pattern as the existing delivery webhook.

### Emails tab (copies of emails sent) — MERGE · S
- Where: `ApplicationEmailsTab` (`ApplicationFrame.tsx:145-159`), the Emails tab in `PortalHubs.tsx:128-144`, `EmailsList` (`ApplicationParts.tsx:367-386`); the `messages` field (actually emails) in `PublicPortalEndpoints.cs:39-47`.
- Today: The full text of up to 25 sent emails per application, always expanded, in two places. Message-notification emails duplicate the chat. The payload calls emails "messages" and messages "thread", which is confusing.
- Survivor: the Inbox thread. Each email becomes a compact system row in the thread ("We emailed you: Interview booked · Nov 13", expandable). Notification emails for chat messages are hidden, because the message itself is in the thread. Rename the payload field to `emails`.

### Withdraw application — COMPLETE · S
- Where: `Withdraw` (`ApplicationParts.tsx:302-364`), `POST /public/portal/applications/{id}/withdraw` (`PublicCandidateMessagingEndpoints.cs:68-117`).
- Today: Works end to end. A modal explains the effects, the reason is optional, interviews are cancelled, the recruiter, interviewers and candidate are emailed, there is an audit entry and a Slack note. The per-job switch is respected.
- Design critique: The action sits alone in a right-rail card titled "Changed your mind?" (`ApplicationFrame.tsx:124`), the most prominent element in the rail. The confirmation email is plain text with no link to other jobs.
- Complete means:
  - [ ] Move it to a quiet "Withdraw application" link at the foot of the application page. Keep the modal.
  - [ ] After withdrawing, the page shows "You withdrew on Nov 13" with "See other open jobs".
  - [ ] The withdrawal email uses the branded layout and links to the careers page.
- Backend: none beyond the email layout.
- Libraries: none.

### Help page — MERGE · S
- Where: `/candidate-portal/help`; `PortalHelp` (`PortalHubs.tsx:202-256`).
- Today: Six hard-coded FAQ items and a "Still stuck?" card linking to messages. It takes a full nav slot. One answer ("Closing the browser tab signs you out") describes a limitation, not help.
- Survivor: a "Need help?" link in the portal footer opening the same accordion in a `Drawer`, plus contextual one-liners where actions happen (they already exist in the interview and withdraw copy). Show the org's support email from branding. Drop the sign-out answer when cookie sessions ship.

### Profile, documents and data the candidate can see — COMPLETE · M
- Where: none today. `GET /public/portal` returns only first and last name (`PublicPortalEndpoints.cs:51`).
- Today: The candidate cannot see their resume, answers, phone, location or LinkedIn, cannot add a cover letter, portfolio or updated resume, and cannot fix a typo in their phone number.
- Product critique: Workday, SmartRecruiters and Greenhouse's MyGreenhouse show "Your application" and let candidates update contact details and add documents. It also gives the team a place to ask for documents ("Please upload your portfolio") that the candidate can act on.
- Complete means:
  - [ ] "What you sent" on each application: resume (download), answers, and the details submitted.
  - [ ] "Your details" in the account menu: name, phone, location and LinkedIn are editable. Changing the email is done by verifying the new address with a code.
  - [ ] "Add a document" per application (resume update, cover letter, portfolio, other), listed with the upload date. The team is notified in the thread.
  - [ ] A document request: a recruiter asks for a named document from the application (cross-area), and it shows as a to-do on Home.
- Backend: `GET` and `PATCH /public/portal/profile`; `POST /public/portal/applications/{id}/documents` (reuse `LocalFileStore` validation and `Attachment` with `UploadedBy = candidate:{email}`); a session-checked download. Add `DocumentRequest` (ApplicationId, Label, Status, RequestedBy) for the to-do. Answers come from `ApplicationAnswer` (see questions).
- Libraries: none.

### Candidate emails — COMPLETE · L
- Where: `Infrastructure/EmailSender.cs` (`EmailHtml.Wrap`), `EmailTemplates.cs`, `EmailOutboxWorker.cs`; hard-coded `QueueEmail` calls in `PublicInterviewBookingEndpoints.cs`, `PublicCandidateMessagingEndpoints.cs`, `InterviewEndpoints.cs` and `ApplicationMessagesEndpoints.cs`; the code emails in `PublicJobEndpoints.cs:163-171` and `PublicCandidateAccessEndpoints.cs:44`.
- Today, what a candidate receives:
  1. "Confirm your application for X": a code, plain text.
  2. The portal sign-in code: sent directly, outside the outbox.
  3. **No "We received your application" email.** It exists only in seed data.
  4. "Update on your X application: has moved to: {stage}" on **every** stage change (`ApplicationEndpoints.cs:440-454`, template `EmailTemplates.cs:23-27`). See the REMOVE below.
  5. Rejection, sent the instant the recruiter rejects (template).
  6. "Book your {interview} interview", once per proposed time.
  7. The booking reminder and the "still being reviewed" nudge (every `StaleReminderDays`, default 3, up to `MaxReminders`).
  8. Interview scheduled, booked, rescheduled or cancelled: hard-coded, **raw UTC** ("2026-11-14 15:00:00Z"), with no meeting link, no end time, no `.ics` and no link.
  8b. "Your interview time changed to 2026-11-14 15:00:00Z on the connected calendar." when an interviewer moves the event in their own calendar (`IntegrationOutboxWorker.cs:203-212`). It uses raw UTC and internal jargon.
  9. "A message about your X application": "You can reply from your candidate portal", with no link and no reply-to.
  10. Withdrawal confirmation.
  11. **No interview reminder** before the interview, although the UI promises one.
  
  The layout is the company name in bold over plain paragraphs. There is no logo, no button and no footer. The `portalLink` variable is only `{PublicUrl}/candidate-portal`, which needs a code to open.
- Product critique: Ashby and Greenhouse send branded, template-driven emails with a clear button to the exact action, times in the candidate's zone, calendar attachments, and reminders 24 hours and 1 hour before. Greenhouse lets rejections go out on a delay (for example 2 days) so they do not feel automatic.
- Complete means:
  - [ ] One branded HTML layout: logo, accent-colour button, footer line "You are receiving this because you applied for {job} at {company}", plain-text part kept.
  - [ ] Every candidate email is a template (keys added: `application-received`, `portal-code`, `interview-booked`, `interview-rescheduled`, `interview-cancelled`, `interview-reminder`, `message-received`, `withdrawn`). They are editable in Email templates (cross-area, which owns the WYSIWYG editor).
  - [ ] Dates rendered in the candidate's zone with the zone name ("Tuesday, November 18 at 10:00 AM PST"), using `Candidate.TimeZone`, falling back to the interview zone.
  - [ ] Interview emails carry an `.ics` and a "Join" button.
  - [ ] Reminders 24 hours and 1 hour before a booked interview (respecting quiet hours only for the 24-hour one).
  - [ ] Every button is a magic link to the exact page.
  - [ ] One booking email per interview round. Phase-change emails replace per-stage emails.
  - [ ] Rejection delay setting (send now, or after 1–3 days, cancellable) (cross-area with pipeline).
  - [ ] Team-message emails get a Reply-To for threading (see Inbox).
- Backend: replace `QueueEmail` free text in the files above with `EmailTemplates.QueueAsync`. Add a `formatWhen(DateTimeOffset, tz)` helper. Add `EmailOutboxItem.AttachmentsJson` (for the `.ics`) and pass attachments to Resend (its API takes base64 attachments). `EmailHtml.Wrap(company, text, brand, buttons)`. Add an interview reminder pass in `EmailOutboxWorker` (`Interview.ReminderSentAt` flags). Add `Candidate.TimeZone`.
- Libraries: `Ical.Net@5.2.4` (the `.ics`, as above). `Markdig@1.6.0` only if templates move from plain text to Markdown bodies. Otherwise none: the HTML wrapper stays hand-written, since email HTML needs inline styles anyway.

### Automatic "has moved to {stage}" email on every stage move — REMOVE · S
- Where: `ApplicationEndpoints.cs:440-454`; template `stage-update` in `EmailTemplates.cs:23-27`.
- Why: It mails the candidate the team's internal stage name ("has moved to: Booked", "…: Hiring manager review") every time a card is dragged on the board, including moves back and corrections. Replace it with the phase-change email under "Candidate emails", sent only when the candidate phase changes, and only if the recruiter leaves "Notify candidate" ticked on the move.

### Development local test candidates panel — DONE
- Where: `DevCandidatesPanel.tsx`, `PublicDevEndpoints.cs`, `CandidateCodes.cs`.
- Why done: It is developer tooling. It renders only when `NODE_ENV === 'development'` **and** the API is in Development (the endpoints are not mapped otherwise, `PublicEndpoints.cs:20-21`), and the fixed code works only for `@local.dev` in Development (`CandidateCodes.cs:15-18`). It does one job well: one-click sign-in and a reset. No change needed.

## Cross-area notes
- **Job visibility (jobs area).** Every `Open` job is public. `GET /public/jobs` does not filter `IsConfidential` (`PublicJobEndpoints.cs:24-25`), yet the job Settings page describes Confidential as "Only the hiring manager, the recruiter and the people below" (`RequisitionSettings.tsx:193-196`). A confidential replacement search is on the public board today. Add `Requisition.Visibility = Listed | Unlisted (link only) | Internal`, and exclude confidential jobs from the board unless explicitly listed.
- **Job editor (jobs area).** The description is written in Plate at creation (`CreateRequisitionPage.tsx:257`) but edited later in a plain `Textarea` (`RequisitionSettings.tsx:175`). Use the same `PlateMarkdownEditor` in both. Add pay fields, structured location, the "Resume required" switch, and the question builder to the job's "Job posting" page. Posting templates (`PostingTemplateEditor.tsx`) should keep Header, Description, Benefits and "How we hire" as separate fields that the public page renders as sections.
- **Pipelines area.** Add the candidate phase and label per stage (and on pipeline templates). A "Notify candidate" checkbox on stage moves. A rejection email delay. Replace the stage lookup by name ("Booked", `PublicInterviewBookingEndpoints.cs:227-229`) with a stage flag.
- **Interviews area.** Interview requests with several offered times, interviewer working hours, `Interview.Format` and `Location`, and kit `CandidateMessage` shown to candidates. The scheduler (`ScheduleInterviewDrawer.tsx`) must create one request with N times instead of one `Proposed` row per time. Fix the `:u` UTC string in interviewer emails too (`InterviewEndpoints.cs:199`).
- **Messages area (staff inbox).** The candidate thread changes (attachments, reply by email, author names, read receipts) need the matching staff side. Use one shared composer with the emoji picker and attachments in `components/messages`.
- **Email templates area.** It owns the Plate WYSIWYG editor, variables and preview. This area adds the template keys listed under "Candidate emails" and needs a `{{magicLink}}`-style variable per action, rather than the generic `{{portalLink}}`.
- **Offers area.** The portal needs only "offer sent" status. Viewing, accepting or signing offers stays out (e-signature and legal).
- **Candidates area.** The "Email not confirmed" badge, held "Submitted details" awaiting merge, structured answers on the application view, filters by answer, and the document-request action.
- **Shared components.** `components/ui/wizard.tsx`: hide Back on step 1, validate on Next (show errors instead of disabling), move focus to the step heading on change, and render inside a `<form>`. `components/ui/file-input.tsx:71-77`: focus ring on "Remove file". `components/messages/Chat.tsx` `ConversationRow`: accept an image or logo instead of initials. `src/web/CLAUDE.md` should gain a "Public pages" section: employer brand tokens, server rendering, and no `'use client'` at the route level.
- **Settings.** `/admin/portal` becomes "Careers site". The workspace "General" description "Candidates see this in emails and on the candidate portal" (`AdminSettings.tsx:366`) should point to the new page for logo and colour.

## Build order
1. **Stop data loss and record corruption in apply** (M): accept on submit, a magic-link confirmation in a real "We received your application" email, held profile changes until confirmation, per-application codes, the already-applied email, and the clean-up worker. Needs `CandidateMagicLink` (shared with step 5).
2. **Human-readable times and honest copy** (S): replace every `:u` (booking, interview and calendar-change emails) with zone-aware text, add `Candidate.TimeZone`, add zone labels in the portal, and remove the false reminder, "share later" and "exactly what applicants see" lines until their features land. Remove the per-stage email (REMOVE item) and gate phase emails behind "Notify candidate".
3. **Job page content and SEO** (M): server-render `/careers` and `/careers/[slug]`, render Markdown with `platejs/static`, add metadata, OG image, JSON-LD, sitemap and robots, return a real 404, hide confidential jobs. Depends on nothing. Pay and structured location from step 6 enrich it later.
4. **Employer branding** (M): the Careers site settings page, `Organization` brand fields, the branded `PublicFrame`, favicon and title, and the email layout. Feeds steps 3 and 9.
5. **Portal sessions by cookie and magic links** (M): the cookie session, server sign-out, code UX, and deep links from every email. Needed by steps 9–12.
6. **Careers board and filters** (M): the dense list, URL filters with facets, the posted date, pay, the "More in {department}" merge, slugs and per-channel links, source tracking, and department and location autocomplete with structured location.
7. **Apply on one page with resume autofill** (M): resume-first parse endpoint, prefill, validation and accessibility, `localStorage` draft, honeypot, "Resume required" switch, and the new confirmation screen.
8. **Portal information architecture** (M): Home, Interviews and Inbox, a single application page, candidate phases and labels on stages, the real offer to-do, and the Help, Applications, activity and Emails merges. Depends on step 5. The stage fields are coordinated with pipelines.
9. **Candidate email system** (L): templates for every email, the branded layout, `.ics`, 24-hour and 1-hour reminders, one email per round, and a rejection delay. Depends on steps 4 and 5.
10. **Self-scheduling and reschedule** (L): `InterviewRequest` with slots, working hours, notice and buffer, the day and time picker, the confirm step, add-to-calendar, the cutoff, server validation, interview details and prep notes, and a candidate-friendly invite text. Coordinated with the interviews area. Uses `Ical.Net` from step 9.
11. **Inbox completion** (L): author names, attachments, read receipts, polling, per-conversation URLs, and reply by email via an inbound webhook. Coordinated with the staff messages area.
12. **Profile and documents** (M): what you sent, editable details, document uploads, and document requests.
13. **Typed application questions and a question bank** (L): the builder on the job posting page, typed controls, `ApplicationAnswer` rows, the migration from Markdown, and filters on answers in the candidates area. After step 7, so the new apply page renders the types.
14. **Posting preview parity** (S): the workspace preview renders the real public component with a Desktop and Phone toggle and works for jobs that are not yet open. After step 3.

## Progress (wave 1)

### Finished
- **Email confirmation before the application counts (and duplicate applies)**: submitting is final (the application is `Active` and reaches the team at once). The "We received your application" email carries a one-time link (`/candidate-portal/link#token`, 7 days) and a per-application 6-digit code. For a candidate already on file, name, phone, location, LinkedIn, time zone and the resume wait in `ApplicationSubmission` until the address is confirmed; the held resume is read into the profile only then. Codes are per application (verify matches the application, so a second job never breaks the first). Applying again for the same job sends "Your application for {job}" with a sign-in link and changes nothing; the page reads the same either way. `ApplicationFollowUpWorker` sends one reminder after 24 hours (outside quiet hours), closes unconfirmed applications still in the first stage after 30 days (reason "Email address never confirmed", held file deleted), and clears expired links and unused uploads. A signed-in candidate can also confirm from the application page. Links are built only from `Organization.PublicUrl`, never from request headers.
- **Confirmation screen**: "Your application is in", three "What happens next" steps, the address the email went to with "Fix your email", the code box (submits on the 6th digit), "send it again" with a 30-second wait.
- **Human-readable times (portal)**: every time in the portal names the zone (`Saturday, November 14, 9:00 AM – 9:30 AM CST`). `Candidate.TimeZone` is captured from the browser on apply (held for known candidates), on the email link and on code sign-in. The false promises are gone: the interview reminder line, "share one later by messaging the team", "This is exactly what applicants see", and "Your offer is almost ready" on a stage name.
- **SEO and share previews**: `/careers`, `/careers/[slug]` and the apply page render on the server. Per-page titles ("Data analyst · Acme careers"), descriptions, canonical URLs, an Open Graph image per job, `JobPosting` JSON-LD (dates, employment type, structured address or `TELECOMMUTE`, identifier, `directApply`), `sitemap.xml` and `robots.txt` (careers only). A closed, confidential or missing job is a real 404 with the friendly page.
- **Job page (public posting)**: server-rendered with the editor kit's `RichText` (via `JobPostingView`), "← All jobs", posted date, apply card with "Takes about 3 minutes", Copy link and Share, phone sticky bar with Apply and share. Still open: pay range and "How we hire" sections need the job fields (jobs area).
- **"Other open jobs" rail (merge)**: replaced by "More jobs in {department}" (up to 3, one line each) under the posting and "All N open jobs" under the apply card.
- **Copy link and share**: readable URLs `/careers/{title-slug}-{id}`; id-only links 308 to them and keep `?src=`. Per-channel links on the job's posting page are still open (jobs area file).
- **Careers board**: one line per job (title · location · work mode · type · posted) under sticky department headings, newest first by `OpenedAt`, no per-group counts, embed mode (`/careers?embed=1`: no header or footer, jobs open in a new tab).
- **Department, location and work-mode filters**: in the address (`?q=&department=&location=&mode=`, several values each), read on the server; options and counts come from `GET /public/jobs/facets` over every listed job; exact matching; "Remote" is a location choice; on phones one "Filters" drawer.
- **Job visibility**: confidential jobs are hidden from every public endpoint (list, job, facets, apply, sitemap).
- **Source tracking**: `?src=` and `utm_*` are kept for the tab and sent with the application; known channels become `Application.Source` ("LinkedIn", "Indeed" and so on), the raw tags go in `ApplicationSubmission.UtmJson`.
- **Apply on one page**: Resume, Your details, Questions on one 640px page with one "Submit application". Errors on blur and submit, under each field and in a summary at the top; focus moves to the first problem. Phone numbers are checked and formatted with `libphonenumber-js`. Honeypot field. What was typed is kept in `localStorage` per job ("We restored what you typed. Start over").
- **Resume upload and autofill**: the resume is uploaded first (`POST /public/resume`, with a progress bar) and returns a file token so it is not uploaded twice; name, email, phone and LinkedIn are read from the text without AI and fill only empty fields, marked "From your resume". An unreadable file says so and the form still works.
- **Portal shell and navigation**: Home, Interviews, Inbox in the header (bottom tab bar on phones), badges only for unread messages (blue) and times to pick (amber), account menu with Open jobs, Help and Sign out.
- **Home**: the next interview within a week first (with Join), then To do (confirm, offer, pick a time, messages), then every application with labelled steps (Received → Review → Interviews → Decision), closed ones collapsed.
- **Recent activity, Applications list, Emails tab, Help (merges)**: activity removed; `/applications` redirects to Home; emails we sent appear as small notes inside the conversation (sign-in emails show only their subject, copies of team messages are not repeated); Help is a drawer from "Need help?" in the footer and the account menu.
- **Application page and its tabs**: one scrolling page (where it stands, interviews, latest messages, a quiet "Withdraw application" at the foot); the old tab routes redirect.
- **Inbox**: a URL per conversation (`/candidate-portal/messages/[id]`) so Back works on phones; counter only near the 10,000-character limit; ⌘/Ctrl+Enter sends.
- **Offer to-do**: shows only when an offer was actually sent (`offerSentAt` from `Offer.Status == Sent`).
- **Interview tips card (merge)**: removed.
- **Sign-in by code**: code goes through the email outbox, numeric box that submits on the 6th digit, "Send a new code" with a 30-second wait, expired email links fall back to a code with the address filled in.

### Public JSON feed
`GET /public/jobs?query=&department=&location=&mode=&offset=&limit=` (up to 200 per page) returns
`{ items: [{ id, code, title, department, location, employmentType, workMode, openings, postedAt, updatedAt }], total, offset, limit }`.
`GET /public/jobs/facets` returns `{ total, departments, locations, workModes }`, each a list of `{ value, count }`.
`GET /public/jobs/{id}` adds `description` (Markdown), `applicationQuestionsMarkdown` and `targetStartDate`.

### Not done in wave 1
- Employer branding (logo, colour, intro, favicon) and "Resume required": wait for the platform review of General settings (step 4).
- Pay, structured locations, department autocomplete, per-channel links: job fields and editor (jobs area).
- Cookie sessions, server sign-out and deep links from every email (step 5, wave 2); the template system and branded email layout (step 9, wave 2).
- Candidate phases and labels per stage, dated timeline (stage types, wave 2). The timeline still says "Current step: {stage}" for stages it cannot place.
- Self-scheduling, interview details and `.ics` (interviews area, step 10); inbox attachments, read receipts and live updates (communication area, step 11); profile and documents (step 12); typed questions (step 13); posting preview parity (step 14).

## Progress (wave 2)

### Finished
- **Sign-in by code and session**: the portal session is an `HttpOnly`, `SameSite=Lax` cookie (`candidate.session`, `Secure` everywhere except plain-http development), 30 days, sliding once a day on `GET /public/portal`. No token in JavaScript: `sessionStorage` is gone from the web app. One middleware (`UseCandidateSessionCookie`) copies the cookie into `X-Candidate-Session` for `/public`, so every endpoint that binds the header (including the interviews and messages areas') reads the cookie with no change; a header sent by the caller still wins, and verify answers still return `token`, for one release. Changes signed in by cookie must also carry `X-Candidate-Portal: 1`, which another site cannot add. `POST /public/portal/sign-out` deletes the session row and the cookie. `GET /public/portal` answers 204 when nobody is signed in, so the sign-in page loads without an error. Expired sessions are cleared by the follow-up worker. The code screen says where the code went, checks spam, focuses a large numeric box that submits on the 6th digit, and keeps "Send a new code" (30-second wait) and "Use a different email". A signed-in page sends the visitor to `/candidate-portal?next=…` and back after signing in (portal pages only).
- **Deep links from candidate emails**: `CandidateLinks.CreateAsync` makes a one-time, 7-day link that signs in and opens a stored portal page (`CandidateMagicLink.Path`, server-set, portal pages only). Used by the application emails (application page), the sign-in code email (one-click link to the page the person was opening), document requests (`#documents`), and every template email to the application's candidate (`{{portalLink}}` becomes a link to the application, `#interviews` for booking emails). A used or expired link opens the page anyway when the person is still signed in; otherwise it offers a code with the email filled in and returns to the page after.
- **Employer branding and careers settings**: `CareerSite` (one row per organization: logo, dark-mode logo, square icon, brand colour, headline, introduction, website, up to 6 social links, "Require a resume"). Admin API `GET/PUT /api/careers-site`, `POST/DELETE /api/careers-site/images/{logo|logo-dark|icon}` (PNG or JPEG up to 2 MB, content checked). Public `GET /public/organization` gains `brand`; images at `/public/careers/images/{slot}?v=…` (cached for a year per version). Settings page "Careers site" (`/settings/careers`, in the settings registry under Workspace) with Brand, Careers page and Applications cards, a colour field that picks readable button text, and a live preview of the real careers page or portal at desktop and phone width (the frame gets the unsaved brand by `postMessage`).
- **Branded public pages**: `PublicFrame` has a light header with the employer's logo (dark-mode logo, else icon and name), the brand colour as `--primary` on public routes only (with dark text on light colours), and website and social links in the footer. Careers and portal titles and favicons use the employer's name and icon. The share picture uses the brand colour and icon. The careers board opens with the headline and introduction. "Require a resume" hides "Apply without a resume" and the server refuses an application without one.
- **Candidate email layout**: the layout shows the icon beside the company name, a brand-colour top line and brand-colour links (`EmailHtml.Wrap(company, text, brand)`).
- **Profile, documents and data the candidate can see**: "Your details" (`/candidate-portal/profile`, from the account menu): name, phone, location, LinkedIn and time zone, checked like the apply form. Each application page has **Documents** (open requests first, every file added, the resume sent with the application, downloads) with "Add a document" (cover letter, portfolio, updated resume, something else; PDF, Word, PNG or JPEG up to 10 MB; resumes PDF or Word and read into the profile), and **What you sent** (the details as typed and the answers). Adding a file posts a message with the file attached in the conversation, so the team is told the usual way. `ApplicationSubmission` now keeps `SentProfileJson` and `ResumeAttachmentId`.
- **Document requests**: `DocumentRequest` (label, kind, note, requested by, fulfilled with a file). Staff: `GET/POST /api/applications/{id}/document-requests`, `DELETE …/{requestId}` (open requests only), for people who manage the job. The candidate gets an email with a one-click link to the documents section and a to-do on Home until they add it. `DocumentRequestsCard` (`features/candidate-portal/staff/DocumentRequests.tsx`) is the staff card, ready for the application record.
- **Inbox (portal part)**: new team messages, read receipts and changes arrive live over the inbox hub (signed in by the cookie; `InboxHub` now also reads the session cookie); "{name} is typing…" shows under the thread; files sent in messages, by either side, show as file cards and download. The composer has "Attach a file" (up to 10 files, PDF, Word, PNG or JPEG): the message and its files go through the documents upload as one message, so the messages endpoint is unchanged.
- **Reading a resume again** (`ResumeProfileWriter`, from the candidates review): GitHub, portfolio, other links and the current title now only fill empty fields, like LinkedIn, so a recruiter's edits survive a new resume.
- **Posting preview (parts)**: `GET /api/requisitions/{id}/posting-preview` (any status, for people who manage the job), `/careers/preview/[id]` renders the real public job page with a "Not public yet" notice, and `PostingPreview` (`components/careers`) shows it at desktop and phone width.

### Not done in wave 2
- Mounting `PostingPreview` and `DocumentRequestsCard`: `JobSections.tsx` (jobs area, not finished when this wave ended) and the application record (evaluation area).
- Changing the sign-in email address by confirming the new one: the details page says to message the team.
- The candidate email templates, `.ics`, reminders and per-round emails (step 9, waits for the shared template store); self-scheduling (interviews area).
- Removing the `token` from verify answers and the header fallback: after one release, once no client sends the header.

## Progress (wave 3)

- **Custom application questions** (step 13, built by the jobs area; details under "Application questions" in `docs/audit/jobs.md`): questions are `ApplicationQuestion` rows (per job, or the shared bank), not Markdown. The public job (`GET /public/jobs/{id}` and the workspace preview) returns `questions` without their knockout answers, plus `salary` (only when shown) and the structured `place`. The apply page renders typed controls (text, paragraph, radio buttons for yes or no and one choice, checkboxes for several, number, date, web link, and a file picker that uploads first through `POST /public/answer-file`), checks them like the server, and keeps answers by question on the device (not files). `POST /public/jobs/{id}/applications` takes `answers: [{ questionId, values, fileToken }]` and refuses a missing required answer or a wrong value, field by field (`answers.{id}`). Answers are `ApplicationAnswer` rows (label and type as asked, `Flagged` for knockout answers, a file answer becomes a document on the candidate); `ApplicationAnswersMarkdown` keeps a readable copy for older screens ("What you sent"). The application record's `answers` keeps its `{ question, answer }` shape and adds `flagged`, `type`, `questionId` and `attachmentId`; the record shows "Flagged answer". "What we will ask you" on the job page lists the typed questions. Existing Markdown questions on jobs and templates were turned into questions at startup (`ApplicationQuestions.BackfillAsync`, the same rules as the old parser) and old answers stay as they were.
- **Pay and structured location**: the job page shows the pay range when the team chooses to, and the `JobPosting` data uses the structured address, `baseSalary` and every "remote allowed in" country.
- Filters on answers in the candidates list belong to the candidates area: `ApplicationAnswer (ApplicationId, QuestionId, Values text[], Flagged)` is indexed on `(QuestionId, Flagged)` for it.
