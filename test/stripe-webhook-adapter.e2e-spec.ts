import Stripe from 'stripe';
import { StripeWebhookAdapter } from '../src/webhooks/stripe-webhook.adapter';

describe('Stripe webhook adapter', () => {
  const webhookSecret = 'whsec_test_payment_saas';
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const adapter = new StripeWebhookAdapter();

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_payment_saas';
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  });

  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = originalSecretKey;
    process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
  });

  it('does not normalize a partial charge refund as a fully refunded payment', () => {
    const payload = JSON.stringify({
      id: 'evt_partial_refund',
      object: 'event',
      account: 'acct_connected_workspace',
      created: 1_785_927_600,
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_partial_refund',
          object: 'charge',
          payment_intent: 'pi_partial_refund',
          amount: 10_000,
          amount_refunded: 4_000,
          refunded: false,
        },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    expect(adapter.verifyAndNormalize(Buffer.from(payload), signature)).toEqual(
      {
        id: 'evt_partial_refund',
        connectedAccountId: 'acct_connected_workspace',
        providerType: 'charge.refunded',
        type: 'UNSUPPORTED',
        occurredAt: new Date('2026-08-05T11:00:00.000Z'),
        providerCheckoutSessionId: null,
        providerPaymentIntentId: 'pi_partial_refund',
        paymentRequestPublicId: null,
      },
    );
  });
});
