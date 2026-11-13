'use client';

import { useRef, useState } from 'react';
import { Circle, Link2, Square, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { Badge, Button, Checkbox, ConfirmDialog, IconButton, toast } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { Interview } from './application-types';

export function InterviewRecorder({
  interview,
  canRecord,
  canDelete,
  onUpdated,
}: {
  interview: Interview;
  canRecord: boolean;
  canDelete: boolean;
  onUpdated: () => void;
}) {
  // Recording needs every participant's explicit agreement; the button stays off until this is ticked.
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) =>
      api.upload(`/api/interviews/${interview.id}/recordings?consentConfirmed=true`, file),
    onSuccess: () => {
      onUpdated();
      toast.success('Recording saved to the interview record');
    },
    onError: (error: Error) => toast.error('Could not save the recording', error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/interview-recordings/${id}`),
    onSuccess: () => {
      onUpdated();
      toast.success('Recording deleted');
    },
    onError: (error: Error) => toast.error('Could not delete the recording', error.message),
  });
  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/api/interview-recordings/${id}`,
      );
      toast.success('Internal recording link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };
  const start = async () => {
    if (!consent) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm',
      });
      media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        upload.mutate(
          new File(chunks, `interview-${new Date().toISOString().replaceAll(':', '-')}.webm`, {
            type: 'video/webm',
          }),
        );
        setRecording(false);
      };
      stream.getVideoTracks()[0].onended = () => media.state !== 'inactive' && media.stop();
      recorder.current = media;
      media.start(1000);
      setRecording(true);
    } catch {
      toast.error('Screen recording was not started');
    }
  };
  return (
    <div className="mt-4 rounded-lg bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            Interview recording
            {recording && (
              <Badge tone="red" dot size="sm">
                Recording
              </Badge>
            )}
          </p>
          <p className="text-xs text-fg-subtle">Screen and shared audio stay inside this ATS.</p>
        </div>
        {canRecord &&
          (recording ? (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Square />}
              onClick={() => recorder.current?.stop()}
            >
              Stop and save
            </Button>
          ) : (
            <Button
              variant="soft"
              size="sm"
              leftIcon={<Circle className="fill-current text-tone-red-dot" />}
              disabled={!consent || upload.isPending}
              loading={upload.isPending}
              onClick={start}
            >
              Record interview
            </Button>
          ))}
      </div>
      {canRecord && !recording && (
        <Checkbox
          className="mt-3"
          checked={consent}
          onCheckedChange={setConsent}
          label="Every participant has explicitly agreed to this recording."
        />
      )}
      {interview.recordings.map((item) => (
        <div key={item.id} className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <video
            controls
            preload="metadata"
            src={`/api/interview-recordings/${item.id}`}
            className="w-full max-w-[520px] rounded-lg bg-black"
          />
          <div className="flex flex-col items-end gap-1">
            <p className="text-xs text-fg-subtle tnum">
              {formatDateTime(item.recordedAt)} · {Math.ceil(item.length / 1024 / 1024)} MB
            </p>
            <div className="flex gap-1">
              <IconButton
                variant="quiet"
                size="sm"
                label="Copy internal recording link"
                onClick={() => copyLink(item.id)}
              >
                <Link2 />
              </IconButton>
              {canDelete && (
                <IconButton
                  variant="danger-quiet"
                  size="sm"
                  label="Delete recording"
                  loading={remove.isPending && remove.variables === item.id}
                  onClick={() => setDeleting(item.id)}
                >
                  <Trash2 />
                </IconButton>
              )}
            </div>
          </div>
        </div>
      ))}
      <ConfirmDialog
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this recording?"
        confirmLabel="Delete recording"
        message="The video and any transcript made from it are removed for everyone. This cannot be undone."
        onConfirm={() =>
          deleting
            ? remove.mutateAsync(deleting).then(
                () => undefined,
                () => undefined,
              )
            : undefined
        }
      />
    </div>
  );
}
