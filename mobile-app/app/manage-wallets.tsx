/**
 * Manage Wallets Screen
 * View, switch, and manage multiple wallets
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { multiWalletService, SavedWallet } from '@/services/multiWallet';
import { useWallet } from '@/context/WalletContext';
import { truncateAddress } from '@/utils/address';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function ManageWalletsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet, switchWallet } = useWallet();
  
  const [wallets, setWallets] = useState<SavedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Edit name modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingWallet, setEditingWallet] = useState<SavedWallet | null>(null);
  const [newName, setNewName] = useState('');

  // Load wallets
  const loadWallets = useCallback(async () => {
    setLoading(true);
    try {
      const savedWallets = await multiWalletService.getSavedWallets();
      setWallets(savedWallets);
    } catch (error) {
      console.error('[ManageWallets] Load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on focus
  useFocusEffect(
    useCallback(() => {
      loadWallets();
    }, [loadWallets])
  );

  // Switch to wallet
  const handleSwitchWallet = async (selectedWallet: SavedWallet) => {
    if (selectedWallet.address === wallet?.address) {
      Alert.alert('Info', 'This wallet is already active');
      return;
    }

    Alert.alert(
      'Switch Wallet',
      `Switch to ${selectedWallet.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            try {
              // For dev accounts, we can switch directly
              if (selectedWallet.type === 'dev') {
                await switchWallet(selectedWallet.address, selectedWallet.name);
                await multiWalletService.setActiveWallet(selectedWallet.address);
                router.back();
              } else {
                // For custom wallets, would need to re-import with mnemonic
                Alert.alert(
                  'Re-import Required',
                  'To switch to a custom wallet, please import it again using your mnemonic phrase.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Import', onPress: () => router.push('/import-wallet') },
                  ]
                );
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to switch wallet');
            }
          },
        },
      ]
    );
  };

  // Edit wallet name
  const handleEditName = (walletToEdit: SavedWallet) => {
    setEditingWallet(walletToEdit);
    setNewName(walletToEdit.name);
    setEditModalVisible(true);
  };

  // Save new name
  const handleSaveName = async () => {
    if (!editingWallet || !newName.trim()) return;

    try {
      await multiWalletService.updateWalletName(editingWallet.address, newName.trim());
      setEditModalVisible(false);
      await loadWallets();
    } catch (error) {
      Alert.alert('Error', 'Failed to update wallet name');
    }
  };

  // Delete wallet
  const handleDeleteWallet = (walletToDelete: SavedWallet) => {
    if (walletToDelete.address === wallet?.address) {
      Alert.alert('Error', 'Cannot delete the active wallet');
      return;
    }

    Alert.alert(
      'Delete Wallet',
      `Remove "${walletToDelete.name}" from your saved wallets?\n\nThis only removes the wallet from this list. Your funds are safe on the blockchain.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await multiWalletService.removeWallet(walletToDelete.address);
              await loadWallets();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove wallet');
            }
          },
        },
      ]
    );
  };

  // Get wallet type badge
  const getTypeBadge = (type: SavedWallet['type']) => {
    switch (type) {
      case 'dev':
        return { label: 'DEV', color: '#9C27B0' };
      case 'imported':
        return { label: 'IMPORTED', color: '#2196F3' };
      default:
        return { label: 'CUSTOM', color: '#4CAF50' };
    }
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Render wallet item
  const renderWallet = ({ item }: { item: SavedWallet }) => {
    const isActive = item.address === wallet?.address;
    const badge = getTypeBadge(item.type);

    return (
      <TouchableOpacity
        style={[styles.walletItem, isActive && styles.activeWalletItem]}
        onPress={() => handleSwitchWallet(item)}
      >
        <View style={styles.walletIcon}>
          <Ionicons 
            name="wallet" 
            size={24} 
            color={isActive ? THEME.colors.primary : THEME.colors.textSecondary} 
          />
        </View>
        
        <View style={styles.walletInfo}>
          <View style={styles.walletNameRow}>
            <Text style={[styles.walletName, isActive && styles.activeWalletName]}>
              {item.name}
            </Text>
            {isActive && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>ACTIVE</Text>
              </View>
            )}
            <View style={[styles.typeBadge, { backgroundColor: `${badge.color}20` }]}>
              <Text style={[styles.typeBadgeText, { color: badge.color }]}>
                {badge.label}
              </Text>
            </View>
          </View>
          <Text style={styles.walletAddress}>
            {truncateAddress(item.address, 8)}
          </Text>
          <Text style={styles.walletDate}>
            Added {formatDate(item.importedAt)}
          </Text>
        </View>

        <View style={styles.walletActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleEditName(item)}
          >
            <Ionicons name="pencil" size={18} color={THEME.colors.textSecondary} />
          </TouchableOpacity>
          {!isActive && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleDeleteWallet(item)}
            >
              <Ionicons name="trash-outline" size={18} color={THEME.colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
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
        <Text style={styles.headerTitle}>Manage Wallets</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            Alert.alert(
              'Add Wallet',
              'How would you like to add a wallet?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Create New', onPress: () => router.push('/create-wallet') },
                { text: 'Import', onPress: () => router.push('/import-wallet') },
              ]
            );
          }}
        >
          <Ionicons name="add" size={24} color={THEME.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Wallet Count */}
      <View style={styles.countBar}>
        <Ionicons name="wallet-outline" size={16} color={THEME.colors.textSecondary} />
        <Text style={styles.countText}>
          {wallets.length} wallet{wallets.length !== 1 ? 's' : ''} saved
        </Text>
      </View>

      {/* Wallet List */}
      {wallets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="wallet-outline" size={64} color={THEME.colors.textMuted} />
          <Text style={styles.emptyTitle}>No Saved Wallets</Text>
          <Text style={styles.emptySubtitle}>
            Create or import a wallet to get started
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/create-wallet')}
          >
            <Text style={styles.createButtonText}>Create Wallet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={wallets}
          keyExtractor={(item) => item.address}
          renderItem={renderWallet}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: THEME.spacing.md }} />}
        />
      )}

      {/* Edit Name Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rename Wallet</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Wallet name"
              placeholderTextColor={THEME.colors.textMuted}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleSaveName}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  backButton: {
    padding: THEME.spacing.xs,
  },
  headerTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  addButton: {
    padding: THEME.spacing.xs,
  },
  countBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: THEME.spacing.sm,
    gap: THEME.spacing.xs,
  },
  countText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  listContent: {
    padding: THEME.spacing.md,
    paddingBottom: 100,
  },
  walletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  activeWalletItem: {
    borderWidth: 2,
    borderColor: THEME.colors.primary,
  },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  walletInfo: {
    flex: 1,
  },
  walletNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: THEME.spacing.xs,
  },
  walletName: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  activeWalletName: {
    color: THEME.colors.primary,
  },
  activeBadge: {
    backgroundColor: THEME.colors.primaryLight,
    paddingHorizontal: THEME.spacing.xs,
    paddingVertical: 2,
    borderRadius: THEME.borderRadius.small,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.primary,
  },
  typeBadge: {
    paddingHorizontal: THEME.spacing.xs,
    paddingVertical: 2,
    borderRadius: THEME.borderRadius.small,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: THEME.fontWeight.bold,
  },
  walletAddress: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    fontFamily: 'monospace',
    marginTop: THEME.spacing.xs,
  },
  walletDate: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
    marginTop: THEME.spacing.xs,
  },
  walletActions: {
    flexDirection: 'row',
    gap: THEME.spacing.xs,
  },
  actionButton: {
    padding: THEME.spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  emptyTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
    marginTop: THEME.spacing.md,
  },
  emptySubtitle: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: THEME.spacing.sm,
    marginBottom: THEME.spacing.lg,
  },
  createButton: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.full,
  },
  createButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.lg,
  },
  modalContent: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.large,
    padding: THEME.spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    fontSize: THEME.fontSize.base,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: THEME.spacing.md,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    borderWidth: 1,
    borderColor: THEME.colors.grey,
  },
  modalCancelText: {
    textAlign: 'center',
    color: THEME.colors.textSecondary,
    fontWeight: THEME.fontWeight.medium,
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: THEME.colors.primary,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
  },
  modalSaveText: {
    textAlign: 'center',
    color: THEME.colors.white,
    fontWeight: THEME.fontWeight.semibold,
  },
});
