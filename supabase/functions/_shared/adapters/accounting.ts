import type { AccountingAdapter, InvoiceSyncRequest, InvoiceSyncResult } from './contracts.ts';

export class ManualAccountingAdapter implements AccountingAdapter {
  readonly configured = true;
  readonly provider = 'MANUAL_ACCOUNTING';

  async createInvoice(request: InvoiceSyncRequest): Promise<InvoiceSyncResult> {
    const reference = request.invoiceNumber ?? request.invoiceId;
    return {
      message: `Invoice ${reference} remains in local status ${request.localStatus}; issue or reconcile it manually before changing the local status.`,
      mode: 'MANUAL',
      status: 'MANUAL_REQUIRED',
    };
  }
}
