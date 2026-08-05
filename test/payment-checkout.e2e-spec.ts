import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  PAYMENT_PROVIDER,
  type CheckoutSession,
  type PaymentProvider,
} from '../src/payment-requests/payment-provider';
import {
  STRIPE_CONNECT_PROVIDER,
  type StripeConnectProvider,
} from '../src/stripe-connect/stripe-connect.provider';

type LoginResponse = {
  accessToken: string;
};

type CustomerResponse = {
  id: number;
};

type CheckoutResponse = {
  publicId: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  checkoutUrl: string;
  providerCheckoutSessionId: string;
  providerPaymentIntentId: string | null;
  createdAt: string;
  customer: {
    id: number;
    name: string;
    email: string | null;
  };
};

type CheckoutBarrier = {
  keySuffix: string;
  arrivals: number;
  session: CheckoutSession | null;
  ready: Promise<void>;
  release: () => void;
};

describe('One-time checkout API', () => {
  let app: INestApplication<App>;
  const queuedConnectedAccountIds: string[] = [];
  const connectedAccountStatuses = new Map<
    string,
    { onboardingComplete: boolean; paymentsReady: boolean }
  >();
  const queuedCheckoutFailures: Error[] = [];
  const queuedCheckoutSessions: CheckoutSession[] = [];
  const checkoutSessionsByKey = new Map<string, CheckoutSession>();
  let checkoutBarrier: CheckoutBarrier | undefined;
  const stripeConnectProvider: StripeConnectProvider = {
    createAccount(workspaceId) {
      return Promise.resolve({
        id: queuedConnectedAccountIds.shift() ?? `acct_${workspaceId}`,
      });
    },
    createOnboardingLink() {
      return Promise.resolve({
        url: 'https://connect.stripe.test/onboarding/ready-account',
      });
    },
    getAccountStatus(accountId) {
      return Promise.resolve(
        connectedAccountStatuses.get(accountId) ?? {
          onboardingComplete: true,
          paymentsReady: true,
        },
      );
    },
  };
  const paymentProvider: PaymentProvider = {
    createCheckout(input) {
      if (
        checkoutBarrier &&
        input.idempotencyKey.endsWith(checkoutBarrier.keySuffix)
      ) {
        checkoutBarrier.arrivals += 1;
        checkoutBarrier.session ??= queuedCheckoutSessions.shift() ?? null;

        if (!checkoutBarrier.session) {
          throw new Error('No fake Checkout session configured');
        }

        if (checkoutBarrier.arrivals === 2) {
          checkoutSessionsByKey.set(
            input.idempotencyKey,
            checkoutBarrier.session,
          );
          checkoutBarrier.release();
        }

        return checkoutBarrier.ready.then(() => checkoutBarrier!.session!);
      }

      const existingSession = checkoutSessionsByKey.get(input.idempotencyKey);

      if (existingSession) {
        return Promise.resolve(existingSession);
      }

      const failure = queuedCheckoutFailures.shift();

      if (failure) {
        return Promise.reject(failure);
      }

      const session = queuedCheckoutSessions.shift();

      if (!session) {
        throw new Error('No fake Checkout session configured');
      }

      checkoutSessionsByKey.set(input.idempotencyKey, session);
      return Promise.resolve(session);
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
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  async function registerAndLogin() {
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

  it('creates a one-time checkout for a ready connected workspace', async () => {
    const accessToken = await registerAndLogin();
    const providerCheckoutSessionId = `cs_${randomUUID()}`;
    const providerPaymentIntentId = `pi_${randomUUID()}`;
    queuedCheckoutSessions.push({
      id: providerCheckoutSessionId,
      paymentIntentId: providerPaymentIntentId,
      url: 'https://checkout.stripe.test/session-one',
    });
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Ada Lovelace', email: 'ada@example.com' })
      .expect(201);
    const customer = customerResponse.body as CustomerResponse;

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'checkout-success')
      .send({
        customerId: customer.id,
        amount: 12500,
        currency: 'usd',
        description: 'Engineering services',
      })
      .expect(201);
    const checkout = response.body as CheckoutResponse;

    expect(checkout).toMatchObject({
      description: 'Engineering services',
      amount: 12500,
      currency: 'usd',
      status: 'PENDING',
      checkoutUrl: 'https://checkout.stripe.test/session-one',
      providerCheckoutSessionId,
      providerPaymentIntentId,
      customer: {
        id: customer.id,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });
    expect(checkout.publicId).toEqual(expect.any(String));
    expect(checkout.createdAt).toEqual(expect.any(String));
  });

  it('returns the original payment when the same workspace retries an idempotency key', async () => {
    const accessToken = await registerAndLogin();
    queuedCheckoutSessions.push({
      id: `cs_${randomUUID()}`,
      paymentIntentId: `pi_${randomUUID()}`,
      url: 'https://checkout.stripe.test/retry-session',
    });
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Grace Hopper', email: 'grace@example.com' })
      .expect(201);
    const customer = customerResponse.body as CustomerResponse;
    const payment = {
      customerId: customer.id,
      amount: 7800,
      currency: 'usd',
      description: 'Technical consulting',
    };

    const original = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'checkout-retry')
      .send(payment)
      .expect(201);
    const retried = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'checkout-retry')
      .send(payment)
      .expect(201);

    expect(retried.body).toEqual(original.body);
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      (listed.body as Array<{ publicId: string }>).map(
        ({ publicId }) => publicId,
      ),
    ).toEqual([(original.body as CheckoutResponse).publicId]);
  });

  it('rejects reuse of an idempotency key for different payment details', async () => {
    const accessToken = await registerAndLogin();
    queuedCheckoutSessions.push({
      id: `cs_${randomUUID()}`,
      paymentIntentId: `pi_${randomUUID()}`,
      url: 'https://checkout.stripe.test/idempotency-mismatch',
    });
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Idempotency Mismatch Buyer' })
      .expect(201);
    const customer = customerResponse.body as CustomerResponse;

    await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'mismatched-payment')
      .send({
        customerId: customer.id,
        amount: 5400,
        currency: 'usd',
        description: 'Original payment',
      })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'mismatched-payment')
      .send({
        customerId: customer.id,
        amount: 9900,
        currency: 'usd',
        description: 'Changed payment',
      })
      .expect(409);

    expect(response.body).toEqual({
      message: 'Idempotency-Key was already used for a different payment',
      error: 'Conflict',
      statusCode: 409,
    });
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listed.body).toHaveLength(1);
  });

  it('returns one payment for concurrent retries in the same workspace', async () => {
    const accessToken = await registerAndLogin();
    let releaseCheckoutBarrier = () => undefined;
    const checkoutBarrierReady = new Promise<void>((resolve) => {
      releaseCheckoutBarrier = resolve;
    });
    checkoutBarrier = {
      keySuffix: ':concurrent-checkout',
      arrivals: 0,
      session: null,
      ready: checkoutBarrierReady,
      release: releaseCheckoutBarrier,
    };
    queuedCheckoutSessions.push({
      id: `cs_${randomUUID()}`,
      paymentIntentId: `pi_${randomUUID()}`,
      url: 'https://checkout.stripe.test/concurrent-retry',
    });
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Concurrent Retry Buyer' })
      .expect(201);
    const payment = {
      customerId: (customerResponse.body as CustomerResponse).id,
      amount: 8900,
      currency: 'usd',
      description: 'Concurrent purchase',
    };

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/payment-requests')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', 'concurrent-checkout')
        .send(payment),
      request(app.getHttpServer())
        .post('/payment-requests')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', 'concurrent-checkout')
        .send(payment),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[1].body).toEqual(responses[0].body);
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listed.body).toHaveLength(1);
    checkoutBarrier = undefined;
  });

  it('keeps the same idempotency key isolated between workspaces', async () => {
    const firstAccessToken = await registerAndLogin();
    const secondAccessToken = await registerAndLogin();
    queuedCheckoutSessions.push(
      {
        id: `cs_${randomUUID()}`,
        paymentIntentId: `pi_${randomUUID()}`,
        url: 'https://checkout.stripe.test/first-workspace',
      },
      {
        id: `cs_${randomUUID()}`,
        paymentIntentId: `pi_${randomUUID()}`,
        url: 'https://checkout.stripe.test/second-workspace',
      },
    );

    for (const accessToken of [firstAccessToken, secondAccessToken]) {
      await request(app.getHttpServer())
        .post('/stripe-connect/onboarding')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
    }

    const firstCustomerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ name: 'First Workspace Buyer' })
      .expect(201);
    const secondCustomerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .send({ name: 'Second Workspace Buyer' })
      .expect(201);

    const firstPayment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .set('Idempotency-Key', 'shared-caller-key')
      .send({
        customerId: (firstCustomerResponse.body as CustomerResponse).id,
        amount: 3200,
        currency: 'usd',
        description: 'First workspace purchase',
      })
      .expect(201);
    const secondPayment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .set('Idempotency-Key', 'shared-caller-key')
      .send({
        customerId: (secondCustomerResponse.body as CustomerResponse).id,
        amount: 4500,
        currency: 'usd',
        description: 'Second workspace purchase',
      })
      .expect(201);

    expect((firstPayment.body as CheckoutResponse).publicId).not.toBe(
      (secondPayment.body as CheckoutResponse).publicId,
    );
    expect([
      (firstPayment.body as CheckoutResponse).checkoutUrl,
      (secondPayment.body as CheckoutResponse).checkoutUrl,
    ]).toEqual([
      'https://checkout.stripe.test/first-workspace',
      'https://checkout.stripe.test/second-workspace',
    ]);
  });

  it('leaves no payment request when the connected account is not ready', async () => {
    const accessToken = await registerAndLogin();
    const accountId = `acct_${randomUUID()}`;
    queuedConnectedAccountIds.push(accountId);
    connectedAccountStatuses.set(accountId, {
      onboardingComplete: false,
      paymentsReady: false,
    });
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Not Ready Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'not-ready-checkout')
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 5100,
        currency: 'usd',
        description: 'Blocked purchase',
      })
      .expect(409);

    expect(response.body).toEqual({
      message: 'Stripe account is not ready for payments',
      error: 'Conflict',
      statusCode: 409,
    });
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listed.body).toEqual([]);
  });

  it('does not create a checkout for another workspace customer', async () => {
    const customerOwnerAccessToken = await registerAndLogin();
    const requestingAccessToken = await registerAndLogin();
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${requestingAccessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${customerOwnerAccessToken}`)
      .send({ name: 'Private Workspace Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${requestingAccessToken}`)
      .set('Idempotency-Key', 'cross-workspace-customer')
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 7200,
        currency: 'usd',
        description: 'Forbidden purchase',
      })
      .expect(404);

    expect(response.body).toEqual({
      message: 'Customer not found',
      error: 'Not Found',
      statusCode: 404,
    });
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${requestingAccessToken}`)
      .expect(200);
    expect(listed.body).toEqual([]);
  });

  it('leaves no payment request when the workspace is not connected', async () => {
    const accessToken = await registerAndLogin();
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Unconnected Workspace Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'unconnected-checkout')
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 8300,
        currency: 'usd',
        description: 'Unconnected purchase',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Workspace is not connected to Stripe',
      error: 'Bad Request',
      statusCode: 400,
    });
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listed.body).toEqual([]);
  });

  it('requires an idempotency key for checkout creation', async () => {
    const accessToken = await registerAndLogin();
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Missing Key Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 9100,
        currency: 'usd',
        description: 'Missing idempotency key',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Idempotency-Key header is required for checkout creation',
      error: 'Bad Request',
      statusCode: 400,
    });
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listed.body).toEqual([]);
  });

  it('requires a currency for checkout creation', async () => {
    const accessToken = await registerAndLogin();
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Missing Currency Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'missing-currency')
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 9200,
        description: 'Missing currency',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Currency is required for checkout creation',
      error: 'Bad Request',
      statusCode: 400,
    });
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listed.body).toEqual([]);
  });

  it('does not allow legacy local-only payment creation', async () => {
    const accessToken = await registerAndLogin();
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Legacy Payment Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 9300,
        description: 'Local-only payment',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Currency is required for checkout creation',
      error: 'Bad Request',
      statusCode: 400,
    });
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listed.body).toEqual([]);
  });

  it('rejects a non-positive payment amount before calling Stripe', async () => {
    const accessToken = await registerAndLogin();
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Invalid Amount Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'invalid-amount')
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: -1,
        currency: 'usd',
        description: 'Invalid amount',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Amount must be a positive integer',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('rejects a payment amount above the platform limit before calling Stripe', async () => {
    const accessToken = await registerAndLogin();
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Oversized Amount Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'oversized-amount')
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 100_000_000,
        currency: 'usd',
        description: 'Oversized amount',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Amount must be between 1 and 99999999 minor units',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('rejects a malformed currency before calling Stripe', async () => {
    const accessToken = await registerAndLogin();
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Invalid Currency Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'invalid-currency')
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 1000,
        currency: 'USD',
        description: 'Invalid currency',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Currency must be a three-letter lowercase code',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('rejects an overlong idempotency key before calling Stripe', async () => {
    const accessToken = await registerAndLogin();
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Invalid Key Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'k'.repeat(201))
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 1000,
        currency: 'usd',
        description: 'Invalid idempotency key',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Idempotency-Key must be between 1 and 200 characters',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('rejects an overlong description before calling Stripe', async () => {
    const accessToken = await registerAndLogin();
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Invalid Description Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'invalid-description')
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 1000,
        currency: 'usd',
        description: 'd'.repeat(501),
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Description must be between 1 and 500 characters',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('rejects an invalid customer ID before calling Stripe', async () => {
    const accessToken = await registerAndLogin();
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'invalid-customer-id')
      .send({
        customerId: 0,
        amount: 1000,
        currency: 'usd',
        description: 'Invalid customer ID',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Customer ID must be a positive integer',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('rejects a missing checkout request body', async () => {
    const accessToken = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'missing-body')
      .expect(400);

    expect(response.body).toEqual({
      message: 'Checkout request body is required',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('leaves no payment request when Checkout creation fails', async () => {
    const accessToken = await registerAndLogin();
    queuedCheckoutFailures.push(new Error('Stripe is unavailable'));
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Provider Failure Buyer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'provider-failure')
      .send({
        customerId: (customerResponse.body as CustomerResponse).id,
        amount: 6400,
        currency: 'usd',
        description: 'Unavailable checkout',
      })
      .expect(502);

    expect(response.body).toEqual({
      message: 'Payment provider could not create checkout',
      error: 'Bad Gateway',
      statusCode: 502,
    });
    const listed = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listed.body).toEqual([]);
  });

  afterAll(async () => {
    await app.close();
  });
});
