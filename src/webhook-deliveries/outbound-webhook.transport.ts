export const OUTBOUND_WEBHOOK_TRANSPORT = Symbol('OUTBOUND_WEBHOOK_TRANSPORT');

export type OutboundWebhookRequest = {
  url: string;
  body: string;
  headers: Record<string, string>;
};
export interface OutboundWebhookTransport {
  deliver(request: OutboundWebhookRequest): Promise<{ status: number }>;
}
