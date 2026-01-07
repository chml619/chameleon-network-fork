/**
 * Add Liquidity Screen
 * Full implementation for adding liquidity to pools
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '@/hooks/useApi';
import { useWallet } from '@/context/WalletContext';
import { walletService } from '@/services/wallet';
import { poolService, PoolInfo } from '@/services/pool';
import { pdexService } from '@/services/pdex';
import { transactionHistoryService } from '@/services/transactionHistory';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function AddLiquidityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { poolId: initialPoolId } = useLocalSearchParams();
  const { api } = useApi();
  const { wallet, refreshBalances, refreshPCHMLBalance } = useWallet();
  
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [balanceA, setBalanceA] = useState('0');
  const [balanceB, setBalanceB] = useState('0');
  const [expectedLP, setExpectedLP] = useState('0');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadPools();
  }, [api]);

  useEffect(() => {
    if (selectedPool && wallet?.address && api) {
      loadBalances();
    }
  }, [selectedPool, wallet?.address, api]);

  useEffect(() => {
    calculateExpectedLP();
  }, [amountA, amountB, selectedPool]);

  const loadPools = async () => {
    if (!api) return;
    setIsLoading(true);
    try {
      const allPools = await poolService.getAllPools(api);
      setPools(allPools);
      
      // Auto-select pool if passed as param
      if (initialPoolId) {
        const pool = allPools.find(p => p.id === parseInt(initialPoolId as string));
        if (pool) setSelectedPool(pool);
      } else if (allPools.length > 0) {
        setSelectedPool(allPools[0]);
      }
    } catch (error) {
      console.error('Error loading pools:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBalances = async () => {
    if (!api || !wallet?.address || !selectedPool) return;
    try {
      const balA = await pdexService.getTokenBalance(selectedPool.assetA, wallet.address);
      const balB = await pdexService.getTokenBalance(selectedPool.assetB, wallet.address);
      setBalanceA(poolService.formatAmount(balA.toString()));
      setBalanceB(poolService.formatAmount(balB.toString()));
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

  const calculateExpectedLP = () => {
    if (!selectedPool || !amountA || !amountB) {
      setExpectedLP('0');
      return;
    }
    
    const lp = poolService.calculateExpectedLPTokens(
      amountA,
      amountB,
      poolService.formatAmount(selectedPool.reserveA),
      poolService.formatAmount(selectedPool.reserveB),
      poolService.formatAmount(selectedPool.totalLpTokens)
    );
    setExpectedLP(parseFloat(lp).toFixed(6));
  };

  const handleAmountAChange = (value: string) => {
    setAmountA(value);
    
    // Auto-calculate amount B to maintain ratio
    if (selectedPool && value && parseFloat(value) > 0) {
      const reserveAFormatted = poolService.formatAmount(selectedPool.reserveA);
      const reserveBFormatted = poolService.formatAmount(selectedPool.reserveB);
      
      // Check if pool has liquidity
      if (parseFloat(reserveAFormatted) > 0 && parseFloat(reserveBFormatted) > 0) {
        const optimalB = poolService.calculateOptimalAmountB(
          value,
          reserveAFormatted,
          reserveBFormatted
        );
        setAmountB(parseFloat(optimalB).toFixed(6));
      } else {
        // Pool has no liquidity - user sets the initial price
        setAmountB('');
      }
    } else {
      setAmountB('');
    }
  };

  const handleMaxA = () => {
    setAmountA(balanceA);
    if (selectedPool) {
      const reserveAFormatted = poolService.formatAmount(selectedPool.reserveA);
      const reserveBFormatted = poolService.formatAmount(selectedPool.reserveB);
      
      if (parseFloat(reserveAFormatted) > 0 && parseFloat(reserveBFormatted) > 0) {
        const optimalB = poolService.calculateOptimalAmountB(
          balanceA,
          reserveAFormatted,
          reserveBFormatted
        );
        setAmountB(parseFloat(optimalB).toFixed(6));
      } else {
        // Pool has no liquidity
        setAmountB('');
      }
    }
  };

  const handleAddLiquidity = async () => {
    if (!api || !wallet || !selectedPool) return;
    
    if (!amountA || parseFloat(amountA) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter an amount for the first token');
      return;
    }
    if (!amountB || parseFloat(amountB) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter an amount for the second token');
      return;
    }
    if (parseFloat(amountA) > parseFloat(balanceA)) {
      Alert.alert('Insufficient Balance', `You don't have enough ${poolService.getTokenSymbol(selectedPool.assetA)} tokens`);
      return;
    }
    if (parseFloat(amountB) > parseFloat(balanceB)) {
      Alert.alert('Insufficient Balance', `You don't have enough ${poolService.getTokenSymbol(selectedPool.assetB)} tokens`);
      return;
    }

    const keyPair = await walletService.getOrDeriveKeyPair();
    if (!keyPair) {
      Alert.alert('Wallet Locked', 'Please unlock your wallet or re-import it to continue');
      return;
    }

    setIsAdding(true);
    try {
      const result = await poolService.addLiquidity(
        api,
        keyPair,
        selectedPool.id,
        amountA,
        amountB
      );

      if (result.success) {
        // Save to transaction history
        await transactionHistoryService.saveTransaction(wallet.address, {
          hash: result.txHash || 'unknown',
          from: wallet.address,
          to: 'pool',
          amount: `${amountA} ${poolService.getTokenSymbol(selectedPool.assetA)} + ${amountB} ${poolService.getTokenSymbol(selectedPool.assetB)}`,
          formattedAmount: `${amountA} ${poolService.getTokenSymbol(selectedPool.assetA)} + ${amountB} ${poolService.getTokenSymbol(selectedPool.assetB)}`,
          status: 'finalized',
          usedMEVProtection: false,
        });

        // Refresh balances
        if (refreshBalances) await refreshBalances();
        if (refreshPCHMLBalance) await refreshPCHMLBalance();

        Alert.alert(
          'Liquidity Added!',
          `You received ${result.lpTokensReceived ? poolService.formatAmount(result.lpTokensReceived) : expectedLP} LP tokens`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Failed', result.error || 'Failed to add liquidity');
      }
    } catch (error) {
      let errorMessage = 'Unable to add liquidity. Please check your balances and try again.';
      if (error instanceof Error) {
        if (error.message.includes('Insufficient')) {
          errorMessage = 'Insufficient token balance to add liquidity.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network connection issue. Please try again.';
        }
      }
      Alert.alert('Add Liquidity Failed', errorMessage);
    } finally {
      setIsAdding(false);
    }
  };

  const getTokenSymbolA = () => selectedPool ? poolService.getTokenSymbol(selectedPool.assetA) : '';
  const getTokenSymbolB = () => selectedPool ? poolService.getTokenSymbol(selectedPool.assetB) : '';

  if (isLoading) {
    return (
      <LinearGradient colors={GRADIENTS.background.colors} style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Loading pools...</Text>
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
        <Text style={styles.headerTitle}>Add Liquidity</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Pool Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Pool</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {pools.map((pool) => (
              <TouchableOpacity
                key={pool.id}
                style={[styles.poolChip, selectedPool?.id === pool.id && styles.poolChipSelected]}
                onPress={() => setSelectedPool(pool)}
              >
                <Text style={[styles.poolChipText, selectedPool?.id === pool.id && styles.poolChipTextSelected]}>
                  {poolService.getTokenSymbol(pool.assetA)}/{poolService.getTokenSymbol(pool.assetB)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {selectedPool && (
          <>
            {/* Token A Input */}
            <View style={styles.inputCard}>
              <View style={styles.inputHeader}>
                <Text style={styles.inputLabel}>{getTokenSymbolA()}</Text>
                <Text style={styles.balanceText}>Balance: {balanceA}</Text>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.amountInput}
                  value={amountA}
                  onChangeText={handleAmountAChange}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={THEME.colors.textMuted}
                />
                <TouchableOpacity style={styles.maxButton} onPress={handleMaxA}>
                  <Text style={styles.maxButtonText}>MAX</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Plus Icon */}
            <View style={styles.plusContainer}>
              <View style={styles.plusCircle}>
                <Ionicons name="add" size={24} color={THEME.colors.primary} />
              </View>
            </View>

            {/* Token B Input */}
            <View style={styles.inputCard}>
              <View style={styles.inputHeader}>
                <Text style={styles.inputLabel}>{getTokenSymbolB()}</Text>
                <Text style={styles.balanceText}>Balance: {balanceB}</Text>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.amountInput}
                  value={amountB}
                  onChangeText={setAmountB}
                  keyboardType="decimal-pad"
                  placeholder={selectedPool && poolService.formatAmount(selectedPool.reserveA) === '0' ? "0.00 (you set initial price)" : "0.00 (auto-calculated)"}
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>
              {selectedPool && poolService.formatAmount(selectedPool.reserveA) === '0' && (
                <Text style={styles.initialPriceNote}>
                  Pool has no liquidity - you'll set the initial price ratio
                </Text>
              )}
            </View>

            {/* Expected LP Tokens */}
            <View style={styles.expectedCard}>
              <Text style={styles.expectedLabel}>Expected LP Tokens</Text>
              <Text style={styles.expectedValue}>{expectedLP}</Text>
              <Text style={styles.expectedSubtext}>
                Pool share: ~{selectedPool.totalLpTokens === '0' ? '100' : 
                  ((parseFloat(expectedLP) / (parseFloat(poolService.formatAmount(selectedPool.totalLpTokens)) + parseFloat(expectedLP))) * 100).toFixed(2)}%
              </Text>
            </View>

            {/* Pool Info */}
            <View style={styles.poolInfoCard}>
              <Text style={styles.poolInfoTitle}>Pool Information</Text>
              <View style={styles.poolInfoRow}>
                <Text style={styles.poolInfoLabel}>Current Reserves</Text>
                <Text style={styles.poolInfoValue}>
                  {poolService.formatAmount(selectedPool.reserveA)} {getTokenSymbolA()} / {poolService.formatAmount(selectedPool.reserveB)} {getTokenSymbolB()}
                </Text>
              </View>
              <View style={styles.poolInfoRow}>
                <Text style={styles.poolInfoLabel}>Total LP Tokens</Text>
                <Text style={styles.poolInfoValue}>{poolService.formatAmount(selectedPool.totalLpTokens)}</Text>
              </View>
              <View style={styles.poolInfoRow}>
                <Text style={styles.poolInfoLabel}>Swap Fee</Text>
                <Text style={styles.poolInfoValue}>{selectedPool.swapFee}</Text>
              </View>
            </View>

            {/* Add Button */}
            <TouchableOpacity
              style={[styles.addButton, isAdding && styles.buttonDisabled]}
              onPress={handleAddLiquidity}
              disabled={isAdding}
            >
              {isAdding ? (
                <ActivityIndicator color={THEME.colors.white} />
              ) : (
                <Text style={styles.addButtonText}>Add Liquidity</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {pools.length === 0 && !isLoading && (
          <View style={styles.noPoolsCard}>
            <Ionicons name="water-outline" size={48} color={THEME.colors.textMuted} />
            <Text style={styles.noPoolsTitle}>No Pools Available</Text>
            <Text style={styles.noPoolsText}>Liquidity pools are being created. Check back soon!</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: THEME.spacing.md, color: THEME.colors.textSecondary },
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
  section: { padding: THEME.spacing.md },
  sectionTitle: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text, marginBottom: THEME.spacing.sm },
  poolChip: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.full,
    marginRight: THEME.spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  poolChipSelected: { borderColor: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight },
  poolChipText: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.medium, color: THEME.colors.text },
  poolChipTextSelected: { color: THEME.colors.primary },
  inputCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.small,
  },
  inputHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: THEME.spacing.sm },
  inputLabel: { fontSize: THEME.fontSize.base, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text },
  balanceText: { fontSize: THEME.fontSize.sm, color: THEME.colors.textMuted },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  amountInput: { flex: 1, fontSize: THEME.fontSize.xl, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text, padding: 0 },
  maxButton: { backgroundColor: THEME.colors.primaryLight, paddingHorizontal: THEME.spacing.md, paddingVertical: THEME.spacing.sm, borderRadius: THEME.borderRadius.medium },
  maxButtonText: { color: THEME.colors.primary, fontWeight: THEME.fontWeight.bold, fontSize: THEME.fontSize.sm },
  plusContainer: { alignItems: 'center', marginVertical: THEME.spacing.sm },
  plusCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: THEME.colors.white, justifyContent: 'center', alignItems: 'center', ...THEME.shadows.small },
  expectedCard: {
    backgroundColor: THEME.colors.primary,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
  },
  expectedLabel: { fontSize: THEME.fontSize.sm, color: THEME.colors.white, opacity: 0.8 },
  expectedValue: { fontSize: 28, fontWeight: THEME.fontWeight.bold, color: THEME.colors.white },
  expectedSubtext: { fontSize: THEME.fontSize.xs, color: THEME.colors.white, opacity: 0.7, marginTop: THEME.spacing.xs },
  poolInfoCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.small,
  },
  poolInfoTitle: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text, marginBottom: THEME.spacing.sm },
  poolInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: THEME.spacing.xs },
  poolInfoLabel: { fontSize: THEME.fontSize.sm, color: THEME.colors.textMuted },
  poolInfoValue: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.medium, color: THEME.colors.text },
  addButton: {
    backgroundColor: THEME.colors.primary,
    marginHorizontal: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  addButtonText: { color: THEME.colors.white, fontSize: THEME.fontSize.base, fontWeight: THEME.fontWeight.bold },
  noPoolsCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
    ...THEME.shadows.small,
  },
  noPoolsTitle: { fontSize: THEME.fontSize.lg, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text, marginTop: THEME.spacing.md },
  noPoolsText: { fontSize: THEME.fontSize.sm, color: THEME.colors.textMuted, textAlign: 'center', marginTop: THEME.spacing.xs },
});