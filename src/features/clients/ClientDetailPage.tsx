import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, Mail, MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { campaignService } from '../../lib/data';
import { getFriendlyError } from '../../domain/errors';
import { formatDate } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PromotionStatusBadge } from '../promotions/PromotionStatusBadge';
import { getCurrentOwnerName } from '../promotions/presentation-helpers';
import { useAuth } from '../auth/AuthProvider';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: ['client-detail', profile?.id, id],
    queryFn: async () => {
      const [clients, promotions] = await Promise.all([
        campaignService.listClients(),
        campaignService.listPromotions(),
      ]);
      return {
        client: clients.find((item) => item.id === id) ?? null,
        promotions: promotions.filter((item) => item.clientId === id),
      };
    },
    enabled: Boolean(profile && id),
  });

  if (query.isLoading) return <LoadingState label="Loading client" />;
  if (query.error || !query.data?.client) {
    return (
      <ErrorState
        title="Client not found"
        message={getFriendlyError(query.error)}
        retry={() => void query.refetch()}
      />
    );
  }

  const { client, promotions } = query.data;
  const active = promotions.filter((item) => !['INVOICED', 'CANCELLED'].includes(item.status));
  const completed = promotions.filter((item) => item.status === 'INVOICED');

  return (
    <div className="space-y-8">
      <Button asChild variant="ghost" size="sm">
        <Link to="/clients">
          <ArrowLeft className="size-3.5" />
          Clients
        </Link>
      </Button>
      <PageHeader
        eyebrow="Client record"
        title={client.name}
        description="Campaign history, operational ownership, and external resources associated with this client."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader
            title="Client information"
            description="Billing fields remain protected by the sales boundary."
          />
          <CardBody>
            <div className="grid size-12 place-items-center rounded-lg border border-[var(--acid)]/20 bg-[var(--acid)]/8 text-[var(--acid-ink)]">
              <Building2 className="size-5" />
            </div>
            <div className="mt-6 space-y-3 text-sm text-[var(--text-muted)]">
              <p className="flex items-center gap-2">
                <Mail className="size-3.5 text-[var(--text-dim)]" />
                {client.billingEmail ?? 'Billing email not set'}
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-3.5 text-[var(--text-dim)]" />
                {client.billingAddress ?? 'Billing address not set'}
              </p>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-5">
              <div>
                <dt className="text-[10px] font-bold tracking-[0.1em] text-[var(--text-dim)] uppercase">
                  Active
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-[var(--text)]">{active.length}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-[0.1em] text-[var(--text-dim)] uppercase">
                  Completed
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-[var(--text)]">
                  {completed.length}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Campaign history"
            description={`${promotions.length} campaign${promotions.length === 1 ? '' : 's'} linked to this client.`}
          />
          {promotions.length ? (
            <div className="divide-y divide-[var(--border)]">
              {promotions.map((promotion) => (
                <Link
                  key={promotion.id}
                  to={`/promotions/${promotion.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--surface-hover)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">
                      {promotion.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Due {formatDate(promotion.dueDate)} · Current owner{' '}
                      {getCurrentOwnerName(promotion)}
                    </p>
                  </div>
                  <PromotionStatusBadge status={promotion.status} />
                </Link>
              ))}
            </div>
          ) : (
            <CardBody>
              <p className="text-sm text-[var(--text-muted)]">
                No campaigns are linked to this client yet.
              </p>
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
