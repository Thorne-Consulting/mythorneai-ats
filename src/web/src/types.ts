export type Role = 'Admin' | 'Recruiter' | 'HiringManager' | 'Interviewer';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  department?: string;
  organizationName?: string;
  organizationSetupCompleted: boolean;
  isOrganizationOwner: boolean;
  // Extra capabilities granted to the user's role: 'reports', 'import', 'templates'.
  permissions: string[];
}

export interface DashboardData {
  openRequisitions: number;
  activeCandidates: number;
  interviewsThisWeek: number;
  pipeline: Array<{ stage: string; count: number; order: number }>;
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
    stages: Array<{ name: string; count: number }>;
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
  targetStartDate?: string;
  activeApplications: number;
  updatedAt: string;
}

export interface Stage {
  id: string;
  name: string;
  sortOrder: number;
  color: string;
  isTerminal: boolean;
  count?: number;
}

export interface RequisitionDetail extends RequisitionSummary {
  description: string;
  createdAt: string;
  stages: Stage[];
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
  candidateMessage?: string;
  interviewerMessage?: string;
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
  source: string;
  tags: string[];
  doNotContact: boolean;
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
    stage: string;
    status: string;
    appliedAt: string;
    lastActivityAt: string;
  }>;
  attachments: Array<{
    id: string;
    originalFileName: string;
    contentType: string;
    length: number;
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
        yearsExperience?: number;
        skills: string[];
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
  skills: string[];
  experienceYears?: number | null;
  hasParsedResume: boolean;
  doNotContact: boolean;
  updatedAt: string;
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
  status: string;
  rating?: number | null;
  appliedAt: string;
  lastActivityAt: string;
  unreadMessages: number;
  stalled: boolean;
  fitScore?: number | null;
}
