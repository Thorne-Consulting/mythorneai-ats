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
}

export interface DashboardData {
  openRequisitions: number;
  activeCandidates: number;
  interviewsThisWeek: number;
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

export interface CandidateSummary {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  source: string;
  tags: string[];
  doNotContact: boolean;
  activeApplications: number;
  updatedAt: string;
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

export interface ResumeParsePreview {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  linkedInUrl?: string;
  summary: string;
  skills: string[];
  jobTitles: string[];
  education: string[];
  certifications: string[];
  languages: string[];
  yearsExperience?: number;
  confidence: number;
  warnings: string[];
}

export interface TalentSearchPage {
  items: Array<{
    candidateId: string;
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
    activeApplications: number;
    matchScore?: number;
    matchedTerms: string[];
  }>;
  total: number;
  page: number;
  pageSize: number;
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
      }>;
    }
  >;
}

export interface ApplicantPage {
  items: Array<{
    id: string;
    candidateId: string;
    candidateName: string;
    email: string;
    location?: string;
    currentTitle?: string;
    tags: string[];
    hasResume: boolean;
    resumeCount: number;
    requisitionId: string;
    requisitionCode: string;
    requisitionTitle: string;
    team: string;
    stageId: string;
    stage: string;
    status: string;
    source: string;
    rating?: number;
    appliedAt: string;
    lastActivityAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
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
