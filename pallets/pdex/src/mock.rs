//! Mock runtime for testing the pDEX pallet.

use crate as pallet_pdex;
use frame_support::{
    construct_runtime, derive_impl, parameter_types,
    traits::{AsEnsureOriginWithArg, ConstU128, ConstU32, ConstU64},
    weights::Weight,
    PalletId,
};
use frame_system as system;
use sp_runtime::{
    traits::{BlakeTwo256, IdentityLookup},
    BuildStorage, Permill,
};

type Block = frame_system::mocking::MockBlock<Test>;
type Balance = u128;
type AssetId = u32;

// Configure a mock runtime to test the pallet.
construct_runtime!(
    pub enum Test
    {
        System: frame_system,
        Assets: pallet_assets,
        Pdex: pallet_pdex,
    }
);

#[derive_impl(frame_system::config_preludes::TestDefaultConfig as frame_system::DefaultConfig)]
impl system::Config for Test {
    type BaseCallFilter = frame_support::traits::Everything;
    type BlockWeights = ();
    type BlockLength = ();
    type DbWeight = ();
    type RuntimeOrigin = RuntimeOrigin;
    type RuntimeCall = RuntimeCall;
    type Nonce = u64;
    type Hash = sp_core::H256;
    type Hashing = BlakeTwo256;
    type AccountId = u64;
    type Lookup = IdentityLookup<Self::AccountId>;
    type Block = Block;
    type RuntimeEvent = RuntimeEvent;
    type BlockHashCount = ConstU64<250>;
    type Version = ();
    type PalletInfo = PalletInfo;
    type AccountData = ();
    type OnNewAccount = ();
    type OnKilledAccount = ();
    type SystemWeightInfo = ();
    type SS58Prefix = ();
    type OnSetCode = ();
    type MaxConsumers = ConstU32<16>;
}

parameter_types! {
    pub const AssetDeposit: Balance = 100;
    pub const ApprovalDeposit: Balance = 1;
    pub const StringLimit: u32 = 50;
    pub const MetadataDepositBase: Balance = 10;
    pub const MetadataDepositPerByte: Balance = 1;
}

impl pallet_assets::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type Balance = Balance;
    type AssetId = AssetId;
    type AssetIdParameter = codec::Compact<AssetId>;
    type Currency = ();
    type CreateOrigin = AsEnsureOriginWithArg<frame_system::EnsureSigned<Self::AccountId>>;
    type ForceOrigin = frame_system::EnsureRoot<Self::AccountId>;
    type AssetDeposit = AssetDeposit;
    type AssetAccountDeposit = ConstU128<1>;
    type MetadataDepositBase = MetadataDepositBase;
    type MetadataDepositPerByte = MetadataDepositPerByte;
    type ApprovalDeposit = ApprovalDeposit;
    type StringLimit = StringLimit;
    type Freezer = ();
    type Extra = ();
    type CallbackHandle = ();
    type WeightInfo = ();
    type RemoveItemsLimit = ConstU32<1000>;
    #[cfg(feature = "runtime-benchmarks")]
    type BenchmarkHelper = ();
}

parameter_types! {
    pub const PdexPalletId: PalletId = PalletId(*b"pdex/amm");
    pub const MaxPools: u32 = 1000;
    pub const MinimumLiquidity: Balance = 1000; // 1000 units minimum
    pub const SwapFee: Permill = Permill::from_parts(3000); // 0.3%
}

impl pallet_pdex::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type WeightInfo = ();
    type AssetId = AssetId;
    type Balance = Balance;
    type Assets = Assets;
    type PalletId = PdexPalletId;
    type MaxPools = MaxPools;
    type MinimumLiquidity = MinimumLiquidity;
    type SwapFee = SwapFee;
}

// Build genesis storage according to the mock runtime.
pub fn new_test_ext() -> sp_io::TestExternalities {
    let mut storage = system::GenesisConfig::<Test>::default().build_storage().unwrap();
    
    // Initialize assets for testing
    pallet_assets::GenesisConfig::<Test> {
        assets: vec![
            // Asset 1: CHML token
            (1, 1, true, 1),
            // Asset 2: ETH token
            (2, 1, true, 1),
            // Asset 3: USDC token
            (3, 1, true, 1),
        ],
        metadata: vec![
            (1, "CHML".into(), "Chameleon".into(), 18),
            (2, "ETH".into(), "Ethereum".into(), 18),
            (3, "USDC".into(), "USD Coin".into(), 6),
        ],
        accounts: vec![
            // Give account 1 some tokens for testing
            (1, 1, 1_000_000_000_000_000_000_000u128), // 1000 CHML
            (2, 1, 100_000_000_000_000_000_000u128),   // 100 ETH
            (3, 1, 1_000_000_000_000u128),             // 1M USDC
            // Give account 2 some tokens for testing
            (1, 2, 1_000_000_000_000_000_000_000u128), // 1000 CHML
            (2, 2, 100_000_000_000_000_000_000u128),   // 100 ETH
            (3, 2, 1_000_000_000_000u128),             // 1M USDC
        ],
    }
    .assimilate_storage(&mut storage)
    .unwrap();
    
    storage.into()
}

// Helper functions for tests
pub fn run_to_block(n: u64) {
    while System::block_number() < n {
        System::set_block_number(System::block_number() + 1);
    }
}

pub fn last_event() -> RuntimeEvent {
    System::events().pop().expect("Event expected").event
}

pub fn events() -> Vec<RuntimeEvent> {
    System::events().into_iter().map(|r| r.event).collect::<Vec<_>>()
}