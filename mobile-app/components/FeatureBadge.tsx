/**
 * Feature Badge Component
 * Shows feature status (Live, Coming Soon, Beta, etc.)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '@/constants/theme';

type BadgeType = 'live' | 'beta' | 'coming-soon' | 'testnet' | 'devnet';

interface FeatureBadgeProps {
  type: BadgeType;
  size?: 'small' | 'medium';
}

export function FeatureBadge({ type, size = 'small' }: FeatureBadgeProps) {
  const config = getBadgeConfig(type);
  const isSmall = size === 'small';
  
  return (
    <View style={[
      styles.badge,
      { backgroundColor: config.bgColor },
      isSmall ? styles.badgeSmall : styles.badgeMedium,
    ]}>
      <Ionicons 
        name={config.icon as any} 
        size={isSmall ? 10 : 12} 
        color={config.textColor} 
      />
      <Text style={[
        styles.badgeText,
        { color: config.textColor },
        isSmall ? styles.textSmall : styles.textMedium,
      ]}>
        {config.label}
      </Text>
    </View>
  );
}

function getBadgeConfig(type: BadgeType) {
  switch (type) {
    case 'live':
      return {
        label: 'Live',
        icon: 'checkmark-circle',
        bgColor: THEME.colors.successBg,
        textColor: THEME.colors.success,
      };
    case 'beta':
      return {
        label: 'Beta',
        icon: 'flask',
        bgColor: '#FFF3E0',
        textColor: '#F57C00',
      };
    case 'coming-soon':
      return {
        label: 'Coming Soon',
        icon: 'time',
        bgColor: THEME.colors.lightGrey,
        textColor: THEME.colors.textMuted,
      };
    case 'testnet':
      return {
        label: 'Testnet',
        icon: 'construct',
        bgColor: '#E3F2FD',
        textColor: '#1976D2',
      };
  }
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: THEME.borderRadius.full,
    gap: 4,
  },
  badgeSmall: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 2,
  },
  badgeMedium: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
  },
  badgeText: {
    fontWeight: THEME.fontWeight.medium,
  },
  textSmall: {
    fontSize: THEME.fontSize.xs,
  },
  textMedium: {
    fontSize: THEME.fontSize.sm,
  },
});

export default FeatureBadge;
