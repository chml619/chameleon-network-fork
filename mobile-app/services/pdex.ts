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
  private privacyModeEnabled: boolean = true;

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
  isPrivacyModeEnabled(): boolean {
    return this.privacyModeEnabled;
  }

  /**
   * Toggle privacy mode
   */
  setPrivacyMode(enabled: boolean): void {
    this.privacyModeEnabled = enabled;
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
      const balance = await (api.query.pdex as any).tokenBalances(PCHML_TOKEN_ID, address);
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

      const balance = await (api.query.pdex as any).tokenBalances(tokenId, address);
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
        const unsub = await (api.query.pdex as any).tokenBalances(PCHML_TOKEN_ID, address, (balance: any) => {
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
    // TODO: Implement when pallet is deployed
    return this.getMockQuote(tokenIn, tokenOut, amountIn);
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
      const hasPDEXPallet = api.tx.pdex !== undefined;
      
      if (hasPDEXPallet) {
        const tx = this.privacyModeEnabled
          ? api.tx.pdex.swapPrivate(tokenIn, tokenOut, amountIn, minAmountOut)
          : api.tx.pdex.swap(tokenIn, tokenOut, amountIn, minAmountOut);
        
        return this.signAndSend(tx, keyPair, tokenIn, tokenOut);
      } else {
        // Mock swap for development
        console.log('[pDEX] Pallet not deployed, using mock');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return {
          success: true,
          txHash: '0x' + Math.random().toString(16).slice(2, 66),
          amountIn: amountIn.toString(),
          amountOut: minAmountOut.toString(),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Swap failed',
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
}

export const pdexService = PDEXService.getInstance();
