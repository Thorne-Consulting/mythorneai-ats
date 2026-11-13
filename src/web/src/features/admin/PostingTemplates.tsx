'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';

type Template = { id: string; name: string; version: number };

export function PostingTemplates() {
  const templates = useQuery({
    queryKey: ['posting-templates'],
    queryFn: () => api.get<Template[]>('/api/posting-templates'),
  });
  const newButton = (
    <Button asChild>
      <Link href="/admin/templates/new">
        <Plus className="size-4" aria-hidden />
        New template
      </Link>
    </Button>
  );

  return (
    <Card>
      <CardHeader
        title="Templates"
        description="Pick one when you create a job and its sections are filled in for you."
        action={newButton}
      />
      {!templates.data ? (
        <SkeletonRows rows={3} />
      ) : templates.data.length === 0 ? (
        <EmptyState
          compact
          icon={FileText}
          title="No posting templates yet"
          description="Save the company intro, benefits and interview stages once, and reuse them on every job."
          action={newButton}
        />
      ) : (
        <div className="px-5 pb-3">
          <Table className="min-w-[520px]">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Version</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {templates.data.map((template) => (
                <TR key={template.id}>
                  <TD className="font-medium">{template.name}</TD>
                  <TD className="text-fg-muted tnum">v{template.version}</TD>
                  <TD>
                    <Badge dot tone="green">
                      Ready to use
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
