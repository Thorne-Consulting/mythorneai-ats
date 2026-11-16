'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ClipboardList, Pencil, Plus } from 'lucide-react';
import { SettingsHeader } from '@/features/admin/SettingsShell';
import {
  Button,
  Card,
  EmptyState,
  MenuItem,
  RowActions,
  SegmentedControl,
  SkeletonRows,
} from '@/components/ui';
import { useArchiveLibraryItem, useKitTemplates } from './library-data';

/** Settings › Interview library › Templates: whole kits that any job can start from. */
export function LibraryTemplates() {
  const router = useRouter();
  const [view, setView] = useState<'active' | 'archived'>('active');
  const templates = useKitTemplates(view === 'archived');
  const archive = useArchiveLibraryItem('templates');
  const items = templates.data ?? [];

  return (
    <>
      <SettingsHeader
        actions={
          <Button asChild>
            <Link href="/settings/interview-library/templates/new">
              <Plus />
              New template
            </Link>
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm text-fg-muted">
            A new kit on any job can start from one of these. Changing a template does not change
            kits made from it.
          </p>
          <SegmentedControl
            size="sm"
            aria-label="Show"
            value={view}
            onValueChange={(value) => setView(value as 'active' | 'archived')}
            items={[
              { value: 'active', label: 'In use' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </div>
        {templates.isPending ? (
          <SkeletonRows rows={4} className="px-5 pb-5" />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={ClipboardList}
            title={view === 'archived' ? 'No archived templates' : 'No templates yet'}
            description={
              view === 'archived'
                ? 'Templates you archive show here, and you can restore them.'
                : 'Create one here, or use "Save as template" on any job’s kit.'
            }
          />
        ) : (
          <ul className="border-t border-border-subtle">
            {items.map((template) => (
              <li
                key={template.id}
                className="flex items-center gap-4 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/settings/interview-library/templates/${template.id}`}
                    className="text-base font-medium text-fg hover:text-accent-foreground hover:underline"
                  >
                    {template.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle tnum">
                    {[
                      template.summary,
                      `${template.durationMinutes} minutes`,
                      `${template.competencies.length} ${template.competencies.length === 1 ? 'competency' : 'competencies'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <RowActions label={`Actions for ${template.name}`}>
                  <MenuItem
                    icon={<Pencil />}
                    onSelect={() =>
                      router.push(`/settings/interview-library/templates/${template.id}`)
                    }
                  >
                    Edit
                  </MenuItem>
                  <MenuItem
                    icon={view === 'archived' ? <ArchiveRestore /> : <Archive />}
                    onSelect={() =>
                      archive.mutate({ id: template.id, archive: view !== 'archived' })
                    }
                  >
                    {view === 'archived' ? 'Restore' : 'Archive'}
                  </MenuItem>
                </RowActions>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
