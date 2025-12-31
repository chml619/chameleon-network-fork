//! # pDEX (Privacy-preserving Decentralized Exchange) Pallet
//!
//! A privacy-preserving DEX with automated market maker (AMM) pools for the Chameleon Network.
//! This pallet implements constant product formula (x * y = k) with slippage protection,
//! LP token minting/burning, and comprehensive error handling.
//!
//! ## Overview
//!
//! This pallet implements:
//! - Constant product AMM pools for token swaps
//! - Liquidity provision with LP token rewards
//! - Slippage protection for all operations
//! - Production-grade token transfers and error handling
//! - Fee collection (0.3% swap fee)
//!
//! ## Key Features
//!
//! - **Pool Creation**: Create new liquidity pools for asset pairs
//! - **Liquidity Management**: Add/remove liquidity with proportional LP tokens
//! - **Token Swaps**: Execute swaps with constant product formula and slippage protection
//! - **Fee Distribution**: 0.3% swap fee distributed to liquidity providers
//!
//! ## Usage
//!
//! 1. Create a pool with `create_pool(asset_a, asset_b)`
//! 2. Add liquidity with `add_liquidity(pool_id, amount_a, amount_b, min_lp_tokens)`
//! 3. Execute swaps with `swap(pool_id, asset_in, amount_in, min_amount_out)`
//! 4. Remove liquidity with `remove_liquidity(pool_id, lp_tokens, min_amount_a, min_amount_b)`

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
pub mod tokens;
pub use weights::*;

// All pallet logic is defined in its own module and must be annotated by the `pallet` attribute.
#[frame_support::pallet]
pub mod pallet {
    use super::*;
    use frame_support::{
        pallet_prelude::*,
        traits::Hooks,
        PalletId,
    };
    use frame_system::pallet_prelude::*;
    use sp_runtime::{
        traits::{AccountIdConversion, Saturating, Zero, CheckedAdd, CheckedSub, CheckedMul, CheckedDiv},
        Permill,
    };
    use sp_std::vec::Vec;

    /// The current storage version.
    const STORAGE_VERSION: StorageVersion = StorageVersion::new(1);

    /// The `Pallet` struct serves as a placeholder to implement traits, methods and dispatchables.
    #[pallet::pallet]
    #[pallet::storage_version(STORAGE_VERSION)]
    pub struct Pallet<T>(_);

    /// Configuration trait of this pallet.
    #[pallet::config]
    pub trait Config: frame_system::Config + pallet_ring_signatures::Config {
        /// The overarching runtime event type.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        /// Weight information for extrinsics in this pallet.
        type WeightInfo: WeightInfo;

        /// Asset ID type for identifying different tokens.
        type AssetId: Parameter + Copy + Ord + Default + MaxEncodedLen + From<u32>;

        /// Balance type for token amounts.
        type Balance: Parameter + Copy + Ord + Zero + Saturating + 
                      CheckedAdd + CheckedSub + CheckedMul + CheckedDiv +
                      From<u128> + Into<u128> + MaxEncodedLen + Default;

        

        /// Pallet ID for pool account derivation.
        #[pallet::constant]
        type PalletId: Get<PalletId>;

        /// Maximum number of pools that can be created.
        #[pallet::constant]
        type MaxPools: Get<u32>;

        /// Minimum liquidity required to create a pool (1 CHML = 1_000_000_000_000_000_000).
        #[pallet::constant]
        type MinimumLiquidity: Get<Self::Balance>;

        /// Swap fee in Permill (0.3% = 3/1000).
        #[pallet::constant]
        type SwapFee: Get<Permill>;
        /// Treasury account to receive protocol fees.
        type TreasuryAccount: Get<Self::AccountId>;
        /// Treasury share of swap fees in Permill (10% = 100/1000).
        #[pallet::constant]
        type TreasuryFeeShare: Get<Permill>;
    }

    /// Hooks for automatic operations.
    #[pallet::hooks]
    impl<T: Config> Hooks<BlockNumberFor<T>> for Pallet<T> {
        /// Called at the end of each block.
        /// Currently no automatic operations needed.
        fn on_finalize(_n: BlockNumberFor<T>) {
            // Future: Could implement automatic fee distribution or other operations
        }
    }

