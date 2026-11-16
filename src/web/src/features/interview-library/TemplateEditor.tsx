'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, EmptyState, Input, SkeletonRows, toast } from '@/components/ui';
import { SettingsHeader } from '@/features/admin/SettingsShell';
import { imageProblem } from '@/components/editor/images';
import { KitForm } from './KitForm';
import { useKitTemplates, useSaveTemplate } from './library-data';
import {
  blankDraft,
  draftFromTemplate,
  sameDraft,
  toTemplateBody,
  validateKit,
  type KitDraft,
  type KitTemplate,
} from './library-model';

const LIBRARY = '/settings/interview-library';

/** Settings › Interview library › one template, written like a kit. */
export function TemplateEditor({ templateId }: { templateId: string }) {
  const active = useKitTemplates();
  const archived = useKitTemplates(true);
  if (templateId === 'new') return <TemplateForm />;
  const template = [...(active.data ?? []), ...(archived.data ?? [])].find(
    (item) => item.id === templateId,
  );
  if (template) return <TemplateForm template={template} key={template.id} />;
  if (active.isPending || archived.isPending)
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  return (
    <Card>
      <EmptyState
        compact
        title="This template is not in the library"
        description="Go back to the library to pick another one."
      />
    </Card>
  );
}

function TemplateForm({ template }: { template?: KitTemplate }) {
  const router = useRouter();
  const [initial] = useState<KitDraft>(() =>
    template ? draftFromTemplate(template) : { ...blankDraft(), durationMinutes: 45 },
  );
  const [draft, setDraft] = useState(initial);
  const [summary, setSummary] = useState(template?.summary ?? '');
  const [tried, setTried] = useState(false);
  const save = useSaveTemplate(template?.id);
  const errors = validateKit(draft, imageProblem(draft.instructions));
  const dirty = !sameDraft(draft, initial) || summary !== (template?.summary ?? '');

  const submit = () => {
    setTried(true);
    if (!errors.ok) {
      toast.error('Some fields need attention', 'Fix the fields marked in red, then save.');
      return;
    }
    save.mutate(toTemplateBody(draft, summary), {
      onSuccess: () => {
        toast.success(template ? 'Template saved' : 'Template added to the library');
        router.push(LIBRARY);
      },
    });
  };

  return (
    <>
      <SettingsHeader
        title={template ? template.name : 'New template'}
        crumbs={[{ label: template ? template.name : 'New template' }]}
      />
      <div className="space-y-4 pb-24">
        <Card className="p-4 sm:p-6">
          <KitForm
            draft={draft}
            onChange={setDraft}
            errors={tried ? errors : null}
            header={
              <Input
                label="Summary"
                description="Optional. One line on what this round covers, shown when someone picks a template."
                value={summary}
                maxLength={200}
                onChange={(event) => setSummary(event.currentTarget.value)}
              />
            }
          />
        </Card>
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-pop">
          {tried && !errors.ok && (
            <p className="mr-auto text-sm text-destructive">Fix the fields marked in red.</p>
          )}
          <Button variant="secondary" onClick={() => router.push(LIBRARY)}>
            {dirty ? 'Discard changes' : 'Cancel'}
          </Button>
          <Button loading={save.isPending} disabled={Boolean(template) && !dirty} onClick={submit}>
            {template ? 'Save changes' : 'Add template'}
          </Button>
        </div>
      </div>
    </>
  );
}
