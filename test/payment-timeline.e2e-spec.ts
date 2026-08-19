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
};

type TimelineEventResponse = {
  type: string;
  resultingStatus: string;
  occurredAt: string;
  providerReferences: {
    eventId: string;
    eventType: string;
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
  };
};

type TimelineResponse = {
  publicId: string;
  currentStatus: string;
  events: TimelineEventResponse[];
};

describe('Payment event timeline', () => {
  let app: INestApplication<App>;
  let connectedAccountId: string;
  let providerCheckoutSessionId: string;
  let providerPaymentIntentId: string;
  const eventsBySignature = new Map<string, VerifiedPaymentEvent>();
  const stripeConnectProvider: StripeConnectProvider = {
    createAccount() {
      return Promise.resolve({ id: connectedAccountId });
    },
    createOnboardingLink() {
      return Promise.resolve({
        url: 'https://connect.stripe.test/payment-timeline',
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
    verifyAndNormalize(_payload, signature) {
      const event = eventsBySignature.get(signature);

      if (!event) {
        throw new Error('Unknown timeline test signature');
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
      .send({ name: 'Timeline Buyer', email: 'timeline-buyer@example.com' })
      .expect(201);

    const payment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `timeline-payment-${randomUUID()}`)
      .send({
        customerId: (customer.body as CustomerResponse).id,
        amount: 12500,
        currency: 'usd',
        description: 'Timeline payment',
      })
      .expect(201);

    return {
      accessToken,
      payment: payment.body as PaymentResponse,
    };
  }

  async function deliverWebhook(signature: string) {
    return request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', signature)
      .send({ providerPayload: true })
      .expect(200);
  }

  async function getTimeline(accessToken: string, publicId: string) {
    const response = await request(app.getHttpServer())
      .get(`/payment-requests/${publicId}/timeline`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    return response.body as unknown as TimelineResponse;
  }

  it('returns an empty timeline for a payment with no lifecycle events', async () => {
    const { accessToken, payment } = await createPendingPayment();
    const timelineBody = await getTimeline(accessToken, payment.publicId);

    expect(timelineBody).toEqual({
      publicId: payment.publicId,
      currentStatus: 'PENDING',
      events: [],
    });
  });

  it('returns normalized events in occurrence order with safe provider references', async () => {
    const { accessToken, payment } = await createPendingPayment();
    const completionEventId = `evt_${randomUUID()}`;
    const refundEventId = `evt_${randomUUID()}`;
    eventsBySignature.set('later-refund-delivered-first', {
      id: refundEventId,
      connectedAccountId,
      providerType: 'charge.refunded',
      type: 'PAYMENT_REFUNDED',
      occurredAt: new Date('2026-08-06T10:05:00.000Z'),
      providerCheckoutSessionId: null,
      providerPaymentIntentId,
    });
    eventsBySignature.set('earlier-completion-delivered-second', {
      id: completionEventId,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T10:00:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });

    await deliverWebhook('later-refund-delivered-first');
    await deliverWebhook('earlier-completion-delivered-second');
    const timelineBody = await getTimeline(accessToken, payment.publicId);

    expect(timelineBody).toEqual({
      publicId: payment.publicId,
      currentStatus: 'REFUNDED',
      events: [
        {
          type: 'CHECKOUT_COMPLETED',
          resultingStatus: 'PAID',
          occurredAt: '2026-08-06T10:00:00.000Z',
          providerReferences: {
            eventId: completionEventId,
            eventType: 'checkout.session.completed',
            checkoutSessionId: providerCheckoutSessionId,
            paymentIntentId: providerPaymentIntentId,
          },
        },
        {
          type: 'PAYMENT_REFUNDED',
          resultingStatus: 'REFUNDED',
          occurredAt: '2026-08-06T10:05:00.000Z',
          providerReferences: {
            eventId: refundEventId,
            eventType: 'charge.refunded',
            checkoutSessionId: null,
            paymentIntentId: providerPaymentIntentId,
          },
        },
      ],
    });
  });

  it('orders events with the same occurrence time by provider event ID', async () => {
    const { accessToken, payment } = await createPendingPayment();
    const failedEventId = `evt_a_${randomUUID()}`;
    const completedEventId = `evt_z_${randomUUID()}`;
    const occurredAt = new Date('2026-08-06T10:07:00.000Z');
    eventsBySignature.set('same-time-completion', {
      id: completedEventId,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt,
      providerCheckoutSessionId,
      providerPaymentIntentId,
    });
    eventsBySignature.set('same-time-failure', {
      id: failedEventId,
      connectedAccountId,
      providerType: 'payment_intent.payment_failed',
      type: 'PAYMENT_FAILED',
      occurredAt,
      providerCheckoutSessionId: null,
      providerPaymentIntentId,
    });

    await deliverWebhook('same-time-completion');
    await deliverWebhook('same-time-failure');
    const timelineBody = await getTimeline(accessToken, payment.publicId);

    expect(
      timelineBody.events.map((event) => event.providerReferences.eventId),
    ).toEqual([failedEventId, completedEventId]);
    expect(timelineBody.events.map((event) => event.resultingStatus)).toEqual([
      'FAILED',
      'PAID',
    ]);
    expect(timelineBody.currentStatus).toBe('PAID');
  });

  it('returns one timeline entry after duplicate provider delivery', async () => {
    const { accessToken, payment } = await createPendingPayment();
    const providerEventId = `evt_${randomUUID()}`;
    const event: VerifiedPaymentEvent = {
      id: providerEventId,
      connectedAccountId,
      providerType: 'checkout.session.completed',
      type: 'CHECKOUT_COMPLETED',
      occurredAt: new Date('2026-08-06T10:10:00.000Z'),
      providerCheckoutSessionId,
      providerPaymentIntentId,
    };
    eventsBySignature.set('first-delivery', event);
    eventsBySignature.set('duplicate-delivery', event);

    const firstDelivery = await deliverWebhook('first-delivery');
    expect(firstDelivery.body).toEqual({
      received: true,
      duplicate: false,
      handled: true,
    });

    const duplicateDelivery = await deliverWebhook('duplicate-delivery');
    expect(duplicateDelivery.body).toEqual({
      received: true,
      duplicate: true,
      handled: true,
    });

    const timelineBody = await getTimeline(accessToken, payment.publicId);

    expect(timelineBody.events).toEqual([
      {
        type: 'CHECKOUT_COMPLETED',
        resultingStatus: 'PAID',
        occurredAt: '2026-08-06T10:10:00.000Z',
        providerReferences: {
          eventId: providerEventId,
          eventType: 'checkout.session.completed',
          checkoutSessionId: providerCheckoutSessionId,
          paymentIntentId: providerPaymentIntentId,
        },
      },
    ]);
  });

  it('rejects unauthenticated timeline access', async () => {
    const { payment } = await createPendingPayment();

    await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}/timeline`)
      .expect(401);
  });

  it('does not reveal a payment timeline to another workspace', async () => {
    const firstWorkspace = await createPendingPayment();
    connectedAccountId = `acct_${randomUUID()}`;
    providerCheckoutSessionId = `cs_${randomUUID()}`;
    providerPaymentIntentId = `pi_${randomUUID()}`;
    const secondWorkspace = await createPendingPayment();

    const crossWorkspace = await request(app.getHttpServer())
      .get(`/payment-requests/${firstWorkspace.payment.publicId}/timeline`)
      .set('Authorization', `Bearer ${secondWorkspace.accessToken}`)
      .expect(404);

    const missing = await request(app.getHttpServer())
      .get(`/payment-requests/missing-${randomUUID()}/timeline`)
      .set('Authorization', `Bearer ${secondWorkspace.accessToken}`)
      .expect(404);

    expect(crossWorkspace.body).toEqual(missing.body);
    expect(crossWorkspace.body).toEqual({
      message: 'Payment request not found',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
