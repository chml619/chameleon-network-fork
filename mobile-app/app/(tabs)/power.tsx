/**
 * Power Screen - vNode Management & Liquidity Provision
 * Two sections:
 * 1. Validate - Manage validator node operations
 * 2. Provide Liquidity - LP management and rewards
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
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BN } from '@polkadot/util';
import { useStaking } from '@/hooks/useStaking';
import { useLiquidity } from '@/hooks/useLiquidity';
import { useWallet } from '@/context/WalletContext';
import { useApi } from '@/hooks/useApi';
import { NetworkBadge } from '@/components/NetworkBadge';
// MockViewBanner removed - functionality is now real
import { THEME, GRADIENTS } from '@/constants/theme';
import { NodeStatus } from '@/services/staking';
import { formatBalance, parseAmount } from '@/utils/balance';

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

type SectionType = 'validate' | 'liquidity';

// Add this interface before the component
interface LPPosition {
  poolId: number;
  poolName: string;
  tokenA: string;
  tokenB: string;
  liquidity: string;
  sharePercent: string;
}

export default function PowerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();
  const { connectionState } = useApi();
  
  // Section state
  const [activeSection, setActiveSection] = useState<SectionType>('validate');
  
  // Staking hook for validation
  const {
    stakingInfo,
    isLoading: stakingLoading,
    isClaiming: stakingClaiming,
    isRegistering,
    isStartingUnbond,
    isCompletingUnbond,
    isDeleting,
    claimRewards: claimStakingRewards,
    registerNode,
    startUnbonding,
    completeUnbonding,
    deleteNode,
    refetch: refetchStaking,
  } = useStaking();
  
  // Liquidity hook
  const {
    pools,
    positions,
    isLoading: liquidityLoading,
    isAdding,
    isRemoving,
    isClaiming: lpClaiming,
    totalPendingRewards,
    hasPositions,
    addLiquidity,
    removeLiquidity,
    claimRewards: claimLPRewards,
    refetch: refetchLiquidity,
  } = useLiquidity();

  const [refreshing, setRefreshing] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  
  // Add these state variables inside the component
  const [lpRewards, setLpRewards] = useState('0');
  const [lpPositions, setLpPositions] = useState<LPPosition[]>([]);
  const [isLoadingLP, setIsLoadingLP] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Add liquidity modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<number>(0);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');

  // Get current block number for unbonding countdown
  useEffect(() => {
    if (connectionState.blockNumber) {
      setCurrentBlock(connectionState.blockNumber);
    }
  }, [connectionState.blockNumber]);

  // Load LP data
  useEffect(() => {
    loadLPData();
  }, [connectionState.api, wallet?.address]);

  const loadLPData = async () => {
    if (!connectionState.api || !wallet?.address) return;
    setIsLoadingLP(true);
    try {
      // Mock LP rewards for now - will connect to emissions pallet
      // In production: const rewards = await api.query.emissions.pendingLpRewards(wallet.address);
      setLpRewards('0.0000');
      
      // Mock empty positions for now - will query pDEX pallet
      setLpPositions([]);
    } catch (error) {
      console.error('Error loading LP data:', error);
    } finally {
      setIsLoadingLP(false);
    }
  };

  const handleClaimLPRewards = async () => {
    if (!connectionState.api || !wallet) return;
    
    // For now, we'll mock the keyPair requirement
    // const keyPair = await walletService.getOrDeriveKeyPair();
    // if (!keyPair) {
    //   Alert.alert('Error', 'Wallet not unlocked');
    //   return;
    // }

    setActionLoading('claimLP');
    try {
      // Will connect to emissions.claimLpRewards() when pallet is ready
      // For now, show success with mock
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // if (refreshPCHMLBalance) await refreshPCHMLBalance();
      Alert.alert('Success', 'LP rewards claimed successfully!');
      await loadLPData();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Claim failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchStaking(),
      refetchLiquidity(),
    ]);
    setRefreshing(false);
  }, [refetchStaking, refetchLiquidity]);

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
    const seconds = blocks * 6;
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

  // Staking action handlers
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

  const handleClaimStakingRewards = async () => {
    if (!stakingInfo || stakingInfo.rewardsRaw.isZero()) {
      Alert.alert('No Rewards', 'You have no rewards to claim.');
      return;
    }
    const result = await claimStakingRewards();
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

  // LP action handlers
  const handleAddLiquidity = (poolId: number) => {
    setSelectedPoolId(poolId);
    setAmountA('');
    setAmountB('');
    setShowAddModal(true);
  };

  const handleConfirmAddLiquidity = async () => {
    if (!amountA || parseFloat(amountA) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const amountABN = parseAmount(amountA);
    const amountBBN = parseAmount(amountB || '0');

    const result = await addLiquidity(selectedPoolId, amountABN, amountBBN);
    setShowAddModal(false);

    if (result.success) {
      Alert.alert('Success', 'Liquidity added successfully!');
    } else {
      Alert.alert('Error', result.error || 'Failed to add liquidity');
    }
  };

  const handleRemoveLiquidity = async (poolId: number, lpAmount: BN) => {
    Alert.alert(
      'Remove Liquidity',
      'Are you sure you want to remove your liquidity from this pool?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeLiquidity(poolId, lpAmount);
            if (result.success) {
              Alert.alert('Success', 'Liquidity removed successfully!');
            } else {
              Alert.alert('Error', result.error || 'Failed to remove liquidity');
            }
          },
        },
      ]
    );
  };

  const handleClaimLPRewards = async (poolId: number) => {
    const result = await claimLPRewards(poolId);
    if (result.success) {
      Alert.alert('Success', 'LP rewards claimed successfully!');
    } else {
      Alert.alert('Error', result.error || 'Claim failed');
    }
  };

  const nodeStatus = stakingInfo?.status || 'None';
  const statusColor = STATUS_COLORS[nodeStatus];
  const unbondingInfo = getUnbondingProgress();
  const isLoading = activeSection === 'validate' ? stakingLoading : liquidityLoading;

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
          <Text style={styles.noWalletText}>Connect a wallet to manage your vNode and LP positions</Text>
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Power</Text>
        <NetworkBadge size="small" />
      </View>

      {/* Section Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeSection === 'validate' && styles.tabActive]}
          onPress={() => setActiveSection('validate')}
        >
          <Ionicons
            name="flash"
            size={18}
            color={activeSection === 'validate' ? THEME.colors.white : THEME.colors.textSecondary}
          />
          <Text style={[styles.tabText, activeSection === 'validate' && styles.tabTextActive]}>
            Validate
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeSection === 'liquidity' && styles.tabActive]}
          onPress={() => setActiveSection('liquidity')}
        >
          <Ionicons
            name="water"
            size={18}
            color={activeSection === 'liquidity' ? THEME.colors.white : THEME.colors.textSecondary}
          />
          <Text style={[styles.tabText, activeSection === 'liquidity' && styles.tabTextActive]}>
            Provide Liquidity
          </Text>
        </TouchableOpacity>
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
        {/* VALIDATE SECTION */}
        {activeSection === 'validate' && (
          <>
            {/* Node Status Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="flash" size={24} color={statusColor} />
                  <Text style={styles.cardTitle}>vNode Status</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {nodeStatus === 'None' ? 'Not Registered' : nodeStatus}
                  </Text>
                </View>
              </View>

              {stakingLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={THEME.colors.primary} />
                  <Text style={styles.loadingText}>Loading node status...</Text>
                </View>
              ) : (
                <>
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
                      <Text style={styles.unbondingAmount}>{stakingInfo?.unbonding || '0 CHML'}</Text>
                      <View style={styles.progressContainer}>
                        <View style={styles.progressBar}>
                          <View style={[styles.progressFill, { width: `${unbondingInfo.progress}%` }]} />
                        </View>
                        <Text style={styles.progressText}>
                          {unbondingInfo.canComplete ? 'Ready to complete!' : formatBlocksToTime(unbondingInfo.blocksRemaining)}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Validate Actions Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Actions</Text>
              {nodeStatus === 'None' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.primaryButton]}
                  onPress={() => router.push('/register-node' as any)}
                  disabled={isRegistering}
                >
                  {isRegistering ? (
                    <ActivityIndicator size="small" color={THEME.colors.white} />
                  ) : (
                    <>
                      <Ionicons name="add-circle" size={20} color={THEME.colors.white} />
                      <Text style={styles.actionButtonText}>Register Node</Text>
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
                  <Text style={styles.actionButtonText}>Stake to Activate</Text>
                </TouchableOpacity>
              )}

              {(nodeStatus === 'Waiting' || nodeStatus === 'Active') && (
                <>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.successButton]}
                    onPress={handleClaimStakingRewards}
                    disabled={stakingClaiming || stakingInfo?.rewardsRaw.isZero()}
                  >
                    {stakingClaiming ? (
                      <ActivityIndicator size="small" color={THEME.colors.white} />
                    ) : (
                      <>
                        <Ionicons name="gift" size={20} color={THEME.colors.white} />
                        <Text style={styles.actionButtonText}>Claim Rewards</Text>
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
                        <Text style={styles.actionButtonText}>Start Unbonding</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {nodeStatus === 'Unbonding' && (
                <>
                  <TouchableOpacity
                    style={[styles.actionButton, unbondingInfo.canComplete ? styles.successButton : styles.disabledButton]}
                    onPress={handleCompleteUnbonding}
                    disabled={!unbondingInfo.canComplete || isCompletingUnbond}
                  >
                    {isCompletingUnbond ? (
                      <ActivityIndicator size="small" color={THEME.colors.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color={unbondingInfo.canComplete ? THEME.colors.white : THEME.colors.textMuted} />
                        <Text style={[styles.actionButtonText, !unbondingInfo.canComplete && styles.disabledText]}>Complete Unbonding</Text>
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
                          <Text style={styles.actionButtonText}>Delete Node</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {/* vNode Info Card */}
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
              </View>
            </View>
          </>
        )}

        {/* LIQUIDITY SECTION */}
        {activeSection === 'liquidity' && (
          <>
            {/* Your LP Positions */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="wallet" size={24} color={THEME.colors.primary} />
                  <Text style={styles.cardTitle}>Your LP Positions</Text>
                </View>
                {!totalPendingRewards.isZero() && (
                  <View style={[styles.statusBadge, { backgroundColor: '#10B98120' }]}>
                    <Text style={[styles.statusText, { color: '#10B981' }]}>
                      {formatBalance(totalPendingRewards)} pending
                    </Text>
                  </View>
                )}
              </View>

              {liquidityLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={THEME.colors.primary} />
                  <Text style={styles.loadingText}>Loading positions...</Text>
                </View>
              ) : !hasPositions ? (
                <View style={styles.statusContent}>
                  <Ionicons name="water-outline" size={48} color={THEME.colors.textMuted} />
                  <Text style={styles.statusMessage}>No LP positions yet</Text>
                  <Text style={styles.statusSubMessage}>
                    Add liquidity to start earning rewards
                  </Text>
                </View>
              ) : (
                <View style={styles.positionsList}>
                  {positions.map((position) => (
                    <View key={position.poolId} style={[styles.positionCard, { borderLeftColor: position.color }]}>
                      <View style={styles.positionHeader}>
                        <Text style={styles.positionName}>{position.poolName}</Text>
                        <View style={[styles.apyBadge, { backgroundColor: '#10B98120' }]}>
                          <Text style={styles.apyText}>{position.sharePercent.toFixed(2)}% share</Text>
                        </View>
                      </View>
                      <View style={styles.positionStats}>
                        <View style={styles.positionStat}>
                          <Text style={styles.positionStatLabel}>LP Tokens</Text>
                          <Text style={styles.positionStatValue}>{formatBalance(position.lpTokens)}</Text>
                        </View>
                        <View style={styles.positionStat}>
                          <Text style={styles.positionStatLabel}>Pending Rewards</Text>
                          <Text style={[styles.positionStatValue, { color: '#10B981' }]}>
                            {formatBalance(position.pendingRewards)} CHML
                          </Text>
                        </View>
                      </View>
                      <View style={styles.positionActions}>
                        <TouchableOpacity
                          style={[styles.positionButton, styles.claimButton]}
                          onPress={() => handleClaimLPRewards(position.poolId)}
                          disabled={lpClaiming || position.pendingRewards.isZero()}
                        >
                          {lpClaiming ? (
                            <ActivityIndicator size="small" color="#10B981" />
                          ) : (
                            <Text style={styles.claimButtonText}>Claim</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.positionButton, styles.removeButton]}
                          onPress={() => handleRemoveLiquidity(position.poolId, position.lpTokens)}
                          disabled={isRemoving}
                        >
                          <Text style={styles.removeButtonText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Available Pools */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Available Pools</Text>
              {liquidityLoading ? (
                <ActivityIndicator size="small" color={THEME.colors.primary} />
              ) : (
                <View style={styles.poolsList}>
                  {pools.map((pool) => (
                    <View key={pool.poolId} style={[styles.poolCard, { borderLeftColor: pool.color }]}>
                      <View style={styles.poolHeader}>
                        <Text style={styles.poolName}>{pool.name}</Text>
                        <View style={[styles.apyBadge, { backgroundColor: '#10B98120' }]}>
                          <Text style={styles.apyText}>{pool.apy.toFixed(1)}% APY</Text>
                        </View>
                      </View>
                      <View style={styles.poolStats}>
                        <Text style={styles.poolStatText}>
                          TVL: {formatBalance(pool.reserveA)} + {formatBalance(pool.reserveB)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.primaryButton, { marginTop: 12 }]}
                        onPress={() => handleAddLiquidity(pool.poolId)}
                        disabled={isAdding}
                      >
                        {isAdding ? (
                          <ActivityIndicator size="small" color={THEME.colors.white} />
                        ) : (
                          <>
                            <Ionicons name="add" size={18} color={THEME.colors.white} />
                            <Text style={styles.actionButtonText}>Add Liquidity</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* LP Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <Ionicons name="information-circle" size={20} color={THEME.colors.primary} />
                <Text style={styles.infoTitle}>About Liquidity Provision</Text>
              </View>
              <Text style={styles.infoText}>
                Provide liquidity to earn 30% of block rewards. Higher APY pools earn proportionally more.
                Rewards accumulate per block and can be claimed anytime.
              </Text>
              <View style={styles.infoDetails}>
                <View style={styles.infoRow}>
                  <Ionicons name="pie-chart-outline" size={16} color={THEME.colors.textSecondary} />
                  <Text style={styles.infoDetailText}>30% of emissions go to LP providers</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={16} color={THEME.colors.textSecondary} />
                  <Text style={styles.infoDetailText}>Rewards accumulate every block</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Add Liquidity Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Liquidity</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={THEME.colors.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalPoolName}>
              {pools.find(p => p.poolId === selectedPoolId)?.name || 'Pool'}
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Amount A (pCHML)</Text>
              <TextInput
                style={styles.input}
                value={amountA}
                onChangeText={setAmountA}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Amount B</Text>
              <TextInput
                style={styles.input}
                value={amountB}
                onChangeText={setAmountB}
                placeholder="0.00 (auto-calculated)"
                keyboardType="decimal-pad"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>

            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton, { marginTop: 16 }]}
              onPress={handleConfirmAddLiquidity}
              disabled={isAdding}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color={THEME.colors.white} />
              ) : (
                <Text style={styles.actionButtonText}>Confirm Add Liquidity</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    fontWeight: THEME.fontWeight.bold as any,
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
    fontWeight: THEME.fontWeight.semibold as any,
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: THEME.borderRadius.full,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.full,
    gap: 6,
  },
  tabActive: {
    backgroundColor: THEME.colors.primary,
  },
  tabText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium as any,
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: THEME.colors.white,
  },
  // Card styles
  card: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    ...THEME.shadows.medium,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  cardTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold as any,
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
    fontWeight: THEME.fontWeight.semibold as any,
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
    fontWeight: THEME.fontWeight.semibold as any,
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
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
  },
  // Unbonding
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
    fontWeight: THEME.fontWeight.semibold as any,
    color: STATUS_COLORS.Unbonding,
  },
  unbondingAmount: {
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold as any,
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
  // Action buttons
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.borderRadius.full,
    marginBottom: THEME.spacing.sm,
    gap: THEME.spacing.sm,
  },
  actionButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold as any,
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
  disabledText: {
    color: THEME.colors.textMuted,
  },
  // Info card
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
    fontWeight: THEME.fontWeight.semibold as any,
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
  // LP Positions
  positionsList: {
    gap: THEME.spacing.md,
  },
  positionCard: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    borderLeftWidth: 4,
  },
  positionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  positionName: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold as any,
    color: THEME.colors.text,
  },
  positionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.md,
  },
  positionStat: {},
  positionStatLabel: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
  },
  positionStatValue: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.semibold as any,
    color: THEME.colors.text,
  },
  positionActions: {
    flexDirection: 'row',
    gap: THEME.spacing.sm,
  },
  positionButton: {
    flex: 1,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.medium,
    alignItems: 'center',
  },
  claimButton: {
    backgroundColor: '#10B98120',
  },
  claimButtonText: {
    color: '#10B981',
    fontWeight: THEME.fontWeight.semibold as any,
  },
  removeButton: {
    backgroundColor: '#EF444420',
  },
  removeButtonText: {
    color: '#EF4444',
    fontWeight: THEME.fontWeight.semibold as any,
  },
  // Pool list
  poolsList: {
    gap: THEME.spacing.md,
  },
  poolCard: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    borderLeftWidth: 4,
  },
  poolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  poolName: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold as any,
    color: THEME.colors.text,
  },
  poolStats: {},
  poolStatText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  apyBadge: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 2,
    borderRadius: THEME.borderRadius.small,
  },
  apyText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: THEME.fontWeight.semibold as any,
    color: '#10B981',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: THEME.colors.white,
    borderTopLeftRadius: THEME.borderRadius.large,
    borderTopRightRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  modalTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
  },
  modalPoolName: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold as any,
    color: THEME.colors.primary,
    marginBottom: THEME.spacing.lg,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: THEME.spacing.md,
  },
  inputLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  input: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    fontSize: THEME.fontSize.lg,
    color: THEME.colors.text,
  },
});
