//! Internal Token Registry for pDEX
//! 
//! Manages balances for CHML and bridged tokens (pBTC, pETH, pUSDT)
//! without external pallet-assets dependency.

use codec::{Decode, Encode, MaxEncodedLen};
use frame_support::pallet_prelude::*;
use scale_info::TypeInfo;

/// Supported token types
#[derive(Clone, Copy, PartialEq, Eq, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen, Ord, PartialOrd, Default)]
pub enum TokenId {
    #[default]
    CHML,
    PBTC,
    PETH,
    PUSDT,
    /// LP tokens for pool N
    LpToken(u32),
}

impl From<u32> for TokenId {
    fn from(v: u32) -> Self {
        match v {
            0 => TokenId::CHML,
            1 => TokenId::PBTC,
            2 => TokenId::PETH,
            3 => TokenId::PUSDT,
            n => TokenId::LpToken(n.saturating_sub(100)),
        }
    }
}

impl From<TokenId> for u32 {
    fn from(t: TokenId) -> u32 {
        match t {
            TokenId::CHML => 0,
            TokenId::PBTC => 1,
            TokenId::PETH => 2,
            TokenId::PUSDT => 3,
            TokenId::LpToken(n) => 100 + n,
        }
    }
}

/// Token metadata
#[derive(Clone, Encode, Decode, RuntimeDebug, TypeInfo, MaxEncodedLen)]
pub struct TokenMetadata {
    pub name: BoundedVec<u8, ConstU32<32>>,
    pub symbol: BoundedVec<u8, ConstU32<8>>,
    pub decimals: u8,
    pub total_supply: u128,
}

impl Default for TokenMetadata {
    fn default() -> Self {
        Self {
            name: BoundedVec::default(),
            symbol: BoundedVec::default(),
            decimals: 12,
            total_supply: 0,
        }
    }
}
