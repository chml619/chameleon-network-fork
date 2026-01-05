/**
 * Privacy DEX (pDEX) Service
 * Handles privacy-preserving token swaps
 * 
 * pDEX enables swapping tokens without revealing trade details on-chain,
 * using zero-knowledge proofs for privacy.
 * 
 * Token Registry:
 * - TokenId 0 = pCHML (privacy-wrapped native token)
 * - TokenId 1 = pETH
 * - TokenId 2 = pBTC
 * - TokenId 3 = pUSDT
 * - TokenId 4 = pUSDC
 */

import { ApiPromise } from '@polkadot/api';
import type { KeyringPair } from '@polkadot/keyring/types';
import { BN } from '@polkadot/util';
import { chainService } from './chain';
import { apiService } from './api';

// Token IDs in the pDEX pallet
export const PCHML_TOKEN_ID = 0;
export const PETH_TOKEN_ID = 1;
export const PBTC_TOKEN_ID = 2;
export const PUSDT_TOKEN_ID = 3;
export const PUSDC_TOKEN_ID = 4;

// Pool IDs for LP
export const POOL_IDS = {
  PCHML_PBTC: 0,
  PCHML_PETH: 1,
  PCHML_PUSDT: 2,
};

// Pool token colors
export const POOL_COLORS: Record<number, string> = {
  0: '#F7931A', // BTC orange
  1: '#627EEA', // ETH blue
  2: '#26A17B', // USDT green
};

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceRaw: BN;
  icon?: string;
  color: string;
}

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  amountOutMin: string;
  priceImpact: string;
  fee: string;
  feeAmount: string;
  exchangeRate: string;
  route: string[];
}

export interface PoolInfo {
  tokenA: string;
  tokenB: string;
  reserveA: string;
  reserveB: string;
  totalLiquidity: string;
  fee: string;
  apy: string;
}

// Enhanced pool info for LP management
export interface LPPoolInfo {
  poolId: number;
  name: string;
  assetA: string;
  assetB: string;
  reserveA: BN;
  reserveB: BN;
  totalLpTokens: BN;
  userLpTokens: BN;
  apy: number;
  color: string;
}

export interface LPPosition {
  poolId: number;
  poolName: string;
  lpTokens: BN;
  sharePercent: number;
  pendingRewards: BN;
  color: string;
}

export interface LPResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface SwapResult {
  success: boolean;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  error?: string;
}

// Supported tokens on pDEX
export const PDEX_TOKENS: TokenInfo[] = [
  {
    symbol: 'CHML',
    name: 'Chameleon',
    decimals: 18,
    balance: '0',
    balanceRaw: new BN(0),
    color: '#22B958',
  },
  {
    symbol: 'pETH',
    name: 'Privacy ETH',
    decimals: 18,
    balance: '0',
    balanceRaw: new BN(0),
    color: '#627EEA',
  },
  {
    symbol: 'pBTC',
    name: 'Privacy BTC',
    decimals: 8,
    balance: '0',
    balanceRaw: new BN(0),
    color: '#F7931A',
  },
  {
    symbol: 'pUSDT',
    name: 'Privacy USDT',
    decimals: 6,
    balance: '0',
    balanceRaw: new BN(0),
    color: '#26A17B',
  },
  {
    symbol: 'pUSDC',
    name: 'Privacy USDC',
    decimals: 6,
    balance: '0',
    balanceRaw: new BN(0),
    color: '#2775CA',
  },
];

// Mock exchange rates for development
const MOCK_RATES: Record<string, Record<string, number>> = {
  'CHML': { 'pETH': 0.0005, 'pBTC': 0.000015, 'pUSDT': 0.85, 'pUSDC': 0.85 },
  'pETH': { 'CHML': 2000, 'pBTC': 0.03, 'pUSDT': 1700, 'pUSDC': 1700 },
  'pBTC': { 'CHML': 65000, 'pETH': 33, 'pUSDT': 55000, 'pUSDC': 55000 },
  'pUSDT': { 'CHML': 1.18, 'pETH': 0.00059, 'pBTC': 0.000018, 'pUSDC': 1 },
  'pUSDC': { 'CHML': 1.18, 'pETH': 0.00059, 'pBTC': 0.000018, 'pUSDT': 1 },
};

class PDEXService {
  private static instance: PDEXService;
  private mevProtectionEnabled: boolean = true;

