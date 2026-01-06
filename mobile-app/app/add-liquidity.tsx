/**
 * Add Liquidity Screen
 * Select pool and add liquidity (placeholder - full implementation in Phase 12)
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME, GRADIENTS } from '@/constants/theme';

const POOLS = [
  { id: 0, tokenA: 'pCHML', tokenB: 'pBTC', tvl: 'Genesis', apy: '~15%', color: '#F7931A' },
  { id: 1, tokenA: 'pCHML', tokenB: 'pETH', tvl: 'Genesis', apy: '~12%', color: '#627EEA' },
  { id: 2, tokenA: 'pCHML', tokenB: 'pUSDT', tvl: 'Genesis', apy: '~10%', color: '#26A17B' },
];

export default function AddLiquidityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedPool, setSelectedPool] = useState<number | null>(null);

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
        <Text style={styles.headerTitle}>Add Liquidity</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoIconContainer}>
            <Ionicons name="water" size={32} color="#1976D2" />
          </View>
          <Text style={styles.infoTitle}>Earn Rewards by Providing Liquidity</Text>
          <Text style={styles.infoText}>
            Add tokens to liquidity pools to earn trading fees and LP rewards from block emissions (30% of all emissions go to LPs).
          </Text>
        </View>

        {/* Pool Selection */}
        <Text style={styles.sectionTitle}>Select Pool</Text>
        
        {POOLS.map((pool) => (
          <TouchableOpacity
            key={pool.id}
            style={[styles.poolCard, selectedPool === pool.id && styles.poolCardSelected]}
            onPress={() => setSelectedPool(pool.id)}
          >
            <View style={styles.poolLeft}>
              <View style={[styles.poolIcon, { backgroundColor: pool.color + '20' }]}>
                <Ionicons 
                  name={pool.tokenB === 'pBTC' ? 'logo-bitcoin' : pool.tokenB === 'pETH' ? 'diamond' : 'cash'} 
                  size={24} 
                  color={pool.color} 
                />
              </View>
              <View style={styles.poolInfo}>
                <Text style={styles.poolName}>{pool.tokenA}/{pool.tokenB}</Text>
                <Text style={styles.poolTvl}>TVL: {pool.tvl}</Text>
              </View>
            </View>
            <View style={styles.poolRight}>
              <View style={styles.apyContainer}>
                <Text style={styles.apyLabel}>Est. APY</Text>
                <Text style={styles.apyValue}>{pool.apy}</Text>
              </View>
              <View style={[styles.radio, selectedPool === pool.id && styles.radioSelected]}>
                {selectedPool === pool.id && <View style={styles.radioInner} />}
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* Rewards Info */}
        <View style={styles.rewardsInfo}>
          <View style={styles.rewardsRow}>
            <Ionicons name="gift" size={18} color={THEME.colors.primary} />
            <Text style={styles.rewardsText}>LP rewards distributed every block</Text>
          </View>
          <View style={styles.rewardsRow}>
            <Ionicons name="swap-horizontal" size={18} color={THEME.colors.primary} />
            <Text style={styles.rewardsText}>Earn 0.3% fee on every swap</Text>
          </View>
          <View style={styles.rewardsRow}>
            <Ionicons name="shield-checkmark" size={18} color={THEME.colors.primary} />
            <Text style={styles.rewardsText}>Private liquidity with ring signatures</Text>
          </View>
        </View>

        {/* Coming Soon Notice */}
        <View style={styles.comingSoonCard}>
          <Ionicons name="construct-outline" size={40} color={THEME.colors.textMuted} />
          <Text style={styles.comingSoonTitle}>Full LP Interface Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            The complete add/remove liquidity interface will be available in the next update. 
            Genesis pools are being created for initial testing.
          </Text>
          <View style={styles.comingSoonFeatures}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.featureText}>Add liquidity with any amount</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.featureText}>Remove liquidity anytime</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.featureText}>Track pool performance</Text>
            </View>
          </View>
        </View>

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
  infoCard: {
    backgroundColor: '#E3F2FD',
    margin: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
  },
  infoIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#BBDEFB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  infoTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: '#1565C0',
    textAlign: 'center',
    marginBottom: THEME.spacing.xs,
  },
  infoText: {
    fontSize: THEME.fontSize.sm,
    color: '#1976D2',
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginHorizontal: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    marginTop: THEME.spacing.sm,
  },
  poolCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: 'transparent',
    ...THEME.shadows.small,
  },
  poolCardSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.primaryLight,
  },
  poolLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  poolIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  poolInfo: {
    flex: 1,
  },
  poolName: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
  },
  poolTvl: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  poolRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.md,
  },
  apyContainer: {
    alignItems: 'flex-end',
  },
  apyLabel: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
  },
  apyValue: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: '#16A34A',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: THEME.colors.primary,
  },
  radioInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: THEME.colors.primary,
  },
  rewardsInfo: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    ...THEME.shadows.small,
  },
  rewardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
    gap: THEME.spacing.sm,
  },
  rewardsText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    flex: 1,
  },
  comingSoonCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderStyle: 'dashed',
  },
  comingSoonTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginTop: THEME.spacing.md,
  },
  comingSoonText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    marginTop: THEME.spacing.xs,
    marginBottom: THEME.spacing.lg,
    lineHeight: 20,
  },
  comingSoonFeatures: {
    alignSelf: 'stretch',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
    gap: THEME.spacing.sm,
  },
  featureText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
});