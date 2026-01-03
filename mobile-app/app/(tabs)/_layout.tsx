/**
 * Tab Layout - Clean 4-tab navigation matching mockup design
 * Tabs: Home, Wallet, Trade, Power
 * Fixed: Safe area padding for Android navigation buttons
 */

import { Tabs } from 'expo-router';
import React from 'react';
import { View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '@/constants/theme';

// Tab icon components defined outside render to avoid recreating on each render
const TabIndicator = () => (
  <View
    style={{
      position: 'absolute',
      top: -8,
      width: 40,
      height: 3,
      backgroundColor: THEME.colors.primary,
      borderRadius: 2,
    }}
  />
);

const renderTabIcon = (iconName: keyof typeof Ionicons.glyphMap, iconNameOutline: keyof typeof Ionicons.glyphMap) => 
  ({ color, focused }: { color: string; focused: boolean }) => (
    <View style={{ alignItems: 'center' }}>
      {focused && <TabIndicator />}
      <Ionicons
        name={focused ? iconName : iconNameOutline}
        size={24}
        color={color}
      />
    </View>
  );

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  
  // For Android: Use a large minimum bottom padding to clear system navigation
  // Android gesture nav bar is typically 48px, button nav is ~56px
  // Using 56px minimum ensures compatibility with all Android devices
  const ANDROID_NAV_BAR_HEIGHT = 56;
  
  const bottomPadding = Platform.OS === 'ios' 
    ? Math.max(insets.bottom, 20) 
    : Math.max(insets.bottom, ANDROID_NAV_BAR_HEIGHT);
  
  // Base tab content height (icons + labels + padding)
  const TAB_CONTENT_HEIGHT = 56;
  const tabBarHeight = TAB_CONTENT_HEIGHT + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: true,
        tabBarActiveTintColor: THEME.colors.primary,
        tabBarInactiveTintColor: THEME.colors.textMuted,
        tabBarStyle: {
          backgroundColor: THEME.colors.white,
          borderTopWidth: 1,
          borderTopColor: THEME.colors.border,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          // Ensure the tab bar sits above the system navigation
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginBottom: Platform.OS === 'android' ? 4 : 0,
        },
        headerShown: false,
        // Add safe area for tab content
        tabBarHideOnKeyboard: true,
      }}
    >
      {/* Home Tab */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: renderTabIcon('home', 'home-outline'),
        }}
      />

      {/* Wallet Tab */}
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: renderTabIcon('wallet', 'wallet-outline'),
        }}
      />

      {/* Trade Tab */}
      <Tabs.Screen
        name="trade"
        options={{
          title: 'Trade',
          tabBarIcon: renderTabIcon('swap-vertical', 'swap-vertical-outline'),
        }}
      />
    </Tabs>
  );
}
