import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import {
  type ConnectedAccount,
  type ConnectedAccountStatus,
  type StripeConnectProvider,
  type StripeOnboardingLink,
} from './stripe-connect.provider';

@Injectable()
export class StripeConnectStripeProvider implements StripeConnectProvider {
  async createAccount(workspaceId: string): Promise<ConnectedAccount> {
    const account = await this.createClient().accounts.create(
      {
        country: 'US',
        controller: {
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
          requirement_collection: 'stripe',
          stripe_dashboard: { type: 'full' },
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { workspaceId },
      },
      { idempotencyKey: `stripe-connect-account:${workspaceId}` },
    );

    return { id: account.id };
  }

  async createOnboardingLink(accountId: string): Promise<StripeOnboardingLink> {
    const refreshUrl = this.requireEnvironmentUrl('STRIPE_CONNECT_REFRESH_URL');
    const returnUrl = this.requireEnvironmentUrl('STRIPE_CONNECT_RETURN_URL');
    const accountLink = await this.createClient().accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return { url: accountLink.url };
  }

  async getAccountStatus(accountId: string): Promise<ConnectedAccountStatus> {
    const account = await this.createClient().accounts.retrieve(accountId);

    return {
      onboardingComplete: account.details_submitted,
      paymentsReady:
        account.charges_enabled &&
        account.capabilities?.card_payments === 'active',
    };
  }

  private createClient() {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    return new Stripe(secretKey);
  }

  private requireEnvironmentUrl(name: string) {
    const value = process.env[name];

    if (!value) {
      throw new Error(`${name} is required`);
    }

    return value;
  }
}
