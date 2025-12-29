/**
 * MEV Protection Hook
 * Manages MEV protection state and operations
 */

import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mevService, MEVProtectionConfig } from '@/services/mev';

const MEV_STORAGE_KEY = '@chameleon/mev_protection';

export function useMEVProtection() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [config] = useState<MEVProtectionConfig>(mevService.getConfig());

  // Load saved preference
  useEffect(() => {
    loadSavedPreference();
  }, []);

  const loadSavedPreference = async () => {
    try {
      const saved = await AsyncStorage.getItem(MEV_STORAGE_KEY);
      if (saved !== null) {
        const enabled = JSON.parse(saved);
        // Validate the saved value is a boolean
        if (typeof enabled === 'boolean') {
          setIsEnabled(enabled);
          mevService.setEnabled(enabled);
        } else {
          // Invalid data, reset to default
          console.warn('[MEV Hook] Invalid saved preference, using default');
          await AsyncStorage.removeItem(MEV_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('[MEV Hook] Error loading preference:', error);
      // On error, ensure we have a valid state
      setIsEnabled(true); // Default to enabled for security
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProtection = useCallback(async () => {
    try {
      const newValue = !isEnabled;
      setIsEnabled(newValue);
      mevService.setEnabled(newValue);
      await AsyncStorage.setItem(MEV_STORAGE_KEY, JSON.stringify(newValue));
    } catch (error) {
      console.error('[MEV Hook] Error saving preference:', error);
      // Revert state on storage failure
      setIsEnabled(isEnabled);
      mevService.setEnabled(isEnabled);
    }
  }, [isEnabled]);

  const setProtection = useCallback(async (enabled: boolean) => {
    const previousValue = isEnabled;
    try {
      setIsEnabled(enabled);
      mevService.setEnabled(enabled);
      await AsyncStorage.setItem(MEV_STORAGE_KEY, JSON.stringify(enabled));
    } catch (error) {
      console.error('[MEV Hook] Error saving preference:', error);
      // Revert state on storage failure
      setIsEnabled(previousValue);
      mevService.setEnabled(previousValue);
    }
  }, [isEnabled]);

  return {
    isEnabled,
    isLoading,
    config,
    toggleProtection,
    setProtection,
  };
}
