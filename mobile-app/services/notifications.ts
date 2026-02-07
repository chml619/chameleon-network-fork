/**
 * Notification Service
 * Handles local notifications and notification history
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const NOTIFICATION_HISTORY_KEY_PREFIX = 'notification_history_';
const GLOBAL_NOTIFICATION_HISTORY_KEY = 'notification_history'; // Legacy key for migration
const MAX_NOTIFICATIONS = 100;

// Current wallet address for wallet-specific notifications
let currentWalletAddress: string | null = null;

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
   * Set the current wallet address for wallet-specific notifications
   */
  public setCurrentWallet(address: string | null): void {
    currentWalletAddress = address;
  }

  /**
   * Get the storage key for the current wallet
   */
  private getStorageKey(): string {
    if (currentWalletAddress) {
      return `${NOTIFICATION_HISTORY_KEY_PREFIX}${currentWalletAddress}`;
    }
    return GLOBAL_NOTIFICATION_HISTORY_KEY;
  }

  /**
   * Add a simple notification (for success/error messages)
   * This is a convenience method for simple notifications
   */
  public async addNotification(type: 'success' | 'error' | 'info', message: string): Promise<string> {
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Info';
    return this.sendNotification(title, message, 'info');
  }

  /**
   * Send a custom notification with specific title and body
   * Use this for action-specific notifications (Swap, Shield, Unshield, etc.)
   */
  public async notify(
    title: string,
    body: string,
    type: StoredNotification['type'] = 'tx_confirmed',
    data?: StoredNotification['data']
  ): Promise<string> {
    return this.sendNotification(title, body, type, data);
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
   * Save notification to history (wallet-specific)
   */
  private async saveToHistory(notification: StoredNotification): Promise<void> {
    try {
      const storageKey = this.getStorageKey();
      const history = await this.getHistory();
      history.unshift(notification);

      // Limit history size
      if (history.length > MAX_NOTIFICATIONS) {
        history.splice(MAX_NOTIFICATIONS);
      }

      await AsyncStorage.setItem(storageKey, JSON.stringify(history));
    } catch (error) {
      console.error('[Notifications] Save history error:', error);
    }
  }

  /**
   * Save notification to a specific wallet's history (for recipient notifications)
   * This allows creating notifications for wallets other than the current one
   */
  public async saveNotificationForWallet(
    walletAddress: string,
    title: string,
    body: string,
    type: StoredNotification['type'],
    data?: StoredNotification['data']
  ): Promise<void> {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const storageKey = `${NOTIFICATION_HISTORY_KEY_PREFIX}${walletAddress}`;
      const existingData = await AsyncStorage.getItem(storageKey);
      const history: StoredNotification[] = existingData ? JSON.parse(existingData) : [];

      const notification: StoredNotification = {
        id,
        title,
        body,
        type,
        timestamp: Date.now(),
        read: false,
        data,
      };

      history.unshift(notification);

      // Limit history size
      if (history.length > MAX_NOTIFICATIONS) {
        history.splice(MAX_NOTIFICATIONS);
      }

      await AsyncStorage.setItem(storageKey, JSON.stringify(history));
      console.log('[Notifications] Saved notification for wallet:', walletAddress.substring(0, 8));
    } catch (error) {
      console.error('[Notifications] Save for wallet error:', error);
    }
  }

  /**
   * Get notification history (wallet-specific)
   */
  public async getHistory(): Promise<StoredNotification[]> {
    try {
      const storageKey = this.getStorageKey();
      const data = await AsyncStorage.getItem(storageKey);
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
   * Mark notification as read (wallet-specific)
   */
  public async markAsRead(id: string): Promise<void> {
    try {
      const storageKey = this.getStorageKey();
      const history = await this.getHistory();
      const index = history.findIndex(n => n.id === id);
      if (index !== -1) {
        history[index].read = true;
        await AsyncStorage.setItem(storageKey, JSON.stringify(history));
      }
    } catch (error) {
      console.error('[Notifications] Mark read error:', error);
    }
  }

  /**
   * Mark all as read (wallet-specific)
   */
  public async markAllAsRead(): Promise<void> {
    try {
      const storageKey = this.getStorageKey();
      const history = await this.getHistory();
      history.forEach(n => n.read = true);
      await AsyncStorage.setItem(storageKey, JSON.stringify(history));
    } catch (error) {
      console.error('[Notifications] Mark all read error:', error);
    }
  }

  /**
   * Clear notification history (wallet-specific)
   */
  public async clearHistory(): Promise<void> {
    try {
      const storageKey = this.getStorageKey();
      await AsyncStorage.removeItem(storageKey);
      console.log('[Notifications] History cleared for', storageKey);
    } catch (error) {
      console.error('[Notifications] Clear history error:', error);
    }
  }

  /**
   * Delete single notification (wallet-specific)
   */
  public async deleteNotification(id: string): Promise<void> {
    try {
      const storageKey = this.getStorageKey();
      const history = await this.getHistory();
      const filtered = history.filter(n => n.id !== id);
      await AsyncStorage.setItem(storageKey, JSON.stringify(filtered));
    } catch (error) {
      console.error('[Notifications] Delete error:', error);
    }
  }
}

export const notificationService = NotificationService.getInstance();
