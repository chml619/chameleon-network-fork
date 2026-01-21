/**
 * Trade Tab - Privacy DEX (pDEX)
 * Full swap interface with privacy mode
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
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePDEX } from '@/hooks/usePDEX';
import { useWallet } from '@/context/WalletContext';
import { useApi } from '@/hooks/useApi';
import { pdexService } from '@/services/pdex';
import { poolService, PoolInfo } from '@/services/pool';
import { transactionHistoryService } from '@/services/transactionHistory';
import { TokenSelector } from '@/components/TokenSelector';
import { FeatureBadge } from '@/components/FeatureBadge';
import { formatBalance, formatDisplayBalance } from '@/utils/balance';
import { THEME, GRADIENTS } from '@/constants/theme';

type TabType = 'swap' | 'liquidity';

export default function TradeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { wallet, refreshBalances, refreshPCHMLBalance } = useWallet();
  const { api } = useApi();
  const {
    tokens,
    selectedTokenIn,
    selectedTokenOut,
    amountIn,
    quote,
    isLoadingQuote,
    isSwapping,
    mevProtection,
    error,
    setAmountIn,
    selectTokenIn,
    selectTokenOut,
    swapTokens,
    toggleMEVProtection,
    setMaxAmount,
    validateSwap,
    executeSwap,
  } = usePDEX();

  const [activeTab, setActiveTab] = useState<TabType>('swap');
  const [poolStats, setPoolStats] = useState({
    totalValueLocked: '—',
    volume24h: '—',
    activePools: '—',
  });
  const [loadingPoolStats, setLoadingPoolStats] = useState(false);
  const [poolList, setPoolList] = useState<PoolInfo[]>([]);

  const [slippage, setSlippage] = useState('0.5');
  const [showSlippageModal, setShowSlippageModal] = useState(false);

  // Load pool statistics
  const loadPoolStats = async () => {
    if (!api) return;
    
    setLoadingPoolStats(true);
    try {
      const pools = await poolService.getAllPools(api);
      setPoolList(pools); // Store pool list for display
      const activePoolCount = pools.length;
      
      // Calculate TVL from pool reserves (simplified)
      let totalTVL = 0;
      pools.forEach((pool: any) => {
        const reserveA = parseFloat(pool.reserveA) / Math.pow(10, 12);
        const reserveB = parseFloat(pool.reserveB) / Math.pow(10, 12);
        // Simplified TVL calculation (assuming 1:1 USD for demo)
        totalTVL += reserveA + reserveB;
      });
      
      setPoolStats({
        totalValueLocked: totalTVL > 0 ? `$${(totalTVL / 1000000).toFixed(1)}M` : '—',
        volume24h: '—', // Not tracked
        activePools: activePoolCount.toString(),
      });
    } catch (error) {
      console.error('Error loading pool stats:', error);
      setPoolStats({
        totalValueLocked: '—',
        volume24h: '—',
        activePools: '—',
      });
    } finally {
      setLoadingPoolStats(false);
    }
  };

  // Load pool stats when API is available
  useEffect(() => {
    if (api && activeTab === 'liquidity') {
      loadPoolStats();
    }
  }, [api, activeTab]);

  const handleSwap = async () => {
    const validationError = validateSwap();
    if (validationError) {
      Alert.alert('Error', validationError);
      return;
    }

    if (!quote) {
      Alert.alert('Error', 'Please wait for quote to load');
      return;
    }

    Alert.alert(
      'Confirm Swap',
      `Swap ${quote.amountIn} for ${quote.amountOut}?\n\nPrice Impact: ${quote.priceImpact}\nFee: ${quote.fee}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Swap',
          onPress: async () => {
            let result: any = null;
            let txHash = '';
            let success = false;
            
            try {
              result = await executeSwap();
              success = result?.success || false;
              txHash = result?.txHash || '';
              
              if (success) {
                Alert.alert('Success', 'Swap completed successfully!');
                // Refresh all balances
                refreshBalances();
                refreshPCHMLBalance(); 
	      } else {
                Alert.alert('Error', result?.error || 'Swap failed');
              }
            } catch (error) {
              console.error('[Trade] Swap execution error:', error);
              Alert.alert('Error', 'Swap failed due to network or validation error');
            }
            
            // Save swap to transaction history (both success and failure)
            if (wallet?.address) {
              try {
                await transactionHistoryService.saveTransaction(wallet.address, {
                  hash: txHash || `swap_${Date.now()}`,
                  from: wallet.address,
                  to: wallet.address,
                  amount: amountIn,
                  formattedAmount: success
		    ? `${amountIn} ${selectedTokenIn.symbol} → ${result?.amountOut || quote.amountOut}`
                    : `Failed: ${amountIn} ${selectedTokenIn.symbol} → ${selectedTokenOut.symbol}`,
                  status: success ? 'finalized' : 'failed',
                  usedMEVProtection: mevProtection,
                  type: 'swap',
                  error: success ? undefined : (result?.error || 'Swap failed'),
                });
              } catch (e) {
                console.error('[Trade] Failed to save swap to history:', e);
              }
            }
          },
        },
      ]
    );
  };

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarContainer}>
            <Image
              source={require('@/assets/images/Logo.png')}
              style={styles.avatar}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.headerTitle}>Trade</Text>
        </View>
        <View style={styles.headerRight}>
          <FeatureBadge type="devnet" />
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'swap' && styles.tabActive]}
          onPress={() => setActiveTab('swap')}
        >
          <Ionicons
            name="swap-horizontal"
            size={18}
            color={activeTab === 'swap' ? THEME.colors.primary : THEME.colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'swap' && styles.tabTextActive]}>
            Swap
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'liquidity' && styles.tabActive]}
          onPress={() => setActiveTab('liquidity')}
        >
          <Ionicons
            name="layers"
            size={18}
            color={activeTab === 'liquidity' ? THEME.colors.primary : THEME.colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'liquidity' && styles.tabTextActive]}>
            Liquidity
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {activeTab === 'swap' ? (
          <>
            {/* MEV Protection Toggle */}
            <TouchableOpacity
              style={styles.privacyToggle}
              onPress={toggleMEVProtection}
            >
              <View style={styles.privacyLeft}>
                <Ionicons
                  name={mevProtection ? 'lock-closed' : 'lock-open'}
                  size={18}
                  color={mevProtection ? THEME.colors.primary : THEME.colors.textMuted}
                />
                <Text style={[
                  styles.privacyText,
                  mevProtection && styles.privacyTextActive
                ]}>
                  MEV Protection
                </Text>
              </View>
              <View style={[
                styles.privacyBadge,
                mevProtection && styles.privacyBadgeActive
              ]}>
                <Text style={[
                  styles.privacyBadgeText,
                  mevProtection && styles.privacyBadgeTextActive
                ]}>
                  {mevProtection ? 'ON' : 'OFF'}
                </Text>
              </View>
            </TouchableOpacity>


            {/* Slippage Settings */}
            <TouchableOpacity
              style={styles.slippageToggle}
              onPress={() => setShowSlippageModal(true)}
            >
              <View style={styles.privacyLeft}>
                <Ionicons name="settings-outline" size={18} color={THEME.colors.textSecondary} />
                <Text style={styles.slippageText}>Slippage Tolerance</Text>
              </View>
              <View style={styles.slippageBadge}>
                <Text style={styles.slippageBadgeText}>{slippage}%</Text>
                <Ionicons name="chevron-forward" size={16} color={THEME.colors.textMuted} />
              </View>
            </TouchableOpacity>
            {/* Swap Card */}
            <View style={styles.swapCard}>
              {/* From Section */}
              <View style={styles.swapSection}>
                <View style={styles.swapSectionHeader}>
                  <Text style={styles.swapLabel}>From</Text>
                  <Text style={styles.balanceText}>
                    Balance: {selectedTokenIn.balance} {selectedTokenIn.symbol}
                  </Text>
                </View>
                <View style={styles.swapRow}>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0"
                    placeholderTextColor={THEME.colors.textMuted}
                    value={amountIn}
                    onChangeText={setAmountIn}
                    keyboardType="decimal-pad"
                  />
                  <TokenSelector
                    selectedToken={selectedTokenIn}
                    tokens={tokens}
                    onSelectToken={selectTokenIn}
                    showBalance={false}
                  />
                </View>
                <TouchableOpacity style={styles.maxButton} onPress={setMaxAmount}>
                  <Text style={styles.maxButtonText}>MAX</Text>
                </TouchableOpacity>
              </View>

              {/* Swap Direction Button */}
              <TouchableOpacity style={styles.swapDirectionButton} onPress={swapTokens}>
                <View style={styles.swapDirectionIcon}>
                  <Ionicons name="swap-vertical" size={24} color={THEME.colors.white} />
                </View>
              </TouchableOpacity>

              {/* To Section */}
              <View style={styles.swapSection}>
                <View style={styles.swapSectionHeader}>
                  <Text style={styles.swapLabel}>To</Text>
                  <Text style={styles.balanceText}>
                    Balance: {selectedTokenOut.balance} {selectedTokenOut.symbol}
                  </Text>
                </View>
                <View style={styles.swapRow}>
                  <Text style={styles.outputAmount}>
                    {isLoadingQuote ? (
                      <ActivityIndicator size="small" color={THEME.colors.primary} />
                    ) : (
                      quote?.amountOut.split(' ')[0] || '0'
                    )}
                  </Text>
                  <TokenSelector
                    selectedToken={selectedTokenOut}
                    tokens={tokens}
                    onSelectToken={selectTokenOut}
                    showBalance={false}
                  />
                </View>
              </View>
            </View>

            {/* Quote Details */}
            {quote && (
              <View style={styles.quoteCard}>
                <View style={styles.quoteRow}>
                  <Text style={styles.quoteLabel}>Exchange Rate</Text>
                  <Text style={styles.quoteValue}>{quote.exchangeRate}</Text>
                </View>
                <View style={styles.quoteRow}>
                  <Text style={styles.quoteLabel}>Price Impact</Text>
                  <Text style={[
                    styles.quoteValue,
                    quote.priceImpact.includes('0.5') && styles.quoteValueWarning
                  ]}>
                    {quote.priceImpact}
                  </Text>
                </View>
                <View style={styles.quoteRow}>
                  <Text style={styles.quoteLabel}>Swap Fee</Text>
                  <Text style={styles.quoteValue}>{quote.feeAmount}</Text>
                </View>
                <View style={styles.quoteRow}>
                  <Text style={styles.quoteLabel}>Min. Received</Text>
                  <Text style={styles.quoteValueHighlight}>{quote.amountOutMin}</Text>
                </View>
              </View>
            )}

            {/* Error Display */}
            {error && (
              <View style={styles.errorCard}>
                <View style={styles.errorHeader}>
                  <Ionicons name="warning" size={20} color={THEME.colors.error} />
                  <Text style={styles.errorTitle}>Error</Text>
                </View>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Swap Button */}
            {wallet ? (
              <TouchableOpacity
                style={[
                  styles.swapButton,
                  (validateSwap() || isSwapping) && styles.swapButtonDisabled
                ]}
                onPress={handleSwap}
                disabled={!!validateSwap() || isSwapping}
              >
                {isSwapping ? (
                  <ActivityIndicator color={THEME.colors.white} />
                ) : (
                  <>
                    {mevProtection && (
                      <Ionicons name="lock-closed" size={18} color={THEME.colors.white} />
                    )}
                    <Text style={styles.swapButtonText}>
                      {validateSwap() || (mevProtection ? 'Swap Privately' : 'Swap')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.connectWalletContainer}>
                <TouchableOpacity
                  style={styles.swapButton}
                  onPress={() => Alert.alert(
                    'Demo Mode',
                    'This is a preview of the pDEX swap interface. Create or import a wallet to execute real swaps.',
                    [{ text: 'OK' }]
                  )}
                >
                  <Ionicons name="eye-outline" size={18} color={THEME.colors.white} />
                  <Text style={styles.swapButtonText}>Preview Swap (Demo)</Text>
                </TouchableOpacity>
                <Text style={styles.connectWalletText}>
                  Create a wallet to execute real swaps
                </Text>
              </View>
            )}

            {/* Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <Ionicons name="shield-checkmark" size={20} color={THEME.colors.primary} />
                <Text style={styles.infoTitle}>Privacy DEX</Text>
              </View>
              <Text style={styles.infoText}>
                {mevProtection
                  ? 'MEV Protection ON: Your swap uses ring signatures to hide your identity from mempool bots, preventing front-running attacks.'
                  : 'MEV Protection OFF: Standard swap - still private but timing is visible to MEV bots.'
                }
              </Text>
            </View>
          </>
        ) : (
          /* Liquidity Tab */
          <View style={styles.liquidityContainer}>
            <Text style={styles.liquidityTitle}>Liquidity Pools</Text>
            <Text style={styles.liquiditySubtitle}>
              Add liquidity to earn trading fees and LP rewards
            </Text>
            
            {/* Quick Actions */}
            <View style={styles.liquidityActions}>
              <TouchableOpacity 
                style={styles.liquidityActionButton}
                onPress={() => router.push('/add-liquidity' as any)}
              >
                <View style={styles.liquidityActionIcon}>
                  <Ionicons name="add" size={24} color={THEME.colors.primary} />
                </View>
                <Text style={styles.liquidityActionText}>Add Liquidity</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.liquidityActionButton}
                onPress={() => router.push('/remove-liquidity' as any)}
              >
                <View style={styles.liquidityActionIcon}>
                  <Ionicons name="remove" size={24} color={THEME.colors.error} />
                </View>
                <Text style={styles.liquidityActionText}>Remove Liquidity</Text>
              </TouchableOpacity>
            </View>

            {/* Pool Stats */}
            <View style={styles.poolStatsCard}>
              <Text style={styles.poolStatsTitle}>Pool Overview</Text>
              <View style={styles.poolStatRow}>
                <Text style={styles.poolStatLabel}>Total Value Locked</Text>
                <Text style={styles.poolStatValue}>
                  {loadingPoolStats ? '...' : poolStats.totalValueLocked}
                </Text>
              </View>
              <View style={styles.poolStatRow}>
                <Text style={styles.poolStatLabel}>24h Volume</Text>
                <Text style={styles.poolStatValue}>
                  {loadingPoolStats ? '...' : poolStats.volume24h}
                </Text>
              </View>
              <View style={styles.poolStatRow}>
                <Text style={styles.poolStatLabel}>Active Pools</Text>
                <Text style={styles.poolStatValue}>
                  {loadingPoolStats ? '...' : poolStats.activePools}
                </Text>
              </View>
            </View>

            {/* Pool List */}
            <View style={styles.poolListContainer}>
              <Text style={styles.poolListTitle}>Available Pools</Text>
              {loadingPoolStats ? (
                <View style={styles.poolLoadingContainer}>
                  <ActivityIndicator size="small" color={THEME.colors.primary} />
                  <Text style={styles.poolLoadingText}>Loading pools...</Text>
                </View>
              ) : poolList.length > 0 ? (
                poolList.map((pool) => (
                  <TouchableOpacity
                    key={pool.id}
                    style={styles.poolCard}
                    onPress={() => router.push(`/pool-detail?poolId=${pool.id}` as any)}
                  >
                    <View style={styles.poolCardHeader}>
                      <Text style={styles.poolPairText}>
                        {poolService.getTokenSymbol(pool.assetA)} / {poolService.getTokenSymbol(pool.assetB)}
                      </Text>
                      <Text style={styles.poolFeeText}>{pool.swapFee}</Text>
                    </View>
                    <View style={styles.poolCardBody}>
                      <Text style={styles.poolReservesText}>
                        Reserves: {poolService.formatAmount(pool.reserveA)} / {poolService.formatAmount(pool.reserveB)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyPoolsContainer}>
                  <Text style={styles.emptyPoolsText}>No pools available</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Bottom Spacing */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Slippage Modal */}
      <Modal visible={showSlippageModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Slippage Tolerance</Text>
              <TouchableOpacity onPress={() => setShowSlippageModal(false)}>
                <Ionicons name="close" size={24} color={THEME.colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              Your transaction will revert if the price changes unfavorably by more than this percentage.
            </Text>
            <View style={styles.slippageOptions}>
              {["0.5", "1.0", "3.0"].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.slippageOption, slippage === value && styles.slippageOptionActive]}
                  onPress={() => { setSlippage(value); setShowSlippageModal(false); }}
                >
                  <Text style={[styles.slippageOptionText, slippage === value && styles.slippageOptionTextActive]}>{value}%</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.customSlippage}>
              <Text style={styles.customSlippageLabel}>Custom:</Text>
              <TextInput
                style={styles.customSlippageInput}
                value={slippage}
                onChangeText={setSlippage}
                keyboardType="decimal-pad"
                placeholder="0.5"
              />
              <Text style={styles.customSlippagePercent}>%</Text>
            </View>
            <TouchableOpacity style={styles.slippageConfirm} onPress={() => setShowSlippageModal(false)}>
              <Text style={styles.slippageConfirmText}>Confirm</Text>
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
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.sm,
  },
  avatar: {
    width: 30,
    height: 30,
  },
  headerTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Tabs
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
    gap: THEME.spacing.xs,
  },
  tabActive: {
    backgroundColor: THEME.colors.white,
    ...THEME.shadows.small,
  },
  tabText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.semibold,
  },
  // Privacy Toggle
  privacyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    ...THEME.shadows.small,
  },
  privacyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  privacyText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  privacyTextActive: {
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.medium,
  },
  privacyBadge: {
    backgroundColor: THEME.colors.lightGrey,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.small,
  },
  privacyBadgeActive: {
    backgroundColor: THEME.colors.primaryLight,
  },
  privacyBadgeText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.textMuted,
  },
  privacyBadgeTextActive: {
    color: THEME.colors.primary,
  },
  // Swap Card
  swapCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    ...THEME.shadows.medium,
  },
  swapSection: {
    marginBottom: THEME.spacing.sm,
  },
  swapSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.sm,
  },
  swapLabel: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  balanceText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
  },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountInput: {
    flex: 1,
    fontSize: THEME.fontSize['3xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    padding: 0,
    marginRight: THEME.spacing.md,
  },
  outputAmount: {
    flex: 1,
    fontSize: THEME.fontSize['3xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.textSecondary,
  },
  maxButton: {
    alignSelf: 'flex-start',
    marginTop: THEME.spacing.xs,
  },
  maxButtonText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.secondary,
    fontWeight: THEME.fontWeight.semibold,
  },
  swapDirectionButton: {
    alignItems: 'center',
    marginVertical: THEME.spacing.xs,
  },
  swapDirectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Quote Card
  quoteCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.sm,
  },
  quoteLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  quoteValue: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.text,
  },
  quoteValueWarning: {
    color: THEME.colors.warning,
  },
  quoteValueHighlight: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.primary,
  },
  // Swap Button
  swapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.primary,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    gap: THEME.spacing.sm,
  },
  swapButtonDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
  swapButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  connectWalletContainer: {
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: THEME.borderRadius.medium,
    alignItems: 'center',
  },
  connectWalletText: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
  },
  // Info Card
  infoCard: {
    backgroundColor: THEME.colors.primaryLight,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
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
    color: THEME.colors.text,
    lineHeight: 20,
  },
  // Error Card
  errorCard: {
    backgroundColor: THEME.colors.errorBg,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.error,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },
  errorTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.error,
  },
  errorText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.error,
    lineHeight: 20,
  },
  // Liquidity Tab
  liquidityContainer: {
    padding: THEME.spacing.md,
  },
  liquidityTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.xs,
  },
  liquiditySubtitle: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.lg,
  },
  liquidityActions: {
    flexDirection: 'row',
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
  },
  liquidityActionButton: {
    flex: 1,
    backgroundColor: THEME.colors.white,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    alignItems: 'center',
    ...THEME.shadows.small,
  },
  liquidityActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.colors.lightGrey,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  liquidityActionText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium as any,
    color: THEME.colors.text,
  },
  poolStatsCard: {
    backgroundColor: THEME.colors.white,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    ...THEME.shadows.small,
  },
  poolStatsTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  poolStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  poolStatLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  poolStatValue: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.semibold as any,
    color: THEME.colors.text,
  },
  // Pool List Styles
  poolListContainer: {
    backgroundColor: THEME.colors.white,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    marginTop: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  poolListTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  poolLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: THEME.spacing.lg,
  },
  poolLoadingText: {
    marginLeft: THEME.spacing.sm,
    color: THEME.colors.textSecondary,
    fontSize: THEME.fontSize.sm,
  },
  poolCard: {
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  poolCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  poolPairText: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold as any,
    color: THEME.colors.text,
  },
  poolFeeText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.medium as any,
  },
  poolCardBody: {
    marginTop: THEME.spacing.xs,
  },
  poolReservesText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  emptyPoolsContainer: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.lg,
  },
  emptyPoolsText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
  },
  slippageToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    padding: THEME.spacing.sm,
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
  },
  slippageText: {
    marginLeft: THEME.spacing.sm,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  slippageBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  slippageBadgeText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.text,
    marginRight: THEME.spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: THEME.colors.white,
    borderTopLeftRadius: THEME.borderRadius.large,
    borderTopRightRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: THEME.spacing.md,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  modalDescription: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.lg,
  },
  slippageOptions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: THEME.spacing.lg,
  },
  slippageOption: {
    flex: 1,
    padding: THEME.spacing.md,
    marginHorizontal: THEME.spacing.xs,
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: THEME.borderRadius.medium,
    alignItems: "center",
  },
  slippageOptionActive: {
    backgroundColor: THEME.colors.primary,
  },
  slippageOptionText: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.text,
  },
  slippageOptionTextActive: {
    color: THEME.colors.white,
  },
  customSlippage: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: THEME.spacing.lg,
  },
  customSlippageLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginRight: THEME.spacing.sm,
  },
  customSlippageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.sm,
    fontSize: THEME.fontSize.base,
    textAlign: "center",
  },
  customSlippagePercent: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
    marginLeft: THEME.spacing.sm,
  },
  slippageConfirm: {
    backgroundColor: THEME.colors.primary,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    alignItems: "center",
  },
  slippageConfirmText: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.white,
  },
});
