import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
  PaymentEmailProviderError,
} from '../src/payment-emails/email-provider';
import {
  PAYMENT_EMAIL_SCHEDULER,
  type PaymentEmailScheduler,
  type PaymentEmailTask,
} from '../src/payment-emails/payment-email.scheduler';
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
  type PaymentLifecycleEventType,
  type StripeWebhookProvider,
  type VerifiedPaymentEvent,
} from '../src/webhooks/stripe-webhook.provider';

type LoginResponse = { accessToken: string };
type CustomerResponse = { id: number };
type PaymentResponse = { publicId: string };
type ManualDeliveryResponse = { id: string };
type DeliveryHistory = Array<{
  id: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  recipientEmail: string;
  failureSummary: string | null;
  requestedBy: { id: number; email: string };
  attempts: Array<{
    attemptNumber: number;
    outcome: 'SENT' | 'TRANSIENT_FAILURE' | 'PERMANENT_FAILURE';
    failureCode: string | null;
    failureSummary: string | null;
    providerMessageId: string | null;
  }>;
}>;

class TestPaymentEmailScheduler implements PaymentEmailScheduler {
  private current = new Date('2026-08-14T15:00:00.000Z');
  private deferred: PaymentEmailTask[] = [];
  private recurring: PaymentEmailTask[] = [];

  now() {
    return new Date(this.current);
  }

  defer(task: PaymentEmailTask) {
    this.deferred.push(task);
  }

  every(task: PaymentEmailTask) {
    this.recurring.push(task);
    return () => {
      this.recurring = this.recurring.filter((candidate) => candidate !== task);
    };
  }

  async flushDeferred() {
    while (this.deferred.length > 0) {
      const tasks = this.deferred.splice(0);
      for (const task of tasks) await task();
    }
  }

  async advanceBy(milliseconds: number) {
    this.current = new Date(this.current.getTime() + milliseconds);
    for (const task of [...this.recurring]) await task();
    await this.flushDeferred();
  }
}

