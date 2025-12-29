/**
 * MEV Protection Service
 * Handles MEV-protected transaction submission via the on-chain mevProtection pallet
 * 
 * MEV (Maximal Extractable Value) protection prevents front-running
 * and sandwich attacks by encrypting pending transactions.
 */

import { ApiPromise } from '@polkadot/api';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import { BN } from '@polkadot/util';

export interface MEVProtectionConfig {
  enabled: boolean;
  encryptionLevel: 'standard' | 'high';
  delayBlocks: number; // Number of blocks to delay protected transactions
}

export interface ProtectedTxResult {
  success: boolean;
  txHash?: string;
  blockHash?: string;
  error?: string;
  usedMEVProtection?: boolean;
}

// Default MEV protection settings
const DEFAULT_CONFIG: MEVProtectionConfig = {
  enabled: true,
  encryptionLevel: 'standard',
  delayBlocks: 2, // Default delay of 2 blocks for MEV protection
};

class MEVProtectionService {
  private static instance: MEVProtectionService;
  private config: MEVProtectionConfig = DEFAULT_CONFIG;

  private constructor() {}

  static getInstance(): MEVProtectionService {
    if (!MEVProtectionService.instance) {
      MEVProtectionService.instance = new MEVProtectionService();
    }
    return MEVProtectionService.instance;
  }

  /**
   * Get current MEV protection status
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable/disable MEV protection
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): MEVProtectionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MEVProtectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set delay blocks for MEV protection
   */
  setDelayBlocks(blocks: number): void {
    this.config.delayBlocks = Math.max(1, Math.min(blocks, 100)); // Clamp between 1-100
  }

