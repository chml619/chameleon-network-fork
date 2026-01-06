/**
 * Staking Hook
 * Manages staking state and operations
 * Updated to support vNode management (registerNode, startUnbonding, completeUnbonding, deleteNode)
 */

import { useState, useCallback, useEffect } from 'react';
import { BN } from '@polkadot/util';
import { useApi } from './useApi';
import { useWallet } from '@/context/WalletContext';
import { stakingService, StakingInfo, ValidatorInfo, StakingResult, NodeStatus } from '@/services/staking';
import { walletService } from '@/services/wallet';
import { chainService } from '@/services/chain';

export function useStaking() {
  const { api, connectionState } = useApi();
  const { wallet } = useWallet();
  
  const [stakingInfo, setStakingInfo] = useState<StakingInfo | null>(null);
  const [validators, setValidators] = useState<ValidatorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStaking, setIsStaking] = useState(false);
  const [isUnstaking, setIsUnstaking] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isStartingUnbond, setIsStartingUnbond] = useState(false);
  const [isCompletingUnbond, setIsCompletingUnbond] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>('None');

  // Fetch staking info when API and wallet are available
  useEffect(() => {
    if (api && wallet?.address && connectionState.status === 'connected') {
      fetchStakingInfo();
      fetchValidators();
    }
  }, [api, wallet?.address, connectionState.status]);

  const fetchStakingInfo = useCallback(async () => {
    if (!api || !wallet?.address) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const info = await stakingService.getStakingInfo(api, wallet.address);
      setStakingInfo(info);
      
      // Also fetch node status
      const status = await stakingService.getNodeStatus(api, wallet.address);
      setNodeStatus(status);
    } catch (err) {
      console.error('[Staking Hook] Error fetching info:', err);
      setError('Failed to fetch staking info');
    } finally {
      setIsLoading(false);
    }
  }, [api, wallet?.address]);

  const fetchValidators = useCallback(async () => {
    if (!api) return;
    
    try {
      const validatorList = await stakingService.getValidators(api);
      setValidators(validatorList);
    } catch (err) {
      console.error('[Staking Hook] Error fetching validators:', err);
    }
  }, [api]);

  const stake = useCallback(async (amount: string): Promise<StakingResult> => {
    if (!api || !wallet?.address) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    setIsStaking(true);
    setError(null);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const amountBN = chainService.parseBalance(amount);
      const result = await stakingService.stake(api, keyPair, amountBN);
      
      if (result.success) {
        // Refresh staking info
        await fetchStakingInfo();
      } else {
        setError(result.error || 'Staking failed');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Staking failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsStaking(false);
    }
  }, [api, wallet?.address, fetchStakingInfo]);

  const unstake = useCallback(async (amount: string): Promise<StakingResult> => {
    if (!api || !wallet?.address) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    setIsUnstaking(true);
    setError(null);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const amountBN = chainService.parseBalance(amount);
      const result = await stakingService.unstake(api, keyPair, amountBN);
      
      if (result.success) {
        await fetchStakingInfo();
      } else {
        setError(result.error || 'Unstaking failed');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unstaking failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsUnstaking(false);
    }
  }, [api, wallet?.address, fetchStakingInfo]);

  const claimRewards = useCallback(async (): Promise<StakingResult> => {
    if (!api || !wallet?.address) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    setIsClaiming(true);
    setError(null);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const result = await stakingService.claimRewards(api, keyPair);
      
      if (result.success) {
        await fetchStakingInfo();
      } else {
        setError(result.error || 'Claim failed');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Claim failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsClaiming(false);
    }
  }, [api, wallet?.address, fetchStakingInfo]);

  const calculateEstimatedRewards = useCallback((amount: string, days: number = 365): string => {
    if (!stakingInfo) return '0 CHML';
    
    try {
      const amountBN = chainService.parseBalance(amount);
      const rewards = stakingService.calculateEstimatedRewards(amountBN, stakingInfo.apy, days);
      return chainService.formatBalance(rewards.toString());
    } catch {
      return '0 CHML';
    }
  }, [stakingInfo]);

  // Register as a validator node
  const registerNode = useCallback(async (): Promise<StakingResult> => {
    if (!api || !wallet?.address) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    setIsRegistering(true);
    setError(null);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const result = await stakingService.registerNode(api, keyPair);
      
      if (result.success) {
        await fetchStakingInfo();
      } else {
        setError(result.error || 'Node registration failed');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Node registration failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsRegistering(false);
    }
  }, [api, wallet?.address, fetchStakingInfo]);

  // Start the 7-day unbonding cooldown period
  const startUnbonding = useCallback(async (): Promise<StakingResult> => {
    if (!api || !wallet?.address) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    setIsStartingUnbond(true);
    setError(null);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const result = await stakingService.startUnbonding(api, keyPair);
      
      if (result.success) {
        await fetchStakingInfo();
      } else {
        setError(result.error || 'Start unbonding failed');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Start unbonding failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsStartingUnbond(false);
    }
  }, [api, wallet?.address, fetchStakingInfo]);

  // Complete unbonding after cooldown period
  const completeUnbonding = useCallback(async (): Promise<StakingResult> => {
    if (!api || !wallet?.address) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    setIsCompletingUnbond(true);
    setError(null);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const result = await stakingService.completeUnbonding(api, keyPair);
      
      if (result.success) {
        await fetchStakingInfo();
      } else {
        setError(result.error || 'Complete unbonding failed');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Complete unbonding failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsCompletingUnbond(false);
    }
  }, [api, wallet?.address, fetchStakingInfo]);

  // Delete/remove node from the chain
  const deleteNode = useCallback(async (): Promise<StakingResult> => {
    if (!api || !wallet?.address) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    setIsDeleting(true);
    setError(null);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const result = await stakingService.deleteNode(api, keyPair);
      
      if (result.success) {
        await fetchStakingInfo();
      } else {
        setError(result.error || 'Delete node failed');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Delete node failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsDeleting(false);
    }
  }, [api, wallet?.address, fetchStakingInfo]);

  // Get node status
  const getNodeStatus = useCallback(async (): Promise<NodeStatus> => {
    if (!api || !wallet?.address) {
      return 'None';
    }
    
    try {
      return await stakingService.getNodeStatus(api, wallet.address);
    } catch (err) {
      console.error('[Staking Hook] Error getting node status:', err);
      return 'None';
    }
  }, [api, wallet?.address]);

  return {
    stakingInfo,
    validators,
    isLoading,
    isStaking,
    isUnstaking,
    isClaiming,
    isRegistering,
    isStartingUnbond,
    isCompletingUnbond,
    isDeleting,
    error,
    stake,
    unstake,
    claimRewards,
    registerNode,
    startUnbonding,
    completeUnbonding,
    deleteNode,
    getNodeStatus,
    calculateEstimatedRewards,
    refetch: fetchStakingInfo,
  };
}
