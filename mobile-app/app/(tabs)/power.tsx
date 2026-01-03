/**
 * Power Screen - vNode Management
 * Manage validator node operations: register, stake, unbond, delete
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStaking } from '@/hooks/useStaking';
import { useWallet } from '@/context/WalletContext';
import { useApi } from '@/hooks/useApi';
import { NetworkBadge } from '@/components/NetworkBadge';
import { MockViewBanner } from '@/components/MockViewBanner';
import { THEME, GRADIENTS } from '@/constants/theme';
import { NodeStatus } from '@/services/staking';

// Status colors mapping
const STATUS_COLORS: Record<NodeStatus, string> = {
  None: '#6B7280',
  Registered: '#F59E0B',
  Waiting: '#3B82F6',
  Active: '#10B981',
  Unbonding: '#F97316',
};

// Unbonding period in blocks (~7 days at 6 sec blocks)
const UNBONDING_PERIOD = 100800;

export default function PowerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();
  const { connectionState } = useApi();
  const {
    stakingInfo,
    isLoading,
    isClaiming,
    isRegistering,
    isStartingUnbond,
    isCompletingUnbond,
    isDeleting,
    error,
    claimRewards,
    registerNode,
    startUnbonding,
    completeUnbonding,
    deleteNode,
    refetch,
  } = useStaking();

  const [refreshing, setRefreshing] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<number>(0);

  // Get current block number for unbonding countdown
  useEffect(() => {
    if (connectionState.blockNumber) {
      setCurrentBlock(connectionState.blockNumber);
    }
  }, [connectionState.blockNumber]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Calculate unbonding progress
  const getUnbondingProgress = (): { progress: number; blocksRemaining: number; canComplete: boolean } => {
    if (!stakingInfo?.unbondingBlock || stakingInfo.status !== 'Unbonding') {
      return { progress: 0, blocksRemaining: 0, canComplete: false };
    }

    const unbondingEndBlock = stakingInfo.unbondingBlock + UNBONDING_PERIOD;
    const blocksRemaining = Math.max(0, unbondingEndBlock - currentBlock);
    const blocksPassed = currentBlock - stakingInfo.unbondingBlock;
    const progress = Math.min(100, (blocksPassed / UNBONDING_PERIOD) * 100);
    const canComplete = blocksRemaining === 0;

    return { progress, blocksRemaining, canComplete };
  };

  // Format blocks to time string
  const formatBlocksToTime = (blocks: number): string => {
    const seconds = blocks * 6; // 6 seconds per block
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h remaining`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  // Handle actions
  const handleRegisterNode = async () => {
    Alert.alert(
      'Register vNode',
      'Are you sure you want to register as a validator node? You will need to stake at least 1,750 CHML to activate.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Register',
          onPress: async () => {
            const result = await registerNode();
            if (result.success) {
              Alert.alert('Success', 'Node registered successfully! Now stake tokens to activate.');
            } else {
              Alert.alert('Error', result.error || 'Registration failed');
            }
          },
        },
      ]
    );
  };

  const handleStartUnbonding = async () => {
    Alert.alert(
      'Start Unbonding',
      'This will start the 7-day unbonding period. During this time, you will not earn rewards and cannot stake. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Unbonding',
          style: 'destructive',
          onPress: async () => {
            const result = await startUnbonding();
            if (result.success) {
              Alert.alert('Success', 'Unbonding started. Your tokens will be available in 7 days.');
            } else {
              Alert.alert('Error', result.error || 'Failed to start unbonding');
            }
          },
        },
      ]
    );
  };

  const handleCompleteUnbonding = async () => {
    const result = await completeUnbonding();
    if (result.success) {
      Alert.alert('Success', 'Unbonding complete! Your tokens are now available.');
    } else {
      Alert.alert('Error', result.error || 'Failed to complete unbonding');
    }
  };

  const handleClaimRewards = async () => {
    if (!stakingInfo || stakingInfo.rewardsRaw.isZero()) {
      Alert.alert('No Rewards', 'You have no rewards to claim.');
      return;
    }

    const result = await claimRewards();
    if (result.success) {
      Alert.alert('Success', 'Rewards claimed successfully!');
    } else {
      Alert.alert('Error', result.error || 'Claim failed');
    }
  };

  const handleDeleteNode = async () => {
    Alert.alert(
      'Delete Node',
      'Are you sure you want to remove your node from the network? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteNode();
            if (result.success) {
              Alert.alert('Success', 'Node deleted successfully.');
            } else {
              Alert.alert('Error', result.error || 'Failed to delete node');
            }
          },
        },
      ]
    );
  };

  const nodeStatus = stakingInfo?.status || 'None';
  const statusColor = STATUS_COLORS[nodeStatus];
  const unbondingInfo = getUnbondingProgress();

  // No wallet state
  if (!wallet) {
    return (
      <LinearGradient
        colors={GRADIENTS.background.colors}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Power</Text>
          <NetworkBadge size="small" />
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="flash-outline" size={64} color={THEME.colors.textMuted} />
          <Text style={styles.noWalletText}>Connect a wallet to manage your vNode</Text>
          <TouchableOpacity
            style={styles.connectButton}
            onPress={() => router.push('/(tabs)/wallet')}
          >
            <Text style={styles.connectButtonText}>Go to Wallet</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Mock View Banner */}
      <MockViewBanner screenId="power" featureName="vNode Management" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Power</Text>
        <NetworkBadge size="small" />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Node Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusTitleRow}>
              <Ionicons name="flash" size={24} color={statusColor} />
              <Text style={styles.statusTitle}>vNode Status</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {nodeStatus === 'None' ? 'Not Registered' : nodeStatus}
              </Text>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={THEME.colors.primary} />
              <Text style={styles.loadingText}>Loading node status...</Text>
            </View>
          ) : (
            <>
              {/* Status-specific content */}
              {nodeStatus === 'None' && (
                <View style={styles.statusContent}>
                  <Ionicons name="add-circle-outline" size={48} color={THEME.colors.textMuted} />
                  <Text style={styles.statusMessage}>No node registered</Text>
                  <Text style={styles.statusSubMessage}>
                    Register a vNode to start validating and earning rewards
                  </Text>
                </View>
              )}

              {nodeStatus === 'Registered' && (
                <View style={styles.statusContent}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={STATUS_COLORS.Registered} />
                  <Text style={styles.statusMessage}>Node Registered</Text>
                  <Text style={styles.statusSubMessage}>
                    Stake at least 1,750 CHML to activate your node
                  </Text>
                </View>
              )}

              {(nodeStatus === 'Waiting' || nodeStatus === 'Active') && (
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Staked</Text>
                    <Text style={styles.statValue}>{stakingInfo?.staked || '0 CHML'}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Rewards</Text>
                    <Text style={[styles.statValue, { color: THEME.colors.success }]}>
                      {stakingInfo?.rewards || '0 CHML'}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>APY</Text>
                    <Text style={styles.statValue}>{stakingInfo?.apy?.toFixed(1) || '0'}%</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Min Stake</Text>
                    <Text style={styles.statValue}>{stakingInfo?.minStake || '1,750 CHML'}</Text>
                  </View>
                </View>
              )}

              {nodeStatus === 'Unbonding' && (
                <View style={styles.unbondingContent}>
                  <View style={styles.unbondingHeader}>
                    <Ionicons name="time-outline" size={32} color={STATUS_COLORS.Unbonding} />
                    <Text style={styles.unbondingTitle}>Unbonding in Progress</Text>
                  </View>
                  <Text style={styles.unbondingAmount}>
                    {stakingInfo?.unbonding || '0 CHML'}
                  </Text>
                  
                  {/* Progress bar */}
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${unbondingInfo.progress}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>
                      {unbondingInfo.canComplete
                        ? 'Ready to complete!'
                        : formatBlocksToTime(unbondingInfo.blocksRemaining)}
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Actions</Text>

          {nodeStatus === 'None' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton]}
              onPress={handleRegisterNode}
              disabled={isRegistering}
            >
              {isRegistering ? (
                <ActivityIndicator size="small" color={THEME.colors.white} />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color={THEME.colors.white} />
                  <Text style={styles.primaryButtonText}>Register Node</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {nodeStatus === 'Registered' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton]}
              onPress={() => router.push('/staking')}
            >
              <Ionicons name="layers" size={20} color={THEME.colors.white} />
              <Text style={styles.primaryButtonText}>Stake to Activate</Text>
            </TouchableOpacity>
          )}

          {(nodeStatus === 'Waiting' || nodeStatus === 'Active') && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.successButton]}
                onPress={handleClaimRewards}
                disabled={isClaiming || stakingInfo?.rewardsRaw.isZero()}
              >
                {isClaiming ? (
                  <ActivityIndicator size="small" color={THEME.colors.white} />
                ) : (
                  <>
                    <Ionicons name="gift" size={20} color={THEME.colors.white} />
                    <Text style={styles.primaryButtonText}>Claim Rewards</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.warningButton]}
                onPress={handleStartUnbonding}
                disabled={isStartingUnbond}
              >
                {isStartingUnbond ? (
                  <ActivityIndicator size="small" color={THEME.colors.white} />
                ) : (
                  <>
                    <Ionicons name="exit" size={20} color={THEME.colors.white} />
                    <Text style={styles.primaryButtonText}>Start Unbonding</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {nodeStatus === 'Unbonding' && (
            <>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  unbondingInfo.canComplete ? styles.successButton : styles.disabledButton,
                ]}
                onPress={handleCompleteUnbonding}
                disabled={!unbondingInfo.canComplete || isCompletingUnbond}
              >
                {isCompletingUnbond ? (
                  <ActivityIndicator size="small" color={THEME.colors.white} />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={unbondingInfo.canComplete ? THEME.colors.white : THEME.colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.primaryButtonText,
                        !unbondingInfo.canComplete && styles.disabledButtonText,
                      ]}
                    >
                      Complete Unbonding
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {unbondingInfo.canComplete && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.dangerButton]}
                  onPress={handleDeleteNode}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={THEME.colors.white} />
                  ) : (
                    <>
                      <Ionicons name="trash" size={20} color={THEME.colors.white} />
                      <Text style={styles.primaryButtonText}>Delete Node</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={20} color={THEME.colors.primary} />
            <Text style={styles.infoTitle}>About vNodes</Text>
          </View>
          <Text style={styles.infoText}>
            Virtual Nodes (vNodes) let you participate in network validation using software.
            Stake 1,750 CHML minimum to activate your node and earn rewards.
          </Text>
          <View style={styles.infoDetails}>
            <View style={styles.infoRow}>
              <Ionicons name="timer-outline" size={16} color={THEME.colors.textSecondary} />
              <Text style={styles.infoDetailText}>Unbonding period: 7 days</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="trending-up-outline" size={16} color={THEME.colors.textSecondary} />
              <Text style={styles.infoDetailText}>Current APY: {stakingInfo?.apy?.toFixed(1) || '12.5'}%</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="layers-outline" size={16} color={THEME.colors.textSecondary} />
              <Text style={styles.infoDetailText}>Minimum stake: 1,750 CHML</Text>
            </View>
          </View>
        </View>

        {/* Bottom spacing for tab bar */}
        <View style={{ height: 120 }} />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
  },
  headerTitle: {
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  scrollContent: {
    paddingHorizontal: THEME.spacing.md,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.xl,
  },
  noWalletText: {
    fontSize: THEME.fontSize.lg,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
  },
  connectButton: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: THEME.spacing.xl,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.borderRadius.full,
  },
  connectButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
  },
  // Status Card
  statusCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    ...THEME.shadows.medium,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  statusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  statusTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.full,
    gap: THEME.spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.semibold,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.xl,
  },
  loadingText: {
    marginTop: THEME.spacing.md,
    color: THEME.colors.textSecondary,
  },
  statusContent: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.lg,
  },
  statusMessage: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginTop: THEME.spacing.md,
  },
  statusSubMessage: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: THEME.spacing.xs,
  },
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: THEME.spacing.md,
  },
  statItem: {
    width: '50%',
    paddingVertical: THEME.spacing.md,
  },
  statLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  statValue: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  // Unbonding content
  unbondingContent: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.md,
  },
  unbondingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },
  unbondingTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: STATUS_COLORS.Unbonding,
  },
  unbondingAmount: {
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.lg,
  },
  progressContainer: {
    width: '100%',
  },
  progressBar: {
    height: 8,
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: STATUS_COLORS.Unbonding,
    borderRadius: 4,
  },
  progressText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: THEME.spacing.sm,
  },
  // Actions Card
  actionsCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    ...THEME.shadows.medium,
  },
  actionsTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.borderRadius.full,
    marginBottom: THEME.spacing.sm,
    gap: THEME.spacing.sm,
  },
  primaryButton: {
    backgroundColor: THEME.colors.primary,
  },
  successButton: {
    backgroundColor: '#10B981',
  },
  warningButton: {
    backgroundColor: '#F97316',
  },
  dangerButton: {
    backgroundColor: '#EF4444',
  },
  disabledButton: {
    backgroundColor: THEME.colors.lightGrey,
  },
  primaryButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
  },
  disabledButtonText: {
    color: THEME.colors.textMuted,
  },
  // Info Card
  infoCard: {
    backgroundColor: THEME.colors.primaryLight,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },
  infoTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.primary,
  },
  infoText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    lineHeight: 20,
    marginBottom: THEME.spacing.md,
  },
  infoDetails: {
    gap: THEME.spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  infoDetailText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
});
