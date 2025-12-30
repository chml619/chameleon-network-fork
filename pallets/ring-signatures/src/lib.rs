//! # Ring Signatures Pallet
//!
//! A FRAME pallet for ring signature verification enabling transaction privacy
//! in the Chameleon Network. Ring signatures allow a user to sign a message
//! on behalf of a group (ring) without revealing which member actually signed.
//!
//! ## Overview
//!
//! This pallet provides:
//! - Ring signature verification using Curve25519
//! - Key image tracking to prevent double-spending
//! - Configurable ring size for privacy/performance tradeoff
//!
//! ## Key Concepts
//!
//! - **Ring Signature**: A cryptographic signature that proves the signer is
//!   a member of a group without revealing which member.
//! - **Key Image**: A unique identifier derived from the signer's private key
//!   that prevents the same key from signing twice (double-spend protection).
//! - **Ring Members**: Public keys that form the anonymity set.
//!
//! ## Usage
//!
//! This pallet is used internally by `pallet-confidential-transfer` to verify
//! ring signatures on private transactions.

#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

#[cfg(feature = "runtime-benchmarks")]
mod benchmarking;

pub mod weights;
pub mod mlsag;
pub use weights::WeightInfo;

#[frame_support::pallet]
pub mod pallet {
    use super::*;
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;
    use sp_std::vec::Vec;

    /// The module configuration trait.
    #[pallet::config]
    pub trait Config: frame_system::Config {
        /// The overarching event type.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        /// Ring size (number of decoys + 1 real signer).
        /// Higher values provide more privacy but increase verification cost.
        /// Recommended: 11 (like Monero) for strong anonymity.
        #[pallet::constant]
        type RingSize: Get<u32>;

        /// Maximum ring size allowed (for DoS protection).
        #[pallet::constant]
        type MaxRingSize: Get<u32>;

        /// Weight information for extrinsics in this pallet.
        type WeightInfo: WeightInfo;
    }

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    /// Storage for used key images.
    /// Once a key image is used, it cannot be used again (double-spend protection).
    #[pallet::storage]
    #[pallet::getter(fn used_key_images)]
    pub type UsedKeyImages<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        [u8; 32],  // Key image
        BlockNumberFor<T>,  // Block number when used
        OptionQuery,
    >;

    /// Total count of verified ring signatures (for metrics).
    #[pallet::storage]
    #[pallet::getter(fn total_signatures_verified)]
    pub type TotalSignaturesVerified<T: Config> = StorageValue<_, u64, ValueQuery>;

