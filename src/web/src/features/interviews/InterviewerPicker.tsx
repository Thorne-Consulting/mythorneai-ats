'use client';

import { TagsInput } from '@/components/ui';
import { usePeople } from './interview-api';

/**
 * Pick interviewers by name from the team. Someone outside the team can still be added by typing
 * their email. Under the field, each person's calendar and this week's load, so a choice is informed.
 */
export function InterviewerPicker({
  value,
  onChange,
  label = 'Interviewers',
  description = 'Type a name. For someone outside the team, type their email and press Enter.',
  error,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
  label?: string;
  description?: string;
  error?: string;
}) {
  const people = usePeople();
  const byEmail = new Map((people.data ?? []).map((person) => [person.email, person]));
  return (
    <div className="space-y-2">
      <TagsInput
        label={label}
        description={description}
        error={error}
        placeholder={people.isLoading ? 'Loading the team…' : 'Search by name'}
        value={value}
        onChange={(emails) => onChange(emails.map((email) => email.trim().toLowerCase()))}
        data={(people.data ?? []).map((person) => ({
          value: person.email,
          label: person.name,
          keywords: `${person.name} ${person.email}`,
        }))}
      />
      {value.length > 0 && people.data && (
        <ul className="space-y-0.5 text-xs text-fg-subtle">
          {value.map((email) => {
            const person = byEmail.get(email);
            if (!person)
              return (
                <li key={email}>
                  {email}: not on the team, so we cannot check their calendar or hours.
                </li>
              );
            const load = `${person.interviewsThisWeek} ${person.interviewsThisWeek === 1 ? 'interview' : 'interviews'} this week${
              person.maxInterviewsPerWeek ? ` of ${person.maxInterviewsPerWeek}` : ''
            }`;
            return (
              <li key={email}>
                {person.name}: {load} ·{' '}
                {person.calendarConnected ? 'calendar connected' : 'no calendar connected'}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
