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
import type { AppAbility } from '@/lib/ability';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match?: string[];
  preview?: boolean;
};

/**
 * Sidebar destinations, in Figma order, from what this person may do. `preview` marks screens that
 * run on sample data until their backend exists.
 */
export function primaryNav(ability: AppAbility): NavItem[] {
  const items: (NavItem & { allowed: boolean })[] = [
    { label: 'Dashboard', href: '/', icon: House, match: ['/approvals'], allowed: true },
    { label: 'Jobs', href: '/jobs', icon: Briefcase, allowed: ability.can('read', 'Job') },
    {
      label: 'Candidates',
      href: '/candidates',
      icon: Users,
      match: ['/applications'],
      allowed: ability.can('read', 'Candidate'),
    },
    { label: 'Pipeline', href: '/pipeline', icon: BarChart3, allowed: ability.can('read', 'Job') },
    {
      label: 'Interviews',
      href: '/interviews',
      icon: CalendarDays,
      allowed: ability.can('read', 'Interview'),
    },
    {
      label: 'Assessments',
      href: '/assessments',
      icon: FileText,
      allowed: ability.can('read', 'Assessment'),
    },
    { label: 'Reports', href: '/reports', icon: LineChart, allowed: ability.can('read', 'Report') },
    {
      label: 'Messages',
      href: '/messages',
      icon: MessageSquareMore,
      allowed: ability.can('read', 'Message'),
    },
  ];
  return items.filter((item) => item.allowed).map(({ allowed: _, ...item }) => item);
}

export function supportNav(ability: AppAbility): NavItem[] {
  const settings: NavItem = {
    label: 'Settings',
    href: settingsHome(ability),
    icon: Settings,
    match: ['/settings'],
  };
  return [settings, { label: 'Help', href: '/help', icon: CircleHelp }];
}

/** Where "Settings" opens: Members for people who manage the workspace, else their profile. */
export const settingsHome = (ability: AppAbility) =>
  ability.can('manage', 'Workspace') ? '/settings/members' : '/settings/profile';

export function isActive(pathname: string, item: NavItem) {
  const prefixes = [item.href, ...(item.match ?? [])];
  return item.href === '/'
    ? pathname === '/' || (item.match ?? []).some((p) => pathname.startsWith(p))
    : prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
