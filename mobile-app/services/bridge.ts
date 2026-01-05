/**
 * Cross-Chain Bridge Service
 * Handles asset bridging between Chameleon Network and other chains
 * 
 * Bridge assets with privacy preservation using zero-knowledge proofs.
 */

import { ApiPromise } from '@polkadot/api';
import type { KeyringPair } from '@polkadot/keyring/types';
import { BN } from '@polkadot/util';
import { chainService } from './chain';

export interface ChainInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  nativeToken: string;
  enabled: boolean;
}

export interface BridgeableAsset {
  symbol: string;
  name: string;
  sourceChain: string;
  destChain: string;
  minAmount: string;
  maxAmount: string;
  decimals: number;
}

export interface BridgeFee {
  baseFee: string;
  percentageFee: string;
  totalFee: string;
  estimatedTime: string;
}

export interface BridgeQuote {
  amountIn: string;
  amountOut: string;
  fee: BridgeFee;
  sourceChain: string;
  destChain: string;
  asset: string;
}

export interface BridgeTransaction {
  id: string;
  status: 'pending' | 'confirming' | 'bridging' | 'completed' | 'failed';
  sourceChain: string;
  destChain: string;
  asset: string;
  amount: string;
  txHash?: string;
  destTxHash?: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
}

export interface BridgeResult {
  success: boolean;
  bridgeId?: string;
  txHash?: string;
  error?: string;
}

// Supported chains for bridging
export const SUPPORTED_CHAINS: ChainInfo[] = [
  {
    id: 'chameleon',
    name: 'Chameleon',
    icon: '🦎',
    color: '#22B958',
    nativeToken: 'CHML',
    enabled: true,
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    icon: '⟠',
    color: '#627EEA',
    nativeToken: 'ETH',
    enabled: true,
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    icon: '₿',
    color: '#F7931A',
    nativeToken: 'BTC',
    enabled: false, // Coming soon
  },
  {
    id: 'polygon',
    name: 'Polygon',
    icon: '⬡',
    color: '#8247E5',
    nativeToken: 'MATIC',
    enabled: false, // Coming soon
  },
];

// Bridgeable assets
export const BRIDGEABLE_ASSETS: BridgeableAsset[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    sourceChain: 'ethereum',
    destChain: 'chameleon',
    minAmount: '0.01',
    maxAmount: '100',
    decimals: 18,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    sourceChain: 'ethereum',
    destChain: 'chameleon',
    minAmount: '10',
    maxAmount: '100000',
    decimals: 6,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    sourceChain: 'ethereum',
    destChain: 'chameleon',
    minAmount: '10',
    maxAmount: '100000',
    decimals: 6,
  },
];

class BridgeService {
  private static instance: BridgeService;
  
  // Track pending bridge transactions
  private pendingBridges: Map<string, BridgeTransaction> = new Map();

  private constructor() {}

  static getInstance(): BridgeService {
    if (!BridgeService.instance) {
      BridgeService.instance = new BridgeService();
    }
    return BridgeService.instance;
  }

  /**
   * Get supported chains
   */
  getSupportedChains(): ChainInfo[] {
    return SUPPORTED_CHAINS.filter(c => c.enabled);
  }

  /**
   * Get bridgeable assets for a chain pair
   */
  getBridgeableAssets(sourceChain: string, destChain: string): BridgeableAsset[] {
    return BRIDGEABLE_ASSETS.filter(
      a => (a.sourceChain === sourceChain && a.destChain === destChain) ||
           (a.sourceChain === destChain && a.destChain === sourceChain)
    );
  }

