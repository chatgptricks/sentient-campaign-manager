import { requireInternalOrRoles } from '../_shared/auth/index.ts';
import { createServiceClient } from '../_shared/database.ts';
import { assertMethod, assertUuid } from '../_shared/errors.ts';
import { functionHandler } from '../_shared/function-handler.ts';
import { jsonResponse, readJson } from '../_shared/http.ts';
import { requestIdempotencyKey } from '../_shared/idempotency.ts';
import { serve } from '../_shared/runtime.ts';
import { syncInvoiceRecord } from '../_shared/services/invoice-sync.ts';

type SyncInvoiceBody = { invoiceId?: string; invoice_id?: string };

export const handleRequest = functionHandler('sync-invoice', async (request) => {
  assertMethod(request);
  await requireInternalOrRoles(request, ['FINANCE', 'ADMINISTRATOR']);
  const body = await readJson<SyncInvoiceBody>(request);
  const invoiceId = body.invoiceId ?? body.invoice_id;
  assertUuid(invoiceId, 'invoiceId');
  const key = requestIdempotencyKey(request, `invoice:${invoiceId}:sync`);
  const result = await syncInvoiceRecord(createServiceClient(), invoiceId, key);
  return jsonResponse(request, result);
});

serve(handleRequest);
