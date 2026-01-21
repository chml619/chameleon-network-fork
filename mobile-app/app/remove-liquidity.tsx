/**
 * Remove Liquidity Screen
 * Withdraw liquidity from pools
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '@/hooks/useApi';
import { useWallet } from '@/context/WalletContext';
import { walletService } from '@/services/wallet';
import { poolService, PoolInfo, UserLPPosition } from '@/services/pool';
import { transactionHistoryService } from '@/services/transactionHistory';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function RemoveLiquidityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { poolId } = useLocalSearchParams();
  const { api } = useApi();
  const { wallet, refreshBalances, refreshPCHMLBalance } = useWallet();
  
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [position, setPosition] = useState<UserLPPosition | null>(null);
  const [percentage, setPercentage] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    loadData();
  }, [api, poolId, wallet?.address]);

  const loadData = async () => {
    if (!api || !poolId || !wallet?.address) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setLoadingTimeout(false);
    
    // Set a timeout for loading
    const timeoutId = setTimeout(() => {
      setLoadingTimeout(true);
      setIsLoading(false);
    }, 10000); // 10 second timeout
    
    try {
      // Validate poolId is a valid number
      const poolIdNum = parseInt(poolId as string);
      if (isNaN(poolIdNum) || poolIdNum < 0) {
        throw new Error('Invalid pool ID');
      }
      
      const poolInfo = await poolService.getPool(api, poolIdNum);
      setPool(poolInfo);
      
      const userPosition = await poolService.getUserPosition(api, poolIdNum, wallet.address);
      setPosition(userPosition);
      
      clearTimeout(timeoutId);
    } catch (error) {
      console.error('Error loading data:', error);
      clearTimeout(timeoutId);
    } finally {
      setIsLoading(false);
    }
  };

  const getLpToRemove = () => {
    if (!position) return '0';
    const lpTokens = parseFloat(position.lpTokens) / Math.pow(10, 12);
    return ((lpTokens * percentage) / 100).toFixed(6);
  };

  const getExpectedA = () => {
    if (!position) return '0';
    const valueA = parseFloat(position.valueA) / Math.pow(10, 12);
    return ((valueA * percentage) / 100).toFixed(6);
  };

  const getExpectedB = () => {
    if (!position) return '0';
    const valueB = parseFloat(position.valueB) / Math.pow(10, 12);
    return ((valueB * percentage) / 100).toFixed(6);
  };

  const handleRemoveLiquidity = async () => {
    if (!api || !wallet || !pool || !position) return;
    
    if (percentage <= 0) {
      Alert.alert('Error', 'Select amount to remove');
      return;
    }

    const keyPair = await walletService.getOrDeriveKeyPair();
    if (!keyPair) {
      Alert.alert('Error', 'Wallet not unlocked');
      return;
    }

    Alert.alert(
      'Confirm Removal',
      `Remove ${percentage}% of your liquidity?\n\nYou will receive:\n~${getExpectedA()} ${poolService.getTokenSymbol(pool.assetA)}\n~${getExpectedB()} ${poolService.getTokenSymbol(pool.assetB)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsRemoving(true);
            try {
              const result = await poolService.removeLiquidity(
                api,
                keyPair,
                pool.id,
                getLpToRemove()
              );

              if (result.success) {
                await transactionHistoryService.saveTransaction(wallet.address, {
                  hash: result.txHash || 'unknown',
                  from: wallet.address,
                  to: 'pool',
                  amount: `${getExpectedA()} ${poolService.getTokenSymbol(pool.assetA)} + ${getExpectedB()} ${poolService.getTokenSymbol(pool.assetB)}`,
                  formattedAmount: `${getExpectedA()} ${poolService.getTokenSymbol(pool.assetA)} + ${getExpectedB()} ${poolService.getTokenSymbol(pool.assetB)}`,
                  status: 'finalized',
                  usedMEVProtection: false,
                  type: 'remove_liquidity',
                });

                if (refreshBalances) await refreshBalances();
                if (refreshPCHMLBalance) await refreshPCHMLBalance();

                Alert.alert('Success', 'Liquidity removed successfully!', [
                  { text: 'OK', onPress: () => router.back() }
                ]);
              } else {
                Alert.alert('Failed', result.error || 'Failed to remove liquidity');
              }
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to remove liquidity');
            } finally {
              setIsRemoving(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <LinearGradient colors={GRADIENTS.background.colors} style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Remove Liquidity</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Loading pool data...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (loadingTimeout) {
    return (
      <LinearGradient colors={GRADIENTS.background.colors} style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Remove Liquidity</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.noPositionCard}>
          <Ionicons name="time-outline" size={48} color={THEME.colors.textMuted} />
          <Text style={styles.noPositionText}>Loading timed out</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={loadData}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  if (!pool || !position || !position.lpTokens || position.lpTokens === '0') {
    return (
      <LinearGradient colors={GRADIENTS.background.colors} style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>No Position Found</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.noPositionCard}>
          <Text style={styles.noPositionText}>You don't have liquidity in this pool</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Remove Liquidity</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Pool Info */}
        <View style={styles.poolCard}>
          <Text style={styles.poolName}>
            {poolService.getTokenSymbol(pool.assetA)}/{poolService.getTokenSymbol(pool.assetB)}
          </Text>
          <Text style={styles.positionInfo}>
            Your LP: {poolService.formatAmount(position.lpTokens)} ({position.sharePercent.toFixed(2)}% share)
          </Text>
        </View>

        {/* Percentage Selector */}
        <View style={styles.percentageCard}>
          <Text style={styles.percentageLabel}>Amount to Remove</Text>
          <Text style={styles.percentageValue}>{percentage}%</Text>
          
          <View style={styles.percentageButtons}>
            {[25, 50, 75, 100].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.percentButton, percentage === p && styles.percentButtonActive]}
                onPress={() => setPercentage(p)}
              >
                <Text style={[styles.percentButtonText, percentage === p && styles.percentButtonTextActive]}>
                  {p}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Expected Output */}
        <View style={styles.outputCard}>
          <Text style={styles.outputTitle}>You Will Receive</Text>
          
          <View style={styles.outputRow}>
            <Text style={styles.outputToken}>{poolService.getTokenSymbol(pool.assetA)}</Text>
            <Text style={styles.outputAmount}>{getExpectedA()}</Text>
          </View>
          
          <View style={styles.outputDivider} />
          
          <View style={styles.outputRow}>
            <Text style={styles.outputToken}>{poolService.getTokenSymbol(pool.assetB)}</Text>
            <Text style={styles.outputAmount}>{getExpectedB()}</Text>
          </View>
        </View>

        {/* Remove Button */}
        <TouchableOpacity
          style={[styles.removeButton, isRemoving && styles.buttonDisabled]}
          onPress={handleRemoveLiquidity}
          disabled={isRemoving || percentage <= 0}
        >
          {isRemoving ? (
            <ActivityIndicator color={THEME.colors.white} />
          ) : (
            <Text style={styles.removeButtonText}>Remove {percentage}% Liquidity</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
  },
  backButton: { padding: THEME.spacing.xs },
  headerTitle: { fontSize: THEME.fontSize.lg, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text },
  scrollView: { flex: 1 },
  poolCard: {
    backgroundColor: THEME.colors.primary,
    margin: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
  },
  poolName: { fontSize: THEME.fontSize.xl, fontWeight: THEME.fontWeight.bold, color: THEME.colors.white },
  positionInfo: { fontSize: THEME.fontSize.sm, color: THEME.colors.white, opacity: 0.8, marginTop: THEME.spacing.xs },
  percentageCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
    ...THEME.shadows.medium,
  },
  percentageLabel: { fontSize: THEME.fontSize.sm, color: THEME.colors.textMuted },
  percentageValue: { fontSize: 48, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text, marginVertical: THEME.spacing.sm },
  percentageButtons: { flexDirection: 'row', marginTop: THEME.spacing.md },
  percentButton: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: THEME.borderRadius.medium,
    marginHorizontal: THEME.spacing.xs,
  },
  percentButtonActive: { backgroundColor: THEME.colors.primary },
  percentButtonText: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.medium, color: THEME.colors.text },
  percentButtonTextActive: { color: THEME.colors.white },
  outputCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.small,
  },
  outputTitle: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text, marginBottom: THEME.spacing.md },
  outputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: THEME.spacing.sm },
  outputToken: { fontSize: THEME.fontSize.base, color: THEME.colors.textSecondary },
  outputAmount: { fontSize: THEME.fontSize.lg, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text },
  outputDivider: { height: 1, backgroundColor: THEME.colors.border },
  removeButton: {
    backgroundColor: '#D32F2F',
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  removeButtonText: { color: THEME.colors.white, fontSize: THEME.fontSize.base, fontWeight: THEME.fontWeight.bold },
  noPositionCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
  },
  noPositionText: { color: THEME.colors.textMuted },
  retryButton: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.medium,
    marginTop: THEME.spacing.md,
  },
  retryButtonText: {
    color: THEME.colors.white,
    fontWeight: THEME.fontWeight.semibold,
  },
  loadingText: {
    marginTop: THEME.spacing.md,
    color: THEME.colors.textSecondary,
  },
});