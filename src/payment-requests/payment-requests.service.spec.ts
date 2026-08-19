import { Test, TestingModule } from '@nestjs/testing';
import { PaymentEmailsService } from '../payment-emails/payment-emails.service';
import { PrismaService } from '../prisma/prisma.service';
import { STRIPE_CONNECT_PROVIDER } from '../stripe-connect/stripe-connect.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentRequestsService } from './payment-requests.service';

describe('PaymentRequestsService', () => {
  let service: PaymentRequestsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRequestsService,
        { provide: PrismaService, useValue: {} },
        { provide: STRIPE_CONNECT_PROVIDER, useValue: {} },
        { provide: PAYMENT_PROVIDER, useValue: {} },
        { provide: PaymentEmailsService, useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentRequestsService>(PaymentRequestsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
