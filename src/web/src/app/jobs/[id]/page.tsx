'use client';

import { Button, Container, FileInput, Paper, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Job = { title: string; department: string; location: string; description: string; applicationQuestionsMarkdown: string };

export default function PublicJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', location: '', linkedInUrl: '', answersMarkdown: '' });
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [resume, setResume] = useState<File | null>(null);

  useEffect(() => { fetch(`/public/jobs/${id}`).then(async (r) => r.ok && setJob(await r.json())); }, [id]);
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  async function apply(event: React.FormEvent) {
    event.preventDefault();
    const body = resume ? (() => { const value = new FormData(); Object.entries(form).forEach(([key, item]) => value.append(key, item)); value.append('resume', resume); return value; })() : JSON.stringify(form);
    const response = await fetch(resume ? `/public/jobs/${id}/applications/resume` : `/public/jobs/${id}/applications`, { method: 'POST', headers: resume ? undefined : { 'Content-Type': 'application/json' }, body });
    setSent(response.ok);
    setMessage(response.ok ? 'Check your email for a confirmation code.' : 'Please check your details and try again.');
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/public/applications/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email, code }) });
    if (!response.ok) { setMessage('That code is invalid or expired.'); return; }
    const result = await response.json();
    sessionStorage.setItem('candidate-session', result.token);
    router.push('/candidate-portal');
  }
  if (!job) return <Container py="xl"><Text>Job not found.</Text></Container>;
  return <Container size="sm" py="xl"><Stack gap="xl">
    <div><Title order={1}>{job.title}</Title><Text c="dimmed">{job.department} · {job.location}</Text></div>
    <Paper withBorder p="lg"><Text style={{ whiteSpace: 'pre-wrap' }}>{job.description}</Text></Paper>
    {!sent ? <form onSubmit={apply}><Stack><Title order={2}>Apply</Title>
      {(['firstName', 'lastName', 'email', 'phone', 'location', 'linkedInUrl'] as const).map((key) => <TextInput key={key} label={key === 'linkedInUrl' ? 'LinkedIn URL' : key.replace(/([A-Z])/g, ' $1')} required={['firstName', 'lastName', 'email'].includes(key)} value={form[key]} onChange={update(key)} />)}
      <FileInput label="Resume (PDF or Word)" accept=".pdf,.doc,.docx" value={resume} onChange={setResume} />
      {job.applicationQuestionsMarkdown && <Textarea label="Application questions" description={job.applicationQuestionsMarkdown} minRows={4} value={form.answersMarkdown} onChange={update('answersMarkdown')} />}
      <Button type="submit">Continue</Button></Stack></form> : <form onSubmit={verify}><Stack><Title order={2}>Confirm your email</Title><Text>{message}</Text><TextInput label="Confirmation code" value={code} onChange={(event) => setCode(event.target.value)} required /><Button type="submit">Confirm application</Button></Stack></form>}
  </Stack></Container>;
}