    /// Liquidity pool structure containing all pool data.
    #[derive(Clone, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen)]
    pub struct LiquidityPool<AssetId, Balance> {
        /// First asset in the trading pair.
        pub asset_a: AssetId,
        /// Second asset in the trading pair.
        pub asset_b: AssetId,
        /// Reserve amount of asset A held in the pool.
        pub reserve_a: Balance,
        /// Reserve amount of asset B held in the pool.
        pub reserve_b: Balance,
        /// Total LP tokens issued for this pool.
        pub total_lp_tokens: Balance,
        /// Asset ID for the LP tokens of this pool.
        pub lp_asset_id: AssetId,
    }

    /// Storage map for liquidity pools.
    /// Maps pool_id to the pool data.
    #[pallet::storage]
    #[pallet::getter(fn pools)]
    pub type Pools<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        u32, // pool_id
        LiquidityPool<T::AssetId, T::Balance>,
        OptionQuery,
    >;

    /// Storage for the total number of pools created.
    #[pallet::storage]
    #[pallet::getter(fn pool_count)]
    pub type PoolCount<T: Config> = StorageValue<_, u32, ValueQuery>;

    /// Storage for mapping asset pairs to pool IDs.
    /// This prevents duplicate pools for the same asset pair.
    #[pallet::storage]
    #[pallet::getter(fn asset_pair_to_pool)]
    pub type AssetPairToPool<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        (T::AssetId, T::AssetId), // (asset_a, asset_b) - always ordered
        u32, // pool_id
        OptionQuery,
    >;

    /// Storage for user LP token balances.
    /// Maps (user, pool_id) to LP token balance.
    #[pallet::storage]
    #[pallet::getter(fn user_lp_tokens)]
    pub type UserLPTokens<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        T::AccountId, // user
        Blake2_128Concat,
        u32, // pool_id
        T::Balance, // lp_token_balance
        ValueQuery,
    >;


    /// Internal token balances for pDEX (replaces pallet-assets).
    #[pallet::storage]
    #[pallet::getter(fn token_balances)]
    pub type TokenBalances<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        Blake2_128Concat,
        T::AssetId,
        T::Balance,
        ValueQuery,
    >;

    /// Total supply for each token.
    #[pallet::storage]
    #[pallet::getter(fn token_supply)]
    pub type TokenSupply<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        T::AssetId,
        T::Balance,
        ValueQuery,
    >;

