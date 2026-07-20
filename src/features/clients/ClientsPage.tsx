import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Building2, Copy, ExternalLink, Mail, MapPin, Pencil, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import type { Client } from '../../domain/models';
import { hasAnyRole } from '../../domain/permissions';
import { getFriendlyError } from '../../domain/errors';
import { campaignService } from '../../lib/data';
import { formatDate } from '../../lib/utils';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { ContextMenu, type ContextMenuState } from '../../components/ui/ContextMenu';
import { PageHeader } from '../../components/ui/PageHeader';
import { ClientFormDialog } from './ClientFormDialog';

export function ClientsPage() {
  const { profile } = useAuth();
  const [clientMenu, setClientMenu] = useState<(ContextMenuState & { client: Client }) | null>(
    null,
  );
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['clients', profile?.id],
    queryFn: () => campaignService.listClients(),
    enabled: Boolean(profile),
  });
  const canCreate = hasAnyRole(profile?.roles ?? [], ['SALES']);
  const archiveClient = useMutation({
    mutationFn: campaignService.archiveClient,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client archived. Existing promotion history is preserved.');
    },
    onError: (error) => toast.error(getFriendlyError(error)),
  });
  const addClient = canCreate ? (
    <ClientFormDialog
      trigger={
        <Button>
          <Plus className="size-4" />
          Add client
        </Button>
      }
    />
  ) : undefined;
  const requestArchiveClient = (client: Client) =>
    setConfirmDialog({
      title: `Archive ${client.name}?`,
      description: 'Existing promotions and audit history will remain available.',
      confirmLabel: 'Archive client',
      intent: 'danger',
      onConfirm: () => {
        setConfirmDialog(null);
        archiveClient.mutate(client.id);
      },
    });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Accounts"
        title="Clients"
        description="Client identity and billing data remain the shared source for every promotion and invoice."
        actions={addClient}
      />
      {query.isLoading ? (
        <LoadingState label="Loading clients" />
      ) : query.error ? (
        <ErrorState message={getFriendlyError(query.error)} retry={() => void query.refetch()} />
      ) : query.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {query.data.map((client) => (
            <Card
              key={client.id}
              className="group transition hover:border-[var(--border-strong)]"
              onContextMenuCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setClientMenu({ x: event.clientX, y: event.clientY, client });
              }}
            >
              <CardBody>
                <div className="flex items-start justify-between gap-4">
                  <div className="grid size-11 place-items-center rounded-lg border border-[var(--acid)]/20 bg-[var(--acid)]/8 text-[var(--acid-ink)]">
                    <Building2 className="size-5" />
                  </div>
                  <span className="text-[10px] font-bold tracking-[0.1em] text-[var(--text-dim)] uppercase">
                    Since {formatDate(client.createdAt)}
                  </span>
                </div>
                <Link
                  to={`/clients/${client.id}`}
                  className="mt-5 block text-lg font-semibold text-[var(--text)] hover:text-[var(--acid-ink)] focus-visible:underline focus-visible:outline-none"
                >
                  {client.name}
                </Link>
                <div className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
                  <p className="flex items-center gap-2">
                    <Mail className="size-3.5 shrink-0 text-[var(--text-dim)]" />
                    {client.billingEmail ?? 'Billing email not set'}
                  </p>
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--text-dim)]" />
                    <span>{client.billingAddress ?? 'Billing address not set'}</span>
                  </p>
                </div>
                {canCreate ? (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                    <ClientFormDialog
                      client={client}
                      trigger={
                        <Button variant="secondary" size="sm">
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={archiveClient.isPending}
                      onClick={() => requestArchiveClient(client)}
                    >
                      <Archive className="size-3.5" />
                      Archive
                    </Button>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Building2 className="size-5" />}
            title="No clients yet"
            description="Create the first client to start a promotion."
            action={addClient}
          />
        </Card>
      )}
      <ClientFormDialog
        client={editingClient ?? undefined}
        open={Boolean(editingClient)}
        onOpenChange={(open) => !open && setEditingClient(null)}
      />
      <ContextMenu
        state={clientMenu}
        onClose={() => setClientMenu(null)}
        groups={
          clientMenu
            ? [
                {
                  items: [
                    {
                      label: 'Open client',
                      description: 'View full record and promotions.',
                      icon: <ExternalLink className="size-4" />,
                      onSelect: () => {
                        window.location.hash = `#/clients/${clientMenu.client.id}`;
                      },
                    },
                    {
                      label: 'Edit client',
                      description: 'Update client details.',
                      icon: <Pencil className="size-4" />,
                      disabled: !canCreate,
                      onSelect: () => setEditingClient(clientMenu.client),
                    },
                    {
                      label: 'Copy billing info',
                      description: 'Copy name, email, and address.',
                      icon: <Copy className="size-4" />,
                      onSelect: () => {
                        const { name, billingEmail, billingAddress } = clientMenu.client;
                        void navigator.clipboard.writeText(
                          `${name}\n${billingEmail ?? 'No email'}\n${billingAddress ?? 'No address'}`,
                        );
                        toast.success('Billing info copied.');
                      },
                    },
                  ],
                },
                {
                  items: [
                    {
                      label: 'Archive client',
                      description: 'Remove from active list. Retains history.',
                      icon: <Archive className="size-4" />,
                      danger: true,
                      disabled: !canCreate,
                      onSelect: () => requestArchiveClient(clientMenu.client),
                    },
                  ],
                },
              ]
            : []
        }
      />
      <ConfirmDialog
        state={confirmDialog}
        pending={archiveClient.isPending}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      />
    </div>
  );
}
