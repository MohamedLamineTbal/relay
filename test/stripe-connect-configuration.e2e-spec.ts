import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import request from 'supertest';
import { App } from 'supertest/types';
import { STRIPE_CONNECT_PROVIDER } from '../src/stripe-connect/stripe-connect.provider';
import type { StripeConnectStripeProvider } from '../src/stripe-connect/stripe-connect.stripe-provider';
import { WebhookDeliveryWorker } from '../src/webhook-deliveries/webhook-delivery.worker';

type LoginResponse = { accessToken: string };
type RegistrationResponse = { workspace: { id: string } };

describe('Stripe Connect configuration', () => {
  let app: INestApplication<App>;
  let createAccountArguments: unknown[] = [];

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_CONNECT_REFRESH_URL =
      'https://app.example.test/stripe-connect/refresh';
    process.env.STRIPE_CONNECT_RETURN_URL =
      'https://app.example.test/stripe-connect/return';
    const { AppModule } =
      (await import('../src/app.module')) as typeof import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WebhookDeliveryWorker)
      .useValue({})
      .compile();
    const provider = moduleFixture.get<StripeConnectStripeProvider>(
      STRIPE_CONNECT_PROVIDER,
    );
    const stripe = (
      provider as unknown as {
        stripe: {
          accounts: {
            create: (...args: unknown[]) => Promise<{ id: string }>;
          };
          accountLinks: {
            create: () => Promise<{ url: string }>;
          };
        };
      }
    ).stripe;
    jest.spyOn(stripe.accounts, 'create').mockImplementation((...args) => {
      createAccountArguments = args;
      return Promise.resolve({ id: `acct_${randomUUID()}` });
    });
    jest.spyOn(stripe.accountLinks, 'create').mockResolvedValue({
      url: 'https://connect.stripe.test/configuration',
    });
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  it('loads the Stripe secret for the onboarding endpoint', async () => {
    const email = `stripe-config-${randomUUID()}@example.com`;
    const password = 'correct horse battery staple';
    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    const workspaceId = (registration.body as RegistrationResponse).workspace
      .id;
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const accessToken = (login.body as LoginResponse).accessToken;

    await request(app.getHttpServer())
      .post('/stripe-connect/onboarding')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201, { url: 'https://connect.stripe.test/configuration' });
    expect(createAccountArguments).toEqual([
      {
        type: 'express',
        country: 'US',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { workspaceId },
      },
      {
        idempotencyKey: `stripe-connect-account-v3:${workspaceId}:after:initial`,
      },
    ]);
  });

  afterAll(async () => app?.close());
});
