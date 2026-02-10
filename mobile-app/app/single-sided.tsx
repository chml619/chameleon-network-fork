/**
 * Single-Sided Liquidity Provision Screen
 */
import React, { useState, useEffect } from 'react';
import {
  Image,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  TextInput,
} from 'react-native';
import {
  useRouter } from 'expo-router';
import {
  Ionicons } from '@expo/vector-icons';
import {
  LinearGradient } from 'expo-linear-gradient';
import {
  useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useWallet } from '@/context/WalletContext';
import {
  useApi } from '@/hooks/useApi';
import {
  walletService } from '@/services/wallet';
import {
  singleSidedService, LockTier, LOCK_TIER_INFO } from '@/services/singleSided';
import {
  pdexService } from '@/services/pdex';
import {
  THEME, GRADIENTS } from '@/constants/theme';
import { transactionHistoryService } from '@/services/transactionHistory';
import { notificationService } from '@/services/notifications';
import { parseAmount } from '@/utils/balance';

const TOKENS = [
  { id: 0, symbol: 'pCHML', name: 'Privacy CHML', color: '#6366F1' },
  { id: 1, symbol: 'pETH', name: 'Privacy ETH', color: '#627EEA' },
  { id: 2, symbol: 'pBTC', name: 'Privacy BTC', color: '#F7931A' },
  { id: 3, symbol: 'pUSDT', name: 'Privacy USDT', color: '#26A17B' },
];

