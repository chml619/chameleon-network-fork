//! Mock runtime for testing the emissions pallet.

use crate as pallet_emissions;
use frame_support::{
    derive_impl,
    parameter_types,
    traits::{ConstU16, ConstU32, ConstU64},
    PalletId,
};
use sp_runtime::{
    traits::{BlakeTwo256, IdentityLookup},
    BuildStorage,
};

type Block = frame_system::mocking::MockBlock<Test>;
type Balance = u128;

// Configure a mock runtime to test the pallet.
frame_support::construct_runtime!(
    pub enum Test
    {
        System: frame_system,
        Balances: pallet_balances,
        Emissions: pallet_emissions,
    }
);

#[derive_impl(frame_system::config_preludes::TestDefaultConfig as frame_system::DefaultConfig)]
impl frame_system::Config for Test {
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
    type AccountData = pallet_balances::AccountData<Balance>;
    type OnNewAccount = ();
    type OnKilledAccount = ();
    type SystemWeightInfo = ();
    type SS58Prefix = ConstU16<42>;
    type OnSetCode = ();
    type MaxConsumers = ConstU32<16>;
}

#[derive_impl(pallet_balances::config_preludes::TestDefaultConfig as pallet_balances::DefaultConfig)]
impl pallet_balances::Config for Test {
    type MaxLocks = ConstU32<50>;
    type MaxReserves = ();
    type ReserveIdentifier = [u8; 8];
    type Balance = Balance;
    type RuntimeEvent = RuntimeEvent;
    type DustRemoval = ();
    type ExistentialDeposit = ConstU64<1>;
    type AccountStore = System;
    type WeightInfo = ();
    type FreezeIdentifier = ();
    type MaxFreezes = ();
    type RuntimeHoldReason = ();
    type RuntimeFreezeReason = ();
}

parameter_types! {
    pub const InitialEmissionRate: Balance = 1_407_000_000_000_000_000; // 1.407 CHML (Year 1 rate)
    pub const EmissionsPalletId: PalletId = PalletId(*b"chmlemis");
    pub const BlocksPerYear: u64 = 5_259_600; // 6-second blocks: 365.25 * 24 * 60 * 10
}

impl pallet_emissions::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type WeightInfo = ();
    type Currency = Balances;
    type InitialEmissionRate = InitialEmissionRate;
    type EmissionsPalletId = EmissionsPalletId;
    type BlocksPerYear = BlocksPerYear;
}

// Build genesis storage according to the mock runtime.
pub fn new_test_ext() -> sp_io::TestExternalities {
    let mut t = frame_system::GenesisConfig::<Test>::default().build_storage().unwrap();
    
    pallet_balances::GenesisConfig::<Test> {
        balances: vec![
            (1, 1000_000_000_000_000_000_000), // 1000 CHML
            (2, 1000_000_000_000_000_000_000), // 1000 CHML
        ],
    }
    .assimilate_storage(&mut t)
    .unwrap();
    
    pallet_emissions::GenesisConfig::<Test> {
        initial_emission_rate: 1_407_000_000_000_000_000, // 1.407 CHML (Year 1 rate)
        pool_apys: vec![
            (1, sp_runtime::Perbill::from_percent(15)), // 15% APY for pool 1
            (2, sp_runtime::Perbill::from_percent(10)), // 10% APY for pool 2
        ],
    }
    .assimilate_storage(&mut t)
    .unwrap();
    
    t.into()
}