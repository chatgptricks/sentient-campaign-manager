import type { Promotion, PromotionDetail } from '../../domain/models';

const creatorOwnedStatuses = [
  'CREATOR_ASSIGNED',
  'CREATIVE_IN_PROGRESS',
  'REVISION_REQUESTED',
  'SUBMITTED_FOR_APPROVAL',
  'APPROVED',
  'PUBLISHING_IN_PROGRESS',
];

export function getCurrentOwnerName(promotion: Promotion) {
  if (creatorOwnedStatuses.includes(promotion.status)) {
    return promotion.creatorName ?? 'Creator not assigned';
  }
  return promotion.salesOwnerName;
}

export function toLocalDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Inbound reference material for the Resources tab: the brief plus supporting links.
 * Creative files produced for the promotion are separate and live in the Creative tab.
 */
export function getReferenceMaterial(metadata: PromotionDetail['metadata']) {
  if (!metadata) return [];
  const entries: { group: string; url: string }[] = [];
  if (metadata.briefUrl) entries.push({ group: 'Brief', url: metadata.briefUrl });
  for (const url of metadata.clientMaterialLinks ?? []) {
    entries.push({ group: 'Client material', url });
  }
  for (const url of metadata.externalResourceLinks ?? []) {
    entries.push({ group: 'Supporting link', url });
  }
  return entries;
}

export function getApprovedPublicationResources(
  detail: Pick<PromotionDetail, 'resources' | 'submissions'>,
) {
  const approvedResourceIds = new Set(
    detail.submissions
      .filter((submission) => submission.state === 'APPROVED')
      .map((submission) => submission.resourceLinkId),
  );
  return detail.resources.filter(
    (resource) => !resource.archivedAt && approvedResourceIds.has(resource.id),
  );
}
