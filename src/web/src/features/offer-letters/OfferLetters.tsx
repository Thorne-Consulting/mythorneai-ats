'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, FileSignature, History, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/api';
import { imageProblem } from '@/components/editor/images';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  MenuItem,
  RowActions,
  Skeleton,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { SettingsHeader } from '@/features/admin/SettingsShell';
import {
  InsertDetailMenu,
  useDiscardGuard,
  VersionHistoryDrawer,
  type VersionRow,
} from '@/features/templates/editor-tools';
import { formatRelative } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import { LetterPaper } from './LetterPaper';
import {
  letterChips,
  useOfferLetters,
  useRefreshOfferLetters,
  type OfferLetterTemplate,
} from './offer-letters-data';

const href = (id: string) => `/settings/offer-letters/${id}`;

/** Settings › Offer letters: the letters a new offer can start from. */
export function OfferLetterList() {
  const query = useOfferLetters();
  const refresh = useRefreshOfferLetters();
  const [deleting, setDeleting] = useState<OfferLetterTemplate | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/offer-letters/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Letter deleted');
    },
    onError: (error: Error) => toast.error('Could not delete the letter', error.message),
  });
  const letters = query.data?.letters ?? [];
  const canEdit = query.data?.canEdit ?? false;
  return (
    <>
      <SettingsHeader
        actions={
          canEdit && (
            <Button asChild leftIcon={<Plus />}>
              <Link href={href('new')}>New letter</Link>
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        {query.isPending ? (
          <SkeletonRows rows={3} />
        ) : letters.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="No offer letters yet"
            description="Write one so every offer starts from the same wording."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {letters.map((letter, index) => (
              <li key={letter.id} className="flex items-center gap-3 px-5 py-4">
                <Link
                  href={href(letter.id)}
                  className="group min-w-0 flex-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-fg group-hover:underline">
                      {letter.name}
                    </span>
                    {index === 0 && <Badge tone="blue">New offers start here</Badge>}
                  </span>
                  <span className="mt-0.5 block text-sm text-fg-subtle">
                    Version {letter.version}, edited {formatRelative(letter.updatedAt)}
                    {letter.updatedByName ? ` by ${letter.updatedByName}` : ''}
                  </span>
                </Link>
                {canEdit && letters.length > 1 && (
                  <RowActions label={`Actions for ${letter.name}`}>
                    <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(letter)}>
                      Delete letter
                    </MenuItem>
                  </RowActions>
                )}
                <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {letters.length > 1 && (
        <p className="mt-3 text-sm text-fg-subtle">
          New offers start from the first letter by name. You can pick another one on each offer.
        </p>
      )}
      <ConfirmDialog
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        confirmLabel="Delete letter"
        message="Offers that already use it keep their own copy. New offers can no longer start from it."
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id).catch(() => undefined);
        }}
      />
    </>
  );
}

/** `/settings/offer-letters/[id]` (or `new`): the letter beside a preview with sample details. */
export function OfferLetterEditor({ id }: { id: string }) {
  const query = useOfferLetters();
  const isNew = id === 'new';
  const letter = query.data?.letters.find((l) => l.id === id);
  if (query.isPending)
    return (
      <>
        <SettingsHeader crumbs={[{ label: 'Letter' }]} title="Offer letter" />
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </>
    );
  if (!isNew && !letter)
    return (
      <>
        <SettingsHeader crumbs={[{ label: 'Not found' }]} title="Letter not found" />
        <Card>
          <EmptyState
            icon={FileSignature}
            title="It may have been deleted"
            action={
              <Button asChild variant="secondary">
                <Link href="/settings/offer-letters">Back to offer letters</Link>
              </Button>
            }
          />
        </Card>
      </>
    );
  return (
    <LetterForm
      // A restored (or newly saved) version starts the form afresh.
      key={letter ? `${letter.id}-${letter.version}` : 'new'}
      letter={letter ?? { id: '', name: '', body: STARTER, version: 0, updatedAt: '' }}
      canEdit={query.data?.canEdit ?? false}
      chips={letterChips(query.data?.details)}
    />
  );
}

const STARTER =
  'Dear {{firstName}},\n\nWe are delighted to offer you the position of **{{jobTitle}}** at {{company}}.\n\n{{terms}}\n\nSincerely,\n\n{{senderName}}';

function LetterForm({
  letter,
  canEdit,
  chips,
}: {
  letter: OfferLetterTemplate;
  canEdit: boolean;
  chips: ReturnType<typeof letterChips>;
}) {
  const router = useRouter();
  const refresh = useRefreshOfferLetters();
  const guard = useDiscardGuard('this letter');
  const isNew = !letter.id;
  const [name, setName] = useState(letter.name);
  const [body, setBody] = useState(letter.body);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The editor keeps its first value, so discarding loads the saved letter into a fresh one.
  const [editorKey, setEditorKey] = useState(0);
  const discard = () => {
    setName(letter.name);
    setBody(letter.body);
    setErrors({});
    setEditorKey((key) => key + 1);
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = canEdit && (name !== letter.name || body.trim() !== letter.body.trim());
  const { setDirty } = guard;
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const sample = useDebouncedValue(body, 400);
  const preview = useQuery({
    queryKey: ['offer-letter-preview', sample],
    queryFn: () =>
      api.post<{ markdown: string }>('/api/offer-letters/preview', { markdown: sample }),
    placeholderData: (previous) => previous,
  });

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api.post<{ id: string }>('/api/offer-letters', { name, body })
        : api.put(`/api/offer-letters/${letter.id}`, { name, body }),
    onSuccess: (result) => {
      setErrors({});
      setDirty(false);
      refresh();
      toast.success(isNew ? 'Letter saved' : 'Changes saved');
      if (isNew && result && typeof result === 'object' && 'id' in result)
        router.replace(href((result as { id: string }).id));
    },
    onError: (error: Error) => {
      const details =
        error instanceof ApiError
          ? (error.details as { errors?: Record<string, string[]> })
          : undefined;
      const fields = details?.errors ?? {};
      setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
      if (!fields.name && !fields.body) toast.error('Could not save the letter', error.message);
    },
  });

  return (
    <>
      <SettingsHeader
        crumbs={[{ label: isNew ? 'New letter' : letter.name }]}
        title={isNew ? 'New offer letter' : letter.name}
        description={
          isNew
            ? undefined
            : `Version ${letter.version}, edited ${formatRelative(letter.updatedAt)}${letter.updatedByName ? ` by ${letter.updatedByName}` : ''}`
        }
        actions={
          !isNew && (
            <Button
              variant="secondary"
              leftIcon={<History />}
              onClick={() => guard.ask(() => setHistoryOpen(true))}
            >
              History
            </Button>
          )
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          <div className="border-b border-border-subtle px-5 py-4">
            <Input
              label="Name"
              required
              value={name}
              disabled={!canEdit}
              error={errors.name}
              placeholder="For example: Full-time offer"
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </div>
          <div className="flex flex-col gap-3 px-5 py-5">
            <p className="text-sm font-medium text-fg">Letter</p>
            <PlateMarkdownEditor
              key={editorKey}
              value={letter.body}
              onChange={setBody}
              chips={{ details: chips }}
              invalid={!!errors.body}
              placeholder="Write the letter. Type { to add a detail such as Salary."
              header={canEdit ? <InsertDetailMenu chips={chips} /> : undefined}
            />
            {errors.body ? (
              <p className="text-sm text-destructive">{errors.body}</p>
            ) : (
              <p className="text-xs text-fg-subtle">
                Details fill in from each offer’s terms. “All terms” is a list of every term the
                offer has, so empty ones never show.
              </p>
            )}
            {!canEdit && (
              <Alert tone="info">Only people who manage templates can change offer letters.</Alert>
            )}
          </div>
          {canEdit && (
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-border-subtle bg-card px-5 py-3">
              {dirty && (
                <Badge tone="amber" className="mr-auto">
                  Unsaved changes
                </Badge>
              )}
              {dirty && !isNew && (
                <Button variant="secondary" onClick={discard}>
                  Discard
                </Button>
              )}
              <Button
                onClick={() => {
                  const problem = imageProblem(body);
                  if (problem) setErrors({ body: problem });
                  else save.mutate();
                }}
                loading={save.isPending}
                disabled={!dirty && !isNew}
              >
                {isNew ? 'Save letter' : 'Save changes'}
              </Button>
            </div>
          )}
        </Card>
        <div className="min-w-0 space-y-2 xl:sticky xl:top-[101px]">
          <p className="text-sm font-medium text-fg-muted">Preview with sample details</p>
          {preview.data ? (
            <LetterPaper markdown={preview.data.markdown} />
          ) : (
            <Card className="space-y-3 p-8">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </Card>
          )}
        </div>
      </div>
      {!isNew && (
        <LetterHistory
          id={letter.id}
          opened={historyOpen}
          onClose={() => setHistoryOpen(false)}
          readOnly={!canEdit}
          onRestored={() => {
            setDirty(false);
            refresh();
          }}
        />
      )}
      {guard.dialog}
    </>
  );
}

/** Every saved wording of a letter; restoring one saves it as the newest version. */
function LetterHistory({
  id,
  opened,
  onClose,
  readOnly,
  onRestored,
}: {
  id: string;
  opened: boolean;
  onClose: () => void;
  readOnly: boolean;
  onRestored: () => void;
}) {
  const versions = useQuery({
    queryKey: ['offer-letter-versions', id],
    queryFn: () => api.get<VersionRow[]>(`/api/offer-letters/${id}/versions`),
    enabled: opened,
  });
  const restore = useMutation({
    mutationFn: (version: number) => api.post(`/api/offer-letters/${id}/restore`, { version }),
    onSuccess: () => {
      toast.success('Older wording restored', 'It is saved as the newest version.');
      versions.refetch();
      onClose();
      onRestored();
    },
    onError: (error: Error) => toast.error('Could not restore that version', error.message),
  });
  return (
    <VersionHistoryDrawer
      opened={opened}
      onClose={onClose}
      versions={versions.data}
      readOnly={readOnly}
      restoring={restore.isPending}
      onRestore={(version) => restore.mutate(version)}
    />
  );
}
