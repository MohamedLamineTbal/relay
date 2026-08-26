# Relay

What does Relay do?

Relay is a full-stack payment SaaS application that helps businesses create, send, track, and manage one-time payment requests from customers.

A business owner creates a Relay account and gets an isolated workspace. From that workspace, they can connect their own Stripe account, add customers, create payment requests, and monitor what happens after a payment link is sent.

A typical payment looks like this:

1. The business owner creates a **customer** in Relay.
2. They create a **payment request** with an amount, currency, and description.
3. Relay creates a Stripe Checkout session through the business's connected Stripe account.
4. Relay returns a payment link that can be copied or sent to the customer by email.
5. The customer opens the link and completes the payment on Stripe Checkout.
6. Stripe sends a webhook event back to Relay.
7. Relay verifies the event and updates the payment automatically.
8. The business owner can see the latest status and full payment timeline from the dashboard.

A payment can move through states such as:

```text
PENDING → PAID → REFUNDED

PENDING → FAILED

PENDING → EXPIRED
```

Relay does more than simply create Stripe Checkout links. It also handles the operational side of payments.

If a payment fails, Relay can create an alert for the business owner. If the business has its own application, Relay can send signed webhook notifications to that application when a payment changes state.

Failed outbound webhook deliveries are recorded and can be replayed later from the dashboard.

Payment links can also be sent directly to customers by email using Resend, with delivery attempts and failures tracked by Relay.



## Main features

* **Workspace authentication**
  Each business has its own isolated workspace and data.

* **Customer management**
  Create and manage customers before requesting payment.

* **Stripe Connect**
  Connect a business Stripe account to Relay.

* **Payment requests**
  Generate one-time Stripe Checkout payment links.

* **Email delivery**
  Send payment links directly to customers.

* **Payment tracking**
  Track `PENDING`, `PAID`, `FAILED`, `EXPIRED`, and `REFUNDED` payments.

* **Payment timeline**
  View the Stripe events that caused each payment status change.

* **Operational alerts**
  Surface failed payments and webhook deliveries.

* **Outbound webhooks**
  Notify another application when a payment changes state.

* **Webhook replay**
  Retry failed webhook deliveries without changing the original payment event.

* **Idempotency and event deduplication**
  Protect against duplicate payment creation and repeated Stripe events.





The **Next.js frontend** provides the dashboard and public payment pages.

The **NestJS backend** contains the business logic for authentication, customers, payments, Stripe Connect, emails, alerts, and webhooks.

**PostgreSQL** stores workspace, customer, payment, event, alert, and delivery data, while **Prisma** provides database access.

**Stripe** handles account connection and card payments, while **Resend** is used to send payment links by email.



## Tech stack

### Backend

* NestJS
* TypeScript
* Prisma
* PostgreSQL

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS

### Integrations

* Stripe Connect
* Stripe Checkout
* Stripe Webhooks
* Resend 

### Testing & documentation

* Jest
* Supertest
* Swagger / OpenAPI



# Running Relay locally

## Requirements

Install:

* Node.js
* PostgreSQL
* Stripe CLI

You also need:

* a Stripe test account
* a Resend account if you want to test email delivery


## 1. Install the backend

```bash
git clone <repository-url>
cd relay
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Configure at least:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/payment_saas"

PORT=3000
FRONTEND_APP_URL="http://localhost:3001"

STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

STRIPE_CONNECT_RETURN_URL="http://localhost:3001/stripe"
STRIPE_CONNECT_REFRESH_URL="http://localhost:3001/stripe"

STRIPE_CHECKOUT_SUCCESS_URL="http://localhost:3001/payments/success?session_id={CHECKOUT_SESSION_ID}"
STRIPE_CHECKOUT_CANCEL_URL="http://localhost:3001/payments/cancel"
```

Email delivery is optional:

```env
RESEND_API_KEY="re_..."
EMAIL_FROM="Relay <onboarding@resend.dev>"
```



## 2. Prepare the database

Create a PostgreSQL database called:

```text
payment_saas
```

Then run:

```bash
npx prisma generate
npx prisma migrate deploy
```



## 3. Start the backend

```bash
npm run start:dev
```

The API will run on:

```text
http://localhost:3000
```

Swagger documentation is available at:

```text
http://localhost:3000/api
```


## 4. Start Stripe webhooks

Open another terminal:

```bash
npm run stripe:listen
```

Stripe CLI will print a webhook signing secret:

```text
whsec_...
```

Copy it into your `.env` file:

```env
STRIPE_WEBHOOK_SECRET="whsec_..."
```

Restart the backend after changing the value.

Keep the Stripe listener running while testing payments locally. Stripe cannot send webhook events directly to localhost, so the listener forwards them to the Relay backend.


## 5. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The frontend runs on:

```text
http://localhost:3001
```


## Try the complete flow

Once PostgreSQL, the backend, the frontend, and the Stripe listener are running:

1. Create a Relay account.
2. Connect a Stripe test account.
3. Add a customer.
4. Create a payment request.
5. Open the generated payment link.
6. Complete the payment using Stripe test mode.
7. Return to Relay.
8. Check the updated payment status and event timeline.



## Testing

Run backend tests:

```bash
npm test
```

Run end-to-end tests:

```bash
npm run test:e2e
```

Run test coverage:

```bash
npm run test:cov
```


## API documentation

When the backend is running, detailed API documentation is available through Swagger:

```text
http://localhost:3000/api
```

Swagger contains the individual endpoints, request bodies, responses, and authentication requirements, while this README focuses on explaining the application and how to run it locally.
