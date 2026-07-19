import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfToday,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ArrowLeft, ArrowRight, CalendarDays, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  status: string;
  href: string;
}

export interface CalendarViewDefinition {
  key: string;
  label: string;
  title: string;
  description: string;
  events: CalendarEvent[];
  accent: 'posting' | 'finance';
  addHrefForDate?: (date: string) => string;
}

type CalendarPanelProps = Omit<CalendarViewDefinition, 'key' | 'label'> & {
  key?: string;
  label?: string;
};

interface CalendarWorkspaceProps {
  views: CalendarViewDefinition[];
}

interface ContextMenuState {
  x: number;
  y: number;
  day: Date;
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function eventDate(value: string) {
  return parseISO(value.length === 10 ? `${value}T00:00:00` : value);
}

function dateKey(value: Date) {
  return format(value, 'yyyy-MM-dd');
}

function CalendarViewContent({
  title,
  description,
  events,
  accent,
  addHrefForDate,
}: Omit<CalendarViewDefinition, 'key' | 'label'>) {
  const today = startOfToday();
  const [month, setMonth] = useState(today);
  const [selectedDay, setSelectedDay] = useState(today);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const key = dateKey(eventDate(event.date));
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    });
    return grouped;
  }, [events]);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });
  const selectedEvents = eventsByDate.get(dateKey(selectedDay)) ?? [];
  const selectedDate = dateKey(selectedDay);
  const accentClasses =
    accent === 'posting'
      ? {
          marker: 'bg-[var(--acid)]',
          selected: 'border-[var(--acid)]/70 bg-[var(--acid)]/8',
          chip: 'bg-[var(--acid)]/12 text-[var(--acid-ink)]',
        }
      : {
          marker: 'bg-[var(--acid)]',
          selected: 'border-[var(--acid)]/70 bg-[var(--acid)]/8',
          chip: 'bg-[var(--acid)]/12 text-[var(--acid-ink)]',
        };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const openContextMenu = (event: MouseEvent<HTMLButtonElement>, day: Date) => {
    event.preventDefault();
    setSelectedDay(day);
    setContextMenu({ x: event.clientX, y: event.clientY, day });
  };

  return (
    <div>
      <div className="grid min-h-14 gap-4 pb-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <h3 className="text-base leading-6 font-semibold text-[var(--text)]">{title}</h3>
          <p className="mt-1 max-w-4xl text-sm leading-5 text-[var(--text-muted)]">{description}</p>
        </div>
        <div className="flex min-h-10 items-center justify-start gap-1 md:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Previous month"
            onClick={() => setMonth((value) => subMonths(value, 1))}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <p className="min-w-28 text-center text-sm font-semibold text-[var(--text)]">
            {format(month, 'MMMM yyyy')}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Next month"
            onClick={() => setMonth((value) => addMonths(value, 1))}
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1" aria-label={`${title} month view`}>
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="px-2 pb-1 text-[10px] font-bold tracking-[0.12em] text-[var(--text-dim)] uppercase"
          >
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = dateKey(day);
          const dayEvents = eventsByDate.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const selected = isSameDay(day, selectedDay);
          return (
            <button
              key={key}
              type="button"
              aria-label={`Select ${format(day, 'MMMM d, yyyy')}`}
              aria-pressed={selected}
              onClick={() => setSelectedDay(day)}
              onContextMenu={(event) => openContextMenu(event, day)}
              className={`min-h-20 rounded-lg border p-2 text-left transition focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none ${
                selected
                  ? accentClasses.selected
                  : 'border-transparent bg-[var(--surface)] hover:border-[var(--border)]'
              } ${inMonth ? 'text-[var(--text)]' : 'text-[var(--text-dim)] opacity-50'}`}
            >
              <span className="flex items-center justify-between text-xs font-semibold">
                {format(day, 'd')}
                {isSameDay(day, today) ? (
                  <span className={`size-1.5 rounded-full ${accentClasses.marker}`} />
                ) : null}
              </span>
              <span className="mt-2 grid gap-1">
                {dayEvents.slice(0, 2).map((event) => (
                  <span
                    key={event.id}
                    className={`truncate rounded px-1.5 py-1 text-[10px] font-semibold ${accentClasses.chip}`}
                  >
                    {event.title}
                  </span>
                ))}
                {dayEvents.length > 2 ? (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    +{dayEvents.length - 2} more
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-md border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">
              {format(selectedDay, 'EEEE, MMMM d')}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {selectedEvents.length
                ? `${selectedEvents.length} scheduled item${selectedEvents.length === 1 ? '' : 's'}`
                : 'No scheduled items'}
            </p>
          </div>
          {addHrefForDate ? (
            <Button asChild size="sm">
              <Link to={addHrefForDate(selectedDate)}>
                <Plus className="size-3.5" />
                Add promotion
              </Link>
            </Button>
          ) : null}
        </div>
        {selectedEvents.length ? (
          <div className="divide-y divide-[var(--border)]">
            {selectedEvents.map((event) => (
              <Link
                key={event.id}
                to={event.href}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none focus-visible:ring-inset"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{event.title}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{event.subtitle}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase ${accentClasses.chip}`}
                >
                  {event.status.replaceAll('_', ' ')}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--text-muted)]">
            {addHrefForDate
              ? 'Select this date when creating a promotion, or choose another day.'
              : 'Sales events will appear here when invoices are created.'}
          </p>
        )}
      </div>

      {contextMenu ? (
        <div
          role="menu"
          aria-label={`Options for ${format(contextMenu.day, 'MMMM d, yyyy')}`}
          className="fixed z-50 min-w-56 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-1 shadow-2xl"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 180),
            left: Math.min(contextMenu.x, window.innerWidth - 240),
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <p className="px-3 py-2 text-[10px] font-bold tracking-[0.1em] text-[var(--text-dim)] uppercase">
            {format(contextMenu.day, 'EEE, MMM d')} · Context actions
          </p>
          {addHrefForDate ? (
            <Link
              role="menuitem"
              to={addHrefForDate(dateKey(contextMenu.day))}
              onClick={() => setContextMenu(null)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <Plus className="size-4 text-[var(--acid-ink)]" />
              Add promotion on this date
            </Link>
          ) : null}
          {selectedEvents.map((event) => (
            <Link
              key={event.id}
              role="menuitem"
              to={event.href}
              onClick={() => setContextMenu(null)}
              className="block truncate rounded-md px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              Open {event.title}
            </Link>
          ))}
          {!addHrefForDate && !selectedEvents.length ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => setContextMenu(null)}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              View sales items for this date
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CalendarPanel(props: CalendarPanelProps) {
  return (
    <Card>
      <div className="min-h-[760px] p-5">
        <CalendarViewContent {...props} />
      </div>
    </Card>
  );
}

export function CalendarWorkspace({ views }: CalendarWorkspaceProps) {
  const [activeKey, setActiveKey] = useState(views[0]?.key ?? '');
  const activeView = views.find((view) => view.key === activeKey) ?? views[0];
  if (!activeView) return null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4 text-[var(--acid-ink)]" />
            Operations calendar
          </span>
        }
        description="Switch between posting planning and restricted sales milestones."
      />
      <div
        role="tablist"
        aria-label="Calendar views"
        className="flex gap-1 border-b border-[var(--border)] px-5 pt-4"
      >
        {views.map((view) => (
          <button
            key={view.key}
            type="button"
            role="tab"
            aria-selected={view.key === activeView.key}
            onClick={() => setActiveKey(view.key)}
            className={`rounded-t-md border-b-2 px-4 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none ${
              view.key === activeView.key
                ? 'border-[var(--acid)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>
      <CardBody>
        <CalendarViewContent {...activeView} />
      </CardBody>
    </Card>
  );
}
