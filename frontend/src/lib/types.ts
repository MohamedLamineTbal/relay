export type User = { id: number; email: string; createdAt: string };

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  role: 'OWNER';
  owner: User;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

export type RegisterResponse = {
  user: User;
  workspace: Omit<Workspace, 'role' | 'owner'>;
  role: 'OWNER';
};

export type Customer = {
  id: number;
  name: string;
  email: string | null;
  createdAt: string;
};

export type CustomerDossier = {
  customer: Customer;
  collections: PaymentRequest[];
};

export type PaymentStatus =
  'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';

export type PaymentRequest = {
  publicId: string;
  description: string;
  internalReference: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl: string | null;
  providerCheckoutSessionId: string | null;
  providerPaymentIntentId: string | null;
  sendEmailRequested: boolean;
  createdAt: string;
  customer: Pick<Customer, 'id' | 'name' | 'email'>;
  latestEmailDelivery?: PaymentEmailDeliverySummary | null;
};

export type PaymentEmailStatus = 'PENDING' | 'SENT' | 'FAILED';
export type PaymentEmailAttemptOutcome =
  'SENT' | 'TRANSIENT_FAILURE' | 'PERMANENT_FAILURE';

export type PaymentEmailAttempt = {
  id: string;
  attemptNumber: number;
  attemptedAt: string;
  outcome: PaymentEmailAttemptOutcome;
  providerMessageId: string | null;
  failureCode: string | null;
  failureSummary: string | null;
};

export type PaymentEmailDeliverySummary = {
  id: string;
  status: PaymentEmailStatus;
  recipientEmail: string;
  providerMessageId: string | null;
  failureSummary: string | null;
  createdAt: string;
  attemptedAt: string | null;
  sentAt: string | null;
};

export type PaymentEmailDelivery = PaymentEmailDeliverySummary & {
  ownerMessage: string | null;
  requestedBy: { id: number; email: string };
  attempts: PaymentEmailAttempt[];
};

export type PublicPaymentRequest = Pick<
  PaymentRequest,
  'publicId' | 'description' | 'amount' | 'currency' | 'status'
> & {
  businessName: string;
};

export type CheckoutResult = Pick<
  PaymentRequest,
  'description' | 'amount' | 'currency' | 'status'
> & {
  businessName: string;
};

export type PaymentTimeline = {
  publicId: string;
  currentStatus: PaymentStatus;
  events: Array<{
    type: string;
    resultingStatus: PaymentStatus | null;
    occurredAt: string;
    providerReferences: {
      eventId: string;
      eventType: string;
      checkoutSessionId: string | null;
      paymentIntentId: string | null;
    };
  }>;
};

export type StripeAccountSummary = {
  displayName: string;
  maskedId: string;
  country: string | null;
  defaultCurrency: string | null;
  accountType: string;
  onboardingComplete: boolean;
  paymentsReady: boolean;
  payoutsReady: boolean;
};

export type StripeConnectStatus = {
  connected: boolean;
  onboardingComplete: boolean;
  paymentsReady: boolean;
  account: StripeAccountSummary | null;
  replacement: StripeAccountSummary | null;
  connectionIssue: 'ACCOUNT_UNAVAILABLE' | null;
  checkedAt: string;
};

export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED';
export type AlertType = 'PAYMENT_PROCESSING_FAILED' | 'WEBHOOK_DELIVERY_FAILED';

export type Alert = {
  id: string;
  type: AlertType;
  status: AlertStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { email: string } | null;
  payment?: { publicId: string };
  delivery?: { id: string; attemptNumber: number };
};
