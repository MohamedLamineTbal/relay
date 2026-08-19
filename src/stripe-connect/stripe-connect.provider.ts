export const STRIPE_CONNECT_PROVIDER = Symbol('STRIPE_CONNECT_PROVIDER');

export type ConnectedAccount = {
  id: string;
};

export type StripeOnboardingLink = {
  url: string;
};

export type ConnectedAccountStatus = {
  onboardingComplete: boolean;
  paymentsReady: boolean;
  payoutsReady?: boolean;
  displayName?: string | null;
  country?: string | null;
  defaultCurrency?: string | null;
  accountType?: string | null;
};

export type StripeOnboardingFlow = 'initial' | 'replacement';

export class ConnectedAccountUnavailableError extends Error {
  constructor() {
    super('Connected Stripe account is unavailable');
    this.name = 'ConnectedAccountUnavailableError';
  }
}

export function isConnectedAccountUnavailableError(error: unknown) {
  if (error instanceof ConnectedAccountUnavailableError) return true;
  if (typeof error !== 'object' || error === null) return false;

  const providerError = error as {
    code?: unknown;
    message?: unknown;
    statusCode?: unknown;
    type?: unknown;
  };
  const message =
    typeof providerError.message === 'string' ? providerError.message : '';

  return (
    providerError.code === 'account_invalid' ||
    providerError.code === 'account_closed' ||
    providerError.code === 'resource_missing' ||
    (providerError.statusCode === 403 &&
      providerError.type === 'StripePermissionError' &&
      message.includes('does not have access to account')) ||
    (providerError.statusCode === 404 &&
      providerError.type === 'StripeInvalidRequestError')
  );
}

export interface StripeConnectProvider {
  createAccount(
    workspaceId: string,
    options?: { idempotencyKey?: string; country?: string },
  ): Promise<ConnectedAccount>;
  createOnboardingLink(
    accountId: string,
    flow?: StripeOnboardingFlow,
  ): Promise<StripeOnboardingLink>;
  getAccountStatus(accountId: string): Promise<ConnectedAccountStatus>;
  createLoginLink?(accountId: string): Promise<StripeOnboardingLink>;
}