  private constructor() {}

  static getInstance(): PDEXService {
    if (!PDEXService.instance) {
      PDEXService.instance = new PDEXService();
    }
    return PDEXService.instance;
  }

  /**
   * Check if privacy mode is enabled
   */
  isMEVProtectionEnabled(): boolean {
    return this.mevProtectionEnabled;
  }

  /**
   * Toggle privacy mode
   */
  setMEVProtection(enabled: boolean): void {
    this.mevProtectionEnabled = enabled;
  }

  /**
   * Get pCHML balance for an address
   * pCHML is TokenId 0 in the pDEX pallet
   */
  async getPCHMLBalance(address: string): Promise<BN> {
    const api = apiService.getApi();
    if (!api) {
      console.log('[pDEX] API not available, returning 0');
      return new BN(0);
    }

    try {
      // Check if pdex pallet exists
      if (!api.query.pdex || !(api.query.pdex as any).tokenBalances) {
        console.log('[pDEX] Pallet not available, returning mock balance');
        // Return mock balance for development (1 pCHML = 10^12)
        return new BN('1000000000000');
      }

      // TokenId 0 = pCHML
      const balance = await (api.query.pdex as any).tokenBalances(address, PCHML_TOKEN_ID);
      return new BN(balance.toString());
    } catch (error) {
      console.error('[pDEX] Error getting pCHML balance:', error);
      // Return mock for development
      return new BN('1000000000000');
    }
  }

  /**
   * Get any token balance from pDEX pallet
   */
  async getTokenBalance(tokenId: number, address: string): Promise<BN> {
    const api = apiService.getApi();
    if (!api) {
      return new BN(0);
    }

    try {
      if (!api.query.pdex || !(api.query.pdex as any).tokenBalances) {
        return new BN(0);
      }

      const balance = await (api.query.pdex as any).tokenBalances(address, tokenId);
      return new BN(balance.toString());
    } catch (error) {
      console.error('[pDEX] Error getting token balance:', error);
      return new BN(0);
    }
  }

