/**
 * MEV Protection Toggle Component
 * Enterprise-grade toggle for MEV protection with info tooltip
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMEVProtection } from '@/hooks/useMEVProtection';
import { THEME } from '@/constants/theme';

interface MEVProtectionToggleProps {
  compact?: boolean;
  showLabel?: boolean;
}

export function MEVProtectionToggle({ 
  compact = false,
  showLabel = true 
}: MEVProtectionToggleProps) {
  const { isEnabled, isLoading, toggleProtection } = useMEVProtection();
  const [showInfo, setShowInfo] = useState(false);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <TouchableOpacity 
          style={styles.compactInfoButton}
          onPress={() => setShowInfo(true)}
        >
          <Ionicons 
            name="shield-checkmark" 
            size={16} 
            color={isEnabled ? THEME.colors.primary : THEME.colors.textMuted} 
          />
        </TouchableOpacity>
        <Switch
          value={isEnabled}
          onValueChange={toggleProtection}
          disabled={isLoading}
          trackColor={{ false: THEME.colors.lightGrey, true: THEME.colors.primaryLight }}
          thumbColor={isEnabled ? THEME.colors.primary : THEME.colors.textMuted}
          style={styles.compactSwitch}
        />
        <InfoModal visible={showInfo} onClose={() => setShowInfo(false)} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons 
              name="shield-checkmark" 
              size={24} 
              color={isEnabled ? THEME.colors.primary : THEME.colors.textMuted} 
            />
          </View>
          <View style={styles.textContainer}>
            {showLabel && (
              <View style={styles.titleRow}>
                <Text style={styles.title}>MEV Protection</Text>
                <TouchableOpacity onPress={() => setShowInfo(true)}>
                  <Ionicons 
                    name="information-circle-outline" 
                    size={18} 
                    color={THEME.colors.textSecondary} 
                  />
                </TouchableOpacity>
              </View>
            )}
            <Text style={[
              styles.status,
              { color: isEnabled ? THEME.colors.success : THEME.colors.textMuted }
            ]}>
              {isEnabled ? 'Protected' : 'Standard'}
            </Text>
          </View>
          <Switch
            value={isEnabled}
            onValueChange={toggleProtection}
            disabled={isLoading}
            trackColor={{ false: THEME.colors.lightGrey, true: THEME.colors.primaryLight }}
            thumbColor={isEnabled ? THEME.colors.primary : THEME.colors.textMuted}
          />
        </View>
        
        {isEnabled && (
          <View style={styles.protectedBadge}>
            <Ionicons name="lock-closed" size={12} color={THEME.colors.success} />
            <Text style={styles.protectedText}>
              Transactions encrypted before submission
            </Text>
          </View>
        )}
        
        {!isEnabled && (
          <View style={styles.warningBadge}>
            <Ionicons name="warning-outline" size={12} color={THEME.colors.warning} />
            <Text style={styles.warningText}>
              Transactions visible to MEV bots
            </Text>
          </View>
        )}
      </View>
      
      <InfoModal visible={showInfo} onClose={() => setShowInfo(false)} />
    </View>
  );
}

// Info Modal Component
function InfoModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.modalOverlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="shield-checkmark" size={32} color={THEME.colors.primary} />
            </View>
            <Text style={styles.modalTitle}>MEV Protection</Text>
          </View>
          
          <Text style={styles.modalDescription}>
            MEV (Maximal Extractable Value) protection prevents malicious actors from:
          </Text>
          
          <View style={styles.bulletList}>
            <BulletPoint text="Front-running your transactions" />
            <BulletPoint text="Sandwich attacks on your trades" />
            <BulletPoint text="Transaction reordering for profit" />
          </View>
          
          <Text style={styles.modalNote}>
            When enabled, your transactions are encrypted before submission to the mempool, 
            making it impossible for MEV bots to extract value from your trades.
          </Text>
          
          <TouchableOpacity style={styles.modalButton} onPress={onClose}>
            <Text style={styles.modalButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function BulletPoint({ text }: { text: string }) {
  return (
    <View style={styles.bulletItem}>
      <View style={styles.bullet} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: THEME.spacing.sm,
  },
  card: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
  },
  title: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
    color: THEME.colors.text,
  },
  status: {
    fontSize: THEME.fontSize.sm,
    marginTop: 2,
  },
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.successBg,
    borderRadius: THEME.borderRadius.small,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    marginTop: THEME.spacing.md,
    gap: THEME.spacing.xs,
  },
  protectedText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.success,
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.warningBg,
    borderRadius: THEME.borderRadius.small,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    marginTop: THEME.spacing.md,
    gap: THEME.spacing.xs,
  },
  warningText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.warning,
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactInfoButton: {
    marginRight: THEME.spacing.xs,
  },
  compactSwitch: {
    transform: [{ scale: 0.8 }],
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
    padding: THEME.spacing.xl,
    width: '100%',
    maxWidth: 340,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  modalTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: THEME.fontWeight.bold,
    color: THEME.colors.text,
  },
  modalDescription: {
    fontSize: THEME.fontSize.base,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.md,
    lineHeight: 22,
  },
  bulletList: {
    marginBottom: THEME.spacing.md,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.colors.primary,
    marginRight: THEME.spacing.sm,
  },
  bulletText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.text,
  },
  modalNote: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: THEME.spacing.lg,
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.full,
    paddingVertical: THEME.spacing.md,
    alignItems: 'center',
  },
  modalButtonText: {
    color: THEME.colors.white,
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.semibold,
  },
});

export default MEVProtectionToggle;
