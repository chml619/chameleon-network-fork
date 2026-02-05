/**
 * pDEX Hook
 * Manages privacy DEX state and swap operations
 */

import { useState, useCallback, useEffect } from 'react';
import { useApi } from './useApi';
import { useWallet } from '@/context/WalletContext';
import { pdexService, TokenInfo, SwapQuote, SwapResult, PDEX_TOKENS } from '@/services/pdex';
import { walletService } from '@/services/wallet';
import { chainService } from '@/services/chain';

export function usePDEX() {
  const { api, connectionState } = useApi();
  const { wallet } = useWallet();
  
  const [tokens, setTokens] = useState<TokenInfo[]>(PDEX_TOKENS);
  const [selectedTokenIn, setSelectedTokenIn] = useState<TokenInfo>(PDEX_TOKENS[0]);
  const [selectedTokenOut, setSelectedTokenOut] = useState<TokenInfo>(PDEX_TOKENS[1]);
  const [amountIn, setAmountIn] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [mevProtection, setMevProtection] = useState(pdexService.isMEVProtectionEnabled());
  const [error, setError] = useState<string | null>(null);

  // Fetch token balances
  useEffect(() => {
    if (api && wallet?.address && connectionState.status === 'connected') {
      fetchTokenBalances();
    }
  }, [api, wallet?.address, connectionState.status]);

  // Fetch quote when inputs change
  useEffect(() => {
    if (api && amountIn && parseFloat(amountIn) > 0) {
      fetchQuote();
    } else {
      setQuote(null);
    }
  }, [api, selectedTokenIn.symbol, selectedTokenOut.symbol, amountIn]);

  const fetchTokenBalances = useCallback(async () => {
    if (!api || !wallet?.address) return;

    try {
      console.log('[SWAP DEBUG] fetchTokenBalances called');
      console.log('[SWAP DEBUG] Fetching for address:', wallet.address);
      const tokensWithBalances = await pdexService.getTokensWithBalances(api, wallet.address);
      console.log('[SWAP DEBUG] Fetched balances:', tokensWithBalances.map(t => `${t.symbol}: ${t.balance}`).join(', '));
      setTokens(tokensWithBalances);

      // Update selected tokens with new balances
      const updatedTokenIn = tokensWithBalances.find(t => t.symbol === selectedTokenIn.symbol);
      const updatedTokenOut = tokensWithBalances.find(t => t.symbol === selectedTokenOut.symbol);

      console.log('[SWAP DEBUG] Updated tokenIn:', updatedTokenIn?.symbol, updatedTokenIn?.balance);
      console.log('[SWAP DEBUG] Updated tokenOut:', updatedTokenOut?.symbol, updatedTokenOut?.balance);

      if (updatedTokenIn) setSelectedTokenIn(updatedTokenIn);
      if (updatedTokenOut) setSelectedTokenOut(updatedTokenOut);
    } catch (err) {
      console.error('[pDEX Hook] Error fetching balances:', err);
    }
  }, [api, wallet?.address, selectedTokenIn.symbol, selectedTokenOut.symbol]);

  const fetchQuote = useCallback(async () => {
    if (!api || !amountIn || parseFloat(amountIn) <= 0) return;
    
    setIsLoadingQuote(true);
    setError(null);
    
    try {
      // Validate amount is not too large
      const amount = parseFloat(amountIn);
      if (amount > 1000000) {
        throw new Error('Amount too large');
      }
      
      const swapQuote = await pdexService.getSwapQuote(
        api,
        selectedTokenIn.symbol,
        selectedTokenOut.symbol,
        amountIn
      );
      setQuote(swapQuote);
    } catch (err) {
      console.error('[pDEX Hook] Error fetching quote:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to get quote';
      setError(errorMessage);
      setQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [api, selectedTokenIn.symbol, selectedTokenOut.symbol, amountIn]);

  const swapTokens = useCallback(() => {
    const temp = selectedTokenIn;
    setSelectedTokenIn(selectedTokenOut);
    setSelectedTokenOut(temp);
    setAmountIn('');
    setQuote(null);
  }, [selectedTokenIn, selectedTokenOut]);

  const selectTokenIn = useCallback((token: TokenInfo) => {
    if (token.symbol === selectedTokenOut.symbol) {
      swapTokens();
    } else {
      setSelectedTokenIn(token);
    }
  }, [selectedTokenOut.symbol, swapTokens]);

  const selectTokenOut = useCallback((token: TokenInfo) => {
    if (token.symbol === selectedTokenIn.symbol) {
      swapTokens();
    } else {
      setSelectedTokenOut(token);
    }
  }, [selectedTokenIn.symbol, swapTokens]);

  const toggleMEVProtection = useCallback(() => {
    const newMode = !mevProtection;
    setMevProtection(newMode);
    pdexService.setMEVProtection(newMode);
  }, [mevProtection]);

  const setMaxAmount = useCallback(() => {
    if (selectedTokenIn.balance) {
      const balanceNum = selectedTokenIn.balance.split(' ')[0].replace(/,/g, '');
      setAmountIn(balanceNum);
    }
  }, [selectedTokenIn.balance]);

  const validateSwap = useCallback(() => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      return 'Please enter an amount';
    }
    
    if (!quote) {
      return 'Getting quote...';
    }
    
    // Check if user has sufficient balance
    const amount = parseFloat(amountIn);
    const balance = parseFloat(selectedTokenIn.balance.split(' ')[0].replace(/,/g, ''));
    
    if (amount > balance) {
      return 'Insufficient balance';
    }
    
    // Check for high price impact
    const priceImpact = parseFloat(quote.priceImpact.replace('%', ''));
    if (priceImpact > 5) {
      return 'Price impact too high';
    }
    
    return null;
  }, [amountIn, quote, selectedTokenIn.balance]);

  const executeSwap = useCallback(async (): Promise<SwapResult> => {
    if (!api || !wallet?.address || !quote) {
      return { success: false, error: 'Missing requirements' };
    }

    setIsSwapping(true);
    setError(null);

    try {
      // Get or derive keyPair (handles wallet restore from storage)
      const keyPair = await walletService.getOrDeriveKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked. Please try re-importing your wallet.');
      }

      const amountInBN = chainService.parseBalance(amountIn);
      // Calculate min amount out with 0.5% slippage
      const amountOutNum = parseFloat(quote.amountOut.split(' ')[0]);
      const minAmountOut = chainService.parseBalance((amountOutNum * 0.995).toString());

      const result = await pdexService.executeSwap(
        api,
        keyPair,
        selectedTokenIn.symbol,
        selectedTokenOut.symbol,
        amountInBN,
        minAmountOut
      );

      if (result.success) {
        console.log('[SWAP DEBUG] Swap succeeded, txHash:', result.txHash);
        console.log('[SWAP DEBUG] TokenIn:', selectedTokenIn.symbol, 'TokenOut:', selectedTokenOut.symbol);
        console.log('[SWAP DEBUG] Balances BEFORE refresh - TokenIn:', selectedTokenIn.balance, 'TokenOut:', selectedTokenOut.balance);

        // Wait for chain state to propagate after transaction finalizes
        console.log('[SWAP DEBUG] Waiting 2s for chain state propagation...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Query chain DIRECTLY using the SAME api instance used for swap
        // This bypasses pdexService which might have a different api instance
        const tokenInId = selectedTokenIn.tokenId ?? 0;
        const tokenOutId = selectedTokenOut.tokenId ?? 0;

        let chainTokenInRaw = '0';
        let chainTokenOutRaw = '0';
        try {
          const balIn = await (api.query.pdex as any).tokenBalances(wallet.address, tokenInId);
          chainTokenInRaw = balIn.toString();
          const balOut = await (api.query.pdex as any).tokenBalances(wallet.address, tokenOutId);
          chainTokenOutRaw = balOut.toString();
        } catch (e) {
          console.log('[SWAP DEBUG] Direct chain query failed:', e);
        }

        const chainTokenInFormatted = chainService.formatBalance(chainTokenInRaw, 12, selectedTokenIn.symbol);
        const chainTokenOutFormatted = chainService.formatBalance(chainTokenOutRaw, 12, selectedTokenOut.symbol);

        console.log('[SWAP DEBUG] Clearing balance cache...');
        pdexService.clearBalanceCache();

        console.log('[SWAP DEBUG] Calling fetchTokenBalances...');
        await fetchTokenBalances();
        console.log('[SWAP DEBUG] Balance refresh complete');

        // Log post-swap balance info for debugging
        console.log('[SWAP DEBUG] Chain balances after swap:', {
          [selectedTokenIn.symbol]: chainTokenInFormatted,
          [selectedTokenOut.symbol]: chainTokenOutFormatted,
        });

        setAmountIn('');
        setQuote(null);
      } else {
        setError(result.error || 'Swap failed');
      }

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Swap failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsSwapping(false);
    }
  }, [api, wallet?.address, quote, amountIn, selectedTokenIn, selectedTokenOut, fetchTokenBalances]);

  return {
    tokens,
    selectedTokenIn,
    selectedTokenOut,
    amountIn,
    quote,
    isLoadingQuote,
    isSwapping,
    mevProtection,
    error,
    setAmountIn,
    selectTokenIn,
    selectTokenOut,
    swapTokens,
    toggleMEVProtection,
    setMaxAmount,
    validateSwap,
    executeSwap,
    refetchBalances: fetchTokenBalances,
  };
}
