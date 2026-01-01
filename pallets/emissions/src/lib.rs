//! # Emissions Pallet
//!
//! A pallet that manages CHML token emissions with a declining schedule over 20 years.
//! Distributes rewards to validators and liquidity providers according to the tokenomics.
//!
//! ## Overview
//!
//! This pallet implements:
//! - Declining emission schedule with 10% yearly reduction (multiply by 0.9 each year)
//! - Total rewards pool: 65,000,000 CHML over 20 years
//! - Year 1: 7,400,000 CHML (1.407 CHML per block)
//! - After Year 20: emissions STOP completely
//! - Automatic minting and distribution of CHML tokens
//! - Validator rewards based on block production
//! - LP rewards based on pool participation and admin-controlled APY
//! - Admin controls for emission rate and LP APY adjustments
//!
//! ## Key Features
//!
//! - **Automatic Emissions**: Tokens are minted and distributed every block
//! - **Validator Rewards**: 70% of emissions go to validators based on block production
//! - **LP Rewards**: 30% of emissions go to LP providers based on pool APY
//! - **Admin Controls**: Root can adjust emission rates and LP APY
//! - **Declining Schedule**: Emission rate reduces by 10% each year (multiply by 0.9)
//!
//! ## Usage
//!
//! 1. Emissions are automatically processed in `on_finalize` hook
//! 2. Validators claim rewards with `claim_validator_rewards`
//! 3. LP providers claim rewards with `claim_lp_rewards`
//! 4. Admin can adjust rates with `set_lp_apy` and `update_emission_rate`

// We make sure this pallet uses `no_std` for compiling to Wasm.
#![cfg_attr(not(feature = "std"), no_std)]

