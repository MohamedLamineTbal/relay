import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { WebhookDeliveryWorker } from '../src/webhook-deliveries/webhook-delivery.worker';

describe('Browser redirects', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.FRONTEND_APP_URL = 'https://dashboard.example.test';
    const { AppModule } =
      (await import('../src/app.module')) as typeof import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WebhookDeliveryWorker)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  it('returns from Stripe Connect to the frontend Stripe page without API authentication', async () => {
    await request(app.getHttpServer())
      .get('/stripe-connect/onboarding/return')
      .expect(302)
      .expect(
        'Location',
        'https://dashboard.example.test/stripe?onboarding=return',
      );
  });

  it('sends an expired Stripe Connect link to the frontend refresh flow without API authentication', async () => {
    await request(app.getHttpServer())
      .get('/stripe-connect/onboarding/refresh')
      .expect(302)
      .expect(
        'Location',
        'https://dashboard.example.test/stripe?onboarding=refresh',
      );
  });

  it('forwards a completed Checkout session to the frontend success page', async () => {
    await request(app.getHttpServer())
      .get('/payments/success?session_id=cs_test_completed')
      .expect(302)
      .expect(
        'Location',
        'https://dashboard.example.test/payments/success?session_id=cs_test_completed',
      );
  });

  it('forwards a canceled Checkout session to the frontend cancel page', async () => {
    await request(app.getHttpServer())
      .get('/payments/cancel')
      .expect(302)
      .expect('Location', 'https://dashboard.example.test/payments/cancel');
  });

  afterAll(async () => app?.close());
});
