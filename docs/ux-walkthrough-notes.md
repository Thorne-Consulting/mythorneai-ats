# Walkthrough notes (first pass)

Written 2026-10-16 after building sections A to E and G of [roadmap.md](roadmap.md). This is the raw list from clicking through the product as each role, on a scratch database seeded with the fictional dev data, with the real OpenAI key and no email provider. It is for scrutiny, not a verdict: items marked **fixed** were small enough to fix on the spot, the rest are open.

How it was checked: owner, recruiter, hiring manager, interviewer and candidate (phone width) journeys; every new page opened at 1280 px; an automated accessibility scan (axe-core, WCAG 2 A/AA and 2.1 AA) on the main pages; the backend suite (41 tests, including a live ranking eval); a production web build. Not checked: a keyboard-only pass, a screen reader, dark mode, reduced motion, slow networks, real email delivery, real calendars.

## What works end to end

- Acceptance: draft, choose approvers, one-after-another approval, approvers' page, send, Hired, reverse. The history shows every step.
- Candidate portal on a phone: messages, withdraw, status.
- Ranking for a job with real embeddings and a real fit assessment (requirement by requirement with quotes).
- Reports, saved views and CSV, email templates with live preview, webhooks (signed, retried), AI activity log.

## Found and fixed while walking

- The candidate portal's first load returned a server error for everyone (an existing query bug). Fixed and covered by a test.
- Queued email waited up to five minutes before sending, including sign-in codes. It now goes within seconds.
- Candidate emails said "in your candidate portal" with no link. There is now a "Candidate portal address" setting and the emails link to it.
- Ranking scores saturated at 100 and candidates with no readable resume outranked ones with one. Rescaled, and unreadable resumes now rank on keywords alone at a discount.
- "Missing" keyword chips were wrong for phrase requirements; matching is by words now and the chip says "not found".
- Accessibility: unlabelled controls (row arrows, date picker), tab `aria-controls`, low-contrast teal and tinted text, date picker faded days.
- AI interview questions invented history for a candidate with no resume; the prompt now forbids it and follows the kit criteria.

## Interviewer (the primary user): fixed in the first scrutiny pass

1. **Fixed.** Interviewers now open on "Scorecards waiting on you" and "Your upcoming interviews". "Write scorecard" opens the form directly, with the kit's criteria. Other roles see the scorecards card at the top only when they owe feedback.
2. **Fixed.** The calendar status badge only shows to people who manage the interview.
3. **Fixed.** It was seed data: the "Engineering screen" had no kit, so no criteria and everything fell under General. It now has one, and the AI questions group under the kit's criteria.
4. **Fixed.** "Prepare with AI" shows a spinner and says it takes about ten seconds.
5. **Fixed.** Approvals is hidden for interviewers unless something is waiting on them.

6. **Fixed.** The interviewer sidebar is now Overview, Interviews and Candidates (their own), plus Approvals only while something waits on them.

## Found by the automated security review and fixed

- Nobody can approve their own request, only admins, recruiters and hiring managers can be approvers, and a non-admin can't drop the organization's default approvers.
- A job can't reach Open by another route (Draft to On hold to Open) when approval is required; it has to have been opened or approved once.
- Editing any email template, including one job's override, needs the "templates" permission.
- Webhook delivery now resolves the address and refuses private, loopback, link-local and cloud-metadata ranges at connection time, and doesn't follow redirects.

## Recruiter: second scrutiny pass

1. **Fixed.** A Hired application no longer shows Reject or the stage dropdown; Reverse on the acceptance panel is the only way back.
2. **Fixed.** Submitting shows a pending state, and the note saves as part of submit (one request flow, one button).
3. **Fixed.** "Save note" is gone; the note goes with "Submit for approval".
4. **Fixed.** Approvals show "Asked by Riley Recruiter" and "Note from Riley Recruiter", not emails.
5. **Fixed.** The dashboard donut counts every active application and matches the tile.
6. **Fixed.** The applications list shows "N new messages", "No activity for N days" (using the organization's stale setting) and an "AI fit" column.
7. **Fixed.** Keyword misses are no longer red chips. They read "Not mentioned by name: …" in muted text with a nudge to run the assessment.
8. Open: the Resume column says "Missing" with no way to ask the candidate for one. A one-click "Ask for a resume" message is the natural fix now that candidate messaging exists.
9. **Fixed.** The Reports page keeps the report list beside the chart down to about 900 px wide.

## Admin and owner: fixed in the second pass

1. **Fixed.** Settings has a row of section links at the top, and links from the checklist land on the right section.
2. **Fixed.** Admin tabs scroll sideways instead of wrapping on narrow windows.
3. **Fixed.** Checklist items link to the section they're about.
4. **Fixed.** The new-job form shows the standard pipeline when no templates exist, with a pointer to where to add more. Development seed data now includes two pipelines and two custom fields.
5. **Fixed.** "Send a test message" posts to the saved Slack or Teams webhook.

## Candidate portal: fixed in the second pass

1. **Fixed.** The company name sits above the heading on both the sign-in screen and the signed-in view.
2. **Fixed.** The sign-in blurb only appears once the page knows there is no session.
3. **Fixed.** Sign-in code emails are tagged as plumbing and left out of "Emails we sent you".
4. **Fixed.** "Current step: New" is now "We're reviewing your application", "Interviews are in progress", "We're finalising a decision", "You've been accepted", and so on. Unknown custom stages fall back to "Current step: X".
5. **Fixed.** Dates use the same formatting as the rest of the app.
6. **Not a bug.** Enter submits; the earlier read happened before the page updated.

## Accessibility (practical standard)

- Automated scan (axe, WCAG 2 A/AA, 2.1 AA): no violations on the dashboard, applications, approvals, settings or the portal after the fixes.
- Keyboard: Mantine modals and drawers trap focus and return it to the opener on close (library default); the Reject dialog was spot-checked. A full keyboard-only walk of every form is still to do.
- Dark mode: the app pins the light scheme (`data-mantine-color-scheme="light"`), so there is no dark mode to check. If one is wanted later, the contrast overrides in `providers.tsx` only cover light.
- Reduced motion: animations and transitions are now switched off under `prefers-reduced-motion`.
- Screen reader pass: not done.

## Open: product gaps worth a decision

- Confidential jobs hide the job and its applications from other recruiters, but the candidate still appears by name in the candidate list and talent search.
- Calendar changes made outside the ATS are only detected for interviewers who connected a personal calendar, not for a workspace-level Microsoft or Google service account.
- Team notifications go to one Slack or Teams channel for the whole organization, not per person.
- Without a Resend webhook secret, delivery status stays at "sent" and bounces are not detected.
- AI requirement extraction is only as good as the job description. The seeded descriptions are one sentence, so extraction looks thin.
- No automated tests for the web app yet (roadmap F5).
