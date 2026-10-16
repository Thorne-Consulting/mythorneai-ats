import type { ApplicationDetailResponse } from '@/types';
import { useApplication } from './application-data';

// The detail endpoint also returns emails and the candidate thread; types.ts does not know them yet.
export interface ApplicationEmail {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  deliveryStatus?: string | null;
  templateKey?: string | null;
  createdAt: string;
}
export interface ApplicationMessage {
  id: string;
  fromCandidate: boolean;
  body: string;
  authorEmail?: string | null;
  createdAt: string;
  readAt?: string | null;
}
type Extras = { emails?: ApplicationEmail[]; messages?: ApplicationMessage[] };

export function useApplicationExtras(id: string) {
  const query = useApplication(id);
  const data = query.data as (ApplicationDetailResponse & Extras) | undefined;
  return { query, emails: data?.emails ?? [], messages: data?.messages ?? [] };
}
