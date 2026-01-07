/**
 * Stake Node Screen
 * Stake exactly 1,750 pCHML to activate a validator node
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '@/hooks/useApi';
import { useWallet } from '@/context/WalletContext';
import { walletService } from '@/services/wallet';
import { stakingService } from '@/services/staking';
import { pdexService } from '@/services/pdex';
import { THEME, GRADIENTS } from '@/constants/theme';
import BN from 'bn.js';

// Fixed stake amount for validator nodes
const FIXED_STAKE = 1750;

export default function StakeNodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { nodeId } = useLocalSearchParams<{ nodeId: string }>();
  const { api } = useApi();
  const { wallet, refreshPCHMLBalance, pchmlBalance } = useWallet();
  
  const [pCHMLBalance, setPCHMLBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(true);
  const [isStaking, setIsStaking] = useState(false);

  useEffect(() => {
    loadBalance();
  }, [wallet?.address, pchmlBalance]);

  const loadBalance = async () => {
    setIsLoading(true);
    try {
      if (pchmlBalance) {
        const formatted = (pchmlBalance.toNumber() / Math.pow(10, 12)).toFixed(2);
        setPCHMLBalance(formatted);
      } else if (api && wallet?.address) {
        const balance = await pdexService.getTokenBalance(0, wallet.address);
        const formatted = (balance.toNumber() / Math.pow(10, 12)).toFixed(2);
        setPCHMLBalance(formatted);
      }
    } catch (error) {
      console.error('Error loading balance:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if user can stake (has enough pCHML)
  const canStake = parseFloat(pCHMLBalance) >= FIXED_STAKE;

  const handleStake = async () => {
    if (!canStake) {
      Alert.alert('Insufficient Balance', `You need ${FIXED_STAKE.toLocaleString()} pCHML to stake. You have ${pCHMLBalance} pCHML.`);
      return;
    }

    if (!api || !wallet) {
      Alert.alert('Connection Error', 'Unable to connect to the network. Please check your internet connection.');
      return;
    }

    const keyPair = await walletService.getOrDeriveKeyPair();
    if (!keyPair) {
      Alert.alert('Wallet Locked', 'Please unlock your wallet or re-import it to continue staking.');
      return;
    }

    setIsStaking(true);
    try {
      // Convert fixed stake amount to chain units (12 decimals)
      const amountBN = new BN(Math.floor(FIXED_STAKE * Math.pow(10, 12)).toString());
      
      const result = await stakingService.stake(api, keyPair, amountBN);

      if (result.success) {
        if (refreshPCHMLBalance) await refreshPCHMLBalance();
        Alert.alert(
          '🎉 Staking Successful!',
          `You have staked ${FIXED_STAKE.toLocaleString()} pCHML.\n\nYour node will become active once selected for the validator set. You'll start earning rewards when active.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Staking Failed', result.error || 'Unknown error occurred');
      }
    } catch (error) {
      let errorMessage = 'Unable to stake tokens. Please check your balance and try again.';
      if (error instanceof Error) {
        if (error.message.includes('Insufficient')) {
          errorMessage = 'Insufficient pCHML balance to stake. You need 1,750 pCHML.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network connection issue. Please try again.';
        }
      }
      Alert.alert('Staking Failed', errorMessage);
    } finally {
      setIsStaking(false);
    }
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
        <Text style={styles.headerTitle}>Stake pCHML</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceIcon}>
            <Ionicons name="wallet" size={28} color={THEME.colors.white} />
          </View>
          <Text style={styles.balanceLabel}>Your pCHML Balance</Text>
          <Text style={styles.balanceAmount}>
            {isLoading ? '...' : parseFloat(pCHMLBalance).toLocaleString()}
          </Text>
          <Text style={styles.balanceSymbol}>pCHML</Text>
        </View>

        {/* Fixed Stake Amount Card */}
        <View style={styles.stakeAmountCard}>
          <View style={styles.stakeAmountHeader}>
            <Ionicons name="lock-closed" size={24} color={THEME.colors.primary} />
            <Text style={styles.stakeAmountTitle}>Validator Stake</Text>
          </View>
          <Text style={styles.stakeAmountFixed}>{FIXED_STAKE.toLocaleString()}</Text>
          <Text style={styles.stakeAmountSymbol}>pCHML</Text>
          <View style={styles.stakeAmountNote}>
            <Ionicons name="information-circle" size={16} color={THEME.colors.textMuted} />
            <Text style={styles.stakeAmountNoteText}>Fixed stake requirement for all validators</Text>
          </View>
        </View>

        {/* Validation Warning */}
        {!isLoading && !canStake && (
          <View style={styles.warningCard}>
            <Ionicons name="warning" size={20} color="#D97706" />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Insufficient Balance</Text>
              <Text style={styles.warningText}>
                You need {FIXED_STAKE.toLocaleString()} pCHML to stake. You currently have {parseFloat(pCHMLBalance).toLocaleString()} pCHML.
              </Text>
            </View>
          </View>
        )}

        {/* Success Indicator when balance is sufficient */}
        {!isLoading && canStake && (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={20} color="#059669" />
            <Text style={styles.successText}>
              You have enough pCHML to stake!
            </Text>
          </View>
        )}

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>What happens when you stake?</Text>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark" size={16} color={THEME.colors.primary} />
            <Text style={styles.infoText}>Your {FIXED_STAKE.toLocaleString()} pCHML will be locked</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark" size={16} color={THEME.colors.primary} />
            <Text style={styles.infoText}>Node status changes to "Waiting"</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark" size={16} color={THEME.colors.primary} />
            <Text style={styles.infoText}>Earn rewards when node becomes "Active"</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark" size={16} color={THEME.colors.primary} />
            <Text style={styles.infoText}>7-day unbonding period to unstake</Text>
          </View>
        </View>

        {/* Stake Button */}
        <TouchableOpacity
          style={[styles.stakeButton, (!canStake || isStaking) && styles.buttonDisabled]}
          onPress={handleStake}
          disabled={!canStake || isStaking}
        >
          {isStaking ? (
            <ActivityIndicator color={THEME.colors.white} />
          ) : (
            <>
              <Ionicons name="lock-closed" size={20} color={THEME.colors.white} />
              <Text style={styles.stakeButtonText}>
                {canStake ? `Stake ${FIXED_STAKE.toLocaleString()} pCHML` : 'Insufficient Balance'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 100 }} />
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
    paddingVertical: THEME.spacing.sm,
  },
  backButton: { padding: THEME.spacing.xs },
  headerTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
  },
  scrollView: { flex: 1 },
  balanceCard: {
    backgroundColor: THEME.colors.primary,
    margin: THEME.spacing.md,
    padding: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
    ...THEME.shadows.medium,
  },
  balanceIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  balanceLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.white,
    opacity: 0.8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.white,
    marginTop: THEME.spacing.xs,
  },
  balanceSymbol: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.white,
    opacity: 0.8,
  },
  stakeAmountCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
    ...THEME.shadows.small,
  },
  stakeAmountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },
  stakeAmountTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold as any,
    color: THEME.colors.text,
  },
  stakeAmountFixed: {
    fontSize: 48,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.primary,
  },
  stakeAmountSymbol: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.medium as any,
    color: THEME.colors.textSecondary,
    marginTop: -THEME.spacing.xs,
  },
  stakeAmountNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: THEME.spacing.md,
    gap: THEME.spacing.xs,
  },
  stakeAmountNoteText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    borderLeftWidth: 4,
    borderLeftColor: '#D97706',
    gap: THEME.spacing.sm,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.bold as any,
    color: '#92400E',
    marginBottom: 2,
  },
  warningText: {
    fontSize: THEME.fontSize.sm,
    color: '#92400E',
    lineHeight: 18,
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
    gap: THEME.spacing.sm,
  },
  successText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium as any,
    color: '#065F46',
  },
  infoBox: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    ...THEME.shadows.small,
  },
  infoTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
    gap: THEME.spacing.sm,
  },
  infoText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    flex: 1,
  },
  stakeButton: {
    backgroundColor: THEME.colors.primary,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: THEME.spacing.sm,
    ...THEME.shadows.small,
  },
  buttonDisabled: { 
    opacity: 0.5,
    backgroundColor: THEME.colors.textMuted,
  },
  stakeButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
  },
});