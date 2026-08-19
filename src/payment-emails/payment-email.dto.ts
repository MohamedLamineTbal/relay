import { ApiPropertyOptional } from '@nestjs/swagger';

export class SendPaymentEmailDto {
  @ApiPropertyOptional({
    enum: ['ORIGINAL', 'CURRENT'],
    default: 'ORIGINAL',
    description:
      'Use the original recipient snapshot or explicitly choose the current customer email',
  })
  recipient?: 'ORIGINAL' | 'CURRENT';

  @ApiPropertyOptional({
    example: 'A short note from the business.',
    maxLength: 500,
    description: 'Optional plain-text message',
  })
  message?: string;
}
