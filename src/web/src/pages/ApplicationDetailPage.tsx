import { useState } from 'react';
import { ActionIcon, Alert, Avatar, Badge, Box, Breadcrumbs, Button, Divider, Group, Menu, Modal, NumberInput, Paper, Rating, Select, SimpleGrid, Stack, Tabs, Text, TextInput, Textarea, ThemeIcon, Timeline, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCalendarEvent, IconChevronDown, IconClipboardCheck, IconClock, IconMail, IconMessage, IconPlus, IconUserOff } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCurrentUser } from '../auth';
import { api } from '../api';
import { formatDate, formatDateTime, initials, LoadingBlock, StatusBadge } from '../components/Common';
import type { ApplicationDetailResponse } from '../types';

export function ApplicationDetailPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const query = useQuery({ queryKey: ['application', id], queryFn: () => api.get<ApplicationDetailResponse>(`/api/applications/${id}`) });
  const [noteOpened, noteModal] = useDisclosure();
  const [interviewOpened, interviewModal] = useDisclosure();
  const [offerOpened, offerModal] = useDisclosure();
  const [messageOpened, messageModal] = useDisclosure();
  const [rejectOpened, rejectModal] = useDisclosure();
  const canManage = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['application', id] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const stageMutation = useMutation({
    mutationFn: (stageId: string) => api.patch<void>(`/api/applications/${id}/stage`, { stageId, status: 'Active', dispositionReason: null }),
    onSuccess: () => { invalidate(); notifications.show({ color: 'teal', message: 'Candidate moved' }); },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  if (!query.data) return <LoadingBlock />;
  const application = query.data.application;

  return (
    <div>
      <Breadcrumbs mb="lg" separator="/">
        <Link to="/requisitions/$id" params={{ id: application.requisitionId }} className="quiet-link">{application.requisitionCode}</Link>
        <Text size="sm" c="dimmed">{application.candidateName}</Text>
      </Breadcrumbs>

      <Group justify="space-between" align="flex-start" mb="xl">
        <Group align="flex-start" wrap="nowrap">
          <Avatar size={58} radius="xl" color="indigo" variant="light">{initials(application.candidateName)}</Avatar>
          <div><Group gap="sm"><Title order={1} fz={{ base: 27, sm: 34 }}>{application.candidateName}</Title><StatusBadge status={application.status} /></Group><Text c="dimmed" mt={4}>{application.candidateTitle ?? 'Candidate'} · {application.requisitionTitle}</Text></div>
        </Group>
        {canManage && (
          <Group>
            <Button variant="default" leftSection={<IconMail size={16} />} onClick={messageModal.open}>Message</Button>
            <Select value={application.stageId} onChange={(value) => value && stageMutation.mutate(value)} data={application.stages.map((stage) => ({ value: stage.id, label: stage.name }))} w={150} allowDeselect={false} disabled={application.status !== 'Active' || stageMutation.isPending} />
            <Menu position="bottom-end"><Menu.Target><ActionIcon variant="default" size={36}><IconChevronDown size={16} /></ActionIcon></Menu.Target><Menu.Dropdown><Menu.Item color="red" leftSection={<IconUserOff size={16} />} onClick={rejectModal.open}>Reject candidate</Menu.Item></Menu.Dropdown></Menu>
          </Group>
        )}
      </Group>

      <Tabs defaultValue="overview">
        <Tabs.List mb="xl"><Tabs.Tab value="overview">Overview</Tabs.Tab><Tabs.Tab value="interviews">Interviews <Badge ml={6} size="xs" variant="light" circle>{application.interviews.length}</Badge></Tabs.Tab><Tabs.Tab value="activity">Activity</Tabs.Tab></Tabs.List>

        <Tabs.Panel value="overview">
          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="xl">
            <Stack>
              <Paper withBorder radius="lg" p="lg">
                <Text fw={700} mb="md">Candidate</Text>
                <Stack gap="sm"><Pair label="Email" value={application.candidateEmail} /><Pair label="Phone" value={application.candidatePhone ?? '—'} /><Pair label="Location" value={application.candidateLocation ?? '—'} /><Pair label="Source" value={application.source} /><Pair label="Applied" value={formatDate(application.appliedAt)} /></Stack>
                {application.candidateTags.length > 0 && <Group gap={6} mt="md">{application.candidateTags.map((tag) => <Badge key={tag} variant="light" color="gray" tt="none">{tag}</Badge>)}</Group>}
              </Paper>
              <Paper withBorder radius="lg" p="lg">
                <Group justify="space-between" mb="md"><Text fw={700}>Offer</Text>{canManage && application.offers.length === 0 && <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={offerModal.open}>Create</Button>}</Group>
                {application.offers.length === 0 ? <Text size="sm" c="dimmed">No offer created.</Text> : application.offers.map((offer) => <OfferCard key={offer.id} offer={offer} onUpdated={invalidate} canManage={canManage} />)}
              </Paper>
            </Stack>

            <Stack style={{ gridColumn: 'span 2' }}>
              <Paper withBorder radius="lg">
                <Group justify="space-between" p="lg"><div><Text fw={700}>Notes</Text><Text size="sm" c="dimmed">Internal hiring context</Text></div>{canManage && <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={noteModal.open}>Add note</Button>}</Group>
                <Divider />
                <Stack gap={0}>{application.notes.map((note) => <Box key={note.id} className="list-row"><Group justify="space-between" mb={5}><Group gap="xs"><Text size="sm" fw={650}>{note.authorEmail.split('@')[0]}</Text>{note.isPrivate && <Badge size="xs" color="gray" variant="light">Private</Badge>}</Group><Text size="xs" c="dimmed">{formatDateTime(note.createdAt)}</Text></Group><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{note.body}</Text></Box>)}{application.notes.length === 0 && <Text p="xl" c="dimmed" size="sm">No notes yet.</Text>}</Stack>
              </Paper>

              <Paper withBorder radius="lg">
                <Group justify="space-between" p="lg"><div><Text fw={700}>Tasks</Text><Text size="sm" c="dimmed">Work tied to this application</Text></div></Group>
                <Divider />
                <Stack gap={0}>{application.tasks.map((task) => <Group key={task.id} className="list-row" justify="space-between"><Group><ThemeIcon variant="light" color={task.isCompleted ? 'teal' : 'indigo'}><IconClipboardCheck size={17} /></ThemeIcon><div><Text size="sm" fw={600} td={task.isCompleted ? 'line-through' : undefined}>{task.title}</Text><Text size="xs" c="dimmed">{task.assigneeEmail} · Due {formatDate(task.dueDate)}</Text></div></Group>{task.isCompleted && <Badge color="teal" variant="light">Done</Badge>}</Group>)}{application.tasks.length === 0 && <Text p="xl" c="dimmed" size="sm">No tasks for this application.</Text>}</Stack>
              </Paper>

              <Paper withBorder radius="lg">
                <Group p="lg"><ThemeIcon variant="light" color="blue"><IconMessage size={17} /></ThemeIcon><div><Text fw={700}>Communication history</Text><Text size="sm" c="dimmed">Messages are logged here; delivery provider connection is the next integration boundary.</Text></div></Group>
                <Divider />
                <Stack gap={0}>{application.communications.map((message) => <Box key={message.id} className="list-row"><Group justify="space-between"><Text fw={650} size="sm">{message.subject}</Text><Text size="xs" c="dimmed">{formatDateTime(message.createdAt)}</Text></Group><Text size="xs" c="dimmed">To {message.recipient} · {message.status}</Text></Box>)}{application.communications.length === 0 && <Text p="xl" c="dimmed" size="sm">No messages logged.</Text>}</Stack>
              </Paper>
            </Stack>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="interviews">
          <Group justify="space-between" mb="lg"><div><Title order={3}>Interview plan</Title><Text c="dimmed" size="sm">Scheduled sessions and independent scorecards</Text></div>{canManage && <Button leftSection={<IconPlus size={16} />} onClick={interviewModal.open}>Schedule interview</Button>}</Group>
          <Stack>
            {application.interviews.map((interview) => <InterviewCard key={interview.id} interview={interview} currentEmail={user.email} onUpdated={invalidate} />)}
            {application.interviews.length === 0 && <Paper withBorder radius="lg" p="xl"><Text c="dimmed">No interviews scheduled.</Text></Paper>}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="activity">
          <Paper withBorder radius="lg" p="xl">
            <Timeline bulletSize={28} lineWidth={2}>
              {query.data.audit.map((event) => <Timeline.Item key={event.id} bullet={<IconClock size={14} />} title={event.action.replace(/([a-z])([A-Z])/g, '$1 $2')}><Text c="dimmed" size="sm">{event.actorEmail}</Text><Text size="xs" mt={4}>{formatDateTime(event.occurredAt)}</Text></Timeline.Item>)}
              {query.data.audit.length === 0 && <Text c="dimmed">No recorded activity.</Text>}
            </Timeline>
          </Paper>
        </Tabs.Panel>
      </Tabs>

      <NoteModal applicationId={id} opened={noteOpened} onClose={noteModal.close} onSaved={invalidate} />
      <InterviewModal applicationId={id} opened={interviewOpened} onClose={interviewModal.close} onSaved={invalidate} />
      <OfferModal applicationId={id} opened={offerOpened} onClose={offerModal.close} onSaved={invalidate} />
      <MessageModal applicationId={id} candidateName={application.candidateName} opened={messageOpened} onClose={messageModal.close} onSaved={invalidate} />
      <RejectModal applicationId={id} stageId={application.stageId} opened={rejectOpened} onClose={rejectModal.close} onSaved={invalidate} />
    </div>
  );
}

function InterviewCard({ interview, currentEmail, onUpdated }: { interview: ApplicationDetailResponse['application']['interviews'][number]; currentEmail: string; onUpdated: () => void }) {
  const [opened, modal] = useDisclosure();
  const mine = interview.scorecards.find((scorecard) => scorecard.interviewerEmail === currentEmail);
  const isAssigned = interview.interviewerEmails.includes(currentEmail);
  return <Paper withBorder radius="lg" p="lg"><Group justify="space-between" align="flex-start"><Group align="flex-start"><ThemeIcon variant="light" color="violet" size={42}><IconCalendarEvent size={20} /></ThemeIcon><div><Group gap="sm"><Text fw={700}>{interview.title}</Text><StatusBadge status={interview.status} /></Group><Text size="sm" c="dimmed" mt={4}>{formatDateTime(interview.startsAt)} · {interview.timeZone}</Text><Text size="xs" c="dimmed" mt={4}>{interview.interviewerEmails.join(', ')}</Text></div></Group>{isAssigned && !mine && <Button size="sm" variant="light" onClick={modal.open}>Submit scorecard</Button>}</Group>{mine && <Alert color="teal" mt="lg" title={`Your scorecard · ${mine.recommendation}`}><Group><Rating value={mine.rating} readOnly size="sm" /><Text size="sm">{mine.evidence}</Text></Group></Alert>}{interview.scorecards.length > 0 && <Stack mt="lg" gap="xs">{interview.scorecards.map((scorecard) => <Paper key={scorecard.id} bg="gray.0" p="md" radius="md"><Group justify="space-between"><Text size="sm" fw={650}>{scorecard.interviewerEmail}</Text><Group gap="xs"><Rating value={scorecard.rating} readOnly size="xs" /><Badge variant="light" color="gray" tt="none">{scorecard.recommendation}</Badge></Group></Group><Text size="sm" mt="xs">{scorecard.evidence}</Text></Paper>)}</Stack>}<ScorecardModal interviewId={interview.id} opened={opened} onClose={modal.close} onSaved={onUpdated} /></Paper>;
}

function ScorecardModal({ interviewId, opened, onClose, onSaved }: ModalProps & { interviewId: string }) {
  const [rating, setRating] = useState(0);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [evidence, setEvidence] = useState('');
  const mutation = useMutation({ mutationFn: () => api.post(`/api/interviews/${interviewId}/scorecards`, { rating, recommendation, evidence }), onSuccess: () => { notifications.show({ color: 'teal', message: 'Scorecard submitted and locked' }); onSaved(); onClose(); }, onError: (error: Error) => notifications.show({ color: 'red', message: error.message }) });
  return <Modal opened={opened} onClose={onClose} title={<Title order={3}>Submit scorecard</Title>} centered><Stack><Alert color="blue">Your scorecard is locked after submission.</Alert><div><Text size="sm" fw={500} mb={5}>Rating</Text><Rating value={rating} onChange={setRating} size="lg" /></div><Select label="Recommendation" value={recommendation} onChange={setRecommendation} data={[{ value: 'StrongNo', label: 'Strong no' }, { value: 'No', label: 'No' }, { value: 'Mixed', label: 'Mixed' }, { value: 'Yes', label: 'Yes' }, { value: 'StrongYes', label: 'Strong yes' }]} /><Textarea label="Evidence" minRows={5} value={evidence} onChange={(event) => setEvidence(event.currentTarget.value)} required /><Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancel</Button><Button disabled={!rating || !recommendation || !evidence.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>Submit and lock</Button></Group></Stack></Modal>;
}

type ModalProps = { opened: boolean; onClose: () => void; onSaved: () => void };

function NoteModal({ applicationId, opened, onClose, onSaved }: ModalProps & { applicationId: string }) {
  const [body, setBody] = useState('');
  const mutation = useMutation({ mutationFn: () => api.post(`/api/applications/${applicationId}/notes`, { body, isPrivate: false }), onSuccess: () => { setBody(''); onSaved(); onClose(); }, onError: (error: Error) => notifications.show({ color: 'red', message: error.message }) });
  return <Modal opened={opened} onClose={onClose} title={<Title order={3}>Add note</Title>} centered><Stack><Textarea label="Note" minRows={6} value={body} onChange={(event) => setBody(event.currentTarget.value)} autoFocus /><Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancel</Button><Button disabled={!body.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>Add note</Button></Group></Stack></Modal>;
}

function InterviewModal({ applicationId, opened, onClose, onSaved }: ModalProps & { applicationId: string }) {
  const [title, setTitle] = useState('Interview');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [interviewers, setInterviewers] = useState('interviewer@mythorneai.local');
  const mutation = useMutation({ mutationFn: () => api.post(`/api/applications/${applicationId}/interviews`, { title, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, meetingLink: null, interviewerEmails: interviewers.split(',').map((x) => x.trim()).filter(Boolean) }), onSuccess: () => { notifications.show({ color: 'teal', message: 'Interview scheduled' }); onSaved(); onClose(); }, onError: (error: Error) => notifications.show({ color: 'red', message: error.message }) });
  return <Modal opened={opened} onClose={onClose} title={<Title order={3}>Schedule interview</Title>} centered><Stack><TextInput label="Interview name" value={title} onChange={(e) => setTitle(e.currentTarget.value)} /><SimpleGrid cols={2}><TextInput type="datetime-local" label="Starts" value={startsAt} onChange={(e) => setStartsAt(e.currentTarget.value)} /><TextInput type="datetime-local" label="Ends" value={endsAt} onChange={(e) => setEndsAt(e.currentTarget.value)} /></SimpleGrid><TextInput label="Interviewers" description="Comma-separated company emails" value={interviewers} onChange={(e) => setInterviewers(e.currentTarget.value)} /><Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancel</Button><Button disabled={!title || !startsAt || !endsAt || !interviewers} loading={mutation.isPending} onClick={() => mutation.mutate()}>Schedule</Button></Group></Stack></Modal>;
}

function OfferModal({ applicationId, opened, onClose, onSaved }: ModalProps & { applicationId: string }) {
  const [amount, setAmount] = useState<number | string>(0);
  const [currency, setCurrency] = useState('USD');
  const [startDate, setStartDate] = useState('');
  const mutation = useMutation({ mutationFn: () => api.post(`/api/applications/${applicationId}/offers`, { baseSalary: Number(amount), currency, startDate }), onSuccess: () => { notifications.show({ color: 'teal', message: 'Offer draft created' }); onSaved(); onClose(); }, onError: (error: Error) => notifications.show({ color: 'red', message: error.message }) });
  return <Modal opened={opened} onClose={onClose} title={<Title order={3}>Create offer draft</Title>} centered><Stack><NumberInput label="Base salary" min={1} thousandSeparator="," value={amount} onChange={setAmount} /><Select label="Currency" value={currency} onChange={(value) => value && setCurrency(value)} data={['USD', 'CAD', 'EUR', 'GBP']} allowDeselect={false} /><TextInput type="date" label="Start date" value={startDate} onChange={(e) => setStartDate(e.currentTarget.value)} /><Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancel</Button><Button disabled={!Number(amount) || !startDate} loading={mutation.isPending} onClick={() => mutation.mutate()}>Create draft</Button></Group></Stack></Modal>;
}

function MessageModal({ applicationId, candidateName, opened, onClose, onSaved }: ModalProps & { applicationId: string; candidateName: string }) {
  const [subject, setSubject] = useState('Update on your application');
  const [body, setBody] = useState(`Hi ${candidateName.split(' ')[0]},\n\n`);
  const mutation = useMutation({ mutationFn: () => api.post(`/api/applications/${applicationId}/communications`, { subject, body }), onSuccess: () => { notifications.show({ color: 'teal', message: 'Communication logged' }); onSaved(); onClose(); }, onError: (error: Error) => notifications.show({ color: 'red', message: error.message }) });
  return <Modal opened={opened} onClose={onClose} title={<Title order={3}>Candidate message</Title>} size="lg" centered><Stack><Alert color="yellow">This MVP records the message. Connect the approved email provider before enabling delivery.</Alert><TextInput label="Subject" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} /><Textarea label="Message" minRows={9} value={body} onChange={(e) => setBody(e.currentTarget.value)} /><Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancel</Button><Button disabled={!subject.trim() || !body.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>Log message</Button></Group></Stack></Modal>;
}

function RejectModal({ applicationId, stageId, opened, onClose, onSaved }: ModalProps & { applicationId: string; stageId: string }) {
  const [reason, setReason] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: () => api.patch(`/api/applications/${applicationId}/stage`, { stageId, status: 'Rejected', dispositionReason: reason }), onSuccess: () => { notifications.show({ color: 'teal', message: 'Candidate disposition recorded' }); onSaved(); onClose(); }, onError: (error: Error) => notifications.show({ color: 'red', message: error.message }) });
  return <Modal opened={opened} onClose={onClose} title={<Title order={3}>Reject candidate</Title>} centered><Stack><Select label="Disposition reason" value={reason} onChange={setReason} data={['Does not meet minimum requirements', 'Skills mismatch', 'Compensation mismatch', 'Location or availability', 'Withdrew from consideration', 'Position closed', 'Other']} /><Text size="sm" c="dimmed">The reason is kept in the audit history.</Text><Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancel</Button><Button color="red" disabled={!reason} loading={mutation.isPending} onClick={() => mutation.mutate()}>Reject candidate</Button></Group></Stack></Modal>;
}

function OfferCard({ offer, onUpdated, canManage }: { offer: ApplicationDetailResponse['application']['offers'][number]; onUpdated: () => void; canManage: boolean }) {
  const mutation = useMutation({ mutationFn: (status: string) => api.patch(`/api/offers/${offer.id}/status`, { status }), onSuccess: onUpdated });
  const amount = new Intl.NumberFormat(undefined, { style: 'currency', currency: offer.currency, maximumFractionDigits: 0 }).format(offer.baseSalary);
  return <Stack gap="xs"><Group justify="space-between"><div><Text fw={750} size="lg">{amount}</Text><Text size="xs" c="dimmed">Start {formatDate(offer.startDate)}</Text></div><StatusBadge status={offer.status} /></Group>{canManage && <Menu><Menu.Target><Button variant="light" size="xs" rightSection={<IconChevronDown size={14} />}>Update offer</Button></Menu.Target><Menu.Dropdown>{['Draft', 'Approved', 'Sent', 'Accepted', 'Declined', 'Withdrawn'].filter((status) => status !== offer.status).map((status) => <Menu.Item key={status} onClick={() => mutation.mutate(status)}>{status}</Menu.Item>)}</Menu.Dropdown></Menu>}</Stack>;
}

function Pair({ label, value }: { label: string; value: string }) {
  return <Group justify="space-between" gap="lg" wrap="nowrap"><Text size="sm" c="dimmed">{label}</Text><Text size="sm" fw={600} ta="right">{value}</Text></Group>;
}