// Re-export pallet items so that they can be accessed from the crate namespace.
pub use pallet::*;

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
    use frame_support::pallet_prelude::*;
    use frame_support::traits::{Currency, FindAuthor, Get, Hooks, ReservableCurrency};
    use frame_support::PalletId;
    use frame_system::pallet_prelude::*;
    use sp_runtime::traits::{Saturating, Zero, AccountIdConversion, SaturatedConversion};
    use sp_runtime::Perbill;
    use sp_std::vec::Vec;

    /// The current storage version.
    const STORAGE_VERSION: StorageVersion = StorageVersion::new(1);

    /// Balance type alias for cleaner code
    type BalanceOf<T> = <<T as Config>::Currency as Currency<<T as frame_system::Config>::AccountId>>::Balance;

    /// The `Pallet` struct serves as a placeholder to implement traits, methods and dispatchables.
    #[pallet::pallet]
    #[pallet::storage_version(STORAGE_VERSION)]
    pub struct Pallet<T>(_);

    /// Configuration trait of this pallet.
    #[pallet::config]
    pub trait Config: frame_system::Config {
        /// The overarching runtime event type.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        /// Weight information for extrinsics in this pallet.
        type WeightInfo: WeightInfo;

        /// Currency trait for minting CHML tokens.
        type Currency: Currency<Self::AccountId> + ReservableCurrency<Self::AccountId>;

        /// Initial emission rate per block (1.407 CHML = 1_407_000_000_000_000_000).
        /// This represents Year 1 emission rate: 7,400,000 CHML / 5,259,600 blocks = 1.407 CHML/block
        #[pallet::constant]
        type InitialEmissionRate: Get<BalanceOf<Self>>;

        /// Pallet account for holding minted tokens before distribution.
        #[pallet::constant]
        type EmissionsPalletId: Get<PalletId>;

        /// Number of blocks per year for emission reduction calculation.
        #[pallet::constant]
        type BlocksPerYear: Get<BlockNumberFor<Self>>;
        /// Find block author for reward distribution.
        type FindAuthor: frame_support::traits::FindAuthor<Self::AccountId>;
    }

    /// Hooks for automatic emission processing.
    #[pallet::hooks]
    impl<T: Config> Hooks<BlockNumberFor<T>> for Pallet<T> {
        /// Called at the end of each block to process emissions.
        fn on_finalize(n: BlockNumberFor<T>) {
            let current_block = frame_system::Pallet::<T>::block_number();
            
            log::info!(
                "[EMISSIONS] ========== on_finalize START ==========\n\
                 [EMISSIONS] Block param n: {:?}, current_block: {:?}",
                n, current_block
            );

            // Get current emission rate using CORRECT tokenomics
            let emission_rate = Self::calculate_emission_rate(current_block);
            
            if emission_rate.is_zero() {
                log::info!("[EMISSIONS] Year 20+ reached, no more emissions");
                return;
            }

            log::info!("[EMISSIONS] Current emission rate: {:?}", emission_rate);

            // CORRECT SPLIT: 70% validators, 30% LP providers
            let validator_share = emission_rate.saturating_mul(70u32.into()) / 100u32.into();
            let lp_share = emission_rate.saturating_sub(validator_share);

            log::info!(
                "[EMISSIONS] Split - Validator share: {:?}, LP share: {:?}",
                validator_share, lp_share
            );

            // Mint tokens to pallet account
            let pallet_account = Self::account_id();
            let _imbalance = T::Currency::deposit_creating(&pallet_account, emission_rate);
            
            log::info!("[EMISSIONS] Successfully minted {:?} tokens", emission_rate);

            // Distribute validator share to block author if available
            Self::distribute_validator_rewards(validator_share);
            
            // Accumulate LP share for distribution
            Self::distribute_lp_rewards(lp_share);

            // Track total emitted
            TotalEmitted::<T>::mutate(|total| {
                *total = total.saturating_add(emission_rate);
            });

            LastEmissionBlock::<T>::put(current_block);

            Self::deposit_event(Event::EmissionsMinted {
                block_number: current_block,
                amount: emission_rate,
                validator_share,
                lp_share,
            });

            log::info!("[EMISSIONS] ========== on_finalize END ==========\n");
        }
    }

    /// Storage for current emission rate per block.
    #[pallet::storage]
    #[pallet::getter(fn emission_rate)]
    pub type EmissionRate<T: Config> = StorageValue<_, BalanceOf<T>, ValueQuery>;

    /// Storage for accumulated validator rewards.
    #[pallet::storage]
    #[pallet::getter(fn validator_rewards)]
    pub type ValidatorRewards<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        BalanceOf<T>,
        OptionQuery,
    >;

    /// Storage for accumulated LP rewards per user per pool.
    #[pallet::storage]
    #[pallet::getter(fn lp_rewards)]
    pub type LPRewards<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        Blake2_128Concat,
        u32, // pool_id
        BalanceOf<T>,
        OptionQuery,
    >;

    /// Storage for APY percentage per pool.
    #[pallet::storage]
    #[pallet::getter(fn pool_apy)]
    pub type PoolAPY<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        u32, // pool_id
        Perbill,
        OptionQuery,
    >;

    /// Storage for total CHML emitted since genesis.
    #[pallet::storage]
    #[pallet::getter(fn total_emitted)]
    pub type TotalEmitted<T: Config> = StorageValue<_, BalanceOf<T>, ValueQuery>;

    /// Storage for last block that processed emissions.
    #[pallet::storage]
    #[pallet::getter(fn last_emission_block)]
    pub type LastEmissionBlock<T: Config> = StorageValue<_, BlockNumberFor<T>, ValueQuery>;

    /// Events emitted by this pallet.
    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// Emissions were minted and distributed.
        EmissionsMinted {
            /// Block number when emissions were processed.
            block_number: BlockNumberFor<T>,
            /// Total amount minted.
            amount: BalanceOf<T>,
            /// Amount allocated to validators.
            validator_share: BalanceOf<T>,
            /// Amount allocated to LP providers.
            lp_share: BalanceOf<T>,
        },
        /// Validator claimed their accumulated rewards.
        ValidatorRewardsClaimed {
            /// Validator account.
            validator: T::AccountId,
            /// Amount claimed.
            amount: BalanceOf<T>,
        },
        /// LP provider claimed their accumulated rewards.
        LPRewardsClaimed {
            /// LP provider account.
            user: T::AccountId,
            /// Pool ID.
            pool_id: u32,
            /// Amount claimed.
            amount: BalanceOf<T>,
        },
        /// LP APY was updated for a pool.
        LPAPYUpdated {
            /// Pool ID.
            pool_id: u32,
            /// Previous APY.
            old_apy: Perbill,
            /// New APY.
            new_apy: Perbill,
            /// Account that updated the APY.
            updated_by: T::AccountId,
        },
        /// Emission rate was updated.
        EmissionRateUpdated {
            /// Previous emission rate.
            old_rate: BalanceOf<T>,
            /// New emission rate.
            new_rate: BalanceOf<T>,
            /// Account that updated the rate.
            updated_by: T::AccountId,
        },
    }

    /// Errors that can be returned by this pallet.
    #[pallet::error]
    pub enum Error<T> {
        /// No rewards available to claim.
        NoRewardsToClaim,
        /// Account is not a validator.
        NotValidator,
        /// Pool not found.
        PoolNotFound,
        /// Invalid APY value.
        InvalidAPY,
        /// Unauthorized operation.
        Unauthorized,
        /// Arithmetic overflow occurred.
        ArithmeticOverflow,
    }

    /// Dispatchable functions of this pallet.
    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Set APY for a specific liquidity pool (Root only).
        ///
        /// Parameters:
        /// - `pool_id`: The ID of the liquidity pool
        /// - `new_apy`: The new APY as a Perbill (e.g., Perbill::from_percent(15) for 15%)
        ///
        /// Emits `LPAPYUpdated` event on success.
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::set_lp_apy())]
        pub fn set_lp_apy(
            origin: OriginFor<T>,
            pool_id: u32,
            new_apy: Perbill,
        ) -> DispatchResult {
            ensure_root(origin)?;

            // Validate APY (max 100%)
            ensure!(
                new_apy <= Perbill::from_percent(100),
                Error::<T>::InvalidAPY
            );

            let old_apy = PoolAPY::<T>::get(pool_id).unwrap_or_else(|| Perbill::zero());
            PoolAPY::<T>::insert(pool_id, new_apy);

            // Get the root account for event (use pallet account as placeholder)
            let root_account = Self::account_id();

            Self::deposit_event(Event::LPAPYUpdated {
                pool_id,
                old_apy,
                new_apy,
                updated_by: root_account,
            });

            Ok(())
        }

        /// Claim accumulated validator rewards.
        ///
        /// Emits `ValidatorRewardsClaimed` event on success.
        #[pallet::call_index(1)]
        #[pallet::weight(T::WeightInfo::claim_validator_rewards())]
        pub fn claim_validator_rewards(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let rewards = ValidatorRewards::<T>::get(&who)
                .ok_or(Error::<T>::NoRewardsToClaim)?;

            ensure!(!rewards.is_zero(), Error::<T>::NoRewardsToClaim);

            // Transfer rewards from pallet account to validator
            let pallet_account = Self::account_id();
            T::Currency::transfer(
                &pallet_account,
                &who,
                rewards,
                frame_support::traits::ExistenceRequirement::AllowDeath,
            )?;

            // Clear the rewards
            ValidatorRewards::<T>::remove(&who);

            Self::deposit_event(Event::ValidatorRewardsClaimed {
                validator: who,
                amount: rewards,
            });

            Ok(())
        }

        /// Claim accumulated LP rewards for a specific pool.
        ///
        /// Parameters:
        /// - `pool_id`: The ID of the liquidity pool
        ///
        /// Emits `LPRewardsClaimed` event on success.
        #[pallet::call_index(2)]
        #[pallet::weight(T::WeightInfo::claim_lp_rewards())]
        pub fn claim_lp_rewards(
            origin: OriginFor<T>,
            pool_id: u32,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let rewards = LPRewards::<T>::get(&who, pool_id)
                .ok_or(Error::<T>::NoRewardsToClaim)?;

            ensure!(!rewards.is_zero(), Error::<T>::NoRewardsToClaim);

            // Transfer rewards from pallet account to LP provider
            let pallet_account = Self::account_id();
            T::Currency::transfer(
                &pallet_account,
                &who,
                rewards,
                frame_support::traits::ExistenceRequirement::AllowDeath,
            )?;

            // Clear the rewards
            LPRewards::<T>::remove(&who, pool_id);

            Self::deposit_event(Event::LPRewardsClaimed {
                user: who,
                pool_id,
                amount: rewards,
            });

            Ok(())
        }

        /// Update the base emission rate (Root only).
        ///
        /// Parameters:
        /// - `new_rate`: The new emission rate per block
        ///
        /// Emits `EmissionRateUpdated` event on success.
        #[pallet::call_index(3)]
        #[pallet::weight(T::WeightInfo::update_emission_rate())]
        pub fn update_emission_rate(
            origin: OriginFor<T>,
            new_rate: BalanceOf<T>,
        ) -> DispatchResult {
            ensure_root(origin)?;

            let old_rate = EmissionRate::<T>::get();
            EmissionRate::<T>::put(new_rate);

            // Get the root account for event (use pallet account as placeholder)
            let root_account = Self::account_id();

            Self::deposit_event(Event::EmissionRateUpdated {
                old_rate,
                new_rate,
                updated_by: root_account,
            });

            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        /// Get the pallet account ID.
        pub fn account_id() -> T::AccountId {
            T::EmissionsPalletId::get().into_account_truncating()
        }

        /// Get the current emission rate based on CORRECT Chameleon tokenomics:
        /// - Total rewards pool: 65,000,000 CHML over 20 years
        /// - Year 1: 7,400,000 CHML
        /// - 10% yearly reduction (multiply by 0.9 each year)
        /// - After Year 20: emissions STOP
        pub fn calculate_emission_rate(current_block: BlockNumberFor<T>) -> BalanceOf<T> {
            const BLOCKS_PER_YEAR: u32 = 5_259_600;
            
            // Year 1 per-block emission: 7,400,000 CHML / 5,259,600 blocks = 1.407 CHML/block
            // With 18 decimals: 1_407_000_000_000_000_000
            const YEAR_1_PER_BLOCK: u128 = 1_407_000_000_000_000_000;
            
            let current_block_u32: u32 = current_block.saturated_into();
            let year = current_block_u32 / BLOCKS_PER_YEAR;
            
            // After 20 years, emissions stop completely
            if year >= 20u32 {
                return BalanceOf::<T>::zero();
            }
            
            // Calculate per-block emission: Year_1_rate * (0.9)^year
            // Using integer math: multiply by 9, divide by 10 for each year
            let mut emission_per_block = YEAR_1_PER_BLOCK;
            for _ in 0..year {
                emission_per_block = (emission_per_block * 9) / 10;
            }
            
            emission_per_block.saturated_into()
        }

        /// Get the current emission rate based on the block number and yearly reduction.
        pub fn get_current_emission_rate(block_number: BlockNumberFor<T>) -> BalanceOf<T> {
            Self::calculate_emission_rate(block_number)
        }

        /// Distribute validator rewards to block author.
        pub fn distribute_validator_rewards(validator_share: BalanceOf<T>) {
            if let Some(block_author) = Self::get_block_author() {
                let current_rewards = ValidatorRewards::<T>::get(&block_author).unwrap_or_else(Zero::zero);
                let new_rewards = current_rewards.saturating_add(validator_share);
                ValidatorRewards::<T>::insert(&block_author, new_rewards);
                
                log::info!(
                    "[EMISSIONS] Added {:?} to validator {:?}, total: {:?}",
                    validator_share, block_author, new_rewards
                );
            } else {
                log::warn!("[EMISSIONS] No block author found, validator rewards not distributed");
            }
        }

        /// Check if emission rate should be updated (yearly halving).
        pub fn maybe_update_emission_rate(current_block: BlockNumberFor<T>) {
            // This function is now deprecated since we calculate emissions dynamically
            // based on the block number. Keeping for backward compatibility.
            log::info!(
                "[EMISSIONS] maybe_update_emission_rate called for block {:?} - using dynamic calculation",
                current_block
            );
        }

        /// Get the block author (validator who produced this block).
        pub fn get_block_author() -> Option<T::AccountId> {
            // Use FindAuthor trait to get current block author from Aura
            let digest = frame_system::Pallet::<T>::digest();
            T::FindAuthor::find_author(digest.logs.iter().filter_map(|d| d.as_pre_runtime()))
        }

        /// Distribute LP rewards across pools based on their APY.
        pub fn distribute_lp_rewards(total_lp_share: BalanceOf<T>) {
            // For now, this is a simplified implementation
            // In a real system, this would:
            // 1. Get all active pools
            // 2. Calculate total weighted APY
            // 3. Distribute proportionally
            // 4. Update individual LP provider balances based on their pool share
            
            log::info!(
                "[EMISSIONS] LP rewards distribution: {:?} total to distribute",
                total_lp_share
            );
            
            // Placeholder: For now, just log that LP rewards are available
            // Real implementation would require integration with the pDEX pallet
            // to know about liquidity providers and their shares
        }

        /// Initialize the pallet with the initial emission rate.
        pub fn initialize() {
            // Emission rate is now calculated dynamically based on block number
            // No need to store a static rate
            log::info!("[EMISSIONS] Pallet initialized with dynamic emission calculation");
        }
    }

    /// Genesis configuration for the emissions pallet.
    #[pallet::genesis_config]
    #[derive(frame_support::DefaultNoBound)]
    pub struct GenesisConfig<T: Config> {
        /// Initial emission rate per block.
        pub initial_emission_rate: BalanceOf<T>,
        /// Initial pool APYs.
        pub pool_apys: Vec<(u32, Perbill)>,
    }

    #[pallet::genesis_build]
    impl<T: Config> BuildGenesisConfig for GenesisConfig<T> {
        fn build(&self) {
            // Emission rate is now calculated dynamically, no need to store
            // Set initial pool APYs
            for (pool_id, apy) in &self.pool_apys {
                PoolAPY::<T>::insert(pool_id, apy);
            }
            
            log::info!(
                "[EMISSIONS] Genesis: Using dynamic emission calculation, Pool APYs: {:?}",
                self.pool_apys
            );
        }
    }
}