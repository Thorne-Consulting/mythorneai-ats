'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Archive, FileText, Inbox, Mail, PenSquare, Send, Star } from 'lucide-react';
import { Button, Modal, PageHeader, Select, Textarea, toast } from '@/components/ui';
import { SectionNav, SidebarLayout } from '@/components/layout/SectionLayout';
import { useLocalStorageState } from '@/lib/hooks';
import { PreviewAlert, PreviewTitle } from '../preview-ui';
import {
  sampleConversations,
  sampleTemplates,
  type ChatMessage,
  type Conversation,
  type MessageTemplate,
} from '../sample-messages';
import { candidateValues, fillTemplate } from './template-vars';

export type Folder = 'inbox' | 'unread' | 'starred' | 'sent' | 'archived';
export const folders: Folder[] = ['inbox', 'unread', 'starred', 'sent', 'archived'];

export function inFolder(c: Conversation, f: Folder) {
  if (f === 'archived') return c.archived;
  if (f === 'starred') return c.starred;
  if (c.archived) return false;
  if (f === 'unread') return c.unread;
  if (f === 'sent') return c.messages.at(-1)?.direction === 'out';
  return true;
}

export type Draft = {
  text: string;
  attachments: { name: string; size: number }[];
  scheduledFor: string;
};
export const emptyDraft: Draft = { text: '', attachments: [], scheduledFor: '' };

type Store = {
  conversations: Conversation[];
  templates: MessageTemplate[];
  ready: boolean;
  setTemplates: (fn: (t: MessageTemplate[]) => MessageTemplate[]) => void;
  patch: (id: string, change: Partial<Conversation>) => void;
  send: (id: string, draft: Draft) => void;
  cancelScheduled: (id: string, messageId: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  drafts: Record<string, Draft>;
  setDraft: (id: string, draft: Draft) => void;
};

const Ctx = createContext<Store | null>(null);

export function useMessages() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useMessages needs MessagesShell');
  return s;
}

/** Matches a media query; assumes desktop on the server. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

const clock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Everything under /messages: the page header, the folder sidebar and the sample data, kept per
 * browser so sent messages, stars and templates survive reloads.
 */
export function MessagesShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [conversations, setConversations] = useLocalStorageState(
    'ats-preview:conversations:v2',
    sampleConversations,
  );
  const [templates, setTemplates] = useLocalStorageState(
    'ats-preview:message-templates:v1',
    sampleTemplates,
  );
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [composing, setComposing] = useState(false);
  useEffect(() => setReady(true), []);

  const patch = (id: string, change: Partial<Conversation>) =>
    setConversations((all) => all.map((c) => (c.id === id ? { ...c, ...change } : c)));

  const store: Store = {
    conversations,
    templates,
    ready,
    setTemplates,
    patch,
    send: (id, draft) => {
      const c = conversations.find((x) => x.id === id);
      if (!c || !draft.text.trim()) return;
      const time = clock();
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        direction: 'out',
        body: draft.text.trim(),
        time,
        delivered: true,
        ...(draft.attachments.length && { attachments: draft.attachments }),
        ...(draft.scheduledFor && { scheduledFor: draft.scheduledFor }),
      };
      patch(id, { archived: false, unread: false, time, messages: [...c.messages, message] });
      setDrafts((d) => ({ ...d, [id]: emptyDraft }));
    },
    cancelScheduled: (id, messageId) => {
      const c = conversations.find((x) => x.id === id);
      const m = c?.messages.find((x) => x.id === messageId);
      if (!c || !m) return;
      patch(id, { messages: c.messages.filter((x) => x.id !== messageId) });
      setDrafts((d) => ({
        ...d,
        [id]: { text: m.body, attachments: m.attachments ?? [], scheduledFor: '' },
      }));
    },
    selectedId,
    setSelectedId,
    drafts,
    setDraft: (id, draft) => setDrafts((d) => ({ ...d, [id]: draft })),
  };

  const count = (f: Folder) => conversations.filter((c) => inFolder(c, f) && c.unread).length;
  return (
    <Ctx.Provider value={store}>
      <PageHeader
        title={<PreviewTitle>Messages</PreviewTitle>}
        description="Write to candidates and keep track of their replies."
      />
      <PreviewAlert>
        This is a preview with sample messages. They are saved only in this browser, and nothing is
        sent.
      </PreviewAlert>
      <SidebarLayout
        navWidth="lg:w-52"
        nav={
          <div className="flex flex-col gap-3">
            <Button leftIcon={<PenSquare />} fullWidth onClick={() => setComposing(true)}>
              New message
            </Button>
            <SectionNav
              title="Folders"
              groups={[
                {
                  items: [
                    {
                      href: '/messages',
                      label: 'Inbox',
                      icon: Inbox,
                      exact: true,
                      count: ready ? count('inbox') : undefined,
                    },
                    {
                      href: '/messages/unread',
                      label: 'Unread',
                      icon: Mail,
                      count: ready ? count('unread') : undefined,
                    },
                    { href: '/messages/starred', label: 'Starred', icon: Star },
                    { href: '/messages/sent', label: 'Sent', icon: Send },
                    { href: '/messages/archived', label: 'Archived', icon: Archive },
                  ],
                },
                {
                  label: 'Library',
                  items: [{ href: '/messages/templates', label: 'Templates', icon: FileText }],
                },
              ]}
            />
          </div>
        }
      >
        {children}
      </SidebarLayout>

      <NewMessageModal
        opened={composing}
        onClose={() => setComposing(false)}
        conversations={conversations}
        templates={templates}
        onSend={(id, text) => {
          store.send(id, { ...emptyDraft, text });
          setSelectedId(id);
          if (pathname !== '/messages') router.push('/messages');
          toast.success('Message added', 'This is a preview, so nothing was sent.');
        }}
      />
    </Ctx.Provider>
  );
}

function NewMessageModal({
  opened,
  onClose,
  conversations,
  templates,
  onSend,
}: {
  opened: boolean;
  onClose: () => void;
  conversations: Conversation[];
  templates: MessageTemplate[];
  onSend: (id: string, body: string) => void;
}) {
  const [to, setTo] = useState<string | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const close = () => {
    setTo(null);
    setTemplate(null);
    setBody('');
    setSubmitted(false);
    onClose();
  };
  const apply = (templateId: string | null, convId: string | null) => {
    const t = templates.find((x) => x.id === templateId);
    const c = conversations.find((x) => x.id === convId);
    if (t) setBody(fillTemplate(t.body, c ? candidateValues(c) : {}).text);
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      title="New message"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            leftIcon={<Send />}
            onClick={() => {
              setSubmitted(true);
              if (!to || !body.trim()) return;
              onSend(to, body);
              close();
            }}
          >
            Send message
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="To"
          placeholder="Choose a candidate"
          data={conversations.map((c) => ({ value: c.id, label: `${c.name} · ${c.role}` }))}
          value={to}
          onChange={(v) => {
            setTo(v);
            if (template) apply(template, v);
          }}
          error={submitted && !to && 'Choose a candidate'}
        />
        <Select
          label="Start from a template"
          placeholder="No template"
          clearable
          data={templates.map((t) => ({ value: t.id, label: t.name, group: t.category }))}
          value={template}
          onChange={(v) => {
            setTemplate(v);
            apply(v, to);
          }}
        />
        <Textarea
          label="Message"
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          error={submitted && !body.trim() && 'Write a message'}
        />
      </div>
    </Modal>
  );
}
