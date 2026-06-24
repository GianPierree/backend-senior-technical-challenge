import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { IdempotencyRecordEntity } from '../entities/idempotency-record.entity';
import { IdempotencyConflictException } from '../exceptions/business.exceptions';
import { IIdempotencyService, IdempotencyResult } from '../interfaces/idempotency.interface';

@Injectable()
export class IdempotencyService implements IIdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyRecordEntity)
    private readonly idempotencyRepo: Repository<IdempotencyRecordEntity>,
  ) {}

  hashBody(body: unknown): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(body ?? {}))
      .digest('hex');
  }

  async check(
    idempotencyKey: string,
    endpoint: string,
    requestBody: unknown,
  ): Promise<IdempotencyResult | null> {
    const existing = await this.idempotencyRepo.findOne({
      where: { idempotencyKey },
    });

    if (!existing) return null;

    const incomingHash = this.hashBody(requestBody);

    if (existing.requestHash !== incomingHash) {
      this.logger.warn(`Idempotency conflict on endpoint: ${endpoint}`);
      throw new IdempotencyConflictException(idempotencyKey);
    }

    this.logger.log(`Idempotency cache hit for endpoint: ${endpoint}`);
    return {
      cached: true,
      responseBody: existing.responseBody,
      httpStatus: existing.httpStatus,
    };
  }

  async store(
    idempotencyKey: string,
    endpoint: string,
    requestBody: unknown,
    responseBody: Record<string, unknown>,
    httpStatus: number,
  ): Promise<void> {
    const record = this.idempotencyRepo.create({
      idempotencyKey,
      endpoint,
      requestHash: this.hashBody(requestBody),
      responseBody,
      httpStatus,
    });
    await this.idempotencyRepo.save(record);
  }
}
