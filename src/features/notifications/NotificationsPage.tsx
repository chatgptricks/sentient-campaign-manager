import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import { campaignService } from '../../lib/data';
import { getFriendlyError } from '../../domain/errors';
import { formatRelativeTime } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../auth/AuthProvider';

export function NotificationsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: () => campaignService.listNotifications(),
    enabled: Boolean(profile),
  });
  const markRead = useMutation({
    mutationFn: campaignService.markNotificationRead,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (error) => toast.error(getFriendlyError(error)),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Handoffs and updates"
        title="Notifications"
        description="In-app delivery is retained even when optional email or Slack delivery fails."
      />
      {query.isLoading ? (
        <LoadingState label="Loading notifications" />
      ) : query.error ? (
        <ErrorState message={getFriendlyError(query.error)} retry={() => void query.refetch()} />
      ) : query.data?.length ? (
        <Card>
          <div className="divide-y divide-[var(--border)]">
            {query.data.map((notification) => (
              <article
                key={notification.id}
                className={`relative flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between ${notification.readAt ? '' : 'bg-[var(--acid)]/[0.025]'}`}
              >
                {!notification.readAt ? (
                  <span
                    className="absolute top-6 left-2 size-1.5 rounded-full bg-[var(--acid)]"
                    aria-label="Unread"
                  />
                ) : null}
                <div className="pl-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-[var(--text)]">
                      {notification.subject}
                    </h2>
                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-dim)] uppercase">
                      {notification.channel.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
                    {notification.body}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-dim)]">
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2 pl-2">
                  {notification.promotionId ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link to={`/promotions/${notification.promotionId}`}>
                        Open <ExternalLink className="size-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                  {!notification.readAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markRead.mutate(notification.id)}
                      disabled={markRead.isPending}
                    >
                      <Check className="size-3.5" />
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<Bell className="size-5" />}
            title="You’re all caught up"
            description="Workflow handoffs and operational updates will appear here."
          />
        </Card>
      )}
    </div>
  );
}
