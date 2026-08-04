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
};

export interface StripeConnectProvider {
  createAccount(workspaceId: string): Promise<ConnectedAccount>;
  createOnboardingLink(accountId: string): Promise<StripeOnboardingLink>;
  getAccountStatus(accountId: string): Promise<ConnectedAccountStatus>;
}
