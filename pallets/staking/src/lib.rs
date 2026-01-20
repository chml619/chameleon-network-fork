//! # Chameleon Staking Pallet
//!
//! A flexible staking pallet for CHML tokens with reward distribution.
//! Designed for testnet flexibility with no lock periods and proportional rewards.
//!
//! ## Overview
//!
//! This pallet implements:
//! - Flexible staking of CHML tokens without lock periods
//! - Proportional reward distribution based on stake amount
//! - Configurable reward rates via admin functions
//! - Automatic reward calculation on block finalization
//!
//! ## Key Features
//!
//! - **Flexible Staking**: Stake and unstake CHML tokens without waiting periods
//! - **Proportional Rewards**: Rewards distributed based on stake proportion
//! - **Admin Controls**: Configurable reward rates and pool management
//! - **Production Ready**: Proper weight calculations and error handling
//!
//! ## Usage
//!
//! 1. Stake CHML tokens with `stake(amount)`
//! 2. Earn rewards automatically based on your stake proportion
//! 3. Claim accumulated rewards with `claim_rewards()`
//! 4. Unstake tokens with `unstake(amount)` (no waiting period)

// We make sure this pallet uses `no_std` for compiling to Wasm.
#![cfg_attr(not(feature = "std"), no_std)]

// Re-export pallet items so that they can be accessed from the crate namespace.
pub use pallet::*;
use frame_support::traits::Get;
use sp_std::vec::Vec;

// FRAME pallets require their own "mock runtimes" to be able to run unit tests.
#[cfg(test)]
mod mock;

// This module contains the unit tests for this pallet.
#[cfg(test)]
mod tests;

// Every callable function or "dispatchable" a pallet exposes must have weight values.
#[cfg(feature = "runtime-benchmarks")]
mod benchmarking;
pub mod weights;
pub use weights::*;

// All pallet logic is defined in its own module and must be annotated by the `pallet` attribute.
#[frame_support::pallet]
pub mod pallet {
    use super::*;
    use frame_support::{
        pallet_prelude::*,
        traits::{
            Currency, ReservableCurrency, ExistenceRequirement,
            Get, Hooks
        },
        PalletId,
    };
    use frame_system::pallet_prelude::*;
    use sp_runtime::traits::{Zero, Saturating, AccountIdConversion, SaturatedConversion};

    /// The current storage version.
    const STORAGE_VERSION: StorageVersion = StorageVersion::new(1);
    /// Token ID for pCHML in pDEX registry
    const CHML_TOKEN_ID: u32 = 0;

    /// Type alias for the balance type.
    type BalanceOf<T> = <<T as Config>::Currency as Currency<<T as frame_system::Config>::AccountId>>::Balance;

    /// The `Pallet` struct serves as a placeholder to implement traits, methods and dispatchables.
    #[pallet::pallet]
    #[pallet::storage_version(STORAGE_VERSION)]
    pub struct Pallet<T>(_);

    /// Configuration trait of this pallet.
    #[pallet::config]
    pub trait Config: frame_system::Config + pallet_pdex::Config {
        /// The overarching runtime event type.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        /// The currency used for staking.
        type Currency: ReservableCurrency<Self::AccountId, Balance: Into<u128> + From<u128>>;

        /// Weight information for extrinsics in this pallet.
        type WeightInfo: WeightInfo;

        /// Minimum amount required to stake.
        #[pallet::constant]
        type MinimumStake: Get<BalanceOf<Self>>;
        /// Cooldown period in blocks before unstaked funds are released.
        #[pallet::constant]
        type UnbondingPeriod: Get<BlockNumberFor<Self>>;

        /// The pallet ID for the reward pool account.
        #[pallet::constant]
        type RewardsPalletId: Get<PalletId>;
    }

