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
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [showTokenSelector, setShowTokenSelector] = useState(false);

  // Get the receive address (same for all pTokens on Chameleon)
  const getReceiveAddress = (): string => {
    if (!wallet?.address) return '';
    
    try {
      // For pTokens, we use the regular Chameleon address
      // All pTokens (pCHML, pBTC, pETH, pUSDT) are received at the same address
      return wallet.address;
    } catch (error) {
      console.error('Error getting receive address:', error);
      return '';
    }
  };

  const receiveAddress = getReceiveAddress();

  const handleCopyAddress = async () => {
    if (receiveAddress) {
      await Clipboard.setStringAsync(receiveAddress);
      Alert.alert('Copied!', 'Address copied to clipboard');
    }
  };

  const handleShare = async () => {
    if (receiveAddress) {
      try {
        await Share.share({
          message: `Send ${selectedToken.symbol} to my Chameleon address: ${receiveAddress}`,
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
          {/* Token Selector */}
          <View style={styles.tokenSelectorSection}>
            <Text style={styles.sectionLabel}>Token to Receive</Text>
            <TouchableOpacity
              style={styles.tokenSelector}
              onPress={() => setShowTokenSelector(true)}
            >
              <View style={styles.tokenSelectorLeft}>
                <View style={[styles.tokenIcon, { backgroundColor: selectedToken.color + '20' }]}>
                  {selectedToken.id === "CHML" ? (
                    <Image source={require("@/assets/images/Logo.png")} style={{ width: 24, height: 24 }} resizeMode="contain" />
                  ) : (
                    <Ionicons name={selectedToken.icon as any} size={20} color={selectedToken.color} />
                  )}
                </View>
                <View>
                  <Text style={styles.tokenSymbol}>{selectedToken.symbol}</Text>
                  <Text style={styles.tokenName}>{selectedToken.name}</Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={20} color={THEME.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* QR Code Card */}
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Send {selectedToken.symbol} to this address</Text>
            
            <View style={styles.qrContainer}>
              <QRCode value={receiveAddress} size={200} />
            </View>

            <Text style={styles.addressLabel}>Your Chameleon Address</Text>
            <Text style={styles.addressText}>
              {receiveAddress ? `${receiveAddress.slice(0, 12)}...${receiveAddress.slice(-12)}` : 'Loading...'}
            </Text>

            <View style={styles.privacyBadge}>
              <Ionicons name="shield-checkmark" size={16} color={THEME.colors.success} />
              <Text style={styles.privacyText}>All pTokens use this address</Text>
            </View>

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

          {/* Multi-Token Info */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={20} color={THEME.colors.primary} />
            <Text style={styles.infoText}>
              You can receive pCHML, pBTC, pETH, and pUSDT at this same address. 
              All tokens are automatically private on Chameleon Network.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Token Selector Modal */}
      <Modal
        visible={showTokenSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTokenSelector(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTokenSelector(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <TouchableOpacity onPress={() => setShowTokenSelector(false)}>
                <Ionicons name="close" size={24} color={THEME.colors.text} />
              </TouchableOpacity>
            </View>
            {TOKENS.map((token) => (
              <TouchableOpacity
                key={token.id}
                style={[
                  styles.tokenOption,
                  selectedToken.id === token.id && styles.tokenOptionSelected,
                ]}
                onPress={() => {
                  setSelectedToken(token);
                  setShowTokenSelector(false);
                }}
              >
                <View style={[styles.tokenIcon, { backgroundColor: token.color + '20' }]}>
                  {token.id === "CHML" ? (
                    <Image source={require("@/assets/images/Logo.png")} style={{ width: 24, height: 24 }} resizeMode="contain" />
                  ) : (
                    <Ionicons name={token.icon as any} size={20} color={token.color} />
                  )}
                </View>
                <View style={styles.tokenOptionInfo}>
                  <Text style={styles.tokenOptionSymbol}>{token.symbol}</Text>
                  <Text style={styles.tokenOptionName}>{token.name}</Text>
                </View>
                {selectedToken.id === token.id && (
                  <Ionicons name="checkmark-circle" size={24} color={THEME.colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
