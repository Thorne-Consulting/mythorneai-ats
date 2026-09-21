'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  NumberInput,
  Pagination,
  Paper,
  Popover,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconArrowRight,
  IconBookmark,
  IconFileImport,
  IconFileSearch,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { useCurrentUser } from '@/auth';
import { formatDate, initials } from '@/lib/format';
import { rowLinkProps } from '@/lib/row-link-props';
import type { TalentSearchPage as TalentSearchResponse } from '@/types';
import { ResumeImportModal } from './ResumeImportModal';

const SOURCE_OPTIONS = [
  'Direct applicant',
  'Referral',
  'LinkedIn',
  'Job board',
  'Portfolio site',
  'University fair',
  'Resume import',
];

export function TalentSearchPage({ initialData }: { initialData: TalentSearchResponse }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [importOpened, importModal] = useDisclosure();
  const [advancedOpened, advanced] = useDisclosure(false);
  const [saveOpened, savePopover] = useDisclosure(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillMode, setSkillMode] = useState('any');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [minYears, setMinYears] = useState<number | string>('');
  const [hasResume, setHasResume] = useState<string | null>(null);
  const [includeDnc, setIncludeDnc] = useState(false);
  const [sort, setSort] = useState('relevance');
  const [page, setPage] = useState(1);
  const [savedSearches, setSavedSearches] = useState<Record<string, string>>({});
  const [selectedSavedSearch, setSelectedSavedSearch] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const canImport = ['Admin', 'Recruiter'].includes(user.role);
  const activeAdvanced = [
    skills.length > 0,
    title,
    location,
    source,
    minYears !== '',
    hasResume,
    includeDnc,
  ].filter(Boolean).length;

  const params = useMemo(() => {
    const value = new URLSearchParams({
      page: String(page),
      pageSize: '25',
      sort,
      includeDnc: String(includeDnc),
      skillMode,
    });
    if (deferredSearch) value.set('q', deferredSearch);
    if (skills.length > 0) value.set('skills', skills.join(','));
    if (title) value.set('title', title);
    if (location) value.set('location', location);
    if (source) value.set('source', source);
    if (minYears !== '') value.set('minYears', String(minYears));
    if (hasResume) value.set('hasResume', hasResume);
    return value;
  }, [
    deferredSearch,
    hasResume,
    includeDnc,
    location,
    minYears,
    page,
    skillMode,
    skills,
    sort,
    source,
    title,
  ]);
  const pristine =
    page === 1 &&
    sort === 'relevance' &&
    !deferredSearch &&
    skills.length === 0 &&
    !title &&
    !location &&
    !source &&
    minYears === '' &&
    !hasResume &&
    !includeDnc;
  const results = useQuery({
    queryKey: ['talent-search', params.toString()],
    queryFn: () => api.get<TalentSearchResponse>(`/api/talent/search?${params}`),
    initialData: pristine ? initialData : undefined,
  });

  useEffect(() => {
    setSavedSearches(
      JSON.parse(window.localStorage.getItem('ats.savedTalentSearches.v1') ?? '{}') as Record<
        string,
        string
      >,
    );
  }, []);

  const clearFilters = () => {
    setSearch('');
    setSkills([]);
    setSkillMode('any');
    setTitle('');
    setLocation('');
    setSource(null);
    setMinYears('');
    setHasResume(null);
    setIncludeDnc(false);
    setSort('relevance');
    setPage(1);
    setSelectedSavedSearch(null);
  };
  const saveSearch = () => {
    const name = saveName.trim();
    if (!name) return;
    const saved = JSON.parse(
      window.localStorage.getItem('ats.savedTalentSearches.v1') ?? '{}',
    ) as Record<string, string>;
    saved[name] = params.toString();
    window.localStorage.setItem('ats.savedTalentSearches.v1', JSON.stringify(saved));
    setSavedSearches(saved);
    setSelectedSavedSearch(name);
    setSaveName('');
    savePopover.close();
  };
  const loadSavedSearch = (name: string | null) => {
    setSelectedSavedSearch(name);
    if (!name) return;
    const saved = new URLSearchParams(savedSearches[name]);
    setSearch(saved.get('q') ?? '');
    setSkills(
      (saved.get('skills') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    setSkillMode(saved.get('skillMode') === 'all' ? 'all' : 'any');
    setTitle(saved.get('title') ?? '');
    setLocation(saved.get('location') ?? '');
    setSource(saved.get('source'));
    setMinYears(saved.get('minYears') ? Number(saved.get('minYears')) : '');
    setHasResume(saved.get('hasResume'));
    setIncludeDnc(saved.get('includeDnc') === 'true');
    setSort(saved.get('sort') ?? 'relevance');
    setPage(1);
    if (
      saved.has('skills') ||
      saved.has('title') ||
      saved.has('location') ||
      saved.has('source') ||
      saved.has('minYears') ||
      saved.has('hasResume') ||
      saved.get('includeDnc') === 'true'
    )
      advanced.open();
  };

  return (
    <>
      <PageHeader
        title="Talent search"
        description="Search candidate profiles and parsed resumes. Results show evidence, not a hiring recommendation."
        actions={
          canImport && (
            <Button leftSection={<IconFileImport size={17} />} onClick={importModal.open}>
              Import resume
            </Button>
          )
        }
      />

      <Paper withBorder radius="lg" p="md" mb="lg">
        <Stack gap="sm">
          <Group gap="sm" align="flex-end" wrap="wrap">
            <TextInput
              label="Search resumes and profiles"
              placeholder="Try React, platform engineer, or Chicago"
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setPage(1);
              }}
              leftSection={<IconSearch size={16} />}
              style={{ flex: '3 1 360px' }}
            />
            <Select
              label="Sort"
              value={sort}
              onChange={(value) => {
                if (value) setSort(value);
                setPage(1);
              }}
              data={[
                { value: 'relevance', label: 'Best match' },
                { value: 'recent', label: 'Recently updated' },
                { value: 'experience', label: 'Most experience' },
                { value: 'name', label: 'Name' },
              ]}
              w={180}
            />
            <Select
              clearable
              searchable
              label="Saved search"
              placeholder="Choose saved"
              value={selectedSavedSearch}
              onChange={loadSavedSearch}
              data={Object.keys(savedSearches).sort()}
              w={190}
            />
            <Button
              variant={advancedOpened ? 'light' : 'default'}
              leftSection={<IconAdjustmentsHorizontal size={16} />}
              onClick={advanced.toggle}
            >
              Filters
              {activeAdvanced > 0 && (
                <Badge ml={8} size="xs" circle variant="filled">
                  {activeAdvanced}
                </Badge>
              )}
            </Button>
            <Popover
              opened={saveOpened}
              onChange={(nextOpened) => (nextOpened ? savePopover.open() : savePopover.close())}
              position="bottom-end"
              width={280}
              withArrow
              shadow="lg"
            >
              <Popover.Target>
                <Tooltip label="Save this search in this browser">
                  <ActionIcon
                    variant="default"
                    size={36}
                    aria-label="Save current search"
                    onClick={savePopover.toggle}
                  >
                    <IconBookmark size={17} />
                  </ActionIcon>
                </Tooltip>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="sm">
                  <TextInput
                    label="Search name"
                    placeholder="e.g. Chicago React leads"
                    value={saveName}
                    onChange={(event) => setSaveName(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveSearch();
                    }}
                    autoFocus
                  />
                  <Button size="sm" onClick={saveSearch} disabled={!saveName.trim()}>
                    Save search
                  </Button>
                </Stack>
              </Popover.Dropdown>
            </Popover>
          </Group>
          <Collapse in={advancedOpened}>
            <Stack gap="sm" pt="xs">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
                <TagsInput
                  label="Skills"
                  placeholder="Type a skill and press Enter"
                  value={skills}
                  onChange={(value) => {
                    setSkills(value.map((item) => item.toLowerCase()));
                    setPage(1);
                  }}
                />
                <div>
                  <Text size="sm" fw={500} mb={5}>
                    Skill match
                  </Text>
                  <SegmentedControl
                    fullWidth
                    value={skillMode}
                    onChange={(value) => {
                      setSkillMode(value);
                      setPage(1);
                    }}
                    data={[
                      { value: 'any', label: 'Any skill' },
                      { value: 'all', label: 'All skills' },
                    ]}
                  />
                </div>
                <TextInput
                  label="Job title"
                  placeholder="e.g. Staff engineer"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.currentTarget.value);
                    setPage(1);
                  }}
                />
                <TextInput
                  label="Location"
                  placeholder="City, state, or remote"
                  value={location}
                  onChange={(event) => {
                    setLocation(event.currentTarget.value);
                    setPage(1);
                  }}
                />
                <Select
                  clearable
                  searchable
                  label="Source"
                  placeholder="Any source"
                  data={SOURCE_OPTIONS}
                  value={source}
                  onChange={(value) => {
                    setSource(value);
                    setPage(1);
                  }}
                />
                <NumberInput
                  label="Minimum experience"
                  suffix=" years"
                  min={0}
                  max={50}
                  value={minYears}
                  onChange={(value) => {
                    setMinYears(value);
                    setPage(1);
                  }}
                />
                <Select
                  clearable
                  label="Parsed resume"
                  placeholder="Either"
                  value={hasResume}
                  onChange={(value) => {
                    setHasResume(value);
                    setPage(1);
                  }}
                  data={[
                    { value: 'true', label: 'Parsed' },
                    { value: 'false', label: 'Not parsed' },
                  ]}
                />
                <Checkbox
                  label="Include do-not-contact records"
                  checked={includeDnc}
                  onChange={(event) => {
                    setIncludeDnc(event.currentTarget.checked);
                    setPage(1);
                  }}
                  mt={30}
                />
              </SimpleGrid>
              <Group justify="flex-end">
                <Button
                  variant="subtle"
                  color="gray"
                  leftSection={<IconX size={15} />}
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </Group>
            </Stack>
          </Collapse>
        </Stack>
      </Paper>

      {results.isError ? (
        <Alert icon={<IconAlertCircle size={17} />} color="red" title="Search unavailable">
          {results.error.message}
        </Alert>
      ) : !results.data ? (
        <LoadingBlock rows={6} />
      ) : results.data.items.length === 0 ? (
        <EmptyState
          icon={IconFileSearch}
          title="No candidates match"
          description="Broaden a skill or remove a filter to see more people."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      ) : (
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed" aria-live="polite">
              {results.data.total} {results.data.total === 1 ? 'candidate' : 'candidates'} found
            </Text>
            {results.isFetching && (
              <Text size="xs" c="dimmed">
                Updating results…
              </Text>
            )}
          </Group>
          <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={1040}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Candidate</Table.Th>
                    <Table.Th>Match</Table.Th>
                    <Table.Th>Experience</Table.Th>
                    <Table.Th>Skills and evidence</Table.Th>
                    <Table.Th>Source</Table.Th>
                    <Table.Th>Profile</Table.Th>
                    <Table.Th w={48} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {results.data.items.map((candidate) => (
                    <Table.Tr
                      key={candidate.candidateId}
                      {...rowLinkProps(`Open ${candidate.name}`, () =>
                        router.push(`/candidates/${candidate.candidateId}`),
                      )}
                    >
                      <Table.Td>
                        <Group wrap="nowrap">
                          <Avatar color="indigo" variant="light" radius="xl">
                            {initials(candidate.name)}
                          </Avatar>
                          <div>
                            <Group gap="xs">
                              <Text fw={650} size="sm">
                                {candidate.name}
                              </Text>
                              {candidate.doNotContact && (
                                <Badge size="xs" color="red" variant="light">
                                  DNC
                                </Badge>
                              )}
                            </Group>
                            <Text size="xs" c="dimmed">
                              {candidate.currentTitle ?? 'Title not provided'}
                              {candidate.location ? ` · ${candidate.location}` : ''}
                            </Text>
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        {candidate.matchScore ? (
                          <Badge variant="outline" color="indigo">
                            {candidate.matchScore}%
                          </Badge>
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {candidate.experienceYears == null
                            ? 'Not estimated'
                            : `${candidate.experienceYears} years`}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={5} maw={360}>
                          {(candidate.matchedTerms.length > 0
                            ? candidate.matchedTerms
                            : candidate.skills.slice(0, 4)
                          ).map((skill) => (
                            <Badge
                              key={skill}
                              size="xs"
                              variant="light"
                              color={candidate.matchedTerms.includes(skill) ? 'indigo' : 'gray'}
                            >
                              {skill}
                            </Badge>
                          ))}
                          {candidate.skills.length === 0 && (
                            <Text size="sm" c="dimmed">
                              No skills recorded
                            </Text>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{candidate.source}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Badge
                            size="xs"
                            variant="light"
                            color={candidate.hasParsedResume ? 'teal' : 'gray'}
                          >
                            {candidate.hasParsedResume ? 'Resume parsed' : 'Profile only'}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            Updated {formatDate(candidate.updatedAt)}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={`Open ${candidate.name}`}
                        >
                          <IconArrowRight size={17} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
          {results.data.total > results.data.pageSize && (
            <Pagination
              value={page}
              onChange={setPage}
              total={Math.ceil(results.data.total / results.data.pageSize)}
              ml="auto"
            />
          )}
        </Stack>
      )}
      <ResumeImportModal opened={importOpened} onClose={importModal.close} />
    </>
  );
}
