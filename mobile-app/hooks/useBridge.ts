/**
 * Bridge Hook
 * Manages cross-chain bridge state and operations
 */

import { useState, useCallback, useEffect } from 'react';
import { BN } from '@polkadot/util';
import { useApi } from './useApi';
import { useWallet } from '@/context/WalletContext';
import {
  bridgeService,
  ChainInfo,
  BridgeableAsset,
  BridgeQuote,
  BridgeTransaction,
  BridgeResult,
  SUPPORTED_CHAINS,
} from '@/services/bridge';
import { walletService } from '@/services/wallet';

export function useBridge() {
  const { api } = useApi();
  const { wallet } = useWallet();
  
  const [sourceChain, setSourceChain] = useState<ChainInfo>(SUPPORTED_CHAINS[1]); // Ethereum default
  const [destChain, setDestChain] = useState<ChainInfo>(SUPPORTED_CHAINS[0]); // Chameleon default
  const [selectedAsset, setSelectedAsset] = useState<BridgeableAsset | null>(null);
  const [amount, setAmount] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isBridging, setIsBridging] = useState(false);
  const [pendingBridges, setPendingBridges] = useState<BridgeTransaction[]>([]);
  const [bridgeHistory, setBridgeHistory] = useState<BridgeTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Get supported chains
  const supportedChains = bridgeService.getSupportedChains();

  // Get bridgeable assets for current chain pair
  const bridgeableAssets = bridgeService.getBridgeableAssets(
    sourceChain.id,
    destChain.id
  );

  // Set default asset when chains change
  useEffect(() => {
    if (bridgeableAssets.length > 0 && !selectedAsset) {
      setSelectedAsset(bridgeableAssets[0]);
    }
  }, [bridgeableAssets, selectedAsset]);

  // Set dest address from wallet when connected
  useEffect(() => {
    if (wallet?.address && destChain.id === 'chameleon') {
      setDestAddress(wallet.address);
    }
  }, [wallet?.address, destChain.id]);

  // Fetch quote when inputs change
  useEffect(() => {
    if (api && selectedAsset && amount && parseFloat(amount) > 0) {
      fetchQuote();
    } else {
      setQuote(null);
    }
  }, [api, sourceChain.id, destChain.id, selectedAsset?.symbol, amount]);

  // Poll pending bridges
  useEffect(() => {
    const interval = setInterval(() => {
      updatePendingBridges();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [api]);

  const fetchQuote = useCallback(async () => {
    if (!api || !selectedAsset || !amount || parseFloat(amount) <= 0) return;
    
    setIsLoadingQuote(true);
    setError(null);
    
    try {
      const bridgeQuote = await bridgeService.getBridgeQuote(
        api,
        sourceChain.id,
        destChain.id,
        selectedAsset.symbol,
        amount
      );
      setQuote(bridgeQuote);
    } catch (err) {
      console.error('[Bridge Hook] Error fetching quote:', err);
      setError('Failed to get bridge quote');
    } finally {
      setIsLoadingQuote(false);
    }
  }, [api, sourceChain.id, destChain.id, selectedAsset?.symbol, amount]);

  const updatePendingBridges = useCallback(async () => {
    const pending = bridgeService.getPendingBridges();
    setPendingBridges(pending);
    
    const history = bridgeService.getBridgeHistory();
    setBridgeHistory(history);
  }, []);

  const swapChains = useCallback(() => {
    const temp = sourceChain;
    setSourceChain(destChain);
    setDestChain(temp);
    setSelectedAsset(null);
    setAmount('');
    setQuote(null);
  }, [sourceChain, destChain]);

  const initiateBridge = useCallback(async (): Promise<BridgeResult> => {
    if (!api || !wallet?.address || !selectedAsset || !destAddress) {
      return { success: false, error: 'Missing requirements' };
    }
    
    setIsBridging(true);
    setError(null);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const amountBN = new BN(parseFloat(amount) * Math.pow(10, selectedAsset.decimals));
      
      const result = await bridgeService.initiateBridge(
        api,
        keyPair,
        sourceChain.id,
        destChain.id,
        selectedAsset.symbol,
        amountBN,
        destAddress
      );
      
      if (result.success) {
        setAmount('');
        setQuote(null);
        updatePendingBridges();
      } else {
        setError(result.error || 'Bridge failed');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Bridge failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsBridging(false);
    }
  }, [api, wallet?.address, selectedAsset, destAddress, sourceChain.id, destChain.id, amount, updatePendingBridges]);

  const getBridgeStatus = useCallback(async (bridgeId: string): Promise<BridgeTransaction | null> => {
    if (!api) return null;
    return bridgeService.getBridgeStatus(api, bridgeId);
  }, [api]);

  return {
    supportedChains,
    bridgeableAssets,
    sourceChain,
    destChain,
    selectedAsset,
    amount,
    destAddress,
    quote,
    isLoadingQuote,
    isBridging,
    pendingBridges,
    bridgeHistory,
    error,
    setSourceChain,
    setDestChain,
    setSelectedAsset,
    setAmount,
    setDestAddress,
    swapChains,
    initiateBridge,
    getBridgeStatus,
    refetch: updatePendingBridges,
  };
}
