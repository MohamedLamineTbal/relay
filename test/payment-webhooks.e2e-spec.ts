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

type LoginResponse = {
  accessToken: string;
};

type CustomerResponse = {
  id: number;
};

type PaymentResponse = {
  publicId: string;
  status: string;
};

describe('Stripe payment webhooks', () => {
  let app: INestApplication<App>;
  let connectedAccountId: string;
  let providerCheckoutSessionId: string;
  let providerPaymentIntentId: string | null;
  const eventsBySignature = new Map<string, VerifiedPaymentEvent>();
  let verificationBarrier:
    | {
        arrivals: number;
        ready: Promise<void>;
        release: () => void;
      }
    | undefined;
  const stripeConnectProvider: StripeConnectProvider = {
    createAccount() {
      return Promise.resolve({ id: connectedAccountId });
    },
    createOnboardingLink() {
      return Promise.resolve({
        url: 'https://connect.stripe.test/payment-webhooks',
      });
    },
    getAccountStatus() {
      return Promise.resolve({
        onboardingComplete: true,
        paymentsReady: true,
      });
    },
  };
  const paymentProvider: PaymentProvider = {
    createCheckout() {
      return Promise.resolve({
        id: providerCheckoutSessionId,
        paymentIntentId: providerPaymentIntentId,
        url: `https://checkout.stripe.test/${providerCheckoutSessionId}`,
      });
    },
  };
  const stripeWebhookProvider: StripeWebhookProvider = {
    async verifyAndNormalize(_payload, signature) {
      const event = eventsBySignature.get(signature);

      if (!event) {
        throw new InvalidWebhookSignatureError();
      }

      if (verificationBarrier) {
        verificationBarrier.arrivals += 1;

        if (verificationBarrier.arrivals === 2) {
          verificationBarrier.release();
        }

        await verificationBarrier.ready;
      }

      return event;
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(STRIPE_CONNECT_PROVIDER)
      .useValue(stripeConnectProvider)
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(paymentProvider)
      .overrideProvider(STRIPE_WEBHOOK_PROVIDER)
      .useValue(stripeWebhookProvider)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  beforeEach(() => {
    connectedAccountId = `acct_${randomUUID()}`;
    providerCheckoutSessionId = `cs_${randomUUID()}`;
    providerPaymentIntentId = `pi_${randomUUID()}`;
    eventsBySignature.clear();
    verificationBarrier = undefined;
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
      .send({ name: 'Webhook Buyer', email: 'buyer@example.com' })
      .expect(201);

    const payment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `webhook-payment-${randomUUID()}`)
      .send({
        customerId: (customer.body as CustomerResponse).id,
        amount: 12500,
        currency: 'usd',
        description: 'Webhook lifecycle payment',
      })
      .expect(201);

    return {
      accessToken,
      payment: payment.body as PaymentResponse,
    };
  }

  it('marks a payment paid after a verified Checkout completion event', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('valid-completion', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T10:00:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });

    const webhook = await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'valid-completion')
      .send({ providerPayload: true })
      .expect(200);

    expect(webhook.body).toEqual({
      received: true,
      duplicate: false,
      handled: true,
    });

    const updatedPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(updatedPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'PAID',
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });
  });

  it('rejects invalid or missing signatures without changing payment state', async () => {
    const { accessToken, payment } = await createPendingPayment();

    const invalidSignature = await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'invalid-signature')
      .send({ providerPayload: true })
      .expect(400);

    expect(invalidSignature.body).toEqual({
      message: 'Valid Stripe signature is required',
      error: 'Bad Request',
      statusCode: 400,
    });

    const missingSignature = await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .send({ providerPayload: true })
      .expect(400);

    expect(missingSignature.body).toEqual({
      message: 'Valid Stripe signature is required',
      error: 'Bad Request',
      statusCode: 400,
    });

    const unchangedPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(unchangedPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'PENDING',
    });
  });

  it('acknowledges a duplicate provider event without repeating its effect', async () => {
    const { accessToken, payment } = await createPendingPayment();
    const event: VerifiedPaymentEvent = {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T10:15:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    };
    eventsBySignature.set('first-delivery', event);
    eventsBySignature.set('duplicate-delivery', event);

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'first-delivery')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'duplicate-delivery')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: true,
        handled: true,
      });

    const unchangedPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(unchangedPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'PAID',
    });
  });

  it('marks a pending payment expired after a verified Checkout expiration', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('valid-expiration', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.expired',
      type: 'CHECKOUT_EXPIRED',
      occurredAt: new Date('2026-08-05T10:10:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId: null,
    });
    eventsBySignature.set('completion-after-expiration', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T10:15:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'valid-expiration')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'completion-after-expiration')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    const expiredPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(expiredPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'EXPIRED',
    });
  });

  it('marks a pending payment failed after a verified Payment Intent failure', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('valid-failure', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-05T10:15:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'valid-failure')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    const failedPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(failedPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'FAILED',
    });
  });

  it('marks a paid payment refunded after a verified refund event', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('paid-before-refund', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T10:20:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });
    eventsBySignature.set('valid-refund', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'charge.refunded',
      type: 'PAYMENT_REFUNDED',
      occurredAt: new Date('2026-08-05T10:25:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId,
    });
    eventsBySignature.set('completion-after-refund', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T10:19:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'paid-before-refund')
      .send({ providerPayload: true })
      .expect(200);

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'valid-refund')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'completion-after-refund')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    const refundedPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(refundedPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'REFUNDED',
    });
  });

  it('does not regress a paid payment when an earlier failure arrives later', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('newer-completion', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T10:35:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });
    eventsBySignature.set('older-failure', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-05T10:30:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'newer-completion')
      .send({ providerPayload: true })
      .expect(200);

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'older-failure')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    const paidPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(paidPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'PAID',
    });
  });

  it('replays an out-of-order failure and completion without regressing paid', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('newer-failure', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-05T10:45:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId,
    });
    eventsBySignature.set('older-completion', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T10:40:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'newer-failure')
      .send({ providerPayload: true })
      .expect(200);

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'older-completion')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    const paidPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(paidPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'PAID',
    });
  });

  it('acknowledges an unsupported verified event without changing payment state', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('valid-unsupported', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'customer.updated',
      type: 'UNSUPPORTED',
      occurredAt: new Date('2026-08-05T10:50:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId: null,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'valid-unsupported')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: false,
      });

    const unchangedPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(unchangedPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'PENDING',
    });
  });

  it('acknowledges simultaneous duplicate deliveries exactly once', async () => {
    const { accessToken, payment } = await createPendingPayment();
    const event: VerifiedPaymentEvent = {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T10:55:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    };
    eventsBySignature.set('concurrent-delivery-one', event);
    eventsBySignature.set('concurrent-delivery-two', event);
    let releaseVerification!: () => void;
    const verificationReady = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    verificationBarrier = {
      arrivals: 0,
      ready: verificationReady,
      release: releaseVerification,
    };

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('Stripe-Signature', 'concurrent-delivery-one')
        .send({ providerPayload: true }),
      request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('Stripe-Signature', 'concurrent-delivery-two')
        .send({ providerPayload: true }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      responses
        .map(({ body }) => body as { duplicate: boolean })
        .sort(
          (first, second) => Number(first.duplicate) - Number(second.duplicate),
        ),
    ).toEqual([
      { received: true, duplicate: false, handled: true },
      { received: true, duplicate: true, handled: true },
    ]);

    const paidPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(paidPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'PAID',
    });
  });

  it('does not associate a verified event with another workspace payment', async () => {
    const firstWorkspace = await createPendingPayment();
    const firstCheckoutSessionId = providerCheckoutSessionId;
    connectedAccountId = `acct_${randomUUID()}`;
    providerCheckoutSessionId = `cs_${randomUUID()}`;
    providerPaymentIntentId = `pi_${randomUUID()}`;
    const secondWorkspace = await createPendingPayment();

    eventsBySignature.set('cross-workspace-event', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T11:05:00.000Z'),
      providerCheckoutSessionId: firstCheckoutSessionId,
      providerPaymentIntentId: null,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'cross-workspace-event')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: false,
      });

    const firstPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${firstWorkspace.payment.publicId}`)
      .set('Authorization', `Bearer ${firstWorkspace.accessToken}`)
      .expect(200);
    const secondPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${secondWorkspace.payment.publicId}`)
      .set('Authorization', `Bearer ${secondWorkspace.accessToken}`)
      .expect(200);

    expect(firstPayment.body).toMatchObject({ status: 'PENDING' });
    expect(secondPayment.body).toMatchObject({ status: 'PENDING' });
  });

  it('links a Payment Intent failure by stable payment reference when Checkout returned no intent ID', async () => {
    providerPaymentIntentId = null;
    const { accessToken, payment } = await createPendingPayment();
    const failedPaymentIntentId = `pi_${randomUUID()}`;
    eventsBySignature.set('failure-with-payment-reference', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-05T11:10:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId: failedPaymentIntentId,
      paymentRequestPublicId: payment.publicId,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'failure-with-payment-reference')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    const failedPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(failedPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'FAILED',
      providerPaymentIntentId: failedPaymentIntentId,
    });
  });

  it('does not refund a payment that has not reached paid', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('refund-before-payment', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'charge.refunded',
      type: 'PAYMENT_REFUNDED',
      occurredAt: new Date('2026-08-05T11:15:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'refund-before-payment')
      .send({ providerPayload: true })
      .expect(200, {
        received: true,
        duplicate: false,
        handled: true,
      });

    const pendingPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(pendingPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'PENDING',
    });
  });

  it('keeps the newest lifecycle outcome when different events arrive concurrently', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('concurrent-newer-completion', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T11:25:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });
    eventsBySignature.set('concurrent-older-failure', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt: new Date('2026-08-05T11:20:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId,
    });
    let releaseVerification!: () => void;
    const verificationReady = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    verificationBarrier = {
      arrivals: 0,
      ready: verificationReady,
      release: releaseVerification,
    };

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('Stripe-Signature', 'concurrent-newer-completion')
        .send({ providerPayload: true }),
      request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('Stripe-Signature', 'concurrent-older-failure')
        .send({ providerPayload: true }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);

    const paidPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(paidPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'PAID',
    });
  });

  it('applies a later refund even when it is delivered before completion', async () => {
    const { accessToken, payment } = await createPendingPayment();
    eventsBySignature.set('refund-delivered-first', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'charge.refunded',
      type: 'PAYMENT_REFUNDED',
      occurredAt: new Date('2026-08-05T11:35:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId,
    });
    eventsBySignature.set('completion-delivered-second', {
      id: `evt_${randomUUID()}`,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-05T11:30:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'refund-delivered-first')
      .send({ providerPayload: true })
      .expect(200);

    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', 'completion-delivered-second')
      .send({ providerPayload: true })
      .expect(200);

    const refundedPayment = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(refundedPayment.body).toMatchObject({
      publicId: payment.publicId,
      status: 'REFUNDED',
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
