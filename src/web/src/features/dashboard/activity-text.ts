// What the activity feed says. Pure, so activity-text.check.mjs can run it.

export type Activity = {
  at: string;
  actorName: string | null;
  mine: boolean;
  verb: 'applied' | 'added' | 'moved' | 'rejected' | 'withdrew' | 'hired' | 'reopened' | 'scored';
  applicationId: string;
  candidateName: string;
  requisitionId: string;
  jobTitle: string;
  detail: string | null;
  stageType: string | null;
};

/** "Priya moved Casey Lee to Review": who did what to whom. */
export function activityText(item: Activity) {
  const who = item.mine ? 'You' : item.actorName;
  const name = item.candidateName;
  // Moves with no person behind them (a booking, an automatic step) read without a "who".
  switch (item.verb) {
    case 'applied':
      return `${name} applied`;
    case 'added':
      return who ? `${who} added ${name}` : `${name} was added`;
    case 'moved':
      return who
        ? `${who} moved ${name} to ${item.detail ?? 'another stage'}`
        : `${name} moved to ${item.detail ?? 'another stage'}`;
    case 'rejected':
      return who ? `${who} rejected ${name}` : `${name} was rejected`;
    case 'withdrew':
      return `${name} withdrew`;
    case 'hired':
      return `${name} was hired`;
    case 'reopened':
      return who ? `${who} reopened ${name}` : `${name} was reopened`;
    case 'scored':
      return `${who ?? 'An interviewer'} sent feedback on ${name}${item.detail ? ` (${item.detail})` : ''}`;
  }
}
