/**
 * Mock View Banner Component
 * Displays a prominent banner indicating the screen is non-functional
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME } from '../constants/theme';

const DISMISSED_KEY_PREFIX = 'mock_banner_dismissed_';

interface MockViewBannerProps {
  screenId: string; // Unique identifier for this screen
  featureName?: string; // e.g., "Trading", "Staking", "Bridge"
}

export function MockViewBanner({ screenId, featureName }: MockViewBannerProps) {
  const [isDismissed, setIsDismissed] = useState(true); // Start hidden to prevent flash
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Check if banner was previously dismissed
    const checkDismissed = async () => {
      try {
        const dismissed = await AsyncStorage.getItem(`${DISMISSED_KEY_PREFIX}${screenId}`);
        setIsDismissed(dismissed === 'true');
      } catch (error) {
        console.error('[MockBanner] Error checking dismissed state:', error);
        setIsDismissed(false);
      } finally {
        setLoaded(true);
      }
    };
    checkDismissed();
  }, [screenId]);

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(`${DISMISSED_KEY_PREFIX}${screenId}`, 'true');
      setIsDismissed(true);
    } catch (error) {
      console.error('[MockBanner] Error saving dismissed state:', error);
    }
  };

  // Don't render until we've checked storage
  if (!loaded || isDismissed) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.emoji}>🚧</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>
            Mock View{featureName ? ` - ${featureName}` : ''}
          </Text>
          <Text style={styles.subtitle}>
            This interface is non-functional. Real functionality in development.
          </Text>
        </View>
        <TouchableOpacity onPress={handleDismiss} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="#E65100" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Reset all dismissed banners (useful for testing)
 */
export async function resetMockBanners() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const bannerKeys = keys.filter(key => key.startsWith(DISMISSED_KEY_PREFIX));
    await AsyncStorage.multiRemove(bannerKeys);
  } catch (error) {
    console.error('[MockBanner] Error resetting banners:', error);
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF3E0',
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: THEME.spacing.sm,
  },
  emoji: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.semibold,
    color: '#E65100',
  },
  subtitle: {
    fontSize: THEME.fontSize.xs,
    color: '#F57C00',
    marginTop: 2,
  },
  closeButton: {
    padding: THEME.spacing.xs,
    marginLeft: THEME.spacing.sm,
  },
});

export default MockViewBanner;
