import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

import { promotionStatuses, promotionStatusLabel } from '../../domain/promotion-status';
import { hasAnyRole } from '../../domain/permissions';
import { getFriendlyError } from '../../domain/errors';
import { campaignService } from '../../lib/data';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/ConfirmDialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input, Select } from '../../components/ui/Field';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PromotionTable } from './PromotionTable';

export function PromotionsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const deferredSearch = useDeferredValue(search);
  const canCreate = hasAnyRole(profile?.roles ?? [], ['SALES']);
  const query = useQuery({
    queryKey: ['promotions', profile?.id, deferredSearch, status],
    queryFn: () => campaignService.listPromotions({ search: deferredSearch, status }),
    enabled: Boolean(profile),
  });
  const deletePromotion = useMutation({
    mutationFn: async (promotion: NonNullable<typeof query.data>[number]) => {
      await campaignService.cancelPromotion(
        promotion.id,
        promotion.version,
        'Deleted from the promotion context menu.',
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['promotions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      ]);
      toast.success('Promotion deleted from active work.');
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Promotion pipeline"
        title="Promotions"
        description="Every client promotion, assignment, approval, publication, and invoice in one auditable workflow."
        actions={
          canCreate ? (
            <Button asChild>
              <Link to="/promotions/new">
                <Plus className="size-4" />
                New promotion
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--text-dim)]" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search promotion or client…"
              aria-label="Search promotions"
            />
          </div>
          <div className="relative sm:w-64">
            <Filter className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--text-dim)]" />
            <Select
              className="pl-9"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {promotionStatuses.map((item) => (
                <option key={item} value={item}>
                  {promotionStatusLabel[item]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {query.isLoading ? (
          <div className="p-5">
            <LoadingState label="Loading promotions" />
          </div>
        ) : query.error ? (
          <div className="p-5">
            <ErrorState
              message={getFriendlyError(query.error)}
              retry={() => void query.refetch()}
            />
          </div>
        ) : (
          <PromotionTable
            promotions={query.data ?? []}
            onDelete={(promotion) =>
              setConfirmDialog({
                title: `Delete ${promotion.title}?`,
                description:
                  'The promotion will be removed from active work. The audit trail will be preserved.',
                confirmLabel: 'Delete promotion',
                intent: 'danger',
                onConfirm: () => {
                  setConfirmDialog(null);
                  deletePromotion.mutate(promotion);
                },
              })
            }
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link to="/promotions/new">Create promotion</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>
      <ConfirmDialog
        state={confirmDialog}
        pending={deletePromotion.isPending}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      />
    </div>
  );
}
