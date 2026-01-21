/**
 * Pool Service
 * Interfaces with pDEX pallet for liquidity pool operations
 */
import { ApiPromise } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';

export interface PoolInfo {
  id: number;
  assetA: number;
  assetB: number;
  reserveA: string;
  reserveB: string;
  totalLpTokens: string;
  swapFee: string;
}

export interface UserLPPosition {
  poolId: number;
  lpTokens: string;
  sharePercent: number;
  valueA: string;
  valueB: string;
}

export interface LiquidityResult {
  success: boolean;
  txHash?: string;
  lpTokensReceived?: string;
  error?: string;
}

const TOKEN_SYMBOLS: Record<number, string> = {
  0: 'pCHML',
  1: 'pETH',
  2: 'pBTC',
  3: 'pUSDT',
};

const TOKEN_IDS: Record<string, number> = {
  pCHML: 0,
  pETH: 1,
  pBTC: 2,
  pUSDT: 3,
};

class PoolService {
  private static instance: PoolService;

  static getInstance(): PoolService {
    if (!PoolService.instance) {
      PoolService.instance = new PoolService();
    }
    return PoolService.instance;
  }

  /**
   * Parse amount that may be hex string from chain
   */
  private parseChainAmount(amount: string): number {
    if (!amount) return 0;
    if (amount.startsWith('0x')) {
      return parseInt(amount, 16);
    }
    return parseFloat(amount) || 0;
  }

  getTokenSymbol(tokenId: number): string {
    return TOKEN_SYMBOLS[tokenId] || `Token${tokenId}`;
  }

  getTokenId(symbol: string): number {
    return TOKEN_IDS[symbol] ?? 0;
  }

  /**
   * Get all liquidity pools
   */
  async getAllPools(api: ApiPromise): Promise<PoolInfo[]> {
    const pools: PoolInfo[] = [];
    try {
      const entries = await api.query.pdex.pools.entries();
      
      for (const [key, value] of entries) {
        const poolId = (key.args[0] as any).toNumber();
        const data = value.toJSON() as any;
        
        if (data) {
          pools.push({
            id: poolId,
            assetA: data.assetA ?? 0,
            assetB: data.assetB ?? 0,
            reserveA: data.reserveA?.toString() || '0',
            reserveB: data.reserveB?.toString() || '0',
            totalLpTokens: data.totalLpTokens?.toString() || '0',
            swapFee: '0.25%',
          });
        }
      }
    } catch (error) {
      console.error('[Pool] Error fetching pools:', error);
    }
    return pools;
  }

  /**
   * Get single pool info
   */
  async getPool(api: ApiPromise, poolId: number): Promise<PoolInfo | null> {
    try {
      const data = await api.query.pdex.pools(poolId);
      const pool = data.toJSON() as any;
      
      if (!pool) return null;
      
      return {
        id: poolId,
        assetA: pool.assetA ?? 0,
        assetB: pool.assetB ?? 0,
        reserveA: pool.reserveA?.toString() || '0',
        reserveB: pool.reserveB?.toString() || '0',
        totalLpTokens: pool.totalLpTokens?.toString() || '0',
        swapFee: '0.25%',
      };
    } catch (error) {
      console.error('[Pool] Error fetching pool:', error);
      return null;
    }
  }

  /**
   * Get user's LP token balance for a pool
   */
  async getUserLPBalance(api: ApiPromise, poolId: number, address: string): Promise<string> {
    try {
      const balance = await api.query.pdex.userLPTokens(poolId, address);
      return balance.toString();
    } catch (error) {
      console.error('[Pool] Error fetching LP balance:', error);
      return '0';
    }
  }

  /**
   * Get user's position in a pool
   */
  async getUserPosition(api: ApiPromise, poolId: number, address: string): Promise<UserLPPosition | null> {
    try {
      const pool = await this.getPool(api, poolId);
      if (!pool) return null;
      
      const lpBalance = await this.getUserLPBalance(api, poolId, address);
      if (lpBalance === '0' || lpBalance === '0x0' || lpBalance === '0x00' || this.parseChainAmount(lpBalance) === 0) return null;
      const totalLp = this.parseChainAmount(pool.totalLpTokens) || 1;
      const userLp = this.parseChainAmount(lpBalance);
      const sharePercent = parseFloat(((userLp / totalLp) * 100).toFixed(6));
      // Calculate user's share of reserves
      const reserveA = this.parseChainAmount(pool.reserveA);
      const reserveB = this.parseChainAmount(pool.reserveB);
      const valueA = Math.floor((userLp / totalLp) * reserveA).toString();
      const valueB = Math.floor((userLp / totalLp) * reserveB).toString();
      
      return {
        poolId,
        lpTokens: lpBalance,
        sharePercent,
        valueA,
        valueB,
      };
    } catch (error) {
      console.error('[Pool] Error fetching user position:', error);
      return null;
    }
  }

