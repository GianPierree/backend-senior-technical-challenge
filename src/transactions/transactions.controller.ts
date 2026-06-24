import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TransactionsService } from './transactions.service';
import {
  CreateTransactionDto,
  CreateTransferDto,
  CreateReversalDto,
  TransactionResponseDto,
  TransferResponseDto,
  TransactionStatusResponseDto,
} from './dto/transaction.dto';
import { AuthenticatedRequest } from '../common/interfaces/auth.interface';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a DEBIT or CREDIT transaction' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'UUID for idempotency', required: true })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  @ApiResponse({ status: 409, description: 'Idempotency conflict' })
  @ApiResponse({ status: 422, description: 'Insufficient balance / currency mismatch / inactive wallet' })
  createTransaction(
    @Body() dto: CreateTransactionDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<TransactionResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Header Idempotency-Key is required',
      });
    }
    return this.transactionsService.createTransaction(dto, idempotencyKey, req.user.username);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Transfer between two wallets (atomic double entry)' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'UUID for idempotency', required: true })
  @ApiResponse({ status: 201, type: TransferResponseDto })
  createTransfer(
    @Body() dto: CreateTransferDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<TransferResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Header Idempotency-Key is required',
      });
    }
    return this.transactionsService.createTransfer(dto, idempotencyKey, req.user.username);
  }

  @Get(':transactionId')
  @ApiOperation({ summary: 'Get transaction status' })
  @ApiResponse({ status: 200, type: TransactionStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  getStatus(
    @Param('transactionId') transactionId: string,
  ): Promise<TransactionStatusResponseDto> {
    return this.transactionsService.getTransactionStatus(transactionId);
  }

  @Post(':transactionId/reversal')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reverse a transaction (single use, atomic)' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'UUID for idempotency', required: true })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  @ApiResponse({ status: 422, description: 'Transaction already reversed' })
  reverseTransaction(
    @Param('transactionId') transactionId: string,
    @Body() dto: CreateReversalDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<TransactionResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Header Idempotency-Key is required',
      });
    }
    return this.transactionsService.reverseTransaction(
      transactionId,
      dto,
      idempotencyKey,
      req.user.username,
    );
  }
}
