/**
 * Receive CHML screen
 * Shows QR code and address for receiving tokens
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/context/WalletContext';
import { QRCode } from '@/components/QRCode';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function ReceiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();

  const handleCopyAddress = async () => {
    if (wallet?.address) {
      await Clipboard.setStringAsync(wallet.address);
      Alert.alert('Copied!', 'Address copied to clipboard');
    }
  };

  const handleShare = async () => {
    if (wallet?.address) {
      try {
        await Share.share({
          message: `My Chameleon address: ${wallet.address}`,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    }
  };

  if (!wallet) {
    return (
      <LinearGradient
        colors={GRADIENTS.background.colors}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={styles.errorContainer}>
          <Ionicons name="wallet-outline" size={64} color={THEME.colors.textMuted} />
          <Text style={styles.errorText}>No wallet connected</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const truncatedAddress = `${wallet.address.slice(0, 8)}...${wallet.address.slice(-8)}`;

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receive CHML</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* QR Code Card */}
        <View style={styles.qrCard}>
          <Text style={styles.qrTitle}>Scan to send CHML</Text>
          
          <View style={styles.qrContainer}>
            <QRCode value={wallet.address} size={200} />
          </View>

          <Text style={styles.addressLabel}>Your Address</Text>
          <Text style={styles.addressText}>{truncatedAddress}</Text>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionButton} onPress={handleCopyAddress}>
              <View style={styles.actionIconContainer}>
                <Ionicons name="copy-outline" size={24} color={THEME.colors.primary} />
              </View>
              <Text style={styles.actionButtonText}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <View style={styles.actionIconContainer}>
                <Ionicons name="share-outline" size={24} color={THEME.colors.primary} />
              </View>
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Note */}
        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={20} color={THEME.colors.secondary} />
          <Text style={styles.infoText}>
            Only send CHML tokens to this address. Sending other tokens may result in permanent loss.
          </Text>
        </View>
      </View>
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
  headerBackButton: {
    padding: THEME.spacing.xs,
  },
  headerTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  content: {
    flex: 1,
    padding: THEME.spacing.lg,
  },
  qrCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.xl,
    alignItems: 'center',
    ...THEME.shadows.medium,
  },
  qrTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.lg,
  },
  qrContainer: {
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    marginBottom: THEME.spacing.lg,
  },
  addressLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  addressText: {
    fontSize: THEME.fontSize.base,
    fontFamily: 'monospace',
    color: THEME.colors.text,
    marginBottom: THEME.spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: THEME.spacing.xl,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  actionButtonText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.text,
    fontWeight: THEME.fontWeight.medium,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
    ...THEME.shadows.small,
  },
  infoText: {
    flex: 1,
    marginLeft: THEME.spacing.sm,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    lineHeight: 20,
  },
  // Error State
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  errorText: {
    fontSize: THEME.fontSize.lg,
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.xl,
  },
  backButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.xl,
  },
  backButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
  },
});
