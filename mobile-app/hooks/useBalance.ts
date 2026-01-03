/**
 * React hook for balance subscription and formatting
 * Fixed: Preserves balance during loading/refresh to prevent UI flicker
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { chainService, type BalanceInfo } from '../services/chain';
import { apiService } from '../services/api';
import { NETWORK_CONFIG } from '../config/network';
import { formatBalance as formatBalanceUtil } from '../utils/balance';

export interface UseBalanceReturn {
  balance: BalanceInfo | null;
  formattedBalance: string;
  formattedFreeBalance: string;
  formattedReservedBalance: string;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for subscribing to balance changes and formatting
 * Preserves previous balance during refresh to prevent showing 0
 */
export function useBalance(address?: string): UseBalanceReturn {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use ref to preserve balance across re-renders and during loading
  const balanceRef = useRef<BalanceInfo | null>(null);
  const isFirstLoad = useRef(true);

  // Format balance helper - uses centralized utility
  const formatBalance = useCallback((amount: string): string => {
    if (!amount || amount === '0') {
      return `0 ${NETWORK_CONFIG.tokenSymbol}`;
    }
    return `${formatBalanceUtil(amount)} ${NETWORK_CONFIG.tokenSymbol}`;
  }, []);

  // Refresh balance manually - preserves previous value during fetch
  const refresh = useCallback(async () => {
    console.log('[useBalance] refresh() called for address:', address);
    console.log('[useBalance] API connected:', apiService.isConnected());
    
    if (!address) {
      console.log('[useBalance] Skipping refresh - no address');
      return;
    }

    // Only set loading on first load, not during refresh
    if (isFirstLoad.current) {
      setIsLoading(true);
    }
    setError(null);

    try {
      if (!apiService.isConnected()) {
        console.log('[useBalance] API not connected, keeping existing balance');
        return;
      }
      
      console.log('[useBalance] Fetching balance...');
      const balanceInfo = await chainService.getBalance(address);
      console.log('[useBalance] Balance received:', JSON.stringify(balanceInfo));
      
      // Store in ref and state
      balanceRef.current = balanceInfo;
      setBalance(balanceInfo);
      isFirstLoad.current = false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch balance';
      setError(errorMessage);
      console.error('[useBalance] Error fetching balance:', err);
      // Don't reset balance on error - keep previous value from ref
      if (balanceRef.current && !balance) {
        setBalance(balanceRef.current);
      }
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Subscribe to balance changes - don't reset to null during subscription setup
  useEffect(() => {
    console.log('[useBalance] Subscription effect - address:', address);
    console.log('[useBalance] API connected:', apiService.isConnected());
    
    if (!address) {
      console.log('[useBalance] Skipping subscription - no address');
      // Reset state when address is cleared
      setBalance(null);
      balanceRef.current = null;
      setError(null);
      isFirstLoad.current = true;
      return;
    }

    if (!apiService.isConnected()) {
      console.log('[useBalance] Skipping subscription - not connected');
      // Don't clear balance - keep previous value if we have one
      return;
    }

    console.log('[useBalance] Setting up balance subscription...');
    // Only show loading on first load
    if (isFirstLoad.current) {
      setIsLoading(true);
    }
    setError(null);

    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = chainService.subscribeToBalance(address, (balanceInfo) => {
        console.log('[useBalance] Balance update received:', JSON.stringify(balanceInfo));
        balanceRef.current = balanceInfo;
        setBalance(balanceInfo);
        setIsLoading(false);
        setError(null);
        isFirstLoad.current = false;
      });
      console.log('[useBalance] Subscription set up successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to subscribe to balance';
      setError(errorMessage);
      setIsLoading(false);
      console.error('[useBalance] Error subscribing to balance:', err);
    }

    return () => {
      console.log('[useBalance] Cleaning up subscription');
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [address]);

  // Handle API connection changes
  useEffect(() => {
    const unsubscribe = apiService.onConnectionStateChange((state) => {
      console.log('[useBalance] Connection state changed:', state.status);
      if (state.status === 'connected' && address) {
        console.log('[useBalance] API connected, refreshing balance...');
        // Refresh balance when API reconnects
        refresh();
      } else if (state.status === 'disconnected') {
        console.log('[useBalance] API disconnected');
        setError('Network disconnected');
        // Don't clear balance on disconnect - keep showing last known value
      }
    });

    return unsubscribe;
  }, [address, refresh]);

  // Get effective balance - use ref as fallback during loading
  const effectiveBalance = balance || balanceRef.current;

  // Formatted balance strings - show previous value during loading
  const formattedBalance = effectiveBalance ? formatBalance(effectiveBalance.total) : `0 ${NETWORK_CONFIG.tokenSymbol}`;
  const formattedFreeBalance = effectiveBalance ? formatBalance(effectiveBalance.free) : `0 ${NETWORK_CONFIG.tokenSymbol}`;
  const formattedReservedBalance = effectiveBalance ? formatBalance(effectiveBalance.reserved) : `0 ${NETWORK_CONFIG.tokenSymbol}`;

  return {
    balance: effectiveBalance,
    formattedBalance,
    formattedFreeBalance,
    formattedReservedBalance,
    isLoading,
    error,
    refresh,
  };
}

/**
 * Hook for getting formatted balance without subscription (one-time fetch)
 */
export function useBalanceOnce(address?: string) {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address || !apiService.isConnected()) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const balanceInfo = await chainService.getBalance(address);
      setBalance(balanceInfo);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch balance';
      setError(errorMessage);
      console.error('Error fetching balance:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const formatBalance = useCallback((amount: string): string => {
    if (!amount || amount === '0') {
      return `0 ${NETWORK_CONFIG.tokenSymbol}`;
    }
    return chainService.formatBalance(amount);
  }, []);

  return {
    balance,
    formattedBalance: balance ? formatBalance(balance.total) : `0 ${NETWORK_CONFIG.tokenSymbol}`,
    formattedFreeBalance: balance ? formatBalance(balance.free) : `0 ${NETWORK_CONFIG.tokenSymbol}`,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
