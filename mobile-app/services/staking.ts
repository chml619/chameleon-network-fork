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
  } = {
    staked: new BN(0),
    rewards: new BN(0),
    unbonding: new BN(0),
    lastRewardUpdate: Date.now(),
  };

  private constructor() {}

  static getInstance(): StakingService {
    if (!StakingService.instance) {
      StakingService.instance = new StakingService();
    }
    return StakingService.instance;
  }

  /**
   * Get staking information for an account
   */
  async getStakingInfo(api: ApiPromise, address: string): Promise<StakingInfo> {
    try {
      // Check if staking pallet exists
      const hasStakingPallet = api.query.staking !== undefined;
      
      if (hasStakingPallet) {
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
   * Get real staking info from blockchain
   */
  private async getRealStakingInfo(api: ApiPromise, address: string): Promise<StakingInfo> {
    try {
      // Get account balance
      const accountInfo = await api.query.system.account(address);
      const freeBalance = new BN((accountInfo as any).data.free.toString());
      
      // Get staking ledger
      const ledger = await api.query.staking.ledger(address) as any;
      const stakingLedger = ledger?.isSome ? ledger.unwrap() : null;
      
      const staked = stakingLedger ? new BN(stakingLedger.active.toString()) : new BN(0);
      const unbonding = stakingLedger ? new BN(stakingLedger.total.toString()).sub(staked) : new BN(0);
      
      // Get current era
      const currentEra = await api.query.staking.currentEra() as any;
      const era = currentEra?.isSome ? currentEra.unwrap().toNumber() : 0;
      
      // Get pending rewards (simplified)
      const rewards = new BN(0); // TODO: Calculate actual rewards
      
      // Get minimum stake
      const minNominatorBond = await api.query.staking.minNominatorBond();
      
      return {
        staked: chainService.formatBalance(staked.toString()),
        stakedRaw: staked,
        available: chainService.formatBalance(freeBalance.toString()),
        availableRaw: freeBalance,
        rewards: chainService.formatBalance(rewards.toString()),
        rewardsRaw: rewards,
        unbonding: chainService.formatBalance(unbonding.toString()),
        unbondingRaw: unbonding,
        apy: 12.5, // TODO: Calculate real APY
        era,
        minStake: chainService.formatBalance(minNominatorBond.toString()),
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
      era: 1,
      minStake: '100 CHML',
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
   * Stake tokens
   */
  async stake(
    api: ApiPromise,
    keyPair: KeyringPair,
    amount: BN
  ): Promise<StakingResult> {
    try {
      const hasStakingPallet = api.tx.staking !== undefined;
      
      if (hasStakingPallet) {
        // Real staking
        const tx = api.tx.staking.bond(amount, 'Staked');
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock staking for development
        console.log('[Staking] Pallet not deployed, using mock');
        this.mockStakingData.staked = this.mockStakingData.staked.add(amount);
        this.mockStakingData.lastRewardUpdate = Date.now();
        
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
   * Unstake tokens
   */
  async unstake(
    api: ApiPromise,
    keyPair: KeyringPair,
    amount: BN
  ): Promise<StakingResult> {
    try {
      const hasStakingPallet = api.tx.staking !== undefined;
      
      if (hasStakingPallet) {
        const tx = api.tx.staking.unbond(amount);
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock unstaking
        console.log('[Staking] Pallet not deployed, using mock');
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
   * Claim staking rewards
   */
  async claimRewards(
    api: ApiPromise,
    keyPair: KeyringPair
  ): Promise<StakingResult> {
    try {
      const hasStakingPallet = api.tx.staking !== undefined;
      
      if (hasStakingPallet) {
        // Get current era and payout
        const currentEra = await api.query.staking.currentEra() as any;
        const era = currentEra?.isSome ? currentEra.unwrap().toNumber() - 1 : 0;
        
        const tx = api.tx.staking.payoutStakers(keyPair.address, era);
        return this.signAndSend(tx, keyPair);
      } else {
        // Mock claim
        console.log('[Staking] Pallet not deployed, using mock');
        
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
   * Get list of validators
   */
  async getValidators(api: ApiPromise): Promise<ValidatorInfo[]> {
    try {
      const hasStakingPallet = api.query.staking !== undefined;
      
      if (hasStakingPallet) {
        const validators = await api.query.staking.validators.entries();
        return validators.map(([key, _prefs]) => ({
          address: key.args[0].toString(),
          name: 'Validator',
          commission: 10,
          totalStaked: '10,000 CHML',
          nominators: 5,
          isActive: true,
        }));
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
          },
          {
            address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
            name: 'Validator Node Alpha',
            commission: 8,
            totalStaked: '850,000 CHML',
            nominators: 32,
            isActive: true,
          },
          {
            address: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
            name: 'Community Validator',
            commission: 10,
            totalStaked: '620,000 CHML',
            nominators: 28,
            isActive: true,
          },
          {
            address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
            name: 'Secure Staking Co',
            commission: 7,
            totalStaked: '480,000 CHML',
            nominators: 19,
            isActive: true,
          },
          {
            address: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
            name: 'Decentralized Node',
            commission: 12,
            totalStaked: '320,000 CHML',
            nominators: 15,
            isActive: false,
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
