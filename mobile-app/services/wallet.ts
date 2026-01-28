/**
 * Wallet/Keyring management for Chameleon Network
 */

import { Keyring } from '@polkadot/keyring';
import { mnemonicGenerate, mnemonicValidate, cryptoWaitReady } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import type { KeyringPair } from '@polkadot/keyring/types';

export interface WalletState {
  address: string;
  name: string;
  isLocked: boolean;
}

// Standard Substrate dev account mnemonics
export const DEV_ACCOUNTS = {
  alice: 'bottom drive obey lake curtain smoke basket hold race lonely fit walk//Alice',
  bob: 'bottom drive obey lake curtain smoke basket hold race lonely fit walk//Bob',
  charlie: 'bottom drive obey lake curtain smoke basket hold race lonely fit walk//Charlie',
  dave: 'bottom drive obey lake curtain smoke basket hold race lonely fit walk//Dave',
  eve: 'bottom drive obey lake curtain smoke basket hold race lonely fit walk//Eve',
};

// Pre-computed dev account addresses (SS58 format with prefix 42)
// These match the standard Substrate dev accounts
export const DEV_ACCOUNT_ADDRESSES = {
  alice: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  bob: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
  charlie: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
  dave: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
  eve: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
};

class WalletService {
  private static instance: WalletService;
  private keyring: Keyring | null = null;
  private currentPair: KeyringPair | null = null;
  private cachedKeyPair: KeyringPair | null = null;
  private walletState: WalletState | null = null;
  private listeners: ((state: WalletState | null) => void)[] = [];

  private constructor() {}

  public static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  /**
   * Initialize the keyring
   */
  private async initializeKeyring(): Promise<void> {
    if (this.keyring) return;

    try {
      await cryptoWaitReady();
      this.keyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
    } catch (error) {
      console.error('Error initializing keyring:', error);
      throw new Error('Failed to initialize crypto. Please restart the app.');
    }
  }

  /**
   * Ensure crypto is ready (call before generateMnemonic)
   */
  public async ensureCryptoReady(): Promise<void> {
    await cryptoWaitReady();
  }

  /**
   * Generate a new 12-word mnemonic seed phrase
   */
  public generateMnemonic(): string {
    try {
      return mnemonicGenerate(12);
    } catch (error) {
      console.error('Error generating mnemonic:', error);
      // Fallback: generate a demo mnemonic for testing
      return 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    }
  }

  /**
   * Validate a mnemonic seed phrase
   */
  public validateMnemonic(mnemonic: string): boolean {
    try {
      return mnemonicValidate(mnemonic);
    } catch (error) {
      console.error('Error validating mnemonic:', error);
      return false;
    }
  }

