/**
 * Node Detail Screen
 * View validator node details with actions: claim rewards, unstake
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '@/hooks/useApi';
import { useWallet } from '@/context/WalletContext';
import { walletService } from '@/services/wallet';
import { stakingService } from '@/services/staking';
import { useStaking } from '@/hooks/useStaking';
import { THEME, GRADIENTS } from '@/constants/theme';

const UNBONDING_BLOCKS = 100800; // ~7 days at 6 sec/block
const BLOCK_TIME_SECONDS = 6;

export default function NodeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { nodeId } = useLocalSearchParams<{ nodeId: string }>();
  const { api } = useApi();
  const { wallet, refreshPCHMLBalance } = useWallet();
  const { stakingInfo, refreshStakingInfo, nodeStatus } = useStaking();
  
  const [currentBlock, setCurrentBlock] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadCurrentBlock();
    refreshStakingInfo();
  }, [api]);

  const loadCurrentBlock = async () => {
    if (!api) return;
    try {
      const header = await api.rpc.chain.getHeader();
      setCurrentBlock(header.number.toNumber());
    } catch (error) {
      console.error('Error loading current block:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadCurrentBlock(), refreshStakingInfo()]);
    setIsRefreshing(false);
  }, [api]);

  const handleClaimRewards = async () => {
    if (!api || !wallet) return;
    
    const keyPair = await walletService.getOrDeriveKeyPair();
    if (!keyPair) {
      Alert.alert('Error', 'Wallet not unlocked. Please re-import your wallet.');
      return;
    }

    setActionLoading('claim');
    try {
      const result = await stakingService.claimRewards(api, keyPair);
      if (result.success) {
        if (refreshPCHMLBalance) await refreshPCHMLBalance();
        Alert.alert('🎉 Success', `Rewards claimed successfully!`);
        await refreshStakingInfo();
      } else {
        Alert.alert('Failed', result.error || 'Claim failed');
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Claim failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartUnbonding = async () => {
    Alert.alert(
      '⚠️ Start Unstaking?',
      'This will begin a 7-day unbonding period.\n\n• You will stop earning rewards immediately\n• Your stake will be locked for 7 days\n• This action cannot be cancelled',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Unstaking',
          style: 'destructive',
          onPress: async () => {
            if (!api || !wallet) return;
            
            const keyPair = await walletService.getOrDeriveKeyPair();
            if (!keyPair) {
              Alert.alert('Error', 'Wallet not unlocked');
              return;
            }

            setActionLoading('unbond');
            try {
              const result = await stakingService.startUnbonding(api, keyPair);
              if (result.success) {
                Alert.alert('✓ Unbonding Started', 'Your stake will be available to withdraw in approximately 7 days.');
                await refreshStakingInfo();
              } else {
                Alert.alert('Failed', result.error || 'Unbonding failed');
              }
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Unbonding failed');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleCompleteUnbonding = async () => {
    if (!api || !wallet) return;
    
    const keyPair = await walletService.getOrDeriveKeyPair();
    if (!keyPair) {
      Alert.alert('Error', 'Wallet not unlocked');
      return;
    }

    setActionLoading('complete');
    try {
      const result = await stakingService.completeUnbonding(api, keyPair);
      if (result.success) {
        if (refreshPCHMLBalance) await refreshPCHMLBalance();
        Alert.alert('🎉 Unstaking Complete!', 'Your pCHML has been returned to your wallet.', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('Failed', result.error || 'Complete unbonding failed');
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Complete failed');
    } finally {
      setActionLoading(null);
    }
  };

  const getUnbondingTimeLeft = (): string | null => {
    if (!stakingInfo?.unbondingBlock || !currentBlock) return null;
    const blocksLeft = stakingInfo.unbondingBlock - currentBlock;
    if (blocksLeft <= 0) return 'Ready to complete';
    
    const secondsLeft = blocksLeft * BLOCK_TIME_SECONDS;
    const days = Math.floor(secondsLeft / 86400);
    const hours = Math.floor((secondsLeft % 86400) / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return '#10B981';
      case 'Waiting': return '#3B82F6';
      case 'Unbonding': return '#F59E0B';
      case 'Registered': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Active': return 'checkmark-circle';
      case 'Waiting': return 'time';
      case 'Unbonding': return 'hourglass';
      case 'Registered': return 'document';
      default: return 'help-circle';
    }
  };

  const canCompleteUnbonding = nodeStatus === 'Unbonding' && getUnbondingTimeLeft() === 'Ready to complete';

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
        <Text style={styles.headerTitle}>Node Status</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.backButton}>
          <Ionicons name="refresh" size={22} color={THEME.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(nodeStatus) + '20' }]}>
            <Ionicons name={getStatusIcon(nodeStatus) as any} size={20} color={getStatusColor(nodeStatus)} />
            <Text style={[styles.statusText, { color: getStatusColor(nodeStatus) }]}>
              {nodeStatus || 'None'}
            </Text>
          </View>
          
          <View style={styles.stakeInfo}>
            <Text style={styles.stakeLabel}>Total Staked</Text>
            <Text style={styles.stakeAmount}>{stakingInfo?.staked || '0'}</Text>
            <Text style={styles.stakeSymbol}>pCHML</Text>
          </View>

          {nodeStatus === 'Unbonding' && (
            <View style={styles.unbondingBanner}>
              <Ionicons name="time-outline" size={18} color="#92400E" />
              <Text style={styles.unbondingText}>{getUnbondingTimeLeft()}</Text>
            </View>
          )}
        </View>

        {/* Rewards Card */}
        <View style={styles.rewardsCard}>
          <View style={styles.rewardsHeader}>
            <View style={styles.rewardsIconContainer}>
              <Ionicons name="gift" size={24} color={THEME.colors.primary} />
            </View>
            <View>
              <Text style={styles.rewardsLabel}>Pending Rewards</Text>
              <Text style={styles.rewardsAmount}>{stakingInfo?.rewards || '0'} pCHML</Text>
            </View>
          </View>
          
          <TouchableOpacity
            style={[
              styles.claimButton, 
              (actionLoading === 'claim' || stakingInfo?.rewards === '0' || stakingInfo?.rewards === '0.0000') && styles.buttonDisabled
            ]}
            onPress={handleClaimRewards}
            disabled={actionLoading === 'claim' || stakingInfo?.rewards === '0' || stakingInfo?.rewards === '0.0000'}
          >
            {actionLoading === 'claim' ? (
              <ActivityIndicator color={THEME.colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="download" size={18} color={THEME.colors.white} />
                <Text style={styles.claimButtonText}>Claim Rewards</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Actions</Text>

          {nodeStatus === 'None' && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/register-node' as any)}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="add-circle" size={22} color="#7C3AED" />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionText}>Register Node</Text>
                <Text style={styles.actionSubtext}>Set up your validator node</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={THEME.colors.textMuted} />
            </TouchableOpacity>
          )}

          {nodeStatus === 'Registered' && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/stake-node' as any)}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="lock-closed" size={22} color="#16A34A" />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionText}>Stake pCHML</Text>
                <Text style={styles.actionSubtext}>Activate node with min 1,750 pCHML</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={THEME.colors.textMuted} />
            </TouchableOpacity>
          )}

          {(nodeStatus === 'Active' || nodeStatus === 'Waiting') && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/stake-node' as any)}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="add" size={22} color="#16A34A" />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionText}>Stake More</Text>
                  <Text style={styles.actionSubtext}>Increase your stake amount</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={THEME.colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDanger]}
                onPress={handleStartUnbonding}
                disabled={actionLoading === 'unbond'}
              >
                {actionLoading === 'unbond' ? (
                  <ActivityIndicator color="#DC2626" style={{ marginLeft: THEME.spacing.md }} />
                ) : (
                  <>
                    <View style={[styles.actionIconContainer, { backgroundColor: '#FEE2E2' }]}>
                      <Ionicons name="lock-open" size={22} color="#DC2626" />
                    </View>
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionText, { color: '#DC2626' }]}>Start Unstaking</Text>
                      <Text style={styles.actionSubtext}>Begin 7-day unbonding period</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={THEME.colors.textMuted} />
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {nodeStatus === 'Unbonding' && (
            <TouchableOpacity
              style={[styles.actionButton, !canCompleteUnbonding && styles.actionButtonDisabled]}
              onPress={handleCompleteUnbonding}
              disabled={actionLoading === 'complete' || !canCompleteUnbonding}
            >
              {actionLoading === 'complete' ? (
                <ActivityIndicator color={THEME.colors.primary} style={{ marginLeft: THEME.spacing.md }} />
              ) : (
                <>
                  <View style={[styles.actionIconContainer, { backgroundColor: canCompleteUnbonding ? '#DCFCE7' : '#F3F4F6' }]}>
                    <Ionicons 
                      name="checkmark-circle" 
                      size={22} 
                      color={canCompleteUnbonding ? '#16A34A' : '#9CA3AF'} 
                    />
                  </View>
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionText, !canCompleteUnbonding && { color: '#9CA3AF' }]}>
                      Complete Unstaking
                    </Text>
                    <Text style={styles.actionSubtext}>
                      {canCompleteUnbonding ? 'Withdraw your stake now' : getUnbondingTimeLeft()}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={THEME.colors.textMuted} />
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={THEME.colors.primary} />
          <Text style={styles.infoText}>
            Active validators earn block rewards for producing blocks. 
            Rewards accumulate and can be claimed at any time.
          </Text>
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
  statusCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
    ...THEME.shadows.medium,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.full,
    gap: THEME.spacing.xs,
    marginBottom: THEME.spacing.lg,
  },
  statusText: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
  },
  stakeInfo: { alignItems: 'center' },
  stakeLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
  },
  stakeAmount: {
    fontSize: 36,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginTop: THEME.spacing.xs,
  },
  stakeSymbol: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
  },
  unbondingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: THEME.spacing.lg,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    backgroundColor: '#FEF3C7',
    borderRadius: THEME.borderRadius.medium,
    gap: THEME.spacing.xs,
  },
  unbondingText: {
    color: '#92400E',
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium as any,
  },
  rewardsCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.small,
  },
  rewardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
    gap: THEME.spacing.md,
  },
  rewardsIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardsLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
  },
  rewardsAmount: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.primary,
  },
  claimButton: {
    backgroundColor: THEME.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    gap: THEME.spacing.xs,
  },
  buttonDisabled: { opacity: 0.5 },
  claimButtonText: {
    color: THEME.colors.white,
    fontWeight: THEME.fontWeight.bold as any,
  },
  actionsCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.small,
  },
  actionsTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    backgroundColor: THEME.colors.background,
    marginBottom: THEME.spacing.sm,
  },
  actionButtonDanger: {
    backgroundColor: '#FEF2F2',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionInfo: {
    flex: 1,
    marginLeft: THEME.spacing.md,
  },
  actionText: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold as any,
    color: THEME.colors.text,
  },
  actionSubtext: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: THEME.spacing.md,
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.primaryLight,
    borderRadius: THEME.borderRadius.medium,
    gap: THEME.spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.primary,
    lineHeight: 20,
  },
});