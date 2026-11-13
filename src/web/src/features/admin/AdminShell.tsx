'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  BellRing,
  Building2,
  CalendarDays,
  CheckCheck,
  FileText,
  GitBranch,
  Globe,
  KeyRound,
  ListPlus,
  Mail,
  MailCheck,
  MailPlus,
  MessageSquare,
  Network,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useCurrentUser } from '@/auth';
import { SectionNav, SidebarLayout, type SectionGroup } from '@/components/layout/SectionLayout';
import { Badge, Card, EmptyState, LinkTabs, PageHeader, type Crumb } from '@/components/ui';
import { isAdmin, roleFromSlug, ROLE_LABELS, useAdminUsers } from './admin-data';

type Section = {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Page title when it differs from the nav label. */
  title?: string;
  description: string;
  preview?: boolean;
  exact?: boolean;
  /** Not a nav item of its own: lights this nav href and adds it to the breadcrumbs. */
  parent?: string;
  /** Pill tabs between sibling pages that share one nav item (AI settings / activity). */
  tab?: string;
};
type Group = { label: string; sections: Section[] };

// Every settings page. Existing URLs are kept; the nav groups them.
const GROUPS: Group[] = [
  {
    label: 'Workspace',
    sections: [
      {
        href: '/admin/general',
        label: 'General',
        icon: Building2,
        description: 'Your workspace name, time zone and who is allowed to sign in.',
      },
      {
        href: '/admin/portal',
        label: 'Candidate portal',
        icon: Globe,
        description: 'The address candidates use to follow their applications.',
      },
      {
        href: '/admin/reminders',
        label: 'Reminders',
        icon: BellRing,
        description: 'When your team and candidates get nudged about work that is waiting.',
      },
      {
        href: '/admin/notifications',
        label: 'Notifications',
        title: 'Team notifications',
        icon: MessageSquare,
        description: 'Send short updates about hiring to a Slack or Teams channel.',
      },
      {
        href: '/admin/email',
        label: 'Email delivery',
        icon: MailCheck,
        description: 'Check that emails to candidates can be sent.',
      },
    ],
  },
  {
    label: 'People & access',
    sections: [
      {
        href: '/admin',
        exact: true,
        label: 'Members',
        title: 'Workspace members',
        icon: Users,
        description: 'Manage who can sign in, the role each person has and the team they see.',
      },
      {
        href: '/admin/roles',
        label: 'Roles & permissions',
        icon: ShieldCheck,
        description: 'Give every teammate the right access, from first interview to final offer.',
      },
      {
        href: '/admin/invitations',
        label: 'Invitations',
        icon: MailPlus,
        preview: true,
        description: 'People you invited who have not joined the workspace yet.',
      },
      {
        href: '/admin/access-requests',
        label: 'Access requests',
        icon: UserPlus,
        preview: true,
        description: 'People asking to join this workspace, waiting for an admin to decide.',
      },
      {
        href: '/admin/team-access',
        label: 'Team access',
        icon: Network,
        preview: true,
        description: 'Limit which jobs and candidates each team can see.',
      },
    ],
  },
  {
    label: 'Hiring',
    sections: [
      {
        href: '/admin/pipelines',
        label: 'Pipelines',
        title: 'Hiring pipelines',
        icon: GitBranch,
        description: 'The stages a new job starts with, so every team hires the same way.',
      },
      {
        href: '/admin/fields',
        label: 'Custom fields',
        title: 'Candidate fields',
        icon: ListPlus,
        description: 'Extra details you keep about every candidate.',
      },
      {
        href: '/admin/templates',
        label: 'Posting templates',
        icon: FileText,
        description: 'Company-ready content you can reuse on every new job.',
      },
      {
        href: '/admin/templates/new',
        label: 'New template',
        title: 'New posting template',
        parent: '/admin/templates',
        description: 'Write reusable Markdown for job listings.',
      },
      {
        href: '/admin/email-templates',
        label: 'Email templates',
        icon: Mail,
        description: 'The wording of the emails candidates and your team receive.',
      },
      {
        href: '/admin/approvals',
        label: 'Approvals',
        icon: CheckCheck,
        description: 'Decide who signs off on new jobs and acceptances, and in what order.',
      },
    ],
  },
  {
    label: 'Integrations',
    sections: [
      {
        href: '/admin/integrations',
        label: 'Calendar',
        title: 'Calendar delivery',
        icon: CalendarDays,
        description: 'How interview invitations reach Microsoft 365 or Google Workspace.',
      },
      {
        href: '/admin/webhooks',
        label: 'Webhooks',
        icon: Webhook,
        description: 'Tell other systems the moment something happens here.',
      },
      {
        href: '/admin/ai-settings',
        label: 'AI',
        title: 'AI assistance',
        icon: Sparkles,
        tab: 'Settings',
        description: 'Turn AI help on or off and choose the model it uses.',
      },
      {
        href: '/admin/ai',
        label: 'AI activity',
        parent: '/admin/ai-settings',
        tab: 'Activity',
        description: 'Everything the AI was asked and what it answered, kept for accountability.',
      },
    ],
  },
  {
    label: 'Automation',
    sections: [
      {
        href: '/admin/workflows',
        label: 'Workflows',
        title: 'Automated workflows',
        icon: Workflow,
        preview: true,
        description: 'Run routine hiring steps automatically when something happens.',
      },
    ],
  },
  {
    label: 'Security',
    sections: [
      {
        href: '/admin/sso',
        label: 'Single sign-on',
        icon: KeyRound,
        preview: true,
        description: 'Let people sign in with your identity provider and keep accounts in sync.',
      },
      {
        href: '/admin/audit',
        label: 'Audit log',
        icon: ScrollText,
        description: 'Recent security and business events, newest first.',
      },
    ],
  },
];