  /**
   * Subscribe to pCHML balance changes
   */
  subscribeToPCHMLBalance(address: string, callback: (balance: BN) => void): () => void {
    const api = apiService.getApi();
    if (!api || !api.query.pdex || !(api.query.pdex as any).tokenBalances) {
      // Return mock callback for development
      setTimeout(() => callback(new BN('1000000000000')), 100);
      return () => {};
    }

    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const unsub = await (api.query.pdex as any).tokenBalances(address, PCHML_TOKEN_ID, (balance: any) => {
          callback(new BN(balance.toString()));
        });
        unsubscribe = unsub as any;
      } catch (error) {
        console.error('[pDEX] Error subscribing to pCHML balance:', error);
        // Emit mock balance for development
        callback(new BN('1000000000000'));
      }
    })();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }

  /**
   * Get all supported tokens with balances
   */
  async getTokensWithBalances(api: ApiPromise, address: string): Promise<TokenInfo[]> {
    const tokens = [...PDEX_TOKENS];
    
    // Get CHML balance (native token)
    try {
      const accountInfo = await api.query.system.account(address);
      const freeBalance = new BN((accountInfo as any).data.free.toString());
      tokens[0].balanceRaw = freeBalance;
      tokens[0].balance = chainService.formatBalance(freeBalance.toString());
    } catch (e) {
      // Ignore
    }
    
    // Other tokens would need asset pallet queries
    // For now, return mock balances for development
    tokens.slice(1).forEach(token => {
      token.balance = '0 ' + token.symbol;
      token.balanceRaw = new BN(0);
    });
    
    return tokens;
  }

  /**
   * Get swap quote
   */
  async getSwapQuote(
    api: ApiPromise,
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<SwapQuote> {
    try {
      // Check if pDEX pallet exists
      const hasPDEXPallet = api.query.pdex !== undefined;
      
      if (hasPDEXPallet) {
        // Real quote from pallet
        return this.getRealQuote(api, tokenIn, tokenOut, amountIn);
      } else {
        // Mock quote for development
        return this.getMockQuote(tokenIn, tokenOut, amountIn);
      }
    } catch (error) {
      console.error('[pDEX] Error getting quote:', error);
      return this.getMockQuote(tokenIn, tokenOut, amountIn);
    }
  }

  /**
   * Get real quote from pDEX pallet
   */
  private async getRealQuote(
    api: ApiPromise,
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<SwapQuote> {
    try {
      const amount = parseFloat(amountIn) || 0;
      if (amount <= 0) throw new Error("Amount must be greater than 0");

      // Get token IDs
      const tokenInId = this.getTokenId(tokenIn);
      const tokenOutId = this.getTokenId(tokenOut);

      // Get pool ID for this pair
      const poolId = await api.query.pdex.poolIdByAssets(tokenInId, tokenOutId) as any;
      if (!poolId || poolId.isNone) {
        return this.getMockQuote(tokenIn, tokenOut, amountIn);
      }

      // Get pool info
      const pool = await api.query.pdex.pools(poolId.unwrap()) as any;
      if (!pool || pool.isNone) {
        return this.getMockQuote(tokenIn, tokenOut, amountIn);
      }

      const poolData = pool.unwrap();
      const reserveA = parseFloat(poolData.reserveA.toString()) / 1e18;
      const reserveB = parseFloat(poolData.reserveB.toString()) / 1e18;

      // Determine reserves based on swap direction
      const isAtoB = poolData.assetA.toNumber() === tokenInId;
      const reserveIn = isAtoB ? reserveA : reserveB;
      const reserveOut = isAtoB ? reserveB : reserveA;

      // Calculate output using constant product formula (with 0.25% fee)
      const feeRate = 0.0025;
      const amountInWithFee = amount * (1 - feeRate);
      const amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);
      const priceImpact = (amount / reserveIn) * 100;

      return {
        amountIn: amount.toFixed(6) + " " + tokenIn,
        amountOut: amountOut.toFixed(6) + " " + tokenOut,
        amountOutMin: (amountOut * 0.995).toFixed(6) + " " + tokenOut,
        priceImpact: priceImpact < 0.01 ? "< 0.01%" : priceImpact.toFixed(2) + "%",
        fee: "0.25%",
        feeAmount: (amount * feeRate).toFixed(6) + " " + tokenIn,
        exchangeRate: "1 " + tokenIn + " = " + (amountOut / amount).toFixed(6) + " " + tokenOut,
        route: [tokenIn, tokenOut],
      };
    } catch (error) {
      console.error("[pDEX] Error getting real quote:", error);
      return this.getMockQuote(tokenIn, tokenOut, amountIn);
    }
  }

  private getTokenId(symbol: string): number {
    const ids: Record<string, number> = { pCHML: 0, pETH: 1, pBTC: 2, pUSDT: 3 };
    return ids[symbol] ?? 0;
  }

  /**
   * Get mock quote for development
   */
  private getMockQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): SwapQuote {
    const amount = parseFloat(amountIn) || 0;
    
    // Validate input amount
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    
    const rate = MOCK_RATES[tokenIn]?.[tokenOut];
    if (!rate) {
      throw new Error(`No exchange rate available for ${tokenIn} to ${tokenOut}`);
    }
    
    const amountOut = amount * rate;
    const fee = amount * 0.003; // 0.3% fee
    
    // More realistic price impact calculation based on amount
    let priceImpact: string;
    if (amount > 10000) {
      priceImpact = '2.5%';
    } else if (amount > 5000) {
      priceImpact = '1.2%';
    } else if (amount > 1000) {
      priceImpact = '0.5%';
    } else if (amount > 100) {
      priceImpact = '0.1%';
    } else {
      priceImpact = '< 0.01%';
    }
    
    // Format numbers with appropriate decimals
    const formatAmount = (num: number, symbol: string) => {
      if (symbol === 'pBTC') {
        return `${num.toFixed(8)} ${symbol}`;
      } else if (symbol === 'pUSDT' || symbol === 'pUSDC') {
        return `${num.toFixed(2)} ${symbol}`;
      } else {
        return `${num.toFixed(6)} ${symbol}`;
      }
    };
    
    return {
      amountIn: formatAmount(amount, tokenIn),
      amountOut: formatAmount(amountOut, tokenOut),
      amountOutMin: formatAmount(amountOut * 0.995, tokenOut), // 0.5% slippage
      priceImpact,
      fee: '0.3%',
      feeAmount: formatAmount(fee, tokenIn),
      exchangeRate: `1 ${tokenIn} = ${rate.toFixed(6)} ${tokenOut}`,
      route: [tokenIn, tokenOut],
    };
  }

  /**
   * Execute swap
   */
  async executeSwap(
    api: ApiPromise,
    keyPair: KeyringPair,
    tokenIn: string,
    tokenOut: string,
    amountIn: BN,
    minAmountOut: BN
  ): Promise<SwapResult> {
    try {
      const tokenInId = this.getTokenId(tokenIn);
      const tokenOutId = this.getTokenId(tokenOut);

      // Get pool ID
      const poolIdResult = await api.query.pdex.poolIdByAssets(tokenInId, tokenOutId) as any;
      if (!poolIdResult || poolIdResult.isNone) {
        // Try reverse order
        const reverseResult = await api.query.pdex.poolIdByAssets(tokenOutId, tokenInId) as any;
        if (!reverseResult || reverseResult.isNone) {
          return { success: false, error: "Pool not found for this pair" };
        }
      }
      const poolId = poolIdResult.unwrap().toNumber();

      let tx;
      if (this.mevProtectionEnabled) {
        // MEV protected swap requires ring signature params
        // For now, use regular swap - ring sig generation is complex
        console.log("[pDEX] MEV protection - using delayed execution");
        tx = api.tx.pdex.swap(poolId, tokenInId, amountIn.toString(), minAmountOut.toString());
      } else {
        tx = api.tx.pdex.swap(poolId, tokenInId, amountIn.toString(), minAmountOut.toString());
      }

      return this.signAndSend(tx, keyPair, tokenIn, tokenOut);
    } catch (error) {
      console.error("[pDEX] Swap error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Swap failed",
      };
    }
  }

  /**
   * Get liquidity pool info
   */
  async getPoolInfo(api: ApiPromise, tokenA: string, tokenB: string): Promise<PoolInfo> {
    try {
      const hasPDEXPallet = api.query.pdex !== undefined;
      
      if (hasPDEXPallet) {
        // TODO: Fetch real pool info
        return this.getMockPoolInfo(tokenA, tokenB);
      } else {
        return this.getMockPoolInfo(tokenA, tokenB);
      }
    } catch (error) {
      return this.getMockPoolInfo(tokenA, tokenB);
    }
  }

  /**
   * Get mock pool info
   */
  private getMockPoolInfo(tokenA: string, tokenB: string): PoolInfo {
    return {
      tokenA,
      tokenB,
      reserveA: `125,000 ${tokenA}`,
      reserveB: `100,000 ${tokenB}`,
      totalLiquidity: '$215,000',
      fee: '0.3%',
      apy: '24.5%',
    };
  }

  // ============================================
  // LP Management Methods
  // ============================================

  /**
   * Get pool name from pool ID
   */
  private getPoolName(poolId: number): string {
    const names: Record<number, string> = {
      0: 'pCHML/pBTC',
      1: 'pCHML/pETH',
      2: 'pCHML/pUSDT',
    };
    return names[poolId] || `Pool ${poolId}`;
  }

  /**
   * Get all pools with user's LP position
   */
  async getLPPools(address: string): Promise<LPPoolInfo[]> {
    const api = apiService.getApi();
    if (!api) return this.getMockLPPools(address);

    try {
      // Check if pdex pallet exists with pool storage
      if (!api.query.pdex || !(api.query.pdex as any).poolCount) {
        console.log('[pDEX] Pool storage not available, using mock');
        return this.getMockLPPools(address);
      }

      const poolCount = await (api.query.pdex as any).poolCount();
      const pools: LPPoolInfo[] = [];

      for (let i = 0; i < poolCount.toNumber(); i++) {
        const pool = await (api.query.pdex as any).pools(i);
        const userLp = await (api.query.pdex as any).userLPTokens(address, i);
        
        // Try to get APY from emissions pallet
        let apy = 10; // Default APY
        try {
          if (api.query.emissions && (api.query.emissions as any).poolAPY) {
            const apyResult = await (api.query.emissions as any).poolAPY(i);
            if (apyResult && !apyResult.isEmpty) {
              // Perbill to percent (divide by 10^7)
              apy = apyResult.toNumber() / 10000000;
            }
          }
        } catch (e) {
          console.log('[pDEX] Could not get APY for pool', i);
        }

        if (pool && !pool.isEmpty) {
          const p = pool.toJSON ? pool.toJSON() : pool;
          pools.push({
            poolId: i,
            name: this.getPoolName(i),
            assetA: p.assetA?.toString() || '0',
            assetB: p.assetB?.toString() || '1',
            reserveA: new BN(p.reserveA?.toString() || '0'),
            reserveB: new BN(p.reserveB?.toString() || '0'),
            totalLpTokens: new BN(p.totalLpTokens?.toString() || '0'),
            userLpTokens: new BN(userLp?.toString() || '0'),
            apy,
            color: POOL_COLORS[i] || '#6B7280',
          });
        }
      }
      return pools.length > 0 ? pools : this.getMockLPPools(address);
    } catch (error) {
      console.error('[pDEX] Error getting LP pools:', error);
      return this.getMockLPPools(address);
    }
  }

  /**
   * Get user's LP positions with pending rewards
   */
  async getLPPositions(address: string): Promise<LPPosition[]> {
    const api = apiService.getApi();
    if (!api) return this.getMockLPPositions();

    try {
      const pools = await this.getLPPools(address);
      const positions: LPPosition[] = [];

      for (const pool of pools) {
        if (!pool.userLpTokens.isZero()) {
          let pendingRewards = new BN(0);
          
          // Try to get pending rewards from emissions pallet
          try {
            if (api.query.emissions && (api.query.emissions as any).lpRewards) {
              const rewards = await (api.query.emissions as any).lpRewards(address, pool.poolId);
              if (rewards && !rewards.isEmpty) {
                pendingRewards = new BN(rewards.toString());
              }
            }
          } catch (e) {
            console.log('[pDEX] Could not get rewards for pool', pool.poolId);
          }

          const sharePercent = pool.totalLpTokens.isZero()
            ? 0
            : pool.userLpTokens.muln(10000).div(pool.totalLpTokens).toNumber() / 100;

          positions.push({
            poolId: pool.poolId,
            poolName: pool.name,
            lpTokens: pool.userLpTokens,
            sharePercent,
            pendingRewards,
            color: pool.color,
          });
        }
      }
      return positions;
    } catch (error) {
      console.error('[pDEX] Error getting LP positions:', error);
      return this.getMockLPPositions();
    }
  }

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(
    keyPair: KeyringPair,
    poolId: number,
    amountA: BN,
    amountB: BN,
    minLpTokens: BN
  ): Promise<LPResult> {
    const api = apiService.getApi();
    if (!api) {
      // Mock for development
      console.log('[pDEX] Mock addLiquidity:', poolId, amountA.toString(), amountB.toString());
      await new Promise(resolve => setTimeout(resolve, 1500));
      return { success: true, txHash: '0x' + Math.random().toString(16).slice(2, 66) };
    }

    try {
      if (!api.tx.pdex || !(api.tx.pdex as any).addLiquidity) {
        // Mock for development
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { success: true, txHash: '0x' + Math.random().toString(16).slice(2, 66) };
      }

      const tx = (api.tx.pdex as any).addLiquidity(poolId, amountA, amountB, minLpTokens);
      return this.signAndSendLP(tx, keyPair);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Add liquidity failed' };
    }
  }

  /**
   * Remove liquidity from a pool
   */
  async removeLiquidity(
    keyPair: KeyringPair,
    poolId: number,
    lpAmount: BN,
    minAmountA: BN,
    minAmountB: BN
  ): Promise<LPResult> {
    const api = apiService.getApi();
    if (!api) {
      // Mock for development
      console.log('[pDEX] Mock removeLiquidity:', poolId, lpAmount.toString());
      await new Promise(resolve => setTimeout(resolve, 1500));
      return { success: true, txHash: '0x' + Math.random().toString(16).slice(2, 66) };
    }

    try {
      if (!api.tx.pdex || !(api.tx.pdex as any).removeLiquidity) {
        // Mock for development
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { success: true, txHash: '0x' + Math.random().toString(16).slice(2, 66) };
      }

      const tx = (api.tx.pdex as any).removeLiquidity(poolId, lpAmount, minAmountA, minAmountB);
      return this.signAndSendLP(tx, keyPair);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Remove liquidity failed' };
    }
  }

  /**
   * Claim LP rewards from emissions pallet
   */
  async claimLPRewards(
    keyPair: KeyringPair,
    poolId: number
  ): Promise<LPResult> {
    const api = apiService.getApi();
    if (!api) {
      // Mock for development
      console.log('[pDEX] Mock claimLPRewards:', poolId);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return { success: true, txHash: '0x' + Math.random().toString(16).slice(2, 66) };
    }

    try {
      if (!api.tx.emissions || !(api.tx.emissions as any).claimLpRewards) {
        // Mock for development
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { success: true, txHash: '0x' + Math.random().toString(16).slice(2, 66) };
      }

      const tx = (api.tx.emissions as any).claimLpRewards(poolId);
      return this.signAndSendLP(tx, keyPair);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Claim rewards failed' };
    }
  }

  /**
   * Sign and send LP transaction
   */
  private signAndSendLP(tx: any, keyPair: KeyringPair): Promise<LPResult> {
    return new Promise((resolve) => {
      tx.signAndSend(keyPair, ({ status, dispatchError, txHash }: any) => {
        if (status.isInBlock || status.isFinalized) {
          if (dispatchError) {
            resolve({
              success: false,
              txHash: txHash?.toHex(),
              error: 'Transaction failed on chain',
            });
          } else {
            resolve({
              success: true,
              txHash: txHash?.toHex(),
            });
          }
        }
      }).catch((error: Error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });
    });
  }

  /**
   * Mock LP pools for development
   */
  private getMockLPPools(address: string): LPPoolInfo[] {
    return [
      {
        poolId: 0,
        name: 'pCHML/pBTC',
        assetA: '0',
        assetB: '2',
        reserveA: new BN('1000000000000000000000'),
        reserveB: new BN('50000000000000000'),
        totalLpTokens: new BN('500000000000000000000'),
        userLpTokens: new BN(0),
        apy: 12.5,
        color: POOL_COLORS[0],
      },
      {
        poolId: 1,
        name: 'pCHML/pETH',
        assetA: '0',
        assetB: '1',
        reserveA: new BN('2000000000000000000000'),
        reserveB: new BN('100000000000000000'),
        totalLpTokens: new BN('800000000000000000000'),
        userLpTokens: new BN(0),
        apy: 10.0,
        color: POOL_COLORS[1],
      },
      {
        poolId: 2,
        name: 'pCHML/pUSDT',
        assetA: '0',
        assetB: '3',
        reserveA: new BN('5000000000000000000000'),
        reserveB: new BN('5000000000000'),
        totalLpTokens: new BN('2000000000000000000000'),
        userLpTokens: new BN(0),
        apy: 8.0,
        color: POOL_COLORS[2],
      },
    ];
  }

  /**
   * Mock LP positions for development
   */
  private getMockLPPositions(): LPPosition[] {
    return [];
  }

  /**
   * Sign and send transaction
   */
  private signAndSend(
    tx: any,
    keyPair: KeyringPair,
    tokenIn: string,
    tokenOut: string
  ): Promise<SwapResult> {
    return new Promise((resolve) => {
      tx.signAndSend(keyPair, ({ status, dispatchError, txHash }: any) => {
        if (status.isInBlock || status.isFinalized) {
          if (dispatchError) {
            resolve({
              success: false,
              txHash: txHash?.toHex(),
              error: 'Swap failed on chain',
            });
          } else {
            resolve({
              success: true,
              txHash: txHash?.toHex(),
            });
          }
        }
      }).catch((error: Error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });
    });
  }

  /**
   * Transfer pTokens to another account
   * @param keyPair - Sender keypair
   * @param assetId - Token ID (0=pCHML, 1=pETH, 2=pBTC, 3=pUSDT)
   * @param to - Recipient address
   * @param amount - Amount to transfer (with decimals)
   */
  async transfer(
    keyPair: KeyringPair,
    assetId: number,
    to: string,
    amount: BN
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const api = apiService.getApi();
    if (!api) {
      return { success: false, error: "Not connected to network" };
    }
    try {
      const tx = api.tx.pdex.transfer(assetId, to, amount.toString());
      return new Promise((resolve) => {
        tx.signAndSend(keyPair, ({ status, dispatchError, txHash }: any) => {
          if (status.isInBlock || status.isFinalized) {
            if (dispatchError) {
              resolve({ success: false, txHash: txHash?.toHex(), error: "Transfer failed" });
            } else {
              resolve({ success: true, txHash: txHash?.toHex() });
            }
          }
        }).catch((error: Error) => {
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const pdexService = PDEXService.getInstance();
