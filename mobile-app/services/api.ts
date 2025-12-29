/**
 * Polkadot.js API connection wrapper for Chameleon Network
 */

import { ApiPromise, WsProvider, HttpProvider } from '@polkadot/api';
import { NETWORK_CONFIG, CONNECTION_CONFIG } from '../config/network';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ApiConnectionState {
  status: ConnectionStatus;
  error?: string;
  blockNumber?: number;
}

class ApiService {
  private static instance: ApiService;
  private api: ApiPromise | null = null;
  private provider: WsProvider | HttpProvider | null = null;
  private connectionState: ApiConnectionState = { status: 'disconnected' };
  private listeners: ((state: ApiConnectionState) => void)[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {}

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * Connect to the Chameleon Network
   */
  public async connect(): Promise<void> {
    console.log('[ApiService] connect() called, current status:', this.connectionState.status);
    
    if (this.connectionState.status === 'connecting' || this.connectionState.status === 'connected') {
      console.log('[ApiService] Already connecting/connected, skipping');
      return;
    }

    this.updateConnectionState({ status: 'connecting' });
    console.log('[ApiService] Attempting to connect to:', NETWORK_CONFIG.wsEndpoint);

    try {
      // Try WebSocket first, fallback to HTTP
      await this.connectWithProvider('ws');
      console.log('[ApiService] WebSocket connection successful');
    } catch (wsError) {
      console.warn('[ApiService] WebSocket connection failed, trying HTTP:', wsError);
      try {
        await this.connectWithProvider('http');
        console.log('[ApiService] HTTP connection successful');
      } catch (httpError) {
        console.error('[ApiService] Both WebSocket and HTTP connections failed:', httpError);
        this.updateConnectionState({ 
          status: 'error', 
          error: 'Failed to connect to network' 
        });
        this.scheduleReconnect();
        throw httpError;
      }
    }
  }

  /**
   * Connect with specific provider type
   */
  private async connectWithProvider(type: 'ws' | 'http'): Promise<void> {
    const endpoint = type === 'ws' ? NETWORK_CONFIG.wsEndpoint : NETWORK_CONFIG.httpEndpoint;
    
    console.log('[API] ====== CONNECTION ATTEMPT ======');
    console.log('[API] Provider type:', type);
    console.log('[API] Endpoint:', endpoint);
    
    try {
      // Step 1: Create provider
      console.log('[API] Step 1: Creating provider...');
      this.provider = type === 'ws' 
        ? new WsProvider(endpoint, CONNECTION_CONFIG.reconnectAttempts)
        : new HttpProvider(endpoint);
      console.log('[API] Step 1: Provider created successfully');

      // Set up provider event listeners for WebSocket
      if (type === 'ws' && this.provider instanceof WsProvider) {
        console.log('[API] Setting up WebSocket event listeners...');
        
        this.provider.on('connected', () => {
          console.log('[API] WebSocket EVENT: connected');
          this.reconnectAttempts = 0;
        });

        this.provider.on('disconnected', () => {
          console.log('[API] WebSocket EVENT: disconnected');
          this.updateConnectionState({ status: 'disconnected' });
          this.scheduleReconnect();
        });

        this.provider.on('error', (error) => {
          console.error('[API] WebSocket EVENT: error', error);
          this.updateConnectionState({ status: 'error', error: error.message });
        });
      }

      // Step 2: Create API instance
      console.log('[API] Step 2: Creating ApiPromise instance...');
      this.api = await ApiPromise.create({ 
        provider: this.provider,
        throwOnConnect: true,
      });
      console.log('[API] Step 2: ApiPromise created successfully');

      // Step 3: Wait for API to be ready
      console.log('[API] Step 3: Waiting for API isReady...');
      await this.api.isReady;
      console.log('[API] Step 3: API is ready!');

      // Step 4: Subscribe to new block headers
      console.log('[API] Step 4: Subscribing to new block heads...');
      await this.api.rpc.chain.subscribeNewHeads((header) => {
        const blockNum = header.number.toNumber();
        console.log('[API] New block received:', blockNum);
        this.updateConnectionState({ 
          status: 'connected', 
          blockNumber: blockNum 
        });
      });
      console.log('[API] Step 4: Subscribed to block heads successfully');

      this.updateConnectionState({ status: 'connected' });
      console.log('[API] ====== CONNECTION SUCCESSFUL ======');
      console.log('[API] Connected to Chameleon Network:', endpoint);
      
    } catch (error: any) {
      console.error('[API] ====== CONNECTION FAILED ======');
      console.error('[API] Error type:', error?.constructor?.name);
      console.error('[API] Error message:', error?.message);
      console.error('[API] Error stack:', error?.stack);
      console.error('[API] Full error:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Disconnect from the network
   */
  public async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.api) {
      await this.api.disconnect();
      this.api = null;
    }

    if (this.provider) {
      if (this.provider instanceof WsProvider) {
        await this.provider.disconnect();
      }
      this.provider = null;
    }

    this.updateConnectionState({ status: 'disconnected' });
    console.log('Disconnected from Chameleon Network');
  }

  /**
   * Get the API instance
   */
  public getApi(): ApiPromise | null {
    return this.api;
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.connectionState.status === 'connected' && this.api !== null;
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): ApiConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Subscribe to connection state changes
   */
  public onConnectionStateChange(listener: (state: ApiConnectionState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Update connection state and notify listeners
   */
  private updateConnectionState(newState: Partial<ApiConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...newState };
    this.listeners.forEach(listener => listener(this.connectionState));
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= CONNECTION_CONFIG.reconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${CONNECTION_CONFIG.reconnectAttempts}`);
      this.connect().catch(console.error);
    }, CONNECTION_CONFIG.reconnectDelay);
  }
}

// Export singleton instance
export const apiService = ApiService.getInstance();
