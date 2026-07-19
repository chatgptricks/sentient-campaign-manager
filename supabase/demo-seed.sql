-- Demo Seed Script for Sentient CRM
-- WARNING: Do not run this in production without modifying the role variables.

do $$
declare
  admin_id uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  sales_id uuid := '22222222-2222-4222-8222-222222222222'::uuid;
  creator_id uuid := '33333333-3333-4333-8333-333333333333'::uuid;
  client_1 jsonb;
  client_2 jsonb;
  client_3 jsonb;
  promo_1 jsonb;
  promo_2 jsonb;
  promo_3 jsonb;
  promo_4 jsonb;
  promo_5 jsonb;
  promo_6 jsonb;
  promo_7 jsonb;
  ver int;
  res jsonb;
  sub jsonb;
begin
  -- Set request context to simulate the Administrator user calling the APIs
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', admin_id), true);

  -- Create Clients
  client_1 := public.create_client('{"name": "Arcadia Hotels", "billingEmail": "billing@arcadia.example.com", "billingAddress": "123 Resort Way"}');
  client_2 := public.create_client('{"name": "Nimbus Tech", "billingEmail": "finance@nimbustech.example.com", "billingAddress": "456 Cloud Blvd"}');
  client_3 := public.create_client('{"name": "Lumina Apparel", "billingEmail": "pay@lumina.example.com", "billingAddress": "789 Fashion St"}');

  -- Create Promotions

  -- 1. DRAFT (Intake)
  promo_1 := public.create_promotion(jsonb_build_object(
    'client_id', client_1->>'id',
    'title', 'Summer Getaway Campaign',
    'description', 'Promote summer discounts across all luxury properties.',
    'sales_owner_id', sales_id,
    'due_date', (current_date + interval '30 days')::date::text
  ));

  -- 2. CREATOR_ASSIGNED
  promo_2 := public.create_promotion(jsonb_build_object(
    'client_id', client_2->>'id',
    'title', 'Cloud Migration Webinar',
    'description', 'B2B webinar on seamless cloud transitions.',
    'sales_owner_id', sales_id,
    'due_date', (current_date + interval '14 days')::date::text
  ));
  ver := (promo_2->>'version')::int;
  perform public.assign_promotion_role((promo_2->>'id')::uuid, 'CREATOR', creator_id, ver);

  -- 3. CREATIVE_IN_PROGRESS
  promo_3 := public.create_promotion(jsonb_build_object(
    'client_id', client_3->>'id',
    'title', 'Fall Collection Launch',
    'description', 'Social media blitz for the new autumn line.',
    'sales_owner_id', sales_id,
    'due_date', (current_date + interval '5 days')::date::text
  ));
  ver := (promo_3->>'version')::int;
  perform public.assign_promotion_role((promo_3->>'id')::uuid, 'CREATOR', creator_id, ver); ver := ver + 1;
  
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', creator_id), true);
  perform public.start_creative_work((promo_3->>'id')::uuid, ver);
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', admin_id), true);

  -- 4. SUBMITTED_FOR_APPROVAL
  promo_4 := public.create_promotion(jsonb_build_object(
    'client_id', client_1->>'id',
    'title', 'Arcadia Rewards Loyalty Push',
    'description', 'Highlight new tiers in the loyalty program.',
    'sales_owner_id', sales_id,
    'due_date', (current_date + interval '2 days')::date::text
  ));
  ver := (promo_4->>'version')::int;
  perform public.assign_promotion_role((promo_4->>'id')::uuid, 'CREATOR', creator_id, ver); ver := ver + 1;
  
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', creator_id), true);
  perform public.start_creative_work((promo_4->>'id')::uuid, ver); ver := ver + 1;
  res := public.attach_resource_link((promo_4->>'id')::uuid, '{"display_name": "Draft v1", "resource_type": "DOCUMENT", "provider": "GOOGLE_DRIVE", "url": "https://drive.google.com/test"}'::jsonb); ver := ver + 1;
  update public.promotion_resource_links set validation_status = 'VALID' where id = (res->'resource'->>'id')::uuid;
  sub := public.submit_for_approval((promo_4->>'id')::uuid, (res->'resource'->>'id')::uuid, ver);
  
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', admin_id), true);

  -- 5. APPROVED (Ready to publish)
  promo_5 := public.create_promotion(jsonb_build_object(
    'client_id', client_2->>'id',
    'title', 'Enterprise Security Whitepaper',
    'description', 'Lead gen campaign for Q3 security guide.',
    'sales_owner_id', sales_id,
    'due_date', (current_date)::date::text
  ));
  ver := (promo_5->>'version')::int;
  perform public.assign_promotion_role((promo_5->>'id')::uuid, 'CREATOR', creator_id, ver); ver := ver + 1;
  
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', creator_id), true);
  perform public.start_creative_work((promo_5->>'id')::uuid, ver); ver := ver + 1;
  res := public.attach_resource_link((promo_5->>'id')::uuid, '{"display_name": "Final Design", "resource_type": "DOCUMENT", "provider": "CANVA", "url": "https://canva.com/test"}'::jsonb); ver := ver + 1;
  update public.promotion_resource_links set validation_status = 'VALID' where id = (res->'resource'->>'id')::uuid;
  sub := public.submit_for_approval((promo_5->>'id')::uuid, (res->'resource'->>'id')::uuid, ver); ver := ver + 1;
  
  perform public.decide_approval((sub->'submission'->>'id')::uuid, 'APPROVED', 'Looks great, proceed.', ver); ver := ver + 1;
  
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', admin_id), true);

  -- 6. VERIFIED
  promo_6 := public.create_promotion(jsonb_build_object(
    'client_id', client_3->>'id',
    'title', 'Winter Clearance Event',
    'description', 'End of season sale promotion.',
    'sales_owner_id', sales_id,
    'due_date', (current_date - interval '5 days')::date::text
  ));
  ver := (promo_6->>'version')::int;
  perform public.assign_promotion_role((promo_6->>'id')::uuid, 'CREATOR', creator_id, ver); ver := ver + 1;
  
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', creator_id), true);
  perform public.start_creative_work((promo_6->>'id')::uuid, ver); ver := ver + 1;
  res := public.attach_resource_link((promo_6->>'id')::uuid, '{"display_name": "Final Video", "resource_type": "VIDEO", "provider": "DROPBOX", "url": "https://dropbox.com/test"}'::jsonb); ver := ver + 1;
  update public.promotion_resource_links set validation_status = 'VALID' where id = (res->'resource'->>'id')::uuid;
  sub := public.submit_for_approval((promo_6->>'id')::uuid, (res->'resource'->>'id')::uuid, ver); ver := ver + 1;
  
  perform public.decide_approval((sub->'submission'->>'id')::uuid, 'APPROVED', 'Approved.', ver); ver := ver + 1;
  
  perform public.start_publishing((promo_6->>'id')::uuid, ver); ver := ver + 1;
  res := public.record_publication((promo_6->>'id')::uuid, jsonb_build_object('provider', 'INSTAGRAM', 'destination', '@sentient.agency', 'publication_url', 'https://instagram.com/p/12345', 'artifact_resource_link_id', (res->'resource'->>'id')::text, 'notes', 'Published on time.'), ver); ver := ver + 1;
  
  -- Use the returned publication ID for verification
  perform public.request_publication_verification((res->'publication'->>'id')::uuid, ver); ver := ver + 1;
  
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', admin_id), true);
  perform public.record_publication_verification((res->'publication'->>'id')::uuid, jsonb_build_object('status', 'VERIFIED', 'notes', 'Checked manually.'), ver); ver := ver + 1;
  perform public.complete_verified_workflow((promo_6->>'id')::uuid, ver);

  -- 7. INVOICED
  promo_7 := public.create_promotion(jsonb_build_object(
    'client_id', client_1->>'id',
    'title', 'Spring Break Promo',
    'description', 'Previous campaign for spring travel.',
    'sales_owner_id', sales_id,
    'due_date', (current_date - interval '30 days')::date::text
  ));
  ver := (promo_7->>'version')::int;
  perform public.assign_promotion_role((promo_7->>'id')::uuid, 'CREATOR', creator_id, ver); ver := ver + 1;
  
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', creator_id), true);
  perform public.start_creative_work((promo_7->>'id')::uuid, ver); ver := ver + 1;
  res := public.attach_resource_link((promo_7->>'id')::uuid, '{"display_name": "Spring Ads", "resource_type": "DOCUMENT", "provider": "GOOGLE_DRIVE", "url": "https://drive.google.com/test2"}'::jsonb); ver := ver + 1;
  update public.promotion_resource_links set validation_status = 'VALID' where id = (res->'resource'->>'id')::uuid;
  sub := public.submit_for_approval((promo_7->>'id')::uuid, (res->'resource'->>'id')::uuid, ver); ver := ver + 1;
  
  perform public.decide_approval((sub->'submission'->>'id')::uuid, 'APPROVED', 'Approved.', ver); ver := ver + 1;
  
  perform public.start_publishing((promo_7->>'id')::uuid, ver); ver := ver + 1;
  res := public.record_publication((promo_7->>'id')::uuid, jsonb_build_object('provider', 'LINKEDIN', 'destination', 'sentient-agency', 'publication_url', 'https://linkedin.com/p/67890', 'artifact_resource_link_id', (res->'resource'->>'id')::text, 'notes', 'Published early.'), ver); ver := ver + 1;
  
  perform public.request_publication_verification((res->'publication'->>'id')::uuid, ver); ver := ver + 1;
  
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', admin_id), true);
  perform public.record_publication_verification((res->'publication'->>'id')::uuid, jsonb_build_object('status', 'VERIFIED', 'notes', 'All good.'), ver); ver := ver + 1;
  perform public.complete_verified_workflow((promo_7->>'id')::uuid, ver); ver := ver + 1;
  
  perform public.create_invoice((promo_7->>'id')::uuid, jsonb_build_object('amount', 5000, 'currency', 'USD', 'invoice_number', 'INV-2026-001', 'notes', 'Standard fee.'), ver);

end;
$$;
