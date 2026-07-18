import { ManualAccountingAdapter } from '../adapters/accounting.ts';
import type { DatabaseClient } from '../database.ts';
import { databaseError, HttpError } from '../errors.ts';
import { executeIdempotently, recordIntegrationAttempt } from '../idempotency.ts';

export async function syncInvoiceRecord(
  client: DatabaseClient,
  invoiceId: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const { data: invoice, error } = await client
    .from('invoices')
    .select(
      'id,promotion_id,client_id,invoice_number,external_invoice_id,amount,currency,status,updated_at',
    )
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw databaseError(error, 'Invoice could not be loaded.');
  if (!invoice) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found.');

  const adapter = new ManualAccountingAdapter();
  return executeIdempotently(client, adapter.provider, 'SYNC_INVOICE', idempotencyKey, async () => {
    const result = await adapter.createInvoice({
      amount: Number(invoice.amount),
      clientId: invoice.client_id,
      currency: invoice.currency,
      externalInvoiceId: invoice.external_invoice_id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      localStatus: invoice.status,
      promotionId: invoice.promotion_id,
    });
    const response = {
      invoiceId: invoice.id,
      localStatus: invoice.status,
      message: result.message,
      mode: result.mode,
      status: result.status,
    };
    await recordIntegrationAttempt(client, {
      aggregateId: invoice.promotion_id,
      idempotencyKey,
      operation: 'SYNC_INVOICE',
      provider: adapter.provider,
      requestMetadata: { invoiceId },
      responseMetadata: response,
      status: 'SUCCEEDED',
    });
    return response;
  });
}
