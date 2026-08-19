import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  STRIPE_CONNECT_PROVIDER,
  type ConnectedAccountStatus,
  type StripeConnectProvider,
  isConnectedAccountUnavailableError,
} from '../stripe-connect/stripe-connect.provider';
import {
  PAYMENT_PROVIDER,
  type CheckoutSession,
  type PaymentProvider,
} from './payment-provider';
import { PaymentEmailsService } from '../payment-emails/payment-emails.service';

type CreateCheckoutRequest = {
  description: string;
  internalReference: string | null;
  amount: number;
  currency: string;
  customerId: number;
  workspaceId: string;
  idempotencyKey: string;
  sendEmail: boolean;
  message: string | null;
  requestedByUserId: number;
  requestedByEmail: string;
};

type IdempotentPaymentDetails = {
  description: string;
  internalReference: string | null;
  amount: number;
  currency: string;
  customer: { id: number };
  sendEmailRequested: boolean;
  emailMessage: string | null;
  emailDeliveries: Array<unknown>;
};

const paymentRequestSelect = {
  publicId: true,
  description: true,
  internalReference: true,
  amount: true,
  currency: true,
  status: true,
  checkoutUrl: true,
  providerCheckoutSessionId: true,
  providerPaymentIntentId: true,
  sendEmailRequested: true,
  createdAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

const paymentRequestDetailSelect = {
  ...paymentRequestSelect,
  emailDeliveries: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      status: true,
      recipientEmail: true,
      providerMessageId: true,
      createdAt: true,
      attemptedAt: true,
      sentAt: true,
      failureSummary: true,
    },
  },
} as const;

const idempotentPaymentSelect = {
  ...paymentRequestDetailSelect,
  emailMessage: true,
} as const;

