import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

type PublicUser = {
  id: number;
  email: string;
  createdAt: string;
};

type PublicWorkspace = {
  id: string;
  name: string;
  createdAt: string;
};

type RegistrationResponse = {
  user: PublicUser;
  workspace: PublicWorkspace;
  role: 'OWNER';
};

type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

describe('Authentication API', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('registers a developer as the owner of a new workspace', async () => {
    const email = `owner-${randomUUID()}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct horse battery staple' })
      .expect(201);

    const body = response.body as unknown as RegistrationResponse;

    expect(body).toMatchObject({
      user: { email },
      workspace: { name: email },
      role: 'OWNER',
    });
    expect(typeof body.user.id).toBe('number');
    expect(Number.isNaN(Date.parse(body.user.createdAt))).toBe(false);
    expect(Object.keys(body.user).sort()).toEqual(['createdAt', 'email', 'id']);
    expect(typeof body.workspace.id).toBe('string');
    expect(Number.isNaN(Date.parse(body.workspace.createdAt))).toBe(false);
  });

  it('signs in a registered workspace owner', async () => {
    const email = `owner-${randomUUID()}@example.com`;
    const password = 'correct horse battery staple';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const body = response.body as unknown as LoginResponse;

    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.length).toBeGreaterThan(0);
  });

  it('uses a bearer token to access the owner workspace', async () => {
    const email = `owner-${randomUUID()}@example.com`;
    const password = 'correct horse battery staple';

    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const registrationBody =
      registration.body as unknown as RegistrationResponse;
    const loginBody = login.body as unknown as LoginResponse;

    const response = await request(app.getHttpServer())
      .get('/workspace')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      ...registrationBody.workspace,
      role: 'OWNER',
      owner: registrationBody.user,
    });
  });

  it('rejects unauthenticated workspace access', async () => {
    const response = await request(app.getHttpServer())
      .get('/workspace')
      .expect(401);

    expect(response.body).toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
  });

  it('rejects login for an unknown email', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `missing-${randomUUID()}@example.com`,
        password: 'correct horse battery staple',
      })
      .expect(401);

    expect(response.body).toEqual({
      message: 'Invalid credentials',
      error: 'Unauthorized',
      statusCode: 401,
    });
  });

  it('rejects login with the same response for an incorrect password', async () => {
    const email = `owner-${randomUUID()}@example.com`;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct horse battery staple' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'incorrect password' })
      .expect(401);

    expect(response.body).toEqual({
      message: 'Invalid credentials',
      error: 'Unauthorized',
      statusCode: 401,
    });
  });

  it.each([
    {},
    { email: 'owner@example.com' },
    { email: 123, password: 'correct horse battery staple' },
    { email: 'owner@example.com', password: 123 },
    { email: 'owner@example.com', password: '' },
  ])('rejects a malformed login body with a client error', async (body) => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(400);

    expect(response.body).toEqual({
      message: 'Email and password are required',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('rejects duplicate registration without replacing the original workspace', async () => {
    const email = `owner-${randomUUID()}@example.com`;
    const password = 'correct horse battery staple';

    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'different password' })
      .expect(409);

    expect(duplicate.body).toEqual({
      message: 'Email already registered',
      error: 'Conflict',
      statusCode: 409,
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const registrationBody =
      registration.body as unknown as RegistrationResponse;
    const loginBody = login.body as unknown as LoginResponse;
    const workspace = await request(app.getHttpServer())
      .get('/workspace')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);
    const workspaceBody = workspace.body as unknown as PublicWorkspace;

    expect(workspaceBody.id).toBe(registrationBody.workspace.id);
  });

  it('does not expose a user creation path that bypasses workspace registration', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({
        email: `owner-${randomUUID()}@example.com`,
        password: 'correct horse battery staple',
      })
      .expect(404);
  });

  afterAll(async () => {
    await app.close();
  });
});
