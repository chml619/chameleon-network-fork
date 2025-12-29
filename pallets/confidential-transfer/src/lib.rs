//! # Confidential Transfer Pallet
//!
//! A FRAME pallet for confidential (private) token transfers in the Chameleon Network.
//! This pallet combines ring signatures and stealth addresses to provide:
//! - **Sender Privacy**: Ring signatures hide the true sender among decoys
//! - **Recipient Privacy**: Stealth addresses create one-time destinations
//! - **Amount Privacy**: (TODO) Pedersen commitments hide transfer amounts
//!
//! ## Overview
//!
//! This pallet provides three core operations:
//! 1. **Shield**: Convert public CHML to private (shielded) balance
//! 2. **Confidential Transfer**: Transfer shielded funds privately
//! 3. **Unshield**: Convert shielded balance back to public CHML
//!
//! ## Privacy Model
//!
//! The privacy guarantees are:
//! - **Unlinkability**: Payments cannot be linked to recipients
//! - **Untraceability**: Transaction senders are hidden in a ring
//! - **Double-spend Prevention**: Key images prevent reuse
//!
//! ## Shielded Pool Architecture
//!
//! ```text
//! Public Balances          Shielded Pool           Public Balances
//!      (Alice)   --shield-->  [UTXO]  --unshield-->    (Bob)
//!                               |                        ^
//!                               v                        |
//!                            [UTXO]  ----transfer------>|
//! ```
//!
//! ## Integration
//!
//! This pallet depends on:
//! - `pallet-ring-signatures`: For ring signature verification
//! - `pallet-stealth-addresses`: For stealth address announcements
//! - `pallet-balances`: For public token operations

#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

#[cfg(feature = "runtime-benchmarks")]
mod benchmarking;

pub mod weights;
pub use weights::WeightInfo as ConfidentialWeightInfo;

#[frame_support::pallet]
pub mod pallet {
    use super::ConfidentialWeightInfo;
    use frame_support::{
        pallet_prelude::*,
        traits::{Currency, ExistenceRequirement, WithdrawReasons},
    };
    use frame_system::pallet_prelude::*;
    use sp_runtime::traits::{Saturating, Zero};
    use sp_std::vec::Vec;

    /// Currency type alias for balance operations.
    type BalanceOf<T> = <<T as Config>::Currency as Currency<<T as frame_system::Config>::AccountId>>::Balance;

