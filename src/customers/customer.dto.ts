import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  name: string;

  @ApiPropertyOptional({ example: 'ada@example.com', format: 'email' })
  email?: string;
}
