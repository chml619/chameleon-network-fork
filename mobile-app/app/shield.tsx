/**
 * Shield screen - Convert external tokens to private balance
 * Bridge entry point for privacy
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
import { useWallet } from '@/context/WalletContext';
import { useBalance } from '@/hooks/useBalance';
import { privacyService, generateStealthHash } from '@/services/privacy';
import { walletService } from '@/services/wallet';
import { apiService } from '@/services/api';
import { transactionService } from '@/services/transaction';
import { formatBalance, parseAmount } from '@/utils/balance';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function ShieldScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();
  const { formattedFreeBalance, balance } = useBalance(wallet?.address);
  
  // Form state
  const [amount, setAmount] = useState('');
  const [isShielding, setIsShielding] = useState(false);
  const [feeEstimate, setFeeEstimate] = useState<any>(null);
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);
  const [publicBalance, setPublicBalance] = useState<any>(null);
  const [loadingPublicBalance, setLoadingPublicBalance] = useState(false);

  // Load public balance on mount
  useEffect(() => {
    loadPublicBalance();
  }, [wallet?.address]);

  const loadPublicBalance = async () => {
    if (!wallet?.address) return;
    
    setLoadingPublicBalance(true);
    try {
      const api = apiService.getApi();
      if (!api) {
        console.log('API not connected, using hook balance');
        setPublicBalance(balance);
        return;
      }
      
      const { data: { free } } = await api.query.system.account(wallet.address) as any;
      const publicBalanceBN = new BN(free.toString());
      setPublicBalance({ free: publicBalanceBN.toString() });
    } catch (error) {
      console.error('Error loading public balance:', error);
      // Fallback to hook balance
      setPublicBalance(balance);
    } finally {
      setLoadingPublicBalance(false);
    }
  };

  // Estimate fee when amount changes
  useEffect(() => {
    if (amount && wallet?.address && parseFloat(amount) > 0) {
      estimateFee();
    } else {
      setFeeEstimate(null);
    }
  }, [amount, wallet?.address]);

  const estimateFee = async () => {
    if (!wallet?.address || !amount) return;
    
    setIsEstimatingFee(true);
    try {
      const amountBN = parseAmount(amount);
      // For shield, we estimate a basic transfer fee as placeholder
      const estimate = await transactionService.estimateFee(
        wallet.address, 
        wallet.address, // Self-transfer for fee estimation
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
    const currentBalance = publicBalance || balance;
    if (!currentBalance || !feeEstimate) return;
    
    const balanceBN = new BN(currentBalance.free);
    const feeBN = new BN(feeEstimate.partialFee);
    const maxAmount = balanceBN.sub(feeBN);
    
    if (maxAmount.gt(new BN(0))) {
      // Use centralized formatBalance utility, remove commas for input field
      const formatted = formatBalance(maxAmount);
      setAmount(formatted.replace(/,/g, ''));
    }
  };

  const validateShield = (): string | null => {
    if (!wallet?.address) {
      return 'No wallet connected';
    }
    if (!amount || parseFloat(amount) <= 0) {
      return 'Please enter a valid amount';
    }
    
    const currentBalance = publicBalance || balance;
    if (!currentBalance || !currentBalance.free) {
      return 'Loading balance...';
    }
    
    const balanceBN = new BN(currentBalance.free);
    if (balanceBN.isZero()) {
      return 'Insufficient public balance';
    }
    
    if (feeEstimate && feeEstimate.partialFee) {
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

    if (!wallet?.address || !feeEstimate) return;
    
    setIsShielding(true);
    
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
      
      // Generate stealth hash for receiving the shielded tokens
      // In a real implementation, this would be derived from wallet seed
      const stealthMetaAddress = {
        spendPubkey: keyPair.publicKey,
        viewPubkey: keyPair.publicKey, // Simplified for demo
      };
      const outputStealthHash = generateStealthHash(stealthMetaAddress);
      
      // Shield the tokens
      const txHash = await privacyService.shield(
        keyPair,
        amountBN,
        outputStealthHash
      );
      
      Alert.alert(
        'Shield Successful',
        `Tokens shielded successfully!\nTransaction: ${txHash.slice(0, 10)}...`,
        [
          {
            text: 'OK',
            onPress: () => {
              setAmount('');
              setFeeEstimate(null);
              loadPublicBalance(); // Refresh balance
              router.back();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Shield error:', error);
      Alert.alert(
        'Shield Failed',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setIsShielding(false);
    }
  };

  const isFormReady = (): boolean => {
    return validateShield() === null && !!feeEstimate;
  };

  const getButtonText = (): string => {
    const error = validateShield();
    if (error) return error;
    if (!feeEstimate) return 'Estimating fee...';
    return 'Shield Tokens';
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
        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="shield-checkmark" size={24} color={THEME.colors.primary} />
            <Text style={styles.infoTitle}>Convert to Private</Text>
          </View>
          <Text style={styles.infoDescription}>
            Shield your tokens to make them private and untraceable. 
            Shielded tokens can only be seen by you.
          </Text>
        </View>

        {/* Amount Input */}
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
              style={[
                styles.maxButton,
                (!publicBalance && !balance) && styles.maxButtonDisabled,
              ]}
              onPress={handleMaxAmount}
              disabled={!publicBalance && !balance}
            >
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.availableText}>
            Available: {loadingPublicBalance ? 'Loading...' : 
              (publicBalance ? formatBalance(publicBalance.free) + ' CHML' : formattedFreeBalance)}
          </Text>
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
              <Text style={styles.previewAmount}>{amount} CHML (Private)</Text>
            </View>
            <View style={styles.privacyBadge}>
              <Ionicons name="eye-off" size={16} color={THEME.colors.success} />
              <Text style={styles.privacyText}>Fully Private & Untraceable</Text>
            </View>
          </View>
        )}

        {/* Shield Button */}
        <TouchableOpacity
          style={[
            styles.shieldButton,
            !isFormReady() && styles.buttonDisabled,
          ]}
          onPress={handleShield}
          disabled={!isFormReady() || isShielding}
        >
          {isShielding ? (
            <ActivityIndicator size="small" color={THEME.colors.white} />
          ) : (
            <Text style={styles.shieldButtonText}>{getButtonText()}</Text>
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
});