/**
 * Transaction History Screen
 * Displays full transaction history for the current wallet
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/context/WalletContext';
import { transactionHistoryService, StoredTransaction } from '@/services/transactionHistory';
import { truncateAddress } from '@/utils/address';
import { THEME, GRADIENTS } from '@/constants/theme';

const EXPLORER_BASE_URL = 'https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F64.23.233.36%3A9944#/explorer';

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();
  
  const [transactions, setTransactions] = useState<StoredTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load transactions
  const loadTransactions = useCallback(async (isRefresh = false) => {
    if (!wallet?.address) return;
    
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const history = await transactionHistoryService.getHistory(wallet.address);
      setTransactions(history);
    } catch (error) {
      console.error('[History] Failed to load:', error);
      Alert.alert('Error', 'Failed to load transaction history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [wallet?.address]);

  // Load on focus
  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [loadTransactions])
  );

  // Copy to clipboard
  const handleCopy = async (text: string, id: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy');
    }
  };

  // Open explorer
  const handleOpenExplorer = async (blockHash?: string) => {
    try {
      let url = EXPLORER_BASE_URL;
      if (blockHash) {
        url = `${EXPLORER_BASE_URL}/query/${blockHash}`;
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Error', 'Failed to open explorer');
    }
  };

  // Clear history
  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all transaction history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            if (wallet?.address) {
              await transactionHistoryService.clearHistory(wallet.address);
              setTransactions([]);
            }
          },
        },
      ]
    );
  };

  // Format relative time
  const getRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: days > 365 ? 'numeric' : undefined 
    });
  };

  // Get display info based on transaction type
  const getTransactionDisplay = (item: StoredTransaction) => {
    const isSent = item.from.toLowerCase() === wallet?.address?.toLowerCase();

    switch (item.type) {
      case 'withdraw_liquidity':
        return { label: 'Withdrew Liquidity', icon: 'water-outline' as const, color: '#F59E0B', bgColor: '#FEF3C7', prefix: '+' };
      case 'add_liquidity':
        return { label: 'Added Liquidity', icon: 'water' as const, color: '#6366F1', bgColor: '#EDE9FE', prefix: '-' };
      case 'remove_liquidity':
        return { label: 'Removed Liquidity', icon: 'water-outline' as const, color: '#F59E0B', bgColor: '#FEF3C7', prefix: '+' };
      case 'claim_rewards':
        return { label: 'Claimed Rewards', icon: 'gift' as const, color: '#10B981', bgColor: '#D1FAE5', prefix: '+' };
      case 'swap':
        return { label: 'Swapped', icon: 'swap-horizontal' as const, color: '#6366F1', bgColor: '#EDE9FE', prefix: '' };
      case 'shield':
        return { label: 'Shielded', icon: 'shield-checkmark' as const, color: '#6366F1', bgColor: '#EDE9FE', prefix: '' };
      case 'unshield':
        return { label: 'Unshielded', icon: 'shield-outline' as const, color: '#F59E0B', bgColor: '#FEF3C7', prefix: '' };
      case 'receive':
        return { label: 'Received', icon: 'arrow-down' as const, color: THEME.colors.success, bgColor: '#E8F5E9', prefix: '+' };
      case 'send':
        return { label: 'Sent', icon: 'arrow-up' as const, color: THEME.colors.error, bgColor: '#FFEBEE', prefix: '-' };
      default:
        // Fallback to from/to address comparison
        if (isSent) {
          return { label: 'Sent', icon: 'arrow-up' as const, color: THEME.colors.error, bgColor: '#FFEBEE', prefix: '-' };
        }
        return { label: 'Received', icon: 'arrow-down' as const, color: THEME.colors.success, bgColor: '#E8F5E9', prefix: '+' };
    }
  };

  // Render transaction item
  const renderTransaction = ({ item }: { item: StoredTransaction }) => {
    const isSent = item.from.toLowerCase() === wallet?.address?.toLowerCase();
    const otherAddress = isSent ? item.to : item.from;
    const display = getTransactionDisplay(item);

    const statusColor = item.status === 'finalized'
      ? THEME.colors.success
      : item.status === 'failed'
        ? THEME.colors.error
        : THEME.colors.warning;

    const statusText = item.status === 'finalized'
      ? 'Complete'
      : item.status === 'failed'
        ? 'Failed'
        : 'Pending';

    return (
      <View style={styles.transactionCard}>
        {/* Header */}
        <View style={styles.txHeader}>
          <View style={[styles.txIcon, { backgroundColor: display.bgColor }]}>
            <Ionicons
              name={display.icon}
              size={24}
              color={display.color}
            />
          </View>
          <View style={styles.txHeaderInfo}>
            <Text style={styles.txType}>{display.label}</Text>
            <Text style={styles.txTime}>{getRelativeTime(item.timestamp)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        {/* Amount */}
        <View style={styles.txAmount}>
          <Text style={[styles.amountText, { color: display.color }]}>
            {display.prefix}{item.formattedAmount || 'CHML'}
          </Text>
        </View>

        {/* Details */}
        <View style={styles.txDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{isSent ? 'To' : 'From'}</Text>
            <View style={styles.detailValueRow}>
              <Text style={styles.detailValue}>{truncateAddress(otherAddress, 8)}</Text>
              <TouchableOpacity onPress={() => handleCopy(otherAddress, `addr_${item.id}`)}>
                <Ionicons 
                  name={copiedId === `addr_${item.id}` ? 'checkmark' : 'copy-outline'} 
                  size={16} 
                  color={copiedId === `addr_${item.id}` ? THEME.colors.success : THEME.colors.primary} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {item.hash && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Tx Hash</Text>
              <View style={styles.detailValueRow}>
                <Text style={styles.detailValue}>{truncateAddress(item.hash, 8)}</Text>
                <TouchableOpacity onPress={() => handleCopy(item.hash, `hash_${item.id}`)}>
                  <Ionicons 
                    name={copiedId === `hash_${item.id}` ? 'checkmark' : 'copy-outline'} 
                    size={16} 
                    color={copiedId === `hash_${item.id}` ? THEME.colors.success : THEME.colors.primary} 
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {item.blockNumber && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Block</Text>
              <Text style={styles.detailValue}>#{item.blockNumber.toLocaleString()}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.txFooter}>
          {item.usedMEVProtection && (
            <View style={styles.mevBadge}>
              <Ionicons name="shield-checkmark" size={12} color={THEME.colors.primary} />
              <Text style={styles.mevText}>MEV Protected</Text>
            </View>
          )}
          
          {item.blockHash && (
            <TouchableOpacity 
              style={styles.explorerButton}
              onPress={() => handleOpenExplorer(item.blockHash)}
            >
              <Ionicons name="open-outline" size={14} color={THEME.colors.primary} />
              <Text style={styles.explorerText}>Explorer</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
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
        <Text style={styles.headerTitle}>Transaction History</Text>
        <TouchableOpacity onPress={handleClearHistory} style={styles.clearButton}>
          <Ionicons name="trash-outline" size={20} color={THEME.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color={THEME.colors.textMuted} />
          <Text style={styles.emptyTitle}>No Transactions</Text>
          <Text style={styles.emptySubtitle}>Your transaction history will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => loadTransactions(true)}
          ItemSeparatorComponent={() => <View style={{ height: THEME.spacing.md }} />}
        />
      )}
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
  clearButton: {
    padding: THEME.spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: THEME.spacing.md,
    color: THEME.colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  emptyTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginTop: THEME.spacing.md,
  },
  emptySubtitle: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.sm,
    textAlign: 'center',
  },
  listContent: {
    padding: THEME.spacing.md,
    paddingBottom: 100,
  },
  transactionCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  txHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txHeaderInfo: {
    flex: 1,
    marginLeft: THEME.spacing.md,
  },
  txType: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  txTime: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.full,
  },
  statusText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: THEME.fontWeight.semibold,
  },
  txAmount: {
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  amountText: {
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold,
  },
  txDetails: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  detailLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  detailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
  },
  detailValue: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.text,
    fontFamily: 'monospace',
  },
  txFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: THEME.spacing.md,
  },
  mevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primaryLight,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.full,
    gap: THEME.spacing.xs,
  },
  mevText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.medium,
  },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
  },
  explorerText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.medium,
  },
});
