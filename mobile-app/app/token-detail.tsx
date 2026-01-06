/**
 * Token Detail Screen
 * Shows detailed view of a single token with actions and history
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '@/context/WalletContext';
import { transactionHistoryService, StoredTransaction } from '@/services/transactionHistory';
import { THEME, GRADIENTS } from '@/constants/theme';

const TOKEN_INFO: Record<string, { name: string; color: string; icon: string }> = {
  pCHML: { name: 'Privacy CHML', color: '#6366F1', icon: 'shield-checkmark' },
  pBTC: { name: 'Privacy Bitcoin', color: '#F7931A', icon: 'logo-bitcoin' },
  pETH: { name: 'Privacy Ethereum', color: '#627EEA', icon: 'diamond' },
  pUSDT: { name: 'Privacy USDT', color: '#26A17B', icon: 'cash' },
  CHML: { name: 'Chameleon (Public)', color: '#22B958', icon: 'leaf' },
};

export default function TokenDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { symbol, balance } = useLocalSearchParams<{ symbol: string; balance: string }>();
  const { wallet } = useWallet();
  const [transactions, setTransactions] = useState<StoredTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const tokenInfo = TOKEN_INFO[symbol || 'pCHML'] || TOKEN_INFO.pCHML;

  useEffect(() => {
    loadTokenTransactions();
  }, [wallet?.address, symbol]);

  const loadTokenTransactions = async () => {
    if (!wallet?.address) return;
    setIsLoading(true);
    try {
      const allTx = await transactionHistoryService.getHistory(wallet.address);
      // Filter transactions for this token
      const tokenTx = allTx.filter((tx: StoredTransaction) => {
        const txStr = JSON.stringify(tx).toLowerCase();
        const symbolLower = (symbol || '').toLowerCase();
        return txStr.includes(symbolLower);
      });
      setTransactions(tokenTx.slice(0, 20)); // Last 20
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTransactionType = (tx: StoredTransaction): string => {
    if (tx.formattedAmount?.includes('→')) {
      if (tx.formattedAmount.includes('Shield') || tx.formattedAmount.includes('Bridge')) return 'shield';
      if (tx.formattedAmount.includes('Withdraw') || tx.formattedAmount.includes('Unshield')) return 'unshield';
      return 'swap';
    }
    return tx.to === wallet?.address ? 'receive' : 'send';
  };

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
        <Text style={styles.headerTitle}>{symbol}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Token Card */}
        <View style={[styles.tokenCard, { borderLeftColor: tokenInfo.color }]}>
          <View style={[styles.tokenIcon, { backgroundColor: tokenInfo.color + '20' }]}>
            {symbol === 'CHML' || symbol === 'pCHML' ? (
              <Image 
                source={require('@/assets/images/Logo.png')} 
                style={{ width: 32, height: 32 }} 
                resizeMode="contain"
              />
            ) : (
              <Ionicons name={tokenInfo.icon as any} size={32} color={tokenInfo.color} />
            )}
          </View>
          <Text style={styles.tokenName}>{tokenInfo.name}</Text>
          <Text style={styles.tokenBalance}>{balance || '0'}</Text>
          <Text style={styles.tokenSymbol}>{symbol}</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push(`/send?token=${symbol}` as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="arrow-up" size={24} color="#1976D2" />
            </View>
            <Text style={styles.actionText}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push(`/receive?token=${symbol}` as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="arrow-down" size={24} color="#388E3C" />
            </View>
            <Text style={styles.actionText}>Receive</Text>
          </TouchableOpacity>

          {symbol === 'CHML' ? (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push('/shield' as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#F3E5F5' }]}>
                <Ionicons name="shield" size={24} color="#7B1FA2" />
              </View>
              <Text style={styles.actionText}>Shield</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push('/unshield' as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="lock-open" size={24} color="#F57C00" />
              </View>
              <Text style={styles.actionText}>Unshield</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push('/(tabs)/trade' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E0F7FA' }]}>
              <Ionicons name="swap-horizontal" size={24} color="#00838F" />
            </View>
            <Text style={styles.actionText}>Trade</Text>
          </TouchableOpacity>
        </View>

        {/* Transaction History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={THEME.colors.primary} />
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={THEME.colors.textMuted} />
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptySubtext}>Transactions with {symbol} will appear here</Text>
            </View>
          ) : (
            transactions.map((tx, index) => {
              const txType = getTransactionType(tx);
              return (
                <View key={tx.hash || index} style={styles.txItem}>
                  <View style={[styles.txIcon, { 
                    backgroundColor: txType === 'send' ? '#FFEBEE' : 
                                     txType === 'receive' ? '#E8F5E9' :
                                     txType === 'swap' ? '#E3F2FD' : '#FFF3E0'
                  }]}>
                    <Ionicons 
                      name={txType === 'send' ? 'arrow-up' : 
                            txType === 'receive' ? 'arrow-down' :
                            txType === 'swap' ? 'swap-horizontal' : 'shield'}
                      size={18} 
                      color={txType === 'send' ? '#D32F2F' : 
                             txType === 'receive' ? '#388E3C' :
                             txType === 'swap' ? '#1976D2' : '#F57C00'}
                    />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txType}>
                      {tx.formattedAmount || `${txType.charAt(0).toUpperCase() + txType.slice(1)}`}
                    </Text>
                    <Text style={styles.txDate}>{formatDate(tx.timestamp)}</Text>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={[styles.txStatus, { 
                      color: tx.status === 'finalized' ? '#388E3C' : 
                             tx.status === 'pending' ? '#F57C00' : '#D32F2F' 
                    }]}>
                      {tx.status === 'finalized' ? '✓' : tx.status === 'pending' ? '⏳' : '✗'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
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
  tokenCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
    borderLeftWidth: 4,
    ...THEME.shadows.medium,
  },
  tokenIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  tokenName: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  tokenBalance: {
    fontSize: 28,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
  },
  tokenSymbol: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.xs,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
    gap: THEME.spacing.md,
  },
  actionButton: { alignItems: 'center', flex: 1 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  actionText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.text,
    fontWeight: THEME.fontWeight.medium as any,
  },
  historySection: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.small,
  },
  sectionTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  loadingContainer: {
    paddingVertical: THEME.spacing.xl,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.xl,
  },
  emptyText: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textMuted,
    marginTop: THEME.spacing.sm,
  },
  emptySubtext: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
    marginTop: THEME.spacing.xs,
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txInfo: {
    flex: 1,
    marginLeft: THEME.spacing.sm,
  },
  txType: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium as any,
    color: THEME.colors.text,
  },
  txDate: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txStatus: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.semibold as any,
  },
});