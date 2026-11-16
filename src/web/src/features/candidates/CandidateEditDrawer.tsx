'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import { Button, Drawer, Input, Switch, Textarea, toast } from '@/components/ui';
import { SourceFields } from '@/features/sources/SourceFields';
import type { CandidateDetail } from '@/types';

type Draft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentTitle: string;
  location: string;
  source: string;
  referrerId: string | null;
  linkedInUrl: string;
  gitHubUrl: string;
  portfolioUrl: string;
  doNotContact: boolean;
  doNotContactReason: string;
};
type Conflict = { message: string; candidate?: { id: string; name: string } };

const draftOf = (candidate: CandidateDetail): Draft => ({
  firstName: candidate.firstName,
  lastName: candidate.lastName,
  email: candidate.email,
  phone: candidate.phone ?? '',
  currentTitle: candidate.currentTitle ?? '',
  location: candidate.location ?? '',
  source: candidate.source,
  referrerId: candidate.referrer?.id ?? null,
  linkedInUrl: candidate.linkedInUrl ?? '',
  gitHubUrl: candidate.gitHubUrl ?? '',
  portfolioUrl: candidate.portfolioUrl ?? '',
  doNotContact: candidate.doNotContact,
  doNotContactReason: candidate.doNotContactReason ?? '',
});

/** Edit a person's name, contact details, links, source and "do not contact". */
export function CandidateEditDrawer({
  candidate,
  opened,
  onClose,
}: {
  candidate: CandidateDetail;
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(candidate));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<Conflict['candidate'] | null>(null);
  const [lastOpened, setLastOpened] = useState(false);
  // Start from the saved record each time the drawer opens.
  if (opened !== lastOpened) {
    setLastOpened(opened);
    if (opened) {
      setDraft(draftOf(candidate));
      setErrors({});
      setDuplicate(null);
    }
  }
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/candidates/${candidate.id}`, {
        ...draft,
        // Tags are edited in the header; leave them as they are.
        tags: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast.success('Details saved');
      onClose();
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 409) {
        setDuplicate((error.details as Conflict | undefined)?.candidate ?? null);
        setErrors({ email: 'Another candidate has this email.' });
        return;
      }
      const fieldErrors =
        error instanceof ApiError
          ? (error.details as { errors?: Record<string, string[]> } | undefined)?.errors
          : undefined;
      if (fieldErrors)
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])));
      else toast.error('Could not save the details', error.message);
    },
  });
  const field = (
    key: keyof Draft,
    label: string,
    props: Partial<Parameters<typeof Input>[0]> = {},
  ) => (
    <Input
      label={label}
      value={draft[key] as string}
      onChange={(event) => set(key, event.currentTarget.value as never)}
      error={errors[key]}
      {...props}
    />
  );

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Edit details"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field('firstName', 'First name', { required: true, autoComplete: 'off' })}
          {field('lastName', 'Last name', { required: true, autoComplete: 'off' })}
        </div>
        <div>
          {field('email', 'Email', { type: 'email', required: true })}
          {duplicate && (
            <p className="mt-1.5 text-sm">
              <Link
                className="text-accent-foreground hover:underline"
                href={`/candidates/${duplicate.id}`}
              >
                Open {duplicate.name}
              </Link>
            </p>
          )}
          {candidate.emailBounced && !errors.email && (
            <p className="mt-1.5 text-xs text-tone-amber-fg">
              Emails to this address bounced. Saving a new address starts sending again.
            </p>
          )}
        </div>
        {field('phone', 'Phone', { type: 'tel' })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field('currentTitle', 'Current title')}
          {field('location', 'Location', { placeholder: 'For example, Chicago, IL' })}
        </div>
        <SourceFields
          enabled={opened}
          keep={candidate.source}
          source={draft.source || null}
          referrerId={draft.referrerId}
          onChange={({ source, referrerId }) =>
            setDraft((current) => ({ ...current, source: source ?? '', referrerId }))
          }
          error={errors.source ?? errors.referrerId}
        />
        {field('linkedInUrl', 'LinkedIn', {
          type: 'url',
          placeholder: 'https://www.linkedin.com/in/…',
        })}
        {field('gitHubUrl', 'GitHub', { type: 'url', placeholder: 'https://github.com/…' })}
        {field('portfolioUrl', 'Portfolio or website', { type: 'url', placeholder: 'https://…' })}
        <div className="rounded-lg border border-border p-4">
          <Switch
            label="Do not contact"
            description="We stop sending them email, and email buttons hide on their record."
            checked={draft.doNotContact}
            onCheckedChange={(on) => set('doNotContact', on)}
          />
          {draft.doNotContact && (
            <Textarea
              className="mt-3"
              label="Reason (optional)"
              value={draft.doNotContactReason}
              onChange={(event) => set('doNotContactReason', event.currentTarget.value)}
              minRows={2}
            />
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
