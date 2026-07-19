import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Layers3,
  Megaphone,
  Palette,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { endOfWeek, format, startOfToday, startOfWeek } from 'date-fns';

import { useAuth } from '../auth/AuthProvider';
import { campaignService } from '../../lib/data';
import { formatRelativeTime } from '../../lib/utils';
import { getFriendlyError } from '../../domain/errors';
import { hasAnyRole } from '../../domain/permissions';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PromotionStatusBadge } from '../promotions/PromotionStatusBadge';
import { getCurrentOwnerName } from '../promotions/presentation-helpers';

export function DashboardPage() {
  const { profile } = useAuth();
  const roles = profile?.roles ?? [];
  const canCreate = hasAnyRole(roles, ['SALES']);
  const query = useQuery({
    queryKey: ['dashboard', profile?.id],
    queryFn: () => campaignService.getDashboard(profile?.id ?? ''),
    enabled: Boolean(profile),
  });
  if (query.isLoading) return <LoadingState label="Loading dashboard" />;
  if (query.error || !query.data) {
    return (
      <ErrorState message={getFriendlyError(query.error)} retry={() => void query.refetch()} />
    );
  }

  const total = Object.values(query.data.counts).reduce((sum, count) => sum + (count ?? 0), 0);
  const active = total - (query.data.counts.INVOICED ?? 0) - (query.data.counts.COMPLETED ?? 0) - (query.data.counts.CANCELLED ?? 0);
  const firstName = profile?.displayName.split(' ')[0] ?? 'there';
  const todayKey = format(startOfToday(), 'yyyy-MM-dd');
  const weekStart = startOfWeek(startOfToday(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(startOfToday(), { weekStartsOn: 1 });
  const dueToday = query.data.promotions.filter(
    (promotion) => promotion.dueDate === todayKey,
  ).length;
  const dueThisWeek = query.data.promotions.filter((promotion) => {
    if (!promotion.dueDate) return false;
    const date = new Date(`${promotion.dueDate}T12:00:00`);
    return date >= weekStart && date <= weekEnd;
  }).length;
  const waitingDesign = query.data.promotions.filter((promotion) =>
    ['CREATOR_ASSIGNED', 'CREATIVE_IN_PROGRESS', 'REVISION_REQUESTED'].includes(promotion.status),
  ).length;
  const waitingApproval = query.data.promotions.filter((promotion) =>
    ['SUBMITTED_FOR_APPROVAL'].includes(promotion.status),
  ).length;
  const readyToPublish = query.data.promotions.filter((promotion) =>
    ['APPROVED', 'PUBLISHER_ASSIGNED'].includes(promotion.status),
  ).length;
  const publishing = query.data.promotions.filter((promotion) =>
    ['PUBLISHING_IN_PROGRESS'].includes(promotion.status),
  ).length;
  const activeTotal = Math.max(active, 1);
  const workflowSegments = [
    {
      label: 'Design',
      value: waitingDesign,
      detail: 'Creator queue and revisions',
      icon: <Palette className="size-4" />,
    },
    {
      label: 'Approval',
      value: waitingApproval,
      detail: 'Submitted creative reviews',
      icon: <ShieldCheck className="size-4" />,
    },
    {
      label: 'Ready',
      value: readyToPublish,
      detail: 'Approved publishing handoffs',
      icon: <Send className="size-4" />,
    },
    {
      label: 'Publishing',
      value: publishing,
      detail: 'Active account checklists',
      icon: <Send className="size-4" />,
    },
  ];
  const timingItems = [
    {
      label: 'Due today',
      value: dueToday,
      detail: 'Scheduled for today',
      icon: <CalendarClock className="size-4" />,
    },
    {
      label: 'Due this week',
      value: dueThisWeek,
      detail: 'Current production week',
      icon: <Clock3 className="size-4" />,
    },
    {
      label: 'Overdue',
      value: query.data.overdue.length,
      detail: 'Past due and active',
      icon: <AlertCircle className="size-4" />,
    },
  ];
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations overview"
        title={`Good morning, ${firstName}.`}
        description="Track every promotion from intake to invoice, with the next operational handoff always visible."
        actions={
          canCreate ? (
            <Button asChild>
              <Link to="/promotions/new">
                <Megaphone className="size-4" />
                New promotion
              </Link>
            </Button>
          ) : undefined
        }
      />

      <section aria-label="Workspace operational snapshot">
        <Card className="overflow-hidden">
          <div className="relative isolate grid gap-px bg-[var(--border)] lg:grid-cols-[minmax(18rem,.9fr)_minmax(0,1.6fr)_minmax(18rem,.9fr)]">
            <div className="relative overflow-hidden bg-[var(--surface-raised)] p-6">
              <div className="absolute top-0 right-0 size-44 translate-x-16 -translate-y-20 rounded-full bg-[var(--acid)]/12 blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-[var(--text-dim)] uppercase">
                  <Layers3 className="size-4 text-[var(--acid-ink)]" />
                  Workspace pulse
                </div>
                <div className="mt-7 flex items-end gap-4">
                  <p className="text-6xl font-semibold tracking-[-0.06em] text-[var(--text)]">
                    {active}
                  </p>
                  <div className="pb-2">
                    <p className="text-sm font-semibold text-[var(--text)]">active promotions</p>
                    <p className="mt-1 text-xs text-[var(--text-dim)]">
                      {total} total · {(query.data.counts.INVOICED ?? 0) + (query.data.counts.COMPLETED ?? 0)} completed
                    </p>
                  </div>
                </div>
                <div className="mt-7 space-y-3 border-t border-[var(--border)] pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-medium text-[var(--text-dim)]">Handoffs waiting</p>
                    <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text)]">
                      {query.data.attention.length}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-medium text-[var(--text-dim)]">Overdue</p>
                    <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text)]">
                      {query.data.overdue.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface-raised)] p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[0.14em] text-[var(--text-dim)] uppercase">
                    Active workflow by stage
                  </p>
                </div>
                <div className="grid size-10 place-items-center rounded-lg border border-[var(--acid)]/20 bg-[var(--acid)]/8 text-[var(--acid-ink)]">
                  <Megaphone className="size-4" />
                </div>
              </div>
              <div className="mt-6 divide-y divide-[var(--border)]">
                {workflowSegments.map((segment) => (
                  <div
                    key={segment.label}
                    className="grid gap-3 py-4 sm:grid-cols-[minmax(8rem,.75fr)_minmax(0,1fr)] sm:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--acid)]/10 text-[var(--acid-ink)]">
                        {segment.icon}
                      </div>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text)]">
                            {segment.value}
                          </p>
                          <p className="text-xs font-bold tracking-[0.1em] text-[var(--text-dim)] uppercase">
                            {segment.label}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
                        <div
                          className="h-full rounded-full bg-[var(--acid)]"
                          style={{
                            width: `${Math.min((segment.value / activeTotal) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">
                        {segment.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--surface-raised)] p-6">
              <p className="text-xs font-bold tracking-[0.14em] text-[var(--text-dim)] uppercase">
                Timing pressure
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Deadlines that need operational awareness.
              </p>
              <div className="mt-6 space-y-4">
                {timingItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-white/40 text-[var(--acid-ink)]">
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-semibold text-[var(--text)]">{item.label}</p>
                        <p className="text-xl font-semibold tracking-[-0.04em] text-[var(--text)]">
                          {item.value}
                        </p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
                        <div
                          className="h-full rounded-full bg-[var(--acid)]"
                          style={{ width: `${Math.min((item.value / activeTotal) * 100, 100)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-[var(--text-dim)]">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-lg border border-[var(--acid)]/20 bg-[var(--acid)]/8 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--acid-ink)]" />
                  <p className="text-xs leading-5 text-[var(--text-muted)]">
                    Completed work is kept in the total count, but the pulse focuses on active
                    operational load.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,.75fr)]">
        <Card>
          <CardHeader
            title="Requires attention"
            description="Approvals, revisions, verification, and sales handoffs."
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/my-work">
                  View my work <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            }
          />
          <div className="divide-y divide-[var(--border)]">
            {query.data.attention.length ? (
              query.data.attention.map((promotion) => (
                <Link
                  key={promotion.id}
                  to={`/promotions/${promotion.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/2 focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none focus-visible:ring-inset"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">
                      {promotion.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-dim)]">
                      {promotion.clientName} · Owner {getCurrentOwnerName(promotion)}
                    </p>
                  </div>
                  <PromotionStatusBadge status={promotion.status} />
                </Link>
              ))
            ) : (
              <div className="px-5 py-12 text-center text-sm text-[var(--text-muted)]">
                Nothing needs attention right now.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent activity" description="Immutable workflow events." />
          <CardBody>
            <ol className="space-y-5">
              {query.data.recentActivity.map((event) => (
                <li key={event.id} className="relative pl-6">
                  <span
                    className="absolute top-1.5 left-0 size-2 rounded-full bg-[var(--acid)] shadow-[0_0_10px_var(--acid)]"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-[var(--text)]">
                    {event.eventType.replace(/([a-z])([A-Z])/g, '$1 $2')}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">
                    {event.actorName ?? 'System'} · {formatRelativeTime(event.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      {query.data.myAssignments.length ? (
        <Card>
          <CardHeader
            title="My assignments"
            description="Active promotions where you own a workflow role."
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/my-work">
                  Open queues <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            }
          />
          <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2 xl:grid-cols-3">
            {query.data.myAssignments.slice(0, 6).map((promotion) => (
              <Link
                key={promotion.id}
                to={`/promotions/${promotion.id}`}
                className="flex items-center justify-between gap-4 bg-[var(--surface-raised)] p-5 hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none focus-visible:ring-inset"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">
                    {promotion.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--text-dim)]">
                    {promotion.clientName}
                  </p>
                </div>
                <PromotionStatusBadge status={promotion.status} />
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {query.data.overdue.length ? (
        <Card className="border-amber-400/20 bg-amber-400/4">
          <CardHeader
            title="Overdue promotions"
            description="These active promotions are past their due dates."
          />
          <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2 xl:grid-cols-3">
            {query.data.overdue.slice(0, 6).map((promotion) => (
              <Link
                key={promotion.id}
                to={`/promotions/${promotion.id}`}
                className="bg-[var(--surface-raised)] p-5 hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none focus-visible:ring-inset"
              >
                <p className="text-sm font-semibold text-[var(--text)]">{promotion.title}</p>
                <p className="mt-2 text-xs text-[var(--acid-ink)]">Due {promotion.dueDate}</p>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
