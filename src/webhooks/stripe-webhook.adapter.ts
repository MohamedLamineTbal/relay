import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import {
  InvalidWebhookSignatureError,
  type StripeWebhookProvider,
  type VerifiedPaymentEvent,
} from './stripe-webhook.provider';

@Injectable()
export class StripeWebhookAdapter implements StripeWebhookProvider {
  verifyAndNormalize(payload: Buffer, signature: string): VerifiedPaymentEvent {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secretKey || !webhookSecret) {
      throw new Error('Stripe webhook configuration is required');
    }

    let event: Stripe.Event;

    try {
      event = new Stripe(secretKey).webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch {
      throw new InvalidWebhookSignatureError();
    }

    if (!event.account) {
      throw new Error('Connected Stripe event account is required');
    }

    if (
      event.type !== 'checkout.session.completed' &&
      event.type !== 'checkout.session.expired' &&
      event.type !== 'payment_intent.payment_failed' &&
      event.type !== 'charge.refunded'
    ) {
      return {
        id: event.id,
        connectedAccountId: event.account,
        providerType: event.type,
        type: 'UNSUPPORTED',
        occurredAt: new Date(event.created * 1000),
        providerCheckoutSessionId: null,
        providerPaymentIntentId: null,
        paymentRequestPublicId: null,
      };
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;

      return {
        id: event.id,
        connectedAccountId: event.account,
        providerType: event.type,
        type: 'PAYMENT_FAILED',
        occurredAt: new Date(event.created * 1000),
        providerCheckoutSessionId: null,
        providerPaymentIntentId: paymentIntent.id,
        paymentRequestPublicId:
          paymentIntent.metadata?.payment_request_public_id ?? null,
      };
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object;

      return {
        id: event.id,
        connectedAccountId: event.account,
        providerType: event.type,
        type: charge.refunded ? 'PAYMENT_REFUNDED' : 'UNSUPPORTED',
        occurredAt: new Date(event.created * 1000),
        providerCheckoutSessionId: null,
        providerPaymentIntentId:
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? null),
        paymentRequestPublicId:
          charge.metadata?.payment_request_public_id ?? null,
      };
    }

    const session = event.data.object;

    return {
      id: event.id,
      connectedAccountId: event.account,
      providerType: event.type,
      type:
        event.type === 'checkout.session.completed'
          ? 'CHECKOUT_COMPLETED'
          : 'CHECKOUT_EXPIRED',
      occurredAt: new Date(event.created * 1000),
      providerCheckoutSessionId: session.id,
      providerPaymentIntentId:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
      paymentRequestPublicId:
        session.metadata?.payment_request_public_id ?? null,
    };
  }
}
