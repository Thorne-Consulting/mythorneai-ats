// Sample data for the Assessments preview. Every person here is fictional (names from the Figma
// frames). Replace with a query when the assessments API exists. Everything is plain JSON so it can
// be kept per browser; candidate answers are derived from ids (sampleAnswer) rather than stored.
import type { Tone } from '@/components/ui';
import {
  hash,
  isAutoScored,
  scoreSubmission,
  type Answer,
  type ChoiceOption,
  type Question,
  type QuestionType,
} from './assessments/scoring';

export type AssessmentStatus = 'active' | 'draft' | 'archived';

export type AssessmentSettings = {
  /** Auto-submit when the duration runs out. */
  timed: boolean;
  attempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  webcam: boolean;
  tabSwitch: boolean;
  fullscreen: boolean;
  blockPaste: boolean;
  /** Invitations expire this many days after they are sent. */
  expiryDays: number;
};

export type Section = { id: string; title: string; questions: Question[] };

export type Assessment = {
  id: string;
  name: string;
  type: string;
  department: string;
  minutes: number;
  /** Percent needed to pass. */
  passMark: number;
  instructions: string;
  status: AssessmentStatus;
  tone: Tone;
  sections: Section[];
  settings: AssessmentSettings;
};

export type InviteStatus = 'NotStarted' | 'InProgress' | 'Completed' | 'Expired';
export type Decision = 'Passed' | 'Failed';

/** One candidate invited to one assessment. A completed invite is a result. */
export type Invite = {
  id: string;
  assessmentId: string;
  candidate: string;
  email: string;
  status: InviteStatus;
  /** Local date-time strings ("2026-11-02T09:00"). */
  invitedOn: string;
  submittedOn: string | null;
  /** Reviewer points per manually scored question id. */
  reviews: Record<string, number>;
  comment: string;
  decision: Decision | null;
  reviewer: string | null;
};

export const assessmentTypes = ['Technical skills', 'Case study', 'Practical task', 'Situational'];
export const departments = [
  'Engineering',
  'Product',
  'Design',
  'Analytics',
  'Marketing',
  'Support',
  'Sales',
];
export const codeLanguages = ['TypeScript', 'JavaScript', 'Python', 'Java', 'C#', 'Go', 'SQL'];

export const defaultSettings: AssessmentSettings = {
  timed: true,
  attempts: 1,
  shuffleQuestions: false,
  shuffleOptions: true,
  webcam: false,
  tabSwitch: true,
  fullscreen: false,
  blockPaste: false,
  expiryDays: 7,
};

export function newQuestion(type: QuestionType, id = crypto.randomUUID()): Question {
  const opt = (): ChoiceOption => ({ id: crypto.randomUUID(), text: '', correct: false });
  return {
    id,
    type,
    prompt: '',
    points: type === 'long' || type === 'code' || type === 'file' ? 10 : 2,
    options: type === 'single' || type === 'multi' ? [opt(), opt(), opt()] : [],
    rubric: '',
    language: type === 'code' ? 'TypeScript' : '',
    starterCode: '',
    accept: type === 'file' ? '.pdf,.png,.zip' : '',
  };
}

// ---- Question banks, one per department -------------------------------------------------------

type Draft = Partial<Question> & {
  type: QuestionType;
  prompt: string;
  choices?: [string, boolean][];
};
type Bank = { title: string; questions: Draft[] }[];

