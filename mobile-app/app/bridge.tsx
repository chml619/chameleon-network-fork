/**
 * Bridge Screen
 * Cross-chain asset bridging with privacy preservation
 */

import React from 'react';
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
import { useBridge } from '@/hooks/useBridge';
import { useWallet } from '@/context/WalletContext';
import { ChainSelector } from '@/components/ChainSelector';
import { FeatureBadge } from '@/components/FeatureBadge';
import { MockViewBanner } from '@/components/MockViewBanner';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function BridgeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();
  const {
    supportedChains,
    bridgeableAssets,
    sourceChain,
    destChain,
    selectedAsset,
    amount,
    destAddress,
    quote,
    isLoadingQuote,
    isBridging,
    pendingBridges,
    error,
    setSourceChain,
    setDestChain,
    setSelectedAsset,
    setAmount,
    setDestAddress,
    swapChains,
    initiateBridge,
  } = useBridge();

  const handleBridge = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!destAddress) {
      Alert.alert('Error', 'Please enter a destination address');
      return;
    }

    Alert.alert(
      'Confirm Bridge',
      `Bridge ${amount} ${selectedAsset?.symbol} from ${sourceChain.name} to ${destChain.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Bridge',
          onPress: async () => {
            const result = await initiateBridge();
            if (result.success) {
              Alert.alert(
                'Bridge Initiated',
                `Your bridge transaction has been submitted. Estimated time: ${quote?.fee.estimatedTime}`,
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } else {
              Alert.alert('Error', result.error || 'Bridge failed');
            }
          },
        },
      ]
    );
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
          <Text style={styles.headerTitle}>Bridge</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="wallet-outline" size={64} color={THEME.colors.textMuted} />
          <Text style={styles.noWalletText}>Connect a wallet to use the bridge</Text>
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
      <MockViewBanner screenId="bridge" featureName="Bridge" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cross-Chain Bridge</Text>
        <FeatureBadge type="beta" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Bridge Card */}
        <View style={styles.bridgeCard}>
          {/* From Chain */}
          <View style={styles.chainSection}>
            <Text style={styles.sectionLabel}>From</Text>
            <ChainSelector
              selectedChain={sourceChain}
              chains={supportedChains}
              onSelectChain={setSourceChain}
            />
            
            {/* Amount Input */}
            <View style={styles.amountContainer}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={THEME.colors.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
              {bridgeableAssets.length > 0 && (
                <TouchableOpacity
                  style={styles.assetSelector}
                  onPress={() => {
                    // Show asset selector
                    if (bridgeableAssets.length > 1) {
                      const buttons: any[] = bridgeableAssets.map(asset => ({
                        text: `${asset.symbol} - ${asset.name}`,
                        onPress: () => setSelectedAsset(asset),
                      }));
                      buttons.push({ text: 'Cancel', style: 'cancel' });
                      
                      Alert.alert(
                        'Select Asset',
                        'Choose the asset you want to bridge',
                        buttons
                      );
                    }
                  }}
                >
                  <Text style={styles.assetText}>
                    {selectedAsset?.symbol || 'Select'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={THEME.colors.text} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Swap Button */}
          <TouchableOpacity style={styles.swapButton} onPress={swapChains}>
            <View style={styles.swapIconContainer}>
              <Ionicons name="swap-vertical" size={24} color={THEME.colors.white} />
            </View>
          </TouchableOpacity>

          {/* To Chain */}
          <View style={styles.chainSection}>
            <Text style={styles.sectionLabel}>To</Text>
            <ChainSelector
              selectedChain={destChain}
              chains={supportedChains}
              onSelectChain={setDestChain}
            />
            
            {/* Output Preview */}
            <View style={styles.outputContainer}>
              <Text style={styles.outputAmount}>
                {isLoadingQuote ? '...' : quote?.amountOut || '0'}
              </Text>
            </View>
          </View>

          {/* Destination Address */}
          <View style={styles.addressSection}>
            <Text style={styles.sectionLabel}>Destination Address</Text>
            <TextInput
              style={styles.addressInput}
              placeholder="Enter destination address"
              placeholderTextColor={THEME.colors.textMuted}
              value={destAddress}
              onChangeText={setDestAddress}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Quote Details */}
        {quote && (
          <View style={styles.quoteCard}>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Bridge Fee ({quote.fee.percentageFee})</Text>
              <Text style={styles.quoteValue}>{quote.fee.totalFee}</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Estimated Time</Text>
              <Text style={styles.quoteValue}>{quote.fee.estimatedTime}</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>You&apos;ll Receive</Text>
              <Text style={[styles.quoteValue, styles.quoteValueHighlight]}>
                {quote.amountOut}
              </Text>
            </View>
          </View>
        )}

        {/* Bridge Button */}
        <TouchableOpacity
          style={[
            styles.bridgeButton,
            (!amount || !destAddress || isBridging) && styles.bridgeButtonDisabled
          ]}
          onPress={handleBridge}
          disabled={!amount || !destAddress || isBridging}
        >
          {isBridging ? (
            <ActivityIndicator color={THEME.colors.white} />
          ) : (
            <>
              <Ionicons name="git-branch" size={20} color={THEME.colors.white} />
              <Text style={styles.bridgeButtonText}>Start Bridge</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Pending Bridges */}
        {pendingBridges.length > 0 && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingSectionTitle}>Pending Bridges</Text>
            {pendingBridges.map(bridge => (
              <View key={bridge.id} style={styles.pendingCard}>
                <View style={styles.pendingInfo}>
                  <Text style={styles.pendingAmount}>
                    {bridge.amount} {bridge.asset}
                  </Text>
                  <Text style={styles.pendingRoute}>
                    {bridge.sourceChain} → {bridge.destChain}
                  </Text>
                </View>
                <View style={styles.pendingStatus}>
                  <ActivityIndicator size="small" color={THEME.colors.primary} />
                  <Text style={styles.pendingStatusText}>
                    {bridge.status.charAt(0).toUpperCase() + bridge.status.slice(1)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Info Note */}
        <View style={styles.infoNote}>
          <Ionicons name="information-circle" size={20} color={THEME.colors.secondary} />
          <Text style={styles.infoText}>
            Cross-chain bridges use secure smart contracts to lock assets on the source 
            chain and mint equivalent privacy tokens on Chameleon Network.
          </Text>
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
  // Bridge Card
  bridgeCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    ...THEME.shadows.medium,
  },
  chainSection: {
    marginBottom: THEME.spacing.md,
  },
  sectionLabel: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: THEME.spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    padding: 0,
  },
  assetSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.lightGrey,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.full,
  },
  assetText: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginRight: THEME.spacing.xs,
  },
  swapButton: {
    alignItems: 'center',
    marginVertical: THEME.spacing.sm,
  },
  swapIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outputContainer: {
    marginTop: THEME.spacing.sm,
  },
  outputAmount: {
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.textSecondary,
  },
  addressSection: {
    marginTop: THEME.spacing.md,
    paddingTop: THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  addressInput: {
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: THEME.borderRadius.medium,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.text,
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
  quoteValueHighlight: {
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.bold,
  },
  // Bridge Button
  bridgeButton: {
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
  bridgeButtonDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
  bridgeButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  // Pending
  pendingSection: {
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.xl,
  },
  pendingSectionTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  pendingCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
    ...THEME.shadows.small,
  },
  pendingInfo: {},
  pendingAmount: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  pendingRoute: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  pendingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  pendingStatusText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.primary,
  },
  // Info Note
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  infoText: {
    flex: 1,
    marginLeft: THEME.spacing.sm,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    lineHeight: 20,
  },
});
