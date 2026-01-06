/**
 * Receive CHML screen
 * Shows QR code and address for receiving tokens
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Share,
  ScrollView,
  Modal,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/context/WalletContext';
import { QRCode } from '@/components/QRCode';
import { generateStealthMetaAddress, generateStealthHash, formatStealthHash } from '@/services/privacy';
import { walletService } from '@/services/wallet';
import { THEME, GRADIENTS } from '@/constants/theme';
import { Image } from 'react-native';

const TOKENS = [
  { id: "CHML", symbol: "pCHML", name: "Chameleon", color: "#6366F1", icon: "diamond-outline" },
  { id: "BTC", symbol: "pBTC", name: "Bitcoin", color: "#F7931A", icon: "logo-bitcoin" },
  { id: "ETH", symbol: "pETH", name: "Ethereum", color: "#627EEA", icon: "logo-electron" },
  { id: "USDT", symbol: "pUSDT", name: "Tether", color: "#26A17B", icon: "logo-usd" },
];

export default function ReceiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();

  // Generate stealth address for receiving
  const getStealthAddress = (): string => {
    if (!wallet?.address) return '';
    
    try {
      const keyPair = walletService.getKeyPair();
      if (!keyPair) {
        // Fallback to regular address if wallet is locked
        return wallet.address;
      }
      
      // Generate stealth meta-address from wallet
      const stealthMeta = {
        spendPubkey: keyPair.publicKey,
        viewPubkey: keyPair.publicKey, // Simplified for demo
      };
      
      const stealthHash = generateStealthHash(stealthMeta);
      return '0x' + Buffer.from(stealthHash).toString('hex');
    } catch (error) {
      console.error('Error generating stealth address:', error);
      return wallet.address; // Fallback to regular address
    }
  };

  const stealthAddress = getStealthAddress();
  const isStealthAddress = stealthAddress.startsWith('0x');

  const handleCopyAddress = async () => {
    if (stealthAddress) {
      await Clipboard.setStringAsync(stealthAddress);
      Alert.alert('Copied!', 'Address copied to clipboard');
    }
  };

  const handleShare = async () => {
    if (stealthAddress) {
      try {
        await Share.share({
          message: `My Chameleon stealth address: ${stealthAddress}`,
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
        <Text style={styles.headerTitle}>Receive Private Payments</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* QR Code Card */}
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Share this address to receive private payments</Text>
            
            <View style={styles.qrContainer}>
              <QRCode value={stealthAddress} size={200} />
            </View>

            <Text style={styles.addressLabel}>
              {isStealthAddress ? 'Your Stealth Address' : 'Your Address'}
            </Text>
            <Text style={styles.addressText}>
              {isStealthAddress 
                ? formatStealthHash(new Uint8Array(Buffer.from(stealthAddress.slice(2), 'hex')))
                : `${stealthAddress.slice(0, 8)}...${stealthAddress.slice(-8)}`
              }
            </Text>

            {isStealthAddress && (
              <View style={styles.privacyBadge}>
                <Ionicons name="eye-off" size={16} color={THEME.colors.success} />
                <Text style={styles.privacyText}>Fully Private & Untraceable</Text>
              </View>
            )}

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
              {isStealthAddress 
                ? 'This stealth address ensures your privacy. Payments to this address are completely untraceable.'
                : 'Only send CHML tokens to this address. Sending other tokens may result in permanent loss.'
              }
            </Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: THEME.spacing.xl,
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
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
    marginBottom: THEME.spacing.md,
    alignSelf: 'center',
  },
  privacyText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.success,
    fontWeight: THEME.fontWeight.semibold,
    marginLeft: THEME.spacing.xs,
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
