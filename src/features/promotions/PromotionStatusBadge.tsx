import type { PromotionStatus } from '../../domain/promotion-status';
import { promotionStatusLabel, statusTone } from '../../domain/promotion-status';
import { Badge } from '../../components/ui/Badge';

export function PromotionStatusBadge({ status }: { status: PromotionStatus }) {
  return <Badge tone={statusTone[status]}>{promotionStatusLabel[status]}</Badge>;
}
