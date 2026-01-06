/**
 * Bridge Landing Page
 * Shows available bridges and links to Shield/Unshield
 */
import React from 'react';
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

const AVAILABLE_BRIDGES = [
  { id: 'BTC', name: 'Bitcoin', symbol: 'BTC', icon: 'logo-bitcoin', color: '#F7931A', status: 'active' },
  { id: 'ETH', name: 'Ethereum', symbol: 'ETH', icon: 'logo-electron', color: '#627EEA', status: 'active' },
  { id: 'USDT', name: 'USDT (ERC-20)', symbol: 'USDT', icon: 'logo-usd', color: '#26A17B', status: 'active' },
];

const COMING_SOON_BRIDGES = [
  { id: 'BNB', name: 'Binance Smart Chain', symbol: 'BNB', icon: 'diamond-outline', color: '#F3BA2F', status: 'coming_soon' },
  { id: 'SOL', name: 'Solana', symbol: 'SOL', icon: 'planet-outline', color: '#9945FF', status: 'coming_soon' },
];

export default function BridgeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cross-Chain Bridges</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Devnet Warning */}
        <View style={styles.devnetWarning}>
          <Ionicons name="warning" size={18} color="#F59E0B" />
          <Text style={styles.devnetWarningText}>
            Devnet Mode - Test tokens only
          </Text>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="git-branch-outline" size={28} color={THEME.colors.primary} />
          <Text style={styles.infoTitle}>Bridge Assets to Chameleon</Text>
          <Text style={styles.infoDescription}>
            Transfer assets from external blockchains to Chameleon Network. 
            All bridged assets are automatically converted to privacy tokens (pBTC, pETH, pUSDT).
          </Text>
        </View>

        {/* Available Bridges */}
        <Text style={styles.sectionTitle}>Available Bridges</Text>
        {AVAILABLE_BRIDGES.map((bridge) => (
          <TouchableOpacity 
            key={bridge.id} 
            style={styles.bridgeCard}
            onPress={() => router.push(`/shield?token=${bridge.id}` as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.bridgeIcon, { backgroundColor: bridge.color + '20' }]}>
              <Ionicons name={bridge.icon as any} size={24} color={bridge.color} />
            </View>
            <View style={styles.bridgeInfo}>
              <Text style={styles.bridgeName}>{bridge.name}</Text>
              <Text style={styles.bridgeSymbol}>{bridge.symbol} → p{bridge.symbol}</Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Active</Text>
            </View>
          </View>
        ))}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/shield')}
          >
            <LinearGradient
              colors={['#6366F1', '#8B5CF6']}
              style={styles.actionButtonGradient}
            >
              <Ionicons name="arrow-down-circle" size={24} color={THEME.colors.white} />
              <Text style={styles.actionButtonText}>Deposit (Shield)</Text>
              <Text style={styles.actionButtonSubtext}>Bridge assets into Chameleon</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/unshield')}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.actionButtonGradient}
            >
              <Ionicons name="arrow-up-circle" size={24} color={THEME.colors.white} />
              <Text style={styles.actionButtonText}>Withdraw (Unshield)</Text>
              <Text style={styles.actionButtonSubtext}>Bridge assets out of Chameleon</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Coming Soon */}
        <Text style={styles.sectionTitle}>Coming Soon</Text>
        {COMING_SOON_BRIDGES.map((bridge) => (
          <View key={bridge.id} style={[styles.bridgeCard, styles.bridgeCardDisabled]}>
            <View style={[styles.bridgeIcon, { backgroundColor: bridge.color + '10' }]}>
              <Ionicons name={bridge.icon as any} size={24} color={bridge.color + '60'} />
            </View>
            <View style={styles.bridgeInfo}>
              <Text style={[styles.bridgeName, styles.textDisabled]}>{bridge.name}</Text>
              <Text style={[styles.bridgeSymbol, styles.textDisabled]}>{bridge.symbol} → p{bridge.symbol}</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Coming Soon</Text>
            </View>
          </View>
        ))}

        {/* How it Works */}
        <View style={styles.howItWorks}>
          <Text style={styles.howItWorksTitle}>How Bridging Works</Text>
          <View style={styles.step}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <Text style={styles.stepText}>Select token and enter amount to bridge</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <Text style={styles.stepText}>Send tokens to the bridge deposit address</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <Text style={styles.stepText}>Receive privacy tokens (pBTC, pETH, etc.) automatically</Text>
          </View>
        </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
  },
  backButton: {
    padding: THEME.spacing.xs,
  },
  headerTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: THEME.spacing.md,
    paddingBottom: THEME.spacing.xl * 2,
  },
  devnetWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.medium,
    marginBottom: THEME.spacing.md,
  },
  devnetWarningText: {
    marginLeft: THEME.spacing.xs,
    color: '#92400E',
    fontSize: THEME.fontSize.sm,
  },
  infoCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
    ...THEME.shadows.medium,
  },
  infoTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginTop: THEME.spacing.sm,
    textAlign: 'center',
  },
  infoDescription: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: THEME.spacing.xs,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
    marginTop: THEME.spacing.md,
  },
  bridgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    ...THEME.shadows.small,
  },
  bridgeCardDisabled: {
    opacity: 0.7,
  },
  bridgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bridgeInfo: {
    flex: 1,
    marginLeft: THEME.spacing.md,
  },
  bridgeName: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  bridgeSymbol: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  textDisabled: {
    color: THEME.colors.textMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: THEME.spacing.xs,
  },
  statusText: {
    fontSize: THEME.fontSize.xs,
    color: '#059669',
    fontWeight: THEME.fontWeight.medium,
  },
  comingSoonBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
  },
  comingSoonText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
    fontWeight: THEME.fontWeight.medium,
  },
  actionButtons: {
    marginTop: THEME.spacing.lg,
    gap: THEME.spacing.sm,
  },
  actionButton: {
    borderRadius: THEME.borderRadius.medium,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    padding: THEME.spacing.lg,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.white,
    marginTop: THEME.spacing.xs,
  },
  actionButtonSubtext: {
    fontSize: THEME.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: THEME.spacing.xs,
  },
  howItWorks: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    marginTop: THEME.spacing.lg,
    ...THEME.shadows.medium,
  },
  howItWorksTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.sm,
  },
  stepNumberText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.white,
  },
  stepText: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
});
