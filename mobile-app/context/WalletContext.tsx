/**
 * React Context for wallet state management
 * Updated with multi-wallet support
 * Fixed: Balance persistence across navigation using refs
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';
import { walletService, type WalletState, DEV_ACCOUNTS } from '../services/wallet';
import { storageService } from '../services/storage';
import { multiWalletService } from '../services/multiWallet';
import { privacyService, generateStealthMetaAddress, generateStealthHash } from '../services/privacy';
import { apiService } from '../services/api';
import { pdexService } from '../services/pdex';
import BN from 'bn.js';
import { formatBalance } from '../utils/balance';
import { transactionHistoryService } from '../services/transactionHistory';

interface WalletContextType {
  wallet: WalletState | null;
  isLoading: boolean;
  error: string | null;
  stealthMetaAddress: any | null;
  stealthHash: Uint8Array | null;
  privateBalance: BN;
  publicBalance: BN;
  pchmlBalance: BN;
  balanceLoading: boolean;
  createWallet: (mnemonic: string, name?: string) => Promise<void>;
  importWallet: (mnemonic: string, name?: string) => Promise<void>;
  importDevAccount: (accountName: 'alice' | 'bob' | 'charlie' | 'dave' | 'eve') => Promise<void>;
  switchWallet: (address: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshPrivateBalance: () => Promise<void>;
  refreshPublicBalance: () => Promise<void>;
  refreshPCHMLBalance: () => Promise<void>;
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
  const [privateBalance, setPrivateBalance] = useState<BN>(new BN(0));
  const [publicBalance, setPublicBalance] = useState<BN>(new BN(0));
  const [pchmlBalance, setPchmlBalance] = useState<BN>(new BN(0));
  const [balanceLoading, setBalanceLoading] = useState(true);
  
  // Refs to preserve balance values across re-renders and prevent reset to 0
  const publicBalanceRef = useRef<BN>(new BN(0));
  const privateBalanceRef = useRef<BN>(new BN(0));
  const pchmlBalanceRef = useRef<BN>(new BN(0));
  const isFetchingBalance = useRef(false);

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

  // Auto-refresh balances periodically
  useEffect(() => {
    if (wallet?.address) {
      const interval = setInterval(() => {
        refreshBalances();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [wallet?.address]);

  const generateStealthAddressForWallet = async (walletState: WalletState) => {
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) return;

      // Generate stealth meta-address from wallet seed
      const seed = await storageService.getEncryptedSeed();
      if (!seed) return;

      const metaAddress = generateStealthMetaAddress(seed);
      const hash = generateStealthHash(metaAddress);

      setStealthMetaAddress(metaAddress);
      setStealthHash(hash);

      // Initial balance load
      refreshBalances();
    } catch (error) {
      console.error('Error generating stealth address:', error);
    }
  };

  const refreshPrivateBalance = useCallback(async () => {
    if (!stealthHash) return;

    try {
      const api = apiService.getApi();
      if (!api) {
        // Use mock balance for demo - but preserve existing if we have it
        if (privateBalanceRef.current.isZero()) {
          const mockBalance = new BN('1000000000000000000'); // 1 CHML
          privateBalanceRef.current = mockBalance;
          setPrivateBalance(mockBalance);
        }
        return;
      }

      privacyService.setApi(api);
      const balance = await privacyService.getPrivateBalance(stealthHash);
      privateBalanceRef.current = balance;
      setPrivateBalance(balance);
    } catch (error) {
      console.error('Error refreshing private balance:', error);
      // Keep existing balance on error - don't reset to 0
      if (privateBalanceRef.current.isZero()) {
        const mockBalance = new BN('1000000000000000000'); // 1 CHML for demo
        privateBalanceRef.current = mockBalance;
        setPrivateBalance(mockBalance);
      }
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
          // Set initial wallet state as locked
          setWallet({
            address: metadata.address,
            name: metadata.name,
            isLocked: true,
          });

          // Update multi-wallet service
          await multiWalletService.setActiveWallet(metadata.address);

          // Try to automatically restore keypair from stored seed
          try {
            const keyPair = await walletService.getOrDeriveKeyPair();
            if (keyPair) {
              // Keypair restored successfully, update state to unlocked
              setWallet({
                address: metadata.address,
                name: metadata.name,
                isLocked: false,
              });
              console.log('[WalletContext] Wallet auto-unlocked on startup');
            }
          } catch (restoreError) {
            console.warn('[WalletContext] Could not auto-restore keypair on init:', restoreError);
            // Keep wallet in locked state
          }
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

      // Save to secure storage - use address-keyed storage
      await storageService.saveEncryptedSeedForAddress(mnemonic, walletState.address);
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

      // Save to secure storage - use address-keyed storage
      await storageService.saveEncryptedSeedForAddress(mnemonic, walletState.address);
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

      // Save to secure storage - use address-keyed storage
      await storageService.saveEncryptedSeedForAddress(uri, walletState.address);
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
      // Clear cached keypair from previous wallet before switching
      walletService.clearCachedKeyPair();

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

          await storageService.saveEncryptedSeedForAddress(uri, walletState.address);
          await storageService.saveWalletMetadata(walletState.name, walletState.address);
          await multiWalletService.setActiveWallet(walletState.address);

          setWallet(walletState);
        } else {
          throw new Error('Could not identify dev account');
        }
      } else {
        // For custom/imported wallets, try to restore from address-keyed seed
        const storedSeed = await storageService.getEncryptedSeedForAddress(address);

        if (storedSeed) {
          // We have the seed for this address, restore the keypair
          const walletState = await walletService.restoreFromSeed(storedSeed, address, name);

          // Also update current wallet seed for legacy compatibility
          await storageService.saveEncryptedSeed(storedSeed);
          await storageService.saveWalletMetadata(name, address);
          await multiWalletService.setActiveWallet(address);

          setWallet(walletState);
          console.log('[WalletContext] Wallet restored from address-keyed seed');
        } else {
          // No seed found for this address - this shouldn't happen normally
          // Fall back to locked state
          const newWalletState: WalletState = {
            address,
            name,
            isLocked: true,
          };
          setWallet(newWalletState);
          await multiWalletService.setActiveWallet(address);

          console.warn('[WalletContext] No seed found for address, wallet will be locked');
        }
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

  const refreshPublicBalance = useCallback(async () => {
    if (!wallet?.address) return;
    
    // Prevent concurrent fetches
    if (isFetchingBalance.current) return;
    isFetchingBalance.current = true;

    try {
      const api = apiService.getApi();
      if (!api) {
        // Keep existing balance during API reconnection
        isFetchingBalance.current = false;
        return;
      }

      const { data: { free } } = await api.query.system.account(wallet.address) as any;
      const newBalance = new BN(free.toString());
      
      // Only update if we got valid data
      publicBalanceRef.current = newBalance;
      setPublicBalance(newBalance);
      setBalanceLoading(false);
    } catch (error) {
      console.error('Error refreshing public balance:', error);
      // Keep old balance on error - don't reset to 0
      // Only set mock if we have nothing
      if (publicBalanceRef.current.isZero()) {
        const mockBalance = new BN('1100000000000000'); // 1100 CHML mock
        publicBalanceRef.current = mockBalance;
        setPublicBalance(mockBalance);
      }
      setBalanceLoading(false);
    } finally {
      isFetchingBalance.current = false;
    }
  }, [wallet?.address]);

  const refreshPCHMLBalance = useCallback(async () => {
    if (!wallet?.address) return;

    try {
      const balance = await pdexService.getPCHMLBalance(wallet.address);
      // Always REPLACE the balance - never add to it
      // Note: If balance is growing every block, this is a blockchain-side emissions issue
      // The emissions pallet should credit rewards to a claimable accumulator, not pCHML balance
      pchmlBalanceRef.current = balance;
      setPchmlBalance(balance);
    } catch (error) {
      console.error('Error refreshing pCHML balance:', error);
      // Keep existing balance on error - don't set mock
    }
  }, [wallet?.address]);

  const refreshBalances = useCallback(async () => {
    await Promise.all([
      refreshPublicBalance(),
      refreshPrivateBalance(),
      refreshPCHMLBalance(),
    ]);
  }, [refreshPublicBalance, refreshPrivateBalance, refreshPCHMLBalance]);

  // Refresh balances when API connects
  useEffect(() => {
    if (!wallet?.address) return;
    
    const unsubscribe = apiService.onConnectionStateChange((state) => {
      if (state.status === 'connected') {
        console.log('[WalletContext] API connected, refreshing balances');
        refreshBalances();
      }
    });
    
    // Also check if already connected
    const currentState = apiService.getConnectionState();
    if (currentState.status === 'connected') {
      refreshBalances();
    }
    
    return unsubscribe;
  }, [wallet?.address, refreshBalances]);

  // Subscribe to incoming transfer events
  useEffect(() => {
    if (!wallet?.address) return;
    
    const api = apiService.getApi();
    if (!api) return;
    
    let unsubscribe: (() => void) | null = null;
    
    const subscribeToEvents = async () => {
      try {
        unsubscribe = await api.query.system.events((events: any[]) => {
          events.forEach((record: any) => {
            const { event } = record;
            
            // Check for pdex.Transfer events
            if (event.section === 'pdex' && event.method === 'Transfer') {
              const [assetId, from, to, amount] = event.data;
              const toAddress = to.toString();
              const fromAddress = from.toString();
              
              // If this wallet is the recipient (incoming transfer)
              if (toAddress === wallet.address && fromAddress !== wallet.address) {
                const tokenSymbols: { [key: number]: string } = { 0: 'pCHML', 1: 'pETH', 2: 'pBTC', 3: 'pUSDT' };
                const symbol = tokenSymbols[assetId.toNumber()] || `Token${assetId}`;
                const amountStr = amount.toString();
                
                // Save incoming transfer to history
                transactionHistoryService.saveTransaction(wallet.address, {
                  hash: `incoming_${Date.now()}`,
                  from: fromAddress,
                  to: toAddress,
                  amount: amountStr,
                  formattedAmount: `${formatBalance(new BN(amountStr))} ${symbol}`,
                  status: 'finalized',
                  usedMEVProtection: false,
                  type: 'receive',
                });
                
                // Refresh balances
                refreshBalances();
              }
            }
          });
        }) as unknown as () => void;
      } catch (error) {
        console.error('[WalletContext] Error subscribing to events:', error);
      }
    };
    
    subscribeToEvents();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [wallet?.address, refreshBalances]);

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
    publicBalance,
    pchmlBalance,
    balanceLoading,
    createWallet,
    importWallet,
    importDevAccount,
    switchWallet,
    logout,
    clearError,
    refreshPrivateBalance,
    refreshPublicBalance,
    refreshPCHMLBalance,
    refreshBalances,
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
