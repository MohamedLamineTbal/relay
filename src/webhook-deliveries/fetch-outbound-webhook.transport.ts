import { Injectable } from '@nestjs/common';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type {
  OutboundWebhookRequest,
  OutboundWebhookTransport,
} from './outbound-webhook.transport';
import { OutboundDestinationPolicy } from './outbound-destination.policy';

@Injectable()
export class FetchOutboundWebhookTransport implements OutboundWebhookTransport {
  constructor(private readonly policy: OutboundDestinationPolicy) {}
  async deliver(request: OutboundWebhookRequest) {
    const [address] = await this.policy.assertSafe(request.url);
    const url = new URL(request.url);
    return new Promise<{ status: number }>((resolve, reject) => {
      const outgoing = httpsRequest(
        url,
        {
          method: 'POST',
          headers: request.headers,
          servername: url.hostname,
          lookup: (_hostname, _options, callback) =>
            callback(null, address, isIP(address)),
        },
        (response) => {
          response.resume();
          resolve({ status: response.statusCode ?? 0 });
        },
      );
      outgoing.setTimeout(5000, () => {
        const error = new Error('Destination request timed out');
        error.name = 'TimeoutError';
        outgoing.destroy(error);
      });
      outgoing.on('error', reject);
      outgoing.end(request.body);
    });
  }
}
