export interface IdempotencyResult {
  cached: boolean;
  responseBody: Record<string, unknown>;
  httpStatus: number;
}

export interface IIdempotencyService {
  check(key: string, endpoint: string, body: unknown): Promise<IdempotencyResult | null>;
  store(
    key: string,
    endpoint: string,
    body: unknown,
    response: Record<string, unknown>,
    status: number,
  ): Promise<void>;
  hashBody(body: unknown): string;
}
