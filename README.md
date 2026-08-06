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

## One-time Checkout payment API

Create a Stripe-hosted, one-time card payment with `POST /payment-requests`.
The workspace must have a connected Stripe account whose onboarding is complete
and card-payment capability is ready. Send a caller-generated retry key:

```text
Authorization: Bearer <accessToken>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

The request identifies an authenticated-workspace customer and expresses
`amount` as a positive whole number in the currency's smallest unit, up to the
platform limit of `99,999,999` minor units:

```json
{
  "description": "Engineering services",
  "amount": 12500,
  "currency": "usd",
  "customerId": 42
}
```

A successful `201 Created` response includes the stable public identifier,
Stripe-hosted redirect URL, and provider identifiers used for correlation:

```json
{
  "publicId": "stable-public-payment-id",
  "description": "Engineering services",
  "amount": 12500,
  "currency": "usd",
  "status": "PENDING",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/...",
  "providerCheckoutSessionId": "cs_test_...",
  "providerPaymentIntentId": null,
  "createdAt": "2026-08-04T18:00:00.000Z",
  "customer": {
    "id": 42,
    "name": "Ada Lovelace",
    "email": "ada@example.com"
  }
}
```

`providerPaymentIntentId` can remain `null` until Stripe associates a Payment
Intent with the Checkout Session. Every new payment begins in `PENDING`; later
verified provider events advance the lifecycle.

Repeating the request with the same `Idempotency-Key` in the same workspace
returns the original payment and does not create another Checkout Session. Keys
are isolated by workspace, so another workspace can safely use the same value.

Use `GET /payment-requests` to list the authenticated workspace's payments and
`GET /payment-requests/:publicId` to retrieve one. Referencing a missing or
cross-workspace customer during creation returns the same `404 Not Found`
response. Missing and cross-workspace payment requests are likewise
indistinguishable. An unconnected workspace returns `400 Bad Request`; a
connected account that is not payment-ready returns `409 Conflict`; and a
Checkout provider failure returns `502 Bad Gateway`. None of these failures
persists a partial payment request.

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

## Stripe payment webhooks

Configure the Stripe Connect event destination to send events to:

```text
POST /stripe/webhooks
Stripe-Signature: <Stripe-generated signature>
```

This endpoint is intentionally unauthenticated because Stripe is the caller.
The application verifies `Stripe-Signature` against the unmodified raw request
body and `STRIPE_WEBHOOK_SECRET` before trusting or recording an event. A
missing or invalid signature returns `400 Bad Request` without changing payment
state or persisting a trusted event.

Verified events are associated with a workspace by their connected Stripe
account and with a payment by its Checkout Session ID, Payment Intent ID, or
stable payment reference stored in Stripe metadata. Provider identifiers never
match a payment in a different workspace.

The supported lifecycle mapping is:

| Stripe event                                  | Local result |
| --------------------------------------------- | ------------ |
| `checkout.session.completed`                  | `PAID`       |
| `checkout.session.expired`                    | `EXPIRED`    |
| `payment_intent.payment_failed`               | `FAILED`     |
| `charge.refunded` for a fully refunded charge | `REFUNDED`   |

Partial `charge.refunded` events and all other verified event types are
recorded safely without changing payment state. Every provider event ID is
recorded at most once. Repeated or simultaneous delivery receives a successful
duplicate acknowledgment without repeating lifecycle effects.

Events are ordered by their Stripe occurrence time, not delivery time. Older
events remain available for auditability but cannot overwrite a newer result.
`PAID` can only advance to `REFUNDED`; `EXPIRED` and `REFUNDED` do not regress.
A failed attempt can advance to `PAID` when a later Checkout completion occurs.

A handled event returns `200 OK`:

```json
{
  "received": true,
  "duplicate": false,
  "handled": true
}
```

For an unsupported or unmatched verified event, `handled` is `false`. On a
retry of an already-recorded event, `duplicate` is `true`.

## Stripe Connect API

Configure the platform's Stripe credentials and authenticated return locations
through environment variables:

```text
STRIPE_SECRET_KEY=sk_test_platform_key
STRIPE_CONNECT_REFRESH_URL=https://app.example.com/stripe/refresh
STRIPE_CONNECT_RETURN_URL=https://app.example.com/stripe/return
STRIPE_CHECKOUT_SUCCESS_URL=https://app.example.com/payments/success?session_id={CHECKOUT_SESSION_ID}
STRIPE_CHECKOUT_CANCEL_URL=https://app.example.com/payments/cancel
STRIPE_WEBHOOK_SECRET=whsec_platform_endpoint_secret
```

These values are platform configuration. Clients must never send Stripe API
keys or connected-account identifiers to the API, and the application stores
only the connected-account identifier on the workspace.

### Start or resume onboarding

Send an authenticated request with no body:

```text
POST /stripe-connect/onboarding
Authorization: Bearer <accessToken>
```

The response contains a single-use Stripe-hosted onboarding URL:

```json
{
  "url": "https://connect.stripe.com/setup/..."
}
```

Repeated requests reuse the workspace's connected Stripe account and create a
fresh onboarding URL. A connected account cannot belong to two workspaces.

### Inspect connection readiness

`GET /stripe-connect/status` requires the bearer token and returns:

```json
{
  "connected": true,
  "onboardingComplete": true,
  "paymentsReady": true
}
```

`connected` means the workspace has a Stripe connected-account identifier.
`onboardingComplete` reflects Stripe's submitted-account-details status.
`paymentsReady` requires both charges to be enabled and the card-payments
capability to be active. A workspace without a connected account returns all
three values as `false`.

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
