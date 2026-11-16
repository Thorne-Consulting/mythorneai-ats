// Two starting points for a new workspace. They open in the builder as drafts to change.
import type { AssessmentForm } from './api';
import { emptyContent, newQuestion, type Question } from './scoring';

const q = (type: Question['type'], patch: Partial<Question>): Question => ({
  ...newQuestion(type),
  ...patch,
});
const choices = (...items: [string, boolean][]) =>
  items.map(([text, correct]) => ({ ...newQuestion('single').options[0], text, correct }));

export const starterTemplates: {
  key: string;
  title: string;
  summary: string;
  form: () => AssessmentForm;
}[] = [
  {
    key: 'support',
    title: 'Customer support writing',
    summary: '3 questions · 30 minutes · written replies scored by a person',
    form: () => ({
      name: 'Customer support writing',
      department: 'Support',
      kind: 'Native',
      expiryDays: 5,
      remindAfterDays: 2,
      blindReview: true,
      providerName: null,
      externalUrl: null,
      content: {
        ...emptyContent(),
        minutes: 30,
        passMark: 70,
        sections: [
          {
            id: crypto.randomUUID().replaceAll('-', ''),
            title: 'Replies',
            questions: [
              q('single', {
                prompt: 'A customer writes in angry about a late order. What do you do first?',
                options: choices(
                  ['Explain the shipping policy', false],
                  ['Say sorry and look up the order', true],
                  ['Offer a refund straight away', false],
                ),
              }),
              q('long', {
                prompt:
                  'Write a reply to this message:\n\n> I was charged twice for my plan this month. Fix it today or I am leaving.',
                points: 10,
                rubric:
                  'Says sorry once, confirms what happened, says exactly what will happen and when, and keeps a calm, friendly tone. No blame and no jargon.',
              }),
              q('long', {
                prompt:
                  'A customer asks for a feature we do not have. Write a reply that is honest and still helpful.',
                points: 10,
                rubric:
                  'Clear "not today", a workaround if one exists, and a way to share the idea with the team.',
              }),
            ],
          },
        ],
      },
    }),
  },
  {
    key: 'frontend',
    title: 'Frontend take-home',
    summary: '3 questions · no time limit · code and a file, scored by a person',
    form: () => ({
      name: 'Frontend take-home',
      department: 'Engineering',
      kind: 'Native',
      expiryDays: 7,
      remindAfterDays: 3,
      blindReview: false,
      providerName: null,
      externalUrl: null,
      content: {
        ...emptyContent(),
        timed: false,
        minutes: 0,
        passMark: 60,
        instructions:
          'Take the time you need. We care about clear, readable code more than clever code. Tell us about anything you would do with more time.',
        sections: [
          {
            id: crypto.randomUUID().replaceAll('-', ''),
            title: 'Code',
            questions: [
              q('code', {
                prompt:
                  'Write a function that returns the first character in a string that does not repeat, or `null` if there is none.',
                language: 'TypeScript',
                starterCode:
                  'export function firstUnique(s: string): string | null {\n  // your code here\n}\n',
                rubric:
                  'Correct on an empty string and when every character repeats. One pass with a map earns full marks; nested loops earn half.',
              }),
              q('file', {
                prompt:
                  'Build a small page that lists our open jobs from a JSON file and lets people filter by department. Upload your project as a ZIP file.',
                accept: '.zip,.pdf',
                points: 20,
                rubric:
                  'Works, is easy to read, is accessible by keyboard, and has a short README.',
              }),
              q('short', {
                prompt: 'What would you improve with another day?',
                points: 2,
                rubric: 'Any sensible next step, for example tests or loading states.',
              }),
            ],
          },
        ],
      },
    }),
  },
];
