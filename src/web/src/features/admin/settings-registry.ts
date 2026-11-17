import {
  Bell,
  BellRing,
  Building2,
  Coins,
  CalendarClock,
  CalendarDays,
  CheckCheck,
  FileSignature,
  FileText,
  GitBranch,
  Globe,
  KeyRound,
  Library,
  ListPlus,
  Mail,
  ScrollText,
  ShieldCheck,
  Signpost,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UserX,
  Users,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { AppAbility } from '@/lib/ability/rules';

export type SettingsTab = { href: string; label: string };

export type SettingsPage = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Page title when it differs from the nav label. */
  title?: string;
  description?: string;
  /** Extra words the settings search and ⌘K match on. */
  keywords?: string;
  /** Runs on sample data until its backend lands. */
  preview?: boolean;
  /** Sub-pages that share this nav item, shown as pills under the title. */
  tabs?: SettingsTab[];
};

export type SettingsGroup = {
  label: string;
  /** Workspace settings; only admins see the group. */
  admin?: boolean;
  pages: SettingsPage[];
};

/**
 * Every settings page, in rail order. The settings rail, the settings search, the page headers and
 * the ⌘K palette all read this one list.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: 'Your account',
    pages: [
      {
        href: '/settings/profile',
        label: 'Profile',
        title: 'My profile',
        icon: UserRound,
        keywords: 'me account name email role',
      },
      {
        href: '/settings/notifications',
        label: 'Notifications',
        icon: Bell,
        keywords: 'my emails alerts daily summary digest mentions',
      },
      {
        href: '/settings/availability',
        label: 'Calendar and hours',
        title: 'Calendar and availability',
        icon: CalendarClock,
        keywords:
          'my calendar connect google microsoft outlook time zone working hours availability buffer interviews',
      },
      {
        href: '/settings/preferences',
        label: 'Preferences',
        icon: SlidersHorizontal,
        keywords: 'theme dark mode light density start page tables',
      },
    ],
  },
  {
    label: 'Workspace',
    admin: true,
    pages: [
      {
        href: '/settings/general',
        label: 'General',
        icon: Building2,
        keywords:
          'company name time zone domains candidate portal address email delivery sign-in google microsoft',
      },
      {
        href: '/settings/careers',
        label: 'Careers site',
        icon: Globe,
        description: 'How your careers page, candidate portal and emails to candidates look.',
        keywords:
          'brand logo colour color icon favicon careers page jobs board headline introduction website social links resume required candidate portal emails',
      },
      {
        href: '/settings/currencies',
        label: 'Currencies',
        icon: Coins,
        description:
          'The base currency for totals and reports, the currencies jobs and offers may use, and the exchange rates.',
        keywords: 'currency money pay salary exchange rates convert base usd eur',
      },
      {
        href: '/settings/email',
        label: 'Email',
        icon: Mail,
        description:
          'How emails reach candidates, every email sent, and the addresses we no longer email.',
        keywords:
          'email delivery sending domain resend dns spf dkim replies sender name log sent failed retry scheduled bounced blocked unblock',
        tabs: [
          { href: '/settings/email', label: 'Sending' },
          { href: '/settings/email/sent', label: 'Sent emails' },
          { href: '/settings/email/blocked', label: 'Blocked addresses' },
        ],
      },
    ],
  },
  {
    label: 'People',
    admin: true,
    pages: [
      {
        href: '/settings/members',
        label: 'Members',
        icon: Users,
        keywords: 'people team invite invitations access requests deactivate remove users',
      },
      {
        href: '/settings/roles',
        label: 'Roles',
        title: 'Roles and permissions',
        icon: ShieldCheck,
        description: 'See what each role can do, and make your own roles from the built-in ones.',
        keywords: 'permissions access custom role reports import templates coordinator',
      },
      {
        href: '/settings/sso',
        label: 'Single sign-on',
        icon: KeyRound,
        description:
          'With single sign-on (SSO), people sign in with their company account, for example from Okta or Microsoft.',
        keywords:
          'sso okta saml entra azure identity provider domain verification sign-in methods google microsoft email code',
      },
    ],
  },
  {
    label: 'Hiring',
    admin: true,
    pages: [
      {
        href: '/settings/pipelines',
        label: 'Pipelines',
        title: 'Hiring pipelines',
        icon: GitBranch,
        description: 'The stages a new job starts with, so every team hires the same way.',
        keywords: 'stages',
      },
      {
        href: '/settings/fields',
        label: 'Candidate fields',
        icon: ListPlus,
        description: 'Extra details you keep about every candidate.',
        keywords: 'custom fields',
      },
      {
        href: '/settings/sources',
        label: 'Candidate sources',
        icon: Signpost,
        description: 'Where candidates come from. Every source picker and filter uses this list.',
        keywords: 'source referral referred by job board agency utm src link codes merge',
      },
      {
        href: '/settings/templates',
        label: 'Templates',
        icon: FileText,
        description: 'Text you write once and reuse on jobs and in emails.',
        keywords: 'posting job description company intro benefits email wording',
        tabs: [
          { href: '/settings/templates', label: 'Job postings' },
          { href: '/settings/templates/email', label: 'Emails' },
        ],
      },
      {
        href: '/settings/interview-library',
        label: 'Interview library',
        icon: Library,
        description: 'Kit templates and saved questions that every job can start from.',
        keywords: 'interview kits templates question bank competencies scorecards',
        tabs: [
          { href: '/settings/interview-library', label: 'Templates' },
          { href: '/settings/interview-library/questions', label: 'Question bank' },
        ],
      },
      {
        href: '/settings/offer-letters',
        label: 'Offer letters',
        icon: FileSignature,
        description: 'The letters offers start from, filled in with each offer’s terms.',
        keywords: 'offer letter templates salary start date',
      },
      {
        href: '/settings/rejection-reasons',
        label: 'Rejection reasons',
        icon: UserX,
        description:
          'The reasons people choose when they reject someone or record that a candidate withdrew.',
        keywords: 'reject disposition withdrew withdrawn reasons',
      },
      {
        href: '/settings/approvals',
        label: 'Approvals',
        icon: CheckCheck,
        description: 'Decide who signs off on new jobs and offers, and in what order.',
        keywords: 'sign off approvers offers',
      },
      {
        href: '/settings/workflows',
        label: 'Workflows',
        title: 'Automated workflows',
        icon: Workflow,
        description: 'Run routine hiring steps automatically when something happens.',
        keywords: 'automation',
      },
    ],
  },
  {
    label: 'Alerts',
    admin: true,
    pages: [
      {
        href: '/settings/alerts',
        label: 'Reminders and alerts',
        icon: BellRing,
        description: 'When we remind people about waiting work, and where we post team updates.',
        keywords: 'reminders quiet hours slack teams channel notifications',
      },
    ],
  },
  {
    label: 'Integrations',
    admin: true,
    pages: [
      {
        href: '/settings/calendar',
        label: 'Calendar',
        icon: CalendarDays,
        description: 'Check that interview invitations reach your team’s calendars.',
        keywords: 'google microsoft outlook integration',
      },
      {
        href: '/settings/webhooks',
        label: 'Webhooks',
        icon: Webhook,
        description:
          'A webhook tells another system when something happens here, by sending a short message to a web address you choose.',
        keywords: 'api integration events developers',
      },
      {
        href: '/settings/ai',
        label: 'AI',
        title: 'AI assistance',
        icon: Sparkles,
        keywords: 'openai model artificial intelligence',
        tabs: [
          { href: '/settings/ai', label: 'Settings' },
          { href: '/settings/ai/activity', label: 'Activity' },
        ],
      },
    ],
  },
  {
    label: 'Security',
    admin: true,
    pages: [
      {
        href: '/settings/activity',
        label: 'Activity history',
        icon: ScrollText,
        description: 'Who did what in this workspace, and when.',
        keywords: 'audit log sign-ins changes history export',
      },
    ],
  },
];

/** The groups this person sees: their own pages, plus the workspace pages if they manage the workspace. */
export function settingsGroups(ability: Pick<AppAbility, 'can'>) {
  const workspace = ability.can('manage', 'Workspace');
  return SETTINGS_GROUPS.filter((group) => workspace || !group.admin);
}

