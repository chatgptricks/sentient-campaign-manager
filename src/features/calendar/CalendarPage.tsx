import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfToday,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  LayoutGrid,
  Rows3,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Promotion } from '../../domain/models';
import { hasAnyRole } from '../../domain/permissions';
import { campaignService } from '../../lib/data';
import { getFriendlyError } from '../../domain/errors';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Field';
import { PromotionStatusBadge } from '../promotions/PromotionStatusBadge';
import { getCurrentOwnerName } from '../promotions/presentation-helpers';
import { useAuth } from '../auth/AuthProvider';
import { CalendarPanel, type CalendarEvent } from '../../components/calendar/CalendarPanel';

type CalendarMode = 'month' | 'week' | 'client';

function eventFor(promotion: Promotion): CalendarEvent | null {
  if (!promotion.dueDate) return null;
  return {
    id: promotion.id,
    date: promotion.dueDate,
    title: promotion.title,
    subtitle: `${promotion.clientName} · ${getCurrentOwnerName(promotion)}`,
    status: promotion.status,
    href: `/promotions/${promotion.id}`,
  };
}

function CalendarViewFrame({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="min-h-[760px] p-5">
        <div className="grid min-h-14 gap-4 pb-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <h3 className="text-base leading-6 font-semibold text-[var(--text)]">{title}</h3>
            <p className="mt-1 max-w-4xl text-sm leading-5 text-[var(--text-muted)]">
              {description}
            </p>
          </div>
          <div className="flex min-h-10 items-center justify-start md:justify-end">{action}</div>
        </div>
        {children}
      </div>
    </Card>
  );
}