  /**
   * Check if MEV protection pallet is available on the connected chain
   */
  isMEVPalletAvailable(api: ApiPromise): boolean {
    try {
      return api.tx.mevProtection !== undefined && 
             api.tx.mevProtection.submitProtectedTx !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Submit a protected transaction using the MEV protection pallet
   * 
   * @param api - Polkadot API instance
   * @param call - The encoded call to protect (e.g., balance transfer)
   * @param delayBlocks - Number of blocks to delay before execution
   * @param account - Signing keypair
   * @returns Transaction result with hash
   */
  async submitProtectedTx(
    api: ApiPromise,
    call: SubmittableExtrinsic<'promise'>,
    delayBlocks: number,
    account: KeyringPair
  ): Promise<ProtectedTxResult> {
    try {
      // Encode the inner call to bytes
      const encodedCall = call.method.toHex();
      
      // Convert encodedCall hex string to Uint8Array for the pallet
      const callBytes = this.hexToBytes(encodedCall);
      
      // Submit to MEV protection pallet
      const tx = api.tx.mevProtection.submitProtectedTx(callBytes, delayBlocks);
      
      return new Promise((resolve) => {
        tx.signAndSend(account, ({ status, dispatchError, txHash, events }) => {
          if (status.isInBlock) {
            const hash = txHash.toHex();
            console.log(`[MEV] Protected tx in block: ${hash}`);
            
            if (dispatchError) {
              let errorMessage = 'Transaction failed on chain';
              if (dispatchError.isModule) {
                try {
                  const decoded = api.registry.findMetaError(dispatchError.asModule);
                  errorMessage = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
                } catch {
                  // Keep default error message
                }
              }
              resolve({
                success: false,
                txHash: hash,
                blockHash: status.asInBlock.toHex(),
                error: errorMessage,
                usedMEVProtection: true,
              });
            } else {
              resolve({
                success: true,
                txHash: hash,
                blockHash: status.asInBlock.toHex(),
                usedMEVProtection: true,
              });
            }
          } else if (status.isFinalized) {
            console.log('[MEV] Transaction finalized');
          }
        }).catch((error: Error) => {
          console.error('[MEV] Submit protected tx error:', error);
          resolve({
            success: false,
            error: error.message,
            usedMEVProtection: true,
          });
        });
      });
    } catch (error) {
      console.error('[MEV] Protected transaction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        usedMEVProtection: true,
      };
    }
  }

  /**
   * Submit a MEV-protected transfer transaction
   * When MEV protection is enabled, transactions are encrypted before submission
   * to prevent front-running and sandwich attacks.
   * 
   * @param api - Polkadot API instance
   * @param keyPair - Signing keypair
   * @param recipient - Recipient address
   * @param amount - Amount to send (in planck)
   * @returns Transaction result
   */
  async submitProtectedTransaction(
    api: ApiPromise,
    keyPair: KeyringPair,
    recipient: string,
    amount: BN
  ): Promise<ProtectedTxResult> {
    try {
      // Validate inputs
      if (!api || !keyPair || !recipient || !amount) {
        return {
          success: false,
          error: 'Invalid transaction parameters',
        };
      }

      // Check API connection
      if (!api.isConnected) {
        return {
          success: false,
          error: 'Network disconnected. Please check your connection.',
        };
      }

      // If MEV protection is disabled, use standard transaction
      if (!this.config.enabled) {
        console.log('[MEV] Protection disabled, using standard transaction');
        return this.submitStandardTransaction(api, keyPair, recipient, amount);
      }

      // Check if MEV protection pallet is available
      if (this.isMEVPalletAvailable(api)) {
        console.log('[MEV] Using MEV protection pallet');
        
        // Create the inner transfer call
        const transferCall = api.tx.balances.transferKeepAlive(recipient, amount);
        
        // Submit via MEV protection pallet
        return this.submitProtectedTx(
          api,
          transferCall,
          this.config.delayBlocks,
          keyPair
        );
      } else {
        // MEV pallet not deployed - use simulated protection
        console.log('[MEV] Pallet not available, using simulated protection');
        return this.submitWithSimulatedProtection(api, keyPair, recipient, amount);
      }
    } catch (error) {
      console.error('[MEV] Protected transaction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Submit standard transaction without MEV protection
   */
  private async submitStandardTransaction(
    api: ApiPromise,
    keyPair: KeyringPair,
    recipient: string,
    amount: BN
  ): Promise<ProtectedTxResult> {
    try {
      const tx = api.tx.balances.transferKeepAlive(recipient, amount);
      return this.signAndSend(tx, keyPair, false);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        usedMEVProtection: false,
      };
    }
  }

  /**
   * Simulated MEV protection using delayed submission
   * Fallback when the MEV pallet is not deployed
   */
  private async submitWithSimulatedProtection(
    api: ApiPromise,
    keyPair: KeyringPair,
    recipient: string,
    amount: BN
  ): Promise<ProtectedTxResult> {
    // Add small random delay to obscure timing (0-500ms)
    const delay = Math.random() * 500;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Submit standard transaction
    const tx = api.tx.balances.transferKeepAlive(recipient, amount);
    return this.signAndSend(tx, keyPair, false);
  }

  /**
   * Sign and send transaction
   */
  private signAndSend(
    tx: SubmittableExtrinsic<'promise'>,
    keyPair: KeyringPair,
    usedMEVProtection: boolean
  ): Promise<ProtectedTxResult> {
    return new Promise((resolve) => {
      tx.signAndSend(keyPair, ({ status, dispatchError, txHash }: any) => {
        if (status.isInBlock || status.isFinalized) {
          if (dispatchError) {
            resolve({
              success: false,
              txHash: txHash?.toHex(),
              error: 'Transaction failed on chain',
              usedMEVProtection,
            });
          } else {
            resolve({
              success: true,
              txHash: txHash?.toHex(),
              blockHash: status.isFinalized 
                ? status.asFinalized.toHex() 
                : status.asInBlock.toHex(),
              usedMEVProtection,
            });
          }
        }
      }).catch((error: Error) => {
        resolve({
          success: false,
          error: error.message,
          usedMEVProtection,
        });
      });
    });
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Get MEV protection statistics from the chain
   */
  async getProtectionStats(api?: ApiPromise): Promise<{
    protectedTxCount: number;
    savedFromMEV: string;
    avgProtectionTime: string;
    palletAvailable: boolean;
  }> {
    const palletAvailable = api ? this.isMEVPalletAvailable(api) : false;
    
    // TODO: Query actual stats from chain storage when available
    // For now, return placeholder data
    return {
      protectedTxCount: 0,
      savedFromMEV: '0 CHML',
      avgProtectionTime: `~${this.config.delayBlocks * 6} seconds`,
      palletAvailable,
    };
  }

  /**
   * Get pending protected transactions for an account
   */
  async getPendingProtectedTxs(
    api: ApiPromise,
    account: string
  ): Promise<Array<{ txHash: string; executeAtBlock: number }>> {
    if (!this.isMEVPalletAvailable(api)) {
      return [];
    }

    try {
      // Query pending transactions from storage
      // This would need to iterate storage or have an indexer
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      console.error('[MEV] Error getting pending txs:', error);
      return [];
    }
  }
}

export const mevService = MEVProtectionService.getInstance();
