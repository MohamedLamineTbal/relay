import { ApiProperty } from '@nestjs/swagger';

export class AuthDto {
  @ApiProperty({ example: 'owner@example.com', format: 'email' })
  email: string;

  @ApiProperty({
    example: 'correct horse battery staple',
    format: 'password',
    minLength: 1,
  })
  password: string;
}
