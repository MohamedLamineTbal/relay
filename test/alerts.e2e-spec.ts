import { randomUUID } from 'node:crypto';
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
  InvalidWebhookSignatureError,
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
type AlertResponse = {
  id: string;
  type: 'PAYMENT_PROCESSING_FAILED' | 'WEBHOOK_DELIVERY_FAILED';
  status: 'ACTIVE' | 'ACKNOWLEDGED';
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { email: string } | null;
  payment?: { publicId: string };
  delivery?: { id: string; attemptNumber: number };
};

describe('Operational alerts', () => {
  let app: INestApplication<App>;
  let connectedAccountId = '';
  let providerCheckoutSessionId = '';
  let providerPaymentIntentId = '';
  const events = new Map<string, VerifiedPaymentEvent>();
  const outboundRequests: OutboundWebhookRequest[] = [];
  let outboundStatus = 204;
  const stripeConnectProvider: StripeConnectProvider = {
    createAccount: () => Promise.resolve({ id: connectedAccountId }),
    createOnboardingLink: () =>
      Promise.resolve({ url: 'https://connect.stripe.test/alerts' }),
    getAccountStatus: () =>
      Promise.resolve({ onboardingComplete: true, paymentsReady: true }),
  };
  const paymentProvider: PaymentProvider = {
    createCheckout: () =>
      Promise.resolve({
        id: providerCheckoutSessionId,
        paymentIntentId: providerPaymentIntentId,
        url: 'https://checkout.stripe.test/alerts',
      }),
  };
  const stripeWebhookProvider: StripeWebhookProvider = {
    verifyAndNormalize(_payload, signature) {
      const event = events.get(signature);
      if (!event) throw new InvalidWebhookSignatureError();
      return event;
    },
  };
  const outboundTransport: OutboundWebhookTransport = {
    deliver(outboundRequest) {
      outboundRequests.push(outboundRequest);
      return Promise.resolve({ status: outboundStatus });
    },
  };
  const destinationResolver: DestinationResolver = {
    resolve: () => Promise.resolve(['8.8.8.8']),
  };

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = '22'.repeat(32);
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
    providerCheckoutSessionId = `cs_${randomUUID()}`;
    providerPaymentIntentId = `pi_${randomUUID()}`;
    events.clear();
    outboundRequests.length = 0;
    outboundStatus = 204;
  });

  async function createPendingPayment() {
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
    const accessToken = (login.body as LoginResponse).accessToken;
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Alert Buyer' })
      .expect(201);
    const payment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: (customer.body as CustomerResponse).id,
        amount: 4500,
        currency: 'usd',
        description: 'Alert payment',
      })
      .expect(201);
    return {
      accessToken,
      email,
      payment: payment.body as PaymentResponse,
    };
  }

  async function waitForAlerts(
    accessToken: string,
    count: number,
  ): Promise<AlertResponse[]> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get('/alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const alerts = response.body as unknown as AlertResponse[];
      if (alerts.length >= count) return alerts;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected ${count} operational alert(s)`);
  }

  async function waitForOutboundRequestCount(count: number) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (outboundRequests.length >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected ${count} outbound request(s)`);
  }

  it('lists one active alert after a supported payment-processing failure', async () => {
    const { accessToken, payment } = await createPendingPayment();
    events.set('payment-failure-alert', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-06T20:00:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'payment-failure-alert')
      .send({})
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const alerts = response.body as unknown as AlertResponse[];
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'PAYMENT_PROCESSING_FAILED',
      status: 'ACTIVE',
      acknowledgedAt: null,
      acknowledgedBy: null,
      payment: { publicId: payment.publicId },
    });
    expect(alerts[0].id).not.toHaveLength(0);
    expect(Number.isNaN(Date.parse(alerts[0].createdAt))).toBe(false);
    expect(JSON.stringify(alerts[0])).not.toContain('workspaceId');
  });

  it('lists one active alert after an outbound webhook delivery fails', async () => {
    const { accessToken, payment } = await createPendingPayment();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/alerts' })
      .expect(200);
    outboundStatus = 503;
    events.set('delivery-failure-alert', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T20:05:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'delivery-failure-alert')
      .send({})
      .expect(200);

    const [alert] = await waitForAlerts(accessToken, 1);
    expect(alert).toMatchObject({
      type: 'WEBHOOK_DELIVERY_FAILED',
      status: 'ACTIVE',
      acknowledgedAt: null,
      acknowledgedBy: null,
      payment: { publicId: payment.publicId },
      delivery: { attemptNumber: 1 },
    });
    expect(alert.delivery?.id).not.toHaveLength(0);
    expect(outboundRequests).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'delivery-failure-alert')
      .send({})
      .expect(200, { received: true, duplicate: true, handled: true });
    expect(await waitForAlerts(accessToken, 1)).toEqual([alert]);
  });

  it('creates a distinct delivery alert when a replay attempt also fails', async () => {
    const { accessToken, payment } = await createPendingPayment();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/replay-alerts' })
      .expect(200);
    outboundStatus = 503;
    events.set('replay-alert-source', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T20:07:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'replay-alert-source')
      .send({})
      .expect(200);
    const [firstAlert] = await waitForAlerts(accessToken, 1);
    const sourceAttemptId = firstAlert.delivery?.id;
    if (!sourceAttemptId) throw new Error('Expected delivery alert reference');

    await request(app.getHttpServer())
      .post(`/webhook-deliveries/${sourceAttemptId}/replay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(202);
    const alerts = await waitForAlerts(accessToken, 2);
    expect(
      alerts.map(({ delivery }) => delivery?.attemptNumber).sort(),
    ).toEqual([1, 2]);
    expect(new Set(alerts.map(({ delivery }) => delivery?.id)).size).toBe(2);
    expect(alerts.every(({ type }) => type === 'WEBHOOK_DELIVERY_FAILED')).toBe(
      true,
    );
  });

  it('acknowledges an alert idempotently without deleting its audit history', async () => {
    const { accessToken, email, payment } = await createPendingPayment();
    events.set('acknowledged-payment-alert', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-06T20:10:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'acknowledged-payment-alert')
      .send({})
      .expect(200);
    const [active] = await waitForAlerts(accessToken, 1);

    const acknowledged = await request(app.getHttpServer())
      .post(`/alerts/${active.id}/acknowledge`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const acknowledgedAlert = acknowledged.body as unknown as AlertResponse;
    expect(acknowledgedAlert).toMatchObject({
      id: active.id,
      type: active.type,
      status: 'ACKNOWLEDGED',
      createdAt: active.createdAt,
      acknowledgedBy: { email },
      payment: active.payment,
    });
    expect(
      Number.isNaN(Date.parse(acknowledgedAlert.acknowledgedAt ?? '')),
    ).toBe(false);
    await request(app.getHttpServer())
      .get('/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, []);
    await request(app.getHttpServer())
      .get('/alerts?status=ACTIVE')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, []);
    await request(app.getHttpServer())
      .get('/alerts?status=ACKNOWLEDGED')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, [acknowledgedAlert]);

    await request(app.getHttpServer())
      .post(`/alerts/${active.id}/acknowledge`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, acknowledgedAlert);
    events.set('repeat-acknowledged-payment-alert', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-06T20:11:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'repeat-acknowledged-payment-alert')
      .send({})
      .expect(200, { received: true, duplicate: false, handled: true });
    await request(app.getHttpServer())
      .get('/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, []);
  });

  it('does not create alerts for a successful payment and delivery', async () => {
    const { accessToken, payment } = await createPendingPayment();
    await request(app.getHttpServer())
      .put('/webhook-destination')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ url: 'https://hooks.example.test/success-alerts' })
      .expect(200);
    events.set('successful-payment-and-delivery', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T20:15:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'successful-payment-and-delivery')
      .send({})
      .expect(200);
    await waitForOutboundRequestCount(1);
    await request(app.getHttpServer())
      .get('/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, []);
  });

  it('keeps repeated observations of one payment incident deduplicated', async () => {
    const { accessToken, payment } = await createPendingPayment();
    const providerEventId = `evt_${randomUUID()}`;
    events.set('duplicate-payment-alert', {
      id: providerEventId,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-06T20:20:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    events.set('repeat-payment-alert', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-06T20:21:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'duplicate-payment-alert')
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'repeat-payment-alert')
      .send({})
      .expect(200, { received: true, duplicate: false, handled: true });
    const alerts = await waitForAlerts(accessToken, 1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'PAYMENT_PROCESSING_FAILED',
      payment: { publicId: payment.publicId },
    });
  });

  it('does not reveal or acknowledge another workspace alert', async () => {
    const first = await createPendingPayment();
    events.set('private-payment-alert', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-06T20:25:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
      paymentRequestPublicId: first.payment.publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'private-payment-alert')
      .send({})
      .expect(200);
    const [privateAlert] = await waitForAlerts(first.accessToken, 1);

    connectedAccountId = `acct_${randomUUID()}`;
    providerCheckoutSessionId = `cs_${randomUUID()}`;
    providerPaymentIntentId = `pi_${randomUUID()}`;
    const second = await createPendingPayment();
    await request(app.getHttpServer())
      .get('/alerts')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200, []);
    await request(app.getHttpServer())
      .post(`/alerts/${privateAlert.id}/acknowledge`)
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(404, {
        message: 'Alert not found',
        error: 'Not Found',
        statusCode: 404,
      });
    expect(await waitForAlerts(first.accessToken, 1)).toEqual([privateAlert]);
  });

  afterAll(async () => app?.close());
});
