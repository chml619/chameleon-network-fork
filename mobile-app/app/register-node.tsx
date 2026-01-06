/**
 * Register Node Screen
 * Register a new validator node with IP and port
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '@/hooks/useApi';
import { useWallet } from '@/context/WalletContext';
import { walletService } from '@/services/wallet';
import { stakingService } from '@/services/staking';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function RegisterNodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { api } = useApi();
  const { wallet } = useWallet();
  
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('30333');
  const [isRegistering, setIsRegistering] = useState(false);

  const validateForm = (): string | null => {
    if (!ip.trim()) return 'Please enter an IP address';
    // Basic IP validation (IPv4)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip.trim())) return 'Invalid IP address format (e.g., 64.23.233.36)';
    
    // Validate each octet
    const octets = ip.split('.');
    for (const octet of octets) {
      const num = parseInt(octet);
      if (num < 0 || num > 255) return 'Invalid IP address (each number must be 0-255)';
    }
    
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return 'Port must be between 1 and 65535';
    }
    
    return null;
  };

  const handleRegister = async () => {
    const error = validateForm();
    if (error) {
      Alert.alert('Validation Error', error);
      return;
    }

    if (!api || !wallet) {
      Alert.alert('Error', 'Not connected to network');
      return;
    }

    const keyPair = await walletService.getOrDeriveKeyPair();
    if (!keyPair) {
      Alert.alert('Error', 'Wallet not unlocked. Please re-import your wallet.');
      return;
    }

    setIsRegistering(true);
    try {
      // Register node with IP and port
      const result = await stakingService.registerNodeWithEndpoint(
        api,
        keyPair,
        ip.trim(),
        parseInt(port)
      );

      if (result.success) {
        Alert.alert(
          '🎉 Node Registered!',
          'Your validator node has been registered successfully.\n\nNext step: Stake at least 1,750 pCHML to activate your node and start earning rewards.',
          [
            {
              text: 'Stake Now',
              onPress: () => router.replace('/staking'),
            },
            {
              text: 'Later',
              onPress: () => router.back(),
              style: 'cancel',
            },
          ]
        );
      } else {
        Alert.alert('Registration Failed', result.error || 'Unknown error occurred');
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsRegistering(false);
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
        <Text style={styles.headerTitle}>Register vNode</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="server" size={40} color={THEME.colors.primary} />
            </View>
            <Text style={styles.infoTitle}>Become a Validator</Text>
            <Text style={styles.infoText}>
              Register your validator node to participate in block production and earn rewards.
              After registration, stake at least 1,750 pCHML to activate.
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Node Configuration</Text>
            
            <Text style={styles.label}>Server IP Address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="globe-outline" size={20} color={THEME.colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="e.g., 64.23.233.36"
                placeholderTextColor={THEME.colors.textMuted}
                value={ip}
                onChangeText={setIp}
                keyboardType="decimal-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.label}>P2P Port</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="link-outline" size={20} color={THEME.colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="30333"
                placeholderTextColor={THEME.colors.textMuted}
                value={port}
                onChangeText={setPort}
                keyboardType="number-pad"
              />
            </View>

            {/* Requirements */}
            <View style={styles.requirements}>
              <Text style={styles.requirementsTitle}>Requirements</Text>
              <View style={styles.requirementItem}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.requirementText}>VPS with static IP address</Text>
              </View>
              <View style={styles.requirementItem}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.requirementText}>Port 30333 open for P2P connections</Text>
              </View>
              <View style={styles.requirementItem}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.requirementText}>Chameleon node software running</Text>
              </View>
              <View style={styles.requirementItem}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.requirementText}>1,750+ pCHML for staking</Text>
              </View>
            </View>
          </View>

          {/* Register Button */}
          <TouchableOpacity
            style={[styles.registerButton, isRegistering && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isRegistering}
          >
            {isRegistering ? (
              <ActivityIndicator color={THEME.colors.white} />
            ) : (
              <>
                <Ionicons name="add-circle" size={22} color={THEME.colors.white} />
                <Text style={styles.registerButtonText}>Register Node</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Help Text */}
          <View style={styles.helpCard}>
            <Ionicons name="help-circle-outline" size={20} color={THEME.colors.primary} />
            <Text style={styles.helpText}>
              Need help setting up a node? Visit our documentation for step-by-step guides.
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  backButton: { 
    padding: THEME.spacing.xs,
  },
  headerTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
  },
  scrollView: { flex: 1 },
  infoCard: {
    backgroundColor: THEME.colors.white,
    margin: THEME.spacing.md,
    padding: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.large,
    alignItems: 'center',
    ...THEME.shadows.medium,
  },
  infoIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  infoTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  infoText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: THEME.colors.white,
    marginHorizontal: THEME.spacing.md,
    padding: THEME.spacing.lg,
    borderRadius: THEME.borderRadius.large,
    ...THEME.shadows.small,
  },
  formTitle: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.lg,
  },
  label: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.xs,
    marginTop: THEME.spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.medium,
    backgroundColor: THEME.colors.background,
  },
  inputIcon: {
    paddingLeft: THEME.spacing.md,
  },
  input: {
    flex: 1,
    padding: THEME.spacing.md,
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
  },
  requirements: {
    marginTop: THEME.spacing.xl,
    padding: THEME.spacing.md,
    backgroundColor: '#F0FDF4',
    borderRadius: THEME.borderRadius.medium,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  requirementsTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.bold as any,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
    gap: THEME.spacing.sm,
  },
  requirementText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    flex: 1,
  },
  registerButton: {
    backgroundColor: THEME.colors.primary,
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: THEME.spacing.sm,
    ...THEME.shadows.small,
  },
  buttonDisabled: { 
    opacity: 0.6,
  },
  registerButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold as any,
  },
  helpCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.primaryLight,
    borderRadius: THEME.borderRadius.medium,
    gap: THEME.spacing.sm,
  },
  helpText: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.primary,
    lineHeight: 20,
  },
});