import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { WalletRepository } from './repositories/wallet.repository';
import { DebitStrategy } from './strategies/debit.strategy';
import { CreditStrategy } from './strategies/credit.strategy';
import { TransferStrategy } from './strategies/transfer.strategy';
import { ReversalStrategy, ReversalContext } from './strategies/reversal.strategy';
import { TransactionMapper } from './mappers/transaction.mapper';
import { BalanceCalculator } from './domain/balance.calculator';
import { IAuditService, AuditOptions } from '../common/interfaces/audit.interface';
import { IIdempotencyService } from '../common/interfaces/idempotency.interface';
import { IdempotencyService } from '../common/services/idempotency.service';
import { AuditService } from '../common/services/audit.service';
import { CurrencyMismatchException, TransactionNotFoundException } from '../common/exceptions/business.exceptions';
import {
  CreateTransactionDto,
  CreateTransferDto,
  CreateReversalDto,
  TransactionResponseDto,
  TransferResponseDto,
  TransactionStatusResponseDto,
} from './dto/transaction.dto';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  private readonly auditService: IAuditService;
  private readonly idempotencyService: IIdempotencyService;

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    private readonly walletRepository: WalletRepository,
    private readonly dataSource: DataSource,
    private readonly debitStrategy: DebitStrategy,
    private readonly creditStrategy: CreditStrategy,
    private readonly transferStrategy: TransferStrategy,
    private readonly reversalStrategy: ReversalStrategy,
    idempotencyService: IdempotencyService,
    auditService: AuditService,
  ) {
    this.idempotencyService = idempotencyService;
    this.auditService = auditService;
  }

  async createTransaction(
    dto: CreateTransactionDto,
    idempotencyKey: string,
    actor: string,
  ): Promise<TransactionResponseDto> {
    const cached = await this.idempotencyService.check(idempotencyKey, '/transactions', dto);
    if (cached) return cached.responseBody as unknown as TransactionResponseDto;

    const strategy = dto.type === 'DEBIT' ? this.debitStrategy : this.creditStrategy;

    const primary = await this.dataSource.transaction(async (manager) => {
      const wallet = await this.walletRepository.findActiveOrFail(dto.walletId, manager);

      if (wallet.currency !== dto.currency) {
        throw new CurrencyMismatchException(wallet.currency, dto.currency);
      }

      const beforeBalance = wallet.balance;
      const { transactions, wallets, primary } = await strategy.execute(
        { wallet, amount: dto.amount, currency: dto.currency, description: dto.description, externalReference: dto.externalReference, idempotencyKey },
        manager,
      );

      await manager.save(wallets);
      await manager.save(TransactionEntity, transactions);

      await this.auditService.log(
        this.buildAudit('TRANSACTION', primary.id, dto.type, actor, beforeBalance, wallet.balance, { walletId: dto.walletId, amount: dto.amount }),
        manager,
      );

      return primary;
    });

    const response = TransactionMapper.toResponse(primary);
    await this.idempotencyService.store(idempotencyKey, '/transactions', dto, response as unknown as Record<string, unknown>, 201);
    return response;
  }

  async createTransfer(
    dto: CreateTransferDto,
    idempotencyKey: string,
    actor: string,
  ): Promise<TransferResponseDto> {
    const cached = await this.idempotencyService.check(idempotencyKey, '/transactions/transfer', dto);
    if (cached) return cached.responseBody as unknown as TransferResponseDto;

    const result = await this.dataSource.transaction(async (manager) => {
      const sourceWallet = await this.walletRepository.findActiveOrFail(dto.sourceWalletId, manager);
      const targetWallet = await this.walletRepository.findActiveOrFail(dto.targetWalletId, manager);

      if (sourceWallet.currency !== dto.currency) {
        throw new CurrencyMismatchException(sourceWallet.currency, dto.currency);
      }

      const sourceBalanceBefore = sourceWallet.balance;
      const targetBalanceBefore = targetWallet.balance;

      const { transactions, wallets } = await this.transferStrategy.execute(
        { wallet: sourceWallet, targetWallet, amount: dto.amount, currency: dto.currency, description: dto.description, idempotencyKey },
        manager,
      );

      await manager.save(wallets);
      await manager.save(TransactionEntity, transactions);

      await this.auditService.log(
        this.buildAudit('TRANSFER', transactions[0].id, 'TRANSFER', actor,
          sourceBalanceBefore, sourceWallet.balance,
          { targetBalance: { before: targetBalanceBefore, after: targetWallet.balance }, amount: dto.amount },
        ),
        manager,
      );

      return { debitTxn: transactions[0], creditTxn: transactions[1] };
    });

    const response: TransferResponseDto = {
      debitTransactionId: result.debitTxn.id,
      creditTransactionId: result.creditTxn.id,
      sourceWalletId: dto.sourceWalletId,
      targetWalletId: dto.targetWalletId,
      amount: BalanceCalculator.format(dto.amount),
      currency: dto.currency,
      status: 'COMPLETED',
    };

    await this.idempotencyService.store(idempotencyKey, '/transactions/transfer', dto, response as unknown as Record<string, unknown>, 201);
    return response;
  }

  async reverseTransaction(
    transactionId: string,
    dto: CreateReversalDto,
    idempotencyKey: string,
    actor: string,
  ): Promise<TransactionResponseDto> {
    const endpoint = `/transactions/${transactionId}/reversal`;
    const cached = await this.idempotencyService.check(idempotencyKey, endpoint, dto);
    if (cached) return cached.responseBody as unknown as TransactionResponseDto;

    const primary = await this.dataSource.transaction(async (manager) => {
      const original = await manager.findOne(TransactionEntity, { where: { id: transactionId } });
      if (!original) throw new TransactionNotFoundException(transactionId);

      const wallet = await this.walletRepository.findActiveOrFail(original.walletId, manager);
      const balanceBefore = wallet.balance;

      const reversalCtx: ReversalContext = {
        wallet,
        amount: original.amount,
        currency: original.currency,
        idempotencyKey,
        originalTransactionId: transactionId,
        reason: dto.reason,
        externalReference: dto.externalReference,
      };

      const { transactions, wallets, primary } = await this.reversalStrategy.execute(reversalCtx, manager);

      await manager.save(wallets);
      await manager.save(TransactionEntity, transactions);

      await this.auditService.log(
        this.buildAudit('REVERSAL', primary.id, 'REVERSAL', actor, balanceBefore, wallet.balance, { originalTransactionId: transactionId, reason: dto.reason }),
        manager,
      );

      return primary;
    });

    const response = TransactionMapper.toResponse(primary);
    await this.idempotencyService.store(idempotencyKey, endpoint, dto, response as unknown as Record<string, unknown>, 201);
    return response;
  }

  async getTransactionStatus(transactionId: string): Promise<TransactionStatusResponseDto> {
    const txn = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!txn) throw new TransactionNotFoundException(transactionId);
    return TransactionMapper.toStatusResponse(txn);
  }

  private buildAudit(
    entityType: string,
    entityId: string,
    action: string,
    actor: string,
    balanceBefore: string,
    balanceAfter: string,
    metadata: Record<string, unknown>,
  ): AuditOptions {
    return {
      entityType,
      entityId,
      action,
      actor,
      beforeState: { balance: balanceBefore },
      afterState: { balance: balanceAfter },
      metadata,
    };
  }
}
