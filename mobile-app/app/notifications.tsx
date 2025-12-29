/**
 * Notifications Screen
 * Displays notification history with actions
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationService, StoredNotification } from '@/services/notifications';
import { THEME, GRADIENTS } from '@/constants/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    try {
      const history = await notificationService.getHistory();
      setNotifications(history);
    } catch (error) {
      console.error('[Notifications] Load error:', error);
    }
  }, []);

  // Load on focus
  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  // Mark all as read
  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead();
    await loadNotifications();
  };

  // Clear all
  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to delete all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await notificationService.clearHistory();
            setNotifications([]);
          },
        },
      ]
    );
  };

  // Delete single notification
  const handleDelete = async (id: string) => {
    await notificationService.deleteNotification(id);
    await loadNotifications();
  };

  // Mark single as read
  const handleMarkRead = async (id: string) => {
    await notificationService.markAsRead(id);
    await loadNotifications();
  };

  // Get icon for notification type
  const getNotificationIcon = (type: StoredNotification['type']) => {
    switch (type) {
      case 'tx_sent':
        return { name: 'arrow-up-circle', color: '#FFA726' };
      case 'tx_confirmed':
        return { name: 'checkmark-circle', color: THEME.colors.success };
      case 'tx_received':
        return { name: 'arrow-down-circle', color: THEME.colors.success };
      case 'tx_failed':
        return { name: 'close-circle', color: THEME.colors.error };
      default:
        return { name: 'information-circle', color: THEME.colors.primary };
    }
  };

  // Format relative time
  const getRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Render notification item
  const renderNotification = ({ item }: { item: StoredNotification }) => {
    const icon = getNotificationIcon(item.type);
    
    return (
      <TouchableOpacity
        style={[styles.notificationItem, !item.read && styles.unreadItem]}
        onPress={() => handleMarkRead(item.id)}
        onLongPress={() => {
          Alert.alert(
            'Delete Notification',
            'Remove this notification?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item.id) },
            ]
          );
        }}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${icon.color}20` }]}>
          <Ionicons name={icon.name as any} size={24} color={icon.color} />
        </View>
        
        <View style={styles.contentContainer}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, !item.read && styles.unreadTitle]}>
              {item.title}
            </Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.body} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.time}>
            {getRelativeTime(item.timestamp)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const unreadCount = notifications.filter(n => !n.read).length;

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
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
          <Ionicons name="trash-outline" size={20} color={THEME.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Actions Bar */}
      {notifications.length > 0 && unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllButton} onPress={handleMarkAllRead}>
          <Ionicons name="checkmark-done" size={18} color={THEME.colors.primary} />
          <Text style={styles.markAllText}>Mark all as read ({unreadCount})</Text>
        </TouchableOpacity>
      )}

      {/* Notification List */}
      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={64} color={THEME.colors.textMuted} />
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptySubtitle}>
            Transaction updates and alerts will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={THEME.colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
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
  clearButton: {
    padding: THEME.spacing.xs,
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: THEME.spacing.sm,
    backgroundColor: THEME.colors.primaryLight,
    marginHorizontal: THEME.spacing.md,
    borderRadius: THEME.borderRadius.medium,
    gap: THEME.spacing.xs,
  },
  markAllText: {
    color: THEME.colors.primary,
    fontSize: THEME.fontSize.sm,
    fontWeight: THEME.fontWeight.medium,
  },
  listContent: {
    padding: THEME.spacing.md,
    paddingBottom: 100,
  },
  notificationItem: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    padding: THEME.spacing.md,
    ...THEME.shadows.small,
  },
  unreadItem: {
    backgroundColor: '#F0F7FF',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: THEME.fontSize.base,
    fontWeight: THEME.fontWeight.medium,
    color: THEME.colors.text,
    flex: 1,
  },
  unreadTitle: {
    fontWeight: THEME.fontWeight.bold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.colors.primary,
    marginLeft: THEME.spacing.sm,
  },
  body: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.xs,
  },
  time: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textMuted,
    marginTop: THEME.spacing.xs,
  },
  separator: {
    height: THEME.spacing.sm,
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
  },
});
