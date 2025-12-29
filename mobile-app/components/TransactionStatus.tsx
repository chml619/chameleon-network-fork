/**
 * Transaction status component with animated states
 * Updated for light theme design with explorer links and copy functionality
 */

import React, { useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { THEME } from '../constants/theme';
import { TransactionStatus as TxStatus, TransactionResult } from '../services/transaction';

// Explorer URL configuration
const EXPLORER_BASE_URL = 'https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F64.23.233.36%3A9944#/explorer';

interface TransactionStatusProps {
  result: TransactionResult & { 
    usedMEVProtection?: boolean;
    amount?: string;
    to?: string;
    from?: string;
  };
  onClose?: () => void;
  showExplorerLink?: boolean;
}

export const TransactionStatus: React.FC<TransactionStatusProps> = ({
  result,
  onClose,
  showExplorerLink = true,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const getStatusConfig = (status: TxStatus) => {
    switch (status) {
      case 'pending':
        return {
          icon: <ActivityIndicator size="large" color={THEME.colors.warning} />,
          title: 'Transaction Pending',
          subtitle: 'Broadcasting to network...',
          color: THEME.colors.warning,
          bgColor: THEME.colors.warningBg,
        };
      case 'inBlock':
        return {
          icon: <ActivityIndicator size="large" color={THEME.colors.secondary} />,
          title: 'Transaction In Block',
          subtitle: 'Waiting for finalization...',
          color: THEME.colors.secondary,
          bgColor: '#E3F2FD',
        };
      case 'finalized':
        return {
          icon: <Ionicons name="checkmark-circle" size={48} color={THEME.colors.success} />,
          title: 'Transaction Successful',
          subtitle: 'Your transaction has been confirmed',
          color: THEME.colors.success,
          bgColor: THEME.colors.successBg,
        };
      case 'failed':
        return {
          icon: <Ionicons name="close-circle" size={48} color={THEME.colors.error} />,
          title: 'Transaction Failed',
          subtitle: result.error || 'Transaction was rejected',
          color: THEME.colors.error,
          bgColor: THEME.colors.errorBg,
        };
      default:
        return {
          icon: <Ionicons name="help-circle" size={48} color={THEME.colors.textMuted} />,
          title: 'Unknown Status',
          subtitle: 'Please check transaction manually',
          color: THEME.colors.textMuted,
          bgColor: THEME.colors.lightGrey,
        };
    }
  };

  const config = getStatusConfig(result.status);
  const truncatedHash = result.hash ? `${result.hash.slice(0, 10)}...${result.hash.slice(-10)}` : 'N/A';
  const truncatedBlockHash = result.blockHash ? `${result.blockHash.slice(0, 10)}...${result.blockHash.slice(-10)}` : null;

  // Copy to clipboard with feedback
  const handleCopy = async (text: string, field: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  // Open block explorer
  const handleOpenExplorer = async () => {
    try {
      let url = EXPLORER_BASE_URL;
      
      if (result.blockHash) {
        // Open specific block
        url = `${EXPLORER_BASE_URL}/query/${result.blockHash}`;
      }
      
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open browser');
      }
    } catch (error) {
      console.error('Error opening explorer:', error);
      Alert.alert('Error', 'Failed to open explorer');
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: config.bgColor }]}>
        {/* Status Icon */}
        <View style={styles.iconContainer}>
          {config.icon}
        </View>

        {/* Status Title */}
        <Text style={[styles.title, { color: config.color }]}>
          {config.title}
        </Text>

        {/* Status Subtitle */}
        <Text style={styles.subtitle}>
          {config.subtitle}
        </Text>

        {/* MEV Protection Badge */}
        {result.usedMEVProtection !== undefined && (
          <View style={[
            styles.mevBadge,
            { backgroundColor: result.usedMEVProtection ? THEME.colors.primaryLight : THEME.colors.lightGrey }
          ]}>
            <Ionicons 
              name={result.usedMEVProtection ? "shield-checkmark" : "shield-outline"} 
              size={14} 
              color={result.usedMEVProtection ? THEME.colors.primary : THEME.colors.textMuted} 
            />
            <Text style={[
              styles.mevBadgeText,
              { color: result.usedMEVProtection ? THEME.colors.primary : THEME.colors.textMuted }
            ]}>
              {result.usedMEVProtection ? 'MEV Protected' : 'Standard Transaction'}
            </Text>
          </View>
        )}

        {/* Transaction Hash */}
        {result.hash && (
          <View style={styles.infoBox}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoLabel}>Transaction Hash</Text>
              <TouchableOpacity 
                onPress={() => handleCopy(result.hash, 'txHash')}
                style={styles.copyButton}
              >
                <Ionicons 
                  name={copiedField === 'txHash' ? "checkmark" : "copy-outline"} 
                  size={16} 
                  color={copiedField === 'txHash' ? THEME.colors.success : THEME.colors.primary} 
                />
                {copiedField === 'txHash' && (
                  <Text style={styles.copiedText}>Copied!</Text>
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.infoValue} numberOfLines={1}>
              {truncatedHash}
            </Text>
          </View>
        )}

        {/* Block Number */}
        {result.blockNumber && (
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Block Number</Text>
            <Text style={styles.infoValue}>
              #{result.blockNumber.toLocaleString()}
            </Text>
          </View>
        )}

        {/* Block Hash */}
        {result.blockHash && (
          <View style={styles.infoBox}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoLabel}>Block Hash</Text>
              <TouchableOpacity 
                onPress={() => handleCopy(result.blockHash!, 'blockHash')}
                style={styles.copyButton}
              >
                <Ionicons 
                  name={copiedField === 'blockHash' ? "checkmark" : "copy-outline"} 
                  size={16} 
                  color={copiedField === 'blockHash' ? THEME.colors.success : THEME.colors.primary} 
                />
                {copiedField === 'blockHash' && (
                  <Text style={styles.copiedText}>Copied!</Text>
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.infoValue} numberOfLines={1}>
              {truncatedBlockHash}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {showExplorerLink && result.blockHash && (
            <TouchableOpacity
              style={styles.explorerButton}
              onPress={handleOpenExplorer}
            >
              <Ionicons name="open-outline" size={18} color={THEME.colors.primary} />
              <Text style={styles.explorerButtonText}>
                View in Explorer
              </Text>
            </TouchableOpacity>
          )}

          {onClose && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onClose}
            >
              <Text style={styles.primaryButtonText}>
                {result.status === 'finalized' ? 'Done' : 'Close'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.background,
    padding: THEME.spacing.lg,
    borderTopLeftRadius: THEME.borderRadius.large,
    borderTopRightRadius: THEME.borderRadius.large,
  },
  card: {
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: THEME.spacing.md,
  },
  title: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
    marginBottom: THEME.spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: THEME.spacing.lg,
    fontSize: THEME.fontSize.base,
  },
  mevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.xs,
    paddingHorizontal: THEME.spacing.md,
    borderRadius: THEME.borderRadius.full,
    marginBottom: THEME.spacing.md,
    gap: THEME.spacing.xs,
  },
  mevBadgeText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
  },
  infoBox: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    width: '100%',
    marginBottom: THEME.spacing.sm,
    ...THEME.shadows.small,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  infoLabel: {
    color: THEME.colors.textSecondary,
    fontSize: THEME.fontSize.sm,
  },
  infoValue: {
    color: THEME.colors.text,
    fontFamily: 'monospace',
    fontSize: THEME.fontSize.sm,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.xs,
    gap: THEME.spacing.xs,
  },
  copiedText: {
    color: THEME.colors.success,
    fontSize: THEME.fontSize.xs,
    fontWeight: THEME.fontWeight.medium,
  },
  buttonContainer: {
    width: '100%',
    gap: THEME.spacing.md,
    marginTop: THEME.spacing.md,
  },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    gap: THEME.spacing.sm,
  },
  explorerButtonText: {
    color: THEME.colors.primary,
    fontWeight: THEME.fontWeight.semibold,
    fontSize: THEME.fontSize.base,
  },
  primaryButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
  },
  primaryButtonText: {
    color: THEME.colors.white,
    textAlign: 'center',
    fontWeight: THEME.fontWeight.semibold,
    fontSize: THEME.fontSize.base,
  },
});

export default TransactionStatus;
