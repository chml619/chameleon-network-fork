/**
 * Wallet Tab - Token list and wallet management
 * Matches mockup design: chmlwallet-mockup-011.jpg
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '@/context/WalletContext';
import { useBalance } from '@/hooks/useBalance';
import { useApi } from '@/hooks/useApi';
import { NetworkBadge } from '@/components/NetworkBadge';
import { formatBalance } from '@/utils/balance';
import { THEME, GRADIENTS } from '@/constants/theme';
import { pdexService } from '@/services/pdex';

// Token list - all tokens are now active and navigable
const TOKENS = [
  { id: 'chml', symbol: 'CHML', name: 'Chameleon (Public)', icon: require('@/assets/images/Logo.png'), isNative: true, isPublic: true, color: '#22B958' },
  { id: 'pchml', symbol: 'pCHML', name: 'Privacy CHML', icon: require('@/assets/images/Logo.png'), isNative: false, isPCHML: true, color: '#6366F1' },
  { id: 'peth', symbol: 'pETH', name: 'Privacy ETH', icon: null, color: '#627EEA', tokenId: 1 },
  { id: 'pbtc', symbol: 'pBTC', name: 'Privacy BTC', icon: null, color: '#F7931A', tokenId: 2 },
  { id: 'pusdt', symbol: 'pUSDT', name: 'Privacy USDT', icon: null, color: '#26A17B', tokenId: 3 },
];

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet, isLoading: walletLoading, importDevAccount, logout, publicBalance, pchmlBalance } = useWallet();
  const { connectionState, connect } = useApi();
  const { formattedFreeBalance, isLoading: balanceLoading, refresh: refreshBalance } = useBalance(wallet?.address);
  const [pTokenBalances, setPTokenBalances] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  // Auto-connect to network on mount
  useEffect(() => {
    if (connectionState.status === 'disconnected') {
      connect();
    }
  }, [connectionState.status, connect]);

  // Load pToken balances
  useEffect(() => {
    const loadPTokenBalances = async () => {
      if (!wallet?.address || connectionState.status !== 'connected') return;
      try {
        const balances: Record<string, string> = {};
        // Load pETH, pBTC, pUSDT balances (tokenIds 1, 2, 3)
        for (const tokenId of [1, 2, 3]) {
          const balance = await pdexService.getTokenBalance(tokenId, wallet.address);
          const symbol = tokenId === 1 ? 'pETH' : tokenId === 2 ? 'pBTC' : 'pUSDT';
          balances[symbol] = balance.isZero() ? '0' : (balance.toNumber() / Math.pow(10, 12)).toFixed(4);
        }
        setPTokenBalances(balances);
      } catch (error) {
        console.error('Error loading pToken balances:', error);
      }
    };
    loadPTokenBalances();
  }, [wallet?.address, connectionState.status]);

  const handleDevAccountImport = async (accountName: string) => {
    try {
      await importDevAccount(accountName as any);
      Alert.alert('Success', `${accountName} account imported successfully!`);
    } catch (error) {
      Alert.alert('Error', 'Failed to import dev account');
    }
  };

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    
    try {
      // Refresh balance
      if (refreshBalance) {
        await refreshBalance();
      }
      
      // Refresh pToken balances
      await loadPTokenBalances();
    } catch (error) {
      console.error('Error refreshing wallet data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchBalance]);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? Make sure you have backed up your seed phrase.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };

  // No wallet state - show create/import options
  if (!wallet && !walletLoading) {
    return (
      <LinearGradient
        colors={GRADIENTS.background.colors}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Wallet</Text>
            <NetworkBadge size="small" />
          </View>

          {/* Logo and Welcome */}
          <View style={styles.welcomeContainer}>
            <Image
              source={require('@/assets/images/Logo.png')}
              style={styles.welcomeLogo}
              resizeMode="contain"
            />
            <Text style={styles.welcomeTitle}>Chameleon Wallet</Text>
            <Text style={styles.welcomeSubtitle}>
              Create a new wallet or{"\n"}import an existing one
            </Text>
          </View>

          {/* Main Actions */}
          <View style={styles.mainActions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/create-wallet')}
            >
              <Text style={styles.primaryButtonText}>Create New Wallet</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/import-wallet')}
            >
              <Text style={styles.secondaryButtonText}>Import Wallet</Text>
            </TouchableOpacity>
          </View>

          {/* Dev Accounts */}
          <View style={styles.devSection}>
            <Text style={styles.devSectionTitle}>── Or use dev account ──</Text>
            <View style={styles.devAccountsGrid}>
              {['Alice', 'Bob', 'Charlie', 'Dave', 'Eve'].map((account) => (
                <TouchableOpacity
                  key={account}
                  style={styles.devAccountButton}
                  onPress={() => handleDevAccountImport(account.toLowerCase())}
                >
                  <Text style={styles.devAccountText}>{account}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Bottom Spacing */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </LinearGradient>
    );
  }

  // Loading state
  if (walletLoading) {
    return (
      <LinearGradient
        colors={GRADIENTS.background.colors}
        style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}
      >
        <ActivityIndicator size="large" color={THEME.colors.primary} />
        <Text style={styles.loadingText}>Loading wallet...</Text>
      </LinearGradient>
    );
  }

  // Extract balance for display
  const balanceNumber = formattedFreeBalance ? formattedFreeBalance.split(' ')[0] : '0';
  const pchmlBalanceNumber = formatBalance(pchmlBalance);

  // Helper function to get token balance
  const getTokenBalance = (token: typeof TOKENS[0]): string => {
    if (token.isNative) {
      return balanceLoading ? '...' : balanceNumber;
    }
    if ((token as any).isPCHML) {
      return pchmlBalanceNumber;
    }
    // pTokens from pdex
    const pBalance = pTokenBalances[token.symbol];
    return pBalance || '0';
  };

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
            colors={[THEME.colors.primary]}
          />
        }
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
            <TouchableOpacity onPress={() => router.push('/manage-wallets' as any)}>
              <Text style={styles.walletName}>{wallet?.name || 'My Wallet'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color={THEME.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Token List */}
        <View style={styles.tokenList}>
          {TOKENS.map((token) => (
            <TouchableOpacity
              key={token.id}
              style={styles.tokenCard}
              onPress={() => {
                const bal = getTokenBalance(token);
                router.push({
                  pathname: '/token-detail',
                  params: { symbol: token.symbol, balance: bal }
                } as any);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.tokenLeft}>
                {token.icon ? (
                  <Image source={token.icon} style={styles.tokenIcon} resizeMode="contain" />
                ) : (
                  <View style={[styles.tokenIconPlaceholder, { backgroundColor: token.color }]}>
                    <Text style={styles.tokenIconText}>{token.symbol[0]}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                  <Text style={styles.tokenName}>{token.name}</Text>
                </View>
              </View>
              <View style={styles.tokenRight}>
                <Text
                  style={[
                    styles.tokenBalance,
                    (token as any).isPCHML && { color: '#6366F1' },
                  ]}
                >
                  {getTokenBalance(token)} {token.symbol}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={THEME.colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))}

          {/* Add Token Button */}
          <TouchableOpacity
            style={styles.addTokenButton}
            onPress={() => Alert.alert('Feature Unavailable', 'Custom token support will be added in a future update. Currently supported: pCHML, pBTC, pETH, pUSDT.')}
          >
            <Ionicons name="add" size={20} color={THEME.colors.secondary} />
            <Text style={styles.addTokenText}>Add a coin to your list</Text>
          </TouchableOpacity>
        </View>

        {/* Issue Privacy Coin Button */}
        <View style={styles.issueSection}>
          <TouchableOpacity
            style={styles.issueButton}
            onPress={() => Alert.alert('Feature Unavailable', 'Token issuance will be available in a future update. Contact support for enterprise token needs.')}
          >
            <Text style={styles.issueButtonText}>Issue your own privacy coin</Text>
          </TouchableOpacity>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: THEME.spacing.md,
    color: THEME.colors.text,
    fontSize: THEME.fontSize.lg,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  headerTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
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
  walletName: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  // Welcome State
  welcomeContainer: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.xl * 2,
    paddingHorizontal: THEME.spacing.lg,
  },
  welcomeLogo: {
    width: 80,
    height: 80,
    marginBottom: THEME.spacing.lg,
  },
  welcomeTitle: {
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  welcomeSubtitle: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  // Main Actions
  mainActions: {
    paddingHorizontal: THEME.spacing.md,
    gap: THEME.spacing.md,
  },
  primaryButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: THEME.colors.primary,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  // Dev Section
  devSection: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.xl,
    paddingHorizontal: THEME.spacing.md,
  },
  devSectionTitle: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.md,
  },
  devAccountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: THEME.spacing.sm,
  },
  devAccountButton: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.small,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  devAccountText: {
    color: THEME.colors.secondary,
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
  },
  // Token List
  tokenList: {
    paddingHorizontal: THEME.spacing.md,
  },
  tokenCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    ...THEME.shadows.small,
  },
  tokenCardDisabled: {
    opacity: 0.6,
  },
  tokenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenIcon: {
    width: 40,
    height: 40,
    marginRight: THEME.spacing.md,
  },
  tokenIconPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: THEME.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenIconText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
  },
  tokenSymbol: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  tokenName: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  tokenBalance: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.primary,
  },
  tokenRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
  },
  tokenBalanceDisabled: {
    color: THEME.colors.textMuted,
  },
  addTokenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginTop: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderStyle: 'dashed',
  },
  addTokenText: {
    marginLeft: THEME.spacing.sm,
    color: THEME.colors.secondary,
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
  },
  // Issue Section
  issueSection: {
    paddingHorizontal: THEME.spacing.md,
    paddingTop: THEME.spacing.xl,
  },
  issueButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    alignItems: 'center',
  },
  issueButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
  },
});
