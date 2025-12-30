/**
 * React Context for wallet state management
 * Updated with multi-wallet support
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { walletService, type WalletState, DEV_ACCOUNTS } from '../services/wallet';
import { storageService } from '../services/storage';
import { multiWalletService } from '../services/multiWallet';
import { privacyService, generateStealthMetaAddress, generateStealthHash } from '../services/privacy';
import { apiService } from '../services/api';
import BN from 'bn.js';

interface WalletContextType {
  wallet: WalletState | null;
  isLoading: boolean;
  error: string | null;
  stealthMetaAddress: any | null;
  stealthHash: Uint8Array | null;
  privateBalance: BN | null;
  publicBalance: BN | null;
  createWallet: (mnemonic: string, name?: string) => Promise<void>;
  importWallet: (mnemonic: string, name?: string) => Promise<void>;
  importDevAccount: (accountName: 'alice' | 'bob' | 'charlie' | 'dave' | 'eve') => Promise<void>;
  switchWallet: (address: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshPrivateBalance: () => Promise<void>;
  refreshPublicBalance: () => Promise<void>;
  refreshBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stealthMetaAddress, setStealthMetaAddress] = useState<any | null>(null);
  const [stealthHash, setStealthHash] = useState<Uint8Array | null>(null);
  const [privateBalance, setPrivateBalance] = useState<BN | null>(null);

  // Initialize wallet from storage on app start
  useEffect(() => {
    initializeWallet();
  }, []);

  // Subscribe to wallet state changes
  useEffect(() => {
    const unsubscribe = walletService.onWalletStateChange((state) => {
      setWallet(state);
      // Generate stealth address when wallet changes
      if (state && !state.isLocked) {
        generateStealthAddressForWallet(state);
      }
    });

    return unsubscribe;
  }, []);

  // Auto-refresh private balance periodically
  useEffect(() => {
    if (stealthHash) {
      const interval = setInterval(() => {
        refreshPrivateBalance();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [stealthHash]);

  const generateStealthAddressForWallet = async (walletState: WalletState) => {
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) return;

      // Generate stealth meta-address from wallet seed
      const seed = await storageService.getDecryptedSeed();
      if (!seed) return;

      const metaAddress = generateStealthMetaAddress(seed);
      const hash = generateStealthHash(metaAddress);

      setStealthMetaAddress(metaAddress);
      setStealthHash(hash);

      // Initial private balance load
      refreshPrivateBalance();
    } catch (error) {
      console.error('Error generating stealth address:', error);
    }
  };

  const refreshPrivateBalance = useCallback(async () => {
    if (!stealthHash) return;

    try {
      const api = apiService.getApi();
      if (!api) {
        // Use mock balance for demo
        setPrivateBalance(new BN('1000000000000000000')); // 1 CHML
        return;
      }

      privacyService.setApi(api);
      const balance = await privacyService.getPrivateBalance(stealthHash);
      setPrivateBalance(balance);
    } catch (error) {
      console.error('Error refreshing private balance:', error);
      // Use mock balance for demo
      setPrivateBalance(new BN('1000000000000000000')); // 1 CHML
    }
  }, [stealthHash]);

  const initializeWallet = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if wallet exists in storage
      const hasWallet = await storageService.hasWallet();
      
      if (hasWallet) {
        // Get wallet metadata
        const metadata = await storageService.getWalletMetadata();
        
        if (metadata) {
          // Set wallet state as locked (user needs to unlock with seed)
          setWallet({
            address: metadata.address,
            name: metadata.name,
            isLocked: true,
          });
          
          // Update multi-wallet service
          await multiWalletService.setActiveWallet(metadata.address);
        }
      }
    } catch (err) {
      console.error('Error initializing wallet:', err);
      setError('Failed to initialize wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const createWallet = useCallback(async (mnemonic: string, name: string = 'My Wallet') => {
    setIsLoading(true);
    setError(null);

    try {
      // Create wallet with wallet service
      const walletState = await walletService.createWallet(mnemonic, name);
      
      // Save to secure storage
      await storageService.saveEncryptedSeed(mnemonic);
      await storageService.saveWalletMetadata(name, walletState.address);
      
      // Save to multi-wallet list
      await multiWalletService.saveWallet({
        address: walletState.address,
        name,
        type: 'custom',
      });
      await multiWalletService.setActiveWallet(walletState.address);
      
      setWallet(walletState);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create wallet';
      setError(errorMessage);
      console.error('Error creating wallet:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const importWallet = useCallback(async (mnemonic: string, name: string = 'Imported Wallet') => {
    setIsLoading(true);
    setError(null);

    try {
      // Import wallet with wallet service
      const walletState = await walletService.importWallet(mnemonic, name);
      
      // Save to secure storage
      await storageService.saveEncryptedSeed(mnemonic);
      await storageService.saveWalletMetadata(name, walletState.address);
      
      // Save to multi-wallet list
      await multiWalletService.saveWallet({
        address: walletState.address,
        name,
        type: 'imported',
      });
      await multiWalletService.setActiveWallet(walletState.address);
      
      setWallet(walletState);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import wallet';
      setError(errorMessage);
      console.error('Error importing wallet:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const importDevAccount = useCallback(async (accountName: 'alice' | 'bob' | 'charlie' | 'dave' | 'eve') => {
    setIsLoading(true);
    setError(null);

    try {
      // Import dev account
      const walletState = await walletService.importDevAccount(accountName);
      
      // Get the URI for the dev account (not a plain mnemonic)
      const uri = DEV_ACCOUNTS[accountName];
      
      // Save to secure storage (using URI as the "seed" for dev accounts)
      await storageService.saveEncryptedSeed(uri);
      await storageService.saveWalletMetadata(walletState.name, walletState.address);
      
      // Save to multi-wallet list
      await multiWalletService.saveWallet({
        address: walletState.address,
        name: walletState.name,
        type: 'dev',
      });
      await multiWalletService.setActiveWallet(walletState.address);
      
      setWallet(walletState);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import dev account';
      setError(errorMessage);
      console.error('Error importing dev account:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchWallet = useCallback(async (address: string, name: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // For dev accounts, we need to find the right URI and re-import
      const savedWallet = await multiWalletService.getWallet(address);
      
      if (savedWallet?.type === 'dev') {
        // Extract account name from various formats:
        // "Alice (Dev)", "Dev Account (Alice)", "alice", etc.
        const nameLower = name.toLowerCase();
        let accountNameLower: 'alice' | 'bob' | 'charlie' | 'dave' | 'eve' | null = null;
        
        const devNames: Array<'alice' | 'bob' | 'charlie' | 'dave' | 'eve'> = ['alice', 'bob', 'charlie', 'dave', 'eve'];
        for (const devName of devNames) {
          if (nameLower.includes(devName)) {
            accountNameLower = devName;
            break;
          }
        }
        
        if (accountNameLower) {
          const walletState = await walletService.importDevAccount(accountNameLower);
          const uri = DEV_ACCOUNTS[accountNameLower];
          
          await storageService.saveEncryptedSeed(uri);
          await storageService.saveWalletMetadata(walletState.name, walletState.address);
          await multiWalletService.setActiveWallet(walletState.address);
          
          setWallet(walletState);
        } else {
          throw new Error('Could not identify dev account');
        }
      } else {
        // For custom/imported wallets, just update the state
        // User would need to re-enter mnemonic to fully unlock
        setWallet({
          address,
          name,
          isLocked: true,
        });
        await multiWalletService.setActiveWallet(address);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to switch wallet';
      setError(errorMessage);
      console.error('Error switching wallet:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Clear wallet service state
      walletService.clearWallet();
      
      // Clear secure storage
      await storageService.deleteWallet();
      
      // Clear active wallet (but keep saved wallets list)
      await multiWalletService.clearActiveWallet();
      
      setWallet(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to logout';
      setError(errorMessage);
      console.error('Error during logout:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: WalletContextType = {
    wallet,
    isLoading,
    error,
    stealthMetaAddress,
    stealthHash,
    privateBalance,
    createWallet,
    importWallet,
    importDevAccount,
    switchWallet,
    logout,
    clearError,
    refreshPrivateBalance,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