export default function SingleSidedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api } = useApi();
  const { wallet, refreshBalances } = useWallet();

  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [selectedTier, setSelectedTier] = useState<LockTier>(LockTier.NoLock);
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadBalance();
  }, [api, wallet, selectedToken]);

  const loadBalance = async () => {
    if (!api || !wallet?.address) return;
    setIsLoading(true);
    try {
      const bal = await pdexService.getTokenBalance(selectedToken.id, wallet.address);
      setBalance(singleSidedService.formatAmount(bal.toString()));
    } catch (error) {
      console.error('Error loading balance:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProvision = async () => {
    if (!api || !wallet || !amount) return;

    const keyPair = await walletService.getOrDeriveKeyPair();
    if (!keyPair) {
      Alert.alert('Error', 'Wallet not unlocked');
      return;
    }

    const amountBN = parseAmount(amount);
    if (amountBN.isZero()) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    Alert.alert(
      'Confirm Provision',
      `Provide ${amount} ${selectedToken.symbol} with ${LOCK_TIER_INFO[selectedTier].label} lock?\n\nReward share: ${LOCK_TIER_INFO[selectedTier].share} of single-sided pool`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsSubmitting(true);
            let provisionSuccess = false;
            let provisionError = '';

            try {
              const result = await singleSidedService.provisionSingleSided(
                api,
                keyPair,
                selectedToken.id,
                amountBN,
                selectedTier
              );

              if (result.success) {
                provisionSuccess = true;
                // Save to transaction history (wrapped in try-catch to ensure Alert shows)
                try {
                  transactionHistoryService.saveTransaction(wallet.address, {
                    hash: `ss_provision_${Date.now()}`,
                    from: wallet.address,
                    to: 'Single-Sided Pool',
                    amount: amountBN.toString(),
                    formattedAmount: `${amount} ${selectedToken.symbol}`,
                    status: 'finalized',
                    usedMEVProtection: false,
                    type: 'add_liquidity',
                  });
                } catch (historyError) {
                  console.error('[SingleSided] Failed to save transaction history:', historyError);
                }
                try {
                  notificationService.addNotification('success', `Provided ${amount} ${selectedToken.symbol} single-sided liquidity!`);
                } catch (notifError) {
                  console.error('[SingleSided] Failed to add notification:', notifError);
                }
                // Wait for chain state to propagate before refreshing balances
                await new Promise(resolve => setTimeout(resolve, 1500));
                // Refresh balances in try-catch to ensure Alert shows even if refresh fails
                try {
                  if (refreshBalances) await refreshBalances();
                } catch (refreshError) {
                  console.error('[SingleSided] Balance refresh error:', refreshError);
                }
              } else {
                provisionError = result.error || 'Failed to provision';
                notificationService.addNotification('error', provisionError);
              }
            } catch (error) {
              provisionError = 'Transaction failed';
              notificationService.addNotification('error', 'Single-sided provision failed');
            } finally {
              setIsSubmitting(false);
            }

            // Show Alert OUTSIDE the try-finally block with a small delay
            // to ensure the confirmation dialog has fully dismissed
            setTimeout(() => {
              if (provisionSuccess) {
                Alert.alert(
                  'Success',
                  `Successfully provided ${amount} ${selectedToken.symbol} with ${LOCK_TIER_INFO[selectedTier].label} lock!`,
                  [{ text: 'OK', onPress: () => router.back() }]
                );
              } else if (provisionError) {
                Alert.alert('Error', provisionError);
              }
            }, 100);
          },
        },
      ]
    );
  };

  const handleMax = () => {
    const balNum = parseFloat(balance.replace(/,/g, ''));
    if (balNum > 0) {
      setAmount(balNum.toString());
    }
  };

  return (
    <LinearGradient colors={GRADIENTS.background.colors} style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Single-Sided Liquidity</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color={THEME.colors.primary} />
          <Text style={styles.infoText}>
            Provide single tokens to earn rewards. Longer lock periods earn higher rewards. No impermanent loss risk.
          </Text>
        </View>

        {/* Token Selection */}
        <Text style={styles.sectionTitle}>Select Token</Text>
        <View style={styles.tokenGrid}>
          {TOKENS.map((token) => (
            <TouchableOpacity
              key={token.id}
              style={[
                styles.tokenCard,
                selectedToken.id === token.id && styles.tokenCardSelected,
                { borderColor: selectedToken.id === token.id ? token.color : THEME.colors.border }
              ]}
              onPress={() => setSelectedToken(token)}
            >
              {token.symbol === "pCHML" ? (
                <Image source={require("@/assets/images/Logo.png")} style={{width: 40, height: 40}} resizeMode="contain" />
              ) : token.symbol === "pBTC" ? (
                <Image source={require("@/assets/images/tokens/btc.png")} style={{width: 40, height: 40}} resizeMode="contain" />
              ) : token.symbol === "pETH" ? (
                <Image source={require("@/assets/images/tokens/eth.png")} style={{width: 40, height: 40}} resizeMode="contain" />
              ) : token.symbol === "pUSDT" ? (
                <Image source={require("@/assets/images/tokens/usdt.png")} style={{width: 40, height: 40}} resizeMode="contain" />
              ) : (
                <View style={[styles.tokenIcon, { backgroundColor: token.color + "20" }]}><Text style={[styles.tokenIconText, { color: token.color }]}>{token.symbol.charAt(0)}</Text></View>
              )}
              <Text style={styles.tokenSymbol}>{token.symbol}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Lock Tier Selection */}
        <Text style={styles.sectionTitle}>Lock Period</Text>
        <View style={styles.tierContainer}>
          {Object.entries(LOCK_TIER_INFO).map(([tier, info]) => (
            <TouchableOpacity
              key={tier}
              style={[
                styles.tierCard,
                selectedTier === tier && styles.tierCardSelected,
              ]}
              onPress={() => setSelectedTier(tier as LockTier)}
            >
              <View style={styles.tierHeader}>
                <Text style={[styles.tierLabel, selectedTier === tier && styles.tierLabelSelected]}>
                  {info.label}
                </Text>
                {selectedTier === tier && (
                  <Ionicons name="checkmark-circle" size={20} color={THEME.colors.primary} />
                )}
              </View>
              <Text style={styles.tierShare}>{info.share} reward share</Text>
              {tier !== 'NoLock' && (
                <Text style={styles.tierMultiplier}>{info.multiplier}x vs no lock</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Amount Input */}
        <Text style={styles.sectionTitle}>Amount</Text>
        <View style={styles.amountCard}>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Available:</Text>
            <Text style={styles.balanceValue}>
              {isLoading ? '...' : `${balance} ${selectedToken.symbol}`}
            </Text>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.amountInput}
              placeholder="0.0"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <TouchableOpacity style={styles.maxButton} onPress={handleMax}>
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, (!amount || isSubmitting) && styles.submitButtonDisabled]}
          onPress={handleProvision}
          disabled={!amount || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={THEME.colors.white} />
          ) : (
            <>
              <Ionicons name="water" size={20} color={THEME.colors.white} />
              <Text style={styles.submitButtonText}>Provide Liquidity</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  backButton: { padding: THEME.spacing.xs },
  headerTitle: { fontSize: THEME.fontSize.lg, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text },
  content: { flex: 1, paddingHorizontal: THEME.spacing.md },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.primary + '10',
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    marginBottom: THEME.spacing.lg,
    gap: THEME.spacing.sm,
  },
  infoText: { flex: 1, fontSize: THEME.fontSize.sm, color: THEME.colors.text, lineHeight: 20 },
  sectionTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  tokenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: THEME.spacing.sm, marginBottom: THEME.spacing.lg },
  tokenCard: {
    width: '48%',
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.borderRadius.medium,
    borderWidth: 2,
    alignItems: 'center',
  },
  tokenCardSelected: { backgroundColor: THEME.colors.primary + '10' },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: THEME.spacing.xs,
  },
  tokenIconText: { fontSize: THEME.fontSize.lg, fontWeight: THEME.fontWeight.bold },
  tokenSymbol: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.semibold, color: THEME.colors.text },
  tierContainer: { gap: THEME.spacing.sm, marginBottom: THEME.spacing.lg },
  tierCard: {
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.borderRadius.medium,
    borderWidth: 2,
    borderColor: THEME.colors.border,
  },
  tierCardSelected: { borderColor: THEME.colors.primary, backgroundColor: THEME.colors.primary + '10' },
  tierHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierLabel: { fontSize: THEME.fontSize.base, fontWeight: THEME.fontWeight.semibold, color: THEME.colors.text },
  tierLabelSelected: { color: THEME.colors.primary },
  tierShare: { fontSize: THEME.fontSize.sm, color: THEME.colors.success, marginTop: THEME.spacing.xs },
  tierMultiplier: { fontSize: THEME.fontSize.xs, color: THEME.colors.textMuted },
  amountCard: {
    backgroundColor: THEME.colors.card,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    marginBottom: THEME.spacing.lg,
  },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: THEME.spacing.sm },
  balanceLabel: { fontSize: THEME.fontSize.sm, color: THEME.colors.textMuted },
  balanceValue: { fontSize: THEME.fontSize.sm, color: THEME.colors.text, fontWeight: THEME.fontWeight.medium },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  amountInput: {
    flex: 1,
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    padding: 0,
  },
  maxButton: {
    backgroundColor: THEME.colors.primary + '20',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
  },
  maxButtonText: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.bold, color: THEME.colors.primary },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.primary,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.xl,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontSize: THEME.fontSize.base, fontWeight: THEME.fontWeight.bold, color: THEME.colors.white },
});
