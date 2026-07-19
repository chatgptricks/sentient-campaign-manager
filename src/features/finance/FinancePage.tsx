import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, ReceiptText } from 'lucide-react';

import { useAuth } from '../auth/AuthProvider';
import { canViewFinanceQueue } from '../my-work/visibility';
import { campaignService } from '../../lib/data';
import { getFriendlyError } from '../../domain/errors';
import { Badge } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { CalendarPanel, type CalendarEvent } from '../../components/calendar/CalendarPanel';
import { formatMoney } from '../../lib/utils';
import { Link } from 'react-router-dom';

export function FinancePage() {
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: ['finance-calendar', 'page', profile?.id],
    queryFn: () => campaignService.listFinanceCalendarEvents(),
    enabled: Boolean(profile) && canViewFinanceQueue(profile?.roles ?? []),
  });

  if (query.isLoading) return <LoadingState label="Loading finance" />;
  if (query.error) {
    return (
      <ErrorState message={getFriendlyError(query.error)} retry={() => void query.refetch()} />
    );
  }

  const financeEvents: CalendarEvent[] = (query.data ?? []).map((event) => ({
    id: event.id,
    date: event.date,
    title: event.title,
    subtitle: `${event.clientName} · ${event.invoiceNumber ?? 'Draft invoice'} · ${formatMoney(event.amount, event.currency)}`,
    status: event.status,
    href: `/promotions/${event.promotionId}`,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Protected finance workspace"
        title="Finance"
        description="Invoice and payment milestones are isolated from campaign users and available only to authorized roles."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardBody>
            <CircleDollarSign className="size-5 text-[var(--acid-ink)]" />
            <p className="mt-5 text-xs font-semibold text-[var(--text-dim)]">
              Tracked finance items
            </p>
            <p className="mt-2 text-3xl font-semibold text-[var(--text)]">{financeEvents.length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <ReceiptText className="size-5 text-[var(--acid-ink)]" />
            <p className="mt-5 text-xs font-semibold text-[var(--text-dim)]">Issued / paid</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--text)]">
              {financeEvents.filter((event) => ['ISSUED', 'PAID'].includes(event.status)).length}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold text-[var(--text-dim)]">Access boundary</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text)]">Finance + Administrator</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              Amounts, invoice dates, and payment status remain hidden from other roles.
            </p>
          </CardBody>
        </Card>
      </div>
      <CalendarPanel
        title="Financial calendar"
        description="Invoice creation and payment milestones linked to the parent campaign."
        events={financeEvents}
        accent="finance"
      />
      <Card>
        <CardHeader
          title="Invoice reminders"
          description="Open the parent campaign to view or update the protected financial record."
        />
        {financeEvents.length ? (
          <div className="divide-y divide-[var(--border)]">
            {financeEvents.map((event) => (
              <Link
                key={event.id}
                to={event.href}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--surface-hover)]"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{event.title}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {event.subtitle} · {event.date}
                  </p>
                </div>
                <Badge tone={event.status === 'PAID' ? 'success' : 'attention'}>
                  {event.status}
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <CardBody>
            <p className="text-sm text-[var(--text-muted)]">No finance reminders yet.</p>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
