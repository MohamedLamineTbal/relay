import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentRequestDto {
  @ApiProperty({ example: 1, minimum: 1 })
  customerId: number;

  @ApiProperty({ example: 4500, minimum: 1, maximum: 99_999_999 })
  amount: number;

  @ApiProperty({ example: 'August subscription', maxLength: 500 })
  description: string;

  @ApiPropertyOptional({
    example: 'Invoice 42',
    maxLength: 120,
    description: 'Owner-only reference that is never exposed to the payer',
  })
  internalReference?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Queue the first payment email after Checkout is created',
  })
  sendEmail?: boolean;

  @ApiPropertyOptional({
    example: 'Thank you for your business.',
    maxLength: 500,
    description: 'Plain text; accepted only when sendEmail is true',
  })
  message?: string;
}
