/** The interviewer's prep page. There is no GET by interview id, so it carries its application. */
export const prepHref = (item: { id: string; applicationId: string }) =>
  `/interviews/${item.id}?application=${item.applicationId}`;

export type CalendarInterview = {
  id: string;
  applicationId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  candidateName: string;
  requisitionTitle: string;
  interviewerEmails: string[];
};

export type InterviewView = 'day' | 'week' | 'month' | 'agenda';
export const INTERVIEW_VIEWS: InterviewView[] = ['day', 'week', 'month', 'agenda'];
