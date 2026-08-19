import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
  type SendPaymentEmailInput,
} from '../src/payment-emails/email-provider';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../src/payment-requests/payment-provider';
import {
  STRIPE_CONNECT_PROVIDER,
  type StripeConnectProvider,
} from '../src/stripe-connect/stripe-connect.provider';

type LoginResponse = { accessToken: string };
type CustomerResponse = { id: number };
type PaymentResponse = {
  publicId: string;
  checkoutUrl?: string;
  sendEmailRequested: boolean;
  latestEmailDelivery?: {
    id: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    recipientEmail: string;
    providerMessageId: string | null;
  } | null;
};

describe('Payment request emails', () => {
  let app: INestApplication<App>;
  const sentEmails: SendPaymentEmailInput[] = [];
  const createdCheckouts: string[] = [];
  const emailProvider: EmailProvider = {
    sendPaymentEmail(input) {
      sentEmails.push(input);
      return Promise.resolve({ messageId: 'email_message_123' });
    },
  };
  const stripeConnectProvider: StripeConnectProvider = {
    createAccount: (workspaceId) =>
      Promise.resolve({ id: `acct_${workspaceId}` }),
    createOnboardingLink: () =>
      Promise.resolve({ url: 'https://connect.stripe.test/payment-email' }),
    getAccountStatus: () =>
      Promise.resolve({ onboardingComplete: true, paymentsReady: true }),
  };
  const paymentProvider: PaymentProvider = {
    createCheckout: (input) => {
      createdCheckouts.push(input.paymentRequestPublicId);
      return Promise.resolve({
        id: `cs_${randomUUID()}`,
        paymentIntentId: `pi_${randomUUID()}`,
        url: 'https://checkout.stripe.test/payment-email',
      });
    },
  };

  beforeAll(async () => {
    process.env.RESEND_API_KEY = 're_test_payment_email';
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
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    sentEmails.length = 0;
    createdCheckouts.length = 0;
  });

  async function registerOwnerAndCreatePayment() {
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
      .send({ name: 'Ada Buyer', email: 'ada@example.com' })
      .expect(201);
    const payment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: (customer.body as CustomerResponse).id,
        amount: 12500,
        currency: 'usd',
        description: 'Engineering services',
        internalReference: 'Invoice 42',
      })
      .expect(201);

    return {
      accessToken,
      ownerEmail: email,
      payment: payment.body as PaymentResponse,
    };
  }

  async function waitForSentDelivery(
    accessToken: string,
    publicId: string,
  ): Promise<PaymentResponse> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get(`/payment-requests/${publicId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const payment = response.body as PaymentResponse;
      if (payment.latestEmailDelivery?.status === 'SENT') return payment;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Expected payment email to become SENT');
  }

  it('emails an existing pending payment request and exposes provider acceptance', async () => {
    const { accessToken, ownerEmail, payment } =
      await registerOwnerAndCreatePayment();

    const queued = await request(app.getHttpServer())
      .post(`/payment-requests/${payment.publicId}/email-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'send-existing-payment')
      .send({})
      .expect(202);

    expect(queued.body).toMatchObject({
      status: 'PENDING',
      recipientEmail: 'ada@example.com',
      providerMessageId: null,
    });
    const queuedDelivery = queued.body as NonNullable<
      PaymentResponse['latestEmailDelivery']
    >;

    const updated = await waitForSentDelivery(accessToken, payment.publicId);
    expect(updated.latestEmailDelivery).toMatchObject({
      id: queuedDelivery.id,
      status: 'SENT',
      recipientEmail: 'ada@example.com',
      providerMessageId: 'email_message_123',
    });
    expect(sentEmails).toHaveLength(1);
    const sentEmail = sentEmails[0];
    expect(sentEmail.from).toMatch(
      /^owner-.*@example\.com via Relay <onboarding@resend\.dev>$/,
    );
    expect(sentEmail.replyTo).toBe(ownerEmail);
    expect(sentEmail.to).toBe('ada@example.com');
    expect(sentEmail.subject).toBe('Your payment request is ready');
    expect(sentEmail.html).toContain(
      'https://checkout.stripe.test/payment-email',
    );
    expect(sentEmail.text).toContain('Engineering services');
    expect(sentEmail.text).toContain(
      "You've received a secure payment request for Engineering services in the amount of $125.00.",
    );
    expect(sentEmail.idempotencyKey).toMatch(/^payment-email:/);
    expect(sentEmail.html).toContain('Ada Buyer');
    expect(sentEmail.html).toContain('$125.00');
    expect(sentEmail.html).toContain('>Review and pay securely<');
    expect(sentEmail.html).toContain('>Open the secure payment page<');
    expect(sentEmail.html).not.toContain(
      '>https://checkout.stripe.test/payment-email<',
    );
    expect(sentEmail.text).toContain(
      'https://checkout.stripe.test/payment-email',
    );
    expect(sentEmail.html).not.toContain('Invoice 42');
    expect(sentEmail.text).not.toContain('Invoice 42');
  });

  it('creates a checkout and atomically queues its first email', async () => {
    const email = `create-send-${randomUUID()}@example.com`;
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
      .send({ name: 'Grace Buyer', email: 'grace@example.com' })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'create-and-send-payment')
      .send({
        customerId: (customer.body as CustomerResponse).id,
        amount: 9900,
        currency: 'usd',
        description: 'Consulting package',
        sendEmail: true,
        message: 'Thank you for your business.',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      status: 'PENDING',
      sendEmailRequested: true,
      latestEmailDelivery: {
        status: 'PENDING',
        recipientEmail: 'grace@example.com',
      },
    });

    const payment = created.body as PaymentResponse;
    const updated = await waitForSentDelivery(accessToken, payment.publicId);
    expect(updated.latestEmailDelivery?.status).toBe('SENT');
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('grace@example.com');
    expect(sentEmails[0].html).toContain('Thank you for your business.');
    expect(sentEmails[0].text).toContain('Thank you for your business.');
  });

  it('keeps omitted sendEmail link-only and rejects a message without send intent', async () => {
    const { accessToken, payment } = await registerOwnerAndCreatePayment();

    expect(payment.sendEmailRequested).toBe(false);

    const detail = await request(app.getHttpServer())
      .get(`/payment-requests/${payment.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((detail.body as PaymentResponse).sendEmailRequested).toBe(false);
    expect((detail.body as PaymentResponse).latestEmailDelivery).toBeNull();
    expect(sentEmails).toHaveLength(0);

    await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'message-without-send')
      .send({
        customerId: 1,
        amount: 100,
        currency: 'usd',
        description: 'Should be rejected',
        message: 'Do not ignore me',
      })
      .expect(400, {
        message: 'Message can only be supplied when sendEmail is true',
        error: 'Bad Request',
        statusCode: 400,
      });
  });

  it('deduplicates create-and-send and conflicts when the email intent changes', async () => {
    const { accessToken } = await registerOwnerAndCreatePayment();
    const customers = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const customerId = (customers.body as CustomerResponse[])[0].id;
    const input = {
      customerId,
      amount: 3200,
      currency: 'usd',
      description: 'Idempotent email',
      sendEmail: true,
      message: 'Original note',
    };

    const first = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'same-create-send')
      .send(input)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'same-create-send')
      .send(input)
      .expect(201);

    const firstPayment = first.body as PaymentResponse;
    const replayedPayment = replay.body as PaymentResponse;
    expect(replayedPayment.publicId).toBe(firstPayment.publicId);
    expect(replayedPayment.latestEmailDelivery?.id).toBe(
      firstPayment.latestEmailDelivery?.id,
    );
    expect(createdCheckouts).toHaveLength(2);

    await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'same-create-send')
      .send({ ...input, message: 'Changed note' })
      .expect(409, {
        message: 'Idempotency-Key was already used for a different payment',
        error: 'Conflict',
        statusCode: 409,
      });
    expect(createdCheckouts).toHaveLength(2);
  });

  it('rejects create-and-send before Stripe when email is unconfigured but keeps link-only available', async () => {
    const { accessToken } = await registerOwnerAndCreatePayment();
    const customers = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const customerId = (customers.body as CustomerResponse[])[0].id;
    const checkoutCountBefore = createdCheckouts.length;
    const apiKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    try {
      await request(app.getHttpServer())
        .post('/payment-requests')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', 'unconfigured-create-send')
        .send({
          customerId,
          amount: 1200,
          currency: 'usd',
          description: 'Must fail before Stripe',
          sendEmail: true,
        })
        .expect(503, {
          message: 'Payment email is not configured',
          error: 'Service Unavailable',
          statusCode: 503,
        });
      expect(createdCheckouts).toHaveLength(checkoutCountBefore);

      await request(app.getHttpServer())
        .post('/payment-requests')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', 'unconfigured-link-only')
        .send({
          customerId,
          amount: 1200,
          currency: 'usd',
          description: 'Link only still works',
        })
        .expect(201);
      expect(createdCheckouts).toHaveLength(checkoutCountBefore + 1);
    } finally {
      process.env.RESEND_API_KEY = apiKey;
    }
  });

  it('rejects missing recipients and custom email controls before creating checkout', async () => {
    const { accessToken } = await registerOwnerAndCreatePayment();
    const customers = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const validCustomerId = (customers.body as CustomerResponse[])[0].id;
    const noEmailCustomer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'No Email Buyer' })
      .expect(201);
    const checkoutCountBefore = createdCheckouts.length;

    await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'missing-recipient')
      .send({
        customerId: (noEmailCustomer.body as CustomerResponse).id,
        amount: 800,
        currency: 'usd',
        description: 'Missing recipient',
        sendEmail: true,
      })
      .expect(400, {
        message:
          'Customer needs a valid email address before this payment can be sent',
        error: 'Bad Request',
        statusCode: 400,
      });
    expect(createdCheckouts).toHaveLength(checkoutCountBefore);

    await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'custom-email-html')
      .send({
        customerId: validCustomerId,
        amount: 800,
        currency: 'usd',
        description: 'Custom email is forbidden',
        sendEmail: true,
        html: '<strong>custom</strong>',
      })
      .expect(400, {
        message: 'Custom email content is not supported',
        error: 'Bad Request',
        statusCode: 400,
      });
    expect(createdCheckouts).toHaveLength(checkoutCountBefore);
  });

  afterAll(async () => {
    await app.close();
  });
});
