'use client';

import { useState } from 'react';
import { Button, SegmentedControl } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconFileImport } from '@tabler/icons-react';
import { useCurrentUser } from '@/auth';
import { PageHeader } from '@/components/ui/PageHeaders';
import type { TalentSearchPage as TalentSearchResponse } from '@/types';
import { ProfileSearch } from './ProfileSearch';
import { RankForJob } from './RankForJob';
import { ResumeImportModal } from './ResumeImportModal';

export function TalentSearchPage({
  initialData,
  initialJobId,
  highlightId,
}: {
  initialData: TalentSearchResponse;
  initialJobId?: string;
  highlightId?: string;
}) {
  const user = useCurrentUser();
  const [importOpened, importModal] = useDisclosure();
  const [mode, setMode] = useState('rank');
  const canImport = ['Admin', 'Recruiter'].includes(user.role);

  return (
    <>
      <PageHeader
        title="Talent search"
        description="Find people already in your database. Rank them for a job, or search profiles and resumes directly."
        actions={
          canImport && (
            <Button leftSection={<IconFileImport size={17} />} onClick={importModal.open}>
              Import resume
            </Button>
          )
        }
      />
      <SegmentedControl
        mb="lg"
        value={mode}
        onChange={setMode}
        aria-label="Search mode"
        data={[
          { value: 'rank', label: 'Rank for a job' },
          { value: 'search', label: 'Search profiles' },
        ]}
      />
      {mode === 'rank' ? (
        <RankForJob initialJobId={initialJobId} highlightId={highlightId} />
      ) : (
        <ProfileSearch initialData={initialData} />
      )}
      <ResumeImportModal opened={importOpened} onClose={importModal.close} />
    </>
  );
}
