/**
 * DEVNET indicator component with connection status
 * Updated for new light theme design
 * Sky blue dot = connected, Orange = connecting, Red = disconnected
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApi } from '../hooks/useApi';
import { NETWORK_CONFIG } from '../config/network';
import { THEME } from '../constants/theme';

// Status dot colors
const CONNECTED_SKY_BLUE = '#38BDF8';
const CONNECTING_ORANGE = '#FFA726';
const DISCONNECTED_RED = '#EF5350';

// Badge colors - Light gray theme for better readability
const BADGE_BG = '#F5F5F5';
const BADGE_TEXT = '#424242';
const BADGE_BORDER = '#E0E0E0';

interface NetworkBadgeProps {
  size?: 'small' | 'medium' | 'large';
  showConnectionStatus?: boolean;
  style?: any;
}

export function NetworkBadge({ 
  size = 'medium', 
  showConnectionStatus = false,
  style 
}: NetworkBadgeProps) {
  const { isConnected, isConnecting, connectionState } = useApi();

  // Debug: Log badge state
  useEffect(() => {
    console.log('[NetworkBadge] ====== BADGE STATE ======');
    console.log('[NetworkBadge] isConnected:', isConnected);
    console.log('[NetworkBadge] isConnecting:', isConnecting);
    console.log('[NetworkBadge] connectionState.status:', connectionState.status);
    console.log('[NetworkBadge] connectionState.error:', connectionState.error);
    console.log('[NetworkBadge] connectionState.blockNumber:', connectionState.blockNumber);
  }, [isConnected, isConnecting, connectionState]);

  const getConnectionColor = () => {
    const color = isConnecting 
      ? CONNECTING_ORANGE       // Orange - connecting
      : isConnected 
        ? CONNECTED_SKY_BLUE    // Sky blue - connected
        : DISCONNECTED_RED;     // Red - disconnected
    
    console.log('[NetworkBadge] Badge color:', color, '(connecting:', isConnecting, ', connected:', isConnected, ')');
    return color;
  };

  const getStatusLabel = () => {
    if (isConnecting) return 'Connecting...';
    if (isConnected) return 'Connected';
    return connectionState.error ? `Error: ${connectionState.error}` : 'Offline';
  };

  const badgeStyle = [
    styles.badge,
    size === 'small' && styles.badgeSmall,
    size === 'large' && styles.badgeLarge,
    style,
  ];

  const textStyle = [
    styles.badgeText,
    size === 'small' && styles.badgeTextSmall,
    size === 'large' && styles.badgeTextLarge,
  ];

  return (
    <View style={badgeStyle}>
      <Text style={textStyle}>
        {NETWORK_CONFIG.isTestnet ? 'DEVNET' : NETWORK_CONFIG.name}
      </Text>
      
      {showConnectionStatus && (
        <>
          <View style={styles.separator} />
          <View style={[styles.statusDot, { backgroundColor: getConnectionColor() }]} />
          {connectionState.error && size !== 'small' && (
            <Text style={styles.errorText} numberOfLines={1}>!</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BADGE_BG,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.full,
    borderWidth: 1,
    borderColor: BADGE_BORDER,
  },
  badgeSmall: {
    paddingHorizontal: THEME.spacing.xs,
    paddingVertical: 2,
  },
  badgeLarge: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
  },
  badgeText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: THEME.fontWeight.bold,
    color: BADGE_TEXT,
  },
  badgeTextSmall: {
    fontSize: 10,
  },
  badgeTextLarge: {
    fontSize: THEME.fontSize.sm,
  },
  separator: {
    width: 1,
    height: 12,
    backgroundColor: BADGE_BORDER,
    marginHorizontal: THEME.spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  errorText: {
    fontSize: 10,
    fontWeight: 'bold' as const,
    color: DISCONNECTED_RED,
    marginLeft: 2,
  },
});

/**
 * Compact version for headers
 */
export function NetworkBadgeCompact() {
  return (
    <NetworkBadge 
      size="small" 
      showConnectionStatus={false}
    />
  );
}