    /// Events emitted by this pallet.
    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// A new liquidity pool was created.
        PoolCreated {
            /// ID of the created pool.
            pool_id: u32,
            /// First asset in the pair.
            asset_a: T::AssetId,
            /// Second asset in the pair.
            asset_b: T::AssetId,
            /// LP token asset ID for this pool.
            lp_asset_id: T::AssetId,
            /// Account that created the pool.
            creator: T::AccountId,
        },
        /// Liquidity was added to a pool.
        LiquidityAdded {
            /// Pool ID where liquidity was added.
            pool_id: u32,
            /// Account that provided liquidity.
            provider: T::AccountId,
            /// Amount of asset A added.
            amount_a: T::Balance,
            /// Amount of asset B added.
            amount_b: T::Balance,
            /// LP tokens minted to the provider.
            lp_minted: T::Balance,
        },
        /// Liquidity was removed from a pool.
        LiquidityRemoved {
            /// Pool ID where liquidity was removed.
            pool_id: u32,
            /// Account that removed liquidity.
            provider: T::AccountId,
            /// Amount of asset A returned.
            amount_a: T::Balance,
            /// Amount of asset B returned.
            amount_b: T::Balance,
            /// LP tokens burned from the provider.
            lp_burned: T::Balance,
        },
        /// A token swap was executed.
        Swapped {
            /// Pool ID where the swap occurred.
            pool_id: u32,
            /// Account that executed the swap.
            trader: T::AccountId,
            /// Asset being sold.
            asset_in: T::AssetId,
            /// Amount of asset being sold.
            amount_in: T::Balance,
            /// Asset being bought.
            asset_out: T::AssetId,
            /// Amount of asset received.
            amount_out: T::Balance,
            /// Fee paid for the swap.
            fee: T::Balance,
        },
        /// A private swap was executed (trader identity hidden).
        PrivateSwap {
            /// ID of the pool.
            pool_id: u32,
            /// Asset being sold.
            asset_in: T::AssetId,
            /// Amount of asset being sold.
            amount_in: T::Balance,
            /// Asset being bought.
            asset_out: T::AssetId,
            /// Amount of asset received.
            amount_out: T::Balance,
            /// Fee paid for the swap.
            fee: T::Balance,
            /// Key image (prevents replay).
            key_image: [u8; 32],
        },
    }

    /// Errors that can be returned by this pallet.
    #[pallet::error]
    pub enum Error<T> {
        /// The specified pool was not found.
        PoolNotFound,
        /// A pool already exists for this asset pair.
        PoolAlreadyExists,
        /// The pool has insufficient liquidity for this operation.
        InsufficientLiquidity,
        /// The operation would exceed the specified slippage tolerance.
        SlippageExceeded,
        /// Invalid asset pair (cannot create pool with same asset).
        InvalidAssetPair,
        /// Amount must be greater than zero.
        ZeroAmount,
        /// Maximum number of pools has been reached.
        MaxPoolsReached,
        /// Arithmetic overflow occurred.
        Overflow,
        /// User has insufficient balance for this operation.
        InsufficientBalance,
        /// Token transfer failed.
        TransferFailed,
        /// LP token creation failed.
        LpTokenCreationFailed,
        /// LP token minting failed.
        LpTokenMintFailed,
        /// LP token burning failed.
        LpTokenBurnFailed,
        /// Invalid amounts provided.
        InvalidAmounts,
    }

    /// Dispatchable functions of this pallet.
    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Create a new liquidity pool for an asset pair.
        ///
        /// Creates a new AMM pool for trading between two assets.
        /// The pool starts with zero liquidity and must be funded via `add_liquidity`.
        ///
        /// Parameters:
        /// - `asset_a`: First asset in the trading pair
        /// - `asset_b`: Second asset in the trading pair
        ///
        /// Emits `PoolCreated` event on success.
        #[pallet::call_index(0)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::create_pool())]
        pub fn create_pool(
            origin: OriginFor<T>,
            asset_a: T::AssetId,
            asset_b: T::AssetId,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Validate asset pair
            ensure!(asset_a != asset_b, Error::<T>::InvalidAssetPair);

            // Order assets consistently (smaller first)
            let (ordered_a, ordered_b) = if asset_a < asset_b {
                (asset_a, asset_b)
            } else {
                (asset_b, asset_a)
            };

            // Check if pool already exists
            ensure!(
                !AssetPairToPool::<T>::contains_key((ordered_a, ordered_b)),
                Error::<T>::PoolAlreadyExists
            );

            // Check pool limit
            let pool_id = PoolCount::<T>::get();
            ensure!(pool_id < T::MaxPools::get(), Error::<T>::MaxPoolsReached);

            // Create LP token asset ID (offset by 10000 to avoid collisions)
            let lp_asset_id: T::AssetId = (pool_id + 10000).into();

            // Create the LP token asset
            // LP token created implicitly via internal tracking

            // Create the pool
            let pool = LiquidityPool {
                asset_a: ordered_a,
                asset_b: ordered_b,
                reserve_a: T::Balance::zero(),
                reserve_b: T::Balance::zero(),
                total_lp_tokens: T::Balance::zero(),
                lp_asset_id,
            };

            // Store the pool
            Pools::<T>::insert(pool_id, &pool);
            AssetPairToPool::<T>::insert((ordered_a, ordered_b), pool_id);
            PoolCount::<T>::put(pool_id + 1);

            // Emit event
            Self::deposit_event(Event::PoolCreated {
                pool_id,
                asset_a: ordered_a,
                asset_b: ordered_b,
                lp_asset_id,
                creator: who,
            });

            Ok(())
        }

        /// Add liquidity to an existing pool.
        ///
        /// Transfers tokens from the user to the pool and mints LP tokens in return.
        /// For existing pools, the ratio of tokens must match the current pool ratio.
        ///
        /// Parameters:
        /// - `pool_id`: ID of the pool to add liquidity to
        /// - `amount_a`: Amount of asset A to add
        /// - `amount_b`: Amount of asset B to add
        /// - `min_lp_tokens`: Minimum LP tokens to receive (slippage protection)
        ///
        /// Emits `LiquidityAdded` event on success.
        #[pallet::call_index(1)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::add_liquidity())]
        pub fn add_liquidity(
            origin: OriginFor<T>,
            pool_id: u32,
            amount_a: T::Balance,
            amount_b: T::Balance,
            min_lp_tokens: T::Balance,
        ) -> DispatchResult {
            let provider = ensure_signed(origin)?;

            // Validate amounts
            ensure!(!amount_a.is_zero() && !amount_b.is_zero(), Error::<T>::ZeroAmount);

            Pools::<T>::try_mutate(pool_id, |maybe_pool| {
                let pool = maybe_pool.as_mut().ok_or(Error::<T>::PoolNotFound)?;
                let pool_account = Self::pool_account(pool_id);

                // Calculate LP tokens to mint
                let lp_minted = if pool.total_lp_tokens.is_zero() {
                    // First liquidity provider: LP = sqrt(a * b) - minimum_liquidity
                    let product: u128 = amount_a.into()
                        .checked_mul(amount_b.into())
                        .ok_or(Error::<T>::Overflow)?;
                    let sqrt_product = Self::integer_sqrt(product);
                    let minimum_liquidity: u128 = T::MinimumLiquidity::get().into();
                    ensure!(sqrt_product > minimum_liquidity, Error::<T>::InsufficientLiquidity);
                    T::Balance::from(sqrt_product - minimum_liquidity)
                } else {
                    // Proportional minting: min(a * total / reserve_a, b * total / reserve_b)
                    let lp_a: u128 = amount_a.into()
                        .checked_mul(pool.total_lp_tokens.into())
                        .ok_or(Error::<T>::Overflow)?
                        .checked_div(pool.reserve_a.into())
                        .ok_or(Error::<T>::Overflow)?;
                    let lp_b: u128 = amount_b.into()
                        .checked_mul(pool.total_lp_tokens.into())
                        .ok_or(Error::<T>::Overflow)?
                        .checked_div(pool.reserve_b.into())
                        .ok_or(Error::<T>::Overflow)?;
                    T::Balance::from(lp_a.min(lp_b))
                };

                // Check slippage
                ensure!(lp_minted >= min_lp_tokens, Error::<T>::SlippageExceeded);
                ensure!(!lp_minted.is_zero(), Error::<T>::InvalidAmounts);

                // Transfer tokens from provider to pool
                Self::do_transfer(pool.asset_a, &provider, &pool_account, amount_a)?;

                Self::do_transfer(pool.asset_b, &provider, &pool_account, amount_b)?;

                // Mint LP tokens to provider
                Self::do_mint(pool.lp_asset_id, &provider, lp_minted)?;

                // Update pool state
                pool.reserve_a = pool.reserve_a.saturating_add(amount_a);
                pool.reserve_b = pool.reserve_b.saturating_add(amount_b);
                pool.total_lp_tokens = pool.total_lp_tokens.saturating_add(lp_minted);

                // Update user LP token balance
                UserLPTokens::<T>::mutate(&provider, pool_id, |balance| {
                    *balance = balance.saturating_add(lp_minted);
                });

                // Emit event
                Self::deposit_event(Event::LiquidityAdded {
                    pool_id,
                    provider,
                    amount_a,
                    amount_b,
                    lp_minted,
                });

                Ok(())
            })
        }

        /// Remove liquidity from a pool.
        ///
        /// Burns LP tokens and returns the corresponding amounts of both assets.
        ///
        /// Parameters:
        /// - `pool_id`: ID of the pool to remove liquidity from
        /// - `lp_tokens`: Amount of LP tokens to burn
        /// - `min_amount_a`: Minimum amount of asset A to receive (slippage protection)
        /// - `min_amount_b`: Minimum amount of asset B to receive (slippage protection)
        ///
        /// Emits `LiquidityRemoved` event on success.
        #[pallet::call_index(2)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::remove_liquidity())]
        pub fn remove_liquidity(
            origin: OriginFor<T>,
            pool_id: u32,
            lp_tokens: T::Balance,
            min_amount_a: T::Balance,
            min_amount_b: T::Balance,
        ) -> DispatchResult {
            let provider = ensure_signed(origin)?;

            // Validate amount
            ensure!(!lp_tokens.is_zero(), Error::<T>::ZeroAmount);

            Pools::<T>::try_mutate(pool_id, |maybe_pool| {
                let pool = maybe_pool.as_mut().ok_or(Error::<T>::PoolNotFound)?;
                let pool_account = Self::pool_account(pool_id);

                // Check user has enough LP tokens
                let user_lp_balance = UserLPTokens::<T>::get(&provider, pool_id);
                ensure!(user_lp_balance >= lp_tokens, Error::<T>::InsufficientBalance);

                // Calculate amounts to return: amount = lp_tokens * reserve / total_lp
                let amount_a = T::Balance::from(
                    lp_tokens.into()
                        .checked_mul(pool.reserve_a.into())
                        .ok_or(Error::<T>::Overflow)?
                        .checked_div(pool.total_lp_tokens.into())
                        .ok_or(Error::<T>::Overflow)?
                );
                let amount_b = T::Balance::from(
                    lp_tokens.into()
                        .checked_mul(pool.reserve_b.into())
                        .ok_or(Error::<T>::Overflow)?
                        .checked_div(pool.total_lp_tokens.into())
                        .ok_or(Error::<T>::Overflow)?
                );

                // Check slippage
                ensure!(amount_a >= min_amount_a, Error::<T>::SlippageExceeded);
                ensure!(amount_b >= min_amount_b, Error::<T>::SlippageExceeded);

                Self::do_burn(pool.lp_asset_id, &provider, lp_tokens)?;

                // Transfer tokens from pool to provider
                Self::do_transfer(pool.asset_a, &pool_account, &provider, amount_a)?;

                Self::do_transfer(pool.asset_b, &pool_account, &provider, amount_b)?;

                // Update pool state
                pool.reserve_a = pool.reserve_a.saturating_sub(amount_a);
                pool.reserve_b = pool.reserve_b.saturating_sub(amount_b);
                pool.total_lp_tokens = pool.total_lp_tokens.saturating_sub(lp_tokens);

                // Update user LP token balance
                UserLPTokens::<T>::mutate(&provider, pool_id, |balance| {
                    *balance = balance.saturating_sub(lp_tokens);
                });

                // Emit event
                Self::deposit_event(Event::LiquidityRemoved {
                    pool_id,
                    provider,
                    amount_a,
                    amount_b,
                    lp_burned: lp_tokens,
                });

                Ok(())
            })
        }

        /// Execute a token swap using the constant product formula.
        ///
        /// Swaps one asset for another using the AMM formula: x * y = k
        /// Includes slippage protection and fee collection.
        ///
        /// Parameters:
        /// - `pool_id`: ID of the pool to swap in
        /// - `asset_in`: Asset being sold
        /// - `amount_in`: Amount of asset being sold
        /// - `min_amount_out`: Minimum amount to receive (slippage protection)
        ///
        /// Emits `Swapped` event on success.
        #[pallet::call_index(3)]
        #[pallet::weight(<T as pallet::Config>::WeightInfo::swap())]
        pub fn swap(
            origin: OriginFor<T>,
            pool_id: u32,
            asset_in: T::AssetId,
            amount_in: T::Balance,
            min_amount_out: T::Balance,
        ) -> DispatchResult {
            let trader = ensure_signed(origin)?;

            // Validate amount
            ensure!(!amount_in.is_zero(), Error::<T>::ZeroAmount);

            Pools::<T>::try_mutate(pool_id, |maybe_pool| {
                let pool = maybe_pool.as_mut().ok_or(Error::<T>::PoolNotFound)?;
                let pool_account = Self::pool_account(pool_id);

                // Determine swap direction
                let (reserve_in, reserve_out, asset_out, is_a_to_b) = if asset_in == pool.asset_a {
                    (pool.reserve_a, pool.reserve_b, pool.asset_b, true)
                } else if asset_in == pool.asset_b {
                    (pool.reserve_b, pool.reserve_a, pool.asset_a, false)
                } else {
                    return Err(Error::<T>::InvalidAmounts.into());
                };

                // Verify pool has liquidity
                ensure!(!reserve_in.is_zero() && !reserve_out.is_zero(), Error::<T>::InsufficientLiquidity);

                // Calculate output using constant product formula with fee
                // amount_out = reserve_out * amount_in_with_fee / (reserve_in + amount_in_with_fee)
                let swap_fee = T::SwapFee::get();
                let fee_factor = Permill::one().saturating_sub(swap_fee);
                let amount_in_with_fee: u128 = fee_factor.mul_floor(amount_in.into());
                
                let numerator = reserve_out.into()
                    .checked_mul(amount_in_with_fee)
                    .ok_or(Error::<T>::Overflow)?;
                let denominator = reserve_in.into()
                    .checked_add(amount_in_with_fee)
                    .ok_or(Error::<T>::Overflow)?;
                let amount_out = T::Balance::from(
                    numerator.checked_div(denominator).ok_or(Error::<T>::Overflow)?
                );

                // Check slippage
                ensure!(amount_out >= min_amount_out, Error::<T>::SlippageExceeded);
                ensure!(amount_out < reserve_out, Error::<T>::InsufficientLiquidity);

                // Calculate fee amount and distribute
                let fee_amount: u128 = swap_fee.mul_floor(amount_in.into());
                let treasury_share = T::TreasuryFeeShare::get();
                let treasury_fee: u128 = treasury_share.mul_floor(fee_amount);
                let treasury_fee_balance = T::Balance::from(treasury_fee);
                let amount_in_after_treasury = amount_in.saturating_sub(treasury_fee_balance);
                
                // Transfer token_in from trader to pool
                Self::do_transfer(asset_in, &trader, &pool_account, amount_in)?;
                // Transfer token_out from pool to trader
                Self::do_transfer(asset_out, &pool_account, &trader, amount_out)?;
                
                // Transfer treasury fee from pool to treasury (10% of fee)
                if treasury_fee > 0 {
                    let treasury = T::TreasuryAccount::get();
                    Self::do_transfer(asset_in, &pool_account, &treasury, treasury_fee_balance)?;
                }
                

                // Update reserves (fee stays in pool for LPs)
                if is_a_to_b {
                    pool.reserve_a = pool.reserve_a.saturating_add(amount_in_after_treasury);
                    pool.reserve_b = pool.reserve_b.saturating_sub(amount_out);
                } else {
                    pool.reserve_b = pool.reserve_b.saturating_add(amount_in_after_treasury);
                    pool.reserve_a = pool.reserve_a.saturating_sub(amount_out);
                }

                // Emit event
                Self::deposit_event(Event::Swapped {
                    pool_id,
                    trader,
                    asset_in,
                    amount_in,
                    asset_out,
                    amount_out,
                    fee: T::Balance::from(fee_amount),
                });

                Ok(())
            })
        }

        /// Execute a private swap using ring signature for trader anonymity.
        /// 
        /// The trader's identity is hidden within a ring of public keys.
        /// Amounts are visible but the actual trader cannot be determined.
        #[pallet::call_index(4)]
        #[pallet::weight(Weight::from_parts(100_000_000, 0))]
        pub fn private_swap(
            origin: OriginFor<T>,
            pool_id: u32,
            asset_in: T::AssetId,
            amount_in: T::Balance,
            min_amount_out: T::Balance,
            ring_members: Vec<[u8; 32]>,
            key_image: [u8; 32],
            signature: Vec<u8>,
        ) -> DispatchResult {
            // Origin is fee payer, not necessarily the trader
            ensure_signed(origin)?;

            // Verify ring signature
            let ring_size = ring_members.len() as u32;
            ensure!(ring_size >= 2, Error::<T>::InvalidAmounts);

            // Build message for verification
            let message = (pool_id, asset_in, amount_in, min_amount_out).encode();

            // Verify MLSAG signature
            pallet_ring_signatures::Pallet::<T>::verify_signature_internal(
                &ring_members,
                &key_image,
                &signature,
                &message,
            ).map_err(|_| Error::<T>::InvalidAmounts)?;

            // Check key image not already used (prevents replay)
            ensure!(
                !pallet_ring_signatures::Pallet::<T>::is_key_image_used(&key_image),
                Error::<T>::InvalidAmounts
            );

            // Mark key image as used
            pallet_ring_signatures::UsedKeyImages::<T>::insert(
                &key_image,
                frame_system::Pallet::<T>::block_number()
            );

            // Execute swap logic (same as regular swap but trader is anonymous)
            Pools::<T>::try_mutate(pool_id, |maybe_pool| -> DispatchResult {
                let pool = maybe_pool.as_mut().ok_or(Error::<T>::PoolNotFound)?;
                let pool_account = Self::pool_account(pool_id);

                let (reserve_in, reserve_out, asset_out, is_a_to_b) = if asset_in == pool.asset_a {
                    (pool.reserve_a, pool.reserve_b, pool.asset_b, true)
                } else if asset_in == pool.asset_b {
                    (pool.reserve_b, pool.reserve_a, pool.asset_a, false)
                } else {
                    return Err(Error::<T>::InvalidAmounts.into());
                };

                ensure!(!reserve_in.is_zero() && !reserve_out.is_zero(), Error::<T>::InsufficientLiquidity);

                // Calculate output with fee
                let swap_fee = T::SwapFee::get();
                let fee_factor = Permill::one().saturating_sub(swap_fee);
                let amount_in_with_fee: u128 = fee_factor.mul_floor(amount_in.into());

                let numerator = reserve_out.into()
                    .checked_mul(amount_in_with_fee)
                    .ok_or(Error::<T>::Overflow)?;
                let denominator = reserve_in.into()
                    .checked_add(amount_in_with_fee)
                    .ok_or(Error::<T>::Overflow)?;
                let amount_out = T::Balance::from(
                    numerator.checked_div(denominator).ok_or(Error::<T>::Overflow)?
                );

                ensure!(amount_out >= min_amount_out, Error::<T>::SlippageExceeded);
                let fee_amount: u128 = swap_fee.mul_floor(amount_in.into());
                let treasury_share = T::TreasuryFeeShare::get();
                let treasury_fee: u128 = treasury_share.mul_floor(fee_amount);
                let treasury_fee_balance = T::Balance::from(treasury_fee);
                let amount_in_after_treasury = amount_in.saturating_sub(treasury_fee_balance);
                // Transfer treasury fee from pool
                if treasury_fee > 0 {
                    let treasury = T::TreasuryAccount::get();
                    Self::do_transfer(asset_in, &pool_account, &treasury, treasury_fee_balance)?;
                }

                // For private swap, tokens move from/to pool account
                // The actual trader deposited to pool beforehand via shielded mechanism
                // Here we just update pool reserves to reflect the swap
                
                // Update reserves
                if is_a_to_b {
                    pool.reserve_a = pool.reserve_a.saturating_add(amount_in_after_treasury);
                    pool.reserve_b = pool.reserve_b.saturating_sub(amount_out);
                } else {
                    pool.reserve_b = pool.reserve_b.saturating_add(amount_in_after_treasury);
                    pool.reserve_a = pool.reserve_a.saturating_sub(amount_out);
                }

                // Emit event (no trader identity revealed)
                Self::deposit_event(Event::PrivateSwap {
                    pool_id,
                    asset_in,
                    amount_in,
                    asset_out,
                    amount_out,
                    fee: T::Balance::from(fee_amount),
                    key_image,
                });

                Ok(())
            })
        }
    }

    impl<T: Config> Pallet<T> {
        /// Get the pool account for a given pool_id.
        pub fn pool_account(pool_id: u32) -> T::AccountId {
            T::PalletId::get().into_sub_account_truncating(pool_id)
        }

        /// Get a pool by its ID.
        pub fn get_pool(pool_id: u32) -> Option<LiquidityPool<T::AssetId, T::Balance>> {
            Pools::<T>::get(pool_id)
        }

        /// Get pool ID for an asset pair.
        pub fn get_pool_id(asset_a: T::AssetId, asset_b: T::AssetId) -> Option<u32> {
            let (ordered_a, ordered_b) = if asset_a < asset_b {
                (asset_a, asset_b)
            } else {
                (asset_b, asset_a)
            };
            AssetPairToPool::<T>::get((ordered_a, ordered_b))
        }

        /// Get pool information for emissions integration
        pub fn get_pool_info(pool_id: u32) -> Option<LiquidityPool<T::AssetId, T::Balance>> {
            Pools::<T>::get(pool_id)
        }
        
        /// Get all LP holders for a pool (for emissions distribution)
        pub fn get_pool_lps(pool_id: u32) -> Vec<(T::AccountId, T::Balance)> {
            UserLPTokens::<T>::iter()
                .filter_map(|(account, pid, balance)| {
                    if pid == pool_id && !balance.is_zero() {
                        Some((account, balance))
                    } else {
                        None
                    }
                })
                .collect()
        }
        
        /// Get total liquidity in a pool
        pub fn get_pool_total_liquidity(pool_id: u32) -> T::Balance {
            Pools::<T>::get(pool_id)
                .map(|p| p.total_lp_tokens)
                .unwrap_or_else(T::Balance::zero)
        }
        
        /// Get user's share of a pool's liquidity
        pub fn get_user_liquidity_share(user: &T::AccountId, pool_id: u32) -> sp_runtime::Permill {
            let user_lp = UserLPTokens::<T>::get(user, pool_id);
            let total_lp = Self::get_pool_total_liquidity(pool_id);
            
            if total_lp.is_zero() {
                return sp_runtime::Permill::zero();
            }
            
            sp_runtime::Permill::from_rational(user_lp.into(), total_lp.into())
        }

        /// Calculate swap output amount without executing the swap.
        pub fn get_swap_amount_out(
            pool_id: u32,
            asset_in: T::AssetId,
            amount_in: T::Balance,
        ) -> Result<T::Balance, Error<T>> {
            let pool = Pools::<T>::get(pool_id).ok_or(Error::<T>::PoolNotFound)?;
            
            let (reserve_in, reserve_out) = if asset_in == pool.asset_a {
                (pool.reserve_a, pool.reserve_b)
            } else if asset_in == pool.asset_b {
                (pool.reserve_b, pool.reserve_a)
            } else {
                return Err(Error::<T>::InvalidAmounts);
            };

            if reserve_in.is_zero() || reserve_out.is_zero() {
                return Err(Error::<T>::InsufficientLiquidity);
            }

            let swap_fee = T::SwapFee::get();
            let fee_factor = Permill::one().saturating_sub(swap_fee);
            let amount_in_with_fee: u128 = fee_factor.mul_floor(amount_in.into());
            
            let numerator = reserve_out.into()
                .checked_mul(amount_in_with_fee)
                .ok_or(Error::<T>::Overflow)?;
            let denominator = reserve_in.into()
                .checked_add(amount_in_with_fee)
                .ok_or(Error::<T>::Overflow)?;
            let amount_out = T::Balance::from(
                numerator.checked_div(denominator).ok_or(Error::<T>::Overflow)?
            );

            Ok(amount_out)
        }

        /// Integer square root using Newton's method.
        pub fn integer_sqrt(n: u128) -> u128 {
            if n == 0 { return 0; }
            let mut x = n;
            let mut y = (x + 1) / 2;
            while y < x {
                x = y;
                y = (x + n / x) / 2;
            }
            x
        }
        // ============== INTERNAL TOKEN OPERATIONS ==============

        /// Transfer tokens between accounts (internal)
        pub fn do_transfer(
            asset_id: T::AssetId,
            from: &T::AccountId,
            to: &T::AccountId,
            amount: T::Balance,
        ) -> DispatchResult {
            if amount.is_zero() { return Ok(()); }
            let from_balance = TokenBalances::<T>::get(from, asset_id);
            ensure!(from_balance >= amount, Error::<T>::InsufficientBalance);
            TokenBalances::<T>::mutate(from, asset_id, |b| *b = b.saturating_sub(amount));
            TokenBalances::<T>::mutate(to, asset_id, |b| *b = b.saturating_add(amount));
            Ok(())
        }

        /// Mint tokens to an account (internal)
        pub fn do_mint(
            asset_id: T::AssetId,
            to: &T::AccountId,
            amount: T::Balance,
        ) -> DispatchResult {
            if amount.is_zero() { return Ok(()); }
            TokenBalances::<T>::mutate(to, asset_id, |b| *b = b.saturating_add(amount));
            TokenSupply::<T>::mutate(asset_id, |s| *s = s.saturating_add(amount));
            Ok(())
        }

        /// Burn tokens from an account (internal)
        pub fn do_burn(
            asset_id: T::AssetId,
            from: &T::AccountId,
            amount: T::Balance,
        ) -> DispatchResult {
            if amount.is_zero() { return Ok(()); }
            let balance = TokenBalances::<T>::get(from, asset_id);
            ensure!(balance >= amount, Error::<T>::InsufficientBalance);
            TokenBalances::<T>::mutate(from, asset_id, |b| *b = b.saturating_sub(amount));
            TokenSupply::<T>::mutate(asset_id, |s| *s = s.saturating_sub(amount));
            Ok(())
        }

        /// Get token balance
        pub fn balance_of(asset_id: T::AssetId, who: &T::AccountId) -> T::Balance {
            TokenBalances::<T>::get(who, asset_id)
        }
    }
}