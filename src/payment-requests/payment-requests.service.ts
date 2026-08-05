import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  STRIPE_CONNECT_PROVIDER,
  type StripeConnectProvider,
} from '../stripe-connect/stripe-connect.provider';
import {
  PAYMENT_PROVIDER,
  type CheckoutSession,
  type PaymentProvider,
} from './payment-provider';

type CreateCheckoutRequest = {
  description: string;
  amount: number;
  currency: string;
  customerId: number;
  workspaceId: string;
  idempotencyKey: string;
};

type IdempotentPaymentDetails = {
  description: string;
  amount: number;
  currency: string;
  customer: { id: number };
};

const paymentRequestSelect = {
  publicId: true,
  description: true,
  amount: true,
  currency: true,
  status: true,
  checkoutUrl: true,
  providerCheckoutSessionId: true,
  providerPaymentIntentId: true,
  createdAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

@Injectable()
export class PaymentRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CONNECT_PROVIDER)
    private readonly stripeConnectProvider: StripeConnectProvider,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
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

    const connectionStatus = await this.stripeConnectProvider.getAccountStatus(
      workspace.stripeAccountId,
    );

    if (
      !connectionStatus.onboardingComplete ||
      !connectionStatus.paymentsReady
    ) {
      throw new ConflictException('Stripe account is not ready for payments');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: request.customerId, workspaceId: request.workspaceId },
      select: { id: true, name: true, email: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    let checkout: CheckoutSession;

    try {
      checkout = await this.paymentProvider.createCheckout({
        connectedAccountId: workspace.stripeAccountId,
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        customerEmail: customer.email,
        idempotencyKey: `${request.workspaceId}:${request.idempotencyKey}`,
      });
    } catch {
      throw new BadGatewayException(
        'Payment provider could not create checkout',
      );
    }

    try {
      return await this.prisma.paymentRequest.create({
        data: {
          description: request.description,
          amount: request.amount,
          currency: request.currency,
          checkoutUrl: checkout.url,
          providerCheckoutSessionId: checkout.id,
          providerPaymentIntentId: checkout.paymentIntentId,
          idempotencyKey: request.idempotencyKey,
          customer: { connect: { id: customer.id } },
          workspace: { connect: { id: request.workspaceId } },
        },
        select: paymentRequestSelect,
      });
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
    return this.prisma.paymentRequest.findMany({
      where: { workspaceId },
      orderBy: { id: 'asc' },
      select: paymentRequestSelect,
    });
  }

  async findOne(publicId: string, workspaceId: string) {
    const paymentRequest = await this.prisma.paymentRequest.findFirst({
      where: {
        publicId,
        workspaceId,
      },
      select: paymentRequestSelect,
    });

    if (!paymentRequest) {
      throw new NotFoundException('Payment request not found');
    }

    return paymentRequest;
  }

  async findByPublicId(publicId: string) {
    const paymentRequest = await this.prisma.paymentRequest.findUnique({
      where: { publicId },
      select: {
        publicId: true,
        description: true,
        amount: true,
        status: true,
      },
    });

    if (!paymentRequest) {
      throw new NotFoundException('Payment request not found');
    }

    return paymentRequest;
  }

  private findIdempotentPayment(request: CreateCheckoutRequest) {
    return this.prisma.paymentRequest.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: request.workspaceId,
          idempotencyKey: request.idempotencyKey,
        },
      },
      select: paymentRequestSelect,
    });
  }

  private ensureIdempotentPaymentMatches<T extends IdempotentPaymentDetails>(
    payment: T,
    request: CreateCheckoutRequest,
  ) {
    const matchesRequest =
      payment.description === request.description &&
      payment.amount === request.amount &&
      payment.currency === request.currency &&
      payment.customer.id === request.customerId;

    if (!matchesRequest) {
      throw new ConflictException(
        'Idempotency-Key was already used for a different payment',
      );
    }

    return payment;
  }
}
