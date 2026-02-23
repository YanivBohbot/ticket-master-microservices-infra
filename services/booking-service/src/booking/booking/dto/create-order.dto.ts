/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsString,
  IsNumber,
  IsPositive,
  IsNotEmpty,
  IsArray,
  IsOptional,
} from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'UserId must not be empty' })
  userId: string;

  @IsNumber()
  @IsPositive({ message: 'Amount must be a positive number' })
  amount: number;

  @IsString()
  @IsNotEmpty()
  ticketType: string;

  @IsOptional()
  @IsArray()
  metadata?: Record<string, any>;
}
