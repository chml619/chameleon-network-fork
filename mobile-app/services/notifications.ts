/**
 * Notification Service
 * Handles local notifications and notification history
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const NOTIFICATION_HISTORY_KEY = 'notification_history';
const MAX_NOTIFICATIONS = 100;

export interface StoredNotification {
  id: string;
  title: string;
  body: string;
  type: 'tx_sent' | 'tx_confirmed' | 'tx_received' | 'tx_failed' | 'info';
  timestamp: number;
  read: boolean;
  data?: {
    txHash?: string;
    amount?: string;
    address?: string;
    blockNumber?: number;
  };
}

class NotificationService {
  private static instance: NotificationService;
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize notification service
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('[Notifications] Permission not granted');
        return false;
      }

      // Configure Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('transactions', {
          name: 'Transactions',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1B5E20',
        });
      }

      this.initialized = true;
      console.log('[Notifications] Service initialized');
      return true;
    } catch (error) {
      console.error('[Notifications] Init error:', error);
      return false;
    }
  }

  /**
   * Send a local notification
   */
  private async sendNotification(
    title: string,
    body: string,
    type: StoredNotification['type'],
    data?: StoredNotification['data']
  ): Promise<string> {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Schedule immediate notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { id, type, ...data },
          sound: true,
        },
        trigger: null, // Immediate
      });

      // Save to history
      await this.saveToHistory({
        id,
        title,
        body,
        type,
        timestamp: Date.now(),
        read: false,
        data,
      });

      console.log('[Notifications] Sent:', title);
      return id;
    } catch (error) {
      console.error('[Notifications] Send error:', error);
      throw error;
    }
  }

  /**
   * Transaction submitted notification
   */
  public async notifyTransactionSent(amount: string, toAddress: string, txHash?: string): Promise<string> {
    const truncatedTo = `${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`;
    return this.sendNotification(
      'Transaction Submitted',
      `Sending ${amount} to ${truncatedTo}`,
      'tx_sent',
      { amount, address: toAddress, txHash }
    );
  }

  /**
   * Transaction confirmed notification
   */
  public async notifyTransactionConfirmed(
    amount: string,
    toAddress: string,
    txHash: string,
    blockNumber?: number
  ): Promise<string> {
    return this.sendNotification(
      'Transaction Confirmed',
      `${amount} sent successfully`,
      'tx_confirmed',
      { amount, address: toAddress, txHash, blockNumber }
    );
  }

  /**
   * Funds received notification
   */
  public async notifyFundsReceived(
    amount: string,
    fromAddress: string,
    txHash?: string,
    blockNumber?: number
  ): Promise<string> {
    const truncatedFrom = `${fromAddress.slice(0, 6)}...${fromAddress.slice(-4)}`;
    return this.sendNotification(
      'Funds Received',
      `Received ${amount} from ${truncatedFrom}`,
      'tx_received',
      { amount, address: fromAddress, txHash, blockNumber }
    );
  }

  /**
   * Transaction failed notification
   */
  public async notifyTransactionFailed(amount: string, error: string): Promise<string> {
    return this.sendNotification(
      'Transaction Failed',
      `Failed to send ${amount}: ${error}`,
      'tx_failed',
      { amount }
    );
  }

  /**
   * Save notification to history
   */
  private async saveToHistory(notification: StoredNotification): Promise<void> {
    try {
      const history = await this.getHistory();
      history.unshift(notification);

      // Limit history size
      if (history.length > MAX_NOTIFICATIONS) {
        history.splice(MAX_NOTIFICATIONS);
      }

      await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('[Notifications] Save history error:', error);
    }
  }

  /**
   * Get notification history
   */
  public async getHistory(): Promise<StoredNotification[]> {
    try {
      const data = await AsyncStorage.getItem(NOTIFICATION_HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[Notifications] Get history error:', error);
      return [];
    }
  }

  /**
   * Get unread count
   */
  public async getUnreadCount(): Promise<number> {
    const history = await this.getHistory();
    return history.filter(n => !n.read).length;
  }

  /**
   * Mark notification as read
   */
  public async markAsRead(id: string): Promise<void> {
    try {
      const history = await this.getHistory();
      const index = history.findIndex(n => n.id === id);
      if (index !== -1) {
        history[index].read = true;
        await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history));
      }
    } catch (error) {
      console.error('[Notifications] Mark read error:', error);
    }
  }

  /**
   * Mark all as read
   */
  public async markAllAsRead(): Promise<void> {
    try {
      const history = await this.getHistory();
      history.forEach(n => n.read = true);
      await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('[Notifications] Mark all read error:', error);
    }
  }

  /**
   * Clear notification history
   */
  public async clearHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(NOTIFICATION_HISTORY_KEY);
      console.log('[Notifications] History cleared');
    } catch (error) {
      console.error('[Notifications] Clear history error:', error);
    }
  }

  /**
   * Delete single notification
   */
  public async deleteNotification(id: string): Promise<void> {
    try {
      const history = await this.getHistory();
      const filtered = history.filter(n => n.id !== id);
      await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('[Notifications] Delete error:', error);
    }
  }
}

export const notificationService = NotificationService.getInstance();
