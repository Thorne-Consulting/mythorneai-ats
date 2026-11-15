import type { ApplicationDetailResponse } from '@/types';

export type ModalProps = { opened: boolean; onClose: () => void; onSaved: () => void };

type Base = ApplicationDetailResponse['application'];
type BaseInterview = Base['interviews'][number];
export type Scorecard = BaseInterview['scorecards'][number] & {
  submittedBy?: string | null;
};
export type Interview = Omit<BaseInterview, 'scorecards'> & {
  scorecards: Scorecard[];
};
export type Addendum = { id: string; body: string; authorEmail: string; createdAt: string };

export interface HiringDecision {
  id: string;
  decision: 'Advance' | 'Offer' | 'Reject';
  toStageId?: string | null;
  rationale: string;
  decidedBy: string;
  decidedAt: string;
}

/** What GET /api/applications/{id} returns beyond the shared type. */
export type Note = Base['notes'][number] & {
  editedAt?: string | null;
  /** Pinned notes come first on the Overview. */
  pinnedAt?: string | null;
  /** Null for a note about the person rather than this application. */
  applicationId?: string | null;
};

export type ApplicationDetail = Omit<Base, 'interviews' | 'notes'> & {
  interviews: Interview[];
  notes: Note[];
  candidateDoNotContact: boolean;
  stageEnteredAt: string;
  resume: {
    summary?: string | null;
    yearsExperience?: number | null;
    skills: string[];
    hasResume: boolean;
    experience: Array<{
      title: string;
      company: string;
      startYear?: number | null;
      endYear?: number | null;
      isCurrent: boolean;
    }>;
  };
  decisions: HiringDecision[];
};

export type ApplicationData = Omit<ApplicationDetailResponse, 'application'> & {
  application: ApplicationDetail;
  /** Flagged: one of the question's knockout answers, for a person to review. */
  answers: Array<{ question: string; answer: string; flagged?: boolean }>;
  /** The signed-in person can change this application (owner, recruiter or admin). */
  canManage: boolean;
  /** They owe a scorecard here, so they see nobody else's. */
  blinded: boolean;
  blindedBy: string[];
  /** Dated corrections, by scorecard id. */
  addenda?: Record<string, Addendum[]>;
  /** When each interview was created, by interview id. */
  interviewsCreatedAt?: Record<string, string>;
  /** Display names by email, for everyone the record mentions. */
  people: Record<string, string>;
  emails?: Array<{
    id: string;
    recipient: string;
    subject: string;
    status: string;
    deliveryStatus?: string | null;
    templateKey?: string | null;
    createdAt: string;
    /** In the future for an email sent later. */
    nextAttemptAt?: string;
  }>;
  messages?: Array<{
    id: string;
    fromCandidate: boolean;
    body: string;
    authorEmail?: string | null;
    createdAt: string;
    readAt?: string | null;
  }>;
};

/** A person's name when we know it, else the part of their email before the @. */
export const nameFor = (people: Record<string, string>, email: string) =>
  people[email] ?? email.split('@')[0];

/** Job-related reasons only; the same list for one applicant or many. */
export const DISPOSITION_REASONS = [
  'Does not meet minimum requirements',
  'Skills mismatch',
  'Experience mismatch',
  'Compensation mismatch',
  'Location or availability',
  'Withdrew',
  'Position closed',
  'Other',
];

/** "Withdrew" is the candidate's choice, not ours: it closes the application as Withdrawn. */
export const statusForReason = (reason: string) =>
  reason === 'Withdrew' ? 'Withdrawn' : 'Rejected';