    /// Events emitted by this pallet.
    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// A ring signature was successfully verified.
        RingSignatureVerified {
            /// The key image that was used.
            key_image: [u8; 32],
            /// The ring size used for verification.
            ring_size: u32,
            /// Block number when verified.
            block_number: BlockNumberFor<T>,
        },
        /// A key image was marked as used.
        KeyImageRecorded {
            key_image: [u8; 32],
        },
    }

    /// Errors that can occur in this pallet.
    #[pallet::error]
    pub enum Error<T> {
        /// The ring signature verification failed.
        InvalidRingSignature,
        /// The key image has already been used (double-spend attempt).
        KeyImageAlreadyUsed,
        /// The ring size does not match the configured size.
        InvalidRingSize,
        /// The ring size exceeds the maximum allowed.
        RingSizeTooLarge,
        /// The signature data is malformed.
        MalformedSignature,
        /// Invalid key image.
        InvalidKeyImage,
        /// Invalid signature.
        InvalidSignature,
        /// The message hash is invalid.
        InvalidMessageHash,
        /// One or more ring members have invalid public keys.
        InvalidRingMember,
    }

    /// Dispatchable functions (extrinsics).
    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Verify a ring signature.
        ///
        /// This is typically called internally by `pallet-confidential-transfer`,
        /// but can be called directly for testing or by other pallets.
        ///
        /// ## Arguments
        /// - `origin`: The transaction origin (must be signed).
        /// - `ring_members`: Vector of public keys forming the ring.
        /// - `key_image`: The key image (unique per signing key).
        /// - `signature`: The ring signature bytes.
        /// - `message`: The message that was signed.
        ///
        /// ## Errors
        /// - `InvalidRingSize`: Ring size doesn't match configuration.
        /// - `KeyImageAlreadyUsed`: Double-spend attempt detected.
        /// - `InvalidRingSignature`: Signature verification failed.
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::verify_ring_signature())]
        pub fn verify_ring_signature(
            origin: OriginFor<T>,
            ring_members: Vec<[u8; 32]>,
            key_image: [u8; 32],
            signature: Vec<u8>,
            message: Vec<u8>,
        ) -> DispatchResult {
            let _who = ensure_signed(origin)?;

            // Validate ring size
            let ring_size = ring_members.len() as u32;
            ensure!(
                ring_size == T::RingSize::get(),
                Error::<T>::InvalidRingSize
            );
            ensure!(
                ring_size <= T::MaxRingSize::get(),
                Error::<T>::RingSizeTooLarge
            );

            // Check key image hasn't been used
            ensure!(
                !UsedKeyImages::<T>::contains_key(&key_image),
                Error::<T>::KeyImageAlreadyUsed
            );

            // Verify the ring signature
            Self::verify_signature_internal(&ring_members, &key_image, &signature, &message)?;

            // Mark key image as used
            let current_block = frame_system::Pallet::<T>::block_number();
            UsedKeyImages::<T>::insert(&key_image, current_block);

            // Update metrics
            TotalSignaturesVerified::<T>::mutate(|count| *count = count.saturating_add(1));

            // Emit events
            Self::deposit_event(Event::KeyImageRecorded { key_image });
            Self::deposit_event(Event::RingSignatureVerified {
                key_image,
                ring_size,
                block_number: current_block,
            });

            Ok(())
        }
    }

    /// Internal helper functions.
    impl<T: Config> Pallet<T> {
        /// Internal ring signature verification using MLSAG.
        ///
        /// Implements full Curve25519-based MLSAG (Multilayered Linkable
        /// Spontaneous Anonymous Group) signature verification.
        fn verify_signature_internal(
            ring_members: &[[u8; 32]],
            key_image: &[u8; 32],
            signature: &[u8],
            message: &[u8],
        ) -> DispatchResult {
            // Validate ring size
            ensure!(
                ring_members.len() >= 2,
                Error::<T>::InvalidRingSize
            );
            ensure!(
                ring_members.len() <= T::MaxRingSize::get() as usize,
                Error::<T>::InvalidRingSize
            );

            // Validate ring members are non-zero
            for member in ring_members.iter() {
                ensure!(
                    member != &[0u8; 32],
                    Error::<T>::InvalidRingMember
                );
            }

            // Verify key image is valid
            crate::mlsag::verify_key_image(key_image)
                .map_err(|_| Error::<T>::InvalidKeyImage)?;

            // Verify MLSAG signature
            crate::mlsag::verify_mlsag(ring_members, key_image, signature, message)
                .map_err(|e| {
                    log::debug!(
                        target: "runtime::ring-signatures",
                        "MLSAG verification failed: {}", e
                    );
                    Error::<T>::InvalidSignature
                })?;

            log::debug!(
                target: "runtime::ring-signatures",
                "MLSAG signature verification passed"
            );

            Ok(())
        }
        /// Check if a key image has been used.
        pub fn is_key_image_used(key_image: &[u8; 32]) -> bool {
            UsedKeyImages::<T>::contains_key(key_image)
        }

        /// Get the block number when a key image was used.
        pub fn key_image_used_at(key_image: &[u8; 32]) -> Option<BlockNumberFor<T>> {
            UsedKeyImages::<T>::get(key_image)
        }
    }
}
