import { useApplication } from './application-data';
import type { ApplicationData } from './application-types';

export type ApplicationEmail = NonNullable<ApplicationData['emails']>[number];
export type ApplicationMessage = NonNullable<ApplicationData['messages']>[number];

/** The emails and candidate messages the detail endpoint returns alongside the application. */
export function useApplicationExtras(id: string) {
  const query = useApplication(id);
  return { query, emails: query.data?.emails ?? [], messages: query.data?.messages ?? [] };
}