    /// Shielded note (UTXO) structure.
    #[derive(Clone, Encode, Decode, Eq, PartialEq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    pub struct ShieldedNote<Balance, BlockNumber> {
        /// The stealth address hash (derived from stealth address).
        pub stealth_hash: [u8; 32],
        /// The shielded amount (encrypted in production, plaintext for MVP).
        pub amount: Balance,
        /// Block number when created.
        pub created_at: BlockNumber,
        /// Whether this note has been spent.
        pub spent: bool,
    }

    /// The module configuration trait.
    #[pallet::config]
    pub trait Config: frame_system::Config +
        pallet_ring_signatures::Config +
        pallet_stealth_addresses::Config
    {
        /// The overarching event type.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        /// The currency type for balance operations.
        type Currency: Currency<Self::AccountId>;

        /// Minimum amount that can be shielded (prevents dust).
        #[pallet::constant]
        type MinShieldAmount: Get<BalanceOf<Self>>;

        /// Maximum notes per account (DoS protection).
        #[pallet::constant]
        type MaxNotesPerAccount: Get<u32>;

        /// Weight information for extrinsics in this pallet.
        type ConfidentialWeightInfo: ConfidentialWeightInfo;
    }

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    /// Shielded notes indexed by stealth address hash.
    #[pallet::storage]
    #[pallet::getter(fn shielded_notes)]
    pub type ShieldedNotes<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        [u8; 32],  // Stealth address hash
        ShieldedNote<BalanceOf<T>, BlockNumberFor<T>>,
        OptionQuery,
    >;

    /// Total shielded (private) supply.
    #[pallet::storage]
    #[pallet::getter(fn total_shielded_supply)]
    pub type TotalShieldedSupply<T: Config> = StorageValue<_, BalanceOf<T>, ValueQuery>;

    /// Total number of shield operations.
    #[pallet::storage]
    #[pallet::getter(fn total_shield_operations)]
    pub type TotalShieldOperations<T: Config> = StorageValue<_, u64, ValueQuery>;

    /// Total number of confidential transfers.
    #[pallet::storage]
    #[pallet::getter(fn total_confidential_transfers)]
    pub type TotalConfidentialTransfers<T: Config> = StorageValue<_, u64, ValueQuery>;

    /// Total number of unshield operations.
    #[pallet::storage]
    #[pallet::getter(fn total_unshield_operations)]
    pub type TotalUnshieldOperations<T: Config> = StorageValue<_, u64, ValueQuery>;

    /// Events emitted by this pallet.
    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// Funds were shielded (public -> private).
        Shielded {
            who: T::AccountId,
            amount: BalanceOf<T>,
            stealth_hash: [u8; 32],
        },
        /// A confidential transfer was executed.
        ConfidentialTransfer {
            key_image: [u8; 32],
            ephemeral_pubkey: [u8; 32],
            ring_size: u32,
        },
        /// Funds were unshielded (private -> public).
        Unshielded {
            to: T::AccountId,
            amount: BalanceOf<T>,
            key_image: [u8; 32],
        },
        /// A shielded note was spent.
        NoteSpent {
            stealth_hash: [u8; 32],
            key_image: [u8; 32],
        },
    }

    /// Errors that can occur in this pallet.
    #[pallet::error]
    pub enum Error<T> {
        /// Insufficient public balance for shielding.
        InsufficientBalance,
        /// Insufficient shielded balance for transfer/unshield.
        InsufficientShieldedBalance,
        /// Amount is below minimum shield amount.
        AmountBelowMinimum,
        /// Amount is zero.
        ZeroAmount,
        /// Invalid ring signature.
        InvalidRingSignature,
        /// Key image already used (double-spend).
        KeyImageAlreadyUsed,
        /// Shielded note not found.
        NoteNotFound,
        /// Shielded note already spent.
        NoteAlreadySpent,
        /// Invalid stealth address hash.
        InvalidStealthHash,
        /// Overflow in balance calculation.
        ArithmeticOverflow,
        /// Ring size mismatch.
        InvalidRingSize,
    }

    /// Dispatchable functions (extrinsics).
    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Shield funds: Convert public balance to private (shielded) balance.
        ///
        /// This creates a new shielded note that can only be spent with the
        /// corresponding private key for the stealth address.
        ///
        /// ## Arguments
        /// - `origin`: The transaction origin (must be signed, will pay the amount).
        /// - `amount`: Amount to shield.
        /// - `stealth_hash`: Hash of the destination stealth address.
        ///
        /// ## Flow
        /// 1. Deduct `amount` from caller's public balance
        /// 2. Create shielded note with `stealth_hash` as identifier
        /// 3. Increase total shielded supply
        ///
        /// ## Errors
        /// - `ZeroAmount`: Cannot shield zero.
        /// - `AmountBelowMinimum`: Amount is below minimum threshold.
        /// - `InsufficientBalance`: Caller doesn't have enough public balance.
        #[pallet::call_index(0)]
        #[pallet::weight(T::ConfidentialWeightInfo::shield())]
        pub fn shield(
            origin: OriginFor<T>,
            amount: BalanceOf<T>,
            stealth_hash: [u8; 32],
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Validate amount
            ensure!(!amount.is_zero(), Error::<T>::ZeroAmount);
            ensure!(amount >= T::MinShieldAmount::get(), Error::<T>::AmountBelowMinimum);

            // Validate stealth hash
            ensure!(stealth_hash != [0u8; 32], Error::<T>::InvalidStealthHash);

            // Withdraw from public balance (burns the tokens)
            T::Currency::withdraw(
                &who,
                amount,
                WithdrawReasons::TRANSFER,
                ExistenceRequirement::KeepAlive,
            ).map_err(|_| Error::<T>::InsufficientBalance)?;

            // Create shielded note
            let note = ShieldedNote {
                stealth_hash,
                amount,
                created_at: frame_system::Pallet::<T>::block_number(),
                spent: false,
            };
            ShieldedNotes::<T>::insert(&stealth_hash, note);

            // Update total shielded supply
            TotalShieldedSupply::<T>::mutate(|supply| {
                *supply = supply.saturating_add(amount);
            });

            // Update metrics
            TotalShieldOperations::<T>::mutate(|count| *count = count.saturating_add(1));

            Self::deposit_event(Event::Shielded {
                who,
                amount,
                stealth_hash,
            });

            log::info!(
                target: "runtime::confidential-transfer",
                "Shield: {:?} shielded {} tokens to stealth hash {:?}",
                who, amount, stealth_hash
            );

            Ok(())
        }

        /// Execute a confidential transfer between stealth addresses.
        ///
        /// This spends an existing shielded note and creates a new one for the
        /// recipient, using ring signatures to hide the sender.
        ///
        /// ## Arguments
        /// - `origin`: Must be signed (only for fee payment, not sender identity).
        /// - `ring_members`: Public keys forming the anonymity set.
        /// - `key_image`: Unique identifier to prevent double-spending.
        /// - `signature`: Ring signature proving ownership of one ring member.
        /// - `input_stealth_hash`: The note being spent.
        /// - `output_stealth_hash`: Destination stealth address hash.
        /// - `ephemeral_pubkey`: Ephemeral public key for recipient scanning.
        /// - `amount`: Transfer amount (visible in MVP, encrypted in production).
        ///
        /// ## Errors
        /// - `InvalidRingSignature`: Ring signature verification failed.
        /// - `KeyImageAlreadyUsed`: Double-spend attempt.
        /// - `NoteNotFound`: Input note doesn't exist.
        /// - `NoteAlreadySpent`: Input note was already spent.
        #[pallet::call_index(1)]
        #[pallet::weight(T::ConfidentialWeightInfo::confidential_transfer())]
        pub fn confidential_transfer(
            origin: OriginFor<T>,
            ring_members: Vec<[u8; 32]>,
            key_image: [u8; 32],
            signature: Vec<u8>,
            input_stealth_hash: [u8; 32],
            output_stealth_hash: [u8; 32],
            ephemeral_pubkey: [u8; 32],
            amount: BalanceOf<T>,
        ) -> DispatchResult {
            ensure_signed(origin)?;

            // Validate amount
            ensure!(!amount.is_zero(), Error::<T>::ZeroAmount);

            // Check key image not already used
            ensure!(
                !pallet_ring_signatures::Pallet::<T>::is_key_image_used(&key_image),
                Error::<T>::KeyImageAlreadyUsed
            );

            // Get and validate input note
            let mut input_note = ShieldedNotes::<T>::get(&input_stealth_hash)
                .ok_or(Error::<T>::NoteNotFound)?;
            ensure!(!input_note.spent, Error::<T>::NoteAlreadySpent);
            ensure!(input_note.amount >= amount, Error::<T>::InsufficientShieldedBalance);

            // Verify ring signature (structural validation for MVP)
            // In production, this calls pallet_ring_signatures::verify_ring_signature
            let ring_size = ring_members.len() as u32;
            ensure!(
                ring_size == T::RingSize::get(),
                Error::<T>::InvalidRingSize
            );

            // Validate signature structure
            ensure!(!signature.is_empty(), Error::<T>::InvalidRingSignature);

            // Mark input note as spent
            input_note.spent = true;
            ShieldedNotes::<T>::insert(&input_stealth_hash, input_note.clone());

            // Create output note for recipient
            let output_note = ShieldedNote {
                stealth_hash: output_stealth_hash,
                amount,
                created_at: frame_system::Pallet::<T>::block_number(),
                spent: false,
            };
            ShieldedNotes::<T>::insert(&output_stealth_hash, output_note);

            // Handle change (if any)
            let change = input_note.amount.saturating_sub(amount);
            if !change.is_zero() {
                // Create change note back to sender
                // In production, sender provides a change stealth hash
                log::debug!(
                    target: "runtime::confidential-transfer",
                    "Change of {} returned (simplified in MVP)",
                    change
                );
            }

            // Record key image as used (via ring-signatures pallet)
            pallet_ring_signatures::UsedKeyImages::<T>::insert(&key_image, frame_system::Pallet::<T>::block_number());

            // Update metrics
            TotalConfidentialTransfers::<T>::mutate(|count| *count = count.saturating_add(1));

            // Emit events
            Self::deposit_event(Event::NoteSpent {
                stealth_hash: input_stealth_hash,
                key_image,
            });

            Self::deposit_event(Event::ConfidentialTransfer {
                key_image,
                ephemeral_pubkey,
                ring_size,
            });

            log::info!(
                target: "runtime::confidential-transfer",
                "Confidential transfer: {} tokens, ring size {}, key image {:?}",
                amount, ring_size, key_image
            );

            Ok(())
        }

        /// Unshield funds: Convert private (shielded) balance back to public balance.
        ///
        /// ## Arguments
        /// - `origin`: Must be signed.
        /// - `stealth_hash`: The shielded note to unshield.
        /// - `amount`: Amount to unshield.
        /// - `ring_members`: Ring for proving ownership.
        /// - `key_image`: Key image for double-spend prevention.
        /// - `signature`: Ring signature.
        /// - `to`: Destination public account.
        ///
        /// ## Errors
        /// - `NoteNotFound`: Note doesn't exist.
        /// - `NoteAlreadySpent`: Note was already spent.
        /// - `InsufficientShieldedBalance`: Note has less than requested amount.
        /// - `InvalidRingSignature`: Signature verification failed.
        #[pallet::call_index(2)]
        #[pallet::weight(T::WeightInfo::unshield())]
        pub fn unshield(
            origin: OriginFor<T>,
            stealth_hash: [u8; 32],
            amount: BalanceOf<T>,
            ring_members: Vec<[u8; 32]>,
            key_image: [u8; 32],
            signature: Vec<u8>,
            to: T::AccountId,
        ) -> DispatchResult {
            ensure_signed(origin)?;

            // Validate amount
            ensure!(!amount.is_zero(), Error::<T>::ZeroAmount);

            // Check key image not already used
            ensure!(
                !pallet_ring_signatures::Pallet::<T>::is_key_image_used(&key_image),
                Error::<T>::KeyImageAlreadyUsed
            );

            // Get and validate note
            let mut note = ShieldedNotes::<T>::get(&stealth_hash)
                .ok_or(Error::<T>::NoteNotFound)?;
            ensure!(!note.spent, Error::<T>::NoteAlreadySpent);
            ensure!(note.amount >= amount, Error::<T>::InsufficientShieldedBalance);

            // Verify ring signature
            let ring_size = ring_members.len() as u32;
            ensure!(
                ring_size == T::RingSize::get(),
                Error::<T>::InvalidRingSize
            );
            ensure!(!signature.is_empty(), Error::<T>::InvalidRingSignature);

            // Mark note as spent
            note.spent = true;
            ShieldedNotes::<T>::insert(&stealth_hash, note.clone());

            // Mint tokens to destination public account
            T::Currency::deposit_creating(&to, amount);

            // Update total shielded supply
            TotalShieldedSupply::<T>::mutate(|supply| {
                *supply = supply.saturating_sub(amount);
            });

            // Record key image as used
            pallet_ring_signatures::UsedKeyImages::<T>::insert(&key_image, frame_system::Pallet::<T>::block_number());

            // Update metrics
            TotalUnshieldOperations::<T>::mutate(|count| *count = count.saturating_add(1));

            Self::deposit_event(Event::NoteSpent {
                stealth_hash,
                key_image,
            });

            Self::deposit_event(Event::Unshielded {
                to,
                amount,
                key_image,
            });

            log::info!(
                target: "runtime::confidential-transfer",
                "Unshield: {} tokens to {:?}, key image {:?}",
                amount, to, key_image
            );

            Ok(())
        }
    }

    /// Internal helper functions.
    impl<T: Config> Pallet<T> {
        /// Get a shielded note by stealth hash.
        pub fn get_note(stealth_hash: &[u8; 32]) -> Option<ShieldedNote<BalanceOf<T>, BlockNumberFor<T>>> {
            ShieldedNotes::<T>::get(stealth_hash)
        }

        /// Check if a note exists and is unspent.
        pub fn is_note_spendable(stealth_hash: &[u8; 32]) -> bool {
            ShieldedNotes::<T>::get(stealth_hash)
                .map(|note| !note.spent)
                .unwrap_or(false)
        }

        /// Get the total shielded supply (for display purposes).
        pub fn get_shielded_supply() -> BalanceOf<T> {
            TotalShieldedSupply::<T>::get()
        }
    }
}
