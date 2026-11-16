export type InterviewView = 'day' | 'week' | 'month' | 'agenda';
export const INTERVIEW_VIEWS: InterviewView[] = ['day', 'week', 'month', 'agenda'];

/** The scheduler: for an application (and a round), to reschedule an interview, or from a calendar day. */
export function scheduleHref(
  options: {
    application?: string;
    kit?: string;
    interview?: string;
    date?: string;
  } = {},
) {
  const params = new URLSearchParams(
    Object.entries(options).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const query = params.toString();
  return `/interviews/schedule${query ? `?${query}` : ''}`;
}
