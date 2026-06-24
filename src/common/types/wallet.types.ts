export type WalletStatus = 'ACTIVE' | 'BLOCKED' | 'CLOSED';

export type SupportedCurrency = 'PEN' | 'USD' | 'EUR';

export interface WalletSnapshot {
  id: string;
  ownerId: string;
  currency: string;
  balance: string;
  status: WalletStatus;
}
