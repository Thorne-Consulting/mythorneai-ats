'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, toast } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { Interview } from './application-types';

type Recording = Interview['recordings'][number] & { transcript?: string | null };

/** Transcribe a recording and read the transcript. Only for people who manage the job. */
export function RecordingTranscripts({
  interview,
  onUpdated,
}: {
  interview: Interview;
  onUpdated: () => void;
}) {
  const recordings = interview.recordings as Recording[];
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const transcribe = useMutation({
    mutationFn: (id: string) =>
      api.post<{ transcript: string }>(`/api/interview-recordings/${id}/transcribe`),
    onSuccess: (_result, id) => {
      onUpdated();
      setShown((value) => ({ ...value, [id]: true }));
      toast.success('Transcript ready', 'Check it before relying on it.');
    },
    onError: (error: Error) => toast.error('Could not transcribe the recording', error.message),
  });
  if (recordings.length === 0) return null;
  return (
    <div className="mt-4 space-y-3">
      {recordings.map((item) => (
        <div key={item.id} className="rounded-lg border border-border-subtle p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-fg">Recording from {formatDateTime(item.recordedAt)}</p>
            <div className="flex gap-2">
              {item.transcript && (
                <Button
                  size="xs"
                  variant="quiet"
                  aria-expanded={!!shown[item.id]}
                  onClick={() => setShown((value) => ({ ...value, [item.id]: !value[item.id] }))}
                >
                  {shown[item.id] ? 'Hide transcript' : 'Show transcript'}
                </Button>
              )}
              <Button
                size="xs"
                variant="soft"
                leftIcon={<FileText />}
                loading={transcribe.isPending && transcribe.variables === item.id}
                onClick={() => transcribe.mutate(item.id)}
              >
                {item.transcript ? 'Transcribe again' : 'Transcribe'}
              </Button>
            </div>
          </div>
          {shown[item.id] && item.transcript && (
            <div className="mt-2">
              <p className="text-xs text-fg-subtle">Machine transcript. It can contain mistakes.</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{item.transcript}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
