/**
 * Token Selector Component
 * Reusable dropdown for selecting tokens in swap/bridge interfaces
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TokenInfo } from '@/services/pdex';
import { THEME } from '@/constants/theme';

interface TokenSelectorProps {
  selectedToken: TokenInfo;
  tokens: TokenInfo[];
  onSelectToken: (token: TokenInfo) => void;
  label?: string;
  showBalance?: boolean;
  disabled?: boolean;
}

export function TokenSelector({
  selectedToken,
  tokens,
  onSelectToken,
  label,
  showBalance = true,
  disabled = false,
}: TokenSelectorProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const handleSelectToken = (token: TokenInfo) => {
    onSelectToken(token);
    setModalVisible(false);
  };

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <TouchableOpacity
        style={[styles.selector, disabled && styles.selectorDisabled]}
        onPress={() => !disabled && setModalVisible(true)}
        disabled={disabled}
      >
        <View style={styles.tokenInfo}>
          <View style={[styles.tokenIcon, { backgroundColor: selectedToken.color }]}>
            <Text style={styles.tokenIconText}>
              {selectedToken.symbol.charAt(0)}
            </Text>
          </View>
          <View>
            <Text style={styles.tokenSymbol}>{selectedToken.symbol}</Text>
            {showBalance && (
              <Text style={styles.tokenBalance}>{selectedToken.balance}</Text>
            )}
          </View>
        </View>
        <Ionicons 
          name="chevron-down" 
          size={20} 
          color={disabled ? THEME.colors.textMuted : THEME.colors.text} 
        />
      </TouchableOpacity>

      {/* Token Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={THEME.colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={tokens}
              keyExtractor={(item) => item.symbol}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.tokenItem,
                    item.symbol === selectedToken.symbol && styles.tokenItemSelected,
                  ]}
                  onPress={() => handleSelectToken(item)}
                >
                  <View style={styles.tokenItemLeft}>
                    <View style={[styles.tokenIcon, { backgroundColor: item.color }]}>
                      <Text style={styles.tokenIconText}>
                        {item.symbol.charAt(0)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.tokenItemSymbol}>{item.symbol}</Text>
                      <Text style={styles.tokenItemName}>{item.name}</Text>
                    </View>
                  </View>
                  <Text style={styles.tokenItemBalance}>{item.balance}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.lightGrey,
    borderRadius: THEME.borderRadius.medium,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
  },
  selectorDisabled: {
    opacity: 0.5,
  },
  tokenInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.sm,
  },
  tokenIconText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.bold,
  },
  tokenSymbol: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  tokenBalance: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: THEME.colors.background,
    borderTopLeftRadius: THEME.borderRadius.large,
    borderTopRightRadius: THEME.borderRadius.large,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: THEME.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
  },
  tokenItemSelected: {
    backgroundColor: THEME.colors.primaryLight,
  },
  tokenItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenItemSymbol: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  tokenItemName: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  tokenItemBalance: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  separator: {
    height: 1,
    backgroundColor: THEME.colors.border,
  },
});

export default TokenSelector;
