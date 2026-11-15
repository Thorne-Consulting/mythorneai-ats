'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { api } from '@/api';
import { SettingsHeader } from './SettingsShell';
import {
  Badge,
  Button,
  Card,
  CellStack,
  EmptyState,
  MenuItem,
  RowActions,
  SkeletonRows,
  Switch,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  toast,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { QuestionBank } from './QuestionBank';

export type PostingTemplateRow = {
  id: string;
  name: string;
  version: number;
  archivedAt?: string | null;
  updatedAt: string;
  updatedByName?: string | null;
  usedBy: number;
};

/** Settings, Posting templates: the latest version of each, plus the shared question bank. */
export function PostingTemplates() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const templates = useQuery({
    queryKey: ['posting-templates', 'all'],
    queryFn: () => api.get<PostingTemplateRow[]>('/api/posting-templates?archived=true'),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['posting-templates'] });
  const archive = useMutation({
    mutationFn: (input: { id: string; restore: boolean }) =>
      api.post(`/api/posting-templates/${input.id}/archive${input.restore ? '?restore=true' : ''}`),
    onSuccess: (_, input) => {
      refresh();
      toast.success(input.restore ? 'Template restored' : 'Template archived');
    },
    onError: (e: Error) => toast.error('Could not change the template', e.message),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/api/posting-templates/${id}/duplicate`),
    onSuccess: ({ id }) => {
      refresh();
      router.push(`/settings/templates/${id}`);
    },
    onError: (e: Error) => toast.error('Could not copy the template', e.message),
  });
  const newButton = (
    <Button asChild leftIcon={<Plus />}>
      <Link href="/settings/templates/new">New template</Link>
    </Button>
  );
  const all = templates.data ?? [];
  const archivedCount = all.filter((t) => t.archivedAt).length;
  const rows = all.filter((t) => showArchived || !t.archivedAt);
  const empty = templates.data?.length === 0;

  return (
    <>
      {/* The empty state has its own button, so the header shows one only when there is a list. */}
      <SettingsHeader actions={empty ? undefined : newButton} />
      <div className="flex flex-col gap-5">
        <Card>
          {!templates.data ? (
            <SkeletonRows rows={3} />
          ) : empty ? (
            <EmptyState
              compact
              icon={FileText}
              title="No posting templates yet"
              description="Save the company intro, a role starter, benefits and default questions once, and start every job from them."
              action={newButton}
            />
          ) : (
            <>
              {archivedCount > 0 && (
                <div className="flex justify-end px-5 pt-4">
                  <Switch
                    label={`Show archived (${archivedCount})`}
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                  />
                </div>
              )}
              <div className="overflow-x-auto px-5 pb-3">
                <Table className="min-w-[560px]">
                  <THead>
                    <tr>
                      <TH>Template</TH>
                      <TH>Used by</TH>
                      <TH>Last changed</TH>
                      <TH className="w-12">
                        <span className="sr-only">Actions</span>
                      </TH>
                    </tr>
                  </THead>
                  <TBody>
                    {rows.map((t) => (
                      <TR key={t.id} interactive>
                        <TD>
                          <Link
                            href={`/settings/templates/${t.id}`}
                            className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <CellStack
                              primary={
                                <span className="inline-flex items-center gap-2">
                                  {t.name}
                                  {t.archivedAt && <Badge tone="gray">Archived</Badge>}
                                </span>
                              }
                              secondary={`Version ${t.version}`}
                            />
                          </Link>
                        </TD>
                        <TD className="text-fg-muted tnum">
                          {t.usedBy === 1 ? '1 job' : `${t.usedBy} jobs`}
                        </TD>
                        <TD className="text-fg-muted">
                          {formatDate(t.updatedAt)}
                          {t.updatedByName ? ` by ${t.updatedByName}` : ''}
                        </TD>
                        <TD>
                          <RowActions label={`Actions for ${t.name}`}>
                            <MenuItem onSelect={() => router.push(`/settings/templates/${t.id}`)}>
                              Edit
                            </MenuItem>
                            <MenuItem onSelect={() => duplicate.mutate(t.id)}>Duplicate</MenuItem>
                            <MenuItem
                              onSelect={() => archive.mutate({ id: t.id, restore: !!t.archivedAt })}
                            >
                              {t.archivedAt ? 'Restore' : 'Archive'}
                            </MenuItem>
                          </RowActions>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </>
          )}
        </Card>
        <QuestionBank />
      </div>
    </>
  );
}