const ALL = GROUPS.flatMap((group) => group.sections.map((section) => ({ group, section })));

function locate(pathname: string) {
  // Longest matching href wins, so /admin only lights up on the members page itself.
  const hit = ALL.filter(({ section: s }) =>
    s.exact ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`),
  ).sort((a, b) => b.section.href.length - a.section.href.length)[0];
  return hit ?? ALL.find((x) => x.section.href === '/admin')!;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();
  const users = useAdminUsers();
  const pathname = usePathname() ?? '/admin';

  if (!isAdmin(currentUser.role)) {
    return (
      <Card className="mx-auto mt-8 max-w-lg">
        <EmptyState
          icon={ShieldAlert}
          title="Administrator access required"
          description="Your account cannot view workspace settings, users or security audit data."
        />
      </Card>
    );
  }

  // The workflow editor owns the whole width and its own header.
  if (pathname.startsWith('/admin/workflows/')) return <>{children}</>;

  const { group, section } = locate(pathname);
  const parent = section.parent
    ? ALL.find((x) => x.section.href === section.parent)?.section
    : undefined;
  const role = pathname.startsWith('/admin/roles/')
    ? roleFromSlug(pathname.split('/')[3] ?? '')
    : null;
  const title = role ? ROLE_LABELS[role] : (section.title ?? section.label);
  const crumbs: Crumb[] = [
    { label: 'Settings', href: '/admin' },
    { label: group.label },
    ...(parent ? [{ label: parent.label, href: parent.href }] : []),
    ...(role ? [{ label: section.label, href: section.href }] : []),
    { label: title },
  ];
  const base = parent?.href ?? section.href;
  const tabSet = section.tab
    ? group.sections.filter((s) => s.tab && (s.href === base || s.parent === base))
    : [];

  const nav: SectionGroup[] = GROUPS.map((g) => ({
    label: g.label,
    items: g.sections
      .filter((s) => !s.parent)
      .map((s) => ({
        href: s.href,
        label: s.label,
        icon: s.icon,
        exact: s.exact,
        // Child pages without their own nav item light their parent.
        match: g.sections.filter((c) => c.parent === s.href).map((c) => c.href),
        count: s.href === '/admin' ? users.data?.length : undefined,
      })),
  }));

  return (
    <SidebarLayout nav={<SectionNav title="Settings" groups={nav} />}>
      <PageHeader
        breadcrumbs={crumbs}
        title={
          section.preview ? (
            <span className="inline-flex flex-wrap items-center gap-3">
              {title}
              <Badge tone="amber">Preview</Badge>
            </span>
          ) : (
            title
          )
        }
        description={
          role
            ? 'What this role can do, and the extras you can turn on for it.'
            : section.description
        }
      >
        {tabSet.length > 1 && (
          <LinkTabs
            variant="pills"
            aria-label={parent?.label ?? section.label}
            items={tabSet.map((s) => ({ href: s.href, exact: true, label: s.tab }))}
          />
        )}
      </PageHeader>
      <div className="min-w-0 space-y-5">{children}</div>
    </SidebarLayout>
  );
}
