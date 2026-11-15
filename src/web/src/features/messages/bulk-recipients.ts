// Who a bulk email goes to, as POST /api/messages/bulk and /bulk/preview take it. The preview and
// the send use the same body, so the people previewed are the people emailed. Pure, so
// bulk-recipients.check.mjs runs it with node.

export type BulkRecipients = {
  /** From a job's pipeline: each message lands in that application's conversation. */
  applicationIds?: string[];
  /** Chosen people on the Candidates list. */
  candidateIds?: string[];
  /** "Everyone matching": the Candidates list's query string. */
  filter?: string;
  /** Everyone in a talent pool. */
  poolId?: string;
};

export function bulkRecipients(who: BulkRecipients) {
  return {
    applicationIds: who.applicationIds ?? [],
    candidateIds: who.candidateIds ?? [],
    filter: who.filter ?? null,
    poolId: who.poolId ?? null,
  };
}
