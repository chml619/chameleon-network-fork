/**
 * Stake Node Screen
 * Stake pCHML to activate a validator node
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
  KeyboardAvoidingView,
  Platform,
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

const MIN_STAKE = 1750;

export default function StakeNodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { nodeId } = useLocalSearchParams<{ nodeId: string }>();
  const { api } = useApi();
  const { wallet, refreshPCHMLBalance, pchmlBalance } = useWallet();
  
  const [amount, setAmount] = useState(MIN_STAKE.toString());
  const [pCHMLBalance, setPCHMLBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(true);
  const [isStaking, setIsStaking] = useState(false);

  useEffect(() => {
    loadBalance();
  }, [wallet?.address, pchmlBalance]);

  const loadBalance = async () => {
    setIsLoading(true);
    try {
      // Use pchmlBalance from context if available
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

  const handleStake = async () => {
    const stakeAmount = parseFloat(amount);
    if (isNaN(stakeAmount) || stakeAmount < MIN_STAKE) {
      Alert.alert('Minimum Stake', `You must stake at least ${MIN_STAKE.toLocaleString()} pCHML`);
      return;
    }

    if (stakeAmount > parseFloat(pCHMLBalance)) {
      Alert.alert('Insufficient Balance', `You only have ${pCHMLBalance} pCHML available`);
      return;
    }

    if (!api || !wallet) {
      Alert.alert('Error', 'Not connected to network');
      return;
    }

    const keyPair = await walletService.getOrDeriveKeyPair();
    if (!keyPair) {
      Alert.alert('Error', 'Wallet not unlocked. Please re-import your wallet.');
      return;
    }

    setIsStaking(true);
    try {
      // Convert to chain units (12 decimals)
      const amountBN = new BN(Math.floor(stakeAmount * Math.pow(10, 12)).toString());
      
      const result = await stakingService.stake(api, keyPair, amountBN);

      if (result.success) {
        if (refreshPCHMLBalance) await refreshPCHMLBalance();
        Alert.alert(
          '🎉 Staking Successful!',
          `You have staked ${stakeAmount.toLocaleString()} pCHML.\n\nYour node will become active once selected for the validator set. You'll start earning rewards when active.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Staking Failed', result.error || 'Unknown error occurred');
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Staking failed');
    } finally {
      setIsStaking(false);
    }
  };

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors as [string, string, ...string[]]}
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Balance Card */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceIcon}>
              <Ionicons name="wallet" size={28} color={THEME.colors.white} />
            </View>
            <Text style={styles.balanceLabel}>Available pCHML</Text>
            <Text style={styles.balanceAmount}>
              {isLoading ? '...' : parseFloat(pCHMLBalance).toLocaleString()}
            </Text>
            <Text style={styles.balanceSymbol}>pCHML</Text>
          </View>

          {/* Stake Form */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Stake Amount</Text>
            
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder={MIN_STAKE.toString()}
                placeholderTextColor={THEME.colors.textMuted}
              />
              <View style={styles.inputSuffix}>
                <Text style={styles.inputSuffixText}>pCHML</Text>
              </View>
            </View>

            <Text style={styles.minText}>
              Minimum stake: {MIN_STAKE.toLocaleString()} pCHML
            </Text>

            <TouchableOpacity 
              style={styles.maxButton} 
              onPress={() => setAmount(pCHMLBalance)}
            >
              <Ionicons name="flash" size={16} color={THEME.colors.primary} />
              <Text style={styles.maxButtonText}>Use Maximum</Text>
            </TouchableOpacity>

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#1976D2" />
              <Text style={styles.infoText}>
                Your staked pCHML will be locked until you unstake. The unbonding period is 7 days. 
                You'll earn block rewards while your node is active.
              </Text>
            </View>
          </View>

          {/* Stake Button */}
          <TouchableOpacity
            style={[styles.stakeButton, isStaking && styles.buttonDisabled]}
            onPress={handleStake}
            disabled={isStaking}
          >
            {isStaking ? (
              <ActivityIndicator color={THEME.colors.white} />
            ) : (
              <>
                <Ionicons name="lock-closed" size={20} color={THEME.colors.white} />
                <Text style={styles.stakeButtonText}>
                  Stake {parseFloat(amount || '0').toLocaleString()} pCHML
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  formCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.small,
  },
  formTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.medium,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    padding: THEME.spacing.md,
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
  },
  inputSuffix: {
    backgroundColor: THEME.colors.background,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    borderLeftWidth: 1,
    borderLeftColor: THEME.colors.border,
  },
  inputSuffixText: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.medium as any,
    color: THEME.colors.textSecondary,
  },
  minText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
    marginTop: THEME.spacing.sm,
  },
  maxButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.sm,
    backgroundColor: THEME.colors.primaryLight,
    borderRadius: THEME.borderRadius.medium,
    gap: THEME.spacing.xs,
  },
  maxButtonText: {
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.semibold as any,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.md,
    backgroundColor: '#E3F2FD',
    borderRadius: THEME.borderRadius.medium,
    gap: THEME.spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    color: '#1565C0',
    lineHeight: 20,
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
  buttonDisabled: { opacity: 0.6 },
  stakeButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
  },
});