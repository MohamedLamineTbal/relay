# Relay frontend

Next.js dashboard for the existing payment-saas NestJS API.

## Local development

1. Keep the NestJS backend running on `http://localhost:3000`.
2. Copy `.env.example` to `.env.local` if the backend uses another URL.
3. Install dependencies with `npm install`.
4. Start the frontend with `npm run dev`.
5. Open `http://localhost:3001`.

`BACKEND_API_URL` is server-only. Browser requests use the same-origin route at
`/api/backend/*`, which forwards only the authorization, content type, and
idempotency headers needed by the existing API.

## API contract

All endpoint calls live in `src/lib/api.ts`; transport and bearer-token handling
live in `src/lib/api-client.ts`. The UI uses client-side search and pagination
for customers and payment requests because those backend list endpoints return
arrays and do not expose pagination query parameters.

For production, set `BACKEND_API_URL` to a publicly reachable HTTPS NestJS API
and `NEXT_PUBLIC_APP_URL` to the deployed frontend origin.
No Stripe secret or webhook signing secret should be placed in a public Next.js
environment variable.
