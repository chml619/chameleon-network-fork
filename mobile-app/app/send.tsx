/**
 * Send CHML screen
 * Updated with clean light theme design and MEV protection integration
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
  Modal,
  StyleSheet,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { BN } from '@polkadot/util';
import { useWallet } from '@/context/WalletContext';
import { useBalance } from '@/hooks/useBalance';
import { transactionService } from '@/services/transaction';
import { transactionHistoryService } from '@/services/transactionHistory';
import { notificationService } from '@/services/notifications';
import { chainService } from '@/services/chain';
import { walletService, DEV_ACCOUNT_ADDRESSES } from '@/services/wallet';
import { apiService } from '@/services/api';
import { mevService } from '@/services/mev';
import { TransactionStatus } from '@/components/TransactionStatus';
import { truncateAddress } from '@/utils/address';
import { THEME, GRADIENTS } from '@/constants/theme';

// Quick test accounts for easy selection
const QUICK_TEST_ACCOUNTS = [
  { name: 'Alice', address: DEV_ACCOUNT_ADDRESSES.alice, color: '#FF6B6B' },
  { name: 'Bob', address: DEV_ACCOUNT_ADDRESSES.bob, color: '#4ECDC4' },
  { name: 'Charlie', address: DEV_ACCOUNT_ADDRESSES.charlie, color: '#9B59B6' },
  { name: 'Dave', address: DEV_ACCOUNT_ADDRESSES.dave, color: '#F39C12' },
  { name: 'Eve', address: DEV_ACCOUNT_ADDRESSES.eve, color: '#3498DB' },
];

export default function SendScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();
  const { formattedFreeBalance, balance } = useBalance(wallet?.address);
  
  // Form state
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isValidAddress, setIsValidAddress] = useState(false);
  const [feeEstimate, setFeeEstimate] = useState<any>(null);
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);
  
  // MEV Protection state - Default to OFF (Beta feature)
  const [mevEnabled, setMevEnabled] = useState(false);
  const [mevPalletAvailable, setMevPalletAvailable] = useState(false);
  
  // Transaction state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [transactionResult, setTransactionResult] = useState<any>(null);
  const [showResult, setShowResult] = useState(false);

  // Check MEV pallet availability on mount
  useEffect(() => {
    const checkMEVPallet = () => {
      const api = apiService.getApi();
      if (api) {
        const available = mevService.isMEVPalletAvailable(api);
        setMevPalletAvailable(available);
        console.log('[Send] MEV pallet available:', available);
      }
    };
    
    checkMEVPallet();
    
    // Re-check when API connects
    const unsubscribe = apiService.onConnectionStateChange((state) => {
      if (state.status === 'connected') {
        checkMEVPallet();
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Handle MEV toggle
  const handleMevToggle = (value: boolean) => {
    setMevEnabled(value);
    mevService.setEnabled(value);
    console.log('[Send] MEV protection:', value ? 'enabled' : 'disabled');
  };

  // Validate recipient address
  useEffect(() => {
    if (recipient.length > 0) {
      const valid = transactionService.validateAddress(recipient);
      setIsValidAddress(valid);
    } else {
      setIsValidAddress(false);
    }
  }, [recipient]);

  // Estimate fee when amount and recipient change
  useEffect(() => {
    if (isValidAddress && amount && wallet?.address && parseFloat(amount) > 0) {
      estimateFee();
    } else {
      setFeeEstimate(null);
    }
  }, [recipient, amount, isValidAddress, wallet?.address]);

  const estimateFee = async () => {
    if (!wallet?.address || !isValidAddress || !amount) return;
    
    setIsEstimatingFee(true);
    try {
      const amountBN = transactionService.parseAmount(amount);
      const estimate = await transactionService.estimateFee(wallet.address, recipient, amountBN);
      setFeeEstimate(estimate);
    } catch (error) {
      console.error('Error estimating fee:', error);
      setFeeEstimate(null);
    } finally {
      setIsEstimatingFee(false);
    }
  };

  const handlePasteAddress = async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync();
      if (clipboardContent) {
        setRecipient(clipboardContent.trim());
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to paste from clipboard');
    }
  };

  const handleMaxAmount = () => {
    if (!balance || !feeEstimate) return;
    
    const balanceBN = new BN(balance.free);
    const feeBN = new BN(feeEstimate.partialFee);
    const maxAmount = balanceBN.sub(feeBN);
    
    if (maxAmount.gt(new BN(0))) {
      const formatted = chainService.formatBalance(maxAmount.toString()).split(' ')[0];
      setAmount(formatted.replace(/,/g, ''));
    }
  };

  const validateTransaction = () => {
    if (!wallet?.address) return 'No wallet connected';
    if (!recipient) return 'Please enter recipient address';
    if (!isValidAddress) return 'Invalid recipient address';
    if (!amount || parseFloat(amount) <= 0) return 'Please enter a valid amount';
    if (!balance) return 'Unable to check balance';
    
    // Allow proceeding even if fee estimate is still loading
    // The fee will be checked before final confirmation
    if (feeEstimate) {
      const amountBN = transactionService.parseAmount(amount);
      const feeBN = new BN(feeEstimate.partialFee);
      const totalBN = amountBN.add(feeBN);
      const balanceBN = new BN(balance.free);
      
      if (totalBN.gt(balanceBN)) {
        return 'Insufficient balance (including fees)';
      }
    }
    
    return null;
  };

  const handleReview = () => {
    const error = validateTransaction();
    if (error) {
      Alert.alert('Transaction Error', error);
      return;
    }
    setShowConfirmation(true);
  };

  const handleConfirmSend = async () => {
    if (!wallet?.address || !feeEstimate) return;
    
    setShowConfirmation(false);
    setIsSending(true);
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        throw new Error('Wallet not unlocked');
      }
      
      const api = apiService.getApi();
      if (!api) {
        throw new Error('Not connected to network');
      }
      
      const amountBN = transactionService.parseAmount(amount);
      const formattedAmount = `${amount} CHML`;
      
      // Check if MEV protection is enabled
      if (mevEnabled) {
        console.log('[Send] Using MEV protection for transaction');
        
        // Use MEV protection service
        const result = await mevService.submitProtectedTransaction(
          api,
          keyPair,
          recipient,
          amountBN
        );
        
        // Create transaction result
        const txResult = {
          hash: result.txHash || '',
          status: result.success ? 'finalized' as const : 'failed' as const,
          blockHash: result.blockHash,
          error: result.error,
          usedMEVProtection: result.usedMEVProtection,
          amount: formattedAmount,
          to: recipient,
          from: wallet.address,
        };
        
        // Save to transaction history
        if (wallet.address) {
          await transactionHistoryService.saveTransaction(wallet.address, {
            hash: result.txHash || `mev_${Date.now()}`,
            from: wallet.address,
            to: recipient,
            amount: amountBN.toString(),
            formattedAmount,
            fee: feeEstimate.partialFee,
            status: result.success ? 'finalized' : 'failed',
            blockHash: result.blockHash,
            usedMEVProtection: result.usedMEVProtection,
            mevDelayBlocks: mevService.getConfig().delayBlocks,
            error: result.error,
          });
        }
        
        setTransactionResult(txResult);
        setIsSending(false);
        setShowResult(true);
        
        if (!result.success) {
          console.error('[Send] MEV protected transaction failed:', result.error);
        } else {
          console.log('[Send] MEV protected transaction successful:', result.txHash);
        }
      } else {
        // Use standard transaction with monitoring
        console.log('[Send] Using standard transaction (MEV protection disabled)');
        
        // Set initial pending state immediately
        setTransactionResult({
          hash: '',
          status: 'pending' as const,
          usedMEVProtection: false,
          amount: formattedAmount,
          to: recipient,
          from: wallet.address,
        });
        
        // Send "transaction submitted" notification
        notificationService.notifyTransactionSent(formattedAmount, recipient);
        
        try {
          await transactionService.sendTransactionWithMonitoring(
            keyPair,
            recipient,
            amountBN,
            async (result) => {
              console.log('[Send] Transaction callback received:', result.status);
              
              const txResult = {
                ...result,
                usedMEVProtection: false,
                amount: formattedAmount,
                to: recipient,
                from: wallet.address,
              };
              
              // Always update the result
              setTransactionResult(txResult);
              
              if (result.status === 'finalized') {
                console.log('[Send] Transaction finalized, showing result modal');
                
                // Send "transaction confirmed" notification
                notificationService.notifyTransactionConfirmed(
                  formattedAmount,
                  recipient,
                  result.hash,
                  result.blockNumber
                );
                
                // Save to transaction history
                if (wallet.address) {
                  try {
                    await transactionHistoryService.saveTransaction(wallet.address, {
                      hash: result.hash,
                      from: wallet.address,
                      to: recipient,
                      amount: amountBN.toString(),
                      formattedAmount,
                      fee: feeEstimate.partialFee,
                      status: result.status,
                      blockNumber: result.blockNumber,
                      blockHash: result.blockHash,
                      usedMEVProtection: false,
                      error: result.error,
                    });
                    console.log('[Send] Transaction saved to history');
                  } catch (historyError) {
                    console.error('[Send] Failed to save to history:', historyError);
                  }
                }
                
                // Update UI state
                setIsSending(false);
                setShowResult(true);
              } else if (result.status === 'failed') {
                console.log('[Send] Transaction failed, showing result modal');
                
                // Send "transaction failed" notification
                notificationService.notifyTransactionFailed(
                  formattedAmount,
                  result.error || 'Transaction failed'
                );
                
                // Update UI state
                setIsSending(false);
                setShowResult(true);
              }
            }
          );
        } catch (txError) {
          console.error('[Send] Transaction error:', txError);
          
          // Send failed notification
          const errorMsg = txError instanceof Error ? txError.message : 'Transaction failed';
          notificationService.notifyTransactionFailed(formattedAmount, errorMsg);
          
          // Even on error, show the result modal with failure
          setTransactionResult({
            hash: '',
            status: 'failed' as const,
            error: txError instanceof Error ? txError.message : 'Transaction failed',
            usedMEVProtection: false,
            amount: formattedAmount,
            to: recipient,
            from: wallet.address,
          });
          setIsSending(false);
          setShowResult(true);
        }
      }
    } catch (error) {
      console.error('Error sending transaction:', error);
      setIsSending(false);
      Alert.alert(
        'Transaction Failed',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  };

  const handleCloseResult = () => {
    setShowResult(false);
    setTransactionResult(null);
    
    if (transactionResult?.status === 'finalized') {
      setRecipient('');
      setAmount('');
      setFeeEstimate(null);
    }
  };

  // Remove the early return for isSending - use modal instead
  // This ensures the result modal can be shown properly

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
        <Text style={styles.headerTitle}>Send CHML</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Recipient Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>To</Text>
          <View style={styles.inputRow}>
            <View style={[styles.inputContainer, { flex: 1, marginRight: THEME.spacing.sm }]}>
              <TextInput
                style={styles.textInput}
                placeholder="Enter recipient address"
                placeholderTextColor={THEME.colors.textMuted}
                value={recipient}
                onChangeText={setRecipient}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={handlePasteAddress}>
              <Ionicons name="clipboard-outline" size={20} color={THEME.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {recipient.length > 0 && !isValidAddress && (
            <Text style={styles.errorText}>Invalid address format</Text>
          )}
        </View>

        {/* Quick Test Accounts */}
        <View style={styles.quickAccountsSection}>
          <Text style={styles.quickAccountsLabel}>Quick Test Accounts</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickAccountsScroll}
          >
            {QUICK_TEST_ACCOUNTS.map((account) => (
              <TouchableOpacity
                key={account.name}
                style={[
                  styles.quickAccountChip,
                  recipient === account.address && styles.quickAccountChipSelected,
                  { borderColor: account.color }
                ]}
                onPress={() => setRecipient(account.address)}
              >
                <View style={[styles.quickAccountDot, { backgroundColor: account.color }]} />
                <Text style={[
                  styles.quickAccountName,
                  recipient === account.address && styles.quickAccountNameSelected
                ]}>
                  {account.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Amount Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Amount</Text>
          <View style={styles.inputRow}>
            <View style={[styles.inputContainer, { flex: 1, marginRight: THEME.spacing.sm }]}>
              <TextInput
                style={[styles.textInput, { fontSize: THEME.fontSize.xl }]}
                placeholder="0.00"
                placeholderTextColor={THEME.colors.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
            </View>
            <TouchableOpacity
              style={[
                styles.maxButton,
                (!balance || !feeEstimate) && styles.maxButtonDisabled,
              ]}
              onPress={handleMaxAmount}
              disabled={!balance || !feeEstimate}
            >
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.availableText}>
            Available: {formattedFreeBalance}
          </Text>
        </View>

        {/* Fee Estimate */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Network Fee</Text>
          <View style={styles.feeContainer}>
            {isEstimatingFee ? (
              <View style={styles.feeEstimating}>
                <ActivityIndicator size="small" color={THEME.colors.primary} />
                <Text style={styles.feeEstimatingText}>Estimating fee...</Text>
              </View>
            ) : feeEstimate ? (
              <Text style={styles.feeAmount}>~{feeEstimate.formatted}</Text>
            ) : (
              <Text style={styles.feePlaceholder}>Enter amount to estimate fee</Text>
            )}
          </View>
        </View>

        {/* MEV Protection Toggle */}
        <View style={styles.mevSection}>
          <View style={styles.mevHeader}>
            <View style={styles.mevLabelContainer}>
              <Ionicons 
                name="shield-checkmark" 
                size={20} 
                color={mevEnabled ? THEME.colors.primary : THEME.colors.textMuted} 
              />
              <Text style={styles.mevLabel}>MEV Protection</Text>
              <View style={styles.betaBadge}>
                <Text style={styles.betaText}>Beta</Text>
              </View>
            </View>
            <Switch
              value={mevEnabled}
              onValueChange={handleMevToggle}
              trackColor={{ false: THEME.colors.lightGrey, true: THEME.colors.primaryLight }}
              thumbColor={mevEnabled ? THEME.colors.primary : THEME.colors.grey}
            />
          </View>
          <Text style={styles.mevDescription}>
            {mevEnabled 
              ? mevPalletAvailable 
                ? '✓ Protected via on-chain MEV pallet' 
                : '⚠ Pallet unavailable, using fallback protection'
              : 'Protect against front-running attacks'
            }
          </Text>
          {mevEnabled && (
            <View style={styles.mevWarning}>
              <Ionicons name="information-circle-outline" size={14} color="#F57C00" />
              <Text style={styles.mevWarningText}>
                Auto-execution under development. Manual execution may be required.
              </Text>
            </View>
          )}
          {mevEnabled && mevPalletAvailable && (
            <View style={styles.mevInfo}>
              <Ionicons name="time-outline" size={14} color={THEME.colors.textSecondary} />
              <Text style={styles.mevInfoText}>
                Transaction delayed by ~{mevService.getConfig().delayBlocks * 6}s for protection
              </Text>
            </View>
          )}
        </View>

        {/* Review Button */}
        <TouchableOpacity
          style={[
            styles.reviewButton,
            validateTransaction() && styles.buttonDisabled,
          ]}
          onPress={handleReview}
          disabled={!!validateTransaction()}
        >
          <Text style={styles.reviewButtonText}>Review Send</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmation}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Transaction</Text>
            
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Sending</Text>
              <Text style={styles.modalAmountLarge}>{amount} CHML</Text>
            </View>
            
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>To</Text>
              <Text style={styles.modalAddress}>{truncateAddress(recipient)}</Text>
            </View>
            
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Network Fee</Text>
              <Text style={styles.modalAmount}>{feeEstimate?.formatted}</Text>
            </View>
            
            {/* MEV Protection Status in Modal */}
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>MEV Protection</Text>
              <View style={styles.mevStatusRow}>
                <Ionicons 
                  name={mevEnabled ? "shield-checkmark" : "shield-outline"} 
                  size={16} 
                  color={mevEnabled ? THEME.colors.success : THEME.colors.textMuted} 
                />
                <Text style={[
                  styles.modalAmount, 
                  { color: mevEnabled ? THEME.colors.success : THEME.colors.textMuted }
                ]}>
                  {mevEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmSend}>
                <Text style={styles.confirmButtonText}>Confirm & Send</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowConfirmation(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transaction Result Modal */}
      <Modal
        visible={showResult}
        transparent
        animationType="slide"
        onRequestClose={handleCloseResult}
      >
        <View style={styles.modalOverlay}>
          <TransactionStatus result={transactionResult} onClose={handleCloseResult} />
        </View>
      </Modal>

      {/* Sending Transaction Modal */}
      <Modal
        visible={isSending}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.sendingOverlay}>
          <View style={styles.sendingCard}>
            <ActivityIndicator size="large" color={THEME.colors.primary} />
            <Text style={styles.sendingTitle}>Sending Transaction...</Text>
            <Text style={styles.sendingSubtitle}>
              {transactionResult?.status === 'inBlock' 
                ? 'Waiting for finalization...'
                : 'Broadcasting to network...'
              }
            </Text>
            {transactionResult?.hash && (
              <Text style={styles.sendingHash}>
                Tx: {transactionResult.hash.slice(0, 10)}...
              </Text>
            )}
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: THEME.spacing.lg,
  },
  inputSection: {
    marginBottom: THEME.spacing.lg,
  },
  inputLabel: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputContainer: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    ...THEME.shadows.small,
  },
  textInput: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
    padding: THEME.spacing.md,
  },
  iconButton: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  maxButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.medium,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
  },
  maxButtonDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
  maxButtonText: {
    color: THEME.colors.white,
    fontWeight: THEME.fontWeight.semibold,
    fontSize: THEME.fontSize.sm,
  },
  errorText: {
    color: THEME.colors.error,
    fontSize: THEME.fontSize.sm,
    marginTop: THEME.spacing.xs,
  },
  // Quick Test Accounts styles
  quickAccountsSection: {
    marginBottom: THEME.spacing.lg,
  },
  quickAccountsLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.sm,
  },
  quickAccountsScroll: {
    paddingRight: THEME.spacing.md,
  },
  quickAccountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.white,
    borderWidth: 1.5,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    marginRight: THEME.spacing.sm,
    ...THEME.shadows.small,
  },
  quickAccountChipSelected: {
    backgroundColor: THEME.colors.primaryLight,
  },
  quickAccountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: THEME.spacing.xs,
  },
  quickAccountName: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.text,
  },
  quickAccountNameSelected: {
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.semibold,
  },
  availableText: {
    color: THEME.colors.textSecondary,
    fontSize: THEME.fontSize.sm,
    marginTop: THEME.spacing.xs,
  },
  feeContainer: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  feeEstimating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feeEstimatingText: {
    color: THEME.colors.textSecondary,
    marginLeft: THEME.spacing.sm,
    fontSize: THEME.fontSize.sm,
  },
  feeAmount: {
    color: THEME.colors.text,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.medium,
  },
  feePlaceholder: {
    color: THEME.colors.textMuted,
    fontSize: THEME.fontSize.base,
  },
  // MEV Protection styles
  mevSection: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
    ...THEME.shadows.small,
  },
  mevHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mevLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  mevLabel: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  betaBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: THEME.spacing.xs,
    paddingVertical: 2,
    borderRadius: THEME.borderRadius.small,
    marginLeft: THEME.spacing.xs,
  },
  betaText: {
    fontSize: 10,
    fontWeight: THEME.fontWeight.semibold,
    color: '#F57C00',
  },
  mevDescription: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.sm,
  },
  mevWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: THEME.spacing.xs,
    marginTop: THEME.spacing.sm,
    backgroundColor: '#FFF3E0',
    padding: THEME.spacing.sm,
    borderRadius: THEME.borderRadius.small,
  },
  mevWarningText: {
    flex: 1,
    fontSize: THEME.fontSize.xs,
    color: '#E65100',
    lineHeight: 16,
  },
  mevInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
    marginTop: THEME.spacing.sm,
    paddingTop: THEME.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.lightGrey,
  },
  mevInfoText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
  },
  mevStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
  },
  reviewButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
  },
  reviewButtonText: {
    color: THEME.colors.white,
    textAlign: 'center',
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  buttonDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: THEME.colors.background,
    borderTopLeftRadius: THEME.borderRadius.large,
    borderTopRightRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
  },
  modalTitle: {
    color: THEME.colors.text,
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
    textAlign: 'center',
    marginBottom: THEME.spacing.lg,
  },
  modalSection: {
    marginBottom: THEME.spacing.lg,
  },
  modalLabel: {
    color: THEME.colors.textSecondary,
    fontSize: THEME.fontSize.sm,
    marginBottom: THEME.spacing.xs,
  },
  modalAmount: {
    color: THEME.colors.text,
    fontSize: THEME.fontSize.base,
  },
  modalAmountLarge: {
    color: THEME.colors.text,
    fontSize: THEME.fontSize['3xl'],
    fontWeight: THEME.fontWeight.bold,
  },
  modalAddress: {
    color: THEME.colors.text,
    fontFamily: 'monospace',
    fontSize: THEME.fontSize.base,
  },
  modalButtons: {
    gap: THEME.spacing.md,
  },
  confirmButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
  },
  confirmButtonText: {
    color: THEME.colors.white,
    textAlign: 'center',
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  cancelButton: {
    paddingVertical: THEME.spacing.md,
  },
  cancelButtonText: {
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    fontSize: THEME.fontSize.lg,
  },
  // Sending modal styles
  sendingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  sendingCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 300,
    ...THEME.shadows.large,
  },
  sendingTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginTop: THEME.spacing.lg,
    textAlign: 'center',
  },
  sendingSubtitle: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.sm,
    textAlign: 'center',
  },
  sendingHash: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
    fontFamily: 'monospace',
    marginTop: THEME.spacing.md,
  },
});