  /**
   * Create a new wallet from mnemonic
   */
  public async createWallet(mnemonic: string, name: string = 'My Wallet'): Promise<WalletState> {
    await this.initializeKeyring();
    
    if (!this.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    if (!this.keyring) {
      throw new Error('Keyring not initialized');
    }

    try {
      this.currentPair = this.keyring.addFromMnemonic(mnemonic);
      
      this.walletState = {
        address: this.currentPair.address,
        name,
        isLocked: false,
      };

      this.notifyListeners();
      return this.walletState;
    } catch (error) {
      console.error('Error creating wallet:', error);
      throw new Error('Failed to create wallet from mnemonic');
    }
  }

  /**
   * Import an existing wallet from mnemonic
   */
  public async importWallet(mnemonic: string, name: string = 'Imported Wallet'): Promise<WalletState> {
    return this.createWallet(mnemonic, name);
  }

  /**
   * Import a dev account by name
   */
  public async importDevAccount(accountName: keyof typeof DEV_ACCOUNTS): Promise<WalletState> {
    await this.initializeKeyring();
    
    if (!this.keyring) {
      throw new Error('Keyring not initialized');
    }

    try {
      const uri = DEV_ACCOUNTS[accountName];
      const name = `Dev Account (${accountName.charAt(0).toUpperCase() + accountName.slice(1)})`;
      
      // Dev accounts use URI format with derivation paths, not plain mnemonics
      this.currentPair = this.keyring.addFromUri(uri);
      
      this.walletState = {
        address: this.currentPair.address,
        name,
        isLocked: false,
      };

      this.notifyListeners();
      return this.walletState;
    } catch (error) {
      console.error('Error importing dev account:', error);
      throw new Error('Failed to import dev account');
    }
  }

  /**
   * Get the current wallet address
   */
  public getAddress(): string | null {
    return this.walletState?.address || null;
  }

  /**
   * Get the current wallet state
   */
  public getWalletState(): WalletState | null {
    return this.walletState ? { ...this.walletState } : null;
  }

  /**
   * Check if wallet exists and is unlocked
   */
  public isWalletReady(): boolean {
    return this.walletState !== null && !this.walletState.isLocked && this.currentPair !== null;
  }

  /**
   * Lock the wallet
   */
  public lockWallet(): void {
    if (this.walletState) {
      this.walletState.isLocked = true;
      this.notifyListeners();
    }
  }

  /**
   * Unlock the wallet with mnemonic
   */
  public async unlockWallet(mnemonic: string): Promise<void> {
    if (!this.walletState) {
      throw new Error('No wallet to unlock');
    }

    await this.initializeKeyring();
    
    if (!this.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    if (!this.keyring) {
      throw new Error('Keyring not initialized');
    }

    try {
      const pair = this.keyring.addFromMnemonic(mnemonic);
      
      // Verify the address matches
      if (pair.address !== this.walletState.address) {
        throw new Error('Mnemonic does not match wallet address');
      }

      this.currentPair = pair;
      this.walletState.isLocked = false;
      this.notifyListeners();
    } catch (error) {
      console.error('Error unlocking wallet:', error);
      throw new Error('Failed to unlock wallet');
    }
  }

  /**
   * Sign a transaction (placeholder for future implementation)
   */
  public async signTransaction(tx: any): Promise<string> {
    if (!this.isWalletReady()) {
      throw new Error('Wallet not ready for signing');
    }

    if (!this.currentPair) {
      throw new Error('No keypair available for signing');
    }

    // This will be implemented in Phase 3 when we add send/receive functionality
    throw new Error('Transaction signing not yet implemented');
  }

  /**
   * Get the keypair for signing (internal use)
   */
  public getKeyPair(): KeyringPair | null {
    return this.currentPair;
  }

  /**
   * Get the keypair, deriving it from stored seed if necessary
   * This is the preferred method for getting a signing keypair
   */
  public async getOrDeriveKeyPair(): Promise<KeyringPair | null> {
    // Check cached keypair first
    if (this.cachedKeyPair) {
      try {
        // Verify it's still valid by checking address
        if (this.cachedKeyPair.address && this.walletState?.address === this.cachedKeyPair.address) {
          return this.cachedKeyPair;
        }
      } catch (e) {
        console.warn('[Wallet] Cached keypair invalid, clearing cache');
        this.cachedKeyPair = null;
      }
    }
    
    // If we already have a current keypair, cache and return it
    if (this.currentPair) {
      this.cachedKeyPair = this.currentPair;
      return this.currentPair;
    }
    
    // If no wallet state, can't derive
    if (!this.walletState) {
      console.warn('[Wallet] No wallet state available');
      return null;
    }
    
    // Try to import from stored seed
    try {
      // Import storageService here to avoid circular dependency issues
      const { storageService } = await import('./storage');
      const storedSeed = await storageService.getEncryptedSeed();
      
      if (!storedSeed) {
        console.warn('[Wallet] No stored seed found - wallet may need to be re-imported');
        return null;
      }
      
      await this.initializeKeyring();
      
      if (!this.keyring) {
        console.error('[Wallet] Failed to initialize keyring');
        return null;
      }
      
      // Check if it's a dev account URI (contains //)
      if (storedSeed.includes('//')) {
        console.log('[Wallet] Restoring dev account from URI');
        this.currentPair = this.keyring.addFromUri(storedSeed);
      } else {
        // Regular mnemonic - validate first
        if (!this.validateMnemonic(storedSeed)) {
          console.error('[Wallet] Invalid stored mnemonic');
          return null;
        }
        console.log('[Wallet] Restoring wallet from mnemonic');
        this.currentPair = this.keyring.addFromMnemonic(storedSeed);
      }
      
      // Verify the restored keypair matches the wallet address
      if (this.currentPair.address !== this.walletState.address) {
        console.error('[Wallet] Address mismatch - stored seed does not match wallet address');
        console.error(`Expected: ${this.walletState.address}, Got: ${this.currentPair.address}`);
        this.currentPair = null;
        return null;
      }
      
      this.walletState.isLocked = false;
      this.cachedKeyPair = this.currentPair;
      console.log('[Wallet] Successfully restored and cached keypair');
      return this.currentPair;
    } catch (error) {
      console.error('[Wallet] Error deriving keypair:', error);
      return null;
    }
  }

  /**
   * Clear cached keypair when switching wallets
   */
  public clearCachedKeyPair(): void {
    this.cachedKeyPair = null;
  }

  /**
   * Restore wallet from a specific seed (used when switching wallets)
   */
  public async restoreFromSeed(seed: string, expectedAddress: string, name: string): Promise<WalletState> {
    await this.initializeKeyring();

    if (!this.keyring) {
      throw new Error('Keyring not initialized');
    }

    try {
      // Check if it's a dev account URI (contains //)
      if (seed.includes('//')) {
        this.currentPair = this.keyring.addFromUri(seed);
      } else {
        // Regular mnemonic
        if (!this.validateMnemonic(seed)) {
          throw new Error('Invalid stored mnemonic');
        }
        this.currentPair = this.keyring.addFromMnemonic(seed);
      }

      // Verify address matches
      if (this.currentPair.address !== expectedAddress) {
        console.error(`[Wallet] Address mismatch: expected ${expectedAddress}, got ${this.currentPair.address}`);
        this.currentPair = null;
        throw new Error('Stored seed does not match wallet address');
      }

      this.cachedKeyPair = this.currentPair;

      this.walletState = {
        address: this.currentPair.address,
        name,
        isLocked: false,
      };

      this.notifyListeners();
      console.log('[Wallet] Successfully restored from seed');
      return this.walletState;
    } catch (error) {
      console.error('[Wallet] Error restoring from seed:', error);
      throw error;
    }
  }

  /**
   * Clear wallet data (logout)
   */
  public clearWallet(): void {
    this.currentPair = null;
    this.cachedKeyPair = null;
    this.walletState = null;
    this.notifyListeners();
  }

  /**
   * Subscribe to wallet state changes
   */
  public onWalletStateChange(listener: (state: WalletState | null) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.walletState));
  }

  /**
   * Get derived address preview for a mnemonic (without creating wallet)
   */
  public async getAddressPreview(mnemonic: string): Promise<string> {
    await this.initializeKeyring();
    
    if (!this.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    if (!this.keyring) {
      throw new Error('Keyring not initialized');
    }

    try {
      const tempPair = this.keyring.addFromMnemonic(mnemonic);
      const address = tempPair.address;
      
      // Remove the temporary pair
      this.keyring.removePair(tempPair.address);
      
      return address;
    } catch (error) {
      console.error('Error getting address preview:', error);
      throw new Error('Failed to derive address from mnemonic');
    }
  }
}

// Export singleton instance
export const walletService = WalletService.getInstance();
