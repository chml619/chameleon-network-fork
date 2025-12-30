/**
 * Send CHML screen
 * Updated with clean light theme design and MEV protection integration
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { privacyService, generateStealthHash } from '@/services/privacy';
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
  const [transferMode, setTransferMode] = useState<'private' | 'public' | 'checking'>('checking');
  
  // Transaction state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [transactionResult, setTransactionResult] = useState<any>(null);
  const [showResult, setShowResult] = useState(false);

  // Validate address safely (with error handling)
  const checkAddressValid = useCallback((addr: string): boolean => {
    try {
      if (!addr || addr.length === 0) return false;
      // For privacy transfers, we accept stealth address hashes (0x format)
      if (addr.startsWith('0x') && addr.length === 66) {
        return true; // Valid stealth hash
      }
      // Also accept regular substrate addresses for compatibility
      if (addr.length < 47 || addr.length > 48 || !addr.startsWith('5')) {
        return false;
      }
      return transactionService.validateAddress(addr);
    } catch (error) {
      console.error('[Send] Address validation error:', error);
      return false;
    }
  }, []);

  // Check transfer mode when wallet changes
  useEffect(() => {
    checkTransferMode();
  }, [wallet?.address]);

  const checkTransferMode = async () => {
    if (!wallet?.address) {
      setTransferMode('checking');
      return;
    }

    try {
      const api = apiService.getApi();
      if (!api) {
        setTransferMode('public'); // Default to public if no API
        return;
      }

      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        setTransferMode('public');
        return;
      }

      privacyService.setApi(api);
      
      const senderStealthMeta = {
        spendPubkey: keyPair.publicKey,
        viewPubkey: keyPair.publicKey, // Simplified for demo
      };
      const inputStealthHash = generateStealthHash(senderStealthMeta);
      
      const hasShieldedNotes = await privacyService.hasShieldedNotes(inputStealthHash);
      setTransferMode(hasShieldedNotes ? 'private' : 'public');
    } catch (error) {
      console.error('[Send] Error checking transfer mode:', error);
      setTransferMode('public'); // Default to public on error
    }
  };

  // Validate recipient address (for UI feedback only)
  useEffect(() => {
    try {
      if (recipient.length > 0) {
        const valid = checkAddressValid(recipient);
        setIsValidAddress(valid);
      } else {
        setIsValidAddress(false);
      }
    } catch (error) {
      console.error('[Send] Address validation effect error:', error);
      setIsValidAddress(false);
    }
  }, [recipient, checkAddressValid]);

  // Estimate fee when amount and recipient change
  useEffect(() => {
    if (isValidAddress && amount && wallet?.address && parseFloat(amount) > 0) {
      estimateFee();
    } else {
      setFeeEstimate(null);
    }
  }, [recipient, amount, isValidAddress, wallet?.address]);
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

  const validateTransaction = (): string | null => {
    try {
      if (!wallet?.address) {
        return 'No wallet connected';
      }
      if (!recipient) {
        return 'Please enter recipient address';
      }
      if (!isValidAddress) {
        return 'Invalid recipient address';
      }
      if (!amount || parseFloat(amount) <= 0) {
        return 'Please enter a valid amount';
      }
      if (!balance || !balance.free) {
        return 'Loading balance...';
      }
      
      // Check if user has any balance
      const balanceBN = new BN(balance.free);
      if (balanceBN.isZero()) {
        return 'Insufficient balance';
      }
      
      // Check against fee if available
      if (feeEstimate && feeEstimate.partialFee) {
        const amountBN = transactionService.parseAmount(amount);
        const feeBN = new BN(feeEstimate.partialFee);
        const totalBN = amountBN.add(feeBN);
        
        if (totalBN.gt(balanceBN)) {
          return 'Insufficient balance (including fees)';
        }
      }
      
      return null;
    } catch (error) {
      console.error('[Send] validateTransaction error:', error);
      return 'Validation error';
    }
  };

  // Helper to check if form is ready (for button state)
  // Using state variables for stability during render
  const isFormReady = (): boolean => {
    try {
      if (!wallet?.address) return false;
      if (!recipient) return false;
      if (!isValidAddress) return false;
      if (!amount || parseFloat(amount) <= 0) return false;
      if (!balance || !balance.free) return false;
      
      // Check balance is not zero
      const balanceBN = new BN(balance.free);
      if (balanceBN.isZero()) return false;
      
      return true;
    } catch (error) {
      console.error('[Send] isFormReady error:', error);
      return false;
    }
  };

  // Get button text based on current state
  const getButtonText = (): string => {
    try {
      if (!wallet?.address) return 'Connect Wallet';
      if (!recipient) return 'Enter Recipient';
      if (!isValidAddress) return 'Invalid Address';
      if (!amount || parseFloat(amount) <= 0) return 'Enter Amount';
      if (!balance || !balance.free) return 'Loading...';
      
      const balanceBN = new BN(balance.free);
      if (balanceBN.isZero()) return 'No Balance';
      
      return 'Review Send';
    } catch (error) {
      console.error('[Send] getButtonText error:', error);
      return 'Error';
    }
  };

  const handleReview = () => {
    const error = validateTransaction();
    if (error) {
      Alert.alert('Transaction Error', error);
      return;
    }
    
    // Check fee estimate before showing confirmation
    if (!feeEstimate) {
      Alert.alert('Please Wait', 'Fee estimate is still loading. Please try again in a moment.');
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
      
      // Set API for privacy service
      privacyService.setApi(api);
      
      // Check if sender has shielded notes for private transfer
      const senderStealthMeta = {
        spendPubkey: keyPair.publicKey,
        viewPubkey: keyPair.publicKey, // Simplified for demo
      };
      const inputStealthHash = generateStealthHash(senderStealthMeta);
      
      const hasShieldedNotes = await privacyService.hasShieldedNotes(inputStealthHash);
      
      let txHash: string;
      let transferType: string;
      
      if (hasShieldedNotes) {
        console.log('[Send] Using confidential transfer (private)');
        transferType = 'Private Transfer';
        
        // For recipient, if it's a stealth hash use it directly, otherwise generate one
        let outputStealthHash: Uint8Array;
        if (recipient.startsWith('0x') && recipient.length === 66) {
          // It's already a stealth hash
          outputStealthHash = new Uint8Array(Buffer.from(recipient.slice(2), 'hex'));
        } else {
          // Generate stealth hash for regular address (simplified)
          const recipientStealthMeta = {
            spendPubkey: new Uint8Array(32), // Would be derived from recipient's public key
            viewPubkey: new Uint8Array(32),
          };
          outputStealthHash = generateStealthHash(recipientStealthMeta);
        }
        
        // Generate ephemeral key for the transaction
        const ephemeralPubkey = keyPair.publicKey; // Simplified for demo
        
        // Use confidential transfer
        txHash = await privacyService.confidentialTransfer(
          keyPair,
          inputStealthHash,
          outputStealthHash,
          amountBN,
          ephemeralPubkey
        );
      } else {
        console.log('[Send] Using public transfer (no shielded notes available)');
        transferType = 'Public Transfer';
        
        // Fall back to regular public transfer
        txHash = await privacyService.publicTransfer(
          keyPair,
          recipient,
          amountBN
        );
      }
      
      // Create transaction result
      const txResult = {
        hash: txHash,
        status: 'finalized' as const,
        usedMEVProtection: false, // Privacy is built-in, not MEV protection
        amount: formattedAmount,
        to: recipient,
        from: wallet.address,
        transferType,
      };
      
      // Save to transaction history
      if (wallet.address) {
        await transactionHistoryService.saveTransaction(wallet.address, {
          hash: txHash,
          from: wallet.address,
          to: recipient,
          amount: amountBN.toString(),
          formattedAmount,
          fee: feeEstimate.partialFee,
          status: 'finalized',
          usedMEVProtection: false,
        });
      }
      
      setTransactionResult(txResult);
      setIsSending(false);
      setShowResult(true);
      
      console.log(`[Send] ${transferType} successful:`, txHash);
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
        <Text style={styles.headerTitle}>Private Transfer</Text>
        <View style={styles.privacyHeaderBadge}>
          <Ionicons name="shield-checkmark" size={16} color={THEME.colors.success} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Recipient Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>To (Stealth Address)</Text>
          <View style={styles.inputRow}>
            <View style={[styles.inputContainer, { flex: 1, marginRight: THEME.spacing.sm }]}>
              <TextInput
                style={styles.textInput}
                placeholder="0x... or regular address"
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
          {recipient.startsWith('0x') && isValidAddress && (
            <View style={styles.stealthBadge}>
              <Ionicons name="eye-off" size={14} color={THEME.colors.success} />
              <Text style={styles.stealthText}>Stealth address detected - fully private</Text>
            </View>
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

        {/* Review Button */}
        <TouchableOpacity
          style={[
            styles.reviewButton,
            !isFormReady() && styles.buttonDisabled,
          ]}
          onPress={handleReview}
          disabled={!isFormReady()}
        >
          <Text style={styles.reviewButtonText}>{getButtonText()}</Text>
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
  privacyHeaderBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B98120',
    justifyContent: 'center',
    alignItems: 'center',
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
  stealthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
    marginTop: THEME.spacing.xs,
    alignSelf: 'flex-start',
  },
  stealthText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.success,
    fontWeight: THEME.fontWeight.semibold,
    marginLeft: THEME.spacing.xs,
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
