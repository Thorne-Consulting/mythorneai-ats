import type { AppAbility } from '@/lib/ability';

export type Guide = {
  key: string;
  task: string;
  title: string;
  steps: string[];
  href: string;
  link: string;
  /** The picture under the steps, from `public/help/<key>.png`. One sentence that says what it shows. */
  picture?: string;
  /** Shown only to people who can do it. */
  allowed?: (ability: AppAbility) => boolean;
};

const reads =
  (subject: Parameters<AppAbility['can']>[1]) =>
  (a: AppAbility): boolean =>
    a.can('read', subject);

/** Every how-to, in the order the groups show. `tools/help-images.mjs` makes the pictures. */
export const GUIDES: Guide[] = [
  // Getting around
  {
    key: 'search',
    task: 'Getting around',
    title: 'Search or run a command',
    steps: [
      'Press / or ⌘K on any page.',
      'Type a name, an email or a job title to find it.',
      'Or type what you want to do, for example "create job" or "dark mode".',
      'Use the arrow keys and Enter, or click a result.',
    ],
    href: '/',
    link: 'Open the dashboard',
    picture: 'The dashboard, with the search box in the header.',
  },
  {
    key: 'dashboard',
    task: 'Getting around',
    title: 'Set up your dashboard',
    steps: [
      'My work shows only what is assigned to you or waiting on you.',
      'On Team, click Customize to show, hide and reorder the cards.',
    ],
    href: '/',
    link: 'Open the dashboard',
    picture: 'The Team dashboard with its cards.',
    allowed: reads('Job'),
  },
  {
    key: 'notifications',
    task: 'Getting around',
    title: 'Keep up with notifications',
    steps: [
      'Notifications lists approvals, feedback you owe, candidate replies and applications with no recent activity.',
      'Filter by type.',
      'Open an item to act on it, or mark it as done.',
    ],
    href: '/notifications',
    link: 'Open notifications',
    picture: 'The Notifications page with its filters.',
  },
  {
    key: 'preferences',
    task: 'Getting around',
    title: 'Switch to dark mode and set your start page',
    steps: [
      'Open Settings, then Preferences.',
      'Choose Light, Dark or System.',
      'Pick the page that opens when you sign in, the date order and how dense tables are.',
    ],
    href: '/settings/preferences',
    link: 'Open preferences',
    picture: 'The Preferences page, with the theme choice at the top.',
  },

  // Jobs
  {
    key: 'post-job',
    task: 'Jobs',
    title: 'Post a job',
    steps: [
      'Click Post a Job in the header.',
      'Fill in the title, the department, the location and the pay.',
      'Write the posting. Start from a template if one fits.',
      'Submit it. If your company needs approval first, the job opens once it is approved.',
    ],
    href: '/jobs/new',
    link: 'Post a job',
    picture: 'The Post a job steps, with the posting preview on the right.',
    allowed: (a) => a.can('create', 'Job'),
  },
  {
    key: 'job',
    task: 'Jobs',
    title: 'Find your way around a job',
    steps: [
      'Open Jobs and click a job.',
      'The tabs under the title are Overview, Candidates, Pipeline, Posting, Requirements, Interview kits, Team and Settings.',
      'The header shows the status and the main action. The ••• menu has the rest.',
    ],
    href: '/jobs',
    link: 'Open jobs',
    picture: 'A job page with its tabs under the header.',
    allowed: reads('Job'),
  },
  {
    key: 'approve',
    task: 'Jobs',
    title: 'Approve a job or an offer',
    steps: [
      'Requests waiting on you show in Waiting on you and in Notifications.',
      'Open the request. Read the details and the note from the person who asked.',
      'Approve or reject it. We save your decision on the job or the offer.',
    ],
    href: '/approvals',
    link: 'Open approvals',
    picture: 'The Approvals page with a request waiting.',
    allowed: reads('Job'),
  },
  {
    key: 'team',
    task: 'Jobs',
    title: 'Set the hiring team',
    steps: [
      'Open the job, then its Team tab.',
      'Add the recruiter, the hiring manager and the interviewers.',
      'Each person sees the job in the way their role allows.',
    ],
    href: '/jobs',
    link: 'Open jobs',
    picture: 'The Team tab of a job, with each person and their role.',
    allowed: (a) => a.can('update', 'Job'),
  },
  {
    key: 'stages',
    task: 'Jobs',
    title: 'Change the pipeline stages',
    steps: [
      'Open Settings, then Pipelines.',
      'Each template lists its stages in order. Each stage has a type: screen, interview, offer or hired.',
      'Give a stage the name candidates see, and choose whether an email goes out when someone enters it.',
      'New jobs start from the default template. A job can change its own stages on its Settings tab.',
    ],
    href: '/settings/pipelines',
    link: 'Open pipelines',
    picture: 'The Pipelines settings page with a template and its stages.',
    allowed: (a) => a.can('manage', 'Workspace'),
  },

  // Candidates
  {
    key: 'add-candidate',
    task: 'Candidates',
    title: 'Add a candidate',
    steps: [
      'Open Candidates and click Add candidate.',
      'Or add people from a resume or from a spreadsheet (CSV).',
      'Fill in their details and save. Their profile opens under Candidates.',
    ],
    href: '/candidates',
    link: 'Open candidates',
    picture: 'The Candidates list with its filters and the Add candidate button.',
    allowed: (a) => a.can('create', 'Candidate'),
  },
  {
    key: 'candidate',
    task: 'Candidates',
    title: 'Read a candidate profile',
    steps: [
      'Open a candidate. The top shows who they are and the jobs they are in.',
      'The tabs are Overview, Applications, Files and Resume.',
      'Write a note at the bottom of the Overview. Type @ to bring a colleague in.',
    ],
    href: '/candidates',
    link: 'Open candidates',
    picture: 'A candidate profile with its tabs and the activity feed.',
    allowed: reads('Candidate'),
  },
  {
    key: 'move',
    task: 'Candidates',
    title: 'Move a candidate to the next stage',
    steps: [
      'Open the job and go to its Pipeline tab.',
      'Drag the card to the next stage, or open the candidate and use Move stage.',
      'If the stage sends an email, you see it before it goes out.',
      'Rejecting asks for a reason, so every decision is recorded.',
    ],
    href: '/jobs',
    link: 'Open jobs',
    picture: 'The pipeline board, one column for each stage.',
    allowed: (a) => a.can('update', 'Job'),
  },
  {
    key: 'talent-pools',
    task: 'Candidates',
    title: 'Keep people for later in a talent pool',
    steps: [
      'Open Candidates, then Talent pools.',
      'Make a pool, for example "Designers to call back".',
      'Add people from their profile or from the list with Add to pool.',
      'When a job opens, send the whole pool an email in one go.',
    ],
    href: '/candidates/talent-pools',
    link: 'Open talent pools',
    picture: 'The Talent pools page.',
    allowed: reads('Candidate'),
  },
  {
    key: 'saved-views',
    task: 'Candidates',
    title: 'Save a candidate list you use often',
    steps: [
      'Open Candidates and set the filters and columns you want.',
      'Click Save view and name it.',
      'Share it with the team, or keep it for yourself. It shows at the top of Candidates.',
    ],
    href: '/candidates',
    link: 'Open candidates',
    picture: 'A saved view of candidates.',
    allowed: reads('Candidate'),
  },
  {
    key: 'compare',
    task: 'Candidates',
    title: 'Compare candidates side by side',
    steps: [
      'Open Candidates and tick two or more people.',
      'Choose Compare in the bar at the bottom.',
      'Each column is one person: their resume facts, scorecards and stage.',
    ],
    href: '/candidates',
    link: 'Open candidates',
    picture: 'Two candidates side by side on the Compare page.',
    allowed: reads('Candidate'),
  },

  // Interviews
  {
    key: 'schedule',
    task: 'Interviews',
    title: 'Schedule an interview',
    steps: [
      'Open the candidate and choose Schedule interview.',
      'Pick the interview type, the interviewers and a time. The scheduler shows when each person is free.',
      'Or send the candidate a link, and they pick a time that suits them.',
      'Everyone on the panel sees it under Interviews, and the candidate gets a calendar invite.',
    ],
    href: '/interviews/schedule',
    link: 'Open the scheduler',
    picture: 'The scheduler, with the week view and the free times of each interviewer.',
    allowed: (a) => a.can('schedule', 'Interview'),
  },
  {
    key: 'feedback',
    task: 'Interviews',
    title: 'Submit a scorecard',
    steps: [
      'Open Interviews and find the interview you ran.',
      'Rate each area, add notes and say whether you would hire.',
      'Click Submit scorecard. It locks after that, so every interviewer stays independent.',
      "Other people's feedback opens to you once yours is in.",
    ],
    href: '/interviews',
    link: 'Open interviews',
    picture: 'A scorecard, with a rating for each area and the final call.',
  },
  {
    key: 'kits',
    task: 'Interviews',
    title: 'Make an interview kit',
    steps: [
      'Open the job, then Interview kits.',
      'A kit holds the questions to ask and the areas to rate.',
      'Start from a template in the interview library, or write your own.',
      'Interviewers see the kit in the interview room and on their scorecard.',
    ],
    href: '/settings/interview-library',
    link: 'Open the interview library',
    picture: 'The Interview kits tab of a job.',
    allowed: (a) => a.can('update', 'Job'),
  },
  {
    key: 'room',
    task: 'Interviews',
    title: 'Run the interview from the room',
    steps: [
      'Open the interview, then Room.',
      'The kit is on the left. Take notes on the right as you go.',
      'Record the call if the candidate agrees. We write a transcript and a summary afterwards.',
      'When you finish, the room sends you to the scorecard.',
    ],
    href: '/interviews',
    link: 'Open interviews',
    picture: 'The interview room, with the kit and the notes.',
  },
  {
    key: 'calendar',
    task: 'Interviews',
    title: 'Connect your calendar',
    steps: [
      'Open Settings, then Calendar and hours.',
      'Connect your Google or Microsoft calendar. We only read when you are busy.',
      'Set your working hours and time zone, so interviews are booked when you are free.',
    ],
    href: '/settings/availability',
    link: 'Open calendar and hours',
    picture: 'The Calendar and hours page, with the working hours for each day.',
  },

  // Offers
  {
    key: 'offer',
    task: 'Offers',
    title: 'Make an offer',
    steps: [
      'Open the application, then its Offer tab.',
      'Fill in the pay, the start date and the other terms.',
      'Pick the letter. The terms fill in by themselves.',
      'Send it for approval if your company asks for that, then send it to the candidate.',
      'The candidate accepts or declines in their portal. You see the answer on the same tab.',
    ],
    href: '/candidates',
    link: 'Open candidates',
    picture: 'The Offer tab of an application, with the terms and the letter.',
    allowed: (a) => a.can('update', 'Job'),
  },
  {
    key: 'offer-letters',
    task: 'Offers',
    title: 'Write an offer letter template',
    steps: [
      'Open Settings, then Offer letters.',
      'Write the letter once. Type { to put in a detail, for example the pay or the start date.',
      'Each offer starts from a letter and keeps the version it started from.',
    ],
    href: '/settings/offer-letters',
    link: 'Open offer letters',
    picture: 'The Offer letters settings page.',
    allowed: (a) => a.can('manage', 'Workspace'),
  },

  // Messages
  {
    key: 'inbox',
    task: 'Messages',
    title: 'Write to a candidate',
    steps: [
      'Open Messages. Every candidate thread is here, and the same thread shows on the application.',
      'Reply in the box at the bottom. Type { to put in a saved reply.',
      'Candidates answer from their email or from their portal. The reply lands in the same thread.',
      'Assign a thread to a colleague, star it, or snooze it until later.',
    ],
    href: '/messages',
    link: 'Open messages',
    picture: 'The inbox, with the list on the left and one thread open.',
    allowed: reads('Message'),
  },
  {
    key: 'templates',
    task: 'Messages',
    title: 'Keep saved replies and automatic emails',
    steps: [
      'Open Messages, then Templates.',
      'Saved replies are for you to pick while you write.',
      'Automatic emails go out on their own, for example when someone applies or enters a stage.',
      'Type { in any email to put in a detail, for example the first name or the job title.',
    ],
    href: '/messages/templates',
    link: 'Open templates',
    picture: 'The Templates page with saved replies and automatic emails.',
    allowed: reads('Message'),
  },
  {
    key: 'bulk-email',
    task: 'Messages',
    title: 'Email many candidates at once',
    steps: [
      'Open Candidates or a pipeline and tick the people.',
      'Choose Send email in the bar at the bottom.',
      'Write once. Each person gets their own email with their own name in it.',
    ],
    href: '/candidates',
    link: 'Open candidates',
    picture: 'The candidate list with people ticked and the bar at the bottom.',
    allowed: reads('Message'),
  },

  // Assessments
  {
    key: 'assessment',
    task: 'Assessments',
    title: 'Build an assessment',
    steps: [
      'Open Assessments, then New assessment.',
      'Add questions: multiple choice, a written answer, a file to upload, or code to write.',
      'Set the time limit and the pass mark. Check for problems, then publish.',
    ],
    href: '/assessments/new',
    link: 'Build an assessment',
    picture: 'The assessment builder with its questions.',
    allowed: (a) => a.can('manage', 'Assessment'),
  },
  {
    key: 'send-assessment',
    task: 'Assessments',
    title: 'Send an assessment and grade it',
    steps: [
      'Open the candidate and choose Send assessment, or set a stage to send it by itself.',
      'The candidate takes it in their portal before the deadline.',
      'Multiple choice grades itself. Written answers and code wait for you under To grade.',
      'The result shows next to the scorecards.',
    ],
    href: '/assessments',
    link: 'Open assessments',
    picture: 'An assessment with the people invited and their results.',
    allowed: reads('Assessment'),
  },

  // Reports
  {
    key: 'report',
    task: 'Reports',
    title: 'Read and share a report',
    steps: [
      'Open Reports and pick one from the side: pipeline, speed, sources, offers or team.',
      'Filter by job, source and dates.',
      'Download the table as a spreadsheet (CSV), or as a PDF to print or share.',
    ],
    href: '/reports',
    link: 'Open reports',
    picture: 'The Reports overview.',
    allowed: reads('Report'),
  },
  {
    key: 'report-view',
    task: 'Reports',
    title: 'Save a report your way',
    steps: [
      'Open any report. Choose the dates and filters, and pick what to break it down by.',
      'Choose Save view and give it a name. Share it with your team if you like.',
      "From the view's menu, pin it to the reports overview or have it emailed every week or month.",
    ],
    href: '/reports/funnel',
    link: 'Open the pipeline report',
    picture: 'The pipeline report, with the stages as a funnel.',
    allowed: reads('Report'),
  },

  // Careers site and portal
  {
    key: 'careers',
    task: 'Careers site and portal',
    title: 'Set up your careers site',
    steps: [
      'Open Settings, then Careers site.',
      'Add your logo, your colours and a short intro.',
      'Every open job shows on the site. Applying takes one page, and the resume fills most of it in.',
    ],
    href: '/settings/careers',
    link: 'Open careers site settings',
    picture: 'The Careers site settings, with the branding and the intro.',
    allowed: (a) => a.can('manage', 'Workspace'),
  },
  {
    key: 'careers-site',
    task: 'Careers site and portal',
    title: 'See what applicants see',
    steps: [
      'Open the careers site from Settings, then Careers site, with View site.',
      'Each job has its own page with an Apply button.',
      'On a job, choose Preview posting to see that job as applicants will.',
    ],
    href: '/careers',
    link: 'Open the careers site',
    picture: 'The careers site, with the open jobs.',
  },
  {
    key: 'portal',
    task: 'Careers site and portal',
    title: 'What candidates see in their portal',
    steps: [
      'Every applicant gets a portal link by email. They sign in with a code, with no password.',
      'They see each application and its stage, their interviews, their messages and their offer.',
      'They can book an interview, take an assessment, upload a file and accept an offer there.',
    ],
    href: '/candidate-portal',
    link: 'Open the portal sign-in',
    picture: 'The candidate portal home, as a candidate sees it.',
  },

  // Your team
  {
    key: 'members',
    task: 'Your team',
    title: 'Invite a colleague',
    steps: [
      'Open Settings, then Members.',
      'Click Invite and enter their email and role.',
      'They get an email with a sign-in link. Until they accept, the invite shows as pending.',
    ],
    href: '/settings/members',
    link: 'Open members',
    picture: 'The Members page with each person and their role.',
    allowed: (a) => a.can('manage', 'Member'),
  },
  {
    key: 'role',
    task: 'Your team',
    title: 'Make a role of your own',
    steps: [
      'Open Settings, then Roles. Choose Duplicate on the role closest to what you need.',
      'Name it, then pick which jobs it works on and what else it can do.',
      'Save, then give it to people under Members or when you invite them.',
    ],
    href: '/settings/roles',
    link: 'Open roles',
    picture: 'The Roles page, with the four built-in roles.',
    allowed: (a) => a.can('manage', 'Member'),
  },
  {
    key: 'workflows',
    task: 'Your team',
    title: 'Let a workflow do the routine work',
    steps: [
      'Open Settings, then Workflows.',
      'A workflow starts on an event, for example a new application or a stage change.',
      'Add steps: send an email, send an assessment, add a tag, tell Slack or Teams, or call a web address.',
      'Turn it on. Each run shows in the activity feed of the application.',
    ],
    href: '/settings/workflows',
    link: 'Open workflows',
    picture: 'A workflow, drawn as steps from the event to the actions.',
    allowed: (a) => a.can('manage', 'Workspace'),
  },
  {
    key: 'rejection-reasons',
    task: 'Your team',
    title: 'Set the reasons for a rejection',
    steps: [
      'Open Settings, then Rejection reasons.',
      'Add the reasons your team picks from. Mark the ones that need a note.',
      'The reasons show in reports, so you learn where people drop out.',
    ],
    href: '/settings/rejection-reasons',
    link: 'Open rejection reasons',
    picture: 'The Rejection reasons list.',
    allowed: (a) => a.can('manage', 'Workspace'),
  },
  {
    key: 'activity',
    task: 'Your team',
    title: 'See who changed what',
    steps: [
      'Open Settings, then Activity history.',
      'Every change to settings, members and records is listed with who made it and when.',
      'Filter by person or by kind of change.',
    ],
    href: '/settings/activity',
    link: 'Open activity history',
    picture: 'The Activity history page.',
    allowed: (a) => a.can('manage', 'Workspace'),
  },
];