  /**
   * Calculate expected LP tokens for adding liquidity
   */
  calculateExpectedLPTokens(
    amountA: string,
    amountB: string,
    reserveA: string,
    reserveB: string,
    totalLpTokens: string
  ): string {
    const a = parseFloat(amountA);
    const b = parseFloat(amountB);
    const rA = this.parseChainAmount(reserveA);
    const rB = this.parseChainAmount(reserveB);
    const totalLp = parseFloat(totalLpTokens);
    
    if (totalLp === 0) {
      // First liquidity provider - LP tokens = sqrt(amountA * amountB)
      return Math.sqrt(a * b).toString();
    }
    
    // Existing pool - LP tokens based on smaller ratio
    const lpFromA = (a / rA) * totalLp;
    const lpFromB = (b / rB) * totalLp;
    return Math.min(lpFromA, lpFromB).toString();
  }

  /**
   * Calculate optimal amount B for a given amount A
   */
  calculateOptimalAmountB(amountA: string, reserveA: string, reserveB: string): string {
    const a = parseFloat(amountA);
    const rA = this.parseChainAmount(reserveA);
    const rB = this.parseChainAmount(reserveB);
    
    if (rA === 0) return '0';
    return ((a * rB) / rA).toString();
  }

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(
    api: ApiPromise,
    keyPair: KeyringPair,
    poolId: number,
    amountA: string,
    amountB: string,
    minLpTokens: string = '0'
  ): Promise<LiquidityResult> {
    try {
      // Convert human-readable amounts to raw values (12 decimals)
      const rawAmountA = BigInt(Math.floor(parseFloat(amountA) * Math.pow(10, 12))).toString();
      const rawAmountB = BigInt(Math.floor(parseFloat(amountB) * Math.pow(10, 12))).toString();
      const rawMinLp = BigInt(Math.floor(parseFloat(minLpTokens) * Math.pow(10, 12))).toString();
      
      console.log('[Pool] Adding liquidity:', { poolId, rawAmountA, rawAmountB, rawMinLp });
      
      const tx = api.tx.pdex.addLiquidity(poolId, rawAmountA, rawAmountB, rawMinLp);
      
      return new Promise((resolve) => {
        tx.signAndSend(keyPair, ({ status, events, dispatchError }) => {
          if (status.isFinalized) {
            if (dispatchError) {
              if (dispatchError.isModule) {
                const decoded = api.registry.findMetaError(dispatchError.asModule);
                console.error('[Pool] Error:', decoded.name, decoded.docs);
                resolve({ success: false, error: `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}` });
              } else {
                console.error('[Pool] Dispatch error:', dispatchError.toString());
                resolve({ success: false, error: dispatchError.toString() });
              }
            } else {
              // Extract LP tokens received from events
              let lpReceived: string | undefined;
              events.forEach(({ event }) => {
                if (event.section === 'pdex' && event.method === 'LiquidityAdded') {
                  lpReceived = event.data[3]?.toString(); // LP tokens minted
                  console.log('[Pool] LiquidityAdded event:', event.data.toHuman());
                }
              });
              resolve({
                success: true,
                txHash: status.asFinalized.toString(),
                lpTokensReceived: lpReceived,
              });
            }
          }
        }).catch((error) => {
          console.error('[Pool] Transaction error:', error);
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      console.error('[Pool] Add liquidity error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Add liquidity failed' };
    }
  }

  /**
   * Remove liquidity from a pool
   */
  async removeLiquidity(
    api: ApiPromise,
    keyPair: KeyringPair,
    poolId: number,
    lpTokens: string,
    minAmountA: string = '0',
    minAmountB: string = '0'
  ): Promise<LiquidityResult> {
    try {
      const lpBN = BigInt(Math.floor(parseFloat(lpTokens) * Math.pow(10, 12)));
      const minABN = BigInt(Math.floor(parseFloat(minAmountA) * Math.pow(10, 12)));
      const minBBN = BigInt(Math.floor(parseFloat(minAmountB) * Math.pow(10, 12)));
      
      const tx = api.tx.pdex.removeLiquidity(poolId, lpBN.toString(), minABN.toString(), minBBN.toString());
      
      return new Promise((resolve) => {
        tx.signAndSend(keyPair, ({ status, dispatchError }) => {
          if (status.isInBlock || status.isFinalized) {
            if (dispatchError) {
              resolve({ success: false, error: dispatchError.toString() });
            } else {
              resolve({
                success: true,
                txHash: status.asInBlock?.toString() || status.asFinalized?.toString(),
              });
            }
          }
        }).catch((error) => {
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Remove liquidity failed' };
    }
  }

  /**
   * Format amount for display (12 decimals)
   */
  formatAmount(amount: string, displayDecimals: number = 4): string {
    const DECIMALS = 1_000_000_000_000; // 10^12
    // Handle hex strings from chain (u128 values)
    let numValue: number;
    if (amount.startsWith('0x')) {
      numValue = parseInt(amount, 16) / DECIMALS;
    } else {
      numValue = parseFloat(amount) / DECIMALS;
    }
    if (numValue === 0 || isNaN(numValue)) return '0';
    if (numValue < 0.0001) return numValue.toExponential(2);
    return numValue.toLocaleString(undefined, { maximumFractionDigits: displayDecimals });
  }
}

export const poolService = PoolService.getInstance();
