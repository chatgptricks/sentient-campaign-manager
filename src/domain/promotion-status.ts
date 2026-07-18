export const promotionStatuses = [
  'DRAFT',
  'CREATOR_ASSIGNED',
  'CREATIVE_IN_PROGRESS',
  'SUBMITTED_FOR_APPROVAL',
  'REVISION_REQUESTED',
  'APPROVED',
  'PUBLISHER_ASSIGNED',
  'PUBLISHING_IN_PROGRESS',
  'PUBLISHED',
  'VERIFICATION_PENDING',
  'VERIFIED',
  'READY_FOR_INVOICING',
  'INVOICED',
  'CANCELLED',
] as const;

export type PromotionStatus = (typeof promotionStatuses)[number];

export const promotionStatusLabel: Record<PromotionStatus, string> = {
  DRAFT: 'Draft',
  CREATOR_ASSIGNED: 'Creator assigned',
  CREATIVE_IN_PROGRESS: 'Creative in progress',
  SUBMITTED_FOR_APPROVAL: 'Awaiting approval',
  REVISION_REQUESTED: 'Revision requested',
  APPROVED: 'Approved',
  PUBLISHER_ASSIGNED: 'Publisher assigned',
  PUBLISHING_IN_PROGRESS: 'Publishing in progress',
  PUBLISHED: 'Published',
  VERIFICATION_PENDING: 'Verification pending',
  VERIFIED: 'Verified',
  READY_FOR_INVOICING: 'Ready for invoicing',
  INVOICED: 'Invoiced',
  CANCELLED: 'Cancelled',
};

export const statusTone: Record<
  PromotionStatus,
  'neutral' | 'info' | 'attention' | 'success' | 'danger'
> = {
  DRAFT: 'neutral',
  CREATOR_ASSIGNED: 'info',
  CREATIVE_IN_PROGRESS: 'info',
  SUBMITTED_FOR_APPROVAL: 'attention',
  REVISION_REQUESTED: 'danger',
  APPROVED: 'success',
  PUBLISHER_ASSIGNED: 'info',
  PUBLISHING_IN_PROGRESS: 'info',
  PUBLISHED: 'attention',
  VERIFICATION_PENDING: 'attention',
  VERIFIED: 'success',
  READY_FOR_INVOICING: 'attention',
  INVOICED: 'success',
  CANCELLED: 'danger',
};

export const validPromotionTransitions: Readonly<
  Partial<Record<PromotionStatus, readonly PromotionStatus[]>>
> = {
  DRAFT: ['CREATOR_ASSIGNED', 'CANCELLED'],
  CREATOR_ASSIGNED: ['CREATIVE_IN_PROGRESS', 'CANCELLED'],
  CREATIVE_IN_PROGRESS: ['SUBMITTED_FOR_APPROVAL', 'CANCELLED'],
  SUBMITTED_FOR_APPROVAL: ['REVISION_REQUESTED', 'APPROVED', 'CANCELLED'],
  REVISION_REQUESTED: ['CREATIVE_IN_PROGRESS', 'CANCELLED'],
  APPROVED: ['PUBLISHER_ASSIGNED', 'CANCELLED'],
  PUBLISHER_ASSIGNED: ['PUBLISHING_IN_PROGRESS', 'CANCELLED'],
  PUBLISHING_IN_PROGRESS: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['VERIFICATION_PENDING', 'CANCELLED'],
  VERIFICATION_PENDING: ['VERIFIED', 'CANCELLED'],
  VERIFIED: ['READY_FOR_INVOICING', 'CANCELLED'],
  READY_FOR_INVOICING: ['INVOICED', 'CANCELLED'],
  INVOICED: [],
  CANCELLED: [],
};

export function isValidTransition(from: PromotionStatus, to: PromotionStatus) {
  return validPromotionTransitions[from]?.includes(to) ?? false;
}

export const creativeStatuses: readonly PromotionStatus[] = [
  'CREATOR_ASSIGNED',
  'CREATIVE_IN_PROGRESS',
  'REVISION_REQUESTED',
];

export const publishingStatuses: readonly PromotionStatus[] = [
  'APPROVED',
  'PUBLISHER_ASSIGNED',
  'PUBLISHING_IN_PROGRESS',
  'PUBLISHED',
  'VERIFICATION_PENDING',
];