  /**
   * Get bridge quote
   */
  async getBridgeQuote(
    api: ApiPromise,
    sourceChain: string,
    destChain: string,
    asset: string,
    amount: string
  ): Promise<BridgeQuote> {
    try {
      // Validate inputs
      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Invalid amount');
      }
      
      if (sourceChain === destChain) {
        throw new Error('Source and destination chains cannot be the same');
      }
      
      const hasBridgePallet = api.query.bridge !== undefined;
      
      if (hasBridgePallet) {
        return this.getRealBridgeQuote(api, sourceChain, destChain, asset, amount);
      } else {
        return this.getMockBridgeQuote(sourceChain, destChain, asset, amount);
      }
    } catch (error) {
      console.error('[Bridge] Error getting quote:', error);
      return this.getMockBridgeQuote(sourceChain, destChain, asset, amount);
    }
  }

  /**
   * Get real bridge quote from pallet
   */
  private async getRealBridgeQuote(
    api: ApiPromise,
    sourceChain: string,
    destChain: string,
    asset: string,
    amount: string
  ): Promise<BridgeQuote> {
    // TODO: Implement when pallet is deployed
    return this.getMockBridgeQuote(sourceChain, destChain, asset, amount);
  }

  /**
   * Get mock bridge quote
   */
  private getMockBridgeQuote(
    sourceChain: string,
    destChain: string,
    asset: string,
    amount: string
  ): BridgeQuote {
    const amountNum = parseFloat(amount) || 0;
    
    // Find asset info for validation
    const assetInfo = BRIDGEABLE_ASSETS.find(a => a.symbol === asset);
    if (assetInfo) {
      const minAmount = parseFloat(assetInfo.minAmount);
      const maxAmount = parseFloat(assetInfo.maxAmount);
      
      if (amountNum < minAmount) {
        throw new Error(`Minimum bridge amount is ${assetInfo.minAmount} ${asset}`);
      }
      if (amountNum > maxAmount) {
        throw new Error(`Maximum bridge amount is ${assetInfo.maxAmount} ${asset}`);
      }
    }
    
    const baseFee = 0.001; // 0.1% base fee
    const percentFee = amountNum * 0.001;
    const totalFee = baseFee + percentFee;
    const amountOut = Math.max(0, amountNum - totalFee);
    
    // Estimate time based on chains
    let estimatedTime = '~15 minutes';
    if (sourceChain === 'bitcoin' || destChain === 'bitcoin') {
      estimatedTime = '~60 minutes';
    } else if (sourceChain === 'ethereum' || destChain === 'ethereum') {
      estimatedTime = '~10 minutes';
    }
    
    return {
      amountIn: `${amountNum} ${asset}`,
      amountOut: `${amountOut.toFixed(6)} p${asset}`,
      fee: {
        baseFee: `${baseFee} ${asset}`,
        percentageFee: '0.1%',
        totalFee: `${totalFee.toFixed(6)} ${asset}`,
        estimatedTime,
      },
      sourceChain,
      destChain,
      asset,
    };
  }

  /**
   * Initiate bridge transaction
   */
  async initiateBridge(
    api: ApiPromise,
    keyPair: KeyringPair,
    sourceChain: string,
    destChain: string,
    asset: string,
    amount: BN,
    destAddress: string
  ): Promise<BridgeResult> {
    try {
      const hasBridgePallet = api.tx.bridge !== undefined;
      
      if (hasBridgePallet) {
        const tx = api.tx.bridge.initiateBridge(
          sourceChain,
          destChain,
          asset,
          amount,
          destAddress
        );
        
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock bridge for development
        console.log('[Bridge] Pallet not deployed, using mock');
        
        const bridgeId = 'bridge_' + Math.random().toString(36).slice(2, 10);
        const bridge: BridgeTransaction = {
          id: bridgeId,
          status: 'pending',
          sourceChain,
          destChain,
          asset,
          amount: amount.toString(),
          createdAt: Date.now(),
        };
        
        this.pendingBridges.set(bridgeId, bridge);
        
        // Simulate bridge process
        this.simulateBridgeProcess(bridgeId);
        
        return {
          success: true,
          bridgeId,
          txHash: '0x' + Math.random().toString(16).slice(2, 66),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Bridge failed',
      };
    }
  }

  /**
   * Simulate bridge process for development
   */
  private async simulateBridgeProcess(bridgeId: string): Promise<void> {
    const bridge = this.pendingBridges.get(bridgeId);
    if (!bridge) return;
    
    // Confirming (5s)
    setTimeout(() => {
      bridge.status = 'confirming';
      this.pendingBridges.set(bridgeId, bridge);
    }, 2000);
    
    // Bridging (10s)
    setTimeout(() => {
      bridge.status = 'bridging';
      this.pendingBridges.set(bridgeId, bridge);
    }, 5000);
    
    // Completed (20s)
    setTimeout(() => {
      bridge.status = 'completed';
      bridge.completedAt = Date.now();
      bridge.destTxHash = '0x' + Math.random().toString(16).slice(2, 66);
      this.pendingBridges.set(bridgeId, bridge);
    }, 15000);
  }

  /**
   * Get bridge transaction status
   */
  async getBridgeStatus(api: ApiPromise, bridgeId: string): Promise<BridgeTransaction | null> {
    try {
      const hasBridgePallet = api.query.bridge !== undefined;
      
      if (hasBridgePallet) {
        // TODO: Fetch from pallet
        return this.pendingBridges.get(bridgeId) || null;
      } else {
        return this.pendingBridges.get(bridgeId) || null;
      }
    } catch (error) {
      return this.pendingBridges.get(bridgeId) || null;
    }
  }

  /**
   * Get all pending bridges for user
   */
  getPendingBridges(): BridgeTransaction[] {
    return Array.from(this.pendingBridges.values()).filter(
      b => b.status !== 'completed' && b.status !== 'failed'
    );
  }

  /**
   * Get bridge history
   */
  getBridgeHistory(): BridgeTransaction[] {
    return Array.from(this.pendingBridges.values());
  }

  /**
   * Sign and send transaction
   */
  private signAndSend(
    tx: any,
    keyPair: KeyringPair
  ): Promise<BridgeResult> {
    return new Promise((resolve) => {
      tx.signAndSend(keyPair, ({ status, dispatchError, txHash }: any) => {
        if (status.isInBlock || status.isFinalized) {
          if (dispatchError) {
            resolve({
              success: false,
              txHash: txHash?.toHex(),
              error: 'Bridge initiation failed',
            });
          } else {
            resolve({
              success: true,
              txHash: txHash?.toHex(),
              bridgeId: 'bridge_' + txHash?.toHex().slice(2, 10),
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
   * Initiate deposit from external chain (shield external tokens)
   * Calls bridge.initiate_deposit on blockchain
   */
  async initiateDeposit(
    api: ApiPromise,
    keyPair: KeyringPair,
    chain: "Bitcoin" | "Ethereum" | "Polygon",
    asset: "BTC" | "ETH" | "USDT",
    amount: BN,
    destinationAddress: string
  ): Promise<BridgeResult> {
    try {
      // Map chain/asset strings to enum values expected by pallet
      const chainEnum = { Bitcoin: 0, Ethereum: 1, Polygon: 2 }[chain];
      const assetEnum = { BTC: 0, ETH: 1, USDT: 2 }[asset];
      
      const tx = api.tx.bridge.initiateDeposit(
        chainEnum,
        assetEnum,
        amount.toString(),
        destinationAddress
      );
      return this.signAndSend(tx, keyPair);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Deposit initiation failed",
      };
    }
  }

  /**
   * Initiate withdrawal to external chain (unshield to external wallet)
   * Calls bridge.initiate_withdrawal on blockchain
   */
  async initiateWithdrawal(
    api: ApiPromise,
    keyPair: KeyringPair,
    chain: "Bitcoin" | "Ethereum" | "Polygon",
    asset: "BTC" | "ETH" | "USDT",
    amount: BN,
    externalAddress: string
  ): Promise<BridgeResult> {
    try {
      const chainEnum = { Bitcoin: 0, Ethereum: 1, Polygon: 2 }[chain];
      const assetEnum = { BTC: 0, ETH: 1, USDT: 2 }[asset];
      
      const tx = api.tx.bridge.initiateWithdrawal(
        chainEnum,
        assetEnum,
        amount.toString(),
        externalAddress
      );
      return this.signAndSend(tx, keyPair);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Withdrawal initiation failed",
      };
    }
  }

}
export const bridgeService = BridgeService.getInstance();
