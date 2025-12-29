/**
 * Chain Selector Component
 * Reusable dropdown for selecting blockchain networks in bridge interface
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
import { ChainInfo } from '@/services/bridge';
import { THEME } from '@/constants/theme';

interface ChainSelectorProps {
  selectedChain: ChainInfo;
  chains: ChainInfo[];
  onSelectChain: (chain: ChainInfo) => void;
  label?: string;
  disabled?: boolean;
}

export function ChainSelector({
  selectedChain,
  chains,
  onSelectChain,
  label,
  disabled = false,
}: ChainSelectorProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const handleSelectChain = (chain: ChainInfo) => {
    if (chain.enabled) {
      onSelectChain(chain);
      setModalVisible(false);
    }
  };

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <TouchableOpacity
        style={[styles.selector, disabled && styles.selectorDisabled]}
        onPress={() => !disabled && setModalVisible(true)}
        disabled={disabled}
      >
        <View style={styles.chainInfo}>
          <View style={[styles.chainIcon, { backgroundColor: selectedChain.color }]}>
            <Text style={styles.chainIconText}>{selectedChain.icon}</Text>
          </View>
          <Text style={styles.chainName}>{selectedChain.name}</Text>
        </View>
        <Ionicons 
          name="chevron-down" 
          size={20} 
          color={disabled ? THEME.colors.textMuted : THEME.colors.text} 
        />
      </TouchableOpacity>

      {/* Chain Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Network</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={THEME.colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={chains}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.chainItem,
                    item.id === selectedChain.id && styles.chainItemSelected,
                    !item.enabled && styles.chainItemDisabled,
                  ]}
                  onPress={() => handleSelectChain(item)}
                  disabled={!item.enabled}
                >
                  <View style={styles.chainItemLeft}>
                    <View style={[styles.chainIcon, { backgroundColor: item.color }]}>
                      <Text style={styles.chainIconText}>{item.icon}</Text>
                    </View>
                    <View>
                      <Text style={[
                        styles.chainItemName,
                        !item.enabled && styles.chainItemNameDisabled,
                      ]}>
                        {item.name}
                      </Text>
                      <Text style={styles.chainItemToken}>
                        Native: {item.nativeToken}
                      </Text>
                    </View>
                  </View>
                  {!item.enabled && (
                    <View style={styles.comingSoonBadge}>
                      <Text style={styles.comingSoonText}>Soon</Text>
                    </View>
                  )}
                  {item.id === selectedChain.id && item.enabled && (
                    <Ionicons name="checkmark" size={20} color={THEME.colors.primary} />
                  )}
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
  chainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chainIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.sm,
  },
  chainIconText: {
    fontSize: THEME.fontSize.lg,
  },
  chainName: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
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
    maxHeight: '60%',
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
  chainItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
  },
  chainItemSelected: {
    backgroundColor: THEME.colors.primaryLight,
  },
  chainItemDisabled: {
    opacity: 0.5,
  },
  chainItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chainItemName: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  chainItemNameDisabled: {
    color: THEME.colors.textMuted,
  },
  chainItemToken: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  comingSoonBadge: {
    backgroundColor: THEME.colors.lightGrey,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.small,
  },
  comingSoonText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
    fontWeight: THEME.fontWeight.medium,
  },
  separator: {
    height: 1,
    backgroundColor: THEME.colors.border,
  },
});

export default ChainSelector;
