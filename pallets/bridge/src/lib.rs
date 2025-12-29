//! # Bridge Pallet
//!
//! A pallet that provides cross-chain bridge functionality for Chameleon Network.
//! Supports bridging BTC, ETH, USDT, and USDC from external chains to Chameleon.
//!
//! ## Overview
//!
//! This pallet implements:
//! - Lock/unlock mechanism for cross-chain transfers
//! - Validator-based confirmation system for deposits and withdrawals
//! - Support for Bitcoin, Ethereum, and Polygon chains
//! - Multi-signature style validation for testnet security
//!
//! ## Key Features
//!
//! - **Cross-Chain Deposits**: Users can initiate deposits from external chains
//! - **Validator Confirmations**: Bridge validators confirm external chain transactions
//! - **Automated Minting**: Tokens are minted when confirmation threshold is reached
//! - **Withdrawal Processing**: Users can withdraw to external chains with validator processing
//!
//! ## Usage
//!
//! 1. User initiates deposit with `initiate_deposit`
//! 2. Validators confirm with `confirm_deposit` when they see external transaction
//! 3. When threshold reached, tokens are automatically minted
//! 4. For withdrawals, user calls `initiate_withdrawal`
//! 5. Validators process on external chain and confirm with `confirm_withdrawal`

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
    use codec::Decode;
    use frame_support::pallet_prelude::*;
    use frame_support::traits::{Currency, ReservableCurrency, Get};
    use frame_system::pallet_prelude::*;
    use sp_runtime::traits::{Saturating, Zero};
    use sp_core::{H256, hashing::blake2_256};
    use sp_std::vec::Vec;

    /// The current storage version.
    const STORAGE_VERSION: StorageVersion = StorageVersion::new(1);

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

        /// The currency used for reserving funds.
        type Currency: Currency<Self::AccountId> + ReservableCurrency<Self::AccountId>;

        /// Minimum deposit amount (1 CHML equivalent).
        #[pallet::constant]
        type MinimumDeposit: Get<BalanceOf<Self>>;

        /// Maximum withdrawal amount (1000 CHML).
        #[pallet::constant]
        type MaximumWithdrawal: Get<BalanceOf<Self>>;

        /// Maximum number of bridge validators.
        #[pallet::constant]
        type MaxValidators: Get<u32>;
    }

    /// Balance type alias.
    pub type BalanceOf<T> = <<T as Config>::Currency as Currency<<T as frame_system::Config>::AccountId>>::Balance;

    /// Supported blockchain networks.
    #[derive(Clone, Copy, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen, Default)]
    pub enum Chain {
        #[default]
        Bitcoin,
        Ethereum,
        Polygon,
    }

    // Implement DecodeWithMemTracking manually for Chain
    impl codec::DecodeWithMemTracking for Chain {}

    /// Supported assets for bridging.
    #[derive(Clone, Copy, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen, Default)]
    pub enum Asset {
        #[default]
        BTC,
        ETH,
        USDT,
        USDC,
    }

    // Implement DecodeWithMemTracking manually for Asset
    impl codec::DecodeWithMemTracking for Asset {}

    /// Status of a deposit operation.
    #[derive(Clone, Copy, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen, Default)]
    pub enum DepositStatus {
        #[default]
        Pending,
        Confirmed,
        Completed,
        Failed,
    }

    // Implement DecodeWithMemTracking manually for DepositStatus
    impl codec::DecodeWithMemTracking for DepositStatus {}

    /// Status of a withdrawal operation.
    #[derive(Clone, Copy, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen, Default)]
    pub enum WithdrawalStatus {
        #[default]
        Pending,
        Processing,
        Completed,
        Failed,
    }

    // Implement DecodeWithMemTracking manually for WithdrawalStatus
    impl codec::DecodeWithMemTracking for WithdrawalStatus {}

    /// Information about a pending deposit.
    #[derive(Clone, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    pub struct DepositInfo<AccountId, Balance, BlockNumber> {
        pub chain: Chain,
        pub asset: Asset,
        pub amount: Balance,
        pub depositor: AccountId,
        pub destination: AccountId,
        pub confirmations: u32,
        pub confirmed_by: BoundedVec<AccountId, ConstU32<10>>,
        pub status: DepositStatus,
        pub created_at: BlockNumber,
        pub external_tx_hash: Option<H256>,
    }

    /// Information about a pending withdrawal.
    #[derive(Clone, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    pub struct WithdrawalInfo<AccountId, Balance, BlockNumber> {
        pub chain: Chain,
        pub asset: Asset,
        pub amount: Balance,
        pub withdrawer: AccountId,
        pub external_address: BoundedVec<u8, ConstU32<64>>,
        pub confirmations: u32,
        pub confirmed_by: BoundedVec<AccountId, ConstU32<10>>,
        pub status: WithdrawalStatus,
        pub created_at: BlockNumber,
        pub external_tx_hash: Option<H256>,
    }

    /// Storage map for pending deposits.
    /// Maps deposit_id to DepositInfo.
    #[pallet::storage]
    #[pallet::getter(fn pending_deposits)]
    pub type PendingDeposits<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        u64,
        DepositInfo<T::AccountId, BalanceOf<T>, BlockNumberFor<T>>,
        OptionQuery,
    >;

    /// Storage map for pending withdrawals.
    /// Maps withdrawal_id to WithdrawalInfo.
    #[pallet::storage]
    #[pallet::getter(fn pending_withdrawals)]
    pub type PendingWithdrawals<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        u64,
        WithdrawalInfo<T::AccountId, BalanceOf<T>, BlockNumberFor<T>>,
        OptionQuery,
    >;

    /// List of authorized bridge validators.
    #[pallet::storage]
    #[pallet::getter(fn bridge_validators)]
    pub type BridgeValidators<T: Config> = StorageValue<
        _,
        BoundedVec<T::AccountId, T::MaxValidators>,
        ValueQuery,
    >;

    /// Required number of validator confirmations.
    #[pallet::storage]
    #[pallet::getter(fn confirmation_threshold)]
    pub type ConfirmationThreshold<T: Config> = StorageValue<_, u32, ValueQuery>;

    /// Auto-incrementing deposit ID.
    #[pallet::storage]
    #[pallet::getter(fn next_deposit_id)]
    pub type NextDepositId<T: Config> = StorageValue<_, u64, ValueQuery>;

    /// Auto-incrementing withdrawal ID.
    #[pallet::storage]
    #[pallet::getter(fn next_withdrawal_id)]
    pub type NextWithdrawalId<T: Config> = StorageValue<_, u64, ValueQuery>;

    /// Total amount bridged in per asset.
    #[pallet::storage]
    #[pallet::getter(fn total_bridged_in)]
    pub type TotalBridgedIn<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        Asset,
        BalanceOf<T>,
        ValueQuery,
    >;

    /// Total amount bridged out per asset.
    #[pallet::storage]
    #[pallet::getter(fn total_bridged_out)]
    pub type TotalBridgedOut<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        Asset,
        BalanceOf<T>,
        ValueQuery,
    >;

    /// Events emitted by this pallet.
    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// A deposit was initiated.
        DepositInitiated {
            deposit_id: u64,
            chain: Chain,
            asset: Asset,
            amount: BalanceOf<T>,
            depositor: T::AccountId,
            destination: T::AccountId,
        },
        /// A deposit was confirmed by a validator.
        DepositConfirmed {
            deposit_id: u64,
            validator: T::AccountId,
            confirmations: u32,
            threshold: u32,
        },
        /// A deposit was completed and tokens were minted.
        DepositCompleted {
            deposit_id: u64,
            depositor: T::AccountId,
            amount_minted: BalanceOf<T>,
            external_tx_hash: H256,
        },
        /// A withdrawal was initiated.
        WithdrawalInitiated {
            withdrawal_id: u64,
            chain: Chain,
            asset: Asset,
            amount: BalanceOf<T>,
            withdrawer: T::AccountId,
            external_address: BoundedVec<u8, ConstU32<64>>,
        },
        /// A withdrawal was confirmed by a validator.
        WithdrawalConfirmed {
            withdrawal_id: u64,
            validator: T::AccountId,
            confirmations: u32,
            threshold: u32,
        },
        /// A withdrawal was completed.
        WithdrawalCompleted {
            withdrawal_id: u64,
            withdrawer: T::AccountId,
            external_tx_hash: H256,
        },
        /// A validator was added.
        ValidatorAdded {
            validator: T::AccountId,
            added_by: T::AccountId,
        },
        /// A validator was removed.
        ValidatorRemoved {
            validator: T::AccountId,
            removed_by: T::AccountId,
        },
        /// Confirmation threshold was updated.
        ConfirmationThresholdUpdated {
            old_threshold: u32,
            new_threshold: u32,
        },
    }

    /// Errors that can be returned by this pallet.
    #[pallet::error]
    pub enum Error<T> {
        /// Invalid chain specified.
        InvalidChain,
        /// Unsupported asset for bridging.
        UnsupportedAsset,
        /// Insufficient confirmations for operation.
        InsufficientConfirmations,
        /// Deposit not found.
        DepositNotFound,
        /// Withdrawal not found.
        WithdrawalNotFound,
        /// Caller is not an authorized validator.
        NotValidator,
        /// Validator has already confirmed this operation.
        AlreadyConfirmed,
        /// Withdrawal has already been processed.
        WithdrawalAlreadyProcessed,
        /// Invalid amount specified.
        InvalidAmount,
        /// Insufficient balance for operation.
        InsufficientBalance,
        /// Validator already exists in the list.
        ValidatorAlreadyExists,
        /// Validator not found in the list.
        ValidatorNotFound,
        /// Threshold is too high for current validator count.
        ThresholdTooHigh,
        /// Maximum number of validators reached.
        MaxValidatorsReached,
        /// Deposit has already been completed.
        DepositAlreadyCompleted,
        /// Withdrawal has already been completed.
        WithdrawalAlreadyCompleted,
    }

    /// Dispatchable functions of this pallet.
    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Initiate a cross-chain deposit.
        ///
        /// User declares they have sent funds on an external chain and requests
        /// equivalent tokens to be minted on Chameleon once validators confirm.
        ///
        /// Parameters:
        /// - `chain`: The external blockchain where funds were sent
        /// - `asset`: The type of asset being deposited
        /// - `amount`: The amount of asset being deposited
        /// - `destination_address`: The Chameleon account to receive minted tokens
        ///
        /// Emits `DepositInitiated` event on success.
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::initiate_deposit())]
        pub fn initiate_deposit(
            origin: OriginFor<T>,
            chain: Chain,
            asset: Asset,
            amount: BalanceOf<T>,
            destination_address: T::AccountId,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Validate amount
            ensure!(!amount.is_zero(), Error::<T>::InvalidAmount);
            ensure!(amount >= T::MinimumDeposit::get(), Error::<T>::InvalidAmount);

            let current_block = frame_system::Pallet::<T>::block_number();
            let deposit_id = Self::next_deposit_id();

            let deposit_info = DepositInfo {
                chain,
                asset,
                amount,
                depositor: who.clone(),
                destination: destination_address.clone(),
                confirmations: 0,
                confirmed_by: BoundedVec::new(),
                status: DepositStatus::Pending,
                created_at: current_block,
                external_tx_hash: None,
            };

            // Store the deposit
            PendingDeposits::<T>::insert(&deposit_id, &deposit_info);
            
            // Increment deposit ID for next use
            NextDepositId::<T>::put(deposit_id.saturating_add(1));

            // Emit event
            Self::deposit_event(Event::DepositInitiated {
                deposit_id,
                chain,
                asset,
                amount,
                depositor: who,
                destination: destination_address,
            });

            Ok(())
        }

        /// Confirm a deposit from an external chain.
        ///
        /// Only authorized bridge validators can call this function.
        /// When the confirmation threshold is reached, tokens are automatically minted.
        ///
        /// Parameters:
        /// - `deposit_id`: The ID of the deposit to confirm
        /// - `tx_hash`: The transaction hash on the external chain
        ///
        /// Emits `DepositConfirmed` and potentially `DepositCompleted` events.
        #[pallet::call_index(1)]
        #[pallet::weight(T::WeightInfo::confirm_deposit())]
        pub fn confirm_deposit(
            origin: OriginFor<T>,
            deposit_id: u64,
            tx_hash: H256,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Ensure caller is a validator
            let validators = Self::bridge_validators();
            ensure!(validators.contains(&who), Error::<T>::NotValidator);

            // Get the deposit
            let mut deposit = Self::pending_deposits(&deposit_id)
                .ok_or(Error::<T>::DepositNotFound)?;

            // Check if already completed
            ensure!(deposit.status != DepositStatus::Completed, Error::<T>::DepositAlreadyCompleted);

            // Check if validator already confirmed
            ensure!(!deposit.confirmed_by.contains(&who), Error::<T>::AlreadyConfirmed);

            // Add confirmation
            deposit.confirmed_by.try_push(who.clone())
                .map_err(|_| Error::<T>::MaxValidatorsReached)?;
            deposit.confirmations = deposit.confirmations.saturating_add(1);
            deposit.external_tx_hash = Some(tx_hash);

            let threshold = Self::confirmation_threshold();

            // Emit confirmation event
            Self::deposit_event(Event::DepositConfirmed {
                deposit_id,
                validator: who,
                confirmations: deposit.confirmations,
                threshold,
            });

            // Check if threshold reached
            if deposit.confirmations >= threshold {
                // Mark as completed
                deposit.status = DepositStatus::Completed;

                // Mint tokens to destination
                let _imbalance = T::Currency::deposit_creating(&deposit.destination, deposit.amount);

                // Update total bridged in
                let current_total = Self::total_bridged_in(&deposit.asset);
                TotalBridgedIn::<T>::insert(&deposit.asset, current_total.saturating_add(deposit.amount));

                // Emit completion event
                Self::deposit_event(Event::DepositCompleted {
                    deposit_id,
                    depositor: deposit.depositor.clone(),
                    amount_minted: deposit.amount,
                    external_tx_hash: tx_hash,
                });

                // Remove from pending deposits
                PendingDeposits::<T>::remove(&deposit_id);
            } else {
                // Update the deposit with new confirmation
                PendingDeposits::<T>::insert(&deposit_id, &deposit);
            }

            Ok(())
        }

        /// Initiate a withdrawal to an external chain.
        ///
        /// User's tokens are immediately burned/reserved and validators are notified
        /// to process the withdrawal on the external chain.
        ///
        /// Parameters:
        /// - `chain`: The external blockchain to send funds to
        /// - `asset`: The type of asset being withdrawn
        /// - `amount`: The amount of asset to withdraw
        /// - `external_address`: The address on the external chain to receive funds
        ///
        /// Emits `WithdrawalInitiated` event on success.
        #[pallet::call_index(2)]
        #[pallet::weight(T::WeightInfo::initiate_withdrawal())]
        pub fn initiate_withdrawal(
            origin: OriginFor<T>,
            chain: Chain,
            asset: Asset,
            amount: BalanceOf<T>,
            external_address: BoundedVec<u8, ConstU32<64>>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Validate amount
            ensure!(!amount.is_zero(), Error::<T>::InvalidAmount);
            ensure!(amount <= T::MaximumWithdrawal::get(), Error::<T>::InvalidAmount);

            // Check user has sufficient balance
            ensure!(
                T::Currency::free_balance(&who) >= amount,
                Error::<T>::InsufficientBalance
            );

            // Reserve/burn the tokens immediately
            let _imbalance = T::Currency::withdraw(
                &who,
                amount,
                frame_support::traits::WithdrawReasons::TRANSFER,
                frame_support::traits::ExistenceRequirement::KeepAlive,
            )?;

            let current_block = frame_system::Pallet::<T>::block_number();
            let withdrawal_id = Self::next_withdrawal_id();

            let withdrawal_info = WithdrawalInfo {
                chain,
                asset,
                amount,
                withdrawer: who.clone(),
                external_address: external_address.clone(),
                confirmations: 0,
                confirmed_by: BoundedVec::new(),
                status: WithdrawalStatus::Pending,
                created_at: current_block,
                external_tx_hash: None,
            };

            // Store the withdrawal
            PendingWithdrawals::<T>::insert(&withdrawal_id, &withdrawal_info);
            
            // Increment withdrawal ID for next use
            NextWithdrawalId::<T>::put(withdrawal_id.saturating_add(1));

            // Update total bridged out
            let current_total = Self::total_bridged_out(&asset);
            TotalBridgedOut::<T>::insert(&asset, current_total.saturating_add(amount));

            // Emit event
            Self::deposit_event(Event::WithdrawalInitiated {
                withdrawal_id,
                chain,
                asset,
                amount,
                withdrawer: who,
                external_address,
            });

            Ok(())
        }

        /// Confirm a withdrawal has been processed on an external chain.
        ///
        /// Only authorized bridge validators can call this function.
        /// When the confirmation threshold is reached, the withdrawal is marked as completed.
        ///
        /// Parameters:
        /// - `withdrawal_id`: The ID of the withdrawal to confirm
        /// - `tx_hash`: The transaction hash on the external chain
        ///
        /// Emits `WithdrawalConfirmed` and potentially `WithdrawalCompleted` events.
        #[pallet::call_index(3)]
        #[pallet::weight(T::WeightInfo::confirm_withdrawal())]
        pub fn confirm_withdrawal(
            origin: OriginFor<T>,
            withdrawal_id: u64,
            tx_hash: H256,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Ensure caller is a validator
            let validators = Self::bridge_validators();
            ensure!(validators.contains(&who), Error::<T>::NotValidator);

            // Get the withdrawal
            let mut withdrawal = Self::pending_withdrawals(&withdrawal_id)
                .ok_or(Error::<T>::WithdrawalNotFound)?;

            // Check if already completed
            ensure!(withdrawal.status != WithdrawalStatus::Completed, Error::<T>::WithdrawalAlreadyCompleted);

            // Check if validator already confirmed
            ensure!(!withdrawal.confirmed_by.contains(&who), Error::<T>::AlreadyConfirmed);

            // Add confirmation
            withdrawal.confirmed_by.try_push(who.clone())
                .map_err(|_| Error::<T>::MaxValidatorsReached)?;
            withdrawal.confirmations = withdrawal.confirmations.saturating_add(1);
            withdrawal.external_tx_hash = Some(tx_hash);

            let threshold = Self::confirmation_threshold();

            // Emit confirmation event
            Self::deposit_event(Event::WithdrawalConfirmed {
                withdrawal_id,
                validator: who,
                confirmations: withdrawal.confirmations,
                threshold,
            });

            // Check if threshold reached
            if withdrawal.confirmations >= threshold {
                // Mark as completed
                withdrawal.status = WithdrawalStatus::Completed;

                // Emit completion event
                Self::deposit_event(Event::WithdrawalCompleted {
                    withdrawal_id,
                    withdrawer: withdrawal.withdrawer.clone(),
                    external_tx_hash: tx_hash,
                });

                // Remove from pending withdrawals
                PendingWithdrawals::<T>::remove(&withdrawal_id);
            } else {
                // Update the withdrawal with new confirmation
                PendingWithdrawals::<T>::insert(&withdrawal_id, &withdrawal);
            }

            Ok(())
        }

        /// Add a new bridge validator.
        ///
        /// Only root can call this function.
        ///
        /// Parameters:
        /// - `validator`: The account to add as a validator
        ///
        /// Emits `ValidatorAdded` event on success.
        #[pallet::call_index(4)]
        #[pallet::weight(T::WeightInfo::add_validator())]
        pub fn add_validator(
            origin: OriginFor<T>,
            validator: T::AccountId,
        ) -> DispatchResult {
            ensure_root(origin)?;

            let mut validators = Self::bridge_validators();
            
            // Check if validator already exists
            ensure!(!validators.contains(&validator), Error::<T>::ValidatorAlreadyExists);

            // Add validator
            validators.try_push(validator.clone())
                .map_err(|_| Error::<T>::MaxValidatorsReached)?;

            BridgeValidators::<T>::put(&validators);

            // Emit event (use default for root origin)
            Self::deposit_event(Event::ValidatorAdded {
                validator,
                added_by: Self::account_id(), // Pallet account as placeholder
            });

            Ok(())
        }

        /// Remove a bridge validator.
        ///
        /// Only root can call this function.
        ///
        /// Parameters:
        /// - `validator`: The account to remove from validators
        ///
        /// Emits `ValidatorRemoved` event on success.
        #[pallet::call_index(5)]
        #[pallet::weight(T::WeightInfo::remove_validator())]
        pub fn remove_validator(
            origin: OriginFor<T>,
            validator: T::AccountId,
        ) -> DispatchResult {
            ensure_root(origin)?;

            let mut validators = Self::bridge_validators();
            
            // Find and remove validator
            let pos = validators.iter().position(|v| v == &validator)
                .ok_or(Error::<T>::ValidatorNotFound)?;
            validators.remove(pos);

            BridgeValidators::<T>::put(&validators);

            // Emit event (use pallet account as placeholder for root)
            Self::deposit_event(Event::ValidatorRemoved {
                validator,
                removed_by: Self::account_id(), // Pallet account as placeholder
            });

            Ok(())
        }

        /// Set the confirmation threshold for bridge operations.
        ///
        /// Only root can call this function.
        ///
        /// Parameters:
        /// - `threshold`: The new confirmation threshold
        ///
        /// Emits `ConfirmationThresholdUpdated` event on success.
        #[pallet::call_index(6)]
        #[pallet::weight(T::WeightInfo::set_confirmation_threshold())]
        pub fn set_confirmation_threshold(
            origin: OriginFor<T>,
            threshold: u32,
        ) -> DispatchResult {
            ensure_root(origin)?;

            let validators = Self::bridge_validators();
            
            // Ensure threshold is not higher than validator count
            ensure!(
                threshold <= validators.len() as u32,
                Error::<T>::ThresholdTooHigh
            );

            let old_threshold = Self::confirmation_threshold();
            ConfirmationThreshold::<T>::put(threshold);

            // Emit event
            Self::deposit_event(Event::ConfirmationThresholdUpdated {
                old_threshold,
                new_threshold: threshold,
            });

            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        /// Generate an account ID from the pallet index.
        /// Used as a placeholder for root origin events.
        pub fn account_id() -> T::AccountId {
            // Use the pallet's module index to generate a unique account
            let pallet_id: &[u8] = b"py/bridg";
            let entropy = (pallet_id, frame_system::Pallet::<T>::block_number()).using_encoded(blake2_256);
            T::AccountId::decode(&mut &entropy[..]).unwrap_or_else(|_| {
                // Fallback: use zeros
                T::AccountId::decode(&mut sp_runtime::traits::TrailingZeroInput::new(&[][..])).expect("infinite input; qed")
            })
        }

        /// Get deposit information by ID.
        pub fn get_deposit_info(
            deposit_id: &u64,
        ) -> Option<DepositInfo<T::AccountId, BalanceOf<T>, BlockNumberFor<T>>> {
            Self::pending_deposits(deposit_id)
        }

        /// Get withdrawal information by ID.
        pub fn get_withdrawal_info(
            withdrawal_id: &u64,
        ) -> Option<WithdrawalInfo<T::AccountId, BalanceOf<T>, BlockNumberFor<T>>> {
            Self::pending_withdrawals(withdrawal_id)
        }

        /// Check if an account is a bridge validator.
        pub fn is_validator(account: &T::AccountId) -> bool {
            Self::bridge_validators().contains(account)
        }

        /// Get the total number of bridge validators.
        pub fn validator_count() -> u32 {
            Self::bridge_validators().len() as u32
        }
    }

    /// Genesis configuration for the bridge pallet.
    #[pallet::genesis_config]
    #[derive(frame_support::DefaultNoBound)]
    pub struct GenesisConfig<T: Config> {
        /// Initial bridge validators.
        pub validators: Vec<T::AccountId>,
        /// Initial confirmation threshold.
        pub confirmation_threshold: u32,
    }

    #[pallet::genesis_build]
    impl<T: Config> BuildGenesisConfig for GenesisConfig<T> {
        fn build(&self) {
            // Set initial validators
            let bounded_validators: BoundedVec<T::AccountId, T::MaxValidators> = 
                self.validators.clone().try_into()
                    .expect("Too many initial validators");
            BridgeValidators::<T>::put(bounded_validators);

            // Set initial confirmation threshold
            ConfirmationThreshold::<T>::put(self.confirmation_threshold);

            // Initialize counters
            NextDepositId::<T>::put(1u64);
            NextWithdrawalId::<T>::put(1u64);
        }
    }
}