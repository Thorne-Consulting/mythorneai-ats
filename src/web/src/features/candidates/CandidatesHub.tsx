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
  Files,
  Layers,
  Pin,
  Plus,
  Sheet,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { useAbility } from '@/lib/ability';
import { Button, Menu, MenuContent, MenuItem, MenuTrigger, PageHeader } from '@/components/ui';
import { SectionNav, SidebarLayout, type SectionGroup } from '@/components/layout/SectionLayout';
import { ManyResumesModal } from '@/features/talent/ManyResumesModal';
import { CreateCandidateModal } from './CreateCandidateModal';
import { ImportCandidatesModal } from './ImportCandidatesModal';
import { STATUS_SEGMENTS, type SavedViewRow, type SegmentCounts } from './candidate-filters';
import { useTalentPools } from './talent-pools';

const STATUS_ICONS = {
  Active: CircleDot,
  Hired: CircleCheck,
  Rejected: CircleX,
  Withdrawn: CircleSlash,
};

/**
 * Candidates: the page header with import and add, and a second sidebar of segments (by status),
 * saved views (yours and the team's) and talent pools, each with a count.
 */
export function CandidatesHub({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [open, setOpen] = useState<'create' | 'csv' | 'resumes' | null>(null);
  const close = () => setOpen(null);
  const ability = useAbility();
  // Talent pools and people in no job belong to whoever keeps the candidate records.
  const staff = ability.can('update', 'Candidate');
  const canAdd = ability.can('create', 'Candidate');
  const canImport = ability.can('import', 'Candidate');
  const savedViews = useQuery({
    queryKey: ['saved-views', 'talent'],
    queryFn: () => api.get<SavedViewRow[]>('/api/saved-views?area=talent'),
    enabled: ability.can('create', 'Application'),
  });
  const pools = useTalentPools(staff);
  const mine = savedViews.data?.filter((view) => view.mine || view.pinned) ?? [];
  const team = savedViews.data?.filter((view) => !view.mine && !view.pinned) ?? [];
  const viewItem = (view: SavedViewRow) => ({
    href: `/candidates/views/${view.id}`,
    label: view.name,
    icon: view.pinned ? Pin : view.shared ? UsersRound : Bookmark,
    count: counts.data?.views[view.id],
  });
  // One call for every segment's count; the list refreshes it after any change to people.
  const counts = useQuery({
    queryKey: ['candidates', 'counts'],
    queryFn: () => api.get<SegmentCounts>('/api/candidates/counts'),
  });

  const groups: SectionGroup[] = [
    {
      items: [
        {
          href: '/candidates',
          label: 'All candidates',
          icon: Users,
          exact: true,
          count: counts.data?.all,
        },
        ...STATUS_SEGMENTS.map(({ slug, status, label, count }) => ({
          href: `/candidates/${slug}`,
          label,
          icon: STATUS_ICONS[status],
          count: counts.data?.[count],
        })),
        ...(staff
          ? [
              {
                href: '/candidates/not-in-a-job',
                label: 'Not in a job',
                icon: UserPlus,
                count: counts.data?.noJob,
              },
            ]
          : []),
      ],
    },
    ...(mine.length ? [{ label: 'Your views', items: mine.map(viewItem) }] : []),
    ...(team.length ? [{ label: 'Team views', items: team.map(viewItem) }] : []),
    ...(staff
      ? [
          {
            label: 'Talent pools',
            items: [
              ...(pools.data ?? []).map((pool) => ({
                href: `/candidates/pools/${pool.id}`,
                label: pool.name,
                icon: Layers,
                count: counts.data?.pools[pool.id] ?? 0,
              })),
              {
                href: '/candidates/talent-pools',
                label: pools.data?.length ? 'All pools' : 'Make a pool',
                icon: pools.data?.length ? UsersRound : Plus,
                exact: true,
              },
            ],
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Candidates"
        actions={
          canAdd && (
            <>
              {canImport && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="secondary" leftIcon={<Download />} rightIcon={<ChevronDown />}>
                      Import candidates
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    {user.aiEnabled && (
                      <MenuItem icon={<Files />} onSelect={() => setOpen('resumes')}>
                        Many resumes
                      </MenuItem>
                    )}
                    <MenuItem icon={<Sheet />} onSelect={() => setOpen('csv')}>
                      Spreadsheet (CSV or Excel)
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
      <SidebarLayout nav={<SectionNav title="Browse" groups={groups} />}>{children}</SidebarLayout>
      <CreateCandidateModal opened={open === 'create'} onClose={close} />
      <ImportCandidatesModal opened={open === 'csv'} onClose={close} />
      <ManyResumesModal opened={open === 'resumes'} onClose={close} />
    </>
  );
}
