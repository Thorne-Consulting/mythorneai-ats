'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Collapse,
  Group,
  NumberInput,
  Pagination,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconBookmark,
  IconFileSearch,
  IconSearch,
  IconSparkles,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDate, formatRelative } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import type { CandidateDetail, TalentSearchPage as TalentSearchResponse } from '@/types';

const SOURCE_OPTIONS = [
  'Direct applicant',
  'Referral',
  'LinkedIn',
  'Job board',
  'Portfolio site',
  'University fair',
  'Resume import',
];

type Person = TalentSearchResponse['items'][number];

export function ProfileSearch({ initialData }: { initialData: TalentSearchResponse }) {
  const router = useRouter();
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
  const [aiQuery, setAiQuery] = useState('');
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
  const aiSearch = useMutation({
    mutationFn: () =>
      api.post<{
        q?: string;
        skills: string[];
        skillMode: 'any' | 'all';
        title?: string;
        location?: string;
        minYears?: number;
      }>('/api/ai/search-filters', { query: aiQuery }),
    onSuccess: (filters) => {
      setSearch(filters.q ?? '');
      setSkills(filters.skills ?? []);
      setSkillMode(filters.skillMode ?? 'any');
      setTitle(filters.title ?? '');
      setLocation(filters.location ?? '');
      setMinYears(filters.minYears ?? '');
      setPage(1);
      advanced.open();
    },
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

  const [previewId, setPreviewId] = useState<string | null>(null);
  const items = results.data?.items ?? [];
  const preview = items.find((item) => item.candidateId === previewId) ?? items[0];
  // The search row is a summary; the panel loads the whole record for the selected person.
  const detailQuery = useQuery({
    queryKey: ['candidate', preview?.candidateId],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${preview!.candidateId}`),
    enabled: Boolean(preview),
  });
  const detail = detailQuery.data?.id === preview?.candidateId ? detailQuery.data : undefined;
  const linkedIn = safeWebUrl(detail?.linkedInUrl);
  const detailState = detailQuery.isError ? (
    <Text size="sm" c="red" mt="md">
      Could not load the full record.
    </Text>
  ) : !detail ? (
    <LoadingBlock rows={3} />
  ) : null;
  const panelActions = preview && (
    <>
      <Button onClick={() => router.push(`/candidates/${preview.candidateId}`)}>
        Open profile
      </Button>
      <Button
        variant="default"
        onClick={() => {
          navigator.clipboard.writeText(preview.email);
          notifications.show({ message: `Copied ${preview.email}` });
        }}
      >
        Copy email
      </Button>
    </>
  );
  const total = results.data?.total ?? 0;
  const countLabel = `${total} ${total === 1 ? 'candidate' : 'candidates'}`;
  // Skills that matched the search come first, in bold.
  const skillText = (candidate: Person, limit: number) => {
    const matched = candidate.matchedTerms.filter((term) => candidate.skills.includes(term));
    const rest = candidate.skills.filter((skill) => !matched.includes(skill));
    const list = [...matched, ...rest].slice(0, limit);
    return list.map((skill, index) => (
      <span key={skill}>
        {index > 0 && ', '}
        {matched.includes(skill) ? <b>{skill}</b> : skill}
      </span>
    ));
  };
  const searchBox = (
    <TextInput
      aria-label="Search resumes and profiles"
      placeholder="Search resumes and profiles"
      value={search}
      onChange={(event) => {
        setSearch(event.currentTarget.value);
        setPage(1);
      }}
      leftSection={<IconSearch size={16} />}
    />
  );
  const describeBox = (
    <TextInput
      aria-label="Describe the candidate you need"
      placeholder="Describe who you need, and let AI set the filters"
      value={aiQuery}
      onChange={(event) => setAiQuery(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && aiQuery.trim()) aiSearch.mutate();
      }}
      rightSectionWidth={36}
      rightSection={
        <ActionIcon
          variant="subtle"
          aria-label="Apply AI filters"
          loading={aiSearch.isPending}
          disabled={!aiQuery.trim()}
          onClick={() => aiSearch.mutate()}
        >
          <IconSparkles size={16} />
        </ActionIcon>
      }
    />
  );
  const sortPicker = (
    <Select
      aria-label="Sort"
      value={sort}
      allowDeselect={false}
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
      w={170}
    />
  );
  const savedPicker = (
    <Select
      clearable
      searchable
      label="Saved search"
      placeholder="Choose saved"
      value={selectedSavedSearch}
      onChange={loadSavedSearch}
      data={Object.keys(savedSearches).sort()}
    />
  );
  const saveButton = (
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
  );
  const filterFields = (
    <>
      <TagsInput
        label="Skills"
        placeholder="Type a skill and press Enter"
        value={skills}
        onChange={(value) => {
          setSkills(value.map((item) => item.toLowerCase()));
          setPage(1);
        }}
      />
      <SegmentedControl
        aria-label="Skill match"
        size="xs"
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
        label="Include do-not-contact"
        checked={includeDnc}
        onChange={(event) => {
          setIncludeDnc(event.currentTarget.checked);
          setPage(1);
        }}
      />
    </>
  );
  const resultState = results.isError ? (
    <Alert icon={<IconAlertCircle size={17} />} color="red" title="Search unavailable">
      {results.error.message}
    </Alert>
  ) : !results.data ? (
    <LoadingBlock rows={6} />
  ) : items.length === 0 ? (
    <EmptyState
      icon={IconFileSearch}
      title="No candidates match"
      actionLabel="Clear filters"
      onAction={clearFilters}
    />
  ) : null;
  const pager = results.data && results.data.total > results.data.pageSize && (
    <Group justify="flex-end" mt="md">
      <Pagination
        value={page}
        onChange={setPage}
        total={Math.ceil(results.data.total / results.data.pageSize)}
        size="sm"
      />
    </Group>
  );

  return (
    <>
      <div>
        <div className="people-bar">
          <div style={{ flex: '2 1 280px' }}>{searchBox}</div>
          <div style={{ flex: '2 1 280px' }}>{describeBox}</div>
          {sortPicker}
          <Button
            variant={advancedOpened ? 'light' : 'default'}
            leftSection={<IconAdjustmentsHorizontal size={16} />}
            onClick={advanced.toggle}
          >
            Filters{activeAdvanced > 0 ? ` (${activeAdvanced})` : ''}
          </Button>
          {saveButton}
        </div>
        <Collapse in={advancedOpened}>
          <div
            className="people-filters"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}
          >
            {filterFields}
            {savedPicker}
          </div>
        </Collapse>
        {resultState ?? (
          <div className="people">
            <div>
              <Text size="sm" fw={650} mb={6} aria-live="polite">
                {countLabel}
              </Text>
              <div className="people-list">
                {items.map((candidate) => (
                  <div
                    key={candidate.candidateId}
                    className="people-item"
                    role="button"
                    tabIndex={0}
                    data-active={preview?.candidateId === candidate.candidateId || undefined}
                    onClick={() => setPreviewId(candidate.candidateId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setPreviewId(candidate.candidateId);
                      }
                    }}
                    onDoubleClick={() => router.push(`/candidates/${candidate.candidateId}`)}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span className="people-name">{candidate.name}</span>
                      <span className="people-sub">
                        {[candidate.currentTitle, candidate.location].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="people-num">
                      {candidate.matchScore
                        ? `${candidate.matchScore}%`
                        : candidate.experienceYears != null
                          ? `${candidate.experienceYears} yrs`
                          : ''}
                    </span>
                  </div>
                ))}
              </div>
              {pager}
            </div>
            {preview && (
              <aside className="people-panel" aria-label={`About ${preview.name}`}>
                <h3 className="people-pname">{preview.name}</h3>
                <p className="people-prole">
                  {[preview.currentTitle ?? 'No title on file', preview.location]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {detailState}
                {detail && (
                  <>
                    <div className="people-stats">
                      <span>
                        <b>{detail.resumeYearsExperience ?? '–'}</b>
                        <span>years</span>
                      </span>
                      <span>
                        <b>{detail.applications.filter((app) => app.status === 'Active').length}</b>
                        <span>active</span>
                      </span>
                      <span>
                        <b>{detail.attachments.length}</b>
                        <span>{detail.attachments.length === 1 ? 'file' : 'files'}</span>
                      </span>
                    </div>
                    <h4 className="people-h">Where they are</h4>
                    {detail.applications.length === 0 ? (
                      <p className="people-text">Not applied to any job yet.</p>
                    ) : (
                      <ul className="people-where">
                        {detail.applications.map((app) => (
                          <li key={app.id} data-closed={app.status !== 'Active' || undefined}>
                            <a href={`/applications/${app.id}`}>{app.requisitionTitle}</a>
                            <span className="people-sub">
                              {app.requisitionCode} · {app.stage}
                              {app.status !== 'Active' ? ` · ${app.status}` : ''}
                            </span>
                            <span className="people-sub">
                              Applied {formatDate(app.appliedAt)} · active{' '}
                              {formatRelative(app.lastActivityAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <h4 className="people-h">Highlights</h4>
                    <p className="people-text">
                      {detail.resumeSummary ?? 'No resume summary yet.'}
                    </p>
                    {preview.skills.length > 0 && (
                      <p className="people-text people-text-more">{skillText(preview, 30)}</p>
                    )}
                    {(detail.resumeJobTitles.length > 0 ||
                      detail.resumeEducation.length > 0 ||
                      detail.resumeCertifications.length > 0 ||
                      detail.resumeLanguages.length > 0) && (
                      <>
                        <h4 className="people-h">Background</h4>
                        <div className="people-lines">
                          {detail.resumeJobTitles.length > 0 && (
                            <p className="people-text">
                              <span className="people-label">Past roles</span>
                              {detail.resumeJobTitles.slice(0, 5).join('; ')}
                            </p>
                          )}
                          {detail.resumeEducation.length > 0 && (
                            <p className="people-text">
                              <span className="people-label">Education</span>
                              {detail.resumeEducation.join('; ')}
                            </p>
                          )}
                          {detail.resumeCertifications.length > 0 && (
                            <p className="people-text">
                              <span className="people-label">Certifications</span>
                              {detail.resumeCertifications.join(', ')}
                            </p>
                          )}
                          {detail.resumeLanguages.length > 0 && (
                            <p className="people-text">
                              <span className="people-label">Languages</span>
                              {detail.resumeLanguages.join(', ')}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                    {detail.attachments.length > 0 && (
                      <>
                        <h4 className="people-h">Files</h4>
                        <ul className="people-files">
                          {detail.attachments.map((file) => (
                            <li key={file.id}>
                              {file.originalFileName}
                              <span className="people-sub">
                                Uploaded {formatRelative(file.uploadedAt)} ·{' '}
                                {file.parseStatus === 'Parsed' || file.parsedAt
                                  ? 'read'
                                  : file.parseError
                                    ? 'could not be read'
                                    : 'not read yet'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <div className="people-contact">
                      <a href={`mailto:${preview.email}`}>{preview.email}</a>
                      {detail.phone && <> · {detail.phone}</>}
                      {linkedIn && (
                        <>
                          {' · '}
                          <a href={linkedIn} target="_blank" rel="noopener noreferrer">
                            LinkedIn
                          </a>
                        </>
                      )}
                      <br />
                      <span className="people-sub">
                        From {detail.source}
                        {detail.tags.length ? ` · ${detail.tags.join(', ')}` : ''}
                        {preview.doNotContact ? ' · Do not contact' : ''}
                      </span>
                      <span className="people-sub">
                        Added {formatDate(detail.createdAt)} · updated{' '}
                        {formatRelative(detail.updatedAt)}
                        {detail.resumeParsedAt
                          ? ` · resume read ${formatRelative(detail.resumeParsedAt)}`
                          : ''}
                      </span>
                    </div>
                  </>
                )}
                <Group gap="sm" mt="md">
                  {panelActions}
                </Group>
              </aside>
            )}
          </div>
        )}
      </div>
    </>
  );
}
