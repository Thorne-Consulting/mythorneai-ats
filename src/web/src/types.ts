export type Role = 'Admin' | 'Recruiter' | 'HiringManager' | 'Interviewer';

export interface User {
  id: string;
  email: string;
  displayName: string;
  /** The built-in role theirs behaves like. For personal defaults only; check access with `useAbility()`. */
  role: Role;
  /** Their role's name, built-in ("Hiring manager") or one an admin made. */
  roleName: string;
  /** Their teams (job departments). Empty: no limit for recruiters, own jobs only for hiring managers. */
  departments: string[];
  /** Colour of their initials avatar; null picks one from the name. */
  avatarTone?: 'blue' | 'violet' | 'green' | 'amber' | 'red' | 'gray' | null;
  /** IANA zone; null means the organization's. */
  timeZone?: string | null;
  organizationName?: string;
  /** The employer's square icon (Settings → Careers site), shown beside the workspace name. */
  workspaceIconUrl?: string | null;
  organizationTimeZone?: string | null;
  organizationSetupCompleted: boolean;
  isOrganizationOwner: boolean;
  /** What this person may do, as CASL rules. Read them with `useAbility()` from `@/lib/ability`. */
  rules: import('@/lib/ability/rules').AbilityRule[];
  /** Their own settings, saved with the account (see `features/admin/preferences`). */
  preferences: UserPreferences;
  /** The server has an AI key and the organization has AI turned on. AI controls hide otherwise. */
  aiEnabled?: boolean;
  /** Where "Contact support" writes to, and the "What's new" page. Hidden when not set. */
  supportEmail?: string | null;
  changelogUrl?: string | null;
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system' | null;
  density?: 'comfortable' | 'compact' | null;
  startPage?: string | null;
  /** auto (this browser's language), month (Nov 13, 2026), day (13 Nov 2026) or iso (2026-11-13). */
  dateFormat?: 'auto' | 'month' | 'day' | 'iso' | null;
  /** True from the first sign-in until the welcome is closed. */
  welcome?: boolean | null;
}

export interface DashboardData {
  openRequisitions: number;
  activeCandidates: number;
  interviewsThisWeek: number;
  /** Days the trend numbers cover (7, 30 or 90), and the same numbers for the period before. */
  period?: number;
  hires?: number;
  hiresBefore?: number;
  applied?: number;
  appliedBefore?: number;
  /** Active people on open jobs by stage type; `reached`: of those who applied in the period, how many got this far. */
  pipeline: Array<{ stage: string; count: number; order: number; type?: string; reached?: number }>;
  unreadMessages: Array<{
    applicationId: string;
    candidateName: string;
    requisitionTitle: string;
    preview: string;
    at: string;
  }>;
  stalled: Array<{
    applicationId: string;
    candidateName: string;
    requisitionTitle: string;
    stage: string;
    stageType?: string;
    lastActivityAt: string;
  }>;
  stalledTotal: number;
  jobs: Array<{
    id: string;
    code: string;
    title: string;
    status: string;
    openings: number;
    hired: number;
    newToday: number;
    stages: Array<{ name: string; count: number; type?: string; color?: string | null }>;
  }>;
  scorecardsDue: Array<{
    id: string;
    applicationId: string;
    title: string;
    endsAt: string;
    candidateName: string;
    requisitionTitle: string;
  }>;
  recentApplications: Array<{
    id: string;
    candidateName: string;
    candidateTitle?: string;
    requisitionTitle: string;
    stage: string;
    stageType?: string;
    lastActivityAt: string;
  }>;
  upcomingInterviews: Array<{
    id: string;
    applicationId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    candidateName: string;
    requisitionTitle: string;
  }>;
}

export interface RequisitionSummary {
  id: string;
  code: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  workMode: string;
  openings: number;
  status: string;
  ownerEmail: string;
  recruiterEmail: string;
  /** From the hiring team's user records (list endpoint only). */
  hiringManager?: { userId: string; displayName: string; email: string } | null;
  recruiter?: { userId: string; displayName: string; email: string } | null;
  targetStartDate?: string;
  activeApplications: number;
  updatedAt: string;
}

export interface Stage {
  id: string;
  name: string;
  sortOrder: number;
  /** A tone that overrides the type's colour; usually null. Use `stageTone(type, color)`. */
  color?: string | null;
  isTerminal: boolean;
  count?: number;
  /** Applied, Screen, Interview, Offer, Hired or Other. Colour and automation read this, not the name. */
  type?: string;
  /** What candidates see for this stage. */
  candidateLabel?: string;
  /** Off, Ask or Always: whether moving someone here emails them. */
  emailOnEntry?: 'Off' | 'Ask' | 'Always';
  targetDays?: number | null;
  /** The assessment this stage uses; its score shows on the cards here. */
  assessmentId?: string | null;
}

/** Someone on a job's hiring team. */
export interface RequisitionMember {
  userId: string;
  displayName: string;
  email: string;
  /** HiringManager, Recruiter, Interviewer or Viewer. */
  role: 'HiringManager' | 'Recruiter' | 'Interviewer' | 'Viewer';
  /** Their account role (Admin, Recruiter, HiringManager, Interviewer). */
  userRole: string;
  isActive: boolean;
}

