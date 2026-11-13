import { MessagesShell } from '@/features/preview/messages/MessagesShell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <MessagesShell>{children}</MessagesShell>;
}
