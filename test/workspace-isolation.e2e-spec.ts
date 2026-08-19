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

jest.setTimeout(20_000);

type LoginResponse = {
  accessToken: string;
};

type CustomerResponse = {
  id: number;
  name: string;
  email: string | null;
  createdAt: string;
};

type PaymentRequestResponse = {
  publicId: string;
  description: string;
  internalReference: string | null;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PAID';
  checkoutUrl: string;
  providerCheckoutSessionId: string;
  providerPaymentIntentId: string | null;
  createdAt: string;
  customer: Pick<CustomerResponse, 'id' | 'name' | 'email'>;
};

describe('Workspace isolation API', () => {
  let app: INestApplication<App>;
  const stripeConnectProvider: StripeConnectProvider = {
    createAccount() {
      return Promise.resolve({ id: `acct_${randomUUID()}` });
    },
    createOnboardingLink() {
      return Promise.resolve({
        url: 'https://connect.stripe.test/workspace-isolation',
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
      const sessionId = `cs_${randomUUID()}`;

      return Promise.resolve({
        id: sessionId,
        paymentIntentId: `pi_${randomUUID()}`,
        url: `https://checkout.stripe.test/${sessionId}`,
      });
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

    const accessToken = (login.body as LoginResponse).accessToken;
    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    return accessToken;
  }

  it('creates a customer for the authenticated workspace without ownership identifiers', async () => {
    const accessToken = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Ada Lovelace', email: 'ada@example.com' })
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(
      Object.keys(response.body as Record<string, unknown>).sort(),
    ).toEqual(['createdAt', 'email', 'id', 'name']);
  });

  it('rejects caller-supplied customer ownership identifiers', async () => {
    const accessToken = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Grace Hopper',
        email: 'grace@example.com',
        userId: 123,
        workspaceId: 'caller-selected-workspace',
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Customer ownership is derived from authentication',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('retrieves a customer from the authenticated workspace', async () => {
    const accessToken = await registerAndLogin();
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Katherine Johnson', email: 'katherine@example.com' })
      .expect(201);
    const customer = created.body as CustomerResponse;

    const response = await request(app.getHttpServer())
      .get(`/customers/${customer.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual(customer);
  });

  it('returns a workspace-scoped customer dossier with collection history', async () => {
    const ownerAccessToken = await registerAndLogin();
    const otherAccessToken = await registerAndLogin();
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'Dossier Customer', email: 'dossier@example.com' })
      .expect(201);
    const customer = created.body as CustomerResponse;
    const payment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .set('Idempotency-Key', `dossier-${randomUUID()}`)
      .send({
        description: 'Dossier invoice',
        amount: 12_500,
        currency: 'usd',
        customerId: customer.id,
      })
      .expect(201);

    const dossier = await request(app.getHttpServer())
      .get(`/customers/${customer.id}/dossier`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    expect(dossier.body).toEqual({
      customer,
      collections: [payment.body],
    });

    await request(app.getHttpServer())
      .get(`/customers/${customer.id}/dossier`)
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .expect(404, {
        message: 'Customer not found',
        error: 'Not Found',
        statusCode: 404,
      });
  });

  it('lets the authenticated workspace owner correct a customer email', async () => {
    const accessToken = await registerAndLogin();
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Email Correction Customer' })
      .expect(201);
    const customer = created.body as CustomerResponse;

    const updated = await request(app.getHttpServer())
      .patch(`/customers/${customer.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'corrected@example.com' })
      .expect(200);

    expect(updated.body).toEqual({
      ...customer,
      email: 'corrected@example.com',
    });

    await request(app.getHttpServer())
      .get(`/customers/${customer.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, updated.body);
  });

  it.each([{}, { email: 42 }, { email: 'not-an-email' }])(
    'rejects an invalid customer email update',
    async (body) => {
      const accessToken = await registerAndLogin();
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Invalid Email Customer' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/customers/${(created.body as CustomerResponse).id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)
        .expect(400);

      expect(response.body).toEqual({
        message: 'Email must be a valid email address',
        error: 'Bad Request',
        statusCode: 400,
      });
    },
  );

  it('does not reveal whether an email-updated customer belongs to another workspace', async () => {
    const ownerAccessToken = await registerAndLogin();
    const otherAccessToken = await registerAndLogin();
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'Private Email Customer' })
      .expect(201);
    const customerId = (created.body as CustomerResponse).id;

    const crossWorkspace = await request(app.getHttpServer())
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .send({ email: 'hidden@example.com' })
      .expect(404);
    const missing = await request(app.getHttpServer())
      .patch('/customers/2147483647')
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .send({ email: 'hidden@example.com' })
      .expect(404);

    expect(crossWorkspace.body).toEqual(missing.body);
  });

  it('lists only customers from the authenticated workspace', async () => {
    const firstAccessToken = await registerAndLogin();
    const secondAccessToken = await registerAndLogin();
    const firstCustomer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ name: 'First Workspace Customer' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .send({ name: 'Second Workspace Customer' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(200);

    expect(response.body).toEqual([firstCustomer.body]);
  });

  it('creates a payment request for a customer in the authenticated workspace', async () => {
    const accessToken = await registerAndLogin();
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Dorothy Vaughan', email: 'dorothy@example.com' })
      .expect(201);
    const customer = customerResponse.body as CustomerResponse;

    const response = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `workspace-create-${randomUUID()}`)
      .send({
        description: 'Engineering services',
        amount: 12500,
        currency: 'usd',
        customerId: customer.id,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      description: 'Engineering services',
      amount: 12500,
      currency: 'usd',
      status: 'PENDING',
      customer: {
        id: customer.id,
        name: 'Dorothy Vaughan',
        email: 'dorothy@example.com',
      },
    });
    expect(
      Object.keys(response.body as Record<string, unknown>).sort(),
    ).toEqual([
      'amount',
      'checkoutUrl',
      'createdAt',
      'currency',
      'customer',
      'description',
      'internalReference',
      'providerCheckoutSessionId',
      'providerPaymentIntentId',
      'publicId',
      'sendEmailRequested',
      'status',
    ]);
  });

  it('retrieves a payment request from the authenticated workspace', async () => {
    const accessToken = await registerAndLogin();
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Mary Jackson', email: 'mary@example.com' })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `workspace-retrieve-${randomUUID()}`)
      .send({
        description: 'Consulting services',
        amount: 9800,
        currency: 'usd',
        customerId: (customer.body as CustomerResponse).id,
      })
      .expect(201);
    const paymentRequest = created.body as PaymentRequestResponse;

    const response = await request(app.getHttpServer())
      .get(`/payment-requests/${paymentRequest.publicId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      ...paymentRequest,
      latestEmailDelivery: null,
    });
  });

  it('does not reveal whether a payment request belongs to another workspace', async () => {
    const ownerAccessToken = await registerAndLogin();
    const otherAccessToken = await registerAndLogin();
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'Owner Customer' })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .set('Idempotency-Key', `workspace-private-${randomUUID()}`)
      .send({
        description: 'Private payment',
        amount: 4500,
        currency: 'usd',
        customerId: (customer.body as CustomerResponse).id,
      })
      .expect(201);
    const paymentRequest = created.body as PaymentRequestResponse;

    const crossWorkspace = await request(app.getHttpServer())
      .get(`/payment-requests/${paymentRequest.publicId}`)
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .get(`/payment-requests/missing-${randomUUID()}`)
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .expect(404);

    expect(crossWorkspace.body).toEqual(missing.body);
  });

  it('lists only payment requests from the authenticated workspace', async () => {
    const firstAccessToken = await registerAndLogin();
    const secondAccessToken = await registerAndLogin();
    const firstCustomer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ name: 'First Payment Customer' })
      .expect(201);
    const secondCustomer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .send({ name: 'Second Payment Customer' })
      .expect(201);
    const firstPayment = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .set('Idempotency-Key', `workspace-first-${randomUUID()}`)
      .send({
        description: 'First workspace payment',
        amount: 3100,
        currency: 'usd',
        customerId: (firstCustomer.body as CustomerResponse).id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .set('Idempotency-Key', `workspace-second-${randomUUID()}`)
      .send({
        description: 'Second workspace payment',
        amount: 7200,
        currency: 'usd',
        customerId: (secondCustomer.body as CustomerResponse).id,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/payment-requests')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(200);

    expect(response.body).toEqual([firstPayment.body]);
  });

  it('keeps the owner reference out of buyer-facing payment data', async () => {
    const accessToken = await registerAndLogin();
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Private Buyer', email: 'private@example.com' })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `workspace-public-${randomUUID()}`)
      .send({
        description: 'Website design services',
        internalReference: 'Invoice 42',
        amount: 6400,
        currency: 'usd',
        customerId: (customer.body as CustomerResponse).id,
      })
      .expect(201);
    const paymentRequest = created.body as PaymentRequestResponse;
    expect(paymentRequest.internalReference).toBe('Invoice 42');

    const response = await request(app.getHttpServer())
      .get(`/pay/${paymentRequest.publicId}`)
      .expect(200);
    const publicPayment = response.body as Record<string, unknown>;

    expect(typeof publicPayment.businessName).toBe('string');
    expect(publicPayment).toEqual({
      publicId: paymentRequest.publicId,
      description: 'Website design services',
      amount: 6400,
      currency: 'usd',
      status: 'PENDING',
      businessName: publicPayment.businessName,
    });
    expect(Object.keys(publicPayment).sort()).toEqual([
      'amount',
      'businessName',
      'currency',
      'description',
      'publicId',
      'status',
    ]);
  });

  it('returns not found for an unknown public payment identifier', async () => {
    const response = await request(app.getHttpServer())
      .get(`/pay/missing-${randomUUID()}`)
      .expect(404);

    expect(response.body).toEqual({
      message: 'Payment request not found',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('does not reveal whether a payment customer belongs to another workspace', async () => {
    const ownerAccessToken = await registerAndLogin();
    const otherAccessToken = await registerAndLogin();
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'Other Workspace Customer' })
      .expect(201);

    const crossWorkspace = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .set('Idempotency-Key', `workspace-cross-${randomUUID()}`)
      .send({
        description: 'Forbidden payment',
        amount: 2000,
        currency: 'usd',
        customerId: (customer.body as CustomerResponse).id,
      })
      .expect(404);
    const missing = await request(app.getHttpServer())
      .post('/payment-requests')
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .set('Idempotency-Key', `workspace-missing-${randomUUID()}`)
      .send({
        description: 'Missing customer payment',
        amount: 2000,
        currency: 'usd',
        customerId: 2147483647,
      })
      .expect(404);

    expect(crossWorkspace.body).toEqual(missing.body);
  });

  it('does not reveal whether a customer belongs to another workspace', async () => {
    const ownerAccessToken = await registerAndLogin();
    const otherAccessToken = await registerAndLogin();
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ name: 'Hidden Workspace Customer' })
      .expect(201);

    const crossWorkspace = await request(app.getHttpServer())
      .get(`/customers/${(customer.body as CustomerResponse).id}`)
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .get('/customers/2147483647')
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .expect(404);

    expect(crossWorkspace.body).toEqual(missing.body);
  });

  afterAll(async () => {
    await app.close();
  });
});
