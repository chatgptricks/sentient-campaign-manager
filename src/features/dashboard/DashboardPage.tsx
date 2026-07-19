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
import { MetricCard } from '../../components/ui/MetricCard';
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
  const active = total - (query.data.counts.INVOICED ?? 0) - (query.data.counts.CANCELLED ?? 0);
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace metrics">
        <MetricCard
          label="Active promotions"
          value={active}
          detail={`${total} promotions in workspace`}
          icon={<Layers3 className="size-5" />}
        />
        <MetricCard
          label="Needs attention"
          value={query.data.attention.length}
          detail="Workflow handoffs waiting"
          icon={<AlertCircle className="size-5" />}
        />
        <MetricCard
          label="Overdue"
          value={query.data.overdue.length}
          detail="Past due and still active"
          icon={<Clock3 className="size-5" />}
        />
        <MetricCard
          label="Completed"
          value={query.data.counts.INVOICED ?? 0}
          detail="Promotions fully invoiced"
          icon={<CheckCircle2 className="size-5" />}
        />
        <MetricCard
          label="Due today"
          value={dueToday}
          detail="Campaigns scheduled today"
          icon={<CalendarClock className="size-5" />}
        />
        <MetricCard
          label="Due this week"
          value={dueThisWeek}
          detail="Campaigns in the current week"
          icon={<Clock3 className="size-5" />}
        />
        <MetricCard
          label="Waiting for design"
          value={waitingDesign}
          detail="Creator queue and revisions"
          icon={<Palette className="size-5" />}
        />
        <MetricCard
          label="Waiting for approval"
          value={waitingApproval}
          detail="Submitted creative reviews"
          icon={<ShieldCheck className="size-5" />}
        />
        <MetricCard
          label="Ready to publish"
          value={readyToPublish}
          detail="Approved publishing handoffs"
          icon={<Send className="size-5" />}
        />
        <MetricCard
          label="Currently publishing"
          value={publishing}
          detail="Active account checklists"
          icon={<Send className="size-5" />}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,.75fr)]">
        <Card>
          <CardHeader
            title="Requires attention"
            description="Approvals, revisions, verification, and finance handoffs."
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
