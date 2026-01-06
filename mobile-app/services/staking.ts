/**
 * Staking Service
 * Handles staking operations for Chameleon Network
 * 
 * Uses the custom Chameleon staking pallet API:
 * - api.tx.staking.stake(amount) - Stake pCHML tokens
 * - api.tx.staking.unstake(amount) - Unstake tokens
 * - api.tx.staking.claimRewards() - Claim accumulated rewards
 * - api.tx.staking.registerNode() - Register as validator node
 * - api.tx.staking.startUnbonding() - Start 7-day unbonding cooldown
 * - api.tx.staking.completeUnbonding() - Release funds after cooldown
 * - api.tx.staking.deleteNode() - Remove node from chain
 */

import { ApiPromise } from '@polkadot/api';
import type { KeyringPair } from '@polkadot/keyring/types';
import { BN } from '@polkadot/util';
import { chainService } from './chain';

// Minimum stake required (1,750 CHML in planck units - 18 decimals)
const MINIMUM_STAKE = new BN('1750000000000000000');

// Unbonding period in blocks (~7 days at 6 sec blocks)
const UNBONDING_PERIOD = 100800;

// Node status enum matching the chain's NodeStatus
export type NodeStatus = 'Registered' | 'Waiting' | 'Active' | 'Unbonding' | 'None';

export interface StakingInfo {
  staked: string;
  stakedRaw: BN;
  available: string;
  availableRaw: BN;
  rewards: string;
  rewardsRaw: BN;
  unbonding: string;
  unbondingRaw: BN;
  apy: number;
  minStake: string;
  status: NodeStatus;
  unbondingBlock: number | null;
}

export interface StakingResult {
  success: boolean;
  txHash?: string;
  blockHash?: string;
  error?: string;
}

export interface ValidatorInfo {
  address: string;
  name: string;
  commission: number;
  totalStaked: string;
  nominators: number;
  isActive: boolean;
  status: NodeStatus;
}

class StakingService {
  private static instance: StakingService;
  
  // Mock data for development until pallet is deployed
  private mockStakingData: {
    staked: BN;
    rewards: BN;
    unbonding: BN;
    lastRewardUpdate: number;
    status: NodeStatus;
    unbondingBlock: number | null;
  } = {
    staked: new BN(0),
    rewards: new BN(0),
    unbonding: new BN(0),
    lastRewardUpdate: Date.now(),
    status: 'None',
    unbondingBlock: null,
  };

  private constructor() {}

  static getInstance(): StakingService {
    if (!StakingService.instance) {
      StakingService.instance = new StakingService();
    }
    return StakingService.instance;
  }

  /**
   * Check if our custom Chameleon staking pallet is available
   * Our pallet uses api.query.staking.stakers instead of Substrate's ledger
   */
  private hasCustomStakingPallet(api: ApiPromise): boolean {
    return api.query.staking !== undefined && 
           typeof (api.query.staking as any).stakers === 'function';
  }

  /**
   * Get staking information for an account
   */
  async getStakingInfo(api: ApiPromise, address: string): Promise<StakingInfo> {
    try {
      // Check if our custom staking pallet exists (uses stakers storage)
      if (this.hasCustomStakingPallet(api)) {
        return this.getRealStakingInfo(api, address);
      } else {
        return this.getMockStakingInfo(api, address);
      }
    } catch (error) {
      console.error('[Staking] Error getting staking info:', error);
      return this.getMockStakingInfo(api, address);
    }
  }

