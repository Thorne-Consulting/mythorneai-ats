// Plain words for activity history rows. Kept free of React so the check file can run it.

/** Record types in the words the interface uses ("Job", never "Requisition"). */
export const TYPE_LABELS: Record<string, string> = {
  Requisition: 'Job',
  Candidate: 'Candidate',
  Application: 'Application',
  Interview: 'Interview',
  User: 'Member',
  Organization: 'Workspace',
  Webhook: 'Webhook',
  PipelineTemplate: 'Pipeline',
  PostingTemplate: 'Posting template',
  EmailTemplate: 'Email template',
  AccessRequest: 'Access request',
  SignIn: 'Sign-in',
  Integration: 'Calendar',
};

export const typeLabel = (type: string) => TYPE_LABELS[type] ?? spaced(type);

/**
 * What the person did, as the words between their name and the record: "Avery moved Blake".
 * `record: false` means the sentence stands without a record ("Avery signed in").
 */
const VERBS: Record<string, { verb: string; record?: false }> = {
  Created: { verb: 'created' },
  Updated: { verb: 'updated' },
  Deleted: { verb: 'deleted' },
  StageChanged: { verb: 'moved' },
  BulkStageChanged: { verb: 'moved' },
  SignedIn: { verb: 'signed in', record: false },
  SignedOut: { verb: 'signed out', record: false },
  SignInDenied: { verb: 'was refused sign-in', record: false },
  Invited: { verb: 'invited' },
  InviteResent: { verb: 'sent the invitation again to' },
  InviteWithdrawn: { verb: 'withdrew the invitation for' },
  AccessRequested: { verb: 'asked to join the workspace', record: false },
  AccessApproved: { verb: 'approved the access request from' },
  AccessDeclined: { verb: 'declined the access request from' },
  RoleChanged: { verb: 'changed the role of' },
  OwnershipTransferred: { verb: 'made the workspace owner' },
  AccessRemoved: { verb: 'removed access for' },
  AccessRestored: { verb: 'gave access back to' },
  RolePermissionsUpdated: { verb: 'changed what roles can do', record: false },
  SecretRevealed: { verb: 'showed the signing secret of' },
  SecretRotated: { verb: 'replaced the signing secret of' },
  TestSent: { verb: 'sent a test message to' },
  DeliveryRetried: { verb: 'sent a message again to' },
  FailedDeliveriesRetried: { verb: 'sent failed messages again to' },
  FailedDeliveryRetried: { verb: 'retried failed calendar updates for' },
  AttachmentUploaded: { verb: 'uploaded a file for' },
  ResumeParseQueued: { verb: 'asked us to read the resume of' },
  CustomFieldsUpdated: { verb: 'changed the custom fields of' },
  BulkImported: { verb: 'imported candidates from a spreadsheet', record: false },
  OfferDrafted: { verb: 'drafted an offer for' },
  AcceptanceSent: { verb: 'sent an acceptance to' },
  OfferWithdrawn: { verb: 'withdrew the offer for' },
  AcceptanceReversed: { verb: 'reversed the acceptance of' },
  SubmittedForApproval: { verb: 'asked for approval of' },
  RecordingTranscribed: { verb: 'got a transcript for' },
  RequirementsConfirmed: { verb: 'confirmed the requirements of' },
  CandidateDismissed: { verb: 'dismissed a suggested candidate on' },
  MessageSent: { verb: 'messaged' },
  NoteAdded: { verb: 'added a note on' },
  InterviewRecordingUploaded: { verb: 'uploaded an interview recording for' },
  InterviewRecordingDeleted: { verb: 'deleted an interview recording for' },
  SettingsUpdated: { verb: 'changed the settings of' },
  ScorecardSubmitted: { verb: 'submitted a scorecard for' },
  InterviewScheduled: { verb: 'scheduled an interview for' },
  InterviewKitCreated: { verb: 'created an interview kit for' },
  OfferSubmitted: { verb: 'asked for approval of the offer for' },
  RequisitionFilled: { verb: 'marked as filled' },
  RequisitionOnHold: { verb: 'put on hold' },
  Seeded: { verb: 'added sample data for' },
};

export function auditVerb(action: string) {
  return VERBS[action] ?? { verb: `${spaced(action).toLowerCase()} on` };
}

/** Why a sign-in was refused, from the server's reason code. */
export const DENIAL_REASONS: Record<string, string> = {
  not_invited: 'not invited',
  domain: 'not a company email address',
  pending: 'waiting for an admin',
  declined: 'request declined',
  deactivated: 'access removed',
  method: 'sign-in method turned off',
  provider: 'sign-in service error',
};

export type FieldChange = { field: string; from: string; to: string };

/** The server's {"Role":{"from":"Recruiter","to":"Admin"}} as rows for a before and after table. */
export function parseChanges(json: string | null | undefined): FieldChange[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json) as Record<string, { from: unknown; to: unknown }>;
    return Object.entries(value).map(([field, change]) => ({
      field: spaced(field),
      from: formatValue(change?.from),
      to: formatValue(change?.to),
    }));
  } catch {
    return [];
  }
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  // Enum words such as "HiringManager" read as "Hiring manager".
  return /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(text) ? spaced(text) : text;
}

/** Details JSON as readable key and value pairs; plain text stays as it is. */
export function parseDetails(
  details: string | null | undefined,
): [string, string][] | string | null {
  if (!details) return null;
  try {
    const value = JSON.parse(details);
    if (value && typeof value === 'object' && !Array.isArray(value))
      return Object.entries(value).map(([key, v]) => [spaced(key), formatValue(v)]);
  } catch {}
  return details;
}

/** "StageChanged" or "allowGoogleLogin" become "Stage changed" and "Allow google login". */
export function spaced(value: string) {
  const words = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
