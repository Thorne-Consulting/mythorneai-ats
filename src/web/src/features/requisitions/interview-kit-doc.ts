import type { EditorTemplate } from '@/components/plate/document-editor';
import type { InterviewKit } from '@/types';

/*
 * An interview kit is written as one document. Its headings carry the structure:
 *
 *   # Kit name
 *   ## Interviewer instructions / ## Candidate booking message / ## Interviewer assignment message
 *   ## Scorecard             a table: Competency | Question to ask | What good looks like | Weight
 *
 * Kits written before the table used one "### Competency" heading per item, with the question
 * underneath and optional "Good looks like:" and "Weight:" lines; those still parse.
 */

export interface KitCriterion {
  name: string;
  question: string;
  description: string;
  weight: number;
}

export interface ParsedKit {
  name: string;
  instructions: string;
  candidateMessage: string;
  interviewerMessage: string;
  criteria: KitCriterion[];
}

/** Text between a heading at `level` and the next heading at that level or above, keyed by title. */
function sectionsAt(markdown: string, level: number) {
  const out: Array<{ title: string; body: string }> = [];
  const heading = new RegExp(`^#{1,${level}}\\s+(.+?)\\s*$`, 'gm');
  const exact = new RegExp(`^#{${level}}\\s`);
  const matches = [...markdown.matchAll(heading)];
  matches.forEach((match, index) => {
    if (!exact.test(match[0])) return;
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    out.push({ title: match[1].trim(), body: markdown.slice(start, end).trim() });
  });
  return out;
}

function parseCriterion(title: string, body: string): KitCriterion {
  let description = '';
  let weight = 3;
  const question: string[] = [];
  for (const line of body
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const good = /^good looks like:\s*(.*)$/i.exec(line);
    const scale = /^weight:\s*(\d+)/i.exec(line);
    if (good) description = good[1];
    else if (scale) weight = Math.min(5, Math.max(1, Number(scale[1])));
    else question.push(line);
  }
  return { name: title, question: question.join(' '), description, weight };
}

export const SCORECARD_HEADER =
  '| Competency | Question to ask | What good looks like | Weight |\n| --- | --- | --- | --- |';

const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

/** One scorecard table row. Pipes inside text are escaped so the columns stay put. */
export function scorecardRow(name: string, question: string, good: string, weight: number) {
  return `| ${escapeCell(name)} | ${escapeCell(question)} | ${escapeCell(good)} | ${weight} |`;
}

/** Rows of the first markdown table in `body`, header and divider skipped. */
function tableRows(body: string) {
  const lines = body.split('\n').map((line) => line.trim());
  const start = lines.findIndex((line) => line.startsWith('|'));
  if (start === -1) return null;
  const rows: string[][] = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith('|')) break;
    const cells = line
      .replace(/^\|/, '')
      .replace(/(?<!\\)\|$/, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.replace(/\\\|/g, '|').trim());
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    rows.push(cells);
  }
  return rows.slice(1);
}

export function parseKit(markdown: string): ParsedKit {
  const name = /^#\s+(.+?)\s*$/m.exec(markdown)?.[1] ?? '';
  const sections = new Map(
    sectionsAt(markdown, 2).map((section) => [section.title.toLowerCase(), section.body]),
  );
  const scorecard = sections.get('scorecard') ?? '';
  return {
    name,
    instructions: sections.get('interviewer instructions') ?? '',
    candidateMessage: sections.get('candidate booking message') ?? '',
    interviewerMessage: sections.get('interviewer assignment message') ?? '',
    criteria: (
      tableRows(scorecard)?.map(([name = '', question = '', good = '', weight = '']) => ({
        name,
        question,
        description: good,
        weight: Math.min(5, Math.max(1, Number.parseInt(weight, 10) || 3)),
      })) ?? sectionsAt(scorecard, 3).map((item) => parseCriterion(item.title, item.body))
    ).filter((item) => item.name && item.question),
  };
}

/*
 * The templates follow common structured-interviewing practice (Google re:Work, Greenhouse's
 * structured hiring guide): one kit per round of the loop, three to five competencies that don't
 * overlap, mostly behavioral questions with follow-up probes, and "good looks like" anchors that
 * describe observable behavior. Interviewers score each competency on their own, straight after
 * the interview, before any debrief.
 */

/** A saved kit written back out as the editor's document, so it can be edited as one page. */
export function kitToMarkdown(kit: InterviewKit) {
  const scorecard = [
    SCORECARD_HEADER,
    ...[...kit.criteria]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => scorecardRow(item.name, item.question, item.description, item.weight)),
  ].join('\n');
  return `# ${kit.name}

## Interviewer instructions

${kit.instructions}

## Candidate booking message

${kit.candidateMessage ?? ''}

## Interviewer assignment message

${kit.interviewerMessage ?? ''}

## Scorecard

${scorecard}`;
}

