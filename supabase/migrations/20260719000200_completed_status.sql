-- Add COMPLETED status to the promotion_status enum
-- Functions referencing this new value are in 20260719000300_completed_status_functions.sql
-- because PostgreSQL requires a transaction boundary between ALTER TYPE ADD VALUE
-- and any function body that references the new enum literal (SQLSTATE 55P04).
alter type public.promotion_status add value if not exists 'COMPLETED' after 'INVOICED';
