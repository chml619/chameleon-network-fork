/**
 * Liquidity Hook
 * Manages LP positions, pools, and rewards
 */

import { useState, useCallback, useEffect } from 'react';
import { BN } from '@polkadot/util';
import { useApi } from './useApi';
import { useWallet } from '@/context/WalletContext';
import { pdexService, LPPoolInfo, LPPosition, LPResult } from '@/services/pdex';
import { walletService } from '@/services/wallet';

export function useLiquidity() {
  const { connectionState } = useApi();
  const { wallet } = useWallet();

  const [pools, setPools] = useState<LPPoolInfo[]>([]);
  const [positions, setPositions] = useState<LPPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch pools and positions
  const fetchData = useCallback(async () => {
    if (!wallet?.address) {
      setPools([]);
      setPositions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [poolsData, positionsData] = await Promise.all([
        pdexService.getLPPools(wallet.address),
        pdexService.getLPPositions(wallet.address),
      ]);
      setPools(poolsData);
      setPositions(positionsData);
    } catch (err) {
      console.error('[useLiquidity] Error fetching data:', err);
      setError('Failed to fetch liquidity data');
    } finally {
      setIsLoading(false);
    }
  }, [wallet?.address]);

  // Fetch on mount and connection changes
  useEffect(() => {
    if (connectionState.status === 'connected' || connectionState.status === 'connecting') {
      fetchData();
    }
  }, [connectionState.status, fetchData]);

  // Add liquidity to a pool
  const addLiquidity = useCallback(async (
    poolId: number,
    amountA: BN,
    amountB: BN,
    minLpTokens: BN = new BN(0)
  ): Promise<LPResult> => {
    const keyPair = walletService.getKeyPair();
    if (!keyPair) {
      return { success: false, error: 'Wallet not unlocked' };
    }

    setIsAdding(true);
    setError(null);

    try {
      const result = await pdexService.addLiquidity(keyPair, poolId, amountA, amountB, minLpTokens);
      if (result.success) {
        // Refresh data after successful add
        await fetchData();
      } else {
        setError(result.error || 'Add liquidity failed');
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Add liquidity failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsAdding(false);
    }
  }, [fetchData]);

  // Remove liquidity from a pool
  const removeLiquidity = useCallback(async (
    poolId: number,
    lpAmount: BN,
    minAmountA: BN = new BN(0),
    minAmountB: BN = new BN(0)
  ): Promise<LPResult> => {
    const keyPair = walletService.getKeyPair();
    if (!keyPair) {
      return { success: false, error: 'Wallet not unlocked' };
    }

    setIsRemoving(true);
    setError(null);

    try {
      const result = await pdexService.removeLiquidity(keyPair, poolId, lpAmount, minAmountA, minAmountB);
      if (result.success) {
        // Refresh data after successful removal
        await fetchData();
      } else {
        setError(result.error || 'Remove liquidity failed');
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Remove liquidity failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsRemoving(false);
    }
  }, [fetchData]);

  // Claim LP rewards
  const claimRewards = useCallback(async (poolId: number): Promise<LPResult> => {
    const keyPair = walletService.getKeyPair();
    if (!keyPair) {
      return { success: false, error: 'Wallet not unlocked' };
    }

    setIsClaiming(true);
    setError(null);

    try {
      const result = await pdexService.claimLPRewards(keyPair, poolId);
      if (result.success) {
        // Refresh data after successful claim
        await fetchData();
      } else {
        setError(result.error || 'Claim rewards failed');
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Claim rewards failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsClaiming(false);
    }
  }, [fetchData]);

  // Calculate total pending rewards across all positions
  const totalPendingRewards = positions.reduce(
    (sum, pos) => sum.add(pos.pendingRewards),
    new BN(0)
  );

  // Check if user has any LP positions
  const hasPositions = positions.length > 0;

  return {
    pools,
    positions,
    isLoading,
    isAdding,
    isRemoving,
    isClaiming,
    error,
    totalPendingRewards,
    hasPositions,
    addLiquidity,
    removeLiquidity,
    claimRewards,
    refetch: fetchData,
  };
}