const bank: Record<string, Bank> = {
  Engineering: [
    {
      title: 'Fundamentals',
      questions: [
        {
          type: 'single',
          prompt: 'Which data structure gives constant-time lookup by key on average?',
          choices: [
            ['Array', false],
            ['Hash map', true],
            ['Linked list', false],
            ['Binary heap', false],
          ],
        },
        {
          type: 'multi',
          prompt: 'Which of these are suitable for storing user passwords?',
          choices: [
            ['bcrypt', true],
            ['Argon2', true],
            ['MD5', false],
            ['Plain SHA-1', false],
          ],
        },
        {
          type: 'short',
          prompt: 'In one or two sentences, what does it mean for an HTTP method to be idempotent?',
          points: 4,
          rubric:
            'Repeating the same request has the same effect on the server as sending it once. Mentions PUT/DELETE vs POST for full marks.',
        },
      ],
    },
    {
      title: 'Practical',
      questions: [
        {
          type: 'code',
          prompt:
            'Write a function that returns the first character in a string that does not repeat, or null if there is none.',
          language: 'TypeScript',
          starterCode:
            'export function firstUnique(s: string): string | null {\n  // your code here\n}',
          rubric:
            'Correct on empty string and all-repeating input. Linear time with a map earns full marks; nested loops earn half.',
        },
        {
          type: 'long',
          prompt:
            'A long-running Node service slowly uses more memory until it restarts. How would you find the cause?',
          rubric:
            'Reproduces locally, takes heap snapshots over time and compares retained objects, checks caches, listeners and closures, and proposes a guard such as an LRU or a metric.',
        },
      ],
    },
  ],
  Product: [
    {
      title: 'Product sense',
      questions: [
        {
          type: 'single',
          prompt: 'Activation for a new feature is flat after launch. What do you look at first?',
          choices: [
            ['Revenue by region', false],
            ['Where users drop in the feature funnel', true],
            ['Competitor pricing', false],
            ['Team velocity', false],
          ],
        },
        {
          type: 'long',
          prompt:
            'Our recruiters say scheduling interviews takes too long. Write a one-page problem statement and the first experiment you would run.',
          rubric:
            'Names the user and the job to be done, sizes the problem with data, separates problem from solution, and picks a small, measurable first experiment.',
        },
      ],
    },
    {
      title: 'Prioritisation',
      questions: [
        {
          type: 'short',
          prompt: 'Name one prioritisation framework you use and when it fails.',
          points: 4,
          rubric: 'Any framework (RICE, Kano, cost of delay) with an honest limit.',
        },
        {
          type: 'long',
          prompt:
            'You have three requests from sales, one from support and a tech-debt ask from engineering. How do you decide?',
          rubric:
            'Uses a shared goal to compare, involves the requesters, makes the trade-off explicit and communicates it.',
        },
      ],
    },
  ],
  Design: [
    {
      title: 'Design task',
      questions: [
        {
          type: 'file',
          prompt:
            'Redesign the checkout step from the brief. Upload your screens as a PDF or images.',
          points: 20,
          accept: '.pdf,.png,.jpg,.fig',
          rubric:
            'Clear hierarchy, fewer steps than the original, accessible contrast and states, and a mobile layout.',
        },
        {
          type: 'long',
          prompt:
            'Walk us through the two most important decisions in your redesign and what you traded off.',
          rubric:
            'Explains the why, links decisions to user problems, and names what was given up.',
        },
      ],
    },
    {
      title: 'Principles',
      questions: [
        {
          type: 'single',
          prompt: 'What is the minimum contrast ratio for body text under WCAG 2.1 AA?',
          choices: [
            ['3:1', false],
            ['4.5:1', true],
            ['7:1', false],
            ['2:1', false],
          ],
        },
        {
          type: 'short',
          prompt: 'When would you choose a modal over a new page?',
          points: 4,
          rubric:
            'Short, focused decisions that keep context; avoids modals for long or multi-step tasks.',
        },
      ],
    },
  ],
  Analytics: [
    {
      title: 'Statistics',
      questions: [
        {
          type: 'single',
          prompt:
            'A/B test result: p = 0.03 with a pre-registered alpha of 0.05. What can you conclude?',
          choices: [
            ['The variant is 97% likely to be better', false],
            ['The difference is statistically significant at the chosen level', true],
            ['The effect is large', false],
            ['Nothing at all', false],
          ],
        },
        {
          type: 'multi',
          prompt: 'Which of these are measures of spread?',
          choices: [
            ['Standard deviation', true],
            ['Interquartile range', true],
            ['Median', false],
            ['Mode', false],
          ],
        },
      ],
    },
    {
      title: 'SQL',
      questions: [
        {
          type: 'code',
          prompt:
            'Return each department with its number of open jobs, highest first. Tables: jobs(id, department, status).',
          language: 'SQL',
          starterCode: 'SELECT\n  -- your query here\nFROM jobs;',
          rubric:
            'Filters status = open, groups by department, orders by count desc. Full marks if it handles departments with zero open jobs via a left join or explains why not.',
        },
        {
          type: 'short',
          prompt: 'Why might an average time-to-hire be misleading?',
          points: 4,
          rubric: 'Skew and outliers; suggests the median or percentiles.',
        },
      ],
    },
  ],
  Marketing: [
    {
      title: 'Strategy',
      questions: [
        {
          type: 'single',
          prompt: 'Which metric best shows whether a campaign brought in the right people?',
          choices: [
            ['Impressions', false],
            ['Click-through rate', false],
            ['Qualified pipeline created', true],
            ['Followers gained', false],
          ],
        },
        {
          type: 'long',
          prompt: 'Outline a launch plan for a new careers site with a budget of $10k.',
          rubric:
            'Clear audience, two or three channels with reasons, a timeline, and how success is measured.',
        },
      ],
    },
    {
      title: 'Messaging',
      questions: [
        {
          type: 'multi',
          prompt: 'Which of these belong in a positioning statement?',
          choices: [
            ['Target audience', true],
            ['Key benefit', true],
            ['Office address', false],
            ['Proof point', true],
          ],
        },
        {
          type: 'short',
          prompt:
            'Rewrite this headline to be clearer: "Leveraging synergies for talent outcomes".',
          points: 4,
          rubric: 'Plain words, a concrete benefit, under ten words.',
        },
      ],
    },
  ],
  Support: [
    {
      title: 'Scenarios',
      questions: [
        {
          type: 'single',
          prompt:
            'A customer is angry about a bug that is already fixed in the next release. What do you do first?',
          choices: [
            ['Tell them it is fixed soon and close the ticket', false],
            ['Acknowledge the impact and share when the fix ships', true],
            ['Escalate to engineering', false],
            ['Offer a refund', false],
          ],
        },
        {
          type: 'single',
          prompt: 'Which ticket should be handled first?',
          choices: [
            ['Feature request from a large customer', false],
            ['Login outage for one team', true],
            ['Typo in an email template', false],
            ['Question about pricing', false],
          ],
        },
      ],
    },
    {
      title: 'Writing',
      questions: [
        {
          type: 'long',
          prompt:
            'Reply to a customer whose data import failed halfway. Assume you do not know the cause yet.',
          rubric:
            'Empathetic, honest about what is known, gives a next step and a time to expect an update.',
        },
        {
          type: 'short',
          prompt: 'What do you include in a bug report to engineering?',
          points: 4,
          rubric: 'Steps to reproduce, expected vs actual, account and time, screenshots or logs.',
        },
      ],
    },
  ],
  Sales: [
    {
      title: 'Discovery',
      questions: [
        {
          type: 'single',
          prompt: 'Which is the strongest discovery question?',
          choices: [
            ['Do you like our product?', false],
            ['What happens if you do not solve this this quarter?', true],
            ['Can I send you a quote?', false],
            ['Who is your current vendor?', false],
          ],
        },
        {
          type: 'long',
          prompt:
            'A prospect says "we are happy with our spreadsheet". Write how you would continue the conversation.',
          rubric:
            'Stays curious, asks about cost of the current process, avoids pitching too early.',
        },
        {
          type: 'short',
          prompt: 'How do you tell a real buying signal from politeness?',
          points: 4,
          rubric: 'Concrete next steps, involvement of decision makers, timeline or budget talk.',
        },
      ],
    },
  ],
};

