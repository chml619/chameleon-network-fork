/**
 * Home Screen - Main dashboard with balance and action grid
 * Week 7: Added MEV Protection toggle, Staking, Bridge links
 * Updated: Transaction history display in Recent Activity
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
  Modal,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/context/WalletContext';
import { useBalance } from '@/hooks/useBalance';
import { useApi } from '@/hooks/useApi';
import { NetworkBadge } from '@/components/NetworkBadge';
import { MEVProtectionToggle } from '@/components/MEVProtectionToggle';
import { PrivacyIndicator } from '@/components/PrivacyIndicator';
import { transactionHistoryService, StoredTransaction } from '@/services/transactionHistory';
import { notificationService } from '@/services/notifications';
import { apiService } from '@/services/api';
import { truncateAddress } from '@/utils/address';
import { THEME, GRADIENTS } from '@/constants/theme';

// Explorer URL
const EXPLORER_BASE_URL = 'https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F64.23.233.36%3A9944#/explorer';

// Action items for the grid - Updated with Week 9 privacy features
const ACTIONS = [
  { id: 'send', label: 'Send', icon: 'arrow-up-outline', route: '/send', color: '#FF6B6B' },
  { id: 'receive', label: 'Receive', icon: 'arrow-down-outline', route: '/receive', color: '#4ECDC4' },
  { id: 'trade', label: 'Trade', icon: 'swap-horizontal-outline', tab: 'trade', color: '#9B59B6' },
  { id: 'bridge', label: 'Bridge', icon: 'git-branch-outline', route: '/bridge', color: '#3498DB' },
  { id: 'stake', label: 'Stake', icon: 'layers-outline', route: '/staking', color: '#F39C12' },
  { id: 'shield', label: 'Shield', icon: 'shield-checkmark-outline', route: '/shield', color: '#10B981' },
  { id: 'unshield', label: 'Unshield', icon: 'eye-outline', route: '/unshield', color: '#F59E0B' },
  { id: 'power', label: 'Power', icon: 'flash-outline', disabled: true },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet, isLoading: walletLoading, importDevAccount, privateBalance } = useWallet();
  const { connectionState, connect } = useApi();
  const { formattedFreeBalance, isLoading: balanceLoading, refresh: refetchBalance } = useBalance(wallet?.address);
  
  // Refresh state
  const [refreshing, setRefreshing] = useState(false);
  
  // Transaction history state
  const [recentTransactions, setRecentTransactions] = useState<StoredTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Transaction detail modal state
  const [selectedTransaction, setSelectedTransaction] = useState<StoredTransaction | null>(null);
  const [showTxDetail, setShowTxDetail] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  // Notification state
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Load unread notification count
  const loadUnreadCount = useCallback(async () => {
    try {
      const count = await notificationService.getUnreadCount();
      setUnreadNotifications(count);
    } catch (error) {
      console.error('[Home] Error loading unread count:', error);
    }
  }, []);

  // Check for incoming transactions
  const checkIncomingTransactions = useCallback(async () => {
    if (!wallet?.address) return;
    
    const api = apiService.getApi();
    if (!api) return;
    
    try {
      console.log('[Home] Checking for incoming transactions...');
      
      // Get recent blocks to check for incoming transfers
      const latestHeader = await api.rpc.chain.getHeader();
      const latestBlockNumber = latestHeader.number.toNumber();
      
      // Check last 10 blocks for incoming transfers
      const blocksToCheck = Math.min(10, latestBlockNumber);
      
      for (let i = 0; i < blocksToCheck; i++) {
        const blockNumber = latestBlockNumber - i;
        const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
        const signedBlock = await api.rpc.chain.getBlock(blockHash);
        const allRecords = await api.query.system.events.at(blockHash);
        
        // Check each extrinsic in the block
        signedBlock.block.extrinsics.forEach((extrinsic, index) => {
          // Check if it's a balance transfer
          if (extrinsic.method.section === 'balances' && 
              (extrinsic.method.method === 'transfer' || 
               extrinsic.method.method === 'transferKeepAlive' ||
               extrinsic.method.method === 'transferAllowDeath')) {
            
            const args = extrinsic.method.args;
            const dest = args[0].toString();
            const amount = args[1].toString();
            
            // Check if this is an incoming transfer to our wallet
            if (dest.toLowerCase() === wallet.address.toLowerCase()) {
              const sender = extrinsic.signer.toString();
              const txHash = extrinsic.hash.toHex();
              
              // Check if we already have this transaction
              transactionHistoryService.getTransaction(wallet.address, txHash).then(existing => {
                if (!existing) {
                  // Check if the transaction was successful
                  const events = allRecords.filter(({ phase }) => 
                    phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index)
                  );
                  
                  const isSuccess = events.some(({ event }) => 
                    api.events.system.ExtrinsicSuccess.is(event)
                  );
                  
                  if (isSuccess) {
                    // Format amount (assuming 18 decimals)
                    const amountNum = BigInt(amount);
                    const decimals = BigInt(10 ** 18);
                    const whole = amountNum / decimals;
                    const formattedAmount = `${whole.toString()} CHML`;
                    
                    console.log('[Home] Found incoming transfer:', txHash, 'from:', sender, 'amount:', formattedAmount);
                    
                    // Save to history as received transaction
                    transactionHistoryService.saveTransaction(wallet.address, {
                      hash: txHash,
                      from: sender,
                      to: wallet.address,
                      amount: amount,
                      formattedAmount,
                      status: 'finalized',
                      blockNumber,
                      blockHash: blockHash.toHex(),
                      usedMEVProtection: false,
                    }).then(() => {
                      // Reload history after saving
                      loadTransactionHistory();
                      
                      // Send notification for received funds
                      notificationService.notifyFundsReceived(
                        formattedAmount,
                        sender,
                        txHash,
                        blockNumber
                      ).then(() => {
                        loadUnreadCount();
                      });
                    });
                  }
                }
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('[Home] Error checking incoming transactions:', error);
    }
  }, [wallet?.address, loadTransactionHistory]);

  // Load transaction history when wallet changes or screen comes into focus
  const loadTransactionHistory = useCallback(async () => {
    if (!wallet?.address) {
      setRecentTransactions([]);
      return;
    }
    
    setLoadingHistory(true);
    try {
      const history = await transactionHistoryService.getRecentTransactions(wallet.address, 5);
      setRecentTransactions(history);
      console.log('[Home] Loaded', history.length, 'recent transactions');
    } catch (error) {
      console.error('[Home] Failed to load transaction history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [wallet?.address]);

  // Reload history when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadTransactionHistory();
      // Also check for incoming transactions
      checkIncomingTransactions();
      // Load unread notification count
      loadUnreadCount();
    }, [loadTransactionHistory, checkIncomingTransactions, loadUnreadCount])
  );

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    console.log('[Home] Pull-to-refresh triggered');
    
    try {
      // Refresh balance
      if (refetchBalance) {
        await refetchBalance();
      }
      
      // Check for incoming transactions
      await checkIncomingTransactions();
      
      // Refresh transaction history
      await loadTransactionHistory();
      
      // Attempt reconnect if disconnected
      if (connectionState.status === 'disconnected') {
        connect();
      }
    } catch (error) {
      console.error('[Home] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchBalance, loadTransactionHistory, checkIncomingTransactions, connectionState.status, connect]);

  // Handle transaction tap - show detail modal
  const handleTransactionTap = (transaction: StoredTransaction) => {
    setSelectedTransaction(transaction);
    setShowTxDetail(true);
  };

  // Copy to clipboard
  const handleCopy = async (text: string, field: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
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

  // Debug: Log connection state changes
  useEffect(() => {
    console.log('[Home] ====== CONNECTION STATE CHANGE ======');
    console.log('[Home] Status:', connectionState.status);
    console.log('[Home] Block number:', connectionState.blockNumber);
    console.log('[Home] Error:', connectionState.error);
  }, [connectionState]);

  // Debug: Log wallet and balance info
  useEffect(() => {
    console.log('[Home] ====== WALLET/BALANCE INFO ======');
    console.log('[Home] Wallet address:', wallet?.address);
    console.log('[Home] Balance loading:', balanceLoading);
    console.log('[Home] Formatted balance:', formattedFreeBalance);
  }, [wallet?.address, balanceLoading, formattedFreeBalance]);

  // Auto-connect to network on mount
  useEffect(() => {
    console.log('[Home] Auto-connect check - status:', connectionState.status);
    if (connectionState.status === 'disconnected') {
      console.log('[Home] Triggering connect()...');
      connect();
    }
  }, [connectionState.status, connect]);

  // Handle dev account import
  const handleDevAccountImport = async (accountName: string) => {
    try {
      console.log('[Home] Importing dev account:', accountName);
      await importDevAccount(accountName.toLowerCase() as any);
      Alert.alert('Success', `${accountName} account imported!`);
    } catch (error) {
      console.error('[Home] Dev account import failed:', error);
      Alert.alert('Error', 'Failed to import dev account');
    }
  };

  // If no wallet, redirect to wallet tab to create/import
  if (!wallet && !walletLoading) {
    return (
      <LinearGradient
        colors={GRADIENTS.background.colors}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.noWalletScrollContent}
        >
          <View style={styles.noWalletContainer}>
            <Image
              source={require('@/assets/images/Logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.noWalletTitle}>Welcome to Chameleon</Text>
            <Text style={styles.noWalletSubtitle}>
              Privacy-first blockchain wallet with MEV protection
            </Text>
            
            {/* Quick Setup Options */}
            <View style={styles.setupOptionsContainer}>
              <TouchableOpacity
                style={styles.getStartedButton}
                onPress={() => router.push('/create-wallet')}
              >
                <Ionicons name="add-circle-outline" size={20} color={THEME.colors.white} />
                <Text style={styles.getStartedButtonText}>Create New Wallet</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.importButton}
                onPress={() => router.push('/import-wallet')}
              >
                <Ionicons name="download-outline" size={20} color={THEME.colors.primary} />
                <Text style={styles.importButtonText}>Import Existing Wallet</Text>
              </TouchableOpacity>
            </View>

            {/* Dev Account Quick Access */}
            <View style={styles.devAccountSection}>
              <Text style={styles.devAccountTitle}>Quick Demo Access</Text>
              <Text style={styles.devAccountSubtitle}>Use a pre-funded test account</Text>
              <View style={styles.devAccountButtons}>
                {['Alice', 'Bob', 'Charlie'].map((name) => (
                  <TouchableOpacity
                    key={name}
                    style={styles.devAccountButton}
                    onPress={() => handleDevAccountImport(name)}
                  >
                    <Text style={styles.devAccountButtonText}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Feature Preview */}
            <View style={styles.featurePreview}>
              <Text style={styles.featurePreviewTitle}>Features Available</Text>
              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <Ionicons name="shield-checkmark" size={18} color={THEME.colors.primary} />
                  <Text style={styles.featureText}>MEV Protection</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="swap-horizontal" size={18} color={THEME.colors.primary} />
                  <Text style={styles.featureText}>Privacy DEX (pDEX)</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="git-branch" size={18} color={THEME.colors.primary} />
                  <Text style={styles.featureText}>Cross-Chain Bridge</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="layers" size={18} color={THEME.colors.primary} />
                  <Text style={styles.featureText}>Staking Rewards</Text>
                </View>
              </View>
            </View>
          </View>
          
          {/* Bottom Spacing for tabs */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </LinearGradient>
    );
  }

  const handleActionPress = (action: typeof ACTIONS[0]) => {
    if (action.disabled) {
      Alert.alert('Coming Soon', `${action.label} feature will be available in a future update.`);
      return;
    }
    if (action.route) {
      router.push(action.route as any);
    }
    if (action.tab) {
      // Navigate to tab
      router.push(`/(tabs)/${action.tab}` as any);
    }
  };

  // Extract balance number for display
  const balanceNumber = formattedFreeBalance ? formattedFreeBalance.split(' ')[0] : '0';

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
            <TouchableOpacity 
              style={styles.avatarContainer}
              onPress={() => router.push('/manage-wallets' as any)}
            >
              <Image
                source={require('@/assets/images/Logo.png')}
                style={styles.avatar}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/manage-wallets' as any)}>
              <Text style={styles.walletName}>{wallet?.name || 'My Wallet'}</Text>
              <Text style={styles.switchWalletHint}>Tap to switch wallet</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => router.push('/notifications' as any)}
          >
            <Ionicons name="notifications-outline" size={24} color={THEME.colors.text} />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Account Card */}
        <View style={styles.accountCard}>
          <View style={styles.accountHeader}>
            <Text style={styles.accountLabel}>My Account</Text>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyText}>CHML</Text>
            </View>
          </View>

          <View style={styles.balanceRow}>
            <View>
              {balanceLoading ? (
                <ActivityIndicator size="small" color={THEME.colors.primary} />
              ) : (
                <View style={styles.balanceContainer}>
                  <View style={styles.balanceSection}>
                    <Text style={styles.balanceLabel}>Public Balance</Text>
                    <Text style={styles.balanceAmount}>{balanceNumber}</Text>
                  </View>
                  <View style={styles.balanceSection}>
                    <Text style={styles.balanceLabel}>Private Balance</Text>
                    <Text style={styles.balanceAmount}>
                      {privateBalance ? 
                        (parseFloat(privateBalance.toString()) / Math.pow(10, 18)).toFixed(2) : 
                        '0.00'
                      }
                    </Text>
                  </View>
                  <PrivacyIndicator />
                </View>
              )}
              <View style={styles.growthBadge}>
                <Text style={styles.growthText}>Shield your public balance to enable private transfers</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.stakingButton}
              onPress={() => router.push('/staking')}
            >
              <Ionicons name="layers-outline" size={18} color={THEME.colors.white} />
              <Text style={styles.stakingButtonText}>Staking</Text>
            </TouchableOpacity>
          </View>

          {/* Network Badge */}
          <View style={styles.networkBadgeContainer}>
            <NetworkBadge size="small" showConnectionStatus={true} />
          </View>
        </View>

        {/* MEV Protection Toggle */}
        <View style={styles.mevContainer}>
          <MEVProtectionToggle />
        </View>

        {/* Action Grid */}
        <View style={styles.actionGrid}>
          {ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={styles.actionButton}
              onPress={() => handleActionPress(action)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.actionIconContainer,
                  action.disabled && styles.actionIconDisabled,
                  action.color && { backgroundColor: `${action.color}20` },
                ]}
              >
                <Ionicons
                  name={action.icon as any}
                  size={24}
                  color={action.disabled ? THEME.colors.textMuted : (action.color || THEME.colors.primary)}
                />
              </View>
              <Text
                style={[
                  styles.actionLabel,
                  action.disabled && styles.actionLabelDisabled,
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Activity */}
        <View style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/history' as any)}>
              <Text style={styles.viewAllText}>View all</Text>
            </TouchableOpacity>
          </View>

          {loadingHistory ? (
            <View style={styles.emptyActivityCard}>
              <ActivityIndicator size="small" color={THEME.colors.primary} />
              <Text style={styles.emptyActivityText}>Loading transactions...</Text>
            </View>
          ) : recentTransactions.length > 0 ? (
            <View style={styles.activityList}>
              {recentTransactions.map((tx) => (
                <TransactionItem 
                  key={tx.id} 
                  transaction={tx} 
                  walletAddress={wallet?.address || ''} 
                  onPress={() => handleTransactionTap(tx)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyActivityCard}>
              <Ionicons name="time-outline" size={48} color={THEME.colors.textMuted} />
              <Text style={styles.emptyActivityText}>
                No transactions yet
              </Text>
              <Text style={styles.emptyActivitySubtext}>
                Your transaction history will appear here
              </Text>
            </View>
          )}
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Transaction Detail Modal */}
      <Modal
        visible={showTxDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTxDetail(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedTransaction && (
              <TransactionDetailModal
                transaction={selectedTransaction}
                walletAddress={wallet?.address || ''}
                onClose={() => setShowTxDetail(false)}
                onCopy={handleCopy}
                onOpenExplorer={handleOpenExplorer}
                copiedField={copiedField}
              />
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

// Helper function to format relative time
function getRelativeTime(timestamp: number): string {
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
  
  // Format as date for older transactions
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Transaction Item Component
interface TransactionItemProps {
  transaction: StoredTransaction;
  walletAddress: string;
  onPress?: () => void;
}

function TransactionItem({ transaction, walletAddress, onPress }: TransactionItemProps) {
  const isSent = transaction.from.toLowerCase() === walletAddress.toLowerCase();
  const otherAddress = isSent ? transaction.to : transaction.from;
  const truncatedOther = truncateAddress(otherAddress, 4);
  
  const statusColor = transaction.status === 'finalized' 
    ? THEME.colors.success 
    : transaction.status === 'failed' 
      ? THEME.colors.error 
      : THEME.colors.warning;
  
  const statusText = transaction.status === 'finalized' 
    ? 'Complete' 
    : transaction.status === 'failed' 
      ? 'Failed' 
      : 'Pending';

  return (
    <TouchableOpacity 
      style={styles.transactionItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[
        styles.transactionIcon,
        { backgroundColor: isSent ? '#FFEBEE' : '#E8F5E9' }
      ]}>
        <Ionicons 
          name={isSent ? 'arrow-up' : 'arrow-down'} 
          size={20} 
          color={isSent ? THEME.colors.error : THEME.colors.success} 
        />
      </View>
      
      <View style={styles.transactionDetails}>
        <View style={styles.transactionRow}>
          <Text style={styles.transactionTitle}>
            {isSent ? 'Sent' : 'Received'} {transaction.formattedAmount || 'CHML'}
          </Text>
          <Text style={[styles.transactionStatus, { color: statusColor }]}>
            {statusText}
          </Text>
        </View>
        <View style={styles.transactionRow}>
          <Text style={styles.transactionSubtitle}>
            {isSent ? 'To' : 'From'} {truncatedOther}
          </Text>
          <Text style={styles.transactionTime}>
            {getRelativeTime(transaction.timestamp)}
          </Text>
        </View>
        {transaction.usedMEVProtection && (
          <View style={styles.mevBadgeSmall}>
            <Ionicons name="shield-checkmark" size={10} color={THEME.colors.primary} />
            <Text style={styles.mevBadgeText}>MEV Protected</Text>
          </View>
        )}
      </View>
      
      {/* Chevron indicator */}
      <Ionicons name="chevron-forward" size={16} color={THEME.colors.textMuted} />
    </TouchableOpacity>
  );
}

// Transaction Detail Modal Component
interface TransactionDetailModalProps {
  transaction: StoredTransaction;
  walletAddress: string;
  onClose: () => void;
  onCopy: (text: string, field: string) => void;
  onOpenExplorer: (blockHash?: string) => void;
  copiedField: string | null;
}

function TransactionDetailModal({
  transaction,
  walletAddress,
  onClose,
  onCopy,
  onOpenExplorer,
  copiedField,
}: TransactionDetailModalProps) {
  const isSent = transaction.from.toLowerCase() === walletAddress.toLowerCase();
  const otherAddress = isSent ? transaction.to : transaction.from;
  
  const statusColor = transaction.status === 'finalized' 
    ? THEME.colors.success 
    : transaction.status === 'failed' 
      ? THEME.colors.error 
      : THEME.colors.warning;
  
  const statusText = transaction.status === 'finalized' 
    ? 'Complete' 
    : transaction.status === 'failed' 
      ? 'Failed' 
      : 'Pending';

  return (
    <View style={styles.txDetailContainer}>
      {/* Header */}
      <View style={styles.txDetailHeader}>
        <View style={[
          styles.txDetailIcon,
          { backgroundColor: isSent ? '#FFEBEE' : '#E8F5E9' }
        ]}>
          <Ionicons 
            name={isSent ? 'arrow-up' : 'arrow-down'} 
            size={32} 
            color={isSent ? THEME.colors.error : THEME.colors.success} 
          />
        </View>
        <Text style={styles.txDetailType}>{isSent ? 'Sent' : 'Received'}</Text>
        <Text style={[
          styles.txDetailAmount,
          { color: isSent ? THEME.colors.error : THEME.colors.success }
        ]}>
          {isSent ? '-' : '+'}{transaction.formattedAmount || 'CHML'}
        </Text>
        <View style={[styles.txDetailStatusBadge, { backgroundColor: `${statusColor}20` }]}>
          <Text style={[styles.txDetailStatusText, { color: statusColor }]}>{statusText}</Text>
        </View>
        <Text style={styles.txDetailTime}>{getRelativeTime(transaction.timestamp)}</Text>
      </View>

      {/* Details */}
      <View style={styles.txDetailBody}>
        {/* From/To */}
        <View style={styles.txDetailRow}>
          <Text style={styles.txDetailLabel}>{isSent ? 'To' : 'From'}</Text>
          <View style={styles.txDetailValueRow}>
            <Text style={styles.txDetailValue} numberOfLines={1}>
              {truncateAddress(otherAddress, 8)}
            </Text>
            <TouchableOpacity onPress={() => onCopy(otherAddress, 'address')}>
              <Ionicons 
                name={copiedField === 'address' ? 'checkmark' : 'copy-outline'} 
                size={16} 
                color={copiedField === 'address' ? THEME.colors.success : THEME.colors.primary} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tx Hash */}
        {transaction.hash && (
          <View style={styles.txDetailRow}>
            <Text style={styles.txDetailLabel}>Transaction Hash</Text>
            <View style={styles.txDetailValueRow}>
              <Text style={styles.txDetailValue} numberOfLines={1}>
                {truncateAddress(transaction.hash, 8)}
              </Text>
              <TouchableOpacity onPress={() => onCopy(transaction.hash, 'txHash')}>
                <Ionicons 
                  name={copiedField === 'txHash' ? 'checkmark' : 'copy-outline'} 
                  size={16} 
                  color={copiedField === 'txHash' ? THEME.colors.success : THEME.colors.primary} 
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Block Number */}
        {transaction.blockNumber && (
          <View style={styles.txDetailRow}>
            <Text style={styles.txDetailLabel}>Block Number</Text>
            <Text style={styles.txDetailValue}>#{transaction.blockNumber.toLocaleString()}</Text>
          </View>
        )}

        {/* Block Hash */}
        {transaction.blockHash && (
          <View style={styles.txDetailRow}>
            <Text style={styles.txDetailLabel}>Block Hash</Text>
            <View style={styles.txDetailValueRow}>
              <Text style={styles.txDetailValue} numberOfLines={1}>
                {truncateAddress(transaction.blockHash, 8)}
              </Text>
              <TouchableOpacity onPress={() => onCopy(transaction.blockHash!, 'blockHash')}>
                <Ionicons 
                  name={copiedField === 'blockHash' ? 'checkmark' : 'copy-outline'} 
                  size={16} 
                  color={copiedField === 'blockHash' ? THEME.colors.success : THEME.colors.primary} 
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* MEV Badge */}
        {transaction.usedMEVProtection && (
          <View style={styles.txDetailMevBadge}>
            <Ionicons name="shield-checkmark" size={14} color={THEME.colors.primary} />
            <Text style={styles.txDetailMevText}>MEV Protected Transaction</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.txDetailActions}>
        {transaction.blockHash && (
          <TouchableOpacity
            style={styles.txDetailExplorerBtn}
            onPress={() => onOpenExplorer(transaction.blockHash)}
          >
            <Ionicons name="open-outline" size={18} color={THEME.colors.primary} />
            <Text style={styles.txDetailExplorerText}>View in Explorer</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={styles.txDetailCloseBtn} onPress={onClose}>
          <Text style={styles.txDetailCloseText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // No Wallet State
  noWalletContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: THEME.spacing.xl,
  },
  noWalletTitle: {
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  noWalletSubtitle: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: THEME.spacing.lg,
  },
  noWalletScrollContent: {
    flexGrow: 1,
  },
  setupOptionsContainer: {
    width: '100%',
    marginBottom: THEME.spacing.xl,
  },
  getStartedButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.large,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },
  getStartedButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  importButton: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
  },
  importButtonText: {
    color: THEME.colors.primary,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  devAccountSection: {
    width: '100%',
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.xl,
  },
  devAccountTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    textAlign: 'center',
    marginBottom: THEME.spacing.xs,
  },
  devAccountSubtitle: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: THEME.spacing.md,
  },
  devAccountButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: THEME.spacing.sm,
  },
  devAccountButton: {
    backgroundColor: THEME.colors.primaryLight,
    borderRadius: THEME.borderRadius.medium,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.lg,
  },
  devAccountButtonText: {
    color: THEME.colors.primary,
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
  },
  featurePreview: {
    width: '100%',
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
  },
  featurePreviewTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  featureList: {
    gap: THEME.spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  featureText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  // Header
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
  walletName: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  switchWalletHint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  notificationButton: {
    position: 'relative',
    padding: THEME.spacing.xs,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: THEME.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: THEME.colors.white,
    fontSize: 10,
    fontWeight: THEME.fontWeight.bold,
  },
  // Account Card
  accountCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    ...THEME.shadows.medium,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  accountLabel: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
  },
  currencyBadge: {
    backgroundColor: THEME.colors.primaryLight,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
  },
  currencyText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.semibold,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceAmount: {
    fontSize: THEME.fontSize['4xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  balanceContainer: {
    flexDirection: 'column',
    gap: THEME.spacing.sm,
  },
  balanceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 200,
  },
  balanceLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    fontWeight: THEME.fontWeight.medium,
  },
  growthBadge: {
    backgroundColor: THEME.colors.successBg,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
    marginTop: THEME.spacing.xs,
    alignSelf: 'flex-start',
  },
  growthText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.success,
    fontWeight: THEME.fontWeight.medium,
  },
  stakingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.full,
  },
  stakingButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
    marginLeft: THEME.spacing.xs,
  },
  networkBadgeContainer: {
    marginTop: THEME.spacing.md,
    alignItems: 'flex-start',
  },
  // MEV Protection
  mevContainer: {
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
  },
  // Action Grid
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  actionButton: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: THEME.spacing.md,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  actionIconDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
  actionLabel: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.text,
    textAlign: 'center',
  },
  actionLabelDisabled: {
    color: THEME.colors.textMuted,
  },
  // Activity Section
  activitySection: {
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  activityTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  viewAllText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.secondary,
    fontWeight: THEME.fontWeight.medium,
  },
  emptyActivityCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.xl,
    alignItems: 'center',
    ...THEME.shadows.small,
  },
  emptyActivityText: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.md,
  },
  emptyActivitySubtext: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
    marginTop: THEME.spacing.xs,
  },
  // Transaction List Styles
  activityList: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    ...THEME.shadows.small,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.lightGrey,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.text,
  },
  transactionSubtitle: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  transactionStatus: {
    fontSize: THEME.fontSize.xs,
    fontWeight: THEME.fontWeight.medium,
  },
  transactionTime: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
  },
  mevBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primaryLight,
    paddingHorizontal: THEME.spacing.xs,
    paddingVertical: 2,
    borderRadius: THEME.borderRadius.small,
    alignSelf: 'flex-start',
    marginTop: THEME.spacing.xs,
    gap: 2,
  },
  mevBadgeText: {
    fontSize: 10,
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.medium,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: THEME.colors.background,
    borderTopLeftRadius: THEME.borderRadius.large,
    borderTopRightRadius: THEME.borderRadius.large,
    maxHeight: '80%',
  },
  // Transaction Detail Modal styles
  txDetailContainer: {
    padding: THEME.spacing.lg,
  },
  txDetailHeader: {
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  txDetailIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  txDetailType: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.xs,
  },
  txDetailAmount: {
    fontSize: THEME.fontSize['2xl'],
    fontWeight: THEME.fontWeight.bold,
    marginBottom: THEME.spacing.sm,
  },
  txDetailStatusBadge: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.full,
    marginBottom: THEME.spacing.xs,
  },
  txDetailStatusText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.semibold,
  },
  txDetailTime: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  txDetailBody: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
    ...THEME.shadows.small,
  },
  txDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.lightGrey,
  },
  txDetailLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  txDetailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
    flex: 1,
    justifyContent: 'flex-end',
  },
  txDetailValue: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.text,
    fontFamily: 'monospace',
    maxWidth: 150,
  },
  txDetailMevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primaryLight,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.medium,
    marginTop: THEME.spacing.md,
    gap: THEME.spacing.xs,
    justifyContent: 'center',
  },
  txDetailMevText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.medium,
  },
  txDetailActions: {
    gap: THEME.spacing.md,
  },
  txDetailExplorerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    gap: THEME.spacing.sm,
  },
  txDetailExplorerText: {
    color: THEME.colors.primary,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
  },
  txDetailCloseBtn: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
  },
  txDetailCloseText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    textAlign: 'center',
  },
});
