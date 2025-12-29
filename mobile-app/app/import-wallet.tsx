/**
 * Import wallet screen
 * Matches mockup design: chmlwallet-mockup-003.jpg
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '@/context/WalletContext';
import { walletService, DEV_ACCOUNTS } from '@/services/wallet';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function ImportWalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { importWallet, importDevAccount, isLoading } = useWallet();
  
  const [walletName, setWalletName] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [selectedDevAccount, setSelectedDevAccount] = useState<string | null>(null);
  const [isValidMnemonic, setIsValidMnemonic] = useState(false);

  const validateMnemonic = (text: string) => {
    setMnemonic(text);
    setSelectedDevAccount(null);
    
    if (!text.trim()) {
      setIsValidMnemonic(false);
      return;
    }

    const isValid = walletService.validateMnemonic(text.trim());
    setIsValidMnemonic(isValid);
  };

  const handleDevAccountSelect = (accountName: string) => {
    setSelectedDevAccount(accountName);
    const devMnemonic = DEV_ACCOUNTS[accountName as keyof typeof DEV_ACCOUNTS];
    setMnemonic(devMnemonic);
    setIsValidMnemonic(true);
    setWalletName(`Dev (${accountName})`);
  };

  const handleImport = async () => {
    if (!isValidMnemonic) {
      Alert.alert('Invalid Seed Phrase', 'Please enter a valid 12 or 24 word seed phrase.');
      return;
    }

    try {
      if (selectedDevAccount) {
        await importDevAccount(selectedDevAccount as any);
      } else {
        await importWallet(mnemonic.trim(), walletName.trim() || 'Imported Wallet');
      }
      
      Alert.alert(
        'Wallet Imported!',
        'Your wallet has been imported successfully.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)'),
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to import wallet. Please check your seed phrase and try again.');
    }
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
        <Text style={styles.headerTitle}>Import master key</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Dev Accounts Quick Import */}
        <View style={styles.devSection}>
          <Text style={styles.sectionTitle}>Quick Import (Dev Accounts)</Text>
          <View style={styles.devAccountsGrid}>
            {Object.keys(DEV_ACCOUNTS).map((account) => (
              <TouchableOpacity
                key={account}
                style={[
                  styles.devAccountButton,
                  selectedDevAccount === account && styles.devAccountButtonSelected,
                ]}
                onPress={() => handleDevAccountSelect(account)}
              >
                <Text
                  style={[
                    styles.devAccountText,
                    selectedDevAccount === account && styles.devAccountTextSelected,
                  ]}
                >
                  {account.charAt(0).toUpperCase() + account.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.devNote}>These are pre-funded development accounts for testing.</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Or enter manually</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Wallet Name Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Master key name"
            placeholderTextColor={THEME.colors.textMuted}
            value={walletName}
            onChangeText={setWalletName}
          />
        </View>

        {/* Recovery Phrase Input */}
        <View style={styles.inputContainer}>
          <View style={styles.phraseInputRow}>
            <TextInput
              style={[styles.textInput, styles.phraseInput]}
              placeholder="Recovery phrase (12 words)"
              placeholderTextColor={THEME.colors.textMuted}
              value={mnemonic}
              onChangeText={validateMnemonic}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => Alert.alert('Coming Soon', 'QR scanning will be available soon.')}
            >
              <Ionicons name="scan-outline" size={24} color={THEME.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Validation Status */}
        {mnemonic.trim() && (
          <View style={styles.validationRow}>
            <Ionicons
              name={isValidMnemonic ? 'checkmark-circle' : 'close-circle'}
              size={20}
              color={isValidMnemonic ? THEME.colors.success : THEME.colors.error}
            />
            <Text
              style={[
                styles.validationText,
                { color: isValidMnemonic ? THEME.colors.success : THEME.colors.error },
              ]}
            >
              {isValidMnemonic ? 'Valid seed phrase' : 'Invalid seed phrase'}
            </Text>
          </View>
        )}

        {/* Import Button */}
        <TouchableOpacity
          style={[
            styles.importButton,
            (!isValidMnemonic || isLoading) && styles.buttonDisabled,
          ]}
          onPress={handleImport}
          disabled={!isValidMnemonic || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={THEME.colors.white} />
          ) : (
            <Text style={styles.importButtonText}>Import</Text>
          )}
        </TouchableOpacity>
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
    paddingBottom: THEME.spacing.xl * 2,
  },
  // Dev Section
  devSection: {
    marginBottom: THEME.spacing.xl,
  },
  sectionTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  devAccountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },
  devAccountButton: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.small,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  devAccountButtonSelected: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  devAccountText: {
    color: THEME.colors.secondary,
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
  },
  devAccountTextSelected: {
    color: THEME.colors.white,
  },
  devNote: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.colors.border,
  },
  dividerText: {
    color: THEME.colors.textSecondary,
    fontSize: THEME.fontSize.sm,
    marginHorizontal: THEME.spacing.md,
  },
  // Inputs
  inputContainer: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    marginBottom: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  textInput: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
    padding: THEME.spacing.md,
  },
  phraseInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  phraseInput: {
    flex: 1,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  scanButton: {
    padding: THEME.spacing.md,
  },
  // Validation
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  validationText: {
    marginLeft: THEME.spacing.sm,
    fontSize: THEME.fontSize.sm,
  },
  // Button
  importButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    alignItems: 'center',
    marginTop: THEME.spacing.md,
  },
  importButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
  buttonDisabled: {
    backgroundColor: THEME.colors.lightGrey,
  },
});
