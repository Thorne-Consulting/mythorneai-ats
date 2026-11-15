// The candidate side of assessments: GET /public/assessments and /public/assessments/{id}.
import type { QuestionType } from '../scoring';
import type { CandidateQuestion } from './QuestionInput';

export type TakeStatus = 'NotStarted' | 'InProgress' | 'Submitted' | 'Expired' | 'Revoked';

export type TakeView = {
  id: string;
  applicationId: string;
  jobTitle: string;
  company: string | null;
  name: string;
  kind: 'Native' | 'External';
  providerName: string | null;
  status: TakeStatus;
  instructions: string;
  minutes: number;
  timed: boolean;
  questions: number;
  points: number;
  sections: number;
  types: QuestionType[];
  checks: { tabSwitch: boolean; fullscreen: boolean; blockPaste: boolean };
  expiresAt: string;
  startedAt: string | null;
  deadlineAt: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
  serverNow: string;
  graceSeconds: number;
  /** Only while in progress. */
  content: { id: string; title: string; questions: CandidateQuestion[] }[] | null;
  answers:
    | {
        questionId: string;
        choiceIds: string[];
        text: string | null;
        seconds: number;
        file: { id: string; name: string; length: number } | null;
        savedAt: string;
      }[]
    | null;
};

/** One row of the candidate's list (portal Home and the application page). */
export type PortalAssessment = {
  id: string;
  applicationId: string;
  jobTitle: string;
  name: string;
  kind: 'Native' | 'External';
  providerName: string | null;
  status: TakeStatus;
  minutes: number;
  timed: boolean;
  questions: number;
  invitedAt: string;
  expiresAt: string;
  deadlineAt: string | null;
  submittedAt: string | null;
};

export const takeHref = (id: string) => `/candidate-portal/assessments/${id}`;
