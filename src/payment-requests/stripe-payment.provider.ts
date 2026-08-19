import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import {
  type CheckoutSession,
  type CreateCheckoutInput,
  type PaymentProvider,
} from './payment-provider';

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const session = await this.createClient().checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: input.customerEmail ?? undefined,
        metadata: {
          payment_request_public_id: input.paymentRequestPublicId,
        },
        payment_intent_data: {
          metadata: {
            payment_request_public_id: input.paymentRequestPublicId,
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency,
              unit_amount: input.amount,
              product_data: { name: input.description },
            },
          },
        ],
        success_url: this.requireEnvironmentUrl('STRIPE_CHECKOUT_SUCCESS_URL'),
        cancel_url: this.requireEnvironmentUrl('STRIPE_CHECKOUT_CANCEL_URL'),
      },
      {
        stripeAccount: input.connectedAccountId,
        idempotencyKey: input.idempotencyKey,
      },
    );

    if (!session.url) {
      throw new Error('Stripe Checkout session did not include a URL');
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    return {
      id: session.id,
      paymentIntentId,
      url: session.url,
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
