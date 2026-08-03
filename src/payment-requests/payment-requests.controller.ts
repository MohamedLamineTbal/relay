import { Body, Controller, Post, Get, Param } from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';

@Controller()
export class PaymentRequestsController {
  constructor(
    private readonly paymentRequestsService: PaymentRequestsService,
  ) {}

  @Post('payment-requests')
  create(
    @Body()
    body: {
      description: string;
      amount: number;
      customerId: number;
    },
  ) {
    return this.paymentRequestsService.create(
      body.description,
      body.amount,
      body.customerId,
    );
  }
  @Get('pay/:publicId')
  findByPublicId(@Param('publicId') publicId: string) {
    return this.paymentRequestsService.findByPublicId(publicId);
  }
}
