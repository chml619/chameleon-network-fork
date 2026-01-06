/**
 * Unshield screen - Convert private balance to public tokens
 * Phase 2: Added token selector, devnet warning, proper pToken balances
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BN } from '@polkadot/util';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/context/WalletContext';
import { privacyService, generateStealthHash } from '@/services/privacy';
import { walletService } from '@/services/wallet';
import { apiService } from '@/services/api';
import { bridgeService } from '@/services/bridge';
import { transactionService } from '@/services/transaction';
import { formatBalance, parseAmount } from '@/utils/balance';
import { transactionHistoryService } from '@/services/transactionHistory';
import { THEME, GRADIENTS } from '@/constants/theme';
const TOKENS = [
  { id: 'CHML', symbol: 'pCHML', outputSymbol: 'CHML', name: 'Chameleon', color: '#6366F1', icon: 'diamond-outline', assetId: 0, requiresBridge: false },
  { id: 'BTC', symbol: 'pBTC', outputSymbol: 'BTC', name: 'Bitcoin', color: '#F7931A', icon: 'logo-bitcoin', assetId: 2, requiresBridge: true },
  { id: 'ETH', symbol: 'pETH', outputSymbol: 'ETH', name: 'Ethereum', color: '#627EEA', icon: 'logo-electron', assetId: 1, requiresBridge: true },
  { id: 'USDT', symbol: 'pUSDT', outputSymbol: 'USDT', name: 'Tether', color: '#26A17B', icon: 'logo-usd', assetId: 3, requiresBridge: true },
];

export default function UnshieldScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet, refreshBalances, refreshPCHMLBalance, pchmlBalance } = useWallet();

  // Token selector state
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [showTokenSelector, setShowTokenSelector] = useState(false);

  // Form state
  const [amount, setAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [isValidAddress, setIsValidAddress] = useState(false);
  const [isUnshielding, setIsUnshielding] = useState(false);
  const [privateBalance, setPrivateBalance] = useState<BN>(new BN(0));
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [feeEstimate, setFeeEstimate] = useState<any>(null);
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);

  // Load balance when token or wallet changes
  useEffect(() => {
    loadPrivateBalance();
  }, [wallet?.address, selectedToken]);

  // Validate destination address
  useEffect(() => {
    if (destinationAddress.length > 0) {
      try {
        const valid = transactionService.validateAddress(destinationAddress);
        setIsValidAddress(valid);
      } catch {
        setIsValidAddress(false);
      }
    } else {
      setIsValidAddress(false);
    }
  }, [destinationAddress]);

  // Estimate fee when amount and destination change (CHML only)
  useEffect(() => {
    if (!selectedToken.requiresBridge && isValidAddress && amount && wallet?.address && parseFloat(amount) > 0) {
      estimateFee();
    } else {
      setFeeEstimate(null);
    }
  }, [destinationAddress, amount, isValidAddress, wallet?.address, selectedToken]);

  const loadPrivateBalance = async () => {
    if (!wallet?.address) return;

    setLoadingBalance(true);
    try {
      const api = apiService.getApi();
      if (!api) {
        console.log('API not connected');
        setPrivateBalance(new BN(0));
        return;
      }

      if (selectedToken.id === 'CHML') {
        // pCHML balance from context or pDEX
        if (pchmlBalance) {
          setPrivateBalance(pchmlBalance);
        } else {
          const pchmlBal = await api.query.pdex.tokenBalances(wallet.address, 0) as any;
          setPrivateBalance(new BN(pchmlBal.toString()));
        }
      } else {
        // pToken balance from pDEX
        const pTokenBalance = await api.query.pdex.tokenBalances(wallet.address, selectedToken.assetId) as any;
        setPrivateBalance(new BN(pTokenBalance.toString()));
      }
    } catch (error) {
      console.error('Error loading private balance:', error);
      setPrivateBalance(new BN(0));
    } finally {
      setLoadingBalance(false);
    }
  };

  const estimateFee = async () => {
    if (!wallet?.address || !isValidAddress || !amount) return;

    setIsEstimatingFee(true);
    try {
      const amountBN = parseAmount(amount);
      const estimate = await transactionService.estimateFee(
        wallet.address,
        destinationAddress,
        amountBN
      );
      setFeeEstimate(estimate);
    } catch (error) {
      console.error('Error estimating unshield fee:', error);
      setFeeEstimate(null);
    } finally {
      setIsEstimatingFee(false);
    }
  };

  const handlePasteAddress = async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync();
      if (clipboardContent) {
        setDestinationAddress(clipboardContent.trim());
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to paste from clipboard');
    }
  };

  const handleUseOwnAddress = () => {
    if (wallet?.address) {
      setDestinationAddress(wallet.address);
    }
  };

  const handleMaxAmount = () => {
    if (privateBalance.isZero()) return;
    const formatted = formatBalance(privateBalance);
    setAmount(formatted.replace(/,/g, ''));
  };

  const handleTokenSelect = (token: typeof TOKENS[0]) => {
    setSelectedToken(token);
    setShowTokenSelector(false);
    setAmount('');
    setFeeEstimate(null);
  };

  const validateUnshield = (): string | null => {
    if (!wallet?.address) {
      return 'No wallet connected';
    }
    if (!amount || parseFloat(amount) <= 0) {
      return 'Enter amount';
    }
    if (!isValidAddress) {
      return 'Enter valid destination';
    }
    if (privateBalance.isZero()) {
      return 'No private balance';
    }

    const amountBN = parseAmount(amount);
    if (amountBN.gt(privateBalance)) {
      return 'Insufficient private balance';
    }

    return null;
  };

  const handleUnshield = async () => {
    const error = validateUnshield();
    if (error) {
      Alert.alert('Unshield Error', error);
      return;
    }

    if (!wallet?.address) return;

    setIsUnshielding(true);

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
        // External token - use bridge withdrawal
        const chainMap: Record<string, "Bitcoin" | "Ethereum" | "Polygon"> = {
          BTC: "Bitcoin", ETH: "Ethereum", USDT: "Ethereum",
        };
        const assetMap: Record<string, "BTC" | "ETH" | "USDT"> = {
          BTC: "BTC", ETH: "ETH", USDT: "USDT",
        };
        const chain = chainMap[selectedToken.id];
        const asset = assetMap[selectedToken.id];
        const result = await bridgeService.initiateWithdrawal(
          api, keyPair, chain, asset, amountBN, destinationAddress
        );
        if (!result.success) {
          throw new Error(result.error || "Bridge withdrawal failed");
        }
        txHash = result.txHash || "";
        successMessage = "Bridge withdrawal initiated! Your " + amount + " " + selectedToken.id + " will be sent to " + destinationAddress.slice(0,10) + "...";
        
        // Save bridge withdrawal to history
        try {
          await transactionHistoryService.saveTransaction(wallet.address, {
            hash: txHash || `bridge_withdraw_${Date.now()}`,
            from: wallet.address,
            to: destinationAddress,
            amount: amountBN.toString(),
            formattedAmount: `Withdraw ${amount} ${selectedToken.symbol} → ${selectedToken.outputSymbol}`,
            status: 'pending',
            usedMEVProtection: false,
          });
        } catch (e) {
          console.error('[Unshield] Failed to save bridge withdrawal to history:', e);
        }
      } else {
        // CHML - use privacy unshield
        privacyService.setApi(api);
        const stealthMetaAddress = { spendPubkey: keyPair.publicKey, viewPubkey: keyPair.publicKey };
        const inputStealthHash = generateStealthHash(stealthMetaAddress);
        txHash = await privacyService.unshield(keyPair, inputStealthHash, amountBN, destinationAddress);
        successMessage = "Tokens unshielded successfully! Transaction: " + txHash.slice(0, 10) + "...";
        
        // Save unshield to transaction history
        try {
          await transactionHistoryService.saveTransaction(wallet.address, {
            hash: txHash,
            from: wallet.address,
            to: destinationAddress,
            amount: amountBN.toString(),
            formattedAmount: `${amount} ${selectedToken.symbol} → ${amount} ${selectedToken.outputSymbol}`,
            status: 'finalized',
            usedMEVProtection: false,
          });
        } catch (e) {
          console.error('[Unshield] Failed to save to history:', e);
        }
      }

      Alert.alert(
        "Unshield Successful",
        successMessage,
        [
          {
            text: "OK",
            onPress: () => {
              setAmount("");
              setDestinationAddress("");
              setFeeEstimate(null);
              loadPrivateBalance();
              refreshBalances();
              refreshPCHMLBalance();
              router.back();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Unshield error:', error);
      Alert.alert(
        'Unshield Failed',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setIsUnshielding(false);
    }
  };

  const isFormReady = (): boolean => {
    return validateUnshield() === null && (selectedToken.requiresBridge || !!feeEstimate);
  };

  const getDisplayBalance = (): string => {
    if (loadingBalance) return 'Loading...';
    return formatBalance(privateBalance) + ' ' + selectedToken.symbol;
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
        <Text style={styles.headerTitle}>Unshield Tokens</Text>
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

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your {selectedToken.symbol} Balance</Text>
          <Text style={styles.balanceAmount}>{getDisplayBalance()}</Text>
          {selectedToken.requiresBridge && (
            <Text style={styles.balanceNote}>
              To withdraw to {selectedToken.name} network, use the Bridge
            </Text>
          )}
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="eye-outline" size={24} color="#F59E0B" />
            <Text style={styles.infoTitle}>
              {selectedToken.requiresBridge ? 'Bridge Withdrawal' : 'Convert to Public'}
            </Text>
          </View>
          <Text style={styles.infoDescription}>
            {selectedToken.requiresBridge
              ? `To withdraw ${selectedToken.symbol} to the ${selectedToken.name} network, you need to use the Bridge. This will burn your ${selectedToken.symbol} and release native ${selectedToken.id} to your external wallet.`
              : 'Unshield your private tokens to make them public again. The destination address will be visible on-chain.'}
          </Text>
          {selectedToken.requiresBridge && (
            <TouchableOpacity
              style={styles.bridgeButton}
              onPress={() => router.push('/bridge')}
            >
              <Ionicons name="git-branch-outline" size={18} color={THEME.colors.white} />
              <Text style={styles.bridgeButtonText}>Go to Bridge</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Unshield Form (CHML only) */}
        {!selectedToken.requiresBridge && (
          <>
            {/* Destination Address */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Destination Address</Text>
              <View style={styles.addressInputContainer}>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Enter or paste address"
                  placeholderTextColor={THEME.colors.textMuted}
                  value={destinationAddress}
                  onChangeText={setDestinationAddress}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.addressButtons}>
                  <TouchableOpacity style={styles.addressButton} onPress={handlePasteAddress}>
                    <Ionicons name="clipboard-outline" size={18} color={THEME.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addressButton} onPress={handleUseOwnAddress}>
                    <Ionicons name="person-outline" size={18} color={THEME.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              {destinationAddress.length > 0 && (
                <View style={styles.addressValidation}>
                  <Ionicons
                    name={isValidAddress ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={isValidAddress ? THEME.colors.success : THEME.colors.error}
                  />
                  <Text style={[
                    styles.addressValidationText,
                    { color: isValidAddress ? THEME.colors.success : THEME.colors.error }
                  ]}>
                    {isValidAddress ? 'Valid address' : 'Invalid address'}
                  </Text>
                </View>
              )}
            </View>

            {/* Amount Input */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Amount to Unshield</Text>
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
                  style={[styles.maxButton, privateBalance.isZero() && styles.maxButtonDisabled]}
                  onPress={handleMaxAmount}
                  disabled={privateBalance.isZero()}
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
                  <Text style={styles.feePlaceholder}>Enter amount and address to estimate</Text>
                )}
              </View>
            </View>

            {/* Preview */}
            {amount && parseFloat(amount) > 0 && isValidAddress && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Preview</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Recipient will receive:</Text>
                  <Text style={styles.previewAmount}>{amount} CHML (Public)</Text>
                </View>
                <View style={styles.warningBadge}>
                  <Ionicons name="eye" size={16} color="#F59E0B" />
                  <Text style={styles.warningText}>Transaction will be visible on-chain</Text>
                </View>
              </View>
            )}

            {/* Unshield Button */}
            <TouchableOpacity
              style={[styles.unshieldButton, !isFormReady() && styles.buttonDisabled]}
              onPress={handleUnshield}
              disabled={!isFormReady() || isUnshielding}
            >
              {isUnshielding ? (
                <ActivityIndicator size="small" color={THEME.colors.white} />
              ) : (
                <Text style={styles.unshieldButtonText}>
                  {validateUnshield() || 'Unshield Tokens'}
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
  addressInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    ...THEME.shadows.small,
  },
  addressInput: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.text,
    padding: THEME.spacing.md,
  },
  addressButtons: {
    flexDirection: 'row',
    paddingRight: THEME.spacing.sm,
  },
  addressButton: {
    padding: THEME.spacing.sm,
  },
  addressValidation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: THEME.spacing.xs,
  },
  addressValidationText: {
    fontSize: THEME.fontSize.sm,
    marginLeft: THEME.spacing.xs,
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
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C720',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
    alignSelf: 'flex-start',
  },
  warningText: {
    fontSize: THEME.fontSize.xs,
    color: '#F59E0B',
    fontWeight: THEME.fontWeight.semibold,
    marginLeft: THEME.spacing.xs,
  },
  unshieldButton: {
    backgroundColor: '#F59E0B',
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
  },
  unshieldButtonText: {
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
