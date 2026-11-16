'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Link2,
  Loader2,
  Lock,
  RotateCcw,
  Trash2,
  UserPen,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  IconButton,
  Modal,
  SearchInput,
  SegmentedControl,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { RecordingInfo, TranscriptSegment } from './interview-api';

type Transcript = {
  status: string;
  transcriptStatus: string;
  transcriptError?: string | null;
  durationSeconds?: number | null;
  segments: TranscriptSegment[];
  /** Who each speaker label is, once someone named them. */
  speakerNames?: Record<string, string>;
};

/** "Jordan Lee" once named; "Speaker A" for a label the transcript service gave; an imported name as it is. */
export const speakerName = (names: Record<string, string> | undefined, speaker: string) =>
  names?.[speaker] || (speaker.length <= 2 ? `Speaker ${speaker}` : speaker);

export const stamp = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const SPEEDS = ['1', '1.25', '1.5', '2'];

/**
 * One recording: the player, then its transcript. The line being spoken lights up and follows the
 * playback; click a line to jump there. Search marks every hit on the scrubber.
 */
export function RecordingPlayer({
  interviewId,
  recording,
  canSeeTranscript,
  canManage,
  canName = canManage,
  people = [],
  onUpdated,
}: {
  interviewId: string;
  recording: RecordingInfo;
  canSeeTranscript: boolean;
  canManage: boolean;
  /** The panel and the people who run the job can say who each speaker is. */
  canName?: boolean;
  /** Names to pick from when naming speakers: the panel and the candidate. */
  people?: string[];
  onUpdated: () => void;
}) {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const start = Number(useSearchParams().get('t'));
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(recording.durationSeconds ?? 0);
  const [speed, setSpeed] = useState('1');
  const [search, setSearch] = useState('');
  const [hit, setHit] = useState(0);
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [naming, setNaming] = useState(false);
  const ready = recording.status === 'Ready';
  const imported = recording.source === 'Transcript';
  // An imported transcript has its text from the start; only its summary may still be on the way.
  const transcriptReady = canSeeTranscript && (recording.transcriptStatus === 'Ready' || imported);
  const transcript = useQuery({
    queryKey: ['recording-transcript', recording.id, recording.transcriptStatus],
    queryFn: () => api.get<Transcript>(`/api/interview-recordings/${recording.id}/transcript`),
    enabled: transcriptReady,
  });
  const again = useMutation({
    mutationFn: () => api.post(`/api/interview-recordings/${recording.id}/transcribe`),
    onSuccess: () => {
      onUpdated();
      toast.success('Transcribing again');
    },
    onError: (error: Error) => toast.error('Could not start the transcript', error.message),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/interview-recordings/${recording.id}`),
    onSuccess: () => {
      onUpdated();
      toast.success('Recording deleted');
    },
    onError: (error: Error) => toast.error('Could not delete the recording', error.message),
  });

  const segments = useMemo(() => transcript.data?.segments ?? [], [transcript.data]);
  const names = transcript.data?.speakerNames;
  const speakers = useMemo(
    () => [...new Set(segments.map((x) => x.speaker).filter((x): x is string => Boolean(x)))],
    [segments],
  );
  const words = search.trim().toLowerCase();
  const hits = useMemo(
    () =>
      words ? segments.flatMap((x, i) => (x.text.toLowerCase().includes(words) ? [i] : [])) : [],
    [segments, words],
  );
  const shown = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => !speaker || segment.speaker === speaker);
  const current = segments.findIndex((x) => time >= x.start && time < x.end);

  const seek = (seconds: number) => {
    setTime(seconds);
    if (!media.current) return;
    media.current.currentTime = seconds;
    void media.current.play().catch(() => undefined);
  };
  useEffect(() => {
    if (start > 0 && media.current) media.current.currentTime = start;
  }, [start, ready]);
  useEffect(() => {
    if (media.current) media.current.playbackRate = Number(speed);
  }, [speed]);
  useEffect(() => {
    if (!follow || current < 0) return;
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current, follow]);
  const jumpHit = (by: number) => {
    if (!hits.length) return;
    const next = (hit + by + hits.length) % hits.length;
    setHit(next);
    setFollow(false);
    const index = hits[next];
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'center' });
    seek(segments[index].start);
  };
  const copyAt = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/interviews/${interviewId}/recording?t=${Math.floor(time)}`,
      );
      toast.success(`Link to ${stamp(time)} copied`);
    } catch {
      toast.error('Could not copy the link');
    }
  };
  const video = recording.contentType.startsWith('video/');
  const total = duration || recording.durationSeconds || segments.at(-1)?.end || 0;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fg-muted">
            {imported
              ? `Transcript from ${recording.originalFileName}, added`
              : recording.source === 'Upload'
                ? 'Uploaded'
                : 'Recorded'}{' '}
            {formatDateTime(recording.recordedAt)}
            {total ? ` · ${stamp(total)}` : ''}
          </p>
          {canManage && (
            <IconButton
              variant="danger-quiet"
              size="sm"
              label={imported ? 'Delete transcript' : 'Delete recording'}
              onClick={() => setDeleting(true)}
            >
              <Trash2 />
            </IconButton>
          )}
        </div>

        {recording.status === 'Failed' ? (
          <Alert tone="danger" title="This recording could not be saved">
            {recording.processingError}
          </Alert>
        ) : !ready ? (
          <p className="flex items-center gap-2 text-base text-fg-muted" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {recording.status === 'Uploading'
              ? 'Still recording or uploading.'
              : 'Saving the recording. This takes a moment.'}
          </p>
        ) : imported ? null : (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions come from the transcript when there is one */}
            {video ? (
              <video
                ref={media}
                controls
                preload="metadata"
                src={`/api/interview-recordings/${recording.id}`}
                className="aspect-video w-full rounded-lg bg-black"
                onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
                onLoadedMetadata={(event) =>
                  Number.isFinite(event.currentTarget.duration) &&
                  setDuration(event.currentTarget.duration)
                }
              >
                {transcriptReady && (
                  <track
                    kind="captions"
                    srcLang="en"
                    label="Transcript"
                    src={`/api/interview-recordings/${recording.id}/captions.vtt`}
                  />
                )}
              </video>
            ) : (
              <audio
                ref={media}
                controls
                preload="metadata"
                src={`/api/interview-recordings/${recording.id}`}
                className="w-full"
                onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
                onLoadedMetadata={(event) =>
                  Number.isFinite(event.currentTarget.duration) &&
                  setDuration(event.currentTarget.duration)
                }
              />
            )}
            {total > 0 && hits.length > 0 && (
              <div
                className="relative h-2 rounded-full bg-muted"
                aria-label={`${hits.length} matches on the timeline`}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
                  style={{ width: `${Math.min(100, (time / total) * 100)}%` }}
                />
                {hits.map((index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Match at ${stamp(segments[index].start)}`}
                    onClick={() => seek(segments[index].start)}
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-tone-amber-dot ring-2 ring-card"
                    style={{ left: `${Math.min(100, (segments[index].start / total) * 100)}%` }}
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                size="sm"
                aria-label="Speed"
                value={speed}
                onValueChange={setSpeed}
                items={SPEEDS.map((value) => ({ value, label: `${value}×` }))}
              />
              <Button size="sm" variant="quiet" leftIcon={<Link2 />} onClick={copyAt}>
                Copy link at {stamp(time)}
              </Button>
            </div>
          </>
        )}

        {ready && (!imported || !canSeeTranscript) && (
          <TranscriptState
            recording={recording}
            canSee={canSeeTranscript}
            canManage={canManage}
            onRetry={() => again.mutate()}
            retrying={again.isPending}
          />
        )}

        {transcriptReady &&
          transcript.error instanceof ApiError &&
          transcript.error.status === 403 && (
            <p className="text-sm text-fg-subtle">{transcript.error.message}</p>
          )}
        {transcriptReady && segments.length > 0 && (
          <section
            aria-label="Transcript"
            className={cn('space-y-3', !imported && 'border-t border-border-subtle pt-4')}
          >
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                aria-label="Search the transcript"
                placeholder="Search the transcript"
                className="w-full sm:w-72"
                value={search}
                onValueChange={(value) => {
                  setSearch(value);
                  setHit(0);
                }}
              />
              {words && (
                <span className="flex items-center gap-1 text-sm text-fg-muted tnum">
                  {hits.length ? `${hit + 1} of ${hits.length}` : 'No matches'}
                  <IconButton
                    size="sm"
                    variant="quiet"
                    label="Previous match"
                    disabled={!hits.length}
                    onClick={() => jumpHit(-1)}
                  >
                    <ChevronUp />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="quiet"
                    label="Next match"
                    disabled={!hits.length}
                    onClick={() => jumpHit(1)}
                  >
                    <ChevronDown />
                  </IconButton>
                </span>
              )}
              {speakers.length > 1 && (
                <div className="flex flex-wrap gap-1" role="group" aria-label="Speakers">
                  {speakers.map((key) => (
                    <Button
                      key={key}
                      size="xs"
                      variant={speaker === key ? 'soft' : 'quiet'}
                      aria-pressed={speaker === key}
                      onClick={() => setSpeaker(speaker === key ? null : key)}
                    >
                      {speakerName(names, key)}
                    </Button>
                  ))}
                </div>
              )}
              {speakers.length > 0 && canName && (
                <Button
                  size="xs"
                  variant="quiet"
                  leftIcon={<UserPen />}
                  onClick={() => setNaming(true)}
                >
                  Name speakers
                </Button>
              )}
              {!follow && (
                <Button size="xs" variant="quiet" onClick={() => setFollow(true)}>
                  Follow the playback
                </Button>
              )}
            </div>
            <p className="text-xs text-fg-subtle">
              {imported
                ? 'Added from a transcript file made by another tool.'
                : 'Written by a computer from the recording. It may have mistakes.'}
            </p>
            <ol
              ref={list}
              onWheel={() => setFollow(false)}
              onTouchMove={() => setFollow(false)}
              className="max-h-[420px] space-y-0.5 overflow-y-auto rounded-lg border border-border-subtle p-1"
            >
              {shown.map(({ segment, index }) => (
                <li key={index} data-index={index}>
                  <button
                    type="button"
                    onClick={() => seek(segment.start)}
                    className={cn(
                      'flex w-full gap-3 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      index === current && 'bg-accent',
                    )}
                  >
                    <span className="w-12 shrink-0 text-xs text-accent-foreground tnum">
                      {stamp(segment.start)}
                    </span>
                    <span className="min-w-0 text-fg">
                      {segment.speaker && (
                        <span className="mr-1.5 text-xs font-semibold text-fg-muted">
                          {speakerName(names, segment.speaker)}
                        </span>
                      )}
                      <Highlight text={segment.text} words={words} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </CardBody>
      <ConfirmDialog
        opened={deleting}
        onClose={() => setDeleting(false)}
        title={imported ? 'Delete this transcript?' : 'Delete this recording?'}
        confirmLabel={imported ? 'Delete transcript' : 'Delete recording'}
        message={
          imported
            ? 'The transcript is removed for everyone. This cannot be undone.'
            : 'The recording and its transcript are removed for everyone. This cannot be undone.'
        }
        onConfirm={() =>
          remove.mutateAsync().then(
            () => undefined,
            () => undefined,
          )
        }
      />
      {naming && (
        <NameSpeakers
          recordingId={recording.id}
          speakers={speakers}
          segments={segments}
          names={names ?? {}}
          people={people}
          onClose={() => setNaming(false)}
          onSaved={() => transcript.refetch()}
        />
      )}
    </Card>
  );
}

/** "Who is speaker A?": a name from the panel or the candidate, or typed in. */
function NameSpeakers({
  recordingId,
  speakers,
  segments,
  names,
  people,
  onClose,
  onSaved,
}: {
  recordingId: string;
  speakers: string[];
  segments: TranscriptSegment[];
  names: Record<string, string>;
  people: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(speakers.map((key) => [key, names[key] ?? ''])),
  );
  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/interview-recordings/${recordingId}/speakers`, {
        names: Object.fromEntries(speakers.map((key) => [key, draft[key]?.trim() ?? ''])),
      }),
    onSuccess: () => {
      onSaved();
      onClose();
      toast.success('Speakers named');
    },
    onError: (error: Error) => toast.error('Could not save the names', error.message),
  });
  return (
    <Modal
      opened
      onClose={onClose}
      title="Name the speakers"
      description="The transcript, the captions and the next summary use these names."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save names
          </Button>
        </>
      }
    >
      <ul className="space-y-5">
        {speakers.map((key) => {
          const first = segments.find((x) => x.speaker === key);
          return (
            <li key={key} className="space-y-1.5">
              <Autocomplete
                label={key.length <= 2 ? `Speaker ${key}` : key}
                placeholder="Pick a person or type a name"
                data={people}
                value={draft[key] ?? ''}
                onChange={(value) => setDraft({ ...draft, [key]: value })}
              />
              {first && (
                <p className="line-clamp-2 text-xs text-fg-subtle">
                  First says at {stamp(first.start)}: “{first.text}”
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function Highlight({ text, words }: { text: string; words: string }) {
  if (!words) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === words ? (
          <mark key={index} className="rounded-sm bg-tone-amber-bg px-0.5 text-fg">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function TranscriptState({
  recording,
  canSee,
  canManage,
  onRetry,
  retrying,
}: {
  recording: RecordingInfo;
  canSee: boolean;
  canManage: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (!canSee)
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <Lock className="size-4 text-fg-subtle" aria-hidden />
        The transcript opens after you send your scorecard, so nothing shapes your view.
      </p>
    );
  switch (recording.transcriptStatus) {
    case 'Queued':
    case 'Running':
      return (
        <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Writing the transcript. This usually takes a few minutes.
        </p>
      );
    case 'TooLong':
    case 'Failed':
      return (
        <Alert
          tone={recording.transcriptStatus === 'TooLong' ? 'warning' : 'danger'}
          title="No transcript"
          action={
            canManage && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RotateCcw />}
                loading={retrying}
                onClick={onRetry}
              >
                Try again
              </Button>
            )
          }
        >
          {recording.transcriptError}
        </Alert>
      );
    default:
      return null;
  }
}