  /**
   * Get real staking info from blockchain using our custom pallet
   * Queries api.query.staking.stakers(address) which returns StakeInfo struct
   */
  private async getRealStakingInfo(api: ApiPromise, address: string): Promise<StakingInfo> {
    try {
      // Get account balance
      const accountInfo = await api.query.system.account(address);
      const freeBalance = new BN((accountInfo as any).data.free.toString());
      
      // Query our custom staking pallet's stakers storage
      const stakerInfo = await (api.query.staking as any).stakers(address);
      
      let staked = new BN(0);
      let rewards = new BN(0);
      let unbonding = new BN(0);
      let status: NodeStatus = 'None';
      let unbondingBlock: number | null = null;
      
      // Parse StakeInfo struct if it exists
      if (stakerInfo && !stakerInfo.isEmpty) {
        const info = stakerInfo.toJSON ? stakerInfo.toJSON() : stakerInfo;
        
        // Extract fields from StakeInfo { amount, rewards_accumulated, last_claim_block, status, unbonding_block }
        staked = new BN(info.amount?.toString() || '0');
        rewards = new BN(info.rewards_accumulated?.toString() || info.rewardsAccumulated?.toString() || '0');
        
        // Parse status enum
        const rawStatus = info.status;
        if (rawStatus) {
          if (typeof rawStatus === 'string') {
            status = rawStatus as NodeStatus;
          } else if (typeof rawStatus === 'object') {
            // Handle enum variant object like { Active: null } or { Unbonding: null }
            const statusKey = Object.keys(rawStatus)[0];
            if (statusKey) {
              status = statusKey as NodeStatus;
            }
          }
        }
        
        // Parse unbonding_block
        const rawUnbondingBlock = info.unbonding_block ?? info.unbondingBlock;
        if (rawUnbondingBlock && rawUnbondingBlock !== 0) {
          unbondingBlock = Number(rawUnbondingBlock);
          // If in unbonding status, calculate remaining unbonding amount
          if (status === 'Unbonding') {
            unbonding = staked; // The staked amount is being unbonded
          }
        }
      }
      
      // Get total staked and reward rate for APY calculation
      let apy = 12.5; // Default APY estimate
      try {
        const totalStaked = await (api.query.staking as any).totalStaked();
        const rewardRate = await (api.query.staking as any).rewardRate();
        
        if (totalStaked && rewardRate && !totalStaked.isZero()) {
          // Calculate APY based on reward rate
          // APY = (rewardRate * blocks_per_year / totalStaked) * 100
          const blocksPerYear = 365 * 24 * 60 * 10; // ~6 sec blocks
          const totalStakedBN = new BN(totalStaked.toString());
          const rewardRateBN = new BN(rewardRate.toString());
          
          if (!totalStakedBN.isZero()) {
            const yearlyRewards = rewardRateBN.muln(blocksPerYear);
            apy = yearlyRewards.muln(100).div(totalStakedBN).toNumber();
          }
        }
      } catch (e) {
        console.log('[Staking] Could not calculate APY, using default:', e);
      }
      
      return {
        staked: chainService.formatBalance(staked.toString()),
        stakedRaw: staked,
        available: chainService.formatBalance(freeBalance.toString()),
        availableRaw: freeBalance,
        rewards: chainService.formatBalance(rewards.toString()),
        rewardsRaw: rewards,
        unbonding: chainService.formatBalance(unbonding.toString()),
        unbondingRaw: unbonding,
        apy,
        minStake: chainService.formatBalance(MINIMUM_STAKE.toString()),
        status,
        unbondingBlock,
      };
    } catch (error) {
      console.error('[Staking] Error fetching real staking info:', error);
      throw error;
    }
  }

  /**
   * Get mock staking info for development
   */
  private async getMockStakingInfo(api: ApiPromise, address: string): Promise<StakingInfo> {
    // Get real balance
    let availableRaw = new BN(0);
    try {
      const accountInfo = await api.query.system.account(address);
      availableRaw = new BN((accountInfo as any).data.free.toString());
    } catch (e) {
      // Ignore
    }
    
    // Simulate reward accumulation if staked
    this.updateMockRewards();
    
    return {
      staked: chainService.formatBalance(this.mockStakingData.staked.toString()),
      stakedRaw: this.mockStakingData.staked,
      available: chainService.formatBalance(availableRaw.toString()),
      availableRaw,
      rewards: chainService.formatBalance(this.mockStakingData.rewards.toString()),
      rewardsRaw: this.mockStakingData.rewards,
      unbonding: chainService.formatBalance(this.mockStakingData.unbonding.toString()),
      unbondingRaw: this.mockStakingData.unbonding,
      apy: 12.5,
      minStake: chainService.formatBalance(MINIMUM_STAKE.toString()),
      status: this.mockStakingData.status,
      unbondingBlock: this.mockStakingData.unbondingBlock,
    };
  }

  /**
   * Update mock rewards based on time elapsed
   */
  private updateMockRewards(): void {
    if (this.mockStakingData.staked.isZero()) {
      return;
    }

    const now = Date.now();
    const timeDiff = now - this.mockStakingData.lastRewardUpdate;
    const hoursPassed = timeDiff / (1000 * 60 * 60);
    
    if (hoursPassed > 0.1) { // Update every 6 minutes for demo
      // Calculate rewards: 12.5% APY = ~0.0014% per hour
      const hourlyRate = 0.000014; // 12.5% / (365 * 24) / 100
      const rewardAmount = this.mockStakingData.staked.muln(Math.floor(hourlyRate * 1000000)).divn(1000000);
      
      this.mockStakingData.rewards = this.mockStakingData.rewards.add(rewardAmount);
      this.mockStakingData.lastRewardUpdate = now;
    }
  }

