# Payment SaaS

A developer-first payment management and observability API built with NestJS,
Prisma, and PostgreSQL.

## Setup

Install dependencies, configure `DATABASE_URL` in `.env`, apply migrations, and
start the API:

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```

## Authentication API

### Register a workspace owner

`POST /auth/register`

```json
{
  "email": "owner@example.com",
  "password": "correct horse battery staple"
}
```

A successful request returns `201 Created` with the new user, their workspace,
and the `OWNER` role. Registration creates all three records atomically and
never returns the password or password hash.

Registering an existing email returns `409 Conflict` with the message
`Email already registered`.

### Log in

`POST /auth/login`

```json
{
  "email": "owner@example.com",
  "password": "correct horse battery staple"
}
```

A successful request returns `200 OK`:

```json
{
  "accessToken": "opaque-session-token",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

Unknown emails and incorrect passwords both return `401 Unauthorized` with the
message `Invalid credentials`.

### Retrieve the authenticated workspace

`GET /workspace`

Send the login credential in the `Authorization` header:

```text
Authorization: Bearer <accessToken>
```

A valid session returns the workspace, the `OWNER` role, and the public owner
fields. Missing, malformed, unknown, or expired credentials return
`401 Unauthorized`.

## Tests

```bash
npm test
npm run test:e2e
npm run test:cov
```

The authentication end-to-end suite runs through the public HTTP API against a
dedicated PostgreSQL database named `payment_saas_test`. It derives the server
connection from `DATABASE_URL`; create that database and apply the project
migrations before running the suite.