function sectionsFor(assessmentId: string, department: string): Section[] {
  return (bank[department] ?? bank.Engineering).map((s, si) => ({
    id: `${assessmentId}-s${si}`,
    title: s.title,
    questions: s.questions.map(({ choices, ...d }, qi) => {
      const id = `${assessmentId}-q${si}${qi}`;
      return {
        ...newQuestion(d.type, id),
        ...d,
        options: (choices ?? []).map(([text, correct], oi) => ({
          id: `${id}-o${oi}`,
          text,
          correct,
        })),
      };
    }),
  }));
}

// ---- Assessments -----------------------------------------------------------------------------

type Seed = [
  id: string,
  name: string,
  type: string,
  department: string,
  minutes: number,
  status: AssessmentStatus,
  invited: number,
  tone: Tone,
];

const seeds: Seed[] = [
  ['a1', 'Software Engineering', 'Technical skills', 'Engineering', 60, 'active', 48, 'blue'],
  ['a2', 'Product Thinking', 'Case study', 'Product', 45, 'active', 32, 'violet'],
  ['a3', 'Design Challenge', 'Practical task', 'Design', 90, 'active', 24, 'blue'],
  ['a4', 'Data Analytics', 'Technical skills', 'Analytics', 60, 'active', 20, 'green'],
  ['a5', 'Marketing Strategy', 'Case study', 'Marketing', 40, 'active', 14, 'amber'],
  ['a6', 'Customer Support Scenarios', 'Situational', 'Support', 30, 'active', 18, 'green'],
  ['a7', 'Frontend Take-home', 'Practical task', 'Engineering', 120, 'active', 9, 'blue'],
  ['a8', 'Sales Discovery Role-play', 'Situational', 'Sales', 30, 'active', 11, 'violet'],
  ['a9', 'Backend System Design', 'Technical skills', 'Engineering', 75, 'draft', 0, 'blue'],
  ['a10', 'UX Writing Exercise', 'Practical task', 'Design', 30, 'draft', 0, 'violet'],
  ['a11', 'SQL Basics (2025)', 'Technical skills', 'Analytics', 30, 'archived', 66, 'gray'],
  ['a12', 'Brand Voice Quiz', 'Case study', 'Marketing', 20, 'archived', 21, 'gray'],
  ['a13', 'Support Ticket Triage', 'Situational', 'Support', 25, 'archived', 30, 'gray'],
  ['a14', 'Mobile UI Review', 'Practical task', 'Design', 60, 'archived', 12, 'gray'],
];

