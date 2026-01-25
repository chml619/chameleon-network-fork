/**
 * Pool Detail Screen
 * View pool stats and manage liquidity position
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '@/hooks/useApi';
import { useWallet } from '@/context/WalletContext';
import { poolService, PoolInfo, UserLPPosition } from '@/services/pool';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function PoolDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { poolId } = useLocalSearchParams();
  const { api } = useApi();
  const { wallet } = useWallet();
  
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [position, setPosition] = useState<UserLPPosition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [api, poolId, wallet?.address]);

  const loadData = async () => {
    if (!api || !poolId) return;
    setIsLoading(true);
    try {
      const poolInfo = await poolService.getPool(api, parseInt(poolId as string));
      setPool(poolInfo);
      
      if (wallet?.address) {
        const userPosition = await poolService.getUserPosition(api, parseInt(poolId as string), wallet.address);
        setPosition(userPosition);
      }
    } catch (error) {
      console.error('Error loading pool:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <LinearGradient colors={GRADIENTS.background.colors} style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
        </View>
      </LinearGradient>
    );
  }

  if (!pool) {
    return (
      <LinearGradient colors={GRADIENTS.background.colors} style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pool Not Found</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>
    );
  }

  const tokenA = poolService.getTokenSymbol(pool.assetA);
  const tokenB = poolService.getTokenSymbol(pool.assetB);

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{tokenA}/{tokenB}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* Pool Stats */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Pool Statistics</Text>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total {tokenA}</Text>
            <Text style={styles.statValue}>{poolService.formatAmount(pool.reserveA)}</Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total {tokenB}</Text>
            <Text style={styles.statValue}>{poolService.formatAmount(pool.reserveB)}</Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total LP Tokens</Text>
            <Text style={styles.statValue}>{poolService.formatAmount(pool.totalLpTokens)}</Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Swap Fee</Text>
            <Text style={styles.statValue}>{pool.swapFee}</Text>
          </View>
        </View>

        {/* Your Position */}
        <View style={styles.positionCard}>
          <Text style={styles.positionTitle}>Your Position</Text>
          
          {position ? (
            <>
              <View style={styles.positionMain}>
                <Text style={styles.positionLP}>{poolService.formatAmount(position.lpTokens)} LP</Text>
                <View style={styles.shareBadge}>
                  <Text style={styles.shareText}>{position.sharePercent.toFixed(2)}% share</Text>
                </View>
              </View>
              
              <View style={styles.positionDetails}>
                <View style={styles.positionRow}>
                  <Text style={styles.positionLabel}>Your {tokenA}</Text>
                  <Text style={styles.positionValue}>{poolService.formatAmount(position.valueA)}</Text>
                </View>
                <View style={styles.positionRow}>
                  <Text style={styles.positionLabel}>Your {tokenB}</Text>
                  <Text style={styles.positionValue}>{poolService.formatAmount(position.valueB)}</Text>
                </View>
              </View>

              <View style={styles.positionActions}>
                <TouchableOpacity
                  style={styles.addMoreButton}
                  onPress={() => router.push('/add-liquidity?poolId=' + pool.id as any)}
                >
                  <Ionicons name="add" size={18} color={THEME.colors.primary} />
                  <Text style={styles.addMoreText}>Add More</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.removeButtonSmall}
                  onPress={() => router.push('/remove-liquidity?poolId=' + pool.id as any)}>
                  <Ionicons name="remove" size={18} color="#D32F2F" />
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.noPosition}>
              <Ionicons name="water-outline" size={40} color={THEME.colors.textMuted} />
              <Text style={styles.noPositionText}>No liquidity in this pool</Text>
              <TouchableOpacity
                style={styles.addLiquidityButton}
                onPress={() => router.push('/add-liquidity?poolId=' + pool.id as any)}
              >
                <Text style={styles.addLiquidityText}>Add Liquidity</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Trade Button */}
        <TouchableOpacity
          style={styles.tradeButton}
          onPress={() => router.push('/(tabs)/trade')}
        >
          <Ionicons name="swap-horizontal" size={20} color={THEME.colors.white} />
          <Text style={styles.tradeButtonText}>Trade {tokenA}/{tokenB}</Text>
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
  statsCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.medium,
  },
  statsTitle: { fontSize: THEME.fontSize.base, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text, marginBottom: THEME.spacing.md },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: THEME.spacing.sm, borderBottomWidth: 1, borderBottomColor: THEME.colors.border },
  statLabel: { fontSize: THEME.fontSize.sm, color: THEME.colors.textMuted },
  statValue: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text },
  positionCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.small,
  },
  positionTitle: { fontSize: THEME.fontSize.base, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text, marginBottom: THEME.spacing.md },
  positionMain: { flexDirection: 'row', alignItems: 'center', marginBottom: THEME.spacing.md },
  positionLP: { fontSize: 28, fontWeight: THEME.fontWeight.bold, color: THEME.colors.text },
  shareBadge: { backgroundColor: THEME.colors.primaryLight, paddingHorizontal: THEME.spacing.sm, paddingVertical: THEME.spacing.xs, borderRadius: THEME.borderRadius.full, marginLeft: THEME.spacing.sm },
  shareText: { fontSize: THEME.fontSize.xs, color: THEME.colors.primary, fontWeight: THEME.fontWeight.bold },
  positionDetails: { backgroundColor: '#F5F5F5', borderRadius: THEME.borderRadius.medium, padding: THEME.spacing.md, marginBottom: THEME.spacing.md },
  positionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: THEME.spacing.xs },
  positionLabel: { fontSize: THEME.fontSize.sm, color: THEME.colors.textMuted },
  positionValue: { fontSize: THEME.fontSize.sm, fontWeight: THEME.fontWeight.medium, color: THEME.colors.text },
  positionActions: { flexDirection: 'row', gap: THEME.spacing.sm },
  addMoreButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.md, backgroundColor: THEME.colors.primaryLight, borderRadius: THEME.borderRadius.medium },
  addMoreText: { color: THEME.colors.primary, fontWeight: THEME.fontWeight.bold, marginLeft: THEME.spacing.xs },
  removeButtonSmall: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.md, backgroundColor: '#FFEBEE', borderRadius: THEME.borderRadius.medium },
  removeText: { color: '#D32F2F', fontWeight: THEME.fontWeight.bold, marginLeft: THEME.spacing.xs },
  noPosition: { alignItems: 'center', paddingVertical: THEME.spacing.lg },
  noPositionText: { fontSize: THEME.fontSize.sm, color: THEME.colors.textMuted, marginTop: THEME.spacing.sm, marginBottom: THEME.spacing.md },
  addLiquidityButton: { backgroundColor: THEME.colors.primary, paddingHorizontal: THEME.spacing.lg, paddingVertical: THEME.spacing.md, borderRadius: THEME.borderRadius.medium },
  addLiquidityText: { color: THEME.colors.white, fontWeight: THEME.fontWeight.bold },
  tradeButton: {
    backgroundColor: THEME.colors.primary,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeButtonText: { color: THEME.colors.white, fontWeight: THEME.fontWeight.bold, marginLeft: THEME.spacing.xs },
});