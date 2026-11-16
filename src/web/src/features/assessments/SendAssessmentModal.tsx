'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Send } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import {
  Alert,
  Button,
  Input,
  Modal,
  SearchSelect,
  Skeleton,
  Textarea,
  toast,
} from '@/components/ui';
import { useDebouncedValue } from '@/lib/hooks';
import { useLibrary, useRefreshAssessments } from './api';
import { dateInput, endOfDay } from './invite-actions';
import { plural } from './scoring';

/**
 * "Send assessment" for one application (from its page) or several (the pipeline's bulk bar).
 * Recipients are always applications, never typed emails. The email is the shared
 * "assessment-invite" template with an optional personal note.
 */
export function SendAssessmentModal({
  opened,
  onClose,
  applicationIds,
  onSent,
}: {
  opened: boolean;
  onClose: () => void;
  applicationIds: string[];
  onSent?: () => void;
}) {
  const library = useLibrary();
  const refresh = useRefreshAssessments();
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const active = (library.data ?? []).filter((a) => a.status === 'Active');
  const picked = active.find((a) => a.id === assessmentId);
  const single = applicationIds.length === 1 ? applicationIds[0] : null;
  const debouncedNote = useDebouncedValue(note, 500);

  // The due date follows the picked assessment's usual length until someone changes it.
  useEffect(() => {
    if (picked) setDue(dateInput(Date.now() + picked.expiryDays * 864e5));
  }, [picked]);

  const preview = useQuery({
    queryKey: ['assessments', 'email-preview', assessmentId, single, debouncedNote],
    queryFn: () =>
      api.post<{ subject: string; body: string; to: string }>(
        `/api/assessments/${assessmentId}/email-preview`,
        {
          applicationId: single,
          note: debouncedNote,
        },
      ),
    enabled: opened && !!assessmentId && !!single,
  });

  const close = () => {
    setAssessmentId(null);
    setNote('');
    setDue('');
    setConflict(null);
    onClose();
  };

  async function send() {
    if (!assessmentId || !due) return;
    setBusy(true);
    setConflict(null);
    const body = { assessmentId, expiresAt: endOfDay(due), note: note.trim() || null };
    try {
      if (single) {
        await api.post(`/api/applications/${single}/assessments`, body);
        toast.success('Assessment sent', picked?.name);
      } else {
        const result = await api.post<{ sent: number; skipped: number }>(
          '/api/assessment-invites/bulk',
          {
            ...body,
            applicationIds,
          },
        );
        toast.success(
          `Sent to ${plural(result.sent, 'applicant')}`,
          result.skipped
            ? `${plural(result.skipped, 'applicant was', 'applicants were')} skipped: already invited, closed or not yours to manage.`
            : picked?.name,
        );
      }
      refresh();
      onSent?.();
      close();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConflict(error.message);
      else toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={
        single
          ? 'Send assessment'
          : `Send assessment to ${plural(applicationIds.length, 'applicant')}`
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            leftIcon={<Send />}
            loading={busy}
            disabled={!assessmentId || !due}
            onClick={send}
          >
            Send assessment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!library.isPending && active.length === 0 ? (
          <Alert tone="info" title="No published assessments yet">
            Publish one in{' '}
            <Link
              href="/assessments"
              className="font-medium text-accent-foreground hover:underline"
            >
              Assessments
            </Link>{' '}
            first.
          </Alert>
        ) : (
          <SearchSelect
            label="Assessment"
            placeholder="Search published assessments"
            value={assessmentId}
            onChange={(v) => {
              setAssessmentId(v);
              setConflict(null);
            }}
            data={active.map((a) => ({
              value: a.id,
              label: a.name,
              group: a.department ?? undefined,
            }))}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="date"
            label="Due"
            min={dateInput(new Date())}
            value={due}
            onChange={(e) => setDue(e.currentTarget.value)}
            description="The link closes at the end of this day."
          />
        </div>
        <Textarea
          label="Personal note"
          description="Optional. Added to the email."
          maxLength={2000}
          minRows={2}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        {conflict && (
          <Alert tone="warning" title="Not sent">
            {conflict}
          </Alert>
        )}
        {single && assessmentId && (
          <section
            aria-label="Email preview"
            className="rounded-lg border border-border-subtle bg-muted"
          >
            <p className="border-b border-border-subtle px-4 py-2 text-xs text-fg-subtle">
              {preview.data ? `To ${preview.data.to}` : 'Email preview'}
            </p>
            <div className="px-4 py-3">
              {preview.data ? (
                <>
                  <p className="text-sm font-semibold text-fg">{preview.data.subject}</p>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-fg-muted">
                    {preview.data.body}
                  </p>
                </>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-16 w-full" />
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
