'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, Tabs } from '@/components/ui';
import { ApplicationCard, usePortalData } from './PortalShell';
import { isClosed } from './portal';

/** /candidate-portal/applications: every application, split into active and closed. */
export function ApplicationsHome() {
  const portal = usePortalData();
  const apps = portal.applications;
  const active = apps.filter((a) => !isClosed(a));
  const closed = apps.filter(isClosed);
  const [tab, setTab] = useState(active.length ? 'active' : 'all');
  const shown = tab === 'active' ? active : tab === 'closed' ? closed : apps;

  return (
    <>
      <PageHeader
        title="Applications"
        description="Every role you've applied for, where each one stands and what comes next."
        actions={
          <Button asChild variant="secondary">
            <Link href="/careers">See open jobs</Link>
          </Button>
        }
      />
      {apps.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No applications yet"
            description="Once you apply and confirm your email, your applications show up here."
            action={
              <Button asChild>
                <Link href="/careers">See open jobs</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Tabs
            aria-label="Filter applications"
            value={tab}
            onValueChange={setTab}
            className="mb-4"
            items={[
              { value: 'active', label: 'Active', count: active.length },
              { value: 'closed', label: 'Closed', count: closed.length },
              { value: 'all', label: 'All', count: apps.length },
            ]}
          />
          {shown.length === 0 ? (
            <Card>
              <EmptyState
                compact
                icon={FileText}
                title={tab === 'active' ? 'No active applications' : 'Nothing closed yet'}
                description={
                  tab === 'active'
                    ? 'Your earlier applications are under Closed.'
                    : 'Applications that end up hired, closed or withdrawn are kept here.'
                }
              />
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {shown.map((a) => (
                <ApplicationCard key={a.id} application={a} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
