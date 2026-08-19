import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type EmailProvider,
  PaymentEmailProviderError,
  type SendPaymentEmailInput,
  type SentPaymentEmail,
} from './email-provider';

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly config: ConfigService) {}

  async sendPaymentEmail(
    input: SendPaymentEmailInput,
  ): Promise<SentPaymentEmail> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException('Payment email is not configured');
    }

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
          'User-Agent': 'payment-saas/1.0',
        },
        body: JSON.stringify({
          from: input.from,
          reply_to: [input.replyTo],
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });
    } catch {
      throw new PaymentEmailProviderError('TRANSIENT', 'PROVIDER_UNAVAILABLE');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const providerCode =
      typeof payload === 'object' &&
      payload !== null &&
      'name' in payload &&
      typeof payload.name === 'string'
        ? payload.name
        : null;
    const messageId =
      typeof payload === 'object' &&
      payload !== null &&
      'id' in payload &&
      typeof payload.id === 'string'
        ? payload.id
        : null;

    if (!response.ok || !messageId) {
      const transientCodes = new Set([
        'concurrent_idempotent_requests',
        'monthly_quota_exceeded',
        'daily_quota_exceeded',
        'rate_limit_exceeded',
        'application_error',
        'internal_server_error',
      ]);
      const transient =
        response.status === 429 ||
        response.status >= 500 ||
        (providerCode !== null && transientCodes.has(providerCode));
      throw new PaymentEmailProviderError(
        transient ? 'TRANSIENT' : 'PERMANENT',
        transient ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED',
      );
    }

    return { messageId };
  }
}
