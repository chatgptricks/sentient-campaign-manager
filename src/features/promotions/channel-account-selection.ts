import type { PublishingChannel } from '../../domain/channels';
import type { PublishingAccount } from '../../domain/models';

export function getSelectablePublishingAccounts(
  accounts: PublishingAccount[],
  platforms: PublishingChannel[],
) {
  const platformSet = new Set(platforms);
  return accounts.filter((account) => platformSet.has(account.platform));
}

export function prunePublishingAccountIds(
  selectedIds: string[],
  accounts: PublishingAccount[],
  platforms: PublishingChannel[],
) {
  const allowedIds = new Set(
    getSelectablePublishingAccounts(accounts, platforms).map((account) => account.id),
  );
  return selectedIds.filter((id) => allowedIds.has(id));
}
