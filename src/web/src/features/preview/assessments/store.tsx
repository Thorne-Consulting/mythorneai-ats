'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3,
  ClipboardList,
  Code2,
  Headset,
  Lightbulb,
  Megaphone,
  PenTool,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import { useLocalStorageState } from '@/lib/hooks';
import {
  sampleAssessments,
  sampleInvites,
  type Assessment,
  type Invite,
} from '../sample-assessments';

type Setter<T> = (fn: (prev: T) => T) => void;

type Store = {
  assessments: Assessment[];
  invites: Invite[];
  /** False until the browser copy has loaded; render skeletons until then. */
  ready: boolean;
  setAssessments: Setter<Assessment[]>;
  setInvites: Setter<Invite[]>;
  updateAssessment: (id: string, patch: Partial<Assessment>) => void;
  updateInvite: (id: string, patch: Partial<Invite>) => void;
  addInvites: (assessmentId: string, emails: string[]) => void;
  reset: () => void;
};

const Ctx = createContext<Store | null>(null);

/**
 * Holds the assessments preview for every /assessments route, kept per browser so builder edits,
 * invitations and reviews survive reloads. Replace with queries when the API exists.
 */
export function AssessmentsProvider({ children }: { children: ReactNode }) {
  const [assessments, setAssessments] = useLocalStorageState(
    'ats-preview:assessments:v2',
    sampleAssessments,
  );
  const [invites, setInvites] = useLocalStorageState(
    'ats-preview:assessment-invites:v2',
    sampleInvites,
  );
  const [ready, setReady] = useState(false);
  // Runs after useLocalStorageState's load effect, so `ready` flips in the same render as the data.
  useEffect(() => setReady(true), []);

  const store: Store = {
    assessments,
    invites,
    ready,
    setAssessments,
    setInvites,
    updateAssessment: (id, patch) =>
      setAssessments((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a))),
    updateInvite: (id, patch) =>
      setInvites((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i))),
    addInvites: (assessmentId, emails) => {
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setInvites((list) => [
        ...emails.map((email): Invite => ({
          id: crypto.randomUUID(),
          assessmentId,
          candidate: nameFromEmail(email),
          email,
          status: 'NotStarted',
          invitedOn: stamp,
          submittedOn: null,
          reviews: {},
          comment: '',
          decision: null,
          reviewer: null,
        })),
        ...list,
      ]);
    },
    reset: () => {
      setAssessments(() => sampleAssessments);
      setInvites(() => sampleInvites);
    },
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useAssessments() {
  const store = useContext(Ctx);
  if (!store) throw new Error('useAssessments needs AssessmentsProvider');
  return store;
}

/** "ana.lopez@example.com" → "Ana Lopez". */
export const nameFromEmail = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ') || email;

const deptIcons: Record<string, LucideIcon> = {
  Engineering: Code2,
  Product: Lightbulb,
  Design: PenTool,
  Analytics: BarChart3,
  Marketing: Megaphone,
  Support: Headset,
  Sales: Presentation,
};
export const iconFor = (a: Pick<Assessment, 'department'>) =>
  deptIcons[a.department] ?? ClipboardList;

export const statusLabel = { active: 'Active', draft: 'Draft', archived: 'Archived' } as const;

export const formatWhen = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(value))
    : '—';

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