    /// Information about a staker.
    #[derive(Clone, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    pub struct StakeInfo<Balance, BlockNumber> {
        /// Amount currently staked.
        pub amount: Balance,
        /// Accumulated rewards not yet claimed.
        pub rewards_accumulated: Balance,
        /// Last block when rewards were calculated.
        pub last_claim_block: BlockNumber,
        /// Current node lifecycle status.
        pub status: NodeStatus,
        /// Block number when unbonding started (if status is Unbonding).
        pub unbonding_block: Option<BlockNumber>,
    }
    impl<Balance: Default, BlockNumber: Default> Default for StakeInfo<Balance, BlockNumber> {
        fn default() -> Self {
            Self {
                amount: Balance::default(),
                rewards_accumulated: Balance::default(),
                last_claim_block: BlockNumber::default(),
                status: NodeStatus::default(),
                unbonding_block: None,
            }
        }
    }
    /// Node lifecycle status for validators.
    #[derive(Clone, Encode, Decode, Eq, PartialEq, RuntimeDebug, TypeInfo, MaxEncodedLen, Default)]
    pub enum NodeStatus {
        /// Node registered but not yet staked minimum
        #[default]
        Registered,
        /// Staked and waiting in queue for activation
        Waiting,
        /// Active validator producing blocks
        Active,
        /// Unbonding - cooldown period before funds release
        Unbonding,
    }


    /// Hooks for automatic reward calculation.
    #[pallet::hooks]
    impl<T: Config> Hooks<BlockNumberFor<T>> for Pallet<T> {
        /// Called at the end of each block to calculate and distribute rewards.
        fn on_finalize(_n: BlockNumberFor<T>) {
            let current_block = frame_system::Pallet::<T>::block_number();
            let total_staked = TotalStaked::<T>::get();
            let reward_rate = RewardRate::<T>::get();
            let reward_pool = RewardPool::<T>::get();

            // Skip if no stakes or no reward rate set
            if total_staked.is_zero() || reward_rate.is_zero() {
                return;
            }

            // Calculate total rewards for this block
            let block_reward = reward_rate;
            
            // Check if reward pool has enough funds
            if reward_pool < block_reward {
                log::warn!("[Staking] Insufficient reward pool");
                return;
            }

            // Distribute rewards proportionally to all stakers
            let mut total_distributed = BalanceOf::<T>::zero();
            
            for (account, mut stake_info) in Stakers::<T>::iter() {
                if stake_info.amount.is_zero() {
                    continue;
                }

                // Calculate proportional reward for this staker
                let staker_reward = Self::calculate_proportional_reward(
                    block_reward,
                    stake_info.amount,
                    total_staked,
                );

                if !staker_reward.is_zero() {
                    stake_info.rewards_accumulated = stake_info.rewards_accumulated.saturating_add(staker_reward);
                    stake_info.last_claim_block = current_block;
                    total_distributed = total_distributed.saturating_add(staker_reward);
                    
                    // Update storage
                    Stakers::<T>::insert(&account, &stake_info);
                }
            }

            // Deduct distributed rewards from pool
            if !total_distributed.is_zero() {
                RewardPool::<T>::mutate(|pool| {
                    *pool = pool.saturating_sub(total_distributed);
                });

                log::info!("[Staking] Block {:?}: Distributed rewards to stakers", current_block);
            }
        }
    }

    /// Storage map for staker information.
    /// Maps account ID to their stake information.
    #[pallet::storage]
    #[pallet::getter(fn stakers)]
    pub type Stakers<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        StakeInfo<BalanceOf<T>, BlockNumberFor<T>>,
        ValueQuery,
    >;

    /// Total amount of CHML currently staked across all users.
    #[pallet::storage]
    #[pallet::getter(fn total_staked)]
    pub type TotalStaked<T: Config> = StorageValue<_, BalanceOf<T>, ValueQuery>;

    /// Reward rate per block per token staked (scaled by 1e18).
    /// Example: 1000000000000000 = 0.001 CHML per block per CHML staked
    #[pallet::storage]
    #[pallet::getter(fn reward_rate)]
    pub type RewardRate<T: Config> = StorageValue<_, BalanceOf<T>, ValueQuery>;

    /// Total CHML allocated for staking rewards.
    #[pallet::storage]
    #[pallet::getter(fn reward_pool)]
    pub type RewardPool<T: Config> = StorageValue<_, BalanceOf<T>, ValueQuery>;

    /// Events emitted by this pallet.
    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// Tokens were successfully staked.
        Staked {
            /// Account that staked tokens.
            account: T::AccountId,
            /// Amount staked.
            amount: BalanceOf<T>,
            /// Total amount now staked by this account.
            total_staked: BalanceOf<T>,
        },
        /// Tokens were successfully unstaked.
        Unstaked {
            /// Account that unstaked tokens.
            account: T::AccountId,
            /// Amount unstaked.
            amount: BalanceOf<T>,
            /// Remaining stake for this account.
            remaining_stake: BalanceOf<T>,
        },
        /// Rewards were successfully claimed.
        RewardsClaimed {
            /// Account that claimed rewards.
            account: T::AccountId,
            /// Amount of rewards claimed.
            amount: BalanceOf<T>,
        },
        /// Reward rate was updated by admin.
        RewardRateUpdated {
            /// New reward rate per block.
            new_rate: BalanceOf<T>,
            /// Account that updated the rate.
            updated_by: T::AccountId,
        },
        /// Reward pool was funded.
        RewardPoolFunded {
            /// Amount added to the reward pool.
            amount: BalanceOf<T>,
            /// Account that funded the pool.
            funded_by: T::AccountId,
        },
        /// Node was registered.
        NodeRegistered {
            /// Account that registered the node.
            account: T::AccountId,
        },
        /// Unbonding period started.
        UnbondingStarted {
            /// Account entering unbonding.
            account: T::AccountId,
            /// Block when unbonding completes.
            unbonding_complete: BlockNumberFor<T>,
        },
        /// Unbonding completed and funds released.
        UnbondingComplete {
            /// Account that completed unbonding.
            account: T::AccountId,
            /// Amount released.
            amount: BalanceOf<T>,
        },
        /// Node was deleted from the network.
        NodeDeleted {
            /// Account that deleted the node.
            account: T::AccountId,
        },
    }

    /// Errors that can be returned by this pallet.
    #[pallet::error]
    pub enum Error<T> {
        /// Insufficient balance to stake the requested amount.
        InsufficientBalance,
        /// Insufficient stake to unstake the requested amount.
        InsufficientStake,
        /// No rewards available to claim.
        NoRewardsToClaim,
        /// Stake amount is below the minimum required.
        StakeAmountTooLow,
        /// Reward pool has insufficient funds.
        RewardPoolDepleted,
        /// Invalid reward rate (must be greater than zero).
        InvalidRewardRate,
        /// Arithmetic overflow occurred.
        ArithmeticOverflow,
        /// Node is not in the correct status for this operation.
        InvalidNodeStatus,
        /// Node is still in unbonding period.
        StillUnbonding,
        /// Node is already registered.
        AlreadyRegistered,
        /// Node not found.
        NodeNotFound,
    }

    /// Dispatchable functions of this pallet.
    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Stake CHML tokens to earn rewards.
        ///
        /// The tokens are reserved from the caller's account and added to their stake.
        /// Rewards are calculated proportionally based on the stake amount.
        ///
        /// Parameters:
        /// - `amount`: Amount of CHML tokens to stake
        ///
        /// Emits `Staked` event on success.
        #[pallet::call_index(0)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::stake())]
        pub fn stake(
            origin: OriginFor<T>,
            amount: BalanceOf<T>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;
            
            // Validate minimum stake amount
            ensure!(amount >= T::MinimumStake::get(), Error::<T>::StakeAmountTooLow);
            
            // Get staking pallet account
            let staking_account = Self::account_id();
            
            // Convert amount to pDEX balance type
            let pdex_amount: <T as pallet_pdex::Config>::Balance = (amount.into() as u128).into();
            
            // Check pCHML balance in pDEX
            let user_balance = pallet_pdex::Pallet::<T>::balance_of(
                CHML_TOKEN_ID.into(),
                &who
            );
            ensure!(user_balance >= pdex_amount, Error::<T>::InsufficientBalance);
            
            // Transfer pCHML to staking pallet (locks the tokens)
            pallet_pdex::Pallet::<T>::do_transfer(
                CHML_TOKEN_ID.into(),
                &who,
                &staking_account,
                pdex_amount
            )?;
            
            // Update staker information
            Stakers::<T>::mutate(&who, |stake_info| {
                stake_info.amount = stake_info.amount.saturating_add(amount);
                stake_info.last_claim_block = frame_system::Pallet::<T>::block_number();
                // Auto-transition to Waiting when minimum stake is met
                if stake_info.status == NodeStatus::Registered && stake_info.amount >= T::MinimumStake::get() {
                    stake_info.status = NodeStatus::Waiting;
                }
            });
            
            // Update total staked
            TotalStaked::<T>::mutate(|total| {
                *total = total.saturating_add(amount);
            });
            
            // Get updated stake info for event
            let stake_info = Stakers::<T>::get(&who);
            
            // Emit event
            Self::deposit_event(Event::Staked {
                account: who,
                amount,
                total_staked: stake_info.amount,
            });
            
            Ok(())
        }
        /// No waiting period is required for testnet flexibility.
        ///
        /// Parameters:
        /// - `amount`: Amount of CHML tokens to unstake
        ///
        /// Emits `Unstaked` event on success.
        #[pallet::call_index(1)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::unstake())]
        pub fn unstake(
            origin: OriginFor<T>,
            amount: BalanceOf<T>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;
            
            // Get current stake info
            let mut stake_info = Stakers::<T>::get(&who);
            
            // Check if user has sufficient stake
            ensure!(stake_info.amount >= amount, Error::<T>::InsufficientStake);
            
            // Get staking pallet account
            let staking_account = Self::account_id();
            
            // Convert amount to pDEX balance type
            let pdex_amount: <T as pallet_pdex::Config>::Balance = (amount.into() as u128).into();
            
            // Transfer pCHML back to user from staking pallet
            pallet_pdex::Pallet::<T>::do_transfer(
                CHML_TOKEN_ID.into(),
                &staking_account,
                &who,
                pdex_amount
            )?;
            
            // Update staker information
            stake_info.amount = stake_info.amount.saturating_sub(amount);
            
            // If no stake remaining, remove from storage, otherwise update
            if stake_info.amount.is_zero() && stake_info.rewards_accumulated.is_zero() {
                Stakers::<T>::remove(&who);
            } else {
                Stakers::<T>::insert(&who, &stake_info);
            }
            
            // Update total staked
            TotalStaked::<T>::mutate(|total| {
                *total = total.saturating_sub(amount);
            });
            
            // Emit event
            Self::deposit_event(Event::Unstaked {
                account: who,
                amount,
                remaining_stake: stake_info.amount,
            });
            
            Ok(())
        }
        /// Claim accumulated staking rewards.
        ///
        /// All accumulated rewards are transferred to the caller's free balance.
        ///
        /// Emits `RewardsClaimed` event on success.
        #[pallet::call_index(2)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::claim_rewards())]
        pub fn claim_rewards(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;
            
            // Get current stake info
            let mut stake_info = Stakers::<T>::get(&who);
            
            // Check if there are rewards to claim
            ensure!(!stake_info.rewards_accumulated.is_zero(), Error::<T>::NoRewardsToClaim);
            
            let rewards = stake_info.rewards_accumulated;
            
            // Convert to pDEX balance type
            let pdex_rewards: <T as pallet_pdex::Config>::Balance = (rewards.into() as u128).into();
            
            // Mint pCHML rewards directly to user
            pallet_pdex::Pallet::<T>::do_mint(
                CHML_TOKEN_ID.into(),
                &who,
                pdex_rewards
            )?;
            
            // Reset accumulated rewards
            stake_info.rewards_accumulated = BalanceOf::<T>::zero();
            stake_info.last_claim_block = frame_system::Pallet::<T>::block_number();
            
            // Update storage
            if stake_info.amount.is_zero() {
                Stakers::<T>::remove(&who);
            } else {
                Stakers::<T>::insert(&who, &stake_info);
            }
            
            // Emit event
            Self::deposit_event(Event::RewardsClaimed {
                account: who,
                amount: rewards,
            });
            
            Ok(())
        }

        /// Set the reward rate per block (admin/sudo only).
        ///
        /// This function can only be called by root/sudo to configure the reward distribution.
        ///
        /// Parameters:
        /// - `rate`: New reward rate per block (scaled by token decimals)
        ///
        /// Emits `RewardRateUpdated` event on success.
        #[pallet::call_index(3)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::set_reward_rate())]
        pub fn set_reward_rate(
            origin: OriginFor<T>,
            rate: BalanceOf<T>,
        ) -> DispatchResult {
            let _who = ensure_root(origin)?;

            // Validate rate is not zero
            ensure!(!rate.is_zero(), Error::<T>::InvalidRewardRate);

            // Update reward rate
            RewardRate::<T>::put(rate);

            // Emit event (using default account for root)
            Self::deposit_event(Event::RewardRateUpdated {
                new_rate: rate,
                updated_by: Self::reward_account_id(), // Use reward account as placeholder for root
            });

            Ok(())
        }

        /// Fund the reward pool (admin/sudo only).
        ///
        /// Transfers tokens from the caller to the reward pool for distribution.
        ///
        /// Parameters:
        /// - `amount`: Amount to add to the reward pool
        ///
        /// Emits `RewardPoolFunded` event on success.
        #[pallet::call_index(4)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::fund_reward_pool())]
        pub fn fund_reward_pool(
            origin: OriginFor<T>,
            amount: BalanceOf<T>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;
            
            // Convert to pDEX balance type
            let pdex_amount: <T as pallet_pdex::Config>::Balance = (amount.into() as u128).into();
            
            // Check pCHML balance
            let user_balance = pallet_pdex::Pallet::<T>::balance_of(
                CHML_TOKEN_ID.into(),
                &who
            );
            ensure!(user_balance >= pdex_amount, Error::<T>::InsufficientBalance);
            
            // Get reward pool account
            let reward_account = Self::reward_account_id();
            
            // Transfer pCHML to reward pool
            pallet_pdex::Pallet::<T>::do_transfer(
                CHML_TOKEN_ID.into(),
                &who,
                &reward_account,
                pdex_amount
            )?;
            
            // Update reward pool storage
            RewardPool::<T>::mutate(|pool| {
                *pool = pool.saturating_add(amount);
            });
            // Emit event
            Self::deposit_event(Event::RewardPoolFunded {
                funded_by: who,
                amount,
            });
            Ok(())
        }
        /// Register a new validator node.
        /// 
        /// This creates a node entry in Registered status.
        /// User must then stake minimum amount to move to Waiting status.
        #[pallet::call_index(5)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::stake())]
        pub fn register_node(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;
            
            // Check if already registered
            let stake_info = Stakers::<T>::get(&who);
            ensure!(stake_info.amount.is_zero() && stake_info.status == NodeStatus::Registered, 
                Error::<T>::AlreadyRegistered);
            
            // Create new stake info with Registered status
            Stakers::<T>::insert(&who, StakeInfo {
                amount: BalanceOf::<T>::zero(),
                rewards_accumulated: BalanceOf::<T>::zero(),
                last_claim_block: frame_system::Pallet::<T>::block_number(),
                status: NodeStatus::Registered,
                unbonding_block: None,
            });
            Self::deposit_event(Event::NodeRegistered { account: who });
            Ok(())
        }
            
        /// Start unbonding process for staked tokens.
        /// 
        /// This initiates the cooldown period. Funds will be released
        /// after UnbondingPeriod blocks.
        #[pallet::call_index(6)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::unstake())]
        pub fn start_unbonding(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;
            
            let mut stake_info = Stakers::<T>::get(&who);
            
            // Must have stake and be in Active or Waiting status
            ensure!(!stake_info.amount.is_zero(), Error::<T>::InsufficientStake);
            ensure!(
                stake_info.status == NodeStatus::Active || stake_info.status == NodeStatus::Waiting,
                Error::<T>::InvalidNodeStatus
            );
            
            let current_block = frame_system::Pallet::<T>::block_number();
            let unbonding_complete = current_block.saturating_add(T::UnbondingPeriod::get());
            
            // Update status to Unbonding
            stake_info.status = NodeStatus::Unbonding;
            stake_info.unbonding_block = Some(unbonding_complete);
            Stakers::<T>::insert(&who, stake_info);
            
            Self::deposit_event(Event::UnbondingStarted {
                account: who,
                unbonding_complete,
            });
            Ok(())
        }
        /// Complete unbonding and release staked funds.
        /// 
        /// Can only be called after UnbondingPeriod has passed.
        #[pallet::call_index(7)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::unstake())]
        pub fn complete_unbonding(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;
            
            let stake_info = Stakers::<T>::get(&who);
            
            // Must be in Unbonding status
            ensure!(stake_info.status == NodeStatus::Unbonding, Error::<T>::InvalidNodeStatus);
            
            // Check if unbonding period has passed
            let current_block = frame_system::Pallet::<T>::block_number();
            let unbonding_block = stake_info.unbonding_block.ok_or(Error::<T>::InvalidNodeStatus)?;
            ensure!(current_block >= unbonding_block, Error::<T>::StillUnbonding);
            
            let amount = stake_info.amount;
            
            // Get staking pallet account
            let staking_account = Self::account_id();
            
            // Convert amount to pDEX balance type
            let pdex_amount: <T as pallet_pdex::Config>::Balance = (amount.into() as u128).into();
            
            // Transfer pCHML back to user from staking pallet
            pallet_pdex::Pallet::<T>::do_transfer(
                CHML_TOKEN_ID.into(),
                &staking_account,
                &who,
                pdex_amount
            )?;
            
            // Update total staked
            TotalStaked::<T>::mutate(|total| {
                *total = total.saturating_sub(amount);
            });
            
            // Remove staker entry
            Stakers::<T>::remove(&who);
            
            Self::deposit_event(Event::UnbondingComplete {
                account: who,
                amount,
            });
            Ok(())
        }
            
        /// Delete a node from the network.
        /// 
        /// Can only be called when node has no stake (after complete_unbonding).
        #[pallet::call_index(8)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::unstake())]
        pub fn delete_node(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;
            
            let stake_info = Stakers::<T>::get(&who);
            
            // Must have no stake remaining
            ensure!(stake_info.amount.is_zero(), Error::<T>::InsufficientStake);
            
            Stakers::<T>::remove(&who);
            // Remove from storage
            Self::deposit_event(Event::NodeDeleted { account: who });
            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        /// Calculate proportional reward using safe integer math.
        /// Returns: total * numerator / denominator
        fn calculate_proportional_reward(
            total: BalanceOf<T>,
            numerator: BalanceOf<T>,
            denominator: BalanceOf<T>,
        ) -> BalanceOf<T> {
            if denominator.is_zero() {
                return BalanceOf::<T>::zero();
            }
            
            // Use u128 for intermediate calculation to prevent overflow
            let total_u128: u128 = total.saturated_into();
            let numerator_u128: u128 = numerator.saturated_into();
            let denominator_u128: u128 = denominator.saturated_into();
            
            let result_u128 = total_u128
                .saturating_mul(numerator_u128)
                / denominator_u128;
            
            result_u128.saturated_into()
        }

        /// Get the account ID of the reward pool.
        /// Get the staking pallet account ID for holding staked tokens.
        pub fn account_id() -> T::AccountId {
            T::RewardsPalletId::get().into_sub_account_truncating(b"stake")
        }

        pub fn reward_account_id() -> T::AccountId {
            T::RewardsPalletId::get().into_account_truncating()
        }

        /// Get stake information for an account.
        pub fn get_stake_info(account: &T::AccountId) -> StakeInfo<BalanceOf<T>, BlockNumberFor<T>> {
            Stakers::<T>::get(account)
        }

        /// Check if an account has any stake.
        pub fn has_stake(account: &T::AccountId) -> bool {
            !Stakers::<T>::get(account).amount.is_zero()
        }

        pub fn get_reward_pool_balance() -> BalanceOf<T> {
            RewardPool::<T>::get()
        }
    }

    /// Genesis configuration for staking pallet
    #[pallet::genesis_config]
    #[derive(frame_support::DefaultNoBound)]
    pub struct GenesisConfig<T: Config> {
        /// Initial validators with their stakes (account, stake_amount)
        pub initial_validators: Vec<(T::AccountId, BalanceOf<T>)>,
    }

    #[pallet::genesis_build]
    impl<T: Config> BuildGenesisConfig for GenesisConfig<T> {
        fn build(&self) {
            for (account, stake) in &self.initial_validators {
                let stake_info = StakeInfo {
                    amount: *stake,
                    status: NodeStatus::Active,
                    last_claim_block: frame_system::Pallet::<T>::block_number(),
                    rewards_accumulated: BalanceOf::<T>::zero(),
                    unbonding_block: None,
                };
                Stakers::<T>::insert(account, stake_info);
                TotalStaked::<T>::mutate(|total| {
                    *total = total.saturating_add(*stake);
                });
                log::info!("[Staking] Genesis: Added validator {:?} with stake {:?}", account, stake);
            }
        }
    }

    /// Converts AccountId to ValidatorId (same type for us)

    pub struct StashOf<T>(sp_std::marker::PhantomData<T>);
    impl<T: Config> sp_runtime::traits::Convert<T::AccountId, Option<T::AccountId>> for StashOf<T> {
        fn convert(account: T::AccountId) -> Option<T::AccountId> {
            Some(account)
        }
    }
}