function WeeklyCalendar({ promotions }: { promotions: Promotion[] }) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(startOfToday(), { weekStartsOn: 1 }),
  );
  const week = useMemo(() => {
    return eachDayOfInterval({
      start: weekStart,
      end: endOfWeek(weekStart, { weekStartsOn: 1 }),
    });
  }, [weekStart]);
  const grouped = useMemo(() => {
    const result = new Map<string, Promotion[]>();
    promotions.forEach((promotion) => {
      if (!promotion.dueDate) return;
      const key = promotion.dueDate.slice(0, 10);
      result.set(key, [...(result.get(key) ?? []), promotion]);
    });
    return result;
  }, [promotions]);

  return (
    <CalendarViewFrame
      title="Weekly operational view"
      description="Work through the active campaign queue with the current owner and next handoff visible."
      action={
        <div className="flex min-h-10 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Previous week"
            onClick={() => setWeekStart((value) => subWeeks(value, 1))}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-xs font-semibold whitespace-nowrap text-[var(--text-dim)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none"
            onClick={() => setWeekStart(startOfWeek(startOfToday(), { weekStartsOn: 1 }))}
          >
            <Clock3 className="size-3.5" />
            {format(week[0]!, 'MMM d')} – {format(week.at(-1)!, 'MMM d, yyyy')}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Next week"
            onClick={() => setWeekStart((value) => addWeeks(value, 1))}
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>
      }
    >
      <div className="grid gap-px overflow-hidden rounded-md border border-[var(--border)] bg-[var(--border)] lg:grid-cols-7">
        {week.map((day) => {
          const items = grouped.get(format(day, 'yyyy-MM-dd')) ?? [];
          return (
            <section key={day.toISOString()} className="min-h-56 bg-[var(--surface-raised)] p-4">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase">
                    {format(day, 'EEE')}
                  </p>
                  <p
                    className={`mt-1 text-lg font-semibold ${isSameDay(day, startOfToday()) ? 'text-[var(--acid-ink)]' : 'text-[var(--text)]'}`}
                  >
                    {format(day, 'd')}
                  </p>
                </div>
                <span className="text-[10px] text-[var(--text-dim)]">{items.length} items</span>
              </div>
              <div className="mt-3 space-y-2">
                {items.length ? (
                  items.map((promotion) => (
                    <Link
                      key={promotion.id}
                      to={`/promotions/${promotion.id}`}
                      className="block rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none"
                    >
                      <p className="truncate text-xs font-semibold text-[var(--text)]">
                        {promotion.title}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                        {promotion.clientName}
                      </p>
                      <p className="mt-2 truncate text-[10px] text-[var(--text-dim)]">
                        Owner: {getCurrentOwnerName(promotion)}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-[var(--text-dim)]">
                          Social campaign · Multi-channel
                        </span>
                        <PromotionStatusBadge status={promotion.status} />
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="py-8 text-center text-xs text-[var(--text-dim)]">No campaigns</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </CalendarViewFrame>
  );
}

function ClientCalendarView({ promotions }: { promotions: Promotion[] }) {
  const [selectedClient, setSelectedClient] = useState('all');
  const clients = useMemo(
    () =>
      Array.from(
        new Map(promotions.map((promotion) => [promotion.clientId, promotion.clientName])),
      ),
    [promotions],
  );
  const visible =
    selectedClient === 'all'
      ? promotions
      : promotions.filter((promotion) => promotion.clientId === selectedClient);
  const grouped = useMemo(() => {
    const result = new Map<string, Promotion[]>();
    visible.forEach((promotion) =>
      result.set(promotion.clientId, [...(result.get(promotion.clientId) ?? []), promotion]),
    );
    return result;
  }, [visible]);

  return (
    <CalendarViewFrame
      title="Client campaign history"
      description="Review upcoming, active, completed, and archived campaign work by client."
      action={
        <Select
          aria-label="Filter calendar by client"
          value={selectedClient}
          onChange={(event) => setSelectedClient(event.target.value)}
          className="min-h-10 w-auto min-w-48"
        >
          <option value="all">All clients</option>
          {clients.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from(grouped.entries()).map(([clientId, items]) => (
          <article
            key={clientId}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--text)]">
                  {items[0]!.clientName}
                </h3>
                <p className="mt-1 text-xs text-[var(--text-dim)]">
                  {items.length} campaign{items.length === 1 ? '' : 's'} in history
                </p>
              </div>
              <Link
                to={`/clients/${clientId}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--acid-ink)] hover:text-[var(--acid-ink)]"
              >
                Client record <ExternalLink className="size-3" />
              </Link>
            </div>
            <div className="mt-4 divide-y divide-[var(--border)]">
              {items.map((promotion) => (
                <Link
                  key={promotion.id}
                  to={`/promotions/${promotion.id}`}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 focus-visible:outline-none"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">
                      {promotion.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-dim)]">
                      Due {promotion.dueDate ?? 'Not scheduled'} · Owner{' '}
                      {getCurrentOwnerName(promotion)}
                    </p>
                  </div>
                  <PromotionStatusBadge status={promotion.status} />
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </CalendarViewFrame>
  );
}

export function CalendarPage() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<CalendarMode>('month');
  const query = useQuery({
    queryKey: ['calendar-promotions', profile?.id],
    queryFn: () => campaignService.listPromotions(),
    enabled: Boolean(profile),
  });
  const canCreate = hasAnyRole(profile?.roles ?? [], ['SALES']);
  const events = useMemo(
    () =>
      (query.data ?? []).map(eventFor).filter((event): event is CalendarEvent => Boolean(event)),
    [query.data],
  );

  if (query.isLoading) return <LoadingState label="Loading calendar" />;
  if (query.error) {
    return (
      <ErrorState message={getFriendlyError(query.error)} retry={() => void query.refetch()} />
    );
  }

  const viewTabs: { key: CalendarMode; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'month', label: 'Monthly', icon: CalendarDays },
    { key: 'week', label: 'Weekly', icon: Rows3 },
    { key: 'client', label: 'By client', icon: LayoutGrid },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Campaign planning"
        title="Calendar"
        description="Plan campaign volume monthly, work active handoffs weekly, or review the full history by client."
        actions={
          canCreate ? (
            <Button asChild>
              <Link to="/promotions/new">New campaign</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Calendar modes">
        {viewTabs.map((tab) => {
          const Icon = tab.icon;
          const active = mode === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(tab.key)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none ${active ? 'border-[var(--acid)] bg-[var(--acid)]/10 text-[var(--acid-ink)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'}`}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
      {mode === 'month' ? (
        <CalendarPanel
          title="Monthly campaign overview"
          description="Click a date to review scheduled campaigns, or use right-click for contextual actions."
          events={events}
          accent="posting"
          addHrefForDate={canCreate ? (date) => `/promotions/new?dueDate=${date}` : undefined}
        />
      ) : mode === 'week' ? (
        <WeeklyCalendar promotions={query.data ?? []} />
      ) : (
        <ClientCalendarView promotions={query.data ?? []} />
      )}
    </div>
  );
}