@Injectable()
export class PaymentRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CONNECT_PROVIDER)
    private readonly stripeConnectProvider: StripeConnectProvider,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly paymentEmails: PaymentEmailsService,
  ) {}

  async createCheckout(request: CreateCheckoutRequest) {
    const existingPayment = await this.findIdempotentPayment(request);

    if (existingPayment) {
      return this.ensureIdempotentPaymentMatches(existingPayment, request);
    }

    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: request.workspaceId },
      select: { stripeAccountId: true },
    });

    if (!workspace.stripeAccountId) {
      throw new BadRequestException('Workspace is not connected to Stripe');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: request.customerId, workspaceId: request.workspaceId },
      select: { id: true, name: true, email: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const recipientEmail = request.sendEmail
      ? this.paymentEmails.assertCanSendTo(customer.email)
      : null;

    let connectionStatus: ConnectedAccountStatus;
    try {
      connectionStatus = await this.stripeConnectProvider.getAccountStatus(
        workspace.stripeAccountId,
      );
    } catch (error: unknown) {
      if (!isConnectedAccountUnavailableError(error)) throw error;
      throw new ConflictException(
        'Stripe connection ended. Connect another account.',
      );
    }

    if (
      !connectionStatus.onboardingComplete ||
      !connectionStatus.paymentsReady
    ) {
      throw new ConflictException('Stripe account is not ready for payments');
    }

    let stripeConnection = await this.prisma.stripeConnection.findUnique({
      where: { providerAccountId: workspace.stripeAccountId },
      select: { id: true, workspaceId: true },
    });

    if (!stripeConnection) {
      stripeConnection = await this.prisma.stripeConnection.create({
        data: {
          providerAccountId: workspace.stripeAccountId,
          state: 'ACTIVE',
          activatedAt: new Date(),
          workspace: { connect: { id: request.workspaceId } },
        },
        select: { id: true, workspaceId: true },
      });
    }

    if (stripeConnection.workspaceId !== request.workspaceId) {
      throw new ConflictException(
        'Stripe account is connected to another workspace',
      );
    }

    const paymentRequestPublicId = `pay_${createHash('sha256')
      .update(`${request.workspaceId}\0${request.idempotencyKey}`)
      .digest('hex')}`;

    let checkout: CheckoutSession;

    try {
      checkout = await this.paymentProvider.createCheckout({
        connectedAccountId: workspace.stripeAccountId,
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        customerEmail: customer.email,
        idempotencyKey: `${request.workspaceId}:${request.idempotencyKey}`,
        paymentRequestPublicId,
      });
    } catch (error: unknown) {
      console.error('STRIPE CHECKOUT ERROR:', {
        message: error instanceof Error ? error.message : error,
        code:
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined,
        type:
          typeof error === 'object' && error !== null && 'type' in error
            ? error.type
            : undefined,
        param:
          typeof error === 'object' && error !== null && 'param' in error
            ? error.param
            : undefined,
      });

      throw new BadGatewayException(
        'Payment provider could not create checkout',
      );
    }

    try {
      const payment = await this.prisma.paymentRequest.create({
        data: {
          description: request.description,
          internalReference: request.internalReference,
          amount: request.amount,
          currency: request.currency,
          checkoutUrl: checkout.url,
          providerCheckoutSessionId: checkout.id,
          providerPaymentIntentId: checkout.paymentIntentId,
          idempotencyKey: request.idempotencyKey,
          sendEmailRequested: request.sendEmail,
          emailMessage: request.message,
          publicId: paymentRequestPublicId,
          customer: { connect: { id: customer.id } },
          workspace: { connect: { id: request.workspaceId } },
          stripeConnection: { connect: { id: stripeConnection.id } },
          emailDeliveries: request.sendEmail
            ? {
                create: {
                  recipientEmail: recipientEmail!,
                  ownerMessage: request.message,
                  idempotencyKey: this.paymentEmails.makeProviderIdempotencyKey(
                    request.workspaceId,
                    paymentRequestPublicId,
                    'initial',
                  ),
                  requestedByUserId: request.requestedByUserId,
                  requestedByEmail: request.requestedByEmail,
                  createdAt: this.paymentEmails.scheduledAt(),
                  nextAttemptAt: this.paymentEmails.scheduledAt(),
                  workspace: { connect: { id: request.workspaceId } },
                },
              }
            : undefined,
        },
        select: idempotentPaymentSelect,
      });

      if (request.sendEmail) this.paymentEmails.schedulePendingDelivery();
      return this.toCreateResponse(payment);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const winningPayment = await this.findIdempotentPayment(request);

        if (winningPayment) {
          return this.ensureIdempotentPaymentMatches(winningPayment, request);
        }
      }

      throw error;
    }
  }

  async findMany(workspaceId: string) {
    const paymentRequests = await this.prisma.paymentRequest.findMany({
      where: { workspaceId },
      orderBy: { id: 'asc' },
      select: paymentRequestDetailSelect,
    });

    return paymentRequests.map((paymentRequest) => {
      const { emailDeliveries, ...paymentDetails } = paymentRequest;
      return paymentRequest.sendEmailRequested
        ? {
            ...paymentDetails,
            latestEmailDelivery: emailDeliveries[0] ?? null,
          }
        : paymentDetails;
    });
  }

  async findOne(publicId: string, workspaceId: string) {
    const paymentRequest = await this.prisma.paymentRequest.findFirst({
      where: {
        publicId,
        workspaceId,
      },
      select: paymentRequestDetailSelect,
    });

    if (!paymentRequest) {
      throw new NotFoundException('Payment request not found');
    }

    const { emailDeliveries, ...paymentDetails } = paymentRequest;
    return {
      ...paymentDetails,
      latestEmailDelivery: emailDeliveries[0] ?? null,
    };
  }

  async findTimeline(publicId: string, workspaceId: string) {
    const paymentRequest = await this.prisma.paymentRequest.findFirst({
      where: { publicId, workspaceId },
      select: {
        publicId: true,
        status: true,
        events: {
          orderBy: [{ occurredAt: 'asc' }, { providerEventId: 'asc' }],
          select: {
            providerEventId: true,
            providerType: true,
            type: true,
            occurredAt: true,
            resultingStatus: true,
            providerCheckoutSessionId: true,
            providerPaymentIntentId: true,
          },
        },
      },
    });

    if (!paymentRequest) {
      throw new NotFoundException('Payment request not found');
    }

    return {
      publicId: paymentRequest.publicId,
      currentStatus: paymentRequest.status,
      events: paymentRequest.events.map((event) => ({
        type: event.type,
        resultingStatus: event.resultingStatus,
        occurredAt: event.occurredAt,
        providerReferences: {
          eventId: event.providerEventId,
          eventType: event.providerType,
          checkoutSessionId: event.providerCheckoutSessionId,
          paymentIntentId: event.providerPaymentIntentId,
        },
      })),
    };
  }

  async findByPublicId(publicId: string) {
    const paymentRequest = await this.prisma.paymentRequest.findUnique({
      where: { publicId },
      select: {
        publicId: true,
        description: true,
        amount: true,
        currency: true,
        status: true,
        workspace: { select: { name: true } },
      },
    });

    if (!paymentRequest) {
      throw new NotFoundException('Payment request not found');
    }

    const { workspace, ...result } = paymentRequest;
    return { ...result, businessName: workspace.name };
  }

  async findCheckoutResult(providerCheckoutSessionId: string) {
    const paymentRequest = await this.prisma.paymentRequest.findUnique({
      where: { providerCheckoutSessionId },
      select: {
        description: true,
        amount: true,
        currency: true,
        status: true,
        workspace: { select: { name: true } },
      },
    });

    if (!paymentRequest) {
      throw new NotFoundException('Checkout result not found');
    }

    const { workspace, ...result } = paymentRequest;
    return { ...result, businessName: workspace.name };
  }

  private findIdempotentPayment(request: CreateCheckoutRequest) {
    return this.prisma.paymentRequest.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: request.workspaceId,
          idempotencyKey: request.idempotencyKey,
        },
      },
      select: idempotentPaymentSelect,
    });
  }

  private ensureIdempotentPaymentMatches<T extends IdempotentPaymentDetails>(
    payment: T,
    request: CreateCheckoutRequest,
  ) {
    const matchesRequest =
      payment.description === request.description &&
      payment.internalReference === request.internalReference &&
      payment.amount === request.amount &&
      payment.currency === request.currency &&
      payment.customer.id === request.customerId &&
      payment.sendEmailRequested === request.sendEmail &&
      payment.emailMessage === request.message;

    if (!matchesRequest) {
      throw new ConflictException(
        'Idempotency-Key was already used for a different payment',
      );
    }

    return this.toCreateResponse(payment);
  }

  private toCreateResponse<T extends IdempotentPaymentDetails>(payment: T) {
    const {
      emailMessage: _emailMessage,
      emailDeliveries,
      ...paymentDetails
    } = payment;
    void _emailMessage;

    return payment.sendEmailRequested
      ? {
          ...paymentDetails,
          latestEmailDelivery: emailDeliveries[0] ?? null,
        }
      : paymentDetails;
  }
}
