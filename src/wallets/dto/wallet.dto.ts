import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class WalletBalanceResponseDto {
  @ApiProperty({ example: 'wal_001' })
  walletId: string;

  @ApiProperty({ example: 'PEN' })
  currency: string;

  @ApiProperty({ example: '1500.00' })
  availableBalance: string;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;
}

export class MovementItemDto {
  @ApiProperty({ example: 'txn_001' })
  transactionId: string;

  @ApiProperty({ example: '25.50' })
  amount: string;

  @ApiProperty({ enum: ['DEBIT', 'CREDIT', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'REVERSAL'] })
  type: string;

  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'] })
  status: string;

  @ApiProperty({ example: 'PEN' })
  currency: string;

  @ApiPropertyOptional({ example: 'Pago QR comercio' })
  description: string | null;

  @ApiPropertyOptional({ example: 'qr_789456' })
  externalReference: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class MovementsResponseDto {
  @ApiProperty({ example: 'wal_001' })
  walletId: string;

  @ApiProperty({ example: 10 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;

  @ApiProperty({ type: [MovementItemDto] })
  movements: MovementItemDto[];
}

export class GetMovementsQueryDto {
  @ApiPropertyOptional({ enum: ['ALL', 'DEBIT', 'CREDIT', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'REVERSAL'], default: 'ALL' })
  @IsOptional()
  @IsIn(['ALL', 'DEBIT', 'CREDIT', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'REVERSAL'])
  type?: string;

  @ApiPropertyOptional({ enum: ['ALL', 'PENDING', 'COMPLETED', 'FAILED', 'REVERSED'], default: 'ALL' })
  @IsOptional()
  @IsIn(['ALL', 'PENDING', 'COMPLETED', 'FAILED', 'REVERSED'])
  status?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
