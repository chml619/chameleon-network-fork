/**
 * Single-Sided Liquidity Service
 * Handles provisioning, withdrawal, and rewards for single-sided LP
 */
import { ApiPromise } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { BN } from '@polkadot/util';

export enum LockTier {
  NoLock = 'NoLock',
  SixMonths = 'SixMonths',
  TwelveMonths = 'TwelveMonths',
  TwentyFourMonths = 'TwentyFourMonths',
}

export const LOCK_TIER_INFO = {
  [LockTier.NoLock]: { label: 'No Lock', months: 0, share: '8%', multiplier: 1.0 },
  [LockTier.SixMonths]: { label: '6 Months', months: 6, share: '12%', multiplier: 1.5 },
  [LockTier.TwelveMonths]: { label: '12 Months', months: 12, share: '15%', multiplier: 1.875 },
  [LockTier.TwentyFourMonths]: { label: '24 Months', months: 24, share: '25%', multiplier: 3.125 },
};

export interface SingleSidedPosition {
  positionId: string;
  tokenId: number;
  tokenSymbol: string;
  amount: string;
  lockTier: LockTier;
  startBlock: string;
  endBlock: string | null;
  pendingRewards: string;
  isLocked: boolean;
  unlockDate: Date | null;
}

const TOKEN_SYMBOLS: Record<number, string> = {
  0: 'pCHML',
  1: 'pETH',
  2: 'pBTC',
  3: 'pUSDT',
};

class SingleSidedService {
  private static instance: SingleSidedService;

  static getInstance(): SingleSidedService {
    if (!SingleSidedService.instance) {
      SingleSidedService.instance = new SingleSidedService();
    }
    return SingleSidedService.instance;
  }

  async provisionSingleSided(
    api: ApiPromise,
    keyPair: KeyringPair,
    tokenId: number,
    amount: BN,
    lockTier: LockTier
  ): Promise<{ success: boolean; positionId?: string; error?: string }> {
    try {
      return new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve({ success: false, error: 'Transaction timeout - please try again' });
          }
        }, 60000);

        api.tx.pdex
          .provisionSingleSided(tokenId, amount, lockTier)
          .signAndSend(keyPair, ({ status, events, dispatchError }) => {
            // Handle error statuses
            if (status.isDropped || status.isInvalid || status.isUsurped) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: false, error: `Transaction failed: ${status.type}` });
              }
              return;
            }

            if (dispatchError) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                if (dispatchError.isModule) {
                  const decoded = api.registry.findMetaError(dispatchError.asModule);
                  resolve({ success: false, error: `${decoded.section}.${decoded.name}` });
                } else {
                  resolve({ success: false, error: dispatchError.toString() });
                }
              }
              return;
            }

            if (status.isInBlock || status.isFinalized) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                let positionId = '0';
                events.forEach(({ event }) => {
                  if (event.section === 'pdex' && event.method === 'SingleSidedProvisioned') {
                    positionId = event.data[1]?.toString() || '0';
                  }
                });
                resolve({ success: true, positionId });
              }
            }
          })
          .catch((error) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ success: false, error: error.message });
            }
          });
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Provision failed' };
    }
  }

  async withdrawSingleSided(
    api: ApiPromise,
    keyPair: KeyringPair,
    positionId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve({ success: false, error: 'Transaction timeout - please try again' });
          }
        }, 60000);

        api.tx.pdex
          .withdrawSingleSided(positionId)
          .signAndSend(keyPair, ({ status, dispatchError }) => {
            // Handle error statuses
            if (status.isDropped || status.isInvalid || status.isUsurped) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: false, error: `Transaction failed: ${status.type}` });
              }
              return;
            }

            if (dispatchError) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                if (dispatchError.isModule) {
                  const decoded = api.registry.findMetaError(dispatchError.asModule);
                  resolve({ success: false, error: `${decoded.section}.${decoded.name}` });
                } else {
                  resolve({ success: false, error: dispatchError.toString() });
                }
              }
              return;
            }

            if (status.isInBlock || status.isFinalized) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: true });
              }
            }
          })
          .catch((error) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ success: false, error: error.message });
            }
          });
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Withdraw failed' };
    }
  }

  async claimSingleSidedRewards(
    api: ApiPromise,
    keyPair: KeyringPair,
    positionId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve({ success: false, error: 'Transaction timeout - please try again' });
          }
        }, 60000);

        api.tx.pdex
          .claimSingleSidedRewards(positionId)
          .signAndSend(keyPair, ({ status, dispatchError }) => {
            // Handle error statuses
            if (status.isDropped || status.isInvalid || status.isUsurped) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: false, error: `Transaction failed: ${status.type}` });
              }
              return;
            }

            if (dispatchError) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                if (dispatchError.isModule) {
                  const decoded = api.registry.findMetaError(dispatchError.asModule);
                  resolve({ success: false, error: `${decoded.section}.${decoded.name}` });
                } else {
                  resolve({ success: false, error: dispatchError.toString() });
                }
              }
              return;
            }

            if (status.isInBlock || status.isFinalized) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: true });
              }
            }
          })
          .catch((error) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ success: false, error: error.message });
            }
          });
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Claim failed' };
    }
  }

  async getUserPositions(api: ApiPromise, address: string): Promise<SingleSidedPosition[]> {
    try {
      const positionIds = await api.query.pdex.userSingleSided(address);
      const ids = positionIds.toJSON() as number[];
      if (!ids || ids.length === 0) return [];

      const currentBlock = parseInt((await api.query.system.number()).toString());
      const positions: SingleSidedPosition[] = [];

      for (const id of ids) {
        const posData = await api.query.pdex.singleSidedPositions(id);
        const pos = posData.toJSON() as any;
        if (pos) {
          const endBlock = pos.endBlock ? parseInt(pos.endBlock) : null;
          const isLocked = endBlock ? currentBlock < endBlock : false;
          let unlockDate: Date | null = null;
          if (endBlock && isLocked) {
            const blocksRemaining = endBlock - currentBlock;
            const secondsRemaining = blocksRemaining * 6;
            unlockDate = new Date(Date.now() + secondsRemaining * 1000);
          }

          positions.push({
            positionId: id.toString(),
            tokenId: pos.tokenId,
            tokenSymbol: TOKEN_SYMBOLS[pos.tokenId] || `Token${pos.tokenId}`,
            amount: pos.amount?.toString() || '0',
            lockTier: pos.lockTier as LockTier,
            startBlock: pos.startBlock?.toString() || '0',
            endBlock: endBlock?.toString() || null,
            pendingRewards: pos.pendingRewards?.toString() || '0',
            isLocked,
            unlockDate,
          });
        }
      }
      return positions;
    } catch (error) {
      console.error('[SingleSided] Error fetching positions:', error);
      return [];
    }
  }

  formatAmount(amount: string): string {
    const DECIMALS = 1_000_000_000_000;
    let numValue: number;
    if (amount.startsWith('0x')) {
      numValue = parseInt(amount, 16) / DECIMALS;
    } else {
      numValue = parseFloat(amount) / DECIMALS;
    }
    if (numValue === 0 || isNaN(numValue)) return '0';
    return numValue.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
}

export const singleSidedService = SingleSidedService.getInstance();
