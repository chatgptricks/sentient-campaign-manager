create or replace function public.current_user_can_invoice_promotion(promotion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.promotions promotion
    where promotion.id = $1
      and promotion.status in ('READY_FOR_INVOICING', 'INVOICED')
      and (
        public._user_has_role(auth.uid(), 'ADMINISTRATOR')
        or public._user_has_role(auth.uid(), 'SALES')
        or public._user_has_role(auth.uid(), 'FINANCE')
      )
  );
$$;
