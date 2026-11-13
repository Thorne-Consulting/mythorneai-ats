'use client';

import { useState, type ReactNode } from 'react';
import {
  Bookmark,
  ChevronDown,
  CircleCheck,
  CircleDot,
  CircleSlash,
  CircleX,
  Download,
  FileText,
  History,
  Plus,
  Sheet,
  Users,
  UsersRound,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Badge,
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  PageHeader,
} from '@/components/ui';
import { SectionNav, SidebarLayout, type SectionGroup } from '@/components/layout/SectionLayout';
import { ResumeImportModal } from '@/features/talent/ResumeImportModal';
import { CreateCandidateModal } from './CreateCandidateModal';
import { ImportCandidatesModal } from './ImportCandidatesModal';
import { STATUS_SEGMENTS } from './candidate-filters';

const STATUS_ICONS = {
  Active: CircleDot,
  Hired: CircleCheck,
  Rejected: CircleX,
  Withdrawn: CircleSlash,
};

/**
 * Candidates: the page header with import and add, and a second sidebar of segments (by status,
 * talent pools, recently viewed, the user's saved views) around the list.
 */
export function CandidatesHub({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [open, setOpen] = useState<'create' | 'csv' | 'resume' | null>(null);
  const close = () => setOpen(null);
  const staff = ['Admin', 'Recruiter'].includes(user.role);
  const canImport = staff && (user.permissions.includes('import') || user.role === 'Admin');
  const savedViews = useQuery({
    queryKey: ['saved-views', 'talent'],
    queryFn: () =>
      api.get<{ id: string; name: string; paramsJson: string }[]>('/api/saved-views?area=talent'),
    enabled: staff,
  });

  const groups: SectionGroup[] = [
    {
      items: [
        { href: '/candidates', label: 'All candidates', icon: Users, exact: true },
        ...STATUS_SEGMENTS.map(({ slug, status }) => ({
          href: `/candidates/${slug}`,
          label: status,
          icon: STATUS_ICONS[status],
        })),
      ],
    },
    {
      label: 'Lists',
      items: [
        {
          href: '/candidates/talent-pools',
          label: 'Talent pools',
          icon: UsersRound,
          badge: (
            <Badge tone="amber" size="sm">
              Preview
            </Badge>
          ),
        },
        { href: '/candidates/recent', label: 'Recently viewed', icon: History },
      ],
    },
    ...(savedViews.data?.length
      ? [
          {
            label: 'Saved views',
            items: savedViews.data.map((view) => ({
              href: `/candidates/views/${view.id}`,
              label: view.name,
              icon: Bookmark,
            })),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Candidates"
        description="Your talent, all in one place. Discover, review, and move great people forward."
        actions={
          staff && (
            <>
              {canImport && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="secondary" leftIcon={<Download />} rightIcon={<ChevronDown />}>
                      Import candidates
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem icon={<FileText />} onSelect={() => setOpen('resume')}>
                      From a resume
                    </MenuItem>
                    <MenuItem icon={<Sheet />} onSelect={() => setOpen('csv')}>
                      From a CSV file
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
              <Button leftIcon={<Plus />} onClick={() => setOpen('create')}>
                Add candidate
              </Button>
            </>
          )
        }
      />
      <SidebarLayout nav={<SectionNav title="Segments" groups={groups} />}>
        {children}
      </SidebarLayout>
      <CreateCandidateModal opened={open === 'create'} onClose={close} />
      <ImportCandidatesModal opened={open === 'csv'} onClose={close} />
      <ResumeImportModal opened={open === 'resume'} onClose={close} />
    </>
  );
}
