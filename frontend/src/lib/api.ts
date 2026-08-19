import { apiRequest } from '@/lib/api-client';
import type {
  Alert,
  AlertStatus,
  CheckoutResult,
  Customer,
  CustomerDossier,
  LoginResponse,
  PaymentRequest,
  PaymentEmailDelivery,
  PaymentEmailDeliverySummary,
  PublicPaymentRequest,
  PaymentTimeline,
  RegisterResponse,
  StripeConnectStatus,
  Workspace,
} from '@/lib/types';

export const api = {
  login: (body: { email: string; password: string }) =>
    apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body,
      authenticated: false,
    }),
  register: (body: { email: string; password: string }) =>
    apiRequest<RegisterResponse>('/auth/register', {
      method: 'POST',
      body,
      authenticated: false,
    }),
  workspace: () => apiRequest<Workspace>('/workspace'),
  customers: () => apiRequest<Customer[]>('/customers'),
  customer: (id: number) => apiRequest<Customer>(`/customers/${id}`),
  customerDossier: (id: number) =>
    apiRequest<CustomerDossier>(`/customers/${id}/dossier`),
  createCustomer: (body: { name: string; email?: string }) =>
    apiRequest<Customer>('/customers', { method: 'POST', body }),
  updateCustomerEmail: (id: number, email: string) =>
    apiRequest<Customer>(`/customers/${id}`, {
      method: 'PATCH',
      body: { email },
    }),
  payments: () => apiRequest<PaymentRequest[]>('/payment-requests'),
  payment: (publicId: string) =>
    apiRequest<PaymentRequest>(`/payment-requests/${publicId}`),
  paymentTimeline: (publicId: string) =>
    apiRequest<PaymentTimeline>(`/payment-requests/${publicId}/timeline`),
  publicPayment: (publicId: string) =>
    apiRequest<PublicPaymentRequest>(`/pay/${publicId}`, {
      authenticated: false,
    }),
  checkoutResult: (sessionId: string) =>
    apiRequest<CheckoutResult>(
      `/pay/checkout-result?session_id=${encodeURIComponent(sessionId)}`,
      { authenticated: false },
    ),
  createPayment: (
    body: {
      customerId: number;
      amount: number;
      description: string;
      internalReference?: string;
      sendEmail?: boolean;
      message?: string;
    },
    idempotencyKey: string,
  ) =>
    apiRequest<PaymentRequest>('/payment-requests', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  paymentEmailDeliveries: (publicId: string) =>
    apiRequest<PaymentEmailDelivery[]>(
      `/payment-requests/${publicId}/email-deliveries`,
    ),
  sendPaymentEmail: (
    publicId: string,
    body: { message?: string; recipient?: 'ORIGINAL' | 'CURRENT' },
    idempotencyKey: string,
  ) =>
    apiRequest<PaymentEmailDeliverySummary>(
      `/payment-requests/${publicId}/email-deliveries`,
      {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    ),
  stripeStatus: () => apiRequest<StripeConnectStatus>('/stripe-connect/status'),
  startStripeOnboarding: () =>
    apiRequest<{ url: string }>('/stripe-connect/onboarding', {
      method: 'POST',
    }),
  openStripeDashboard: () =>
    apiRequest<{ url: string }>('/stripe-connect/dashboard', {
      method: 'POST',
    }),
  startStripeReplacement: () =>
    apiRequest<{ url: string }>('/stripe-connect/replacement', {
      method: 'POST',
    }),
  activateStripeReplacement: () =>
    apiRequest<{ activated: true }>('/stripe-connect/replacement/activate', {
      method: 'POST',
    }),
  cancelStripeReplacement: () =>
    apiRequest<{ cancelled: true }>('/stripe-connect/replacement/cancel', {
      method: 'POST',
    }),
  alerts: (status?: AlertStatus) =>
    apiRequest<Alert[]>(`/alerts${status ? `?status=${status}` : ''}`),
  acknowledgeAlert: (alertId: string) =>
    apiRequest<Alert>(`/alerts/${alertId}/acknowledge`, { method: 'POST' }),
};
