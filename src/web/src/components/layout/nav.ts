import {
  BarChart3,
  Briefcase,
  CalendarDays,
  CircleHelp,
  FileText,
  House,
  LineChart,
  MessageSquareMore,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { User } from '@/types';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match?: string[];
  preview?: boolean;
};

/**
 * Sidebar destinations, in Figma order, filtered by role. `preview` marks screens that run on
 * sample data until their backend exists.
 */
export function primaryNav(user: User): NavItem[] {
  const dashboard: NavItem = { label: 'Dashboard', href: '/', icon: House, match: ['/approvals'] };
  const candidates: NavItem = {
    label: 'Candidates',
    href: '/candidates',
    icon: Users,
    match: ['/applications'],
  };
  const interviews: NavItem = { label: 'Interviews', href: '/interviews', icon: CalendarDays };
  if (user.role === 'Interviewer') return [dashboard, interviews, candidates];
  const items: NavItem[] = [
    dashboard,
    { label: 'Jobs', href: '/jobs', icon: Briefcase },
    candidates,
    { label: 'Pipeline', href: '/pipeline', icon: BarChart3 },
    interviews,
    { label: 'Assessments', href: '/assessments', icon: FileText, preview: true },
  ];
  if (user.permissions.includes('reports'))
    items.push({ label: 'Reports', href: '/reports', icon: LineChart });
  items.push({ label: 'Messages', href: '/messages', icon: MessageSquareMore, preview: true });
  return items;
}

export function supportNav(user: User): NavItem[] {
  const settings: NavItem =
    user.role === 'Admin'
      ? { label: 'Settings', href: '/admin', icon: Settings, match: ['/settings'] }
      : { label: 'Settings', href: '/settings/profile', icon: Settings, match: ['/settings'] };
  return [settings, { label: 'Help', href: '/help', icon: CircleHelp }];
}

export function isActive(pathname: string, item: NavItem) {
  const prefixes = [item.href, ...(item.match ?? [])];
  return item.href === '/'
    ? pathname === '/' || (item.match ?? []).some((p) => pathname.startsWith(p))
    : prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const canPostJobs = (user: User) =>
  ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
