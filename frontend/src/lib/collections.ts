import type {
  Alert,
  PaymentEmailDeliverySummary,
  PaymentRequest,
} from './types';

export type CollectionOperationalGroup = 'NEEDS_YOU' | 'WAITING' | 'RESOLVED';

export type CollectionAction =
  | 'ADD_EMAIL'
  | 'COPY_LINK'
  | 'OPEN_COLLECTION'
  | 'REVIEW_AND_RESEND'
  | 'SEND_EMAIL';

export type CollectionPresentation = {
  group: CollectionOperationalGroup;
  statusLabel: string;
  statusDetail: string;
  primaryAction: CollectionAction | null;
  latestEmailLabel: string | null;
};

type PresentablePayment = Pick<
  PaymentRequest,
  'publicId' | 'status' | 'checkoutUrl' | 'sendEmailRequested' | 'customer'
> & {
  latestEmailDelivery?: PaymentEmailDeliverySummary | null;
};

function hasActivePaymentAlert(publicId: string, alerts: readonly Alert[]) {
  return alerts.some(
    (alert) =>
      alert.type === 'PAYMENT_PROCESSING_FAILED' &&
      alert.status === 'ACTIVE' &&
      alert.payment?.publicId === publicId,
  );
}

export function presentCollection(
  payment: PresentablePayment,
  alerts: readonly Alert[] = [],
): CollectionPresentation {
  const delivery = payment.latestEmailDelivery;
  const activeAlert = hasActivePaymentAlert(payment.publicId, alerts);

  if (payment.status === 'PAID') {
    return {
      group: 'RESOLVED',
      statusLabel: 'Paid',
      statusDetail: 'The customer completed this payment.',
      primaryAction: null,
      latestEmailLabel: emailLabel(delivery),
    };
  }

  if (payment.status === 'REFUNDED') {
    return {
      group: 'RESOLVED',
      statusLabel: 'Refunded',
      statusDetail: 'The completed payment was refunded.',
      primaryAction: null,
      latestEmailLabel: emailLabel(delivery),
    };
  }

  if (payment.status === 'EXPIRED') {
    return {
      group: 'RESOLVED',
      statusLabel: 'Link expired',
      statusDetail: 'This checkout can no longer be completed.',
      primaryAction: null,
      latestEmailLabel: emailLabel(delivery),
    };
  }

  if (payment.status === 'FAILED' || activeAlert) {
    return {
      group: 'NEEDS_YOU',
      statusLabel:
        payment.status === 'FAILED'
          ? 'Payment failed'
          : 'Payment needs attention',
      statusDetail:
        payment.status === 'FAILED'
          ? 'Review what happened before following up with the customer.'
          : 'Relay could not confirm this payment. Open the payment request to review it.',
      primaryAction: 'OPEN_COLLECTION',
      latestEmailLabel: emailLabel(delivery),
    };
  }

  if (delivery?.status === 'FAILED') {
    return {
      group: 'NEEDS_YOU',
      statusLabel: 'Email send failed',
      statusDetail: 'The checkout link exists, but the email was not accepted.',
      primaryAction: 'REVIEW_AND_RESEND',
      latestEmailLabel: emailLabel(delivery),
    };
  }

  if (delivery?.status === 'PENDING') {
    return {
      group: 'WAITING',
      statusLabel: 'Email queued',
      statusDetail: 'Relay is attempting to send the payment link.',
      primaryAction: payment.checkoutUrl ? 'COPY_LINK' : null,
      latestEmailLabel: emailLabel(delivery),
    };
  }

  if (delivery?.status === 'SENT') {
    return {
      group: 'WAITING',
      statusLabel: 'Waiting for payment',
      statusDetail: 'The email provider accepted the payment email.',
      primaryAction: payment.checkoutUrl ? 'COPY_LINK' : null,
      latestEmailLabel: emailLabel(delivery),
    };
  }

  if (!payment.customer.email) {
    return {
      group: 'NEEDS_YOU',
      statusLabel: 'Link ready · no email',
      statusDetail: 'Add an email to send this link, or share it manually.',
      primaryAction: 'ADD_EMAIL',
      latestEmailLabel: null,
    };
  }

  return {
    group: 'WAITING',
    statusLabel: 'Link ready',
    statusDetail: payment.sendEmailRequested
      ? 'The payment link is ready to share.'
      : 'Delivery is unverified until the customer opens the link.',
    primaryAction: payment.sendEmailRequested ? 'SEND_EMAIL' : 'COPY_LINK',
    latestEmailLabel: null,
  };
}

export function emailLabel(
  delivery: PaymentEmailDeliverySummary | null | undefined,
) {
  if (!delivery) return null;
  if (delivery.status === 'PENDING') return 'Email queued';
  if (delivery.status === 'FAILED') return 'Email failed';
  return 'Email accepted';
}

export function collectionActionLabel(action: CollectionAction | null) {
  switch (action) {
    case 'ADD_EMAIL':
      return 'Add email';
    case 'COPY_LINK':
      return 'Copy link';
    case 'OPEN_COLLECTION':
      return 'Review collection';
    case 'REVIEW_AND_RESEND':
      return 'Review and resend';
    case 'SEND_EMAIL':
      return 'Send email';
    default:
      return null;
  }
}

export function collectionJournalPhrase(
  payment: Pick<PaymentRequest, 'status'>,
  presentation: CollectionPresentation,
) {
  if (payment.status === 'PAID') return 'was paid.';
  if (payment.status === 'REFUNDED') return 'was refunded.';
  if (payment.status === 'EXPIRED') return 'expired before payment.';
  if (payment.status === 'FAILED') return 'could not be completed.';

  if (presentation.statusLabel === 'Email send failed') {
    return 'could not be emailed.';
  }
  if (presentation.statusLabel === 'Link ready · no email') {
    return 'is ready, but still needs a delivery choice.';
  }
  if (presentation.statusLabel === 'Email queued') {
    return 'is being sent.';
  }
  if (presentation.statusLabel === 'Waiting for payment') {
    return 'is waiting for payment.';
  }
  if (presentation.statusLabel === 'Link ready') {
    return 'is ready to share.';
  }

  return 'needs your attention.';
}

export function sortCollectionsByNewest<T extends { createdAt: string }>(
  collections: readonly T[],
) {
  return [...collections].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}