export const sampleAssessments: Assessment[] = seeds.map(
  ([id, name, type, department, minutes, status, , tone]) => ({
    id,
    name,
    type,
    department,
    minutes,
    passMark: 60,
    instructions: `Work through each section in order. You have ${minutes} minutes once you start, and your answers save as you go. Use your own words; you may look up syntax but not ask anyone for help.`,
    status,
    tone,
    sections: sectionsFor(id, department),
    settings: { ...defaultSettings, webcam: type === 'Technical skills' },
  }),
);

// ---- Candidate answers (derived, not stored) -------------------------------------------------

const textAnswers = [
  'I would start by reproducing the problem and measuring it, then narrow it down step by step and write down what I ruled out.',
  'It depends on the context, but generally I would agree the goal with the team first and then pick the simplest option that meets it.',
  'My approach is to talk to the people affected, look at the data we already have, and propose a small change we can measure within two weeks.',
  'Not sure. I think it has to do with performance.',
];

/** How strong a sample candidate is, 40–99. */
const skillOf = (inviteId: string) => 40 + (hash(inviteId) % 60);

export function sampleAnswer(q: Question, inviteId: string, candidate: string): Answer {
  const r = hash(`${inviteId}:${q.id}`) % 100;
  const good = r < skillOf(inviteId);
  const correct = q.options.filter((o) => o.correct).map((o) => o.id);
  const wrong = q.options.filter((o) => !o.correct).map((o) => o.id);
  const empty: Answer = { choice: [], text: '', file: '' };
  switch (q.type) {
    case 'single':
      return {
        ...empty,
        choice: good || !wrong.length ? correct.slice(0, 1) : [wrong[r % wrong.length]],
      };
    case 'multi':
      return {
        ...empty,
        choice: good ? correct : correct.slice(0, Math.max(1, correct.length - 1)),
      };
    case 'code':
      return {
        ...empty,
        text: good
          ? q.starterCode.replace(
              /(\/\/|--) your (code|query) here/,
              q.language === 'SQL'
                ? "department, COUNT(*) AS open_jobs\nFROM jobs\nWHERE status = 'open'\nGROUP BY department\nORDER BY open_jobs DESC\n--"
                : 'const seen = new Map<string, number>();\n  for (const c of s) seen.set(c, (seen.get(c) ?? 0) + 1);\n  for (const c of s) if (seen.get(c) === 1) return c;\n  return null;',
            )
          : q.starterCode,
      };
    case 'file':
      return { ...empty, file: `${candidate.toLowerCase().replace(/\W+/g, '-')}-submission.pdf` };
    default:
      return { ...empty, text: textAnswers[good ? r % 3 : 3] };
  }
}

