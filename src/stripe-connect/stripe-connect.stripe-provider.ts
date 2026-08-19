import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  ConnectedAccountUnavailableError,
  type ConnectedAccount,
  type ConnectedAccountStatus,
  type StripeConnectProvider,
  type StripeOnboardingFlow,
  type StripeOnboardingLink,
  isConnectedAccountUnavailableError,
} from './stripe-connect.provider';

@Injectable()
export class StripeConnectStripeProvider implements StripeConnectProvider {
  private readonly stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
    );
  }

  async createAccount(
    workspaceId: string,
    options?: { idempotencyKey?: string; country?: string },
  ): Promise<ConnectedAccount> {
    const account = await this.stripe.accounts.create(
      {
        type: 'express',
        country:
          options?.country ??
          this.config.get<string>('STRIPE_CONNECT_DEFAULT_COUNTRY') ??
          'US',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          workspaceId,
        },
      },
      {
        idempotencyKey:
          options?.idempotencyKey ??
          `stripe-connect-account-v3:${workspaceId}:after:initial`,
      },
    );

    return {
      id: account.id,
    };
  }

  async createOnboardingLink(
    accountId: string,
    flow: StripeOnboardingFlow = 'initial',
  ): Promise<StripeOnboardingLink> {
    const refreshUrl = this.onboardingCallbackUrl(
      'STRIPE_CONNECT_REFRESH_URL',
      flow,
    );
    const returnUrl = this.onboardingCallbackUrl(
      'STRIPE_CONNECT_RETURN_URL',
      flow,
    );
    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return { url: accountLink.url };
  }

  async createLoginLink(accountId: string): Promise<StripeOnboardingLink> {
    const loginLink = await this.stripe.accounts.createLoginLink(accountId);
    return { url: loginLink.url };
  }

  async getAccountStatus(accountId: string): Promise<ConnectedAccountStatus> {
    let account: Stripe.Account;
    try {
      account = await this.stripe.accounts.retrieve(accountId);
    } catch (error: unknown) {
      if (isConnectedAccountUnavailableError(error)) {
        throw new ConnectedAccountUnavailableError();
      }
      throw error;
    }

    return {
      onboardingComplete: account.details_submitted,
      paymentsReady:
        account.charges_enabled &&
        account.capabilities?.card_payments === 'active',
      payoutsReady: account.payouts_enabled,
      displayName:
        account.business_profile?.name ??
        account.settings?.dashboard?.display_name ??
        null,
      country: account.country ?? null,
      defaultCurrency: account.default_currency ?? null,
      accountType: account.type,
    };
  }

  private onboardingCallbackUrl(
    name: 'STRIPE_CONNECT_REFRESH_URL' | 'STRIPE_CONNECT_RETURN_URL',
    flow: StripeOnboardingFlow,
  ) {
    const url = new URL(this.requireEnvironmentUrl(name));
    if (flow === 'replacement') url.searchParams.set('flow', flow);
    return url.toString();
  }

  private requireEnvironmentUrl(name: string) {
    return this.config.getOrThrow<string>(name);
  }
}
