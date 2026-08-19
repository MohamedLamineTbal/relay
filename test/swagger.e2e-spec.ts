import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureSwagger } from '../src/swagger';
import { WebhookDeliveryWorker } from '../src/webhook-deliveries/webhook-delivery.worker';

type SwaggerDocument = {
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  paths: Record<
    string,
    Record<
      string,
      {
        parameters?: Array<{ in?: string; name?: string; required?: boolean }>;
        requestBody?: unknown;
        security?: Array<Record<string, unknown[]>>;
      }
    >
  >;
};

describe('Swagger documentation', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WebhookDeliveryWorker)
      .useValue({})
      .compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    configureSwagger(app);
    await app.init();
  });

  it('documents authentication bodies and bearer-protected endpoints', async () => {
    await request(app.getHttpServer())
      .get('/api')
      .expect('Content-Type', /html/)
      .expect(200);
    const response = await request(app.getHttpServer())
      .get('/api-json')
      .expect(200);
    const document = response.body as unknown as SwaggerDocument;

    expect(document.components?.schemas?.AuthDto).toBeDefined();
    expect(document.paths['/auth/register'].post.requestBody).toBeDefined();
    expect(document.paths['/auth/login'].post.security).toBeUndefined();
    expect(document.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(document.paths['/workspace'].get.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/customers'].post.requestBody).toBeDefined();
    expect(document.paths['/payment-requests'].post.requestBody).toBeDefined();
    expect(document.paths['/payment-requests'].post.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'header',
          name: 'Idempotency-Key',
          required: true,
        }),
      ]),
    );
    expect(
      document.paths['/webhook-destination'].put.requestBody,
    ).toBeDefined();
    expect(document.paths['/pay/{publicId}'].get.security).toBeUndefined();
  });

  it('documents list filters as optional query parameters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api-json')
      .expect(200);
    const document = response.body as unknown as SwaggerDocument;

    expect(document.paths['/alerts'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'query',
          name: 'status',
          required: false,
        }),
      ]),
    );
    expect(document.paths['/webhook-deliveries'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'query',
          name: 'paymentPublicId',
          required: false,
        }),
        expect.objectContaining({
          in: 'query',
          name: 'outcome',
          required: false,
        }),
      ]),
    );
  });

  afterAll(async () => app?.close());
});
