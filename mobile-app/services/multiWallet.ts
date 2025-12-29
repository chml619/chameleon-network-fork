/**
 * Multi-Wallet Service
 * Manages multiple wallet addresses and metadata (NOT private keys)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_WALLETS_KEY = 'saved_wallets';
const ACTIVE_WALLET_KEY = 'active_wallet';

export interface SavedWallet {
  address: string;
  name: string;
  type: 'dev' | 'custom' | 'imported';
  importedAt: number;
  lastUsed?: number;
}

class MultiWalletService {
  private static instance: MultiWalletService;

  private constructor() {}

  public static getInstance(): MultiWalletService {
    if (!MultiWalletService.instance) {
      MultiWalletService.instance = new MultiWalletService();
    }
    return MultiWalletService.instance;
  }

  /**
   * Get all saved wallets
   */
  public async getSavedWallets(): Promise<SavedWallet[]> {
    try {
      const data = await AsyncStorage.getItem(SAVED_WALLETS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[MultiWallet] Get wallets error:', error);
      return [];
    }
  }

  /**
   * Save a wallet to the list
   */
  public async saveWallet(wallet: Omit<SavedWallet, 'importedAt'>): Promise<SavedWallet> {
    try {
      const wallets = await this.getSavedWallets();
      
      // Check if already exists
      const existingIndex = wallets.findIndex(
        w => w.address.toLowerCase() === wallet.address.toLowerCase()
      );

      const savedWallet: SavedWallet = {
        ...wallet,
        importedAt: existingIndex >= 0 ? wallets[existingIndex].importedAt : Date.now(),
        lastUsed: Date.now(),
      };

      if (existingIndex >= 0) {
        // Update existing
        wallets[existingIndex] = savedWallet;
      } else {
        // Add new
        wallets.push(savedWallet);
      }

      await AsyncStorage.setItem(SAVED_WALLETS_KEY, JSON.stringify(wallets));
      console.log('[MultiWallet] Wallet saved:', wallet.address);
      return savedWallet;
    } catch (error) {
      console.error('[MultiWallet] Save wallet error:', error);
      throw error;
    }
  }

  /**
   * Remove a wallet from the list
   */
  public async removeWallet(address: string): Promise<void> {
    try {
      const wallets = await this.getSavedWallets();
      const filtered = wallets.filter(
        w => w.address.toLowerCase() !== address.toLowerCase()
      );
      await AsyncStorage.setItem(SAVED_WALLETS_KEY, JSON.stringify(filtered));
      
      // If removed wallet was active, clear active wallet
      const activeWallet = await this.getActiveWallet();
      if (activeWallet?.toLowerCase() === address.toLowerCase()) {
        await this.clearActiveWallet();
      }
      
      console.log('[MultiWallet] Wallet removed:', address);
    } catch (error) {
      console.error('[MultiWallet] Remove wallet error:', error);
      throw error;
    }
  }

  /**
   * Update wallet name
   */
  public async updateWalletName(address: string, name: string): Promise<void> {
    try {
      const wallets = await this.getSavedWallets();
      const index = wallets.findIndex(
        w => w.address.toLowerCase() === address.toLowerCase()
      );
      
      if (index >= 0) {
        wallets[index].name = name;
        await AsyncStorage.setItem(SAVED_WALLETS_KEY, JSON.stringify(wallets));
        console.log('[MultiWallet] Wallet renamed:', address, '->', name);
      }
    } catch (error) {
      console.error('[MultiWallet] Update name error:', error);
      throw error;
    }
  }

  /**
   * Get active wallet address
   */
  public async getActiveWallet(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(ACTIVE_WALLET_KEY);
    } catch (error) {
      console.error('[MultiWallet] Get active wallet error:', error);
      return null;
    }
  }

  /**
   * Set active wallet address
   */
  public async setActiveWallet(address: string): Promise<void> {
    try {
      await AsyncStorage.setItem(ACTIVE_WALLET_KEY, address);
      
      // Update lastUsed timestamp
      const wallets = await this.getSavedWallets();
      const index = wallets.findIndex(
        w => w.address.toLowerCase() === address.toLowerCase()
      );
      
      if (index >= 0) {
        wallets[index].lastUsed = Date.now();
        await AsyncStorage.setItem(SAVED_WALLETS_KEY, JSON.stringify(wallets));
      }
      
      console.log('[MultiWallet] Active wallet set:', address);
    } catch (error) {
      console.error('[MultiWallet] Set active wallet error:', error);
      throw error;
    }
  }

  /**
   * Clear active wallet
   */
  public async clearActiveWallet(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ACTIVE_WALLET_KEY);
      console.log('[MultiWallet] Active wallet cleared');
    } catch (error) {
      console.error('[MultiWallet] Clear active wallet error:', error);
    }
  }

  /**
   * Get wallet by address
   */
  public async getWallet(address: string): Promise<SavedWallet | null> {
    const wallets = await this.getSavedWallets();
    return wallets.find(
      w => w.address.toLowerCase() === address.toLowerCase()
    ) || null;
  }

  /**
   * Get wallet count
   */
  public async getWalletCount(): Promise<number> {
    const wallets = await this.getSavedWallets();
    return wallets.length;
  }

  /**
   * Check if wallet exists
   */
  public async walletExists(address: string): Promise<boolean> {
    const wallet = await this.getWallet(address);
    return wallet !== null;
  }

  /**
   * Get recently used wallets
   */
  public async getRecentWallets(limit: number = 5): Promise<SavedWallet[]> {
    const wallets = await this.getSavedWallets();
    return wallets
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
      .slice(0, limit);
  }

  /**
   * Clear all saved wallets
   */
  public async clearAllWallets(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SAVED_WALLETS_KEY);
      await AsyncStorage.removeItem(ACTIVE_WALLET_KEY);
      console.log('[MultiWallet] All wallets cleared');
    } catch (error) {
      console.error('[MultiWallet] Clear all error:', error);
      throw error;
    }
  }
}

export const multiWalletService = MultiWalletService.getInstance();
