'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Briefcase,
  CalendarDays,
  CircleHelp,
  Home,
  LogOut,
  MessageSquare,
  UserRound,
} from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  Avatar,
  Drawer,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { unreadCount, type Portal } from './portal';

/** The three places in the portal, with badges only for things that need the candidate. */
function useItems(portal: Portal) {
  const pathname = usePathname();
  const toBook = portal.applications.reduce((n, a) => n + a.proposedInterviews.length, 0);
  const unread = portal.applications.reduce((n, a) => n + unreadCount(a), 0);
  return [
    {
      href: '/candidate-portal/home',
      label: 'Home',
      icon: Home,
      active:
        pathname.startsWith('/candidate-portal/home') ||
        pathname.startsWith('/candidate-portal/applications'),
      badge: null,
    },
    {
      href: '/candidate-portal/interviews',
      label: 'Interviews',
      icon: CalendarDays,
      active: pathname.startsWith('/candidate-portal/interviews'),
      badge: toBook
        ? { tone: 'amber' as const, count: toBook, label: `${toBook} to pick a time for` }
        : null,
    },
    {
      href: '/candidate-portal/messages',
      label: 'Inbox',
      icon: MessageSquare,
      active: pathname.startsWith('/candidate-portal/messages'),
      badge: unread ? { tone: 'blue' as const, count: unread, label: `${unread} unread` } : null,
    },
  ];
}

function Count({ badge }: { badge: { tone: 'amber' | 'blue'; count: number; label: string } }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-2xs font-semibold text-white tnum',
        badge.tone === 'amber' ? 'bg-tone-amber-dot' : 'bg-primary',
      )}
    >
      {badge.count}
      <span className="sr-only"> {badge.label}</span>
    </span>
  );
}

/** Header when signed in: the three places (wider screens) and the account menu. */
export function PortalHeaderNav({
  portal,
  onHelp,
  onSignOut,
}: {
  portal: Portal;
  onHelp: () => void;
  onSignOut: () => void;
}) {
  const items = useItems(portal);
  const router = useRouter();
  const name = `${portal.candidate.firstName} ${portal.candidate.lastName}`.trim();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <nav aria-label="Candidate portal" className="hidden items-center gap-1 sm:flex">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-secondary hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              item.active && 'bg-secondary text-fg',
            )}
          >
            {item.label}
            {item.badge && <Count badge={item.badge} />}
          </Link>
        ))}
      </nav>
      <Menu>
        <MenuTrigger
          aria-label={`Account: ${name}`}
          className="ml-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Avatar name={name} size="sm" />
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>
            <span className="block text-sm font-medium text-fg">{name}</span>
            <span className="block truncate">{portal.candidate.email}</span>
          </MenuLabel>
          <MenuSeparator />
          <MenuItem icon={<UserRound />} onSelect={() => router.push('/candidate-portal/profile')}>
            Your details
          </MenuItem>
          <MenuItem icon={<Briefcase />} onSelect={() => router.push('/careers')}>
            Open jobs
          </MenuItem>
          <MenuItem icon={<CircleHelp />} onSelect={onHelp}>
            Help
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<LogOut />} onSelect={onSignOut}>
            Sign out
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

/** Phone: the three places as a bottom tab bar, in reach of a thumb. */
export function PortalTabBar({ portal }: { portal: Portal }) {
  const items = useItems(portal);
  return (
    <nav
      aria-label="Candidate portal"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border-subtle bg-card pb-[env(safe-area-inset-bottom)] shadow-pop sm:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center gap-0.5 py-2 text-2xs font-medium text-fg-subtle focus-visible:bg-accent focus-visible:outline-none',
              item.active && 'text-accent-foreground',
            )}
          >
            <span className="relative">
              <Icon className="size-5" aria-hidden />
              {item.badge && (
                <span className="absolute -top-1.5 left-3">
                  <Count badge={item.badge} />
                </span>
              )}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

const FAQ: [string, string][] = [
  [
    'How does the process work?',
    'Every application goes through the same steps. We receive it and the team reviews it. If it is a good fit, interviews follow. Then the team makes a decision. Home shows where each application is now.',
  ],
  [
    'How long does a review take?',
    'Usually a few days. You will hear from us either way, by email and here in the portal.',
  ],
  [
    'How do I pick or change an interview time?',
    'When the team suggests times, open Interviews and pick the one that works for you. To move a booked interview, choose Change time. If no time works, write to the team in your Inbox.',
  ],
  [
    'Can I withdraw my application?',
    'Yes. Open the application from Home and choose Withdraw application at the bottom. We cancel any interviews you booked and tell the team. You can apply for other jobs later.',
  ],
  [
    'How do I change my phone number or send another document?',
    'Open Your details in the account menu to change your name, phone, location or time zone. To add a cover letter, portfolio or updated resume, open the application from Home and choose Add a document.',
  ],
  [
    'Who can see my messages?',
    'Only the hiring team for that job. Your messages are saved with your application.',
  ],
  [
    'How do I sign in next time?',
    'Every email from us has a link that signs you in. You can also enter the email you applied with, and we email you a code. You stay signed in on this device for 30 days, unless you sign out.',
  ],
];

/** Common questions, from "Need help?" in the footer or the account menu. */
export function HelpDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Drawer opened={opened} onClose={onClose} title="Help" size="md">
      <div className="space-y-5">
        <Accordion type="multiple" defaultValue={[FAQ[0][0]]}>
          {FAQ.map(([q, a]) => (
            <AccordionItem key={q} value={q} title={q}>
              {a}
            </AccordionItem>
          ))}
        </Accordion>
        <p className="text-sm text-fg-muted">
          Still stuck? Write to the hiring team from your Inbox. They reply there and by email.
        </p>
      </div>
    </Drawer>
  );
}
