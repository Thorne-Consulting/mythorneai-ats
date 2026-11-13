'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus } from 'lucide-react';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CellStack,
  ConfirmDialog,
  EmptyState,
  FilterSelect,
  MenuItem,
  RowActions,
  SearchInput,
  SectionTitle,
  toast,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { templateCategories, type MessageTemplate } from '../sample-messages';
import { useMessages } from './MessagesShell';
import { variablesIn } from './template-vars';

const formatWhen = (v: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(v),
  );

export function TemplatesPage() {
  const router = useRouter();
  const { templates, setTemplates, ready } = useMessages();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MessageTemplate | null>(null);
  const q = search.trim().toLowerCase();
  const rows = templates.filter(
    (t) =>
      (!category || t.category === category) &&
      (!q || `${t.name} ${t.subject} ${t.body}`.toLowerCase().includes(q)),
  );
  const duplicate = (t: MessageTemplate) => {
    setTemplates((list) => [
      {
        ...t,
        id: crypto.randomUUID(),
        name: `${t.name} (copy)`,
        updatedAt: new Date().toISOString().slice(0, 16),
      },
      ...list,
    ]);
    toast.success('Template duplicated', t.name);
  };
  const columns: Column<MessageTemplate>[] = [
    {
      id: 'name',
      header: 'Template',
      hideable: false,
      sortValue: (t) => t.name,
      csv: (t) => t.name,
      cell: (t) => <CellStack primary={t.name} secondary={t.subject} />,
    },
    {
      id: 'category',
      header: 'Category',
      sortValue: (t) => t.category,
      cell: (t) => <Badge>{t.category}</Badge>,
    },
    {
      id: 'variables',
      header: 'Variables',
      csv: (t) => variablesIn(`${t.subject} ${t.body}`).join(' '),
      cell: (t) => {
        const vars = variablesIn(`${t.subject} ${t.body}`);
        return (
          <span className="text-fg-muted">
            {vars.length
              ? vars.slice(0, 3).join(', ') + (vars.length > 3 ? ` +${vars.length - 3}` : '')
              : 'None'}
          </span>
        );
      },
    },
    {
      id: 'updated',
      header: 'Last edited',
      sortValue: (t) => t.updatedAt,
      cell: (t) => (
        <span className="whitespace-nowrap text-fg-muted">{formatWhen(t.updatedAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      hideable: false,
      cell: (t) => (
        <RowActions label={`Actions for ${t.name}`}>
          <MenuItem onSelect={() => router.push(`/messages/templates/${t.id}`)}>Edit</MenuItem>
          <MenuItem onSelect={() => duplicate(t)}>Duplicate</MenuItem>
          <MenuItem danger onSelect={() => setDeleting(t)}>
            Delete
          </MenuItem>
        </RowActions>
      ),
    },
  ];
  return (
    <>
      <Breadcrumbs
        items={[{ label: 'Messages', href: '/messages' }, { label: 'Templates' }]}
        className="mb-1.5"
      />
      <SectionTitle
        title="Templates"
        description="Reusable messages. Variables like {{first_name}} fill in from the candidate."
        action={
          <Button leftIcon={<Plus />} onClick={() => router.push('/messages/templates/new')}>
            New template
          </Button>
        }
        className="mb-4"
      />
      <Card className="px-5 pb-2">
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(t) => t.id}
          viewKey="message-templates"
          exportName="message-templates"
          noun="template"
          loading={!ready}
          onRowOpen={(t) => router.push(`/messages/templates/${t.id}`)}
          rowLabel={(t) => `Edit ${t.name}`}
          toolbar={
            <>
              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder="Search templates"
                className="w-full sm:w-64"
              />
              <FilterSelect
                value={category}
                onChange={setCategory}
                data={templateCategories}
                allLabel="All categories"
              />
            </>
          }
          empty={
            <EmptyState
              compact
              icon={FileText}
              title={q || category ? 'No matches' : 'No templates yet'}
              description={
                q || category ? 'Try another search or category.' : 'Save messages you send often.'
              }
              action={
                !q &&
                !category && (
                  <Button
                    size="sm"
                    leftIcon={<Plus />}
                    onClick={() => router.push('/messages/templates/new')}
                  >
                    New template
                  </Button>
                )
              }
            />
          }
        />
      </Card>
      <ConfirmDialog
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this template?"
        message={
          deleting &&
          `"${deleting.name}" is removed for you. Messages already sent are not affected.`
        }
        confirmLabel="Delete template"
        onConfirm={() => {
          if (!deleting) return;
          setTemplates((list) => list.filter((t) => t.id !== deleting.id));
          toast.success('Template deleted', deleting.name);
        }}
      />
    </>
  );
}
