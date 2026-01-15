/**
 * Shield screen - Convert tokens to private balance
 * Phase 2: Added token selector, devnet warning, bridge flow for external tokens
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BN } from '@polkadot/util';
import { useWallet } from '@/context/WalletContext';
import { useBalance } from '@/hooks/useBalance';
import { privacyService, generateStealthHash } from '@/services/privacy';
import { walletService } from '@/services/wallet';
import { apiService } from '@/services/api';
import { transactionService } from '@/services/transaction';
import { bridgeService } from '@/services/bridge';
import { transactionHistoryService } from '@/services/transactionHistory';
import { formatBalance, parseAmount } from '@/utils/balance';
import { THEME, GRADIENTS } from '@/constants/theme';
const TOKENS = [
  { id: 'CHML', symbol: 'CHML', outputSymbol: 'pCHML', name: 'Chameleon', color: '#6366F1', icon: 'diamond-outline', assetId: 0, requiresBridge: false },
  { id: 'BTC', symbol: 'BTC', outputSymbol: 'pBTC', name: 'Bitcoin', color: '#F7931A', icon: 'logo-bitcoin', assetId: 2, requiresBridge: true },
  { id: 'ETH', symbol: 'ETH', outputSymbol: 'pETH', name: 'Ethereum', color: '#627EEA', icon: 'logo-electron', assetId: 1, requiresBridge: true },
  { id: 'USDT', symbol: 'USDT', outputSymbol: 'pUSDT', name: 'Tether', color: '#26A17B', icon: 'logo-usd', assetId: 3, requiresBridge: true },
];

export default function ShieldScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet, refreshBalances, refreshPCHMLBalance } = useWallet();
  const { formattedFreeBalance, balance } = useBalance(wallet?.address);

  // Token selector state
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [showTokenSelector, setShowTokenSelector] = useState(false);

  // Read token param from navigation (for deep linking from bridge page)
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();

  // Pre-select token if passed via navigation
  useEffect(() => {
    if (tokenParam) {
      const preselected = TOKENS.find(t => t.id === tokenParam || t.symbol === tokenParam);
      if (preselected) {
        setSelectedToken(preselected);
      }
    }
  }, [tokenParam]);

  // Form state
  const [amount, setAmount] = useState('');
  const [isShielding, setIsShielding] = useState(false);
  const [feeEstimate, setFeeEstimate] = useState<any>(null);
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);
  const [publicBalance, setPublicBalance] = useState<any>(null);
  const [loadingPublicBalance, setLoadingPublicBalance] = useState(false);

  // Load balance when token or wallet changes
  useEffect(() => {
    loadBalance();
  }, [wallet?.address, selectedToken]);

  const loadBalance = async () => {
    if (!wallet?.address) return;

    setLoadingPublicBalance(true);
    try {
      const api = apiService.getApi();
      if (!api) {
        console.error('API not connected');
        setPublicBalance(null);
        return;
      }

      if (selectedToken.id === 'CHML') {
        // Native CHML balance
        const { data: { free } } = await api.query.system.account(wallet.address) as any;
        setPublicBalance({ free: free.toString() });
      } else {
        // pToken balance from pDEX
        // Note: tokenBalances query is (tokenId, address) - fixed parameter order
        const pTokenBalance = await api.query.pdex.tokenBalances(selectedToken.assetId, wallet.address) as any;
        setPublicBalance({ free: pTokenBalance.toString() });
      }
    } catch (error) {
      console.error('Error loading balance:', error);
      setPublicBalance(null);
    } finally {
      setLoadingPublicBalance(false);
    }
  };

  // Estimate fee when amount changes (CHML only)
  useEffect(() => {
    if (selectedToken.id === 'CHML' && amount && wallet?.address && parseFloat(amount) > 0) {
      estimateFee();
    } else {
      setFeeEstimate(null);
    }
  }, [amount, wallet?.address, selectedToken]);

  const estimateFee = async () => {
    if (!wallet?.address || !amount) return;

    setIsEstimatingFee(true);
    try {
      const amountBN = parseAmount(amount);
      const estimate = await transactionService.estimateFee(
        wallet.address,
        wallet.address,
        amountBN
      );
      setFeeEstimate(estimate);
    } catch (error) {
      console.error('Error estimating shield fee:', error);
      setFeeEstimate(null);
    } finally {
      setIsEstimatingFee(false);
    }
  };

  const handleMaxAmount = () => {
    if (!publicBalance) return;

    const balanceBN = new BN(publicBalance.free);
    
    if (selectedToken.id === 'CHML' && feeEstimate) {
      const feeBN = new BN(feeEstimate.partialFee);
      const maxAmount = balanceBN.sub(feeBN);
      if (maxAmount.gt(new BN(0))) {
        const formatted = formatBalance(maxAmount);
        setAmount(formatted.replace(/,/g, ''));
      }
    } else {
      const formatted = formatBalance(balanceBN);
      setAmount(formatted.replace(/,/g, ''));
    }
  };

  const handleTokenSelect = (token: typeof TOKENS[0]) => {
    setSelectedToken(token);
    setShowTokenSelector(false);
    setAmount('');
    setFeeEstimate(null);
  };

  const validateShield = (): string | null => {
    if (!wallet?.address) {
      return 'No wallet connected';
    }
    if (!amount || parseFloat(amount) <= 0) {
      return 'Enter amount';
    }
    if (!publicBalance || !publicBalance.free) {
      return 'Loading balance...';
    }

    const balanceBN = new BN(publicBalance.free);
    if (balanceBN.isZero()) {
      return 'Insufficient balance';
    }

    // For CHML, check fee. For bridge tokens, no fee check needed
    if (!selectedToken.requiresBridge && feeEstimate && feeEstimate.partialFee) {
      const amountBN = parseAmount(amount);
      const feeBN = new BN(feeEstimate.partialFee);
      const totalBN = amountBN.add(feeBN);

      if (totalBN.gt(balanceBN)) {
        return 'Insufficient balance (including fees)';
      }
    }

    return null;
  };

  const handleShield = async () => {
    const error = validateShield();
    if (error) {
      Alert.alert('Shield Error', error);
      return;
    }
    // For CHML need fee estimate, for bridge tokens we don't
    if (!wallet?.address) return;
    if (!selectedToken.requiresBridge && !feeEstimate) return;

    setIsShielding(true);

    try {
      const keyPair = await walletService.getOrDeriveKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked. Please try re-importing your wallet.');
      }

      const api = apiService.getApi();
      if (!api) {
        throw new Error('Not connected to network');
      }

      const amountBN = parseAmount(amount);
      let txHash: string;
      let successMessage: string;

      if (selectedToken.requiresBridge) {
        // External token - use bridge deposit
        const chainMap: Record<string, "Bitcoin" | "Ethereum" | "Polygon"> = {
          BTC: "Bitcoin", ETH: "Ethereum", USDT: "Ethereum",
        };
        const assetMap: Record<string, "BTC" | "ETH" | "USDT"> = {
          BTC: "BTC", ETH: "ETH", USDT: "USDT",
        };
        const chain = chainMap[selectedToken.id];
        const asset = assetMap[selectedToken.id];
        const result = await bridgeService.initiateDeposit(
          api, keyPair, chain, asset, amountBN, wallet.address
        );
        if (!result.success) {
          throw new Error(result.error || "Bridge deposit failed");
        }
        txHash = result.txHash || "";
        successMessage = "Bridge deposit initiated! Deposit ID: " + result.bridgeId + ". Send " + amount + " " + selectedToken.id + " to complete.";
        
        // Save bridge deposit to history
        try {
          await transactionHistoryService.saveTransaction(wallet.address, {
            hash: txHash || `bridge_${result.bridgeId}`,
            from: wallet.address,
            to: 'bridge',
            amount: amountBN.toString(),
            formattedAmount: `Bridge ${amount} ${selectedToken.symbol} → ${selectedToken.outputSymbol}`,
            status: 'pending',
            usedMEVProtection: false,
          });
        } catch (e) {
          console.error('[Shield] Failed to save bridge to history:', e);
        }
      } else {
        // CHML - use pdex.mintFromPublic to convert public CHML to pCHML
        txHash = await new Promise<string>((resolve, reject) => {
          api.tx.pdex.mintFromPublic(amountBN.toString())
            .signAndSend(keyPair, ({ status, dispatchError, txHash: hash }: any) => {
              if (status.isInBlock || status.isFinalized) {
                if (dispatchError) {
                  if (dispatchError.isModule) {
                    const decoded = api.registry.findMetaError(dispatchError.asModule);
                    reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`));
                  } else {
                    reject(new Error(dispatchError.toString()));
                  }
                } else {
                  resolve(hash?.toHex() || status.asInBlock.toString());
                }
              }
            }).catch(reject);
        });
        successMessage = "CHML shielded to pCHML! Transaction: " + txHash.slice(0, 10) + "...";
        // Save to transaction history
        try {
          await transactionHistoryService.saveTransaction(wallet.address, {
            hash: txHash,
            from: wallet.address,
            to: wallet.address,
            amount: amountBN.toString(),
            formattedAmount: `${amount} ${selectedToken.symbol} → ${amount} ${selectedToken.outputSymbol}`,
            status: 'finalized',
            usedMEVProtection: false,
          });
        } catch (e) {
          console.error('[Shield] Failed to save to history:', e);
        }
      }
      Alert.alert(
        'Shield Successful',
        successMessage,
        [
          {
            text: 'OK',
            onPress: async () => {
              setAmount('');
              setFeeEstimate(null);
              
              // Refresh all balances including pTokens
              await refreshBalances();
              await refreshPCHMLBalance();
              
              // Small delay to ensure state updates propagate and balance is refreshed
              setTimeout(async () => {
                // Force another balance refresh to ensure UI updates
                await refreshPCHMLBalance();
                router.back();
              }, 1500);
            }
          }
        ]
      );
    } catch (error) {
      console.error('Shield error:', error);
      let errorMessage = 'Unable to complete shielding. Please check your balance and try again.';
      if (error instanceof Error) {
        if (error.message.includes('Insufficient')) {
          errorMessage = 'Insufficient balance to complete shielding transaction.';
        } else if (error.message.includes('unlock')) {
          errorMessage = 'Please unlock your wallet or re-import it.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network connection issue. Please try again.';
        }
      }
      Alert.alert('Shield Failed', errorMessage);
    } finally {
      setIsShielding(false);
    }
  };

  const isFormReady = (): boolean => {
    // Bridge tokens don't need fee estimate
    if (selectedToken.requiresBridge) {
      return validateShield() === null && !!amount && parseFloat(amount) > 0;
    }
    return validateShield() === null && !!feeEstimate;
  };

  const getDisplayBalance = (): string => {
    if (loadingPublicBalance) return 'Loading...';
    if (!publicBalance || !publicBalance.free) return '0';
    return formatBalance(new BN(publicBalance.free)) + ' ' + selectedToken.symbol;
  };

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shield Tokens</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Devnet Warning */}
        <View style={styles.devnetWarning}>
          <Ionicons name="warning" size={18} color="#F59E0B" />
          <Text style={styles.devnetWarningText}>
            Devnet Mode - Test tokens only, no real value
          </Text>
        </View>

        {/* Token Selector */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Select Token</Text>
          <TouchableOpacity
            style={styles.tokenSelector}
            onPress={() => setShowTokenSelector(true)}
          >
            <View style={styles.tokenSelectorLeft}>
              <View style={[styles.tokenIcon, { backgroundColor: selectedToken.color + '20' }]}>
                {selectedToken.id === "CHML" ? (
                  <Image source={require("@/assets/images/Logo.png")} style={{ width: 24, height: 24 }} resizeMode="contain" />
                ) : (
                  <Ionicons name={selectedToken.icon as any} size={20} color={selectedToken.color} />
                )}
              </View>
              <View>
                <Text style={styles.tokenSymbol}>{selectedToken.symbol}</Text>
                <Text style={styles.tokenName}>{selectedToken.name}</Text>
              </View>
            </View>
            <Ionicons name="chevron-down" size={20} color={THEME.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="shield-checkmark" size={24} color={THEME.colors.primary} />
            <Text style={styles.infoTitle}>
              {selectedToken.requiresBridge ? 'Bridge Required' : 'Convert to Private'}
            </Text>
          </View>
          <Text style={styles.infoDescription}>
            {selectedToken.requiresBridge
              ? `To shield ${selectedToken.name}, you first need to bridge it from the ${selectedToken.name} network. This creates a wrapped ${selectedToken.symbol} token on Chameleon.`
              : 'Shield your tokens to make them private and untraceable. Shielded tokens can only be seen by you.'}
          </Text>
          {selectedToken.requiresBridge && (
            <View style={styles.bridgeNote}>
              <Ionicons name="information-circle" size={16} color={THEME.colors.primary} />
              <Text style={styles.bridgeNoteText}>
                Enter amount below to initiate bridge deposit
              </Text>
            </View>
          )}
        </View>

        {/* Balance Display (for bridged tokens) */}
        {selectedToken.requiresBridge && (
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Your {selectedToken.symbol} Balance</Text>
            <Text style={styles.balanceAmount}>{getDisplayBalance()}</Text>
            <Text style={styles.balanceNote}>
              These are already private tokens from genesis funding (devnet only)
            </Text>
          </View>
        )}

        {/* Amount Input - show for ALL tokens including bridge tokens */}
        {(
          <>
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Amount to Shield</Text>
              <View style={styles.inputRow}>
                <View style={[styles.inputContainer, { flex: 1, marginRight: THEME.spacing.sm }]}>
                  <TextInput
                    style={[styles.textInput, { fontSize: THEME.fontSize.xl }]}
                    placeholder="0.00"
                    placeholderTextColor={THEME.colors.textMuted}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.maxButton, !publicBalance && styles.maxButtonDisabled]}
                  onPress={handleMaxAmount}
                  disabled={!publicBalance}
                >
                  <Text style={styles.maxButtonText}>MAX</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.availableText}>Available: {getDisplayBalance()}</Text>
            </View>

            {/* Fee Estimate */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Network Fee</Text>
              <View style={styles.feeContainer}>
                {isEstimatingFee ? (
                  <View style={styles.feeEstimating}>
                    <ActivityIndicator size="small" color={THEME.colors.primary} />
                    <Text style={styles.feeEstimatingText}>Estimating fee...</Text>
                  </View>
                ) : feeEstimate ? (
                  <Text style={styles.feeAmount}>~{feeEstimate.formatted}</Text>
                ) : (
                  <Text style={styles.feePlaceholder}>Enter amount to estimate fee</Text>
                )}
              </View>
            </View>

            {/* Preview */}
            {amount && parseFloat(amount) > 0 && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Preview</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>You will receive:</Text>
                  <Text style={styles.previewAmount}>{amount} {selectedToken.outputSymbol} (Private)</Text>
                </View>
                <View style={styles.privacyBadge}>
                  <Ionicons name="eye-off" size={16} color={THEME.colors.success} />
                  <Text style={styles.privacyText}>Fully Private & Untraceable</Text>
                </View>
              </View>
            )}

            {/* Shield Button */}
            <TouchableOpacity
              style={[styles.shieldButton, !isFormReady() && styles.buttonDisabled]}
              onPress={handleShield}
              disabled={!isFormReady() || isShielding}
            >
              {isShielding ? (
                <ActivityIndicator size="small" color={THEME.colors.white} />
              ) : (
                <Text style={styles.shieldButtonText}>
                  {validateShield() || 'Shield Tokens'}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Token Selector Modal */}
      <Modal
        visible={showTokenSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTokenSelector(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTokenSelector(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <TouchableOpacity onPress={() => setShowTokenSelector(false)}>
                <Ionicons name="close" size={24} color={THEME.colors.text} />
              </TouchableOpacity>
            </View>
            {TOKENS.map((token) => (
              <TouchableOpacity
                key={token.id}
                style={[
                  styles.tokenOption,
                  selectedToken.id === token.id && styles.tokenOptionSelected,
                ]}
                onPress={() => handleTokenSelect(token)}
              >
                <View style={[styles.tokenIcon, { backgroundColor: token.color + '20' }]}>
                  {token.id === "CHML" ? (
                    <Image source={require("@/assets/images/Logo.png")} style={{ width: 24, height: 24 }} resizeMode="contain" />
                  ) : (
                    <Ionicons name={token.icon as any} size={20} color={token.color} />
                  )}
                </View>
                <View style={styles.tokenOptionInfo}>
                  <Text style={styles.tokenOptionSymbol}>{token.symbol}</Text>
                  <Text style={styles.tokenOptionName}>{token.name}</Text>
                </View>
                {token.requiresBridge && (
                  <View style={styles.bridgeRequiredBadge}>
                    <Text style={styles.bridgeRequiredText}>Bridge</Text>
                  </View>
                )}
                {selectedToken.id === token.id && (
                  <Ionicons name="checkmark-circle" size={24} color={THEME.colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  backButton: {
    padding: THEME.spacing.xs,
  },
  headerTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
    padding: THEME.spacing.lg,
  },
  devnetWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },
  devnetWarningText: {
    color: '#92400E',
    fontSize: THEME.fontSize.sm,
    marginLeft: THEME.spacing.xs,
    flex: 1,
  },
  inputSection: {
    marginBottom: THEME.spacing.lg,
  },
  inputLabel: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  tokenSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.sm,
  },
  tokenSymbol: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  tokenName: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  infoCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
    ...THEME.shadows.small,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  infoTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginLeft: THEME.spacing.sm,
  },
  infoDescription: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    lineHeight: 22,
  },
  bridgeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginTop: THEME.spacing.md,
  },
  bridgeButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    marginLeft: THEME.spacing.xs,
  },
  bridgeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: THEME.spacing.md,
    paddingTop: THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  bridgeNoteText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.primary,
    marginLeft: THEME.spacing.xs,
    flex: 1,
  },
  balanceCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
    ...THEME.shadows.small,
  },
  balanceLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  balanceAmount: {
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.xs,
  },
  balanceNote: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputContainer: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    ...THEME.shadows.small,
  },
  textInput: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
    padding: THEME.spacing.md,
  },
  maxButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.medium,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
  },
  maxButtonDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
  maxButtonText: {
    color: THEME.colors.white,
    fontWeight: THEME.fontWeight.semibold,
    fontSize: THEME.fontSize.sm,
  },
  availableText: {
    color: THEME.colors.textSecondary,
    fontSize: THEME.fontSize.sm,
    marginTop: THEME.spacing.xs,
  },
  feeContainer: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  feeEstimating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feeEstimatingText: {
    color: THEME.colors.textSecondary,
    marginLeft: THEME.spacing.sm,
    fontSize: THEME.fontSize.sm,
  },
  feeAmount: {
    color: THEME.colors.text,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.medium,
  },
  feePlaceholder: {
    color: THEME.colors.textMuted,
    fontSize: THEME.fontSize.base,
  },
  previewCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
    ...THEME.shadows.small,
  },
  previewTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  previewLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  previewAmount: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
    alignSelf: 'flex-start',
  },
  privacyText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.success,
    fontWeight: THEME.fontWeight.semibold,
    marginLeft: THEME.spacing.xs,
  },
  shieldButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
  },
  shieldButtonText: {
    color: THEME.colors.white,
    textAlign: 'center',
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  buttonDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: THEME.colors.white,
    borderTopLeftRadius: THEME.borderRadius.large,
    borderTopRightRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  tokenOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    marginBottom: THEME.spacing.sm,
  },
  tokenOptionSelected: {
    backgroundColor: THEME.colors.primaryLight,
  },
  tokenOptionInfo: {
    flex: 1,
    marginLeft: THEME.spacing.sm,
  },
  tokenOptionSymbol: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  tokenOptionName: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  bridgeRequiredBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
    marginRight: THEME.spacing.sm,
  },
  bridgeRequiredText: {
    fontSize: THEME.fontSize.xs,
    color: '#92400E',
    fontWeight: THEME.fontWeight.medium,
  },
});