/// SessionManager implementation for dynamic validator rotation
impl<T: Config> pallet_session::SessionManager<T::AccountId> for Pallet<T> {
    fn new_session(new_index: u32) -> Option<Vec<T::AccountId>> {
        log::info!("[Staking] New session {} starting", new_index);
        // Collect eligible validators (Active or Waiting with minimum stake)
        let min_stake = T::MinimumStake::get();
        let validators: Vec<T::AccountId> = Stakers::<T>::iter()
            .filter(|(_, info)| {
                (info.status == NodeStatus::Active || info.status == NodeStatus::Waiting) 
                    && info.amount >= min_stake
            })
            .map(|(account, _)| account)
            .collect();

        // Transition selected Waiting validators to Active
        for validator in &validators {
            Stakers::<T>::mutate(validator, |info| {
                if info.status == NodeStatus::Waiting {
                    info.status = NodeStatus::Active;
                    log::info!("[Staking] Validator {:?} promoted to Active", validator);
                }
            });
        }

        if validators.is_empty() {
            log::warn!("[Staking] No active validators, keeping previous set");
            return None;
        }
        log::info!("[Staking] Returning {} validators for session {}", validators.len(), new_index);
        Some(validators)
    }

    fn start_session(start_index: u32) {
        log::info!("[Staking] Session {} started", start_index);
    }

    fn end_session(end_index: u32) {
        log::info!("[Staking] Session {} ended", end_index);
    }
}
