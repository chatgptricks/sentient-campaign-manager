import type { PromotionDetail } from '../../domain/models';

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