export const questionsOf = (a: Assessment) => a.sections.flatMap((s) => s.questions);

export function answersFor(a: Assessment, inv: Invite): Record<string, Answer> {
  return Object.fromEntries(
    questionsOf(a).map((q) => [q.id, sampleAnswer(q, inv.id, inv.candidate)]),
  );
}

export const resultOf = (a: Assessment, inv: Invite) =>
  scoreSubmission(questionsOf(a), answersFor(a, inv), inv.reviews);

// ---- Invitations -----------------------------------------------------------------------------

const firstNames = [
  'Karen',
  'Carl',
  'Jordan',
  'Kleish',
  'Third',
  'Nicole',
  'Paolo',
  'Andrea',
  'Sofia',
  'Jayl',
  'Miguel',
  'Bea',
  'Rafael',
  'Liza',
  'Marco',
  'Trina',
];
const lastNames = [
  'Dela Cruz',
  'Rabanero',
  'Bump',
  'Mendiola',
  'Villamor',
  'Reyes',
  'Mendoza',
  'Santos',
  'Ramos',
  'Remando',
  'Navarro',
  'Aquino',
];
const reviewers = ['Alex Morgan', 'Priya Shah', 'Sam Lee'];

/** Reference "today" for the sample data. */
const today = new Date('2026-11-12T09:00');
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(9 + (n % 8)).padStart(2, '0')}:${n % 2 ? '30' : '00'}`;
};

function invitesFor(seed: Seed, a: Assessment): Invite[] {
  const [id, , , , , status, count] = seed;
  const offset = hash(id);
  const qs = questionsOf(a);
  return Array.from({ length: count }, (_, i) => {
    // (i % 16, i / 16) is unique for i < 192, so no assessment invites the same name twice.
    const candidate = `${firstNames[(i + offset) % 16]} ${lastNames[(Math.floor(i / 16) + offset) % 12]}`;
    const inviteId = `${id}-i${i}`;
    const h = hash(inviteId) % 100;
    const st: InviteStatus =
      status === 'archived'
        ? h < 85
          ? 'Completed'
          : 'Expired'
        : h < 62
          ? 'Completed'
          : h < 76
            ? 'InProgress'
            : h < 92
              ? 'NotStarted'
              : 'Expired';
    const age = (h % 28) + 2 + (status === 'archived' ? 200 : 0);
    const inv: Invite = {
      id: inviteId,
      assessmentId: id,
      candidate,
      email: `${candidate.toLowerCase().replace(/\W+/g, '.')}@example.com`,
      status: st,
      invitedOn: daysAgo(age),
      submittedOn: st === 'Completed' ? daysAgo(Math.max(0, age - 1 - (h % 3))) : null,
      reviews: {},
      comment: '',
      decision: null,
      reviewer: null,
    };
    // A few recent submissions are left for a reviewer; the rest are scored and decided.
    if (st === 'Completed' && !(status === 'active' && h < 14)) {
      const skill = skillOf(inviteId);
      for (const q of qs)
        if (!isAutoScored(q)) {
          const jitter = (hash(`${inviteId}:${q.id}:r`) % 30) - 15;
          inv.reviews[q.id] = Math.round(
            (q.points * Math.min(100, Math.max(0, skill + jitter))) / 100,
          );
        }
      const pct = scoreSubmission(qs, answersFor(a, inv), inv.reviews).percent ?? 0;
      inv.decision = pct >= a.passMark ? 'Passed' : 'Failed';
      inv.reviewer = reviewers[h % reviewers.length];
      inv.comment =
        pct >= a.passMark ? 'Solid, clear answers.' : 'Below the bar on the written questions.';
    }
    return inv;
  });
}

export const sampleInvites: Invite[] = seeds.flatMap((s, i) => invitesFor(s, sampleAssessments[i]));
