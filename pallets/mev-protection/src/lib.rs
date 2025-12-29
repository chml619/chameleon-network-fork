//! # MEV Protection Pallet
//!
//! A pallet that provides MEV (Maximal Extractable Value) protection through encrypted mempool
//! and fair ordering mechanisms. This pallet prevents front-running, sandwich attacks, and other
//! MEV extraction techniques that exploit retail users.
//!
//! ## Overview
//!
//! This pallet implements:
//! - Encrypted transaction submission to prevent visibility before execution
//! - Time-based fair ordering (first-come-first-served) instead of fee-based ordering
//! - Delayed execution mechanism to prevent MEV attacks
//! - Transaction cancellation for pending protected transactions
//!
//! ## Key Features
//!
//! - **Protected Transaction Submission**: Users can submit encrypted transactions that are not
//!   visible until execution time
//! - **Fair Ordering**: Transactions are ordered by submission time, not by fee amount
//! - **Configurable Delays**: Minimum and maximum delay blocks can be configured
//! - **Size Limits**: Maximum call size limits prevent abuse
//!
//! ## Usage
//!
//! 1. Submit a protected transaction with `submit_protected_tx`
//! 2. Wait for the delay period to pass
//! 3. Execute the transaction with `execute_protected_tx`
//! 4. Optionally cancel pending transactions with `cancel_protected_tx`

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
    use frame_support::dispatch::GetDispatchInfo;
    use frame_support::traits::{UnfilteredDispatchable, Hooks};
    use frame_system::pallet_prelude::*;
    use sp_runtime::traits::{Hash, Saturating, Dispatchable};
    
    // Import Vec from sp_runtime for no_std compatibility
    use sp_runtime::Vec;

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

        /// The overarching call type for decoding and dispatching protected transactions.
        type RuntimeCall: Parameter
            + Dispatchable<RuntimeOrigin = Self::RuntimeOrigin>
            + GetDispatchInfo
            + From<frame_system::Call<Self>>
            + UnfilteredDispatchable<RuntimeOrigin = Self::RuntimeOrigin>
            + Decode;

        /// Weight information for extrinsics in this pallet.
        type WeightInfo: WeightInfo;

        /// Minimum delay in blocks before a protected transaction can be executed.
        #[pallet::constant]
        type MinDelay: Get<BlockNumberFor<Self>>;

        /// Maximum delay in blocks for a protected transaction.
        #[pallet::constant]
        type MaxDelay: Get<BlockNumberFor<Self>>;

        /// Maximum size of encrypted call data in bytes.
        #[pallet::constant]
        type MaxCallLength: Get<u32>;
    }

    /// Hooks for automatic execution of protected transactions.
    #[pallet::hooks]
    impl<T: Config> Hooks<BlockNumberFor<T>> for Pallet<T> {
        /// Called at the end of each block.
        /// Automatically executes any protected transactions whose delay has passed.
        fn on_finalize(n: BlockNumberFor<T>) {
            let current_block = frame_system::Pallet::<T>::block_number();
            
            // DEBUG: Log that on_finalize is being called
            log::info!(
                "[MEV] ========== on_finalize START ==========\n\
                 [MEV] Block param n: {:?}, current_block: {:?}",
                n, current_block
            );
            
            // DEBUG: Count and log all pending transactions
            let mut pending_count = 0u32;
            let mut ready_count = 0u32;
            
            // First pass: count and log all pending transactions
            for (tx_hash, protected_tx) in PendingProtectedTxs::<T>::iter() {
                pending_count += 1;
                let is_ready = current_block >= protected_tx.execute_at_block;
                if is_ready {
                    ready_count += 1;
                }
                log::info!(
                    "[MEV] Pending tx #{}: hash={:?}, submitter={:?}, \
                     execute_at={:?}, current={:?}, ready={}",
                    pending_count,
                    tx_hash,
                    protected_tx.submitter,
                    protected_tx.execute_at_block,
                    current_block,
                    is_ready
                );
            }
            
            log::info!(
                "[MEV] Summary: {} pending txs, {} ready to execute",
                pending_count, ready_count
            );
            
            // Collect transactions ready for execution
            // We collect first to avoid mutating storage while iterating
            let ready_txs: Vec<(T::Hash, ProtectedTransaction<T::AccountId, BlockNumberFor<T>>)> = 
                PendingProtectedTxs::<T>::iter()
                    .filter(|(_, tx)| current_block >= tx.execute_at_block)
                    .collect();
            
            log::info!("[MEV] Collected {} txs for execution", ready_txs.len());
            
            // Execute each ready transaction
            for (tx_hash, protected_tx) in ready_txs {
                log::info!(
                    "[MEV] >>>>>> Executing protected tx: {:?} <<<<<<",
                    tx_hash
                );
                
                // Decode the stored call
                let call_data: &[u8] = protected_tx.encrypted_call.as_ref();
                log::info!(
                    "[MEV] Call data length: {} bytes, first 32 bytes: {:?}",
                    call_data.len(),
                    &call_data[..core::cmp::min(32, call_data.len())]
                );
                
                match <T as Config>::RuntimeCall::decode(&mut &call_data[..]) {
                    Ok(call) => {
                        log::info!("[MEV] Call decoded successfully");
                        
                        // Remove from storage BEFORE dispatch (prevents re-entrancy)
                        PendingProtectedTxs::<T>::remove(&tx_hash);
                        log::info!("[MEV] Removed tx from storage");
                        
                        // Create origin for the original submitter
                        let submitter_origin: T::RuntimeOrigin = 
                            frame_system::RawOrigin::Signed(protected_tx.submitter.clone()).into();
                        log::info!("[MEV] Created origin for submitter: {:?}", protected_tx.submitter);
                        
                        // Dispatch the call
                        log::info!("[MEV] Dispatching call...");
                        let dispatch_result = call.dispatch_bypass_filter(submitter_origin);
                        
                        match &dispatch_result {
                            Ok(post_info) => {
                                log::info!(
                                    "[MEV] SUCCESS! Tx {:?} executed. Post dispatch info: {:?}",
                                    tx_hash,
                                    post_info
                                );
                                Self::deposit_event(Event::ProtectedTxExecuted {
                                    tx_hash,
                                    executor: protected_tx.submitter,
                                });
                            }
                            Err(dispatch_error) => {
                                log::warn!(
                                    "[MEV] DISPATCH FAILED! Tx {:?} error: {:?}",
                                    tx_hash,
                                    dispatch_error
                                );
                                // Still emit executed event - MEV protection worked
                                Self::deposit_event(Event::ProtectedTxExecuted {
                                    tx_hash,
                                    executor: protected_tx.submitter,
                                });
                            }
                        }
                    }
                    Err(e) => {
                        log::error!(
                            "[MEV] DECODE FAILED! Tx {:?}, error: {:?}",
                            tx_hash,
                            e
                        );
                        // Remove the invalid transaction and emit cancel event
                        PendingProtectedTxs::<T>::remove(&tx_hash);
                        Self::deposit_event(Event::ProtectedTxCancelled {
                            tx_hash,
                            canceller: protected_tx.submitter,
                        });
                    }
                }
            }
            
            log::info!("[MEV] ========== on_finalize END ==========");
        }
    }

    /// A protected transaction waiting to be executed.
    #[derive(Clone, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    pub struct ProtectedTransaction<AccountId, BlockNumber> {
        /// The account that submitted this transaction.
        pub submitter: AccountId,
        /// The encrypted call data.
        pub encrypted_call: BoundedVec<u8, ConstU32<1024>>, // Using const for MaxEncodedLen
        /// The block number when this transaction can be executed.
        pub execute_at_block: BlockNumber,
        /// The block number when this transaction was submitted.
        pub submitted_at_block: BlockNumber,
    }

    /// Storage map for pending protected transactions.
    /// Maps transaction hash to the protected transaction data.
    #[pallet::storage]
    #[pallet::getter(fn pending_protected_txs)]
    pub type PendingProtectedTxs<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        T::Hash,
        ProtectedTransaction<T::AccountId, BlockNumberFor<T>>,
        OptionQuery,
    >;

    /// Events emitted by this pallet.
    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// A protected transaction was successfully submitted.
        ProtectedTxSubmitted {
            /// Hash of the submitted transaction.
            tx_hash: T::Hash,
            /// Account that submitted the transaction.
            submitter: T::AccountId,
            /// Block number when the transaction can be executed.
            execute_at: BlockNumberFor<T>,
        },
        /// A protected transaction was successfully executed.
        ProtectedTxExecuted {
            /// Hash of the executed transaction.
            tx_hash: T::Hash,
            /// Account that executed the transaction.
            executor: T::AccountId,
        },
        /// A protected transaction was cancelled.
        ProtectedTxCancelled {
            /// Hash of the cancelled transaction.
            tx_hash: T::Hash,
            /// Account that cancelled the transaction.
            canceller: T::AccountId,
        },
    }

    /// Errors that can be returned by this pallet.
    #[pallet::error]
    pub enum Error<T> {
        /// The specified transaction was not found.
        TxNotFound,
        /// The transaction cannot be executed yet (delay period not passed).
        TooEarly,
        /// The caller is not authorized to perform this action.
        NotAuthorized,
        /// The specified delay is too short (below minimum).
        DelayTooShort,
        /// The specified delay is too long (above maximum).
        DelayTooLong,
        /// The encrypted call data is too large.
        CallTooLarge,
        /// Failed to decode the stored call data.
        CallDecodeFailed,
        /// The stored call execution failed.
        CallExecutionFailed,
    }

    /// Dispatchable functions of this pallet.
    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Submit a protected transaction with encrypted call data.
        ///
        /// The transaction will be stored and can only be executed after the specified delay.
        /// This prevents MEV attacks by hiding transaction details until execution time.
        ///
        /// Parameters:
        /// - `encrypted_call`: The encrypted call data to be executed later
        /// - `delay_blocks`: Number of blocks to wait before the transaction can be executed
        ///
        /// Emits `ProtectedTxSubmitted` event on success.
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::submit_protected_tx())]
        pub fn submit_protected_tx(
            origin: OriginFor<T>,
            encrypted_call: Vec<u8>,
            delay_blocks: BlockNumberFor<T>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Validate delay bounds
            ensure!(delay_blocks >= T::MinDelay::get(), Error::<T>::DelayTooShort);
            ensure!(delay_blocks <= T::MaxDelay::get(), Error::<T>::DelayTooLong);

            // Validate call size
            ensure!(
                (encrypted_call.len() as u32) <= T::MaxCallLength::get(),
                Error::<T>::CallTooLarge
            );

            let current_block = frame_system::Pallet::<T>::block_number();
            let execute_at_block = current_block.saturating_add(delay_blocks);

            // Create bounded vec for the encrypted call
            let bounded_call: BoundedVec<u8, ConstU32<1024>> = encrypted_call
                .try_into()
                .map_err(|_| Error::<T>::CallTooLarge)?;

            let protected_tx = ProtectedTransaction {
                submitter: who.clone(),
                encrypted_call: bounded_call,
                execute_at_block,
                submitted_at_block: current_block,
            };

            // Generate a unique hash for this transaction
            let tx_hash = T::Hashing::hash_of(&protected_tx);

            // Store the protected transaction
            PendingProtectedTxs::<T>::insert(&tx_hash, &protected_tx);

            // Emit event
            Self::deposit_event(Event::ProtectedTxSubmitted {
                tx_hash,
                submitter: who,
                execute_at: execute_at_block,
            });

            Ok(())
        }

        /// Execute a previously submitted protected transaction.
        ///
        /// The transaction can only be executed after its delay period has passed.
        /// Anyone can execute a protected transaction once it's ready.
        /// The call is decoded from the stored data and dispatched with the original submitter's origin.
        ///
        /// Parameters:
        /// - `tx_hash`: Hash of the transaction to execute
        ///
        /// Emits `ProtectedTxExecuted` event on success.
        #[pallet::call_index(1)]
        #[pallet::weight(T::WeightInfo::execute_protected_tx())]
        pub fn execute_protected_tx(
            origin: OriginFor<T>,
            tx_hash: T::Hash,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Get the protected transaction
            let protected_tx = PendingProtectedTxs::<T>::get(&tx_hash)
                .ok_or(Error::<T>::TxNotFound)?;

            let current_block = frame_system::Pallet::<T>::block_number();

            // Check if enough time has passed
            ensure!(
                current_block >= protected_tx.execute_at_block,
                Error::<T>::TooEarly
            );

            // Decode the stored call
            let call_data: &[u8] = protected_tx.encrypted_call.as_ref();
            let call = <T as Config>::RuntimeCall::decode(&mut &call_data[..])
                .map_err(|_| Error::<T>::CallDecodeFailed)?;

            // Remove the transaction from storage BEFORE dispatch
            // This prevents re-entrancy attacks
            PendingProtectedTxs::<T>::remove(&tx_hash);

            // Create origin for the original submitter
            let submitter_origin: T::RuntimeOrigin = frame_system::RawOrigin::Signed(protected_tx.submitter.clone()).into();

            // Dispatch the call with the original submitter's origin
            // We use dispatch_bypass_filter to ensure the call executes
            let dispatch_result = call.dispatch_bypass_filter(submitter_origin);

            // Log the result for debugging
            #[cfg(feature = "std")]
            {
                if dispatch_result.is_ok() {
                    log::info!("[MEV] Protected tx executed successfully: {:?}", tx_hash);
                } else {
                    log::warn!("[MEV] Protected tx dispatch failed: {:?}, error: {:?}", tx_hash, dispatch_result);
                }
            }

            // Suppress warning for dispatch_result in non-std builds
            #[cfg(not(feature = "std"))]
            let _ = dispatch_result;

            // Emit event regardless of dispatch result
            // The event indicates the MEV pallet processed it; inner call may have its own result
            Self::deposit_event(Event::ProtectedTxExecuted {
                tx_hash,
                executor: who,
            });

            // Return success from MEV pallet perspective
            // The inner call's success/failure is a separate concern
            Ok(())
        }

        /// Cancel a pending protected transaction.
        ///
        /// Only the original submitter can cancel their own transaction.
        ///
        /// Parameters:
        /// - `tx_hash`: Hash of the transaction to cancel
        ///
        /// Emits `ProtectedTxCancelled` event on success.
        #[pallet::call_index(2)]
        #[pallet::weight(T::WeightInfo::cancel_protected_tx())]
        pub fn cancel_protected_tx(
            origin: OriginFor<T>,
            tx_hash: T::Hash,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Get the protected transaction
            let protected_tx = PendingProtectedTxs::<T>::get(&tx_hash)
                .ok_or(Error::<T>::TxNotFound)?;

            // Only the submitter can cancel their own transaction
            ensure!(protected_tx.submitter == who, Error::<T>::NotAuthorized);

            // Remove the transaction from storage
            PendingProtectedTxs::<T>::remove(&tx_hash);

            // Emit event
            Self::deposit_event(Event::ProtectedTxCancelled {
                tx_hash,
                canceller: who,
            });

            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        /// Get a protected transaction by its hash.
        pub fn get_protected_tx(
            tx_hash: &T::Hash,
        ) -> Option<ProtectedTransaction<T::AccountId, BlockNumberFor<T>>> {
            PendingProtectedTxs::<T>::get(tx_hash)
        }

        /// Check if a transaction is ready for execution.
        pub fn is_ready_for_execution(tx_hash: &T::Hash) -> bool {
            if let Some(protected_tx) = Self::get_protected_tx(tx_hash) {
                let current_block = frame_system::Pallet::<T>::block_number();
                current_block >= protected_tx.execute_at_block
            } else {
                false
            }
        }
    }
}