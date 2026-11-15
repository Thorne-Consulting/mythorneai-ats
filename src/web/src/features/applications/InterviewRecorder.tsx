'use client';

import { useEffect, useRef, useState } from 'react';
import { Circle, FileText, Mic, Square, Upload } from 'lucide-react';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  FileButton,
  Progress,
  toast,
} from '@/components/ui';

type Started = { id: string; chunkBytes: number };

const FORMATS = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm', video: false },
  { mime: 'audio/mp4', ext: 'm4a', video: false },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', video: true },
  { mime: 'video/mp4', ext: 'mp4', video: true },
];

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Sends one piece, trying again a few times: a dropped connection should not lose the interview. */
async function sendChunk(id: string, index: number, blob: Blob) {
  for (let attempt = 0; ; attempt++) {
    try {
      await api.upload(
        `/api/interview-recordings/${id}/chunks/${index}`,
        new File([blob], `part-${index}`),
      );
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

/**
 * Records the interview from this browser: your microphone mixed with the call's sound (share the
 * call's tab with its audio), and the screen if you want it. Pieces upload while you record, so a
 * closed tab or a crash keeps everything up to that moment. A finished file from Zoom, Teams or
 * Meet can be uploaded instead.
 */
export function InterviewRecorder({
  interviewId,
  canRecord,
  onUpdated,
}: {
  interviewId: string;
  canRecord: boolean;
  onUpdated: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [withScreen, setWithScreen] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'saving'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [uploaded, setUploaded] = useState<number | null>(null);
  const session = useRef<{
    started: Started;
    index: number;
    buffer: Blob[];
    bytes: number;
    queue: Promise<void>;
    stop: () => void;
    began: number;
  } | null>(null);

  useEffect(() => setCanShare(typeof navigator.mediaDevices?.getDisplayMedia === 'function'), []);
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(
      () => session.current && setElapsed((Date.now() - session.current.began) / 1000),
      1000,
    );
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', warn);
    };
  }, [phase]);

  const flush = () => {
    const current = session.current;
    if (!current || current.buffer.length === 0) return;
    const blob = new Blob(current.buffer);
    const index = current.index++;
    current.buffer = [];
    current.bytes = 0;
    setWaiting((value) => value + 1);
    current.queue = current.queue
      .then(() => sendChunk(current.started.id, index, blob))
      .then(() => setWaiting((value) => value - 1));
  };

  const start = async () => {
    const streams: MediaStream[] = [];
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streams.push(mic);
      // The call's sound comes from sharing its tab (with "Share tab audio" ticked).
      const display = canShare
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        : null;
      if (display) streams.push(display);
      const context = new AudioContext();
      const mix = context.createMediaStreamDestination();
      for (const stream of streams)
        if (stream.getAudioTracks().length) context.createMediaStreamSource(stream).connect(mix);
      const video = withScreen ? display?.getVideoTracks()[0] : undefined;
      const format =
        FORMATS.find((x) => x.video === Boolean(video) && MediaRecorder.isTypeSupported(x.mime)) ??
        FORMATS[0];
      const recorded = new MediaStream([...mix.stream.getAudioTracks(), ...(video ? [video] : [])]);
      const started = await api.post<Started>(`/api/interviews/${interviewId}/recordings/uploads`, {
        consentConfirmed: true,
        fileName: `interview-${new Date().toISOString().slice(0, 16).replace(':', '-')}.${format.ext}`,
        source: 'Browser',
      });
      const media = new MediaRecorder(recorded, {
        mimeType: format.mime,
        audioBitsPerSecond: 32_000,
        ...(video ? { videoBitsPerSecond: 1_000_000 } : {}),
      });
      const stopAll = () => {
        streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
        void context.close();
      };
      session.current = {
        started,
        index: 0,
        buffer: [],
        bytes: 0,
        queue: Promise.resolve(),
        stop: () => media.state !== 'inactive' && media.stop(),
        began: Date.now(),
      };
      media.ondataavailable = (event) => {
        const current = session.current;
        if (!current || !event.data.size) return;
        current.buffer.push(event.data);
        current.bytes += event.data.size;
        if (current.bytes >= 1024 * 1024) flush();
      };
      media.onstop = async () => {
        stopAll();
        const current = session.current;
        setPhase('saving');
        flush();
        try {
          await current?.queue;
          await api.post(`/api/interview-recordings/${started.id}/complete`, {
            durationSeconds: Math.round((Date.now() - (current?.began ?? Date.now())) / 1000),
          });
          toast.success('Recording saved', 'The transcript follows in a few minutes.');
        } catch (error) {
          toast.error(
            'Some of the recording did not upload',
            error instanceof Error ? error.message : 'What arrived is kept.',
          );
        }
        session.current = null;
        setPhase('idle');
        setElapsed(0);
        onUpdated();
      };
      // Ending the screen share from the browser bar ends the recording too.
      display?.getVideoTracks()[0]?.addEventListener('ended', () => session.current?.stop());
      media.start(5000);
      setPhase('recording');
    } catch (error) {
      streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      toast.error(
        'Could not start recording',
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Allow the microphone and screen sharing in your browser, then try again.'
          : error instanceof Error
            ? error.message
            : 'Try again.',
      );
    }
  };

  const upload = async (file: File) => {
    try {
      setUploaded(0);
      const started = await api.post<Started>(`/api/interviews/${interviewId}/recordings/uploads`, {
        consentConfirmed: true,
        fileName: file.name,
        source: 'Upload',
      });
      for (let index = 0, offset = 0; offset < file.size; index++, offset += started.chunkBytes) {
        await sendChunk(started.id, index, file.slice(offset, offset + started.chunkBytes));
        setUploaded(Math.min(100, Math.round(((offset + started.chunkBytes) / file.size) * 100)));
      }
      await api.post(`/api/interview-recordings/${started.id}/complete`, {});
      toast.success('Recording uploaded', 'The transcript follows in a few minutes.');
      onUpdated();
    } catch (error) {
      toast.error(
        'Could not upload the recording',
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setUploaded(null);
    }
  };

  const importTranscript = async (file: File) => {
    try {
      setUploaded(0);
      const result = await api.upload<{ id: string; segments: number }>(
        `/api/interviews/${interviewId}/transcripts`,
        file,
      );
      toast.success(
        'Transcript added',
        `${result.segments} ${result.segments === 1 ? 'line' : 'lines'}. The summary follows in a few minutes.`,
      );
      onUpdated();
    } catch (error) {
      toast.error(
        'Could not add the transcript',
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setUploaded(null);
    }
  };

  if (!canRecord) return null;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Record this interview
            {phase === 'recording' && (
              <Badge tone="red" dot size="sm">
                Recording · {clock(elapsed)}
              </Badge>
            )}
          </span>
        }
        description={
          canShare
            ? 'Records your microphone and the call’s sound. When asked, share the call’s tab and tick “Share tab audio”.'
            : 'Records your microphone. Put the call on speaker so both sides are heard.'
        }
        action={
          phase === 'recording' ? (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Square />}
              onClick={() => session.current?.stop()}
            >
              Stop and save
            </Button>
          ) : (
            <Button
              variant="soft"
              size="sm"
              leftIcon={canShare ? <Circle className="fill-current text-tone-red-dot" /> : <Mic />}
              disabled={!consent || phase === 'saving' || uploaded !== null}
              loading={phase === 'saving'}
              onClick={start}
            >
              Start recording
            </Button>
          )
        }
      />
      <CardBody className="space-y-3">
        {phase === 'recording' ? (
          <p className="text-sm text-fg-muted" aria-live="polite">
            {waiting > 1
              ? `Uploading… ${waiting} pieces waiting. Keep this tab open.`
              : 'Saved as you go. Keep this tab open until you stop.'}
          </p>
        ) : (
          <>
            <Checkbox
              checked={consent}
              onCheckedChange={(value) => setConsent(value === true)}
              label="Everyone in the interview has agreed to be recorded."
            />
            {canShare && (
              <Checkbox
                checked={withScreen}
                onCheckedChange={(value) => setWithScreen(value === true)}
                label="Record the screen too (a larger file)"
              />
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
              <FileButton
                accept=".mp4,.m4a,.webm,.mp3,.ogg,.wav,video/*,audio/*"
                onFile={upload}
                disabled={!consent || uploaded !== null}
                size="sm"
                variant="secondary"
                leftIcon={<Upload />}
              >
                Upload a recording
              </FileButton>
              <FileButton
                accept=".vtt,.srt,.txt,text/vtt,text/plain"
                onFile={importTranscript}
                disabled={!consent || uploaded !== null}
                size="sm"
                variant="secondary"
                leftIcon={<FileText />}
              >
                Add a transcript
              </FileButton>
              <span className="text-xs text-fg-subtle">
                From Zoom, Teams or Meet: a recording (MP4, M4A, WebM, MP3, OGG or WAV) or its
                transcript (VTT, SRT or text).
              </span>
            </div>
            {uploaded !== null && <Progress value={uploaded} label="Uploading" />}
          </>
        )}
      </CardBody>
    </Card>
  );
}
