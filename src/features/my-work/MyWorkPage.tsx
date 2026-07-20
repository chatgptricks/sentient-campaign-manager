import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowRight, BriefcaseBusiness, CheckCheck } from 'lucide-react';

import type { Promotion } from '../../domain/models';
import { hasAnyRole } from '../../domain/permissions';
import { campaignService } from '../../lib/data';
import { getFriendlyError } from '../../domain/errors';
import { useAuth } from '../auth/AuthProvider';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PromotionStatusBadge } from '../promotions/PromotionStatusBadge';
import { canViewFinanceQueue } from './visibility';

function WorkList({ promotions, title }: { promotions: Promotion[]; title: string }) {
  if (!promotions.length) {
    return (
      <EmptyState
        icon={<CheckCheck className="size-5" />}
        title={`No ${title.toLowerCase()}`}
        description="This queue is clear. New assignments will appear here automatically."
      />
    );
  }
  return (
    <div className="divide-y divide-[var(--border)]">
      {promotions.map((promotion) => (
        <Link
          key={promotion.id}
          to={`/promotions/${promotion.id}`}
          className="group flex flex-wrap items-center justify-between gap-5 px-5 py-4 transition hover:bg-white/2 focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none focus-visible:ring-inset"
        >
          <div>
            <p className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--acid-ink)]">
              {promotion.title}
            </p>
            <p className="mt-1 text-xs text-[var(--text-dim)]">
              {promotion.clientName} · Due {promotion.dueDate ?? 'not set'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PromotionStatusBadge status={promotion.status} />
            <ArrowRight className="size-4 text-[var(--text-dim)]" />
          </div>
        </Link>
      ))}
    </div>
  );
}

export function MyWorkPage() {
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: ['promotions', 'my-work', profile?.id],
    queryFn: () => campaignService.listPromotions({ mine: true }),
    enabled: Boolean(profile),
  });

  if (query.isLoading) return <LoadingState label="Loading work queues" />;
  if (query.error)
    return (
      <ErrorState message={getFriendlyError(query.error)} retry={() => void query.refetch()} />
    );

  const all = query.data ?? [];
  const roles = profile?.roles ?? [];
  const owned = all.filter(
    (item) =>
      item.salesOwnerId === profile?.id &&
      !['INVOICED', 'COMPLETED', 'CANCELLED'].includes(item.status),
  );
  const creatorWork = all.filter(
    (item) =>
      item.creatorId === profile?.id &&
      [
        'CREATOR_ASSIGNED',
        'CREATIVE_IN_PROGRESS',
        'SUBMITTED_FOR_APPROVAL',
        'REVISION_REQUESTED',
        'APPROVED',
        'PUBLISHING_IN_PROGRESS',
        'PUBLISHED',
        'VERIFICATION_PENDING',
      ].includes(item.status),
  );
  const finance = all.filter((item) => item.status === 'READY_FOR_INVOICING');
  const showFinance = canViewFinanceQueue(roles);
  const queues = [
    ...(hasAnyRole(roles, ['SALES'])
      ? [{ value: 'owned', label: 'Sales ownership', data: owned, icon: BriefcaseBusiness }]
      : []),
    ...(hasAnyRole(roles, ['CREATOR'])
      ? [
          {
            value: 'assigned',
            label: 'Creator tasks',
            data: creatorWork,
            icon: BriefcaseBusiness,
          },
        ]
      : []),
    ...(showFinance
      ? [{ value: 'invoice', label: 'Ready to invoice', data: finance, icon: CheckCheck }]
      : []),
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Personal queues"
        title="My Work"
        description="Role-specific handoffs that need your attention, without the noise of the entire workspace."
      />
      <Tabs.Root defaultValue={queues[0]?.value}>
        <Tabs.List
          className={`grid gap-2 sm:grid-cols-2 ${queues.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}
          aria-label="Work queues"
        >
          {queues.map((queue) => {
            const Icon = queue.icon;
            return (
              <Tabs.Trigger
                key={queue.value}
                value={queue.value}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-4 text-left text-sm text-[var(--text-muted)] transition hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none data-[state=active]:border-[var(--acid)]/40 data-[state=active]:bg-[var(--acid)]/8 data-[state=active]:text-[var(--text)]"
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4" />
                  {queue.label}
                </span>
                <span className="rounded-full bg-white/7 px-2 py-0.5 text-xs font-bold">
                  {queue.data.length}
                </span>
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        {queues.map((queue) => (
          <Tabs.Content
            key={queue.value}
            value={queue.value}
            className="mt-5 focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none"
          >
            <Card>
              <WorkList promotions={queue.data} title={queue.label} />
            </Card>
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
