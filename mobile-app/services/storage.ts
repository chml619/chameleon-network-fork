/**
 * Secure storage wrapper for wallet data
 */

import * as SecureStore from 'expo-secure-store';

// Storage keys
const STORAGE_KEYS = {
  WALLET_SEED: 'chameleon_wallet_seed',
  WALLET_SEED_PREFIX: 'chameleon_wallet_seed_', // For per-address seed storage
  WALLET_NAME: 'chameleon_wallet_name',
  WALLET_ADDRESS: 'chameleon_wallet_address',
  HAS_WALLET: 'chameleon_has_wallet',
} as const;

class StorageService {
  private static instance: StorageService;

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * Save encrypted seed phrase (legacy - also saves to current wallet)
   */
  public async saveEncryptedSeed(seed: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.WALLET_SEED, seed, {
        requireAuthentication: false, // For MVP, we'll add biometrics later
      });
      await SecureStore.setItemAsync(STORAGE_KEYS.HAS_WALLET, 'true');
    } catch (error) {
      console.error('Error saving encrypted seed:', error);
      throw new Error('Failed to save wallet seed securely');
    }
  }

  /**
   * Save encrypted seed phrase for a specific wallet address
   */
  public async saveEncryptedSeedForAddress(seed: string, address: string): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.WALLET_SEED_PREFIX}${address}`;
      await SecureStore.setItemAsync(key, seed, {
        requireAuthentication: false,
      });
      // Also update the current wallet seed
      await this.saveEncryptedSeed(seed);
      console.log('[Storage] Seed saved for address:', address.substring(0, 10) + '...');
    } catch (error) {
      console.error('Error saving encrypted seed for address:', error);
      throw new Error('Failed to save wallet seed securely');
    }
  }

  /**
   * Retrieve encrypted seed phrase for a specific wallet address
   */
  public async getEncryptedSeedForAddress(address: string): Promise<string | null> {
    try {
      const key = `${STORAGE_KEYS.WALLET_SEED_PREFIX}${address}`;
      const seed = await SecureStore.getItemAsync(key);
      if (seed) {
        console.log('[Storage] Seed retrieved for address:', address.substring(0, 10) + '...');
      }
      return seed;
    } catch (error) {
      console.error('Error retrieving encrypted seed for address:', error);
      return null;
    }
  }

  /**
   * Retrieve encrypted seed phrase
   */
  public async getEncryptedSeed(): Promise<string | null> {
    try {
      const seed = await SecureStore.getItemAsync(STORAGE_KEYS.WALLET_SEED);
      return seed;
    } catch (error) {
      console.error('Error retrieving encrypted seed:', error);
      throw new Error('Failed to retrieve wallet seed');
    }
  }

  /**
   * Save wallet metadata (name, address)
   */
  public async saveWalletMetadata(name: string, address: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.WALLET_NAME, name);
      await SecureStore.setItemAsync(STORAGE_KEYS.WALLET_ADDRESS, address);
    } catch (error) {
      console.error('Error saving wallet metadata:', error);
      throw new Error('Failed to save wallet metadata');
    }
  }

  /**
   * Get wallet metadata
   */
  public async getWalletMetadata(): Promise<{ name: string; address: string } | null> {
    try {
      const name = await SecureStore.getItemAsync(STORAGE_KEYS.WALLET_NAME);
      const address = await SecureStore.getItemAsync(STORAGE_KEYS.WALLET_ADDRESS);
      
      if (name && address) {
        return { name, address };
      }
      return null;
    } catch (error) {
      console.error('Error retrieving wallet metadata:', error);
      return null;
    }
  }

  /**
   * Check if wallet exists
   */
  public async hasWallet(): Promise<boolean> {
    try {
      const hasWallet = await SecureStore.getItemAsync(STORAGE_KEYS.HAS_WALLET);
      return hasWallet === 'true';
    } catch (error) {
      console.error('Error checking wallet existence:', error);
      return false;
    }
  }

  /**
   * Delete all wallet data (current wallet only, not per-address seeds)
   */
  public async deleteWallet(): Promise<void> {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(STORAGE_KEYS.WALLET_SEED),
        SecureStore.deleteItemAsync(STORAGE_KEYS.WALLET_NAME),
        SecureStore.deleteItemAsync(STORAGE_KEYS.WALLET_ADDRESS),
        SecureStore.deleteItemAsync(STORAGE_KEYS.HAS_WALLET),
      ]);
    } catch (error) {
      console.error('Error deleting wallet data:', error);
      throw new Error('Failed to delete wallet data');
    }
  }

  /**
   * Delete seed for a specific wallet address
   */
  public async deleteSeedForAddress(address: string): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.WALLET_SEED_PREFIX}${address}`;
      await SecureStore.deleteItemAsync(key);
      console.log('[Storage] Seed deleted for address:', address.substring(0, 10) + '...');
    } catch (error) {
      console.error('Error deleting seed for address:', error);
    }
  }

  /**
   * Check if secure storage is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      return await SecureStore.isAvailableAsync();
    } catch (error) {
      console.error('Error checking secure storage availability:', error);
      return false;
    }
  }
}

// Export singleton instance
export const storageService = StorageService.getInstance();
