export type Role = 'Admin' | 'Recruiter' | 'HiringManager' | 'Interviewer' | 'Hr';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  department?: string;
}

export interface DashboardData {
  openRequisitions: number;
  activeCandidates: number;
  interviewsThisWeek: number;
  offersPending: number;
  myOpenTasks: number;
  myOverdueTasks: number;
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
    uploadedAt: string;
  }>;
}

export interface BoardData {
  id: string;
  code: string;
  title: string;
  stages: Array<Stage & {
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
  }>;
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
    notes: Array<{ id: string; body: string; authorEmail: string; isPrivate: boolean; createdAt: string }>;
    tasks: TaskItem[];
    interviews: Array<{
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      timeZone: string;
      meetingLink?: string;
      interviewerEmails: string[];
      status: string;
      scorecards: Array<{ id: string; interviewerEmail: string; recommendation: string; rating: number; evidence: string; submittedAt: string }>;
    }>;
    offers: Array<{ id: string; baseSalary: number; currency: string; startDate: string; status: string; createdAt: string; updatedAt: string }>;
    communications: Array<{ id: string; recipient: string; subject: string; body: string; senderEmail: string; status: string; createdAt: string }>;
  };
  audit: Array<{ id: number; entityType: string; entityId: string; action: string; actorEmail: string; details?: string; occurredAt: string }>;
}

export interface TaskItem {
  id: string;
  applicationId?: string;
  title: string;
  assigneeEmail: string;
  dueDate?: string;
  isCompleted: boolean;
  completedAt?: string;
  candidateName?: string;
  requisitionTitle?: string;
}

export interface AdminUser extends User {
  isActive: boolean;
  updatedAt: string;
}