describe('Payment email retry history', () => {
  let app: INestApplication<App>;
  const scheduler = new TestPaymentEmailScheduler();
  const providerPlans = new Map<
    string,
    Array<'SENT' | PaymentEmailProviderError>
  >();
  const providerKeys: Array<{ recipient: string; key: string }> = [];
  let checkoutCalls = 0;
  const checkoutAccounts = new Map<string, string>();
  const webhookEvents = new Map<string, VerifiedPaymentEvent>();
  const emailProvider: EmailProvider = {
    sendPaymentEmail(input) {
      providerKeys.push({ recipient: input.to, key: input.idempotencyKey });
      const result = providerPlans.get(input.to)?.shift() ?? 'SENT';
      return result instanceof PaymentEmailProviderError
        ? Promise.reject(result)
        : Promise.resolve({
            messageId: `message_${providerKeys.filter(({ recipient }) => recipient === input.to).length}`,
          });
    },
  };
  const stripeConnectProvider: StripeConnectProvider = {
    createAccount: (workspaceId) =>
      Promise.resolve({ id: `acct_${workspaceId}` }),
    createOnboardingLink: () =>
      Promise.resolve({ url: 'https://connect.test' }),
    getAccountStatus: () =>
      Promise.resolve({ onboardingComplete: true, paymentsReady: true }),
  };
  const paymentProvider: PaymentProvider = {
    createCheckout: (input) => {
      checkoutCalls += 1;
      checkoutAccounts.set(
        input.paymentRequestPublicId,
        input.connectedAccountId,
      );
      return Promise.resolve({
        id: `cs_${randomUUID()}`,
        paymentIntentId: `pi_${randomUUID()}`,
        url: 'https://checkout.stripe.test/retry',
      });
    },
  };
  const stripeWebhookProvider: StripeWebhookProvider = {
    verifyAndNormalize(_payload, signature) {
      const event = webhookEvents.get(signature);
      if (!event) throw new Error('Unknown test webhook');
      return event;
    },
  };

  beforeAll(async () => {
    process.env.RESEND_API_KEY = 're_test_payment_email_retry';
    process.env.EMAIL_FROM = 'Relay <onboarding@resend.dev>';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(STRIPE_CONNECT_PROVIDER)
      .useValue(stripeConnectProvider)
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(paymentProvider)
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(emailProvider)
      .overrideProvider(PAYMENT_EMAIL_SCHEDULER)
      .useValue(scheduler)
      .overrideProvider(STRIPE_WEBHOOK_PROVIDER)
      .useValue(stripeWebhookProvider)
      .compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  beforeEach(() => {
    providerPlans.clear();
    providerKeys.length = 0;
    checkoutCalls = 0;
    checkoutAccounts.clear();
    webhookEvents.clear();
  });

  async function createPendingEmail(recipientEmail: string, sendEmail = true) {
    const email = `retry-owner-${randomUUID()}@example.com`;
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
      .send({ name: 'Retry Buyer', email: recipientEmail })
      .expect(201);
    const paymentBody: Record<string, unknown> = {
      customerId: (customer.body as CustomerResponse).id,
      amount: 4500,
      currency: 'usd',
      description: 'Retryable payment',
    };
    if (sendEmail) paymentBody.sendEmail = true;
    const payment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(paymentBody)
      .expect(201);
    return {
      accessToken,
      customerId: (customer.body as CustomerResponse).id,
      ownerEmail: email,
      payment: payment.body as PaymentResponse,
    };
  }

  async function registerAnotherOwner() {
    const email = `other-owner-${randomUUID()}@example.com`;
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

  async function applyLifecycleEvent(
    publicId: string,
    type: Exclude<PaymentLifecycleEventType, 'UNSUPPORTED'>,
  ) {
    await scheduler.advanceBy(1);
    const signature = `signature-${randomUUID()}`;
    webhookEvents.set(signature, {
      id: `event-${randomUUID()}`,
      connectedAccountId: checkoutAccounts.get(publicId)!,
      providerType: type,
      type,
      occurredAt: scheduler.now(),
      providerCheckoutSessionId: null,
      providerPaymentIntentId: null,
      paymentRequestPublicId: publicId,
    });
    await request(app.getHttpServer())
      .post('/stripe/webhooks')
      .set('Stripe-Signature', signature)
      .send({ test: true })
      .expect(200);
  }

  it('records a transient attempt and retries with the stable provider key after one minute', async () => {
    const recipientEmail = `retry-${randomUUID()}@example.com`;
    providerPlans.set(recipientEmail, [
      new PaymentEmailProviderError('TRANSIENT', 'PROVIDER_UNAVAILABLE'),
      'SENT',
    ]);
    const { accessToken, payment } = await createPendingEmail(recipientEmail);

    await scheduler.flushDeferred();
    const afterFailure = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterFailure.body as DeliveryHistory).toMatchObject([
      {
        status: 'PENDING',
        recipientEmail,
        failureSummary: 'Email provider is temporarily unavailable',
        attempts: [
          {
            attemptNumber: 1,
            outcome: 'TRANSIENT_FAILURE',
            failureCode: 'PROVIDER_UNAVAILABLE',
          },
        ],
      },
    ]);

    await scheduler.advanceBy(59_000);
    const keysForRecipient = () =>
      providerKeys
        .filter(({ recipient }) => recipient === recipientEmail)
        .map(({ key }) => key);
    expect(keysForRecipient()).toHaveLength(1);
    await scheduler.advanceBy(1_000);

    const recovered = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(recovered.body as DeliveryHistory).toMatchObject([
      {
        status: 'SENT',
        failureSummary: null,
        attempts: [
          { attemptNumber: 1, outcome: 'TRANSIENT_FAILURE' },
          {
            attemptNumber: 2,
            outcome: 'SENT',
            providerMessageId: 'message_2',
          },
        ],
      },
    ]);
    expect(keysForRecipient()[1]).toBe(keysForRecipient()[0]);
  });

  it('stops immediately on a permanent failure and exposes only a safe summary', async () => {
    const recipientEmail = `permanent-${randomUUID()}@example.com`;
    providerPlans.set(recipientEmail, [
      new PaymentEmailProviderError('PERMANENT', 'PROVIDER_REJECTED'),
    ]);
    const { accessToken, payment } = await createPendingEmail(recipientEmail);
    await scheduler.flushDeferred();

    const response = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(response.body as DeliveryHistory).toMatchObject([
      {
        status: 'FAILED',
        failureSummary: 'Email provider rejected the recipient or message',
        attempts: [
          {
            attemptNumber: 1,
            outcome: 'PERMANENT_FAILURE',
            failureCode: 'PROVIDER_REJECTED',
            failureSummary: 'Email provider rejected the recipient or message',
          },
        ],
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('re_test');
    const sentToRecipient = () =>
      providerKeys.filter(({ recipient }) => recipient === recipientEmail);
    expect(sentToRecipient()).toHaveLength(1);

    await scheduler.advanceBy(10 * 60_000);
    expect(sentToRecipient()).toHaveLength(1);
  });

  it('fails after three transient attempts at one- and five-minute delays', async () => {
    const recipientEmail = `exhaust-${randomUUID()}@example.com`;
    providerPlans.set(recipientEmail, [
      new PaymentEmailProviderError('TRANSIENT', 'PROVIDER_UNAVAILABLE'),
      new PaymentEmailProviderError('TRANSIENT', 'PROVIDER_UNAVAILABLE'),
      new PaymentEmailProviderError('TRANSIENT', 'PROVIDER_UNAVAILABLE'),
    ]);
    const { accessToken, payment } = await createPendingEmail(recipientEmail);
    await scheduler.flushDeferred();
    await scheduler.advanceBy(60_000);
    await scheduler.advanceBy(5 * 60_000);

    const response = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const history = response.body as DeliveryHistory;
    expect(history[0]).toMatchObject({
      status: 'FAILED',
      failureSummary: 'Email could not be sent after automatic retries',
    });
    expect(history[0].attempts.map((attempt) => attempt.attemptNumber)).toEqual(
      [1, 2, 3],
    );
    const keysForRecipient = providerKeys
      .filter(({ recipient }) => recipient === recipientEmail)
      .map(({ key }) => key);
    expect(new Set(keysForRecipient).size).toBe(1);
  });

  it('sends a link-only payment, enforces cooldown, and preserves recipient snapshots', async () => {
    const originalRecipient = `original-${randomUUID()}@example.com`;
    const currentRecipient = `current-${randomUUID()}@example.com`;
    const { accessToken, customerId, ownerEmail, payment } =
      await createPendingEmail(originalRecipient, false);

    const first = await request(app.getHttpServer())
      .post(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'manual-first')
      .send({})
      .expect(202);
    const replay = await request(app.getHttpServer())
      .post(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'manual-first')
      .send({})
      .expect(202);
    expect((replay.body as ManualDeliveryResponse).id).toBe(
      (first.body as ManualDeliveryResponse).id,
    );
    await scheduler.flushDeferred();

    await request(app.getHttpServer())
      .post(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'too-soon')
      .send({})
      .expect(409, {
        message: 'Payment email can only be resent once every 60 seconds',
        error: 'Conflict',
        statusCode: 409,
      });

    await request(app.getHttpServer())
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: currentRecipient })
      .expect(200);
    await scheduler.advanceBy(60_000);

    await request(app.getHttpServer())
      .post(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'manual-original')
      .send({})
      .expect(202);
    await scheduler.flushDeferred();
    await scheduler.advanceBy(60_000);
    await request(app.getHttpServer())
      .post(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'manual-current')
      .send({ recipient: 'CURRENT' })
      .expect(202);
    await scheduler.flushDeferred();

    const history = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body as DeliveryHistory).toMatchObject([
      {
        recipientEmail: originalRecipient,
        requestedBy: { email: ownerEmail },
      },
      {
        recipientEmail: originalRecipient,
        requestedBy: { email: ownerEmail },
      },
      {
        recipientEmail: currentRecipient,
        requestedBy: { email: ownerEmail },
      },
    ]);
    expect(checkoutCalls).toBe(1);

    await scheduler.advanceBy(60_000);
    await request(app.getHttpServer())
      .post(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'arbitrary-recipient')
      .send({ recipient: 'outsider@example.com' })
      .expect(400);
  });

  it('does not disclose another workspace email history or allow its resend', async () => {
    const recipientEmail = `isolated-${randomUUID()}@example.com`;
    const { payment } = await createPendingEmail(recipientEmail, false);
    const otherToken = await registerAnotherOwner();
    const missingBody = {
      message: 'Payment request not found',
      error: 'Not Found',
      statusCode: 404,
    };

    await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404, missingBody);
    await request(app.getHttpServer())
      .post(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Idempotency-Key', 'cross-workspace-send')
      .send({})
      .expect(404, missingBody);
  });

  it('accepts only one concurrent non-idempotent manual send', async () => {
    const recipientEmail = `concurrent-${randomUUID()}@example.com`;
    const { accessToken, payment } = await createPendingEmail(
      recipientEmail,
      false,
    );

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/payment-requests/${payment.publicId}/email-deliveries`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', 'concurrent-manual-one')
        .send({}),
      request(app.getHttpServer())
        .post(`/payment-requests/${payment.publicId}/email-deliveries`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', 'concurrent-manual-two')
        .send({}),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([202, 409]);
    const history = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body).toHaveLength(1);
  });

  it.each([
    ['PAID', ['CHECKOUT_COMPLETED']],
    ['FAILED', ['PAYMENT_FAILED']],
    ['EXPIRED', ['CHECKOUT_EXPIRED']],
    ['REFUNDED', ['CHECKOUT_COMPLETED', 'PAYMENT_REFUNDED']],
  ] as const)(
    'rejects manual send when the payment is %s',
    async (expectedStatus, eventTypes) => {
      const recipientEmail = `closed-${randomUUID()}@example.com`;
      const { accessToken, payment } = await createPendingEmail(
        recipientEmail,
        false,
      );
      for (const eventType of eventTypes) {
        await applyLifecycleEvent(payment.publicId, eventType);
      }

      const detail = await request(app.getHttpServer())
        .get(`/payment-requests/${payment.publicId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect((detail.body as { status: string }).status).toBe(expectedStatus);
      await request(app.getHttpServer())
        .post(`/payment-requests/${payment.publicId}/email-deliveries`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', `closed-${expectedStatus}`)
        .send({})
        .expect(409, {
          message: 'Only pending payment requests can be sent',
          error: 'Conflict',
          statusCode: 409,
        });
    },
  );

  afterAll(async () => {
    await app.close();
  });
});
