import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../src/payment-requests/payment-provider';
import {
  STRIPE_CONNECT_PROVIDER,
  type StripeConnectProvider,
} from '../src/stripe-connect/stripe-connect.provider';
import {
  STRIPE_WEBHOOK_PROVIDER,
  type StripeWebhookProvider,
  type VerifiedPaymentEvent,
} from '../src/webhooks/stripe-webhook.provider';
import {
  OUTBOUND_WEBHOOK_TRANSPORT,
  type OutboundWebhookRequest,
  type OutboundWebhookTransport,
} from '../src/webhook-deliveries/outbound-webhook.transport';
import {
  DESTINATION_RESOLVER,
  type DestinationResolver,
} from '../src/webhook-deliveries/destination-resolver';

type LoginResponse = { accessToken: string };
type CustomerResponse = { id: number };
type PaymentResponse = { publicId: string };
type ConfiguredDestination = { url: string; signingSecret: string };
type DeliveryAttemptResponse = {
  attemptNumber: number;
  outcome: string;
  attemptedAt: string;
  destination: { url: string };
  event: { paymentPublicId: string };
};

describe('Workspace webhook deliveries', () => {
  let app: INestApplication<App>;
  let connectedAccountId = '';
  let checkoutSessionId = '';
  let paymentIntentId = '';
  const events = new Map<string, VerifiedPaymentEvent>();
  const outboundRequests: OutboundWebhookRequest[] = [];
  let deliveryResult: { status: number } | Error | 'HANG' = { status: 204 };
  let resolvedAddresses = ['8.8.8.8'];
  const stripeConnectProvider: StripeConnectProvider = {
    createAccount: () => Promise.resolve({ id: connectedAccountId }),
    createOnboardingLink: () =>
      Promise.resolve({ url: 'https://connect.stripe.test/outbound' }),
    getAccountStatus: () =>
      Promise.resolve({ onboardingComplete: true, paymentsReady: true }),
  };
  const paymentProvider: PaymentProvider = {
    createCheckout: () =>
      Promise.resolve({
        id: checkoutSessionId,
        paymentIntentId,
        url: 'https://checkout.stripe.test/outbound',
      }),
  };
  const stripeWebhookProvider: StripeWebhookProvider = {
    verifyAndNormalize(_payload, signature) {
      const event = events.get(signature);
      if (!event) throw new Error('Unknown outbound test event');
      return event;
    },
  };
  const outboundTransport: OutboundWebhookTransport = {
    deliver(request) {
      outboundRequests.push(request);
      if (deliveryResult === 'HANG') {
        return new Promise(() => undefined);
      }
      return deliveryResult instanceof Error
        ? Promise.reject(deliveryResult)
        : Promise.resolve(deliveryResult);
    },
  };
  const destinationResolver: DestinationResolver = {
    resolve: () => Promise.resolve(resolvedAddresses),
  };

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = '11'.repeat(32);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(STRIPE_CONNECT_PROVIDER)
      .useValue(stripeConnectProvider)
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(paymentProvider)
      .overrideProvider(STRIPE_WEBHOOK_PROVIDER)
      .useValue(stripeWebhookProvider)
      .overrideProvider(OUTBOUND_WEBHOOK_TRANSPORT)
      .useValue(outboundTransport)
      .overrideProvider(DESTINATION_RESOLVER)
      .useValue(destinationResolver)
      .compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  beforeEach(() => {
    connectedAccountId = `acct_${randomUUID()}`;
    checkoutSessionId = `cs_${randomUUID()}`;
    paymentIntentId = `pi_${randomUUID()}`;
    events.clear();
    outboundRequests.length = 0;
    deliveryResult = { status: 204 };
    resolvedAddresses = ['8.8.8.8'];
  });

  async function registerOwner() {
    const email = `owner-${randomUUID()}@example.com`;
    const password = 'correct horse battery staple';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return (login.body as LoginResponse).accessToken;
  }

  async function createPayment(accessToken: string) {
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Delivery Buyer' })
      .expect(201);
    const payment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: (customer.body as CustomerResponse).id,
        amount: 5000,
        currency: 'usd',
        description: 'Delivery payment',
      })
      .expect(201);
    return payment.body as PaymentResponse;
  }

  async function waitForOutboundRequestCount(count: number) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (outboundRequests.length >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected ${count} outbound webhook request(s)`);
  }

  async function deliverPaidEvent(accessToken: string, signature: string) {
    const expectedRequestCount = outboundRequests.length + 1;
    const payment = await createPayment(accessToken);
    const providerEventId = `evt_${randomUUID()}`;
    events.set(signature, {
      id: providerEventId,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T17:00:00.000Z'),
      providerCheckoutSessionId: checkoutSessionId,
      providerPaymentIntentId: paymentIntentId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', signature)
      .send({ stripe: true })
      .expect(200);
    await waitForOutboundRequestCount(expectedRequestCount);
    return { payment, providerEventId };
  }

  it('returns a signing secret only when configuring the active destination', async () => {
    const accessToken = await registerOwner();
    const url = 'https://hooks.example.test/payments';
    const configured = await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url })
      .expect(200);
    const configuredBody = configured.body as unknown as ConfiguredDestination;

    expect(configuredBody).toMatchObject({ url });
    expect(configuredBody.signingSecret).toMatch(/^pms_whsec_[a-f0-9]{64}$/);

    const inspected = await request(app.getHttpServer())
      .get('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(inspected.body).toMatchObject({ url });
    expect(inspected.body).not.toHaveProperty('signingSecret');
  });

  it('rejects destinations that resolve to private network addresses', async () => {
    resolvedAddresses = ['127.0.0.1'];
    const accessToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://internal.example.test/hooks' })
      .expect(400, {
        message: 'Webhook destination must resolve to public HTTPS addresses',
        error: 'Bad Request',
        statusCode: 400,
      });
  });

  it.each([
    ['deprecated site-local IPv6', ['fec0::1']],
    ['multicast IPv6', ['ff02::1']],
    ['mixed global and special IPv6', ['2606:4700:4700::1111', 'ff02::1']],
  ])('rejects %s destinations', async (_label, addresses) => {
    resolvedAddresses = addresses;
    const accessToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://ipv6.example.test/hooks' })
      .expect(400);
  });

  it('sends a signed lifecycle update and records a successful attempt', async () => {
    const accessToken = await registerOwner();
    const configured = await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/payments' })
      .expect(200);
    const signingSecret = (configured.body as unknown as ConfiguredDestination)
      .signingSecret;
    const payment = await createPayment(accessToken);
    const providerEventId = `evt_${randomUUID()}`;
    events.set('paid-event', {
      id: providerEventId,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T17:00:00.000Z'),
      providerCheckoutSessionId: checkoutSessionId,
      providerPaymentIntentId: paymentIntentId,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'paid-event')
      .send({ stripe: true })
      .expect(200);
    await waitForOutboundRequestCount(1);

    expect(outboundRequests).toHaveLength(1);
    const delivered = outboundRequests[0];
    const signature = delivered.headers['Payment-Signature'];
    const [timestampPart, signaturePart] = signature.split(',');
    const timestamp = timestampPart.slice(2);
    expect(signaturePart).toBe(
      `v1=${createHmac('sha256', signingSecret).update(`${timestamp}.${delivered.body}`).digest('hex')}`,
    );
    expect(JSON.parse(delivered.body)).toEqual({
      id: providerEventId,
      type: 'payment.paid',
      occurredAt: '2026-08-06T17:00:00.000Z',
      data: { payment: { publicId: payment.publicId, status: 'PAID' } },
    });

    const history = await request(app.getHttpServer())
      .get('/webhook-deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({
        outcome: 'DELIVERED',
        responseStatus: 204,
        failureSummary: null,
        event: {
          id: providerEventId,
          type: 'payment.paid',
          paymentPublicId: payment.publicId,
        },
      }),
    ]);
  });

  it('records a non-2xx destination response as failed', async () => {
    deliveryResult = { status: 503 };
    const accessToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/failing' })
      .expect(200);
    await deliverPaidEvent(accessToken, 'non-2xx-event');
    const history = await request(app.getHttpServer())
      .get('/webhook-deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({
        outcome: 'FAILED',
        responseStatus: 503,
        failureSummary: 'Destination returned HTTP 503',
      }),
    ]);
  });

  it('records a timeout safely without failing the inbound webhook', async () => {
    const timeout = new Error('private socket details');
    timeout.name = 'TimeoutError';
    deliveryResult = timeout;
    const accessToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/timeout' })
      .expect(200);
    await deliverPaidEvent(accessToken, 'timeout-event');
    const history = await request(app.getHttpServer())
      .get('/webhook-deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({
        outcome: 'FAILED',
        responseStatus: null,
        failureSummary: 'Destination request timed out',
      }),
    ]);
    expect(JSON.stringify(history.body)).not.toContain(
      'private socket details',
    );
  });

  it('acknowledges Stripe without waiting for a hanging destination', async () => {
    deliveryResult = 'HANG';
    const accessToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/hanging' })
      .expect(200);
    const payment = await createPayment(accessToken);
    events.set('hanging-event', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T17:00:00.000Z'),
      providerCheckoutSessionId: checkoutSessionId,
      providerPaymentIntentId: paymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'hanging-event')
      .send({})
      .timeout({ response: 1000, deadline: 1500 })
      .expect(200);
    await waitForOutboundRequestCount(1);
  });

  it('records a network failure with a safe summary', async () => {
    deliveryResult = new Error('getaddrinfo ENOTFOUND internal-hostname');
    const accessToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/network' })
      .expect(200);
    await deliverPaidEvent(accessToken, 'network-event');
    const history = await request(app.getHttpServer())
      .get('/webhook-deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({
        outcome: 'FAILED',
        responseStatus: null,
        failureSummary: 'Destination network request failed',
      }),
    ]);
    expect(JSON.stringify(history.body)).not.toContain('internal-hostname');
  });

  it('filters delivery history by outcome and payment', async () => {
    const accessToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/filters' })
      .expect(200);
    const delivered = await deliverPaidEvent(accessToken, 'filter-delivered');
    checkoutSessionId = `cs_${randomUUID()}`;
    paymentIntentId = `pi_${randomUUID()}`;
    deliveryResult = { status: 500 };
    const failed = await deliverPaidEvent(accessToken, 'filter-failed');

    const failures = await request(app.getHttpServer())
      .get('/webhook-deliveries?outcome=FAILED')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const failureBody = failures.body as unknown as DeliveryAttemptResponse[];
    expect(failureBody).toHaveLength(1);
    expect(failureBody[0].event.paymentPublicId).toBe(failed.payment.publicId);
    const paymentHistory = await request(app.getHttpServer())
      .get(`/webhook-deliveries?paymentPublicId=${delivered.payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const paymentHistoryBody =
      paymentHistory.body as unknown as DeliveryAttemptResponse[];
    expect(paymentHistoryBody).toHaveLength(1);
    expect(paymentHistoryBody[0].outcome).toBe('DELIVERED');
  });

  it('replaces the signing secret and signs future deliveries only with the new secret', async () => {
    const accessToken = await registerOwner();
    const first = await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/rotate' })
      .expect(200);
    const second = await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/rotate' })
      .expect(200);
    const firstBody = first.body as unknown as ConfiguredDestination;
    const secondBody = second.body as unknown as ConfiguredDestination;
    expect(secondBody.signingSecret).not.toBe(firstBody.signingSecret);
    await deliverPaidEvent(accessToken, 'rotated-secret-event');
    const delivered = outboundRequests[0];
    const [timestampPart, signaturePart] =
      delivered.headers['Payment-Signature'].split(',');
    const signed = `${timestampPart.slice(2)}.${delivered.body}`;
    expect(signaturePart).toBe(
      `v1=${createHmac('sha256', secondBody.signingSecret)
        .update(signed)
        .digest('hex')}`,
    );
    expect(signaturePart).not.toBe(
      `v1=${createHmac('sha256', firstBody.signingSecret)
        .update(signed)
        .digest('hex')}`,
    );
  });

  it('keeps destination configuration and delivery history isolated by workspace', async () => {
    const firstToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ url: 'https://hooks.example.test/private' })
      .expect(200);
    await deliverPaidEvent(firstToken, 'private-event');
    const secondToken = await registerOwner();
    await request(app.getHttpServer())
      .get('/webhook-destination')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/webhook-deliveries')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200, []);
    const firstHistory = await request(app.getHttpServer())
      .get('/webhook-deliveries')
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);
    expect(firstHistory.body).toHaveLength(1);
  });

  it('keeps the attempted destination URL after configuration changes', async () => {
    const accessToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/original' })
      .expect(200);
    await deliverPaidEvent(accessToken, 'destination-snapshot-event');
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/replacement' })
      .expect(200);
    const history = await request(app.getHttpServer())
      .get('/webhook-deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const historyBody = history.body as unknown as DeliveryAttemptResponse[];
    expect(historyBody).toHaveLength(1);
    expect(historyBody[0].destination).toEqual({
      url: 'https://hooks.example.test/original',
    });
    expect(Number.isNaN(Date.parse(historyBody[0].attemptedAt))).toBe(false);
  });

  it('delivers every newly valid lifecycle transition after out-of-order events', async () => {
    const accessToken = await registerOwner();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/out-of-order' })
      .expect(200);
    await createPayment(accessToken);
    events.set('refund-first', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'charge.refunded',
      type: 'PAYMENT_REFUNDED',
      occurredAt: new Date('2026-08-06T18:05:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId: paymentIntentId,
    });
    events.set('completion-second', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T18:00:00.000Z'),
      providerCheckoutSessionId: checkoutSessionId,
      providerPaymentIntentId: paymentIntentId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'refund-first')
      .send({})
      .expect(200);
    expect(outboundRequests).toHaveLength(0);
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'completion-second')
      .send({})
      .expect(200);
    await waitForOutboundRequestCount(2);
    expect(
      outboundRequests.map(
        ({ body }) => (JSON.parse(body) as { type: string }).type,
      ),
    ).toEqual(['payment.paid', 'payment.refunded']);
    const history = await request(app.getHttpServer())
      .get('/webhook-deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      (history.body as unknown as Array<{ event: { type: string } }>).map(
        ({ event }) => event.type,
      ),
    ).toEqual(['payment.paid', 'payment.refunded']);
  });

  it('does not retroactively deliver events received before configuration', async () => {
    const accessToken = await registerOwner();
    const payment = await createPayment(accessToken);
    events.set('paid-before-configuration', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T19:00:00.000Z'),
      providerCheckoutSessionId: checkoutSessionId,
      providerPaymentIntentId: paymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'paid-before-configuration')
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/future-only' })
      .expect(200);
    events.set('refund-after-configuration', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'charge.refunded',
      type: 'PAYMENT_REFUNDED',
      occurredAt: new Date('2026-08-06T19:05:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId: paymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'refund-after-configuration')
      .send({})
      .expect(200);
    await waitForOutboundRequestCount(1);
    expect(
      outboundRequests.map(
        ({ body }) => (JSON.parse(body) as { type: string }).type,
      ),
    ).toEqual(['payment.refunded']);
  });

  afterAll(async () => app?.close());
});
