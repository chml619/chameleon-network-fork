// Crypto polyfill - MUST be first import for transaction signing
import 'react-native-get-random-values';

/**
 * Root Layout with onboarding flow support
 * Fixed: Added SafeAreaProvider for proper safe area insets on Android
 * Fixed: Added blockchain connection initialization on app load
 * Fixed: Added crypto polyfill for transaction signing
 * Added: Notification service initialization
 */

import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import "@/global.css";
import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WalletProvider } from '@/context/WalletContext';
import { apiService } from '@/services/api';
import { notificationService } from '@/services/notifications';
import { THEME } from '@/constants/theme';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Custom light theme for navigation
const ChameleonLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: THEME.colors.primary,
    background: THEME.colors.background,
    card: THEME.colors.card,
    text: THEME.colors.text,
    border: THEME.colors.border,
    notification: THEME.colors.primary,
  },
};

export default function RootLayout() {
  const [loaded] = useFonts({
    Poppins: require('../assets/fonts/Poppins/Poppins-Regular.ttf'),
  });

  // Initialize blockchain connection on app load
  useEffect(() => {
    console.log('[App] Initializing blockchain connection...');
    apiService.connect()
      .then(() => console.log('[App] Blockchain connected successfully'))
      .catch((error) => console.error('[App] Blockchain connection failed:', error));
    
    return () => {
      console.log('[App] Disconnecting from blockchain...');
      apiService.disconnect();
    };
  }, []);

  // Initialize notification service
  useEffect(() => {
    console.log('[App] Initializing notification service...');
    notificationService.initialize()
      .then((success) => console.log('[App] Notification service initialized:', success))
      .catch((error) => console.error('[App] Notification init error:', error));
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <GluestackUIProvider mode="light">
        <ThemeProvider value={ChameleonLightTheme}>
          <WalletProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="welcome" />
              <Stack.Screen name="setup" />
              <Stack.Screen name="create-wallet" />
              <Stack.Screen name="import-wallet" />
              <Stack.Screen name="send" />
              <Stack.Screen name="receive" />
              <Stack.Screen name="staking" />
              <Stack.Screen name="bridge" />
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style="dark" />
          </WalletProvider>
        </ThemeProvider>
      </GluestackUIProvider>
    </SafeAreaProvider>
  );
}
