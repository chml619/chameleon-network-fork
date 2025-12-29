//! Mock runtime for testing the bridge pallet.

use crate as pallet_bridge;
use frame_support::{
    derive_impl,
    parameter_types,
    traits::{ConstU16, ConstU32, ConstU64, ConstU128},
};
use sp_runtime::{
    traits::{BlakeTwo256, IdentityLookup},
    BuildStorage,
};

type Block = frame_system::mocking::MockBlock<Test>;

// Configure a mock runtime to test the pallet.
frame_support::construct_runtime!(
    pub enum Test
    {
        System: frame_system,
        Balances: pallet_balances,
        Bridge: pallet_bridge,
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
    type AccountData = pallet_balances::AccountData<u128>;
    type OnNewAccount = ();
    type OnKilledAccount = ();
    type SystemWeightInfo = ();
    type SS58Prefix = ConstU16<42>;
    type OnSetCode = ();
    type MaxConsumers = frame_support::traits::ConstU32<16>;
}

impl pallet_balances::Config for Test {
    type MaxLocks = ConstU32<50>;
    type MaxReserves = ();
    type ReserveIdentifier = [u8; 8];
    type Balance = u128;
    type RuntimeEvent = RuntimeEvent;
    type DustRemoval = ();
    type ExistentialDeposit = ConstU128<500>;
    type AccountStore = System;
    type WeightInfo = pallet_balances::weights::SubstrateWeight<Test>;
    type FreezeIdentifier = ();
    type MaxFreezes = ();
    type RuntimeHoldReason = ();
    type RuntimeFreezeReason = ();
}

parameter_types! {
    pub const MinimumDeposit: u128 = 1_000_000_000_000_000_000; // 1 CHML
    pub const MaximumWithdrawal: u128 = 1000_000_000_000_000_000_000; // 1000 CHML
    pub const MaxValidators: u32 = 10;
}

impl pallet_bridge::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type WeightInfo = ();
    type Currency = Balances;
    type MinimumDeposit = MinimumDeposit;
    type MaximumWithdrawal = MaximumWithdrawal;
    type MaxValidators = MaxValidators;
}

// Build genesis storage according to the mock runtime.
pub fn new_test_ext() -> sp_io::TestExternalities {
    let mut t = frame_system::GenesisConfig::<Test>::default().build_storage().unwrap();
    
    pallet_balances::GenesisConfig::<Test> {
        balances: vec![
            (1, 10000_000_000_000_000_000_000), // 10000 CHML
            (2, 5000_000_000_000_000_000_000),  // 5000 CHML
            (3, 1000_000_000_000_000_000_000),  // 1000 CHML
        ],
    }
    .assimilate_storage(&mut t)
    .unwrap();
    
    pallet_bridge::GenesisConfig::<Test> {
        validators: vec![10, 11, 12], // Validator accounts
        confirmation_threshold: 2,   // 2 out of 3 validators needed
    }
    .assimilate_storage(&mut t)
    .unwrap();
    
    t.into()
}