import { ApiProperty } from '@nestjs/swagger';

export class ConfigureWebhookDestinationDto {
  @ApiProperty({ example: 'https://hooks.example.com/payments', format: 'uri' })
  url: string;
}