const ALL = SETTINGS_GROUPS.flatMap((group) => group.pages.map((page) => ({ group, page })));

/** The page that owns a path: the longest href that is the path or a parent of it. */
export function findSettingsPage(pathname: string) {
  return ALL.filter(
    ({ page }) => pathname === page.href || pathname.startsWith(`${page.href}/`),
  ).sort((a, b) => b.page.href.length - a.page.href.length)[0];
}

/** Pages whose label or keywords contain every word typed. */
export function searchSettings(groups: SettingsGroup[], query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return groups;
  return groups
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => {
        const text =
          `${page.label} ${page.title ?? ''} ${group.label} ${page.keywords ?? ''}`.toLowerCase();
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((group) => group.pages.length > 0);
}

// Where each old /admin address lives now. Bookmarks and links in old emails keep working.
const MOVED: [string, string][] = [
  ['/admin/general', '/settings/general'],
  ['/admin/portal', '/settings/careers'],
  ['/admin/email-templates', '/settings/templates/email'],
  ['/admin/email', '/settings/email'],
  ['/admin/reminders', '/settings/alerts'],
  ['/admin/notifications', '/settings/alerts'],
  ['/admin/invitations', '/settings/members?tab=invited'],
  ['/admin/access-requests', '/settings/members?tab=requests'],
  ['/admin/team-access', '/settings/members'],
  ['/admin/roles', '/settings/roles'],
  ['/admin/pipelines', '/settings/pipelines'],
  ['/admin/fields', '/settings/fields'],
  ['/admin/templates', '/settings/templates'],
  ['/admin/approvals', '/settings/approvals'],
  ['/admin/integrations', '/settings/calendar'],
  ['/admin/webhooks', '/settings/webhooks'],
  ['/admin/ai-settings', '/settings/ai'],
  ['/admin/ai', '/settings/ai/activity'],
  ['/admin/workflows', '/settings/workflows'],
  ['/admin/sso', '/settings/sso'],
  ['/admin/audit', '/settings/activity'],
];

/** The new address for an old /admin path. Child paths (/admin/roles/recruiter) move with their parent. */
export function movedSettingsHref(path: string) {
  const clean = path.replace(/\/+$/, '') || '/admin';
  for (const [from, to] of MOVED) {
    if (clean === from) return to;
    if (clean.startsWith(`${from}/`) && !to.includes('?')) return to + clean.slice(from.length);
  }
  return '/settings/members';
}
