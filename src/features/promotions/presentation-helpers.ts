import type { Promotion, PromotionDetail } from '../../domain/models';

export function getCurrentOwnerName(promotion: Promotion) {
  if (['SUBMITTED_FOR_APPROVAL', 'APPROVED'].includes(promotion.status)) {
    return promotion.approverName ?? 'Approver not assigned';
  }
  if (
    ['CREATOR_ASSIGNED', 'CREATIVE_IN_PROGRESS', 'REVISION_REQUESTED'].includes(promotion.status)
  ) {
    return promotion.creatorName ?? 'Creator not assigned';
  }
  if (
    ['PUBLISHER_ASSIGNED', 'PUBLISHING_IN_PROGRESS', 'PUBLISHED', 'VERIFICATION_PENDING'].includes(
      promotion.status,
    )
  ) {
    return promotion.publisherName ?? 'Publisher not assigned';
  }
  return promotion.salesOwnerName;
}

export function toLocalDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
