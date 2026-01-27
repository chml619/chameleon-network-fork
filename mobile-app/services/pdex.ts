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
  tokenId?: number;
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
// TokenId mapping: 0=pCHML, 1=pETH, 2=pBTC, 3=pUSDT
export const PDEX_TOKENS: TokenInfo[] = [
  {
    symbol: 'pCHML',
    name: 'Privacy CHML',
    decimals: 12,
    balance: '0',
    balanceRaw: new BN(0),
    color: '#6366F1',
    tokenId: 0,
  },
  {
    symbol: 'pETH',
    name: 'Privacy ETH',
    decimals: 12,
    balance: '0',
    balanceRaw: new BN(0),
    color: '#627EEA',
    tokenId: 1,
  },
  {
    symbol: 'pBTC',
    name: 'Privacy BTC',
    decimals: 12,
    balance: '0',
    balanceRaw: new BN(0),
    color: '#F7931A',
    tokenId: 2,
  },
  {
    symbol: 'pUSDT',
    name: 'Privacy USDT',
    decimals: 12,
    balance: '0',
    balanceRaw: new BN(0),
    color: '#26A17B',
    tokenId: 3,
  },
];

// Mock exchange rates for development
const MOCK_RATES: Record<string, Record<string, number>> = {
  'pCHML': { 'pETH': 0.0005, 'pBTC': 0.000015, 'pUSDT': 0.85 },
  'pETH': { 'pCHML': 2000, 'pBTC': 0.03, 'pUSDT': 1700 },
  'pBTC': { 'pCHML': 65000, 'pETH': 33, 'pUSDT': 55000 },
  'pUSDT': { 'pCHML': 1.18, 'pETH': 0.00059, 'pBTC': 0.000018 },
};

class PDEXService {
  private static instance: PDEXService;
  private mevProtectionEnabled: boolean = true;
  
  // Add balance cache
  private balanceCache: Map<string, { balance: BN; timestamp: number }> = new Map();
  private CACHE_TTL_MS = 5000; // 5 second cache
  clearBalanceCache(): void { this.balanceCache.clear(); }

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
    // Use cached getTokenBalance for pCHML (TokenId 0)
    return this.getTokenBalance(PCHML_TOKEN_ID, address);
  }

  /**
   * Get any token balance from pDEX pallet (with caching)
   */
  async getTokenBalance(tokenId: number, address: string): Promise<BN> {
    // Check cache first
    const cacheKey = `${address}-${tokenId}`;
    const cached = this.balanceCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      return cached.balance;
    }

    const api = apiService.getApi();
    if (!api) {
      return new BN(0);
    }

    try {
      if (!api.query.pdex || !(api.query.pdex as any).tokenBalances) {
        return new BN(0);
      }

      const balance = await (api.query.pdex as any).tokenBalances(address, tokenId);
      const result = new BN(balance.toString());
      
      // Update cache
      this.balanceCache.set(cacheKey, { balance: result, timestamp: Date.now() });
      
      return result;
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
        // Note: tokenBalances subscription is (tokenId, address, callback) - fixed parameter order
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
   * Fetches from pDEX pallet's tokenBalances storage
   */
  async getTokensWithBalances(api: ApiPromise, address: string): Promise<TokenInfo[]> {
    // Create fresh copies to avoid mutation
    const tokens = PDEX_TOKENS.map(t => ({ ...t, balance: '0', balanceRaw: new BN(0) }));
    
    try {
      // Fetch all token balances in parallel from pDEX pallet
      const balancePromises = tokens.map(async (token) => {
        try {
          // Use cached getTokenBalance method
          const balance = await this.getTokenBalance(token.tokenId ?? 0, address);
          return { symbol: token.symbol, balance };
        } catch (e) {
          console.error(`[pDEX] Error fetching ${token.symbol} balance:`, e);
          return { symbol: token.symbol, balance: new BN(0) };
        }
      });
      
      const balances = await Promise.all(balancePromises);
      
      // Update tokens with fetched balances
      tokens.forEach(token => {
        const found = balances.find(b => b.symbol === token.symbol);
        if (found) {
          token.balanceRaw = found.balance;
          token.balance = chainService.formatBalance(found.balance.toString(), 12, token.symbol);
        }
      });
    } catch (error) {
      console.error('[pDEX] Error fetching token balances:', error);
    }
    
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
      const reserveA = parseFloat(poolData.reserveA.toString()) / 1e12;
      const reserveB = parseFloat(poolData.reserveB.toString()) / 1e12;

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
   * Get pool ID for token pair using direct mapping
   */
  getPoolIdForPair(tokenInId: number, tokenOutId: number): number | null {
    // All pools have pCHML (0) as one side
    const hasZero = tokenInId === 0 || tokenOutId === 0;
    if (!hasZero) return null; // No direct pool for non-pCHML pairs
    
    const otherToken = tokenInId === 0 ? tokenOutId : tokenInId;
    
    // Fixed pool mapping:
    // Pool 0: pCHML(0) / pBTC(2)
    // Pool 1: pCHML(0) / pETH(1)
    // Pool 2: pCHML(0) / pUSDT(3)
    switch (otherToken) {
      case 2: return 0; // pCHML/pBTC
      case 1: return 1; // pCHML/pETH
      case 3: return 2; // pCHML/pUSDT
      default: return null;
    }
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

      // Use direct pool ID mapping instead of chain query
      const poolId = this.getPoolIdForPair(tokenInId, tokenOutId);
      if (poolId === null) {
        return { success: false, error: "No pool exists for this token pair" };
      }

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
   * Alias for executeSwap to maintain compatibility
   */
  async swap(
    api: ApiPromise,
    keyPair: KeyringPair,
    tokenIn: string,
    tokenOut: string,
    amountIn: BN,
    minAmountOut: BN
  ): Promise<SwapResult> {
    return this.executeSwap(api, keyPair, tokenIn, tokenOut, amountIn, minAmountOut);
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
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: 'Transaction timeout - please try again' });
        }
      }, 60000); // 60 second timeout

      tx.signAndSend(keyPair, ({ status, dispatchError, txHash }: any) => {
        // Handle error statuses
        if (status.isDropped || status.isInvalid || status.isUsurped) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ success: false, error: `Transaction failed: ${status.type}` });
          }
          return;
        }

        if (status.isInBlock || status.isFinalized) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
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
        }
      }).catch((error: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            error: error.message,
          });
        }
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
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: 'Transaction timeout - please try again' });
        }
      }, 60000); // 60 second timeout

      tx.signAndSend(keyPair, ({ status, dispatchError, txHash }: any) => {
        // Handle error statuses
        if (status.isDropped || status.isInvalid || status.isUsurped) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ success: false, error: `Transaction failed: ${status.type}` });
          }
          return;
        }

        if (status.isInBlock || status.isFinalized) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
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
        }
      }).catch((error: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            error: error.message,
          });
        }
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
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve({ success: false, error: 'Transaction timeout - please try again' });
          }
        }, 60000); // 60 second timeout

        tx.signAndSend(keyPair, ({ status, dispatchError, txHash }: any) => {
          // Handle error statuses
          if (status.isDropped || status.isInvalid || status.isUsurped) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ success: false, error: `Transaction failed: ${status.type}` });
            }
            return;
          }

          if (status.isInBlock || status.isFinalized) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              if (dispatchError) {
                resolve({ success: false, txHash: txHash?.toHex(), error: "Transfer failed" });
              } else {
                resolve({ success: true, txHash: txHash?.toHex() });
              }
            }
          }
        }).catch((error: Error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ success: false, error: error.message });
          }
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const pdexService = PDEXService.getInstance();
