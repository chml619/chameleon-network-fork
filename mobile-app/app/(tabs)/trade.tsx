/**
 * Trade Tab - Privacy DEX (pDEX)
 * Full swap interface with privacy mode
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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePDEX } from '@/hooks/usePDEX';
import { useWallet } from '@/context/WalletContext';
import { TokenSelector } from '@/components/TokenSelector';
import { FeatureBadge } from '@/components/FeatureBadge';
import { MockViewBanner } from '@/components/MockViewBanner';
import { THEME, GRADIENTS } from '@/constants/theme';

type TabType = 'swap' | 'liquidity';

export default function TradeScreen() {
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();
  const {
    tokens,
    selectedTokenIn,
    selectedTokenOut,
    amountIn,
    quote,
    isLoadingQuote,
    isSwapping,
    privacyMode,
    error,
    setAmountIn,
    selectTokenIn,
    selectTokenOut,
    swapTokens,
    togglePrivacyMode,
    setMaxAmount,
    validateSwap,
    executeSwap,
  } = usePDEX();

  const [activeTab, setActiveTab] = useState<TabType>('swap');

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
            const result = await executeSwap();
            if (result.success) {
              Alert.alert('Success', 'Swap completed successfully!');
            } else {
              Alert.alert('Error', result.error || 'Swap failed');
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
      {/* Mock View Banner */}
      <MockViewBanner screenId="trade" featureName="Trading" />
      
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
          <FeatureBadge type="testnet" />
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
            {/* Privacy Mode Toggle */}
            <TouchableOpacity
              style={styles.privacyToggle}
              onPress={togglePrivacyMode}
            >
              <View style={styles.privacyLeft}>
                <Ionicons
                  name={privacyMode ? 'lock-closed' : 'lock-open'}
                  size={18}
                  color={privacyMode ? THEME.colors.primary : THEME.colors.textMuted}
                />
                <Text style={[
                  styles.privacyText,
                  privacyMode && styles.privacyTextActive
                ]}>
                  Privacy Mode
                </Text>
              </View>
              <View style={[
                styles.privacyBadge,
                privacyMode && styles.privacyBadgeActive
              ]}>
                <Text style={[
                  styles.privacyBadgeText,
                  privacyMode && styles.privacyBadgeTextActive
                ]}>
                  {privacyMode ? 'ON' : 'OFF'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Swap Card */}
            <View style={styles.swapCard}>
              {/* From Section */}
              <View style={styles.swapSection}>
                <View style={styles.swapSectionHeader}>
                  <Text style={styles.swapLabel}>From</Text>
                  <Text style={styles.balanceText}>
                    Balance: {selectedTokenIn.balance}
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
                    Balance: {selectedTokenOut.balance}
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
                    {privacyMode && (
                      <Ionicons name="lock-closed" size={18} color={THEME.colors.white} />
                    )}
                    <Text style={styles.swapButtonText}>
                      {validateSwap() || (privacyMode ? 'Swap Privately' : 'Swap')}
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
                {privacyMode
                  ? 'Your swap will use zero-knowledge proofs to hide transaction details from on-chain observers.'
                  : 'Enable Privacy Mode to hide your swap details using zero-knowledge proofs.'
                }
              </Text>
            </View>
          </>
        ) : (
          /* Liquidity Tab - Coming Soon */
          <View style={styles.comingSoonContainer}>
            <View style={styles.comingSoonIconContainer}>
              <Ionicons name="layers" size={48} color={THEME.colors.textMuted} />
            </View>
            <Text style={styles.comingSoonTitle}>Liquidity Pools</Text>
            <Text style={styles.comingSoonText}>
              Add liquidity to earn trading fees and LP rewards.
              This feature is coming soon!
            </Text>
            <FeatureBadge type="coming-soon" size="medium" />
          </View>
        )}

        {/* Bottom Spacing */}
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
  // Coming Soon
  comingSoonContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.xl,
    marginTop: THEME.spacing.xl * 2,
  },
  comingSoonIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: THEME.colors.lightGrey,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  comingSoonTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  comingSoonText: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: THEME.spacing.lg,
    lineHeight: 22,
  },
});
