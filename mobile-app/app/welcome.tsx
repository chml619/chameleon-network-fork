/**
 * Welcome Screen - Onboarding entry point
 * Matches mockup design: chmlwallet-mockup-001.jpg
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={GRADIENTS.background.colors}
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={styles.content}>
        {/* Logo */}
        <Image
          source={require('@/assets/images/Logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Title */}
        <Text style={styles.title}>Welcome to</Text>
        <Text style={styles.titleBrand}>Chameleon Network</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Send, receive, and trade crypto — privately
        </Text>
      </View>

      {/* Get Started Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.getStartedButton}
          onPress={() => router.push('/setup' as any)}
        >
          <Text style={styles.getStartedButtonText}>Get started</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.xl,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: THEME.spacing.xl,
  },
  title: {
    fontSize: THEME.fontSize['3xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    textAlign: 'center',
  },
  titleBrand: {
    fontSize: THEME.fontSize['3xl'],
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    textAlign: 'center',
    marginBottom: THEME.spacing.md,
  },
  subtitle: {
    fontSize: THEME.fontSize.lg,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
  buttonContainer: {
    paddingHorizontal: THEME.spacing.lg,
    paddingBottom: THEME.spacing.xl,
  },
  getStartedButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    alignItems: 'center',
  },
  getStartedButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.semibold,
  },
});
