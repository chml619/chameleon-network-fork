/**
 * Transaction History Service
 * Stores and retrieves transaction history using AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TX_HISTORY_KEY_PREFIX = 'tx_history_';
const MAX_HISTORY_PER_WALLET = 100;

// Transaction status type (duplicated to avoid circular dependency)
export type StoredTransactionStatus = 'pending' | 'inBlock' | 'finalized' | 'failed';

export interface StoredTransaction {
  id: string;
  hash: string;
  from: string;
  to: string;
  amount: string;
  formattedAmount: string;
  fee?: string;
  status: StoredTransactionStatus;
  timestamp: number;
  blockNumber?: number;
  blockHash?: string;
  usedMEVProtection: boolean;
  mevDelayBlocks?: number;
  error?: string;
  type?: 'send' | 'receive' | 'swap' | 'shield' | 'unshield' | 'add_liquidity' | 'remove_liquidity';
}

class TransactionHistoryService {
  private static instance: TransactionHistoryService;

  private constructor() {}

  public static getInstance(): TransactionHistoryService {
    if (!TransactionHistoryService.instance) {
      TransactionHistoryService.instance = new TransactionHistoryService();
    }
    return TransactionHistoryService.instance;
  }

  /**
   * Get storage key for a wallet address
   */
  private getStorageKey(walletAddress: string): string {
    return `${TX_HISTORY_KEY_PREFIX}${walletAddress.toLowerCase()}`;
  }

  /**
   * Save a transaction to history
   */
  public async saveTransaction(
    walletAddress: string,
    transaction: Omit<StoredTransaction, 'id' | 'timestamp'>
  ): Promise<StoredTransaction> {
    try {
      const history = await this.getHistory(walletAddress);
      
      const newTransaction: StoredTransaction = {
        ...transaction,
        id: `${transaction.hash}_${Date.now()}`,
        timestamp: Date.now(),
      };

      // Add to beginning of array (most recent first)
      history.unshift(newTransaction);

      // Limit history size
      if (history.length > MAX_HISTORY_PER_WALLET) {
        history.splice(MAX_HISTORY_PER_WALLET);
      }

      // Save to storage
      const key = this.getStorageKey(walletAddress);
      await AsyncStorage.setItem(key, JSON.stringify(history));

      console.log('[TxHistory] Saved transaction:', newTransaction.hash);
      return newTransaction;
    } catch (error) {
      console.error('[TxHistory] Error saving transaction:', error);
      throw error;
    }
  }

  /**
   * Update an existing transaction (e.g., when status changes)
   */
  public async updateTransaction(
    walletAddress: string,
    hash: string,
    updates: Partial<StoredTransaction>
  ): Promise<StoredTransaction | null> {
    try {
      const history = await this.getHistory(walletAddress);
      const index = history.findIndex(tx => tx.hash === hash);

      if (index === -1) {
        console.log('[TxHistory] Transaction not found for update:', hash);
        return null;
      }

      history[index] = {
        ...history[index],
        ...updates,
      };

      const key = this.getStorageKey(walletAddress);
      await AsyncStorage.setItem(key, JSON.stringify(history));

      console.log('[TxHistory] Updated transaction:', hash);
      return history[index];
    } catch (error) {
      console.error('[TxHistory] Error updating transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction history for a wallet
   */
  public async getHistory(walletAddress: string): Promise<StoredTransaction[]> {
    try {
      const key = this.getStorageKey(walletAddress);
      const data = await AsyncStorage.getItem(key);

      if (!data) {
        return [];
      }

      return JSON.parse(data) as StoredTransaction[];
    } catch (error) {
      console.error('[TxHistory] Error getting history:', error);
      return [];
    }
  }

  /**
   * Get a specific transaction by hash
   */
  public async getTransaction(
    walletAddress: string,
    hash: string
  ): Promise<StoredTransaction | null> {
    const history = await this.getHistory(walletAddress);
    return history.find(tx => tx.hash === hash) || null;
  }

  /**
   * Get recent transactions (limited)
   */
  public async getRecentTransactions(
    walletAddress: string,
    limit: number = 10
  ): Promise<StoredTransaction[]> {
    const history = await this.getHistory(walletAddress);
    return history.slice(0, limit);
  }

  /**
   * Get transactions by status
   */
  public async getTransactionsByStatus(
    walletAddress: string,
    status: StoredTransactionStatus
  ): Promise<StoredTransaction[]> {
    const history = await this.getHistory(walletAddress);
    return history.filter(tx => tx.status === status);
  }

  /**
   * Get MEV-protected transactions
   */
  public async getMEVProtectedTransactions(
    walletAddress: string
  ): Promise<StoredTransaction[]> {
    const history = await this.getHistory(walletAddress);
    return history.filter(tx => tx.usedMEVProtection);
  }

  /**
   * Clear history for a wallet
   */
  public async clearHistory(walletAddress: string): Promise<void> {
    try {
      const key = this.getStorageKey(walletAddress);
      await AsyncStorage.removeItem(key);
      console.log('[TxHistory] Cleared history for:', walletAddress);
    } catch (error) {
      console.error('[TxHistory] Error clearing history:', error);
      throw error;
    }
  }

  /**
   * Get total transaction count
   */
  public async getTransactionCount(walletAddress: string): Promise<number> {
    const history = await this.getHistory(walletAddress);
    return history.length;
  }

  /**
   * Add a transaction to history (alias for saveTransaction for compatibility)
   */
  public async addTransaction(
    walletAddress: string,
    transaction: Omit<StoredTransaction, 'id' | 'timestamp'>
  ): Promise<StoredTransaction> {
    return this.saveTransaction(walletAddress, transaction);
  }
}

// Export singleton instance
export const transactionHistoryService = TransactionHistoryService.getInstance();
