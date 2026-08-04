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

## Workspace-scoped customer API

All customer operations require a bearer token. Ownership always comes from
the authenticated workspace; clients must not send `userId` or `workspaceId`.
Requests containing either ownership field return `400 Bad Request`.

Create a customer with `POST /customers`:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com"
}
```

Use `GET /customers` to list the authenticated workspace's customers and
`GET /customers/:id` to retrieve one. A missing customer and a customer owned
by another workspace both return the same `404 Not Found` response.

## Workspace-scoped payment-request API

Create a payment request with `POST /payment-requests` and an authenticated
workspace customer:

```json
{
  "description": "Engineering services",
  "amount": 12500,
  "customerId": 42
}
```

Use `GET /payment-requests` to list the authenticated workspace's payment
requests and `GET /payment-requests/:publicId` to retrieve one. Referencing a
missing or cross-workspace customer during creation returns the same `404 Not
Found` response. Missing and cross-workspace payment requests are likewise
indistinguishable.

The unauthenticated buyer route `GET /pay/:publicId` returns only:

```json
{
  "publicId": "public-payment-id",
  "description": "Engineering services",
  "amount": 12500,
  "status": "PENDING"
}
```

It does not expose customer identity, internal database identifiers, workspace
ownership, or timestamps.

## Tests

```bash
npm test
npm run test:e2e
npm run test:cov
```

The authentication and workspace-isolation end-to-end suites run through the
public HTTP API against a dedicated PostgreSQL database named
`payment_saas_test`. They derive the server connection from `DATABASE_URL`;
create that database and apply the project migrations before running the suite.
