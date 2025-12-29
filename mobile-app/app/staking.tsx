/**
 * Staking Screen
 * Enterprise-grade staking interface for CHML tokens
 */

import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStaking } from '@/hooks/useStaking';
import { useWallet } from '@/context/WalletContext';
import { FeatureBadge } from '@/components/FeatureBadge';
import { MockViewBanner } from '@/components/MockViewBanner';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function StakingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();
  const {
    stakingInfo,
    validators,
    isLoading,
    isStaking,
    isUnstaking,
    isClaiming,
    error,
    stake,
    unstake,
    claimRewards,
    calculateEstimatedRewards,
  } = useStaking();

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'stake' | 'unstake'>('stake');

  const handleStake = async () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const result = await stake(stakeAmount);
    if (result.success) {
      Alert.alert('Success', 'Tokens staked successfully!');
      setStakeAmount('');
    } else {
      Alert.alert('Error', result.error || 'Staking failed');
    }
  };

  const handleUnstake = async () => {
    if (!unstakeAmount || parseFloat(unstakeAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const result = await unstake(unstakeAmount);
    if (result.success) {
      Alert.alert('Success', 'Unstaking initiated. Tokens will be available after unbonding period.');
      setUnstakeAmount('');
    } else {
      Alert.alert('Error', result.error || 'Unstaking failed');
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

  const handleMaxStake = () => {
    if (stakingInfo?.available) {
      const balance = stakingInfo.available.split(' ')[0].replace(/,/g, '');
      setStakeAmount(balance);
    }
  };

  const handleMaxUnstake = () => {
    if (stakingInfo?.staked) {
      const staked = stakingInfo.staked.split(' ')[0].replace(/,/g, '');
      setUnstakeAmount(staked);
    }
  };

  if (!wallet) {
    return (
      <LinearGradient
        colors={GRADIENTS.background.colors}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Staking</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="wallet-outline" size={64} color={THEME.colors.textMuted} />
          <Text style={styles.noWalletText}>Connect a wallet to start staking</Text>
        </View>
      </LinearGradient>
    );
  }

  const estimatedRewards = stakeAmount 
    ? calculateEstimatedRewards(stakeAmount, 365)
    : '0 CHML';

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Mock View Banner */}
      <MockViewBanner screenId="staking" featureName="Staking" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staking</Text>
        <FeatureBadge type="testnet" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Overview Card */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Available</Text>
              {isLoading ? (
                <ActivityIndicator size="small" color={THEME.colors.primary} />
              ) : (
                <Text style={styles.overviewValue}>
                  {stakingInfo?.available || '0 CHML'}
                </Text>
              )}
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Staked</Text>
              <Text style={[styles.overviewValue, styles.stakedValue]}>
                {stakingInfo?.staked || '0 CHML'}
              </Text>
            </View>
          </View>
          
          <View style={styles.apyContainer}>
            <Ionicons name="trending-up" size={20} color={THEME.colors.success} />
            <Text style={styles.apyText}>
              Est. APY: <Text style={styles.apyValue}>{stakingInfo?.apy || 12.5}%</Text>
            </Text>
          </View>
        </View>

        {/* Rewards Card */}
        {stakingInfo && !stakingInfo.rewardsRaw.isZero() && (
          <View style={styles.rewardsCard}>
            <View style={styles.rewardsInfo}>
              <Ionicons name="gift" size={24} color={THEME.colors.warning} />
              <View style={styles.rewardsText}>
                <Text style={styles.rewardsLabel}>Pending Rewards</Text>
                <Text style={styles.rewardsValue}>{stakingInfo.rewards}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.claimButton}
              onPress={handleClaimRewards}
              disabled={isClaiming}
            >
              {isClaiming ? (
                <ActivityIndicator size="small" color={THEME.colors.white} />
              ) : (
                <Text style={styles.claimButtonText}>Claim</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stake' && styles.tabActive]}
            onPress={() => setActiveTab('stake')}
          >
            <Text style={[
              styles.tabText,
              activeTab === 'stake' && styles.tabTextActive
            ]}>Stake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'unstake' && styles.tabActive]}
            onPress={() => setActiveTab('unstake')}
          >
            <Text style={[
              styles.tabText,
              activeTab === 'unstake' && styles.tabTextActive
            ]}>Unstake</Text>
          </TouchableOpacity>
        </View>

        {/* Stake/Unstake Form */}
        <View style={styles.formCard}>
          {activeTab === 'stake' ? (
            <>
              <Text style={styles.inputLabel}>Amount to Stake</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor={THEME.colors.textMuted}
                  value={stakeAmount}
                  onChangeText={setStakeAmount}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity style={styles.maxButton} onPress={handleMaxStake}>
                  <Text style={styles.maxButtonText}>MAX</Text>
                </TouchableOpacity>
              </View>

              {stakeAmount && parseFloat(stakeAmount) > 0 && (
                <View style={styles.estimateContainer}>
                  <Text style={styles.estimateLabel}>Est. Annual Rewards</Text>
                  <Text style={styles.estimateValue}>{estimatedRewards}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  (!stakeAmount || isStaking) && styles.actionButtonDisabled
                ]}
                onPress={handleStake}
                disabled={!stakeAmount || isStaking}
              >
                {isStaking ? (
                  <ActivityIndicator color={THEME.colors.white} />
                ) : (
                  <Text style={styles.actionButtonText}>Stake CHML</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.inputLabel}>Amount to Unstake</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor={THEME.colors.textMuted}
                  value={unstakeAmount}
                  onChangeText={setUnstakeAmount}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity style={styles.maxButton} onPress={handleMaxUnstake}>
                  <Text style={styles.maxButtonText}>MAX</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.warningContainer}>
                <Ionicons name="warning" size={16} color={THEME.colors.warning} />
                <Text style={styles.warningText}>
                  Unstaking requires a 14-day unbonding period
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.unstakeButton,
                  (!unstakeAmount || isUnstaking) && styles.actionButtonDisabled
                ]}
                onPress={handleUnstake}
                disabled={!unstakeAmount || isUnstaking}
              >
                {isUnstaking ? (
                  <ActivityIndicator color={THEME.colors.white} />
                ) : (
                  <Text style={styles.actionButtonText}>Unstake CHML</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Validators Section */}
        <View style={styles.validatorsSection}>
          <Text style={styles.sectionTitle}>Active Validators</Text>
          {validators.filter(v => v.isActive).slice(0, 3).map((validator, index) => (
            <View key={validator.address} style={styles.validatorCard}>
              <View style={styles.validatorLeft}>
                <View style={styles.validatorRank}>
                  <Text style={styles.validatorRankText}>{index + 1}</Text>
                </View>
                <View>
                  <Text style={styles.validatorName}>{validator.name}</Text>
                  <Text style={styles.validatorStaked}>
                    {validator.totalStaked} • {validator.nominators} nominators
                  </Text>
                </View>
              </View>
              <View style={styles.validatorRight}>
                <Text style={styles.validatorCommission}>
                  {validator.commission}% fee
                </Text>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              </View>
            </View>
          ))}
          
          {validators.filter(v => !v.isActive).length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: THEME.spacing.lg }]}>
                Inactive Validators
              </Text>
              {validators.filter(v => !v.isActive).slice(0, 2).map((validator, index) => (
                <View key={validator.address} style={[styles.validatorCard, styles.inactiveValidatorCard]}>
                  <View style={styles.validatorLeft}>
                    <View style={[styles.validatorRank, styles.inactiveValidatorRank]}>
                      <Text style={[styles.validatorRankText, styles.inactiveValidatorRankText]}>
                        {validators.filter(v => v.isActive).length + index + 1}
                      </Text>
                    </View>
                    <View>
                      <Text style={[styles.validatorName, styles.inactiveValidatorName]}>
                        {validator.name}
                      </Text>
                      <Text style={styles.validatorStaked}>
                        {validator.totalStaked} • {validator.nominators} nominators
                      </Text>
                    </View>
                  </View>
                  <View style={styles.validatorRight}>
                    <Text style={styles.validatorCommission}>
                      {validator.commission}% fee
                    </Text>
                    <View style={styles.inactiveBadge}>
                      <Text style={styles.inactiveBadgeText}>Inactive</Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noWalletText: {
    fontSize: THEME.fontSize.lg,
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  backButton: {
    padding: THEME.spacing.xs,
  },
  headerTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  // Overview Card
  overviewCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    ...THEME.shadows.medium,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overviewItem: {
    flex: 1,
  },
  overviewLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  overviewValue: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  stakedValue: {
    color: THEME.colors.primary,
  },
  apyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: THEME.spacing.md,
    paddingTop: THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  apyText: {
    marginLeft: THEME.spacing.sm,
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
  },
  apyValue: {
    color: THEME.colors.success,
    fontWeight: THEME.fontWeight.bold,
  },
  // Rewards Card
  rewardsCard: {
    backgroundColor: '#FFF8E1',
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rewardsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rewardsText: {
    marginLeft: THEME.spacing.md,
  },
  rewardsLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  rewardsValue: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  claimButton: {
    backgroundColor: THEME.colors.warning,
    borderRadius: THEME.borderRadius.full,
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
  },
  claimButtonText: {
    color: THEME.colors.white,
    fontWeight: THEME.fontWeight.semibold,
  },
  // Tabs
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: THEME.borderRadius.full,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: THEME.spacing.sm,
    alignItems: 'center',
    borderRadius: THEME.borderRadius.full,
  },
  tabActive: {
    backgroundColor: THEME.colors.white,
    ...THEME.shadows.small,
  },
  tabText: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.semibold,
  },
  // Form
  formCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    ...THEME.shadows.small,
  },
  inputLabel: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: THEME.borderRadius.medium,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    fontSize: THEME.fontSize.xl,
    color: THEME.colors.text,
    marginRight: THEME.spacing.sm,
  },
  maxButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.medium,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  maxButtonText: {
    color: THEME.colors.white,
    fontWeight: THEME.fontWeight.semibold,
    fontSize: THEME.fontSize.sm,
  },
  estimateContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: THEME.spacing.md,
    paddingTop: THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  estimateLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  estimateValue: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.success,
    fontWeight: THEME.fontWeight.semibold,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: THEME.borderRadius.small,
    padding: THEME.spacing.sm,
    marginTop: THEME.spacing.md,
  },
  warningText: {
    marginLeft: THEME.spacing.sm,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.text,
  },
  actionButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    alignItems: 'center',
    marginTop: THEME.spacing.lg,
  },
  unstakeButton: {
    backgroundColor: THEME.colors.error,
  },
  actionButtonDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
  actionButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  // Validators
  validatorsSection: {
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.xl,
  },
  sectionTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  validatorCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
    ...THEME.shadows.small,
  },
  validatorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  validatorRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  validatorRankText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.primary,
  },
  validatorName: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.text,
  },
  validatorStaked: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  validatorRight: {
    alignItems: 'flex-end',
  },
  validatorCommission: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  activeBadge: {
    backgroundColor: THEME.colors.successBg,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 2,
    borderRadius: THEME.borderRadius.small,
    marginTop: 4,
  },
  activeBadgeText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.success,
    fontWeight: THEME.fontWeight.medium,
  },
  // Inactive validator styles
  inactiveValidatorCard: {
    opacity: 0.7,
  },
  inactiveValidatorRank: {
    backgroundColor: THEME.colors.lightGrey,
  },
  inactiveValidatorRankText: {
    color: THEME.colors.textMuted,
  },
  inactiveValidatorName: {
    color: THEME.colors.textSecondary,
  },
  inactiveBadge: {
    backgroundColor: THEME.colors.lightGrey,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 2,
    borderRadius: THEME.borderRadius.small,
    marginTop: 4,
  },
  inactiveBadgeText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
    fontWeight: THEME.fontWeight.medium,
  },
});
