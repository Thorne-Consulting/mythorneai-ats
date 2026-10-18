'use client';

import type { ReactNode } from 'react';
import { Button, Menu } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconFileImport, IconPlus, IconUpload } from '@tabler/icons-react';
import { useCurrentUser } from '@/auth';
import { PageHeader } from '@/components/ui/PageHeaders';
import { ResumeImportModal } from '@/features/talent/ResumeImportModal';
import { CreateCandidateModal } from './CreateCandidateModal';
import { ImportCandidatesModal } from './ImportCandidatesModal';

/** Candidates: the page header with import and add, around the one list of everyone. */
export function CandidatesHub({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [createOpened, create] = useDisclosure();
  const [csvOpened, csv] = useDisclosure();
  const [resumeOpened, resume] = useDisclosure();
  const staff = ['Admin', 'Recruiter'].includes(user.role);
  const canImport = staff && (user.permissions.includes('import') || user.role === 'Admin');

  return (
    <>
      <PageHeader
        title="Candidates"
        actions={
          staff && (
            <>
              {canImport && (
                <Menu position="bottom-end" width={220}>
                  <Menu.Target>
                    <Button variant="default" rightSection={<IconChevronDown size={15} />}>
                      Import
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconFileImport size={16} />} onClick={resume.open}>
                      From a resume
                    </Menu.Item>
                    <Menu.Item leftSection={<IconUpload size={16} />} onClick={csv.open}>
                      From a CSV file
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
              <Button leftSection={<IconPlus size={16} />} onClick={create.open}>
                Add candidate
              </Button>
            </>
          )
        }
      />
      <div className="candidates-hub">{children}</div>
      <CreateCandidateModal opened={createOpened} onClose={create.close} />
      <ImportCandidatesModal opened={csvOpened} onClose={csv.close} />
      <ResumeImportModal opened={resumeOpened} onClose={resume.close} />
    </>
  );
}