const fairness = `Score each competency 1–5 against the "Good looks like" notes, then give an overall recommendation. Write down what the candidate said, not how you felt about it. Submit your scorecard before you talk to anyone else on the panel.`;

const messages = (instructions: string, booking: string) => `## Interviewer instructions

${instructions}

${fairness}

## Candidate booking message

${booking}

## Interviewer assignment message

You are interviewing for this round. Read the kit before you join, stick to the questions in it, and submit your scorecard within 24 hours.`;

const competency = (name: string, question: string, followUp: string, good: string, weight = 3) =>
  scorecardRow(name, `${question} Follow-up: ${followUp}`, good, weight);

const kit = (title: string, instructions: string, booking: string, items: string[]) =>
  `# ${title}

${messages(instructions, booking)}

## Scorecard

${SCORECARD_HEADER}
${items.join('\n')}`;

/** Blocks offered on / in the kit editor: a bare competency table, without the heading. */
export const kitBlocks: EditorTemplate[] = [
  {
    label: 'Competency table',
    hint: 'Competency, question, what good looks like, weight',
    markdown: `${SCORECARD_HEADER}\n${scorecardRow('', '', '', 3)}`,
  },
];

export const kitTemplates: EditorTemplate[] = [
  {
    label: 'Recruiter screen',
    hint: '30 min · motivation, must-haves, logistics',
    markdown: kit(
      'Recruiter screen',
      'Suggested length: 30 minutes. Confirm the must-haves and the candidate’s interest before the team spends time on them. Leave five minutes for their questions and explain the next steps.',
      'Thanks for applying. Please pick a time for a 30-minute introductory call about the role and your background.',
      [
        competency(
          'Motivation for the role',
          'What made you apply for this role, and what are you looking for in your next one?',
          'What would make you turn this role down?',
          'Gives specific reasons tied to this role and team, not a generic wish for a new job.',
          3,
        ),
        competency(
          'Relevant experience',
          'Walk me through the part of your experience that is closest to this role.',
          'What was your part, as opposed to the team’s?',
          'Clearly describes their own scope and results; it matches the must-haves in the job description.',
          4,
        ),
        competency(
          'Must-haves and logistics',
          'Confirm work authorization, location or working pattern, notice period and salary expectations.',
          'Is anything here likely to change?',
          'Every must-have is met, or a gap is stated openly with a realistic plan.',
          3,
        ),
        competency(
          'Communication',
          'Rate across the whole call: how clearly and concisely does the candidate explain things?',
          'Did they answer the question that was asked?',
          'Structured, direct answers; adjusts detail when asked to.',
          2,
        ),
      ],
    ),
  },
  {
    label: 'Hiring manager interview',
    hint: '45 min · impact, ownership, how they work',
    markdown: kit(
      'Hiring manager interview',
      'Suggested length: 45 minutes. Go deep on one or two pieces of recent work. Ask for specific situations and push for what the candidate did, what happened and what they would change.',
      'Please pick a time for a 45-minute conversation with the hiring manager about your recent work and the role.',
      [
        competency(
          'Impact',
          'Tell me about the piece of work in the last two years you are proudest of.',
          'How did you measure whether it worked?',
          'Names a concrete outcome with evidence, and explains their own contribution to it.',
          4,
        ),
        competency(
          'Ownership',
          'Tell me about something you were responsible for that did not go to plan.',
          'What did you change afterwards?',
          'Takes responsibility without blaming others, and describes a specific change in how they work.',
          4,
        ),
        competency(
          'Prioritization',
          'Tell me about a time you had more to do than time to do it. How did you decide?',
          'What did you say no to, and how did you tell people?',
          'Uses clear criteria such as impact, urgency or cost, and communicates trade-offs early.',
          3,
        ),
        competency(
          'Working with a manager',
          'How do you like to get feedback, and tell me about feedback that changed how you work.',
          'What would your last manager say you should work on?',
          'Gives a real example of feedback, acted on it, and is self-aware about growth areas.',
          2,
        ),
      ],
    ),
  },
  {
    label: 'Technical / skills interview',
    hint: '60 min · role knowledge, problem solving, quality',
    markdown: kit(
      'Technical / skills interview',
      'Suggested length: 60 minutes. Work through one realistic problem from this role rather than trivia or brainteasers. Let the candidate ask clarifying questions; how they reason matters as much as the answer.',
      'Please pick a time for a 60-minute skills interview. We will work through a realistic problem together; no preparation is needed.',
      [
        competency(
          'Role-related knowledge',
          'Explain how you would approach a core task in this role, from start to finish.',
          'What would you do differently with half the time?',
          'Accurate, current knowledge of the tools and methods the role uses, with sensible defaults.',
          4,
        ),
        competency(
          'Problem solving',
          'Present the problem. Ask the candidate to talk through how they would solve it.',
          'What are the alternatives, and why did you pick this one?',
          'Clarifies the problem first, breaks it down, weighs options and checks their answer.',
          5,
        ),
        competency(
          'Quality and judgement',
          'How would you know your solution is good enough to ship?',
          'What could go wrong, and how would you catch it?',
          'Thinks about edge cases, testing and risks without being prompted; knows when to stop.',
          3,
        ),
        competency(
          'Explaining their thinking',
          'Rate across the session: could you follow their reasoning as they worked?',
          'Ask them to explain one decision to a non-expert.',
          'Thinks out loud in a structured way and adjusts the explanation to the listener.',
          2,
        ),
      ],
    ),
  },
  {
    label: 'Behavioral interview',
    hint: '45 min · collaboration, ambiguity, leadership',
    markdown: kit(
      'Behavioral interview',
      'Suggested length: 45 minutes. Ask for real past situations, not hypotheticals. Use the STAR prompts (situation, task, action, result) to get specifics, and spend most of the time on what the candidate did.',
      'Please pick a time for a 45-minute conversation about how you have worked with others in past roles.',
      [
        competency(
          'Collaboration',
          'Tell me about a time you disagreed with a colleague about how to do something.',
          'How did it end, and how is your relationship with them now?',
          'Listens to the other view, argues with evidence, and reaches an outcome both can commit to.',
          4,
        ),
        competency(
          'Dealing with ambiguity',
          'Tell me about a time you had to make progress with unclear goals or missing information.',
          'What did you do first?',
          'Makes reasonable assumptions, states them, moves forward and adjusts as they learn.',
          3,
        ),
        competency(
          'Leadership without authority',
          'Tell me about a time you noticed a problem nobody owned and did something about it.',
          'How did you get others on board?',
          'Steps in when needed, brings others along, and hands back once the problem is solved.',
          3,
        ),
        competency(
          'Learning from mistakes',
          'Tell me about a mistake you made at work. What happened next?',
          'How do you make sure it does not happen again?',
          'Owns the mistake plainly, fixed the impact, and changed a habit or process.',
          3,
        ),
      ],
    ),
  },
  {
    label: 'Work sample review',
    hint: '60 min · take-home or portfolio walkthrough',
    markdown: kit(
      'Work sample review',
      'Suggested length: 60 minutes. The candidate presents a take-home task or past work for about 20 minutes, then you ask questions. Judge the work against the brief they were given, not against how you would have done it.',
      'Please pick a time for a 60-minute session where you walk us through your work sample. Plan on about 20 minutes of presenting.',
      [
        competency(
          'Quality of the work',
          'Review the work against the brief before the session. Ask them to show the part they are proudest of.',
          'What would you improve with another day?',
          'Meets the brief, is accurate and well finished, and the candidate can point at real decisions.',
          5,
        ),
        competency(
          'Approach and decisions',
          'Walk me through how you approached this and the key decisions you made.',
          'What did you consider and reject?',
          'Explains a deliberate process and the trade-offs behind each important choice.',
          4,
        ),
        competency(
          'Handling feedback',
          'Give one piece of honest feedback on the work and see how they respond.',
          'How would you change it based on that?',
          'Engages with the feedback, asks questions, and either adapts or explains their view calmly.',
          3,
        ),
      ],
    ),
  },
  {
    label: 'Values interview',
    hint: '45 min · how they work, what they add to the team',
    markdown: kit(
      'Values interview',
      'Suggested length: 45 minutes. Assess the behaviors behind your company values, not whether the candidate is like the team. Replace the competencies below with your own values, each written as an observable behavior.',
      'Please pick a time for a 45-minute conversation about how you like to work and what matters to you.',
      [
        competency(
          'Integrity',
          'Tell me about a time doing the right thing was not the easy option.',
          'What did it cost you?',
          'Acted on principle with a real cost, and was open with the people affected.',
          3,
        ),
        competency(
          'Customer focus',
          'Tell me about a time you changed your plans because of what a customer or user needed.',
          'How did you find out what they needed?',
          'Seeks out the real need, not just the request, and measures the result for the customer.',
          3,
        ),
        competency(
          'Culture add',
          'What is something you would bring to this team that it does not have today?',
          'Give me an example of when that made a difference.',
          'Names a specific skill or perspective, backed by an example, that strengthens the team.',
          2,
        ),
      ],
    ),
  },
  {
    label: 'Scorecard table',
    hint: 'Competencies to score; Tab in the last cell adds one',
    markdown: `## Scorecard\n\n${SCORECARD_HEADER}\n${scorecardRow('New competency', 'Tell me about a time when…', 'What a strong answer shows', 3)}`,
  },
  {
    label: 'Messages',
    hint: 'Interviewer instructions and both emails',
    markdown: messages(
      'Suggested length: 45 minutes. What this round is for and what to listen for.',
      'Please choose an interview time from the available options.',
    ),
  },
];
