import type { PublicationReference, PublishingAdapter, VerificationResult } from './contracts.ts';
import { validateSafeExternalUrl, type DnsResolver } from '../ssrf.ts';

export class ManualPublishingAdapter implements PublishingAdapter {
  readonly provider = 'MANUAL';

  constructor(private readonly resolveDns?: DnsResolver) {}

  async verify(reference: PublicationReference): Promise<VerificationResult> {
    await validateSafeExternalUrl(reference.url, {
      provider: 'OTHER',
      resolveDns: this.resolveDns,
    });
    if (!reference.manualStatus) {
      return {
        details: {
          manualActionRequired: true,
          message: 'No provider verification adapter is configured.',
        },
        method: 'AUTOMATED_CHECK',
        status: 'UNAVAILABLE',
      };
    }
    return {
      details: {
        ...(reference.manualDetails ?? {}),
        manuallyConfirmed: true,
      },
      method: 'MANUAL',
      status: reference.manualStatus,
    };
  }
}