  /**
   * Stake tokens using our custom pallet
   * Uses api.tx.staking.stake(amount)
   */
  async stake(
    api: ApiPromise,
    keyPair: KeyringPair,
    amount: BN
  ): Promise<StakingResult> {
    try {
      if (this.hasCustomStakingPallet(api)) {
        // Use our custom staking pallet's stake extrinsic
        const tx = api.tx.staking.stake(amount);
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock staking for development
        console.log('[Staking] Custom pallet not deployed, using mock');
        this.mockStakingData.staked = this.mockStakingData.staked.add(amount);
        this.mockStakingData.lastRewardUpdate = Date.now();
        this.mockStakingData.status = 'Waiting';
        
        // Add some initial rewards for demo (0.1% of staked amount)
        const initialRewards = amount.divn(1000);
        this.mockStakingData.rewards = this.mockStakingData.rewards.add(initialRewards);
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return {
          success: true,
          txHash: '0x' + Math.random().toString(16).slice(2, 66),
          blockHash: '0x' + Math.random().toString(16).slice(2, 66),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Staking failed',
      };
    }
  }

  /**
   * Unstake tokens using our custom pallet
   * Uses api.tx.staking.unstake(amount)
   */
  async unstake(
    api: ApiPromise,
    keyPair: KeyringPair,
    amount: BN
  ): Promise<StakingResult> {
    try {
      if (this.hasCustomStakingPallet(api)) {
        // Use our custom staking pallet's unstake extrinsic
        const tx = api.tx.staking.unstake(amount);
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock unstaking
        console.log('[Staking] Custom pallet not deployed, using mock');
        const unstakeAmount = BN.min(amount, this.mockStakingData.staked);
        this.mockStakingData.staked = this.mockStakingData.staked.sub(unstakeAmount);
        this.mockStakingData.unbonding = this.mockStakingData.unbonding.add(unstakeAmount);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return {
          success: true,
          txHash: '0x' + Math.random().toString(16).slice(2, 66),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unstaking failed',
      };
    }
  }

  /**
   * Claim staking rewards using our custom pallet
   * Uses api.tx.staking.claimRewards() - NO arguments
   */
  async claimRewards(
    api: ApiPromise,
    keyPair: KeyringPair
  ): Promise<StakingResult> {
    try {
      if (this.hasCustomStakingPallet(api)) {
        // Use our custom staking pallet's claimRewards extrinsic (no arguments)
        const tx = api.tx.staking.claimRewards();
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock claim
        console.log('[Staking] Custom pallet not deployed, using mock');
        
        // Add some rewards to available balance (simulate claiming)
        const claimedAmount = this.mockStakingData.rewards;
        this.mockStakingData.rewards = new BN(0);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return {
          success: true,
          txHash: '0x' + Math.random().toString(16).slice(2, 66),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Claim failed',
      };
    }
  }

  /**
   * Register a new validator node with IP and port endpoint
   * This is the enhanced version that stores node endpoint information
   */
  async registerNodeWithEndpoint(
    api: ApiPromise,
    keyPair: KeyringPair,
    ip: string,
    port: number
  ): Promise<StakingResult> {
    console.log('[Staking] Registering node with endpoint:', ip, port);

    // Check if custom pallet supports registerNode with params
    if (this.hasCustomStakingPallet(api)) {
      try {
        // Try the enhanced registerNode call with IP/port
        // The pallet may support: api.tx.staking.registerNode(ip, port)
        let tx;
        
        // Check if the extrinsic accepts parameters
        const registerNodeMeta = api.tx.staking.registerNode;
        if (registerNodeMeta.meta.args.length >= 2) {
          // Pallet supports IP/port parameters
          tx = api.tx.staking.registerNode(ip, port);
        } else {
          // Fallback to basic registration without params
          tx = api.tx.staking.registerNode();
        }

        return new Promise<StakingResult>((resolve) => {
          tx.signAndSend(keyPair, { nonce: -1 }, ({ status, events, dispatchError }) => {
            if (status.isInBlock || status.isFinalized) {
              if (dispatchError) {
                let errorMessage = 'Registration failed';
                if (dispatchError.isModule) {
                  const decoded = api.registry.findMetaError(dispatchError.asModule);
                  errorMessage = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
                }
                console.error('[Staking] Registration error:', errorMessage);
                resolve({ success: false, error: errorMessage });
              } else {
                // Check events for success
                let nodeRegistered = false;
                events.forEach(({ event }) => {
                  if (event.section === 'staking' && 
                      (event.method === 'NodeRegistered' || event.method === 'Registered')) {
                    nodeRegistered = true;
                  }
                });

                const txHash = status.isFinalized 
                  ? status.asFinalized.toString() 
                  : status.asInBlock.toString();

                console.log('[Staking] Node registered, txHash:', txHash);
                
                // Update mock data status
                this.mockStakingData.status = 'Registered';
                
                resolve({ 
                  success: true, 
                  txHash,
                  blockHash: txHash,
                });
              }
            }
          }).catch((error) => {
            console.error('[Staking] Registration tx error:', error);
            resolve({ success: false, error: error.message });
          });
        });
      } catch (error) {
        console.error('[Staking] registerNodeWithEndpoint error:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Registration failed' 
        };
      }
    }

    // Fallback to mock registration for development
    console.log('[Staking] Using mock registration (pallet not available)');
    await new Promise(resolve => setTimeout(resolve, 1500));
    this.mockStakingData.status = 'Registered';
    return { 
      success: true, 
      txHash: '0x' + Math.random().toString(16).slice(2),
    };
  }

  /**
   * Register as a validator node
   * Uses api.tx.staking.registerNode()
   */
  async registerNode(
    api: ApiPromise,
    keyPair: KeyringPair
  ): Promise<StakingResult> {
    try {
      if (this.hasCustomStakingPallet(api)) {
        const tx = api.tx.staking.registerNode();
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock registration
        console.log('[Staking] Custom pallet not deployed, using mock');
        this.mockStakingData.status = 'Registered';
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return {
          success: true,
          txHash: '0x' + Math.random().toString(16).slice(2, 66),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Node registration failed',
      };
    }
  }

  /**
   * Start the 7-day unbonding cooldown period
   * Uses api.tx.staking.startUnbonding()
   */
  async startUnbonding(
    api: ApiPromise,
    keyPair: KeyringPair
  ): Promise<StakingResult> {
    try {
      if (this.hasCustomStakingPallet(api)) {
        const tx = api.tx.staking.startUnbonding();
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock start unbonding
        console.log('[Staking] Custom pallet not deployed, using mock');
        this.mockStakingData.status = 'Unbonding';
        this.mockStakingData.unbondingBlock = Date.now(); // Use timestamp for mock
        this.mockStakingData.unbonding = this.mockStakingData.staked;
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return {
          success: true,
          txHash: '0x' + Math.random().toString(16).slice(2, 66),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Start unbonding failed',
      };
    }
  }

  /**
   * Complete unbonding and release funds after cooldown period
   * Uses api.tx.staking.completeUnbonding()
   */
  async completeUnbonding(
    api: ApiPromise,
    keyPair: KeyringPair
  ): Promise<StakingResult> {
    try {
      if (this.hasCustomStakingPallet(api)) {
        const tx = api.tx.staking.completeUnbonding();
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock complete unbonding
        console.log('[Staking] Custom pallet not deployed, using mock');
        this.mockStakingData.status = 'None';
        this.mockStakingData.unbondingBlock = null;
        this.mockStakingData.staked = new BN(0);
        this.mockStakingData.unbonding = new BN(0);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return {
          success: true,
          txHash: '0x' + Math.random().toString(16).slice(2, 66),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Complete unbonding failed',
      };
    }
  }

  /**
   * Delete/remove node from the chain
   * Uses api.tx.staking.deleteNode()
   */
  async deleteNode(
    api: ApiPromise,
    keyPair: KeyringPair
  ): Promise<StakingResult> {
    try {
      if (this.hasCustomStakingPallet(api)) {
        const tx = api.tx.staking.deleteNode();
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock delete node
        console.log('[Staking] Custom pallet not deployed, using mock');
        this.mockStakingData.status = 'None';
        this.mockStakingData.staked = new BN(0);
        this.mockStakingData.rewards = new BN(0);
        this.mockStakingData.unbonding = new BN(0);
        this.mockStakingData.unbondingBlock = null;
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return {
          success: true,
          txHash: '0x' + Math.random().toString(16).slice(2, 66),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete node failed',
      };
    }
  }

  /**
   * Get the current node status for an address
   * Queries api.query.staking.stakers(address) and returns status
   */
  async getNodeStatus(api: ApiPromise, address: string): Promise<NodeStatus> {
    try {
      if (this.hasCustomStakingPallet(api)) {
        const stakerInfo = await (api.query.staking as any).stakers(address);
        
        if (stakerInfo && !stakerInfo.isEmpty) {
          const info = stakerInfo.toJSON ? stakerInfo.toJSON() : stakerInfo;
          const rawStatus = info.status;
          
          if (rawStatus) {
            if (typeof rawStatus === 'string') {
              return rawStatus as NodeStatus;
            } else if (typeof rawStatus === 'object') {
              const statusKey = Object.keys(rawStatus)[0];
              if (statusKey) {
                return statusKey as NodeStatus;
              }
            }
          }
        }
        
        return 'None';
      } else {
        // Return mock status
        return this.mockStakingData.status;
      }
    } catch (error) {
      console.error('[Staking] Error getting node status:', error);
      return 'None';
    }
  }

  /**
   * Get list of validators using our custom pallet
   */
  async getValidators(api: ApiPromise): Promise<ValidatorInfo[]> {
    try {
      if (this.hasCustomStakingPallet(api)) {
        // Query all stakers from our custom pallet
        const stakerEntries = await (api.query.staking as any).stakers.entries();
        
        const validators: ValidatorInfo[] = [];
        
        for (const [key, value] of stakerEntries) {
          const address = key.args[0].toString();
          const info = value.toJSON ? value.toJSON() : value;
          
          // Parse status
          let status: NodeStatus = 'None';
          const rawStatus = info.status;
          if (rawStatus) {
            if (typeof rawStatus === 'string') {
              status = rawStatus as NodeStatus;
            } else if (typeof rawStatus === 'object') {
              const statusKey = Object.keys(rawStatus)[0];
              if (statusKey) {
                status = statusKey as NodeStatus;
              }
            }
          }
          
          const stakedAmount = new BN(info.amount?.toString() || '0');
          
          validators.push({
            address,
            name: `Validator ${address.slice(0, 8)}...`,
            commission: 10, // Default commission
            totalStaked: chainService.formatBalance(stakedAmount.toString()),
            nominators: 0, // Our pallet doesn't have nominators in v1
            isActive: status === 'Active',
            status,
          });
        }
        
        return validators;
      } else {
        // Return mock validators
        return [
          {
            address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            name: 'Chameleon Foundation',
            commission: 5,
            totalStaked: '1,250,000 CHML',
            nominators: 45,
            isActive: true,
            status: 'Active',
          },
          {
            address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
            name: 'Validator Node Alpha',
            commission: 8,
            totalStaked: '850,000 CHML',
            nominators: 32,
            isActive: true,
            status: 'Active',
          },
          {
            address: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
            name: 'Community Validator',
            commission: 10,
            totalStaked: '620,000 CHML',
            nominators: 28,
            isActive: true,
            status: 'Active',
          },
          {
            address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
            name: 'Secure Staking Co',
            commission: 7,
            totalStaked: '480,000 CHML',
            nominators: 19,
            isActive: true,
            status: 'Waiting',
          },
          {
            address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
            name: 'Decentralized Node',
            commission: 12,
            totalStaked: '320,000 CHML',
            nominators: 15,
            isActive: false,
            status: 'Unbonding',
          },
        ];
      }
    } catch (error) {
      console.error('[Staking] Error getting validators:', error);
      return [];
    }
  }

  /**
   * Calculate estimated rewards
   */
  calculateEstimatedRewards(amount: BN, apy: number, days: number = 365): BN {
    const annualReward = amount.muln(apy).divn(100);
    return annualReward.muln(days).divn(365);
  }

  /**
   * Sign and send transaction
   */
  private signAndSend(
    tx: any,
    keyPair: KeyringPair
  ): Promise<StakingResult> {
    return new Promise((resolve) => {
      tx.signAndSend(keyPair, ({ status, dispatchError, txHash }: any) => {
        if (status.isInBlock || status.isFinalized) {
          if (dispatchError) {
            resolve({
              success: false,
              txHash: txHash?.toHex(),
              error: 'Transaction failed',
            });
          } else {
            resolve({
              success: true,
              txHash: txHash?.toHex(),
              blockHash: status.isFinalized 
                ? status.asFinalized.toHex() 
                : status.asInBlock.toHex(),
            });
          }
        }
      }).catch((error: Error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });
    });
  }
}

export const stakingService = StakingService.getInstance();
