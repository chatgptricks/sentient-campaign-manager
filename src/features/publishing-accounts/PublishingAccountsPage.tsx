import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Network } from 'lucide-react';
import { toast } from 'sonner';

import type { PublishingAccount } from '../../domain/models';
import { publishingChannelLabel } from '../../domain/channels';
import { campaignService } from '../../lib/data';
import { getFriendlyError } from '../../domain/errors';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { ContextMenu, type ContextMenuState } from '../../components/ui/ContextMenu';
import { useAuth } from '../auth/AuthProvider';

const ownershipLabel: Record<PublishingAccount['ownershipType'], string> = {
  SENTIENT_OWNED: 'Sentient-owned',
  CLIENT_OWNED: 'Client-owned',
  EXTERNAL_PARTNER: 'External partner',
};

export function PublishingAccountsPage() {
  const { profile } = useAuth();
  const [accountMenu, setAccountMenu] = useState<
    (ContextMenuState & { account: PublishingAccount }) | null
  >(null);
  const query = useQuery({
    queryKey: ['publishing-accounts', profile?.id],
    queryFn: () => campaignService.listPublishingAccounts(),
    enabled: Boolean(profile),
  });

  if (query.isLoading) return <LoadingState label="Loading channels" />;
  if (query.error) {
    return (
      <ErrorState message={getFriendlyError(query.error)} retry={() => void query.refetch()} />
    );
  }

  const accounts = query.data ?? [];
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Publishing network"
        title="Channels"
        description="Controlled Instagram, X, and LinkedIn account records used to build one publishing checklist per promotion."
      />
      <Card>
        <CardHeader
          title={`${accounts.length} channel account${accounts.length === 1 ? '' : 's'}`}
          description="Channel category, ownership, default creator, and restrictions are managed centrally."
        />
        <div className="grid gap-px bg-[var(--border)] md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <article
              key={account.id}
              className="border border-transparent bg-[var(--surface-raised)] p-5 transition hover:border-[var(--border-strong)]"
              onContextMenuCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setAccountMenu({ x: event.clientX, y: event.clientY, account });
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="grid size-10 place-items-center rounded-lg bg-[var(--acid)]/8 text-[var(--acid-ink)]">
                  <Network className="size-4.5" />
                </div>
                <Badge tone={account.active ? 'success' : 'neutral'}>
                  {account.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="mt-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text)]">
                    {account.accountName}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{account.handle}</p>
                </div>
                <span className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-[var(--text-dim)] uppercase">
                  {publishingChannelLabel[account.platform]}
                </span>
              </div>
              <dl className="mt-5 grid gap-3 border-t border-[var(--border)] pt-4 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-dim)]">Ownership</dt>
                  <dd className="text-right font-medium text-[var(--text-muted)]">
                    {ownershipLabel[account.ownershipType]}
                    {account.partnerName ? ` · ${account.partnerName}` : ''}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-dim)]">Default creator</dt>
                  <dd className="text-right font-medium text-[var(--text-muted)]">
                    {account.defaultPublisherName ?? 'Unassigned'}
                  </dd>
                </div>
              </dl>
              {account.notes ? (
                <p className="mt-4 text-xs leading-5 text-[var(--text-dim)]">{account.notes}</p>
              ) : null}
              <a
                href={account.accountUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--acid-ink)] hover:text-[var(--acid-ink)]"
              >
                Open account <ExternalLink className="size-3.5" />
              </a>
            </article>
          ))}
        </div>
      </Card>
      <ContextMenu
        state={accountMenu}
        onClose={() => setAccountMenu(null)}
        groups={
          accountMenu
            ? [
                {
                  items: [
                    {
                      label: 'Open account',
                      description: 'View channel externally.',
                      icon: <ExternalLink className="size-4" />,
                      onSelect: () => {
                        window.open(accountMenu.account.accountUrl, '_blank', 'noreferrer');
                      },
                    },
                    {
                      label: 'Copy handle',
                      description: 'Copy the channel handle.',
                      icon: <Copy className="size-4" />,
                      onSelect: () => {
                        void navigator.clipboard.writeText(accountMenu.account.handle);
                        toast.success('Handle copied.');
                      },
                    },
                    {
                      label: 'Copy URL',
                      description: 'Copy the full URL.',
                      icon: <Copy className="size-4" />,
                      onSelect: () => {
                        void navigator.clipboard.writeText(accountMenu.account.accountUrl);
                        toast.success('URL copied.');
                      },
                    },
                  ],
                },
              ]
            : []
        }
      />
    </div>
  );
}
