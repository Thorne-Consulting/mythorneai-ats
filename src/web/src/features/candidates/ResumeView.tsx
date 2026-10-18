'use client';

import type { ReactNode } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Code,
  Grid,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconRefresh, IconSparkles } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDate } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import type { ResumeProfile } from '@/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function when(year?: number | null, month?: number | null) {
  if (!year) return null;
  return month ? `${MONTHS[month - 1]} ${year}` : String(year);
}

function span(item: {
  startYear?: number | null;
  startMonth?: number | null;
  endYear?: number | null;
  endMonth?: number | null;
  isCurrent: boolean;
}) {
  const start = when(item.startYear, item.startMonth);
  const end = item.isCurrent ? 'Present' : when(item.endYear, item.endMonth);
  if (!start && !end) return null;
  return `${start ?? '?'} – ${end ?? '?'}`;
}

function duration(months?: number | null) {
  if (!months) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} yr${years === 1 ? '' : 's'}` : null, rest ? `${rest} mo` : null]
    .filter(Boolean)
    .join(' ');
}

/** The amber mark: the model wrote this, but we could not find it in the document. */
function Unverified() {
  return (
    <Tooltip label="Not found in the document. Check the original.">
      <Badge
        size="xs"
        color="yellow"
        variant="light"
        leftSection={<IconAlertTriangle size={11} />}
        style={{ cursor: 'help' }}
      >
        Not in document
      </Badge>
    </Tooltip>
  );
}

/** Values the model judged rather than copied: seniority, type, degree level. */
function Inferred({ children }: { children: ReactNode }) {
  return (
    <Tooltip label="Inferred by the model, not stated in the resume">
      <Badge size="xs" variant="outline" color="gray" style={{ cursor: 'help' }}>
        {children}
      </Badge>
    </Tooltip>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={8} style={{ letterSpacing: 0.5 }}>
        {title}
      </Text>
      {children}
    </div>
  );
}

function pretty(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function ResumeView({
  candidateId,
  canReparse,
}: {
  candidateId: string;
  canReparse: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['candidate-resume', candidateId],
    queryFn: () => api.get<ResumeProfile>(`/api/candidates/${candidateId}/resume`),
    refetchInterval: (result) =>
      result.state.data?.attachment?.parseStatus === 'Pending' ||
      result.state.data?.attachment?.parseStatus === 'Processing'
        ? 2_000
        : false,
  });
  const reparse = useMutation({
    mutationFn: (attachmentId: string) =>
      api.post(`/api/candidates/${candidateId}/attachments/${attachmentId}/parse`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-resume', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      notifications.show({ color: 'teal', message: 'Re-parse queued' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  if (query.isError)
    return (
      <Text c="red" size="sm">
        Could not load the resume.
      </Text>
    );
  if (!query.data) return <LoadingBlock rows={6} />;
  const profile = query.data;
  const attachment = profile.attachment;
  const isPdf = attachment?.contentType === 'application/pdf';
  const parsing = attachment?.parseStatus === 'Pending' || attachment?.parseStatus === 'Processing';

  if (!attachment)
    return (
      <Paper withBorder radius="lg" p="lg">
        <Text size="sm" c="dimmed">
          No resume has been uploaded for this candidate.
        </Text>
      </Paper>
    );

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Text size="sm" fw={600}>
            {attachment.originalFileName}
          </Text>
          {parsing ? (
            <Badge variant="light" color="blue">
              Parsing…
            </Badge>
          ) : attachment.parseStatus === 'Parsed' ? (
            <Badge variant="light" color="teal">
              Parsed {profile.parsedAt ? formatDate(profile.parsedAt) : ''}
            </Badge>
          ) : attachment.parseStatus === 'NeedsOcr' ? (
            <Badge variant="light" color="orange">
              Needs OCR
            </Badge>
          ) : (
            <Badge variant="light" color="red">
              Not parsed
            </Badge>
          )}
          {profile.model && (
            <Text size="xs" c="dimmed">
              {profile.model} · prompt {profile.promptVersion}
            </Text>
          )}
        </Group>
        {canReparse && (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconRefresh size={14} />}
            loading={reparse.isPending || parsing}
            onClick={() => reparse.mutate(attachment.id)}
          >
            Re-parse
          </Button>
        )}
      </Group>
      {attachment.parseError && (
        <Text size="sm" c="orange">
          {attachment.parseError}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        The parsed profile is read-only and comes only from the resume. To change it, re-parse or
        upload a corrected resume.
      </Text>

      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Paper withBorder radius="lg" style={{ overflow: 'hidden', height: '80vh' }}>
            {isPdf ? (
              <iframe
                title={`Original ${attachment.originalFileName}`}
                src={`/api/attachments/${attachment.id}?inline=true`}
                style={{ width: '100%', height: '100%', border: 0 }}
              />
            ) : (
              <Stack p="lg" gap="xs">
                <Text size="sm">Word documents can't be shown here yet.</Text>
                <Anchor size="sm" href={`/api/attachments/${attachment.id}`}>
                  Download {attachment.originalFileName}
                </Anchor>
                <Text size="xs" c="dimmed">
                  The Text tab shows what was read from it.
                </Text>
              </Stack>
            )}
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Paper withBorder radius="lg" p="lg" style={{ height: '80vh', overflowY: 'auto' }}>
            <Tabs defaultValue="parsed" keepMounted={false}>
              <Tabs.List mb="md">
                <Tabs.Tab value="parsed">Parsed</Tabs.Tab>
                <Tabs.Tab value="text">Text</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="parsed">
                <Parsed profile={profile} />
              </Tabs.Panel>
              <Tabs.Panel value="text">
                {profile.resumeText ? (
                  <Code block style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                    {profile.resumeText}
                  </Code>
                ) : (
                  <Text size="sm" c="dimmed">
                    No text has been read from this file.
                  </Text>
                )}
              </Tabs.Panel>
            </Tabs>
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function Parsed({ profile }: { profile: ResumeProfile }) {
  if (!profile.parsedAt)
    return (
      <Text size="sm" c="dimmed">
        Nothing parsed yet.
      </Text>
    );
  const place = [profile.city, profile.region, profile.country].filter(Boolean).join(', ');
  const links = [
    ['LinkedIn', profile.linkedInUrl],
    ['GitHub', profile.gitHubUrl],
    ['Portfolio', profile.portfolioUrl],
    ...profile.otherUrls.map((url) => ['Link', url] as const),
  ].filter(([, url]) => safeWebUrl(url ?? undefined));
  const skillsByCategory = Object.entries(
    profile.skills.reduce<Record<string, ResumeProfile['skills']>>((groups, skill) => {
      (groups[skill.category] ??= []).push(skill);
      return groups;
    }, {}),
  );

  return (
    <Stack gap="lg">
      <div>
        <Text fw={700} size="lg">
          {profile.name}
        </Text>
        <Text size="sm" c="dimmed">
          {[profile.currentTitle, profile.currentEmployer].filter(Boolean).join(' · ')}
        </Text>
        <Group gap="xs" mt={6} wrap="wrap">
          {profile.email && <Text size="sm">{profile.email}</Text>}
          {profile.phone && <Text size="sm">{profile.phone}</Text>}
          {place && <Text size="sm">{place}</Text>}
          {links.map(([label, url]) => (
            <Anchor
              key={url}
              size="sm"
              href={safeWebUrl(url ?? undefined)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </Anchor>
          ))}
        </Group>
        <Group gap={6} mt={8}>
          {profile.seniority !== 'Unknown' && <Inferred>{profile.seniority}</Inferred>}
          {profile.yearsExperience != null && (
            <Badge size="xs" variant="light" color="gray">
              {profile.yearsExperience} yrs experience
            </Badge>
          )}
          {profile.yearsManagement ? (
            <Badge size="xs" variant="light" color="gray">
              {profile.yearsManagement} yrs managing
            </Badge>
          ) : null}
          {profile.highestDegreeLevel !== 'Unknown' && (
            <Inferred>{pretty(profile.highestDegreeLevel)}</Inferred>
          )}
          {profile.openToRemote && (
            <Badge size="xs" variant="light" color="gray">
              Open to remote
            </Badge>
          )}
          {profile.willingToRelocate && (
            <Badge size="xs" variant="light" color="gray">
              Will relocate
            </Badge>
          )}
        </Group>
      </div>

      {profile.summary && (
        <Section title="Summary">
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {profile.summary}
          </Text>
        </Section>
      )}

      {profile.work.length > 0 && (
        <Section title="Experience">
          <Stack gap="md">
            {profile.work.map((job) => (
              <div key={job.id}>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Group gap={6} wrap="wrap">
                      <Text size="sm" fw={650}>
                        {job.title || 'Untitled role'}
                      </Text>
                      {!job.verified && <Unverified />}
                    </Group>
                    <Text size="sm">
                      {job.company}
                      {[job.city, job.region].filter(Boolean).length > 0 &&
                        ` · ${[job.city, job.region].filter(Boolean).join(', ')}`}
                      {job.isRemote && ' · Remote'}
                    </Text>
                  </div>
                  <Text size="xs" c="dimmed" ta="right" style={{ whiteSpace: 'nowrap' }}>
                    {span(job)}
                    {duration(job.durationMonths) && <br />}
                    {duration(job.durationMonths)}
                  </Text>
                </Group>
                <Group gap={6} mt={4}>
                  {job.seniority !== 'Unknown' && <Inferred>{job.seniority}</Inferred>}
                  {job.employmentType !== 'Unknown' && (
                    <Inferred>{pretty(job.employmentType)}</Inferred>
                  )}
                  {job.managedPeople ? (
                    <Badge size="xs" variant="light" color="gray">
                      Managed {job.managedPeople}
                    </Badge>
                  ) : null}
                </Group>
                {job.bullets.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {job.bullets.map((bullet, index) => (
                      <li key={index}>
                        <Text size="sm">{bullet}</Text>
                      </li>
                    ))}
                  </ul>
                )}
                {job.skills.length > 0 && (
                  <Group gap={4} mt={6}>
                    {job.skills.map((skill) => (
                      <Badge key={skill} size="xs" variant="light" color="gray">
                        {skill}
                      </Badge>
                    ))}
                  </Group>
                )}
              </div>
            ))}
          </Stack>
        </Section>
      )}

      {profile.education.length > 0 && (
        <Section title="Education">
          <Stack gap="sm">
            {profile.education.map((entry) => (
              <div key={entry.id}>
                <Group gap={6} wrap="wrap">
                  <Text size="sm" fw={650}>
                    {[entry.degree, entry.field].filter(Boolean).join(', ') || 'Program'}
                  </Text>
                  {!entry.verified && <Unverified />}
                </Group>
                <Text size="sm">
                  {entry.school}
                  {(entry.startYear || entry.endYear) &&
                    ` · ${[
                      entry.startYear,
                      entry.endYear
                        ? `${entry.isInProgress ? 'expected ' : ''}${entry.endYear}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' – ')}`}
                </Text>
                <Group gap={6} mt={4}>
                  {entry.degreeLevel !== 'Unknown' && (
                    <Inferred>{pretty(entry.degreeLevel)}</Inferred>
                  )}
                  {entry.fieldNormalized !== 'Unknown' && (
                    <Inferred>{pretty(entry.fieldNormalized)}</Inferred>
                  )}
                  {entry.gpa != null && (
                    <Badge size="xs" variant="light" color="gray">
                      GPA {entry.gpa}
                      {entry.gpaScale ? ` / ${entry.gpaScale}` : ''}
                    </Badge>
                  )}
                  {entry.honors && (
                    <Badge size="xs" variant="light" color="gray">
                      {entry.honors}
                    </Badge>
                  )}
                </Group>
              </div>
            ))}
          </Stack>
        </Section>
      )}

      {skillsByCategory.length > 0 && (
        <Section title="Skills">
          <Stack gap={8}>
            {skillsByCategory.map(([category, skills]) => (
              <Group key={category} gap={4} align="center">
                <Text size="xs" c="dimmed" w={90}>
                  {pretty(category)}
                </Text>
                {skills.map((skill) => (
                  <Tooltip
                    key={skill.name}
                    label={[
                      skill.source === 'Both'
                        ? 'In the skills section and a job'
                        : skill.source === 'JobDescription'
                          ? 'Mentioned in a job'
                          : 'In the skills section',
                      skill.yearsUsed ? `${skill.yearsUsed} yrs` : null,
                      skill.lastUsedYear ? `last ${skill.lastUsedYear}` : null,
                      skill.verified ? null : 'Not found in the document',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    <Badge
                      size="sm"
                      variant="light"
                      color={skill.verified ? 'gray' : 'yellow'}
                      style={{ cursor: 'help', textTransform: 'none' }}
                    >
                      {skill.name}
                    </Badge>
                  </Tooltip>
                ))}
              </Group>
            ))}
          </Stack>
        </Section>
      )}

      {profile.certifications.length > 0 && (
        <Section title="Certifications">
          <Stack gap={4}>
            {profile.certifications.map((item) => (
              <Group key={item.id} gap={6} wrap="wrap">
                <Text size="sm">
                  {item.name}
                  {item.issuer && ` · ${item.issuer}`}
                  {item.year && ` · ${item.year}`}
                </Text>
                {!item.verified && <Unverified />}
              </Group>
            ))}
          </Stack>
        </Section>
      )}

      {profile.languages.length > 0 && (
        <Section title="Languages">
          <Group gap={6}>
            {profile.languages.map((item) => (
              <Badge
                key={item.language}
                size="sm"
                variant="light"
                color="gray"
                style={{ textTransform: 'none' }}
              >
                {item.language}
                {item.proficiency !== 'Unknown' && ` · ${item.proficiency}`}
              </Badge>
            ))}
          </Group>
        </Section>
      )}

      {profile.projects.length > 0 && (
        <Section title="Projects">
          <Stack gap="sm">
            {profile.projects.map((item) => (
              <div key={item.id}>
                <Text size="sm" fw={650}>
                  {safeWebUrl(item.url ?? undefined) ? (
                    <Anchor
                      href={safeWebUrl(item.url ?? undefined)}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                      fw={650}
                    >
                      {item.name}
                    </Anchor>
                  ) : (
                    item.name
                  )}
                  {item.year && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      · {item.year}
                    </Text>
                  )}
                </Text>
                {item.description && <Text size="sm">{item.description}</Text>}
                {item.skills.length > 0 && (
                  <Group gap={4} mt={4}>
                    {item.skills.map((skill) => (
                      <Badge key={skill} size="xs" variant="light" color="gray">
                        {skill}
                      </Badge>
                    ))}
                  </Group>
                )}
              </div>
            ))}
          </Stack>
        </Section>
      )}

      {profile.publications.length > 0 && (
        <Section title="Publications">
          <Stack gap={4}>
            {profile.publications.map((item) => (
              <Text key={item.id} size="sm">
                {item.title}
                {item.venue && ` · ${item.venue}`}
                {item.year && ` · ${item.year}`}
              </Text>
            ))}
          </Stack>
        </Section>
      )}

      {profile.awards.length > 0 && (
        <Section title="Awards">
          <Stack gap={4}>
            {profile.awards.map((item) => (
              <Text key={item.id} size="sm">
                {item.name}
                {item.issuer && ` · ${item.issuer}`}
                {item.year && ` · ${item.year}`}
              </Text>
            ))}
          </Stack>
        </Section>
      )}

      {profile.unassignedText.length > 0 && (
        <Section title="Unassigned">
          <Text size="xs" c="dimmed" mb={6}>
            Lines the parser could not place. If something is missing above, it is probably here.
          </Text>
          <Code block style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {profile.unassignedText.join('\n')}
          </Code>
        </Section>
      )}

      <Group gap={6}>
        <IconSparkles size={13} />
        <Text size="xs" c="dimmed">
          Amber marks are values the parser wrote but could not find in the document. Outlined
          badges are judgments, not quotes.
        </Text>
      </Group>
    </Stack>
  );
}
