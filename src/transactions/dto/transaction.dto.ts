import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsDecimal,
  IsOptional,
  Matches,
} from 'class-validator';

const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;
const AMOUNT_MSG = 'amount must be a positive decimal string with up to 2 decimal places (e.g. "25.50")';

export class CreateTransactionDto {
  @ApiProperty({ example: 'wal_001' })
  @IsString()
  @IsNotEmpty()
  walletId: string;

  @ApiProperty({ enum: ['DEBIT', 'CREDIT'] })
  @IsIn(['DEBIT', 'CREDIT'])
  type: 'DEBIT' | 'CREDIT';

  @ApiProperty({ example: '25.50', description: AMOUNT_MSG })
  @IsString()
  @Matches(AMOUNT_REGEX, { message: AMOUNT_MSG })
  amount: string;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ example: 'Pago QR comercio' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'qr_789456' })
  @IsOptional()
  @IsString()
  externalReference?: string;
}

export class CreateTransferDto {
  @ApiProperty({ example: 'wal_001' })
  @IsString()
  @IsNotEmpty()
  sourceWalletId: string;

  @ApiProperty({ example: 'wal_002' })
  @IsString()
  @IsNotEmpty()
  targetWalletId: string;

  @ApiProperty({ example: '100.00', description: AMOUNT_MSG })
  @IsString()
  @Matches(AMOUNT_REGEX, { message: AMOUNT_MSG })
  amount: string;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ example: 'Transferencia entre usuarios' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateReversalDto {
  @ApiProperty({ example: 'Merchant refund / reversal' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 'rev_123456' })
  @IsOptional()
  @IsString()
  externalReference?: string;
}

export class TransactionResponseDto {
  @ApiProperty({ example: 'txn_abc123' })
  transactionId: string;

  @ApiProperty({ example: 'wal_001' })
  walletId: string;

  @ApiProperty({ enum: ['DEBIT', 'CREDIT', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'REVERSAL'] })
  type: string;

  @ApiProperty({ example: '25.50' })
  amount: string;

  @ApiProperty({ example: 'PEN' })
  currency: string;

  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'] })
  status: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  externalReference: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class TransferResponseDto {
  @ApiProperty({ example: 'txn_debit_001' })
  debitTransactionId: string;

  @ApiProperty({ example: 'txn_credit_001' })
  creditTransactionId: string;

  @ApiProperty({ example: 'wal_001' })
  sourceWalletId: string;

  @ApiProperty({ example: 'wal_002' })
  targetWalletId: string;

  @ApiProperty({ example: '100.00' })
  amount: string;

  @ApiProperty({ example: 'PEN' })
  currency: string;

  @ApiProperty({ enum: ['COMPLETED'] })
  status: string;
}

export class TransactionStatusResponseDto {
  @ApiProperty({ example: 'txn_001' })
  transactionId: string;

  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'] })
  status: string;

  @ApiProperty({ example: 'DEBIT' })
  type: string;

  @ApiProperty({ example: '25.50' })
  amount: string;

  @ApiProperty({ example: 'PEN' })
  currency: string;

  @ApiPropertyOptional({ example: 'qr_789456' })
  externalReference: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