export interface RequisitionDetail extends RequisitionSummary {
  description: string;
  createdAt: string;
  stages: Stage[];
  members?: RequisitionMember[];
  interviewKits: InterviewKit[];
  requirementsJson?: string;
  isConfidential?: boolean;
  viewerEmails?: string[];
  allowCandidateReschedule?: boolean;
  allowCandidateWithdraw?: boolean;
}

export interface InterviewCriterion {
  id: string;
  name: string;
  question: string;
  description: string;
  weight: number;
  sortOrder: number;
}

export interface InterviewKit {
  id: string;
  name: string;
  instructions: string;
  durationMinutes: number;
  sortOrder?: number;
  criteria: InterviewCriterion[];
}

export interface CandidateDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  linkedInUrl?: string;
  gitHubUrl?: string;
  portfolioUrl?: string;
  otherUrls?: string[];
  source: string;
  /** The teammate who referred them, on referral sources. */
  referrer?: { id: string; name: string } | null;
  tags: string[];
  doNotContact: boolean;
  doNotContactReason?: string | null;
  emailBounced?: boolean;
  customFieldsJson?: string | null;
  createdAt: string;
  updatedAt: string;
  resumeSummary?: string;
  resumeSkills: string[];
  resumeJobTitles: string[];
  resumeEducation: string[];
  resumeCertifications: string[];
  resumeLanguages: string[];
  resumeYearsExperience?: number;
  resumeParsedAt?: string;
  applications: Array<{
    id: string;
    requisitionId: string;
    requisitionCode: string;
    requisitionTitle: string;
    stageId?: string;
    stage: string;
    /** The stage's type and colour, for StageBadge. */
    stageType?: string | null;
    stageColor?: string | null;
    status: string;
    appliedAt: string;
    lastActivityAt: string;
  }>;
  /** The next scheduled interview on any application you can see. */
  nextInterview?: {
    id: string;
    applicationId: string;
    title: string;
    startsAt: string;
    requisitionTitle: string;
  } | null;
  /** The file the profile was read from. */
  resumeAttachmentId?: string | null;
  /** Jobs this person was hidden from when ranking, with why. */
  dismissals?: Array<{
    requisitionId: string;
    reason: string;
    dismissedBy: string;
    createdAt: string;
  }>;
  attachments: Array<{
    id: string;
    originalFileName: string;
    contentType: string;
    length: number;
    /** Resume, CoverLetter, Portfolio or Other. Only resumes are read. */
    kind?: string;
    scanStatus: string;
    parseStatus: string;
    parseError?: string;
    parsedAt?: string;
    uploadedAt: string;
  }>;
}

/** The form the model fills in from a resume (server: ResumeForm). */
export interface ResumeForm {
  basics: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    summary?: string | null;
    links: Array<{ kind: string; url: string }>;
  };
  work: Array<{ company: string; title: string }>;
  education: Array<{ school: string; degree?: string | null }>;
  skills: Array<{ name: string; category: string }>;
}

export interface ResumeParsePreview {
  form: ResumeForm;
  model: string;
  textLength: number;
}

/** GET /api/candidates/{id}/resume: the parsed profile, read-only. */
export interface ResumeProfile {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  location?: string | null;
  willingToRelocate?: boolean | null;
  openToRemote?: boolean | null;
  linkedInUrl?: string | null;
  gitHubUrl?: string | null;
  portfolioUrl?: string | null;
  otherUrls: string[];
  summary?: string | null;
  currentTitle?: string | null;
  currentEmployer?: string | null;
  seniority: string;
  yearsExperience?: number | null;
  yearsManagement?: number | null;
  highestDegreeLevel: string;
  work: Array<{
    id: string;
    company: string;
    title: string;
    seniority: string;
    employmentType: string;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    isRemote: boolean;
    startYear?: number | null;
    startMonth?: number | null;
    endYear?: number | null;
    endMonth?: number | null;
    isCurrent: boolean;
    durationMonths?: number | null;
    managedPeople?: number | null;
    bullets: string[];
    skills: string[];
    verified: boolean;
  }>;
  education: Array<{
    id: string;
    school: string;
    degree?: string | null;
    degreeLevel: string;
    field?: string | null;
    fieldNormalized: string;
    startYear?: number | null;
    endYear?: number | null;
    isInProgress: boolean;
    gpa?: number | null;
    gpaScale?: number | null;
    honors?: string | null;
    verified: boolean;
  }>;
  skills: Array<{
    name: string;
    category: string;
    source: string;
    yearsUsed?: number | null;
    lastUsedYear?: number | null;
    verified: boolean;
  }>;
  certifications: Array<{
    id: string;
    name: string;
    issuer?: string | null;
    year?: number | null;
    expiresYear?: number | null;
    url?: string | null;
    verified: boolean;
  }>;
  languages: Array<{ language: string; proficiency: string }>;
  projects: Array<{
    id: string;
    name: string;
    description: string;
    url?: string | null;
    year?: number | null;
    skills: string[];
  }>;
  publications: Array<{
    id: string;
    title: string;
    venue?: string | null;
    year?: number | null;
    url?: string | null;
  }>;
  awards: Array<{ id: string; name: string; issuer?: string | null; year?: number | null }>;
  unassignedText: string[];
  resumeText?: string | null;
  parsedAt?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  attachment?: {
    id: string;
    originalFileName: string;
    contentType: string;
    parseStatus: string;
    parseError?: string | null;
    parsedAt?: string | null;
  } | null;
}

