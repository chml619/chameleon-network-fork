/**
 * Unshield screen - Convert private balance to external tokens
 * Bridge exit point from privacy
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
import { transactionService } from '@/services/transaction';
import { formatBalance, parseAmount } from '@/utils/balance';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function UnshieldScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet, refreshBalances, refreshPCHMLBalance } = useWallet();
  
  // Form state
  const [amount, setAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [isValidAddress, setIsValidAddress] = useState(false);
  const [isUnshielding, setIsUnshielding] = useState(false);
  const [privateBalance, setPrivateBalance] = useState<BN>(new BN(0));
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [feeEstimate, setFeeEstimate] = useState<any>(null);
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);

  // Load private balance on mount
  useEffect(() => {
    loadPrivateBalance();
  }, [wallet?.address]);

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

  // Estimate fee when amount and destination change
  useEffect(() => {
    if (isValidAddress && amount && wallet?.address && parseFloat(amount) > 0) {
      estimateFee();
    } else {
      setFeeEstimate(null);
    }
  }, [destinationAddress, amount, isValidAddress, wallet?.address]);

  const loadPrivateBalance = async () => {
    if (!wallet?.address) return;
    
    setLoadingBalance(true);
    try {
      const api = apiService.getApi();
      if (!api) {
        console.log('API not connected, using mock balance');
        setPrivateBalance(new BN('1000000000000000000')); // 1 CHML mock
        return;
      }
      
      privacyService.setApi(api);
      
      // Generate stealth hash for this wallet
      const keyPair = walletService.getKeyPair();
      if (keyPair) {
        const stealthMetaAddress = {
          spendPubkey: keyPair.publicKey,
          viewPubkey: keyPair.publicKey, // Simplified for demo
        };
        const stealthHash = generateStealthHash(stealthMetaAddress);
        
        const balance = await privacyService.getPrivateBalance(stealthHash);
        setPrivateBalance(balance);
      }
    } catch (error) {
      console.error('Error loading private balance:', error);
      // Use mock balance for demo
      setPrivateBalance(new BN('1000000000000000000')); // 1 CHML mock
    } finally {
      setLoadingBalance(false);
    }
  };

  const estimateFee = async () => {
    if (!wallet?.address || !isValidAddress || !amount) return;
    
    setIsEstimatingFee(true);
    try {
      const amountBN = parseAmount(amount);
      // For unshield, we estimate a basic transfer fee as placeholder
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

  const handleMaxAmount = () => {
    if (privateBalance.isZero()) return;
    
    // For private balance, we don't need to subtract fees from the private amount
    // Fees are paid from public balance
    const formatted = formatBalance(privateBalance);
    setAmount(formatted.replace(/,/g, ''));
  };

  const validateUnshield = (): string | null => {
    if (!wallet?.address) {
      return 'No wallet connected';
    }
    if (!destinationAddress) {
      return 'Please enter destination address';
    }
    if (!isValidAddress) {
      return 'Invalid destination address';
    }
    if (!amount || parseFloat(amount) <= 0) {
      return 'Please enter a valid amount';
    }
    if (privateBalance.isZero()) {
      return 'No private balance available';
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

    if (!wallet?.address || !feeEstimate) return;
    
    setIsUnshielding(true);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const api = apiService.getApi();
      if (!api) {
        throw new Error('Not connected to network');
      }
      
      // Set API for privacy service
      privacyService.setApi(api);
      
      const amountBN = parseAmount(amount);
      
      // Generate stealth hash for the input (current private balance)
      const stealthMetaAddress = {
        spendPubkey: keyPair.publicKey,
        viewPubkey: keyPair.publicKey, // Simplified for demo
      };
      const inputStealthHash = generateStealthHash(stealthMetaAddress);
      
      // Unshield the tokens
      const txHash = await privacyService.unshield(
        keyPair,
        inputStealthHash,
        amountBN,
        destinationAddress
      );
      
      Alert.alert(
        'Unshield Successful',
        `Tokens unshielded successfully!\nTransaction: ${txHash.slice(0, 10)}...\nSent to: ${destinationAddress.slice(0, 8)}...`,
        [
          {
            text: 'OK',
            onPress: () => {
              setAmount('');
              setDestinationAddress('');
              setFeeEstimate(null);
              loadPrivateBalance(); // Refresh private balance
              refreshPCHMLBalance(); // Refresh pCHML balance
              refreshBalances(); // Refresh all balances
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
    return validateUnshield() === null && !!feeEstimate;
  };

  const getButtonText = (): string => {
    const error = validateUnshield();
    if (error) return error;
    if (!feeEstimate) return 'Estimating fee...';
    return 'Unshield Tokens';
  };

  const formatPrivateBalance = (): string => {
    if (loadingBalance) return 'Loading...';
    if (privateBalance.isZero()) return '0 CHML';
    return formatBalance(privateBalance) + ' CHML';
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
        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="eye" size={24} color={THEME.colors.warning} />
            <Text style={styles.infoTitle}>Convert to Public</Text>
          </View>
          <Text style={styles.infoDescription}>
            Unshield your private tokens to make them publicly visible. 
            Use this to send to external addresses or exchanges.
          </Text>
        </View>

        {/* Private Balance */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Private Balance</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceAmount}>{formatPrivateBalance()}</Text>
            {loadingBalance && (
              <ActivityIndicator size="small" color={THEME.colors.primary} />
            )}
          </View>
          <View style={styles.privacyBadge}>
            <Ionicons name="eye-off" size={14} color={THEME.colors.success} />
            <Text style={styles.privacyText}>Fully Private</Text>
          </View>
        </View>

        {/* Destination Address Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Destination Address</Text>
          <View style={styles.inputRow}>
            <View style={[styles.inputContainer, { flex: 1, marginRight: THEME.spacing.sm }]}>
              <TextInput
                style={styles.textInput}
                placeholder="Enter destination address"
                placeholderTextColor={THEME.colors.textMuted}
                value={destinationAddress}
                onChangeText={setDestinationAddress}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={handlePasteAddress}>
              <Ionicons name="clipboard-outline" size={20} color={THEME.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {destinationAddress.length > 0 && !isValidAddress && (
            <Text style={styles.errorText}>Invalid address format</Text>
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
              style={[
                styles.maxButton,
                privateBalance.isZero() && styles.maxButtonDisabled,
              ]}
              onPress={handleMaxAmount}
              disabled={privateBalance.isZero()}
            >
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Fee Estimate */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Network Fee (from public balance)</Text>
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
        {amount && parseFloat(amount) > 0 && isValidAddress && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Preview</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Recipient will receive:</Text>
              <Text style={styles.previewAmount}>{amount} CHML (Public)</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>To address:</Text>
              <Text style={styles.previewAddress}>
                {destinationAddress.slice(0, 8)}...{destinationAddress.slice(-8)}
              </Text>
            </View>
            <View style={styles.warningBadge}>
              <Ionicons name="warning" size={16} color={THEME.colors.warning} />
              <Text style={styles.warningText}>Will be publicly visible</Text>
            </View>
          </View>
        )}

        {/* Unshield Button */}
        <TouchableOpacity
          style={[
            styles.unshieldButton,
            !isFormReady() && styles.buttonDisabled,
          ]}
          onPress={handleUnshield}
          disabled={!isFormReady() || isUnshielding}
        >
          {isUnshielding ? (
            <ActivityIndicator size="small" color={THEME.colors.white} />
          ) : (
            <Text style={styles.unshieldButtonText}>{getButtonText()}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
    padding: THEME.spacing.lg,
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
  balanceCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
    ...THEME.shadows.small,
  },
  balanceLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.sm,
  },
  balanceAmount: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
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
  inputSection: {
    marginBottom: THEME.spacing.lg,
  },
  inputLabel: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
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
  iconButton: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
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
  errorText: {
    color: THEME.colors.error,
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
  previewAddress: {
    fontSize: THEME.fontSize.sm,
    fontFamily: 'monospace',
    color: THEME.colors.text,
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
    alignSelf: 'flex-start',
  },
  warningText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.warning,
    fontWeight: THEME.fontWeight.semibold,
    marginLeft: THEME.spacing.xs,
  },
  unshieldButton: {
    backgroundColor: THEME.colors.warning,
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
});