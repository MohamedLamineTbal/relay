import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  STRIPE_CONNECT_PROVIDER,
  type StripeConnectProvider,
} from '../src/stripe-connect/stripe-connect.provider';

type LoginResponse = {
  accessToken: string;
};

describe('Stripe Connect API', () => {
  let app: INestApplication<App>;
  const accountIds: string[] = [];
  const onboardingUrls: string[] = [];
  const accountStatuses = new Map<
    string,
    { onboardingComplete: boolean; paymentsReady: boolean }
  >();
  const workspaceAccounts = new Map<string, string>();
  const stripeProvider: StripeConnectProvider = {
    createAccount(workspaceId) {
      const existingAccountId = workspaceAccounts.get(workspaceId);

      if (existingAccountId) {
        return Promise.resolve({ id: existingAccountId });
      }

      const id = accountIds.shift();

      if (!id) {
        throw new Error('No fake Stripe account configured');
      }

      workspaceAccounts.set(workspaceId, id);
      return Promise.resolve({ id });
    },
    createOnboardingLink() {
      const url = onboardingUrls.shift();

      if (!url) {
        throw new Error('No fake onboarding URL configured');
      }

      return Promise.resolve({ url });
    },
    getAccountStatus(accountId) {
      const status = accountStatuses.get(accountId);

      if (!status) {
        throw new Error(`No fake status configured for ${accountId}`);
      }

      return Promise.resolve(status);
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(STRIPE_CONNECT_PROVIDER)
      .useValue(stripeProvider)
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

  it('reports an unconnected workspace as not ready for payments', async () => {
    const accessToken = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .get('/stripe-connect/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      connected: false,
      onboardingComplete: false,
      paymentsReady: false,
    });
  });

  it('starts Stripe-hosted onboarding for an authenticated workspace', async () => {
    const accessToken = await registerAndLogin();
    accountIds.push(`acct_${randomUUID()}`);
    onboardingUrls.push('https://connect.stripe.test/onboarding/session-one');

    const response = await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(response.body).toEqual({
      url: 'https://connect.stripe.test/onboarding/session-one',
    });
  });

  it('reuses the workspace connected account when onboarding restarts', async () => {
    const accessToken = await registerAndLogin();
    accountIds.push(`acct_${randomUUID()}`);
    onboardingUrls.push(
      'https://connect.stripe.test/onboarding/first-link',
      'https://connect.stripe.test/onboarding/refreshed-link',
    );

    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
      .expect({
        url: 'https://connect.stripe.test/onboarding/first-link',
      });

    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
      .expect({
        url: 'https://connect.stripe.test/onboarding/refreshed-link',
      });
  });

  it('reports an incomplete connected account as not ready for payments', async () => {
    const accessToken = await registerAndLogin();
    const accountId = `acct_${randomUUID()}`;
    accountIds.push(accountId);
    onboardingUrls.push(
      'https://connect.stripe.test/onboarding/incomplete-account',
    );
    accountStatuses.set(accountId, {
      onboardingComplete: false,
      paymentsReady: false,
    });

    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/stripe-connect/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      connected: true,
      onboardingComplete: false,
      paymentsReady: false,
    });
  });

  it('reports a completed connected account as ready for payments', async () => {
    const accessToken = await registerAndLogin();
    const accountId = `acct_${randomUUID()}`;
    accountIds.push(accountId);
    onboardingUrls.push(
      'https://connect.stripe.test/onboarding/completed-account',
    );
    accountStatuses.set(accountId, {
      onboardingComplete: true,
      paymentsReady: true,
    });

    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/stripe-connect/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      connected: true,
      onboardingComplete: true,
      paymentsReady: true,
    });
  });

  it('rejects every non-empty onboarding request body', async () => {
    const accessToken = await registerAndLogin();
    accountIds.push(`acct_${randomUUID()}`);
    onboardingUrls.push(
      'https://connect.stripe.test/onboarding/must-not-be-created',
    );

    const response = await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        providerConfiguration: {
          stripe_key: 'sk_test_caller_supplied',
        },
      })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Stripe onboarding does not accept a request body',
      error: 'Bad Request',
      statusCode: 400,
    });
    accountIds.length = 0;
    onboardingUrls.length = 0;
  });

  it('uses one connected account across concurrent onboarding requests', async () => {
    const accessToken = await registerAndLogin();
    accountIds.push(`acct_${randomUUID()}`);
    onboardingUrls.push(
      'https://connect.stripe.test/onboarding/concurrent-one',
      'https://connect.stripe.test/onboarding/concurrent-two',
    );

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/stripe-connect/onboarding')
        .set('Authorization', `Bearer ${accessToken}`),
      request(app.getHttpServer())
        .post('/stripe-connect/onboarding')
        .set('Authorization', `Bearer ${accessToken}`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(
      responses
        .map((response) => (response.body as { url: string }).url)
        .sort(),
    ).toEqual([
      'https://connect.stripe.test/onboarding/concurrent-one',
      'https://connect.stripe.test/onboarding/concurrent-two',
    ]);
    expect(accountIds).toHaveLength(0);
  });

  it('prevents a connected Stripe account from being associated with two workspaces', async () => {
    const firstAccessToken = await registerAndLogin();
    const secondAccessToken = await registerAndLogin();
    const sharedAccountId = `acct_${randomUUID()}`;
    accountIds.push(sharedAccountId, sharedAccountId);
    onboardingUrls.push(
      'https://connect.stripe.test/onboarding/first-workspace',
      'https://connect.stripe.test/onboarding/second-workspace',
    );

    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .expect(409);

    expect(response.body).toEqual({
      message: 'Stripe account is already connected to another workspace',
      error: 'Conflict',
      statusCode: 409,
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