export interface BoardData {
  id: string;
  code: string;
  title: string;
  stages: Array<
    Stage & {
      /** The name of the stage's assessment, when it has one. */
      assessmentName?: string | null;
      applications: Array<{
        id: string;
        candidateId: string;
        candidateName: string;
        currentTitle?: string;
        location?: string;
        source: string;
        rating?: number;
        lastActivityAt: string;
        appliedAt: string;
        /** The last move into this stage, for "days in stage". */
        enteredStageAt?: string;
        /** Scorecards still missing from interviews that have happened. */
        feedbackOwed?: number;
        /** An application answer was one the job flags for review. */
        flagged?: boolean;
        /** The latest submitted assessment: percent once scored, and the decision once made. */
        assessment?: {
          id: string;
          name: string;
          percent: number | null;
          decision: 'Passed' | 'Failed' | null;
          pendingCount: number;
        } | null;
        doNotContact?: boolean;
        firstName?: string;
        email?: string;
        yearsExperience?: number;
        skills: string[];
        tags?: string[];
        /** The AI fit check of this job (0 to 100), once it was run. */
        fitScore?: number | null;
        nextInterviewAt?: string;
      }>;
    }
  >;
}

export interface ApplicationDetailResponse {
  application: {
    id: string;
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone?: string;
    candidateLocation?: string;
    candidateTitle?: string;
    candidateTags: string[];
    requisitionId: string;
    requisitionCode: string;
    requisitionTitle: string;
    stageId: string;
    stage: string;
    status: string;
    source: string;
    dispositionReason?: string;
    /** Why, when the reason asked for a note. */
    dispositionNote?: string | null;
    rating?: number;
    appliedAt: string;
    lastActivityAt: string;
    stages: Stage[];
    interviewKits: InterviewKit[];
    notes: Array<{
      id: string;
      body: string;
      authorEmail: string;
      isPrivate: boolean;
      createdAt: string;
    }>;
    interviews: Array<{
      id: string;
      title: string;
      interviewKitId?: string;
      interviewKitName?: string;
      interviewKitInstructions?: string;
      criteria: InterviewCriterion[];
      startsAt: string;
      endsAt: string;
      timeZone: string;
      meetingLink?: string;
      interviewerEmails: string[];
      calendarStatus: string;
      calendarProvider?: string;
      status: string;
      meetingNotes?: string;
      meetingNotesSource?: string;
      meetingNotesUpdatedAt?: string;
      submittedScorecards: number;
      scorecardsVisible: boolean;
      scorecards: Array<{
        id: string;
        interviewerEmail: string;
        recommendation: string;
        rating: number;
        evidence: string;
        strengths: string;
        concerns: string;
        submittedAt: string;
        criteria: Array<{
          criterionId: string;
          criterionName: string;
          rating: number;
          evidence: string;
        }>;
      }>;
      recordings: Array<{
        id: string;
        originalFileName: string;
        contentType: string;
        length: number;
        uploadedBy: string;
        consentConfirmed: boolean;
        transcript?: string | null;
        recordedAt: string;
      }>;
    }>;
  };
  audit: Array<{
    id: number;
    entityType: string;
    entityId: string;
    action: string;
    actorEmail: string;
    details?: string;
    occurredAt: string;
  }>;
}

export interface AdminUser extends User {
  isActive: boolean;
  updatedAt: string;
}

/** GET /api/candidates: one row per person, with the applications you can see on each. */
export interface CandidateListPage {
  items: CandidateListItem[];
  total: number;
  page: number;
  pageSize: number;
  staleDays: number;
}

export interface CandidateListItem {
  id: string;
  name: string;
  email: string;
  location?: string;
  currentTitle?: string;
  source: string;
  /** Skills read from the resume. */
  skills: string[];
  /** Labels recruiters added. */
  tags?: string[];
  experienceYears?: number | null;
  hasParsedResume: boolean;
  doNotContact: boolean;
  createdAt?: string;
  updatedAt: string;
  /** A line of the resume with the searched words between ⟦ and ⟧, when the match came from it. */
  snippet?: string | null;
  matchedTerms: string[];
  applications: CandidateListApplication[];
}

export interface CandidateListApplication {
  id: string;
  requisitionId: string;
  requisitionCode: string;
  requisitionTitle: string;
  stageId: string;
  stage: string;
  /** The stage's type and colour, for StageBadge. */
  stageType?: string | null;
  stageColor?: string | null;
  status: string;
  rating?: number | null;
  appliedAt: string;
  lastActivityAt: string;
  unreadMessages: number;
  stalled: boolean;
  fitScore?: number | null;
}
