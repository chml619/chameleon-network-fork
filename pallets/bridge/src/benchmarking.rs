//! Benchmarking setup for pallet-bridge

use super::*;

#[allow(unused)]
use crate::Pallet as Bridge;
use frame_benchmarking::v2::*;
use frame_system::RawOrigin;
use sp_core::H256;

#[benchmarks]
mod benchmarks {
	use super::*;

	#[benchmark]
	fn initiate_deposit() {
		let caller: T::AccountId = whitelisted_caller();
		// Ensure caller has enough balance
		T::Currency::make_free_balance_be(&caller, T::MinimumDeposit::get() * 100u32.into());

		#[extrinsic_call]
		initiate_deposit(
			RawOrigin::Signed(caller.clone()),
			Chain::Ethereum,
			Asset::ETH,
			T::MinimumDeposit::get(),
			caller,
		);

		// Verify deposit was created
		assert!(PendingDeposits::<T>::get(1).is_some());
	}

	#[benchmark]
	fn confirm_deposit() {
		let caller: T::AccountId = whitelisted_caller();
		let validator: T::AccountId = account("validator", 0, 0);
		
		// Setup: Add validator and create deposit
		let mut validators = BoundedVec::new();
		validators.try_push(validator.clone()).unwrap();
		BridgeValidators::<T>::put(validators);
		ConfirmationThreshold::<T>::put(1u32);

		// Create a deposit first
		T::Currency::make_free_balance_be(&caller, T::MinimumDeposit::get() * 100u32.into());
		let _ = Bridge::<T>::initiate_deposit(
			RawOrigin::Signed(caller.clone()).into(),
			Chain::Ethereum,
			Asset::ETH,
			T::MinimumDeposit::get(),
			caller,
		);

		let tx_hash = H256::from([1u8; 32]);

		#[extrinsic_call]
		confirm_deposit(RawOrigin::Signed(validator), 1, tx_hash);

		// Verify deposit was processed
		assert!(PendingDeposits::<T>::get(1).is_none());
	}

	#[benchmark]
	fn initiate_withdrawal() {
		let caller: T::AccountId = whitelisted_caller();
		T::Currency::make_free_balance_be(&caller, T::MaximumWithdrawal::get());

		let external_address: BoundedVec<u8, ConstU32<64>> = 
			b"0x1234567890abcdef".to_vec().try_into().unwrap();

		#[extrinsic_call]
		initiate_withdrawal(
			RawOrigin::Signed(caller),
			Chain::Ethereum,
			Asset::ETH,
			T::MinimumDeposit::get(),
			external_address,
		);

		// Verify withdrawal was created
		assert!(PendingWithdrawals::<T>::get(1).is_some());
	}

	#[benchmark]
	fn confirm_withdrawal() {
		let caller: T::AccountId = whitelisted_caller();
		let validator: T::AccountId = account("validator", 0, 0);
		
		// Setup: Add validator
		let mut validators = BoundedVec::new();
		validators.try_push(validator.clone()).unwrap();
		BridgeValidators::<T>::put(validators);
		ConfirmationThreshold::<T>::put(1u32);

		// Create a withdrawal first
		T::Currency::make_free_balance_be(&caller, T::MaximumWithdrawal::get());
		let external_address: BoundedVec<u8, ConstU32<64>> = 
			b"0x1234567890abcdef".to_vec().try_into().unwrap();
		let _ = Bridge::<T>::initiate_withdrawal(
			RawOrigin::Signed(caller).into(),
			Chain::Ethereum,
			Asset::ETH,
			T::MinimumDeposit::get(),
			external_address,
		);

		let tx_hash = H256::from([2u8; 32]);

		#[extrinsic_call]
		confirm_withdrawal(RawOrigin::Signed(validator), 1, tx_hash);

		// Verify withdrawal was processed
		assert!(PendingWithdrawals::<T>::get(1).is_none());
	}

	#[benchmark]
	fn add_validator() {
		let new_validator: T::AccountId = account("new_validator", 0, 0);

		#[extrinsic_call]
		add_validator(RawOrigin::Root, new_validator.clone());

		// Verify validator was added
		assert!(BridgeValidators::<T>::get().contains(&new_validator));
	}

	#[benchmark]
	fn remove_validator() {
		let validator: T::AccountId = account("validator", 0, 0);
		
		// Setup: Add validator first
		let mut validators = BoundedVec::new();
		validators.try_push(validator.clone()).unwrap();
		BridgeValidators::<T>::put(validators);

		#[extrinsic_call]
		remove_validator(RawOrigin::Root, validator.clone());

		// Verify validator was removed
		assert!(!BridgeValidators::<T>::get().contains(&validator));
	}

	#[benchmark]
	fn set_confirmation_threshold() {
		// Setup: Add some validators
		let mut validators = BoundedVec::new();
		for i in 0..3 {
			let validator: T::AccountId = account("validator", i, 0);
			validators.try_push(validator).unwrap();
		}
		BridgeValidators::<T>::put(validators);

		#[extrinsic_call]
		set_confirmation_threshold(RawOrigin::Root, 2u32);

		// Verify threshold was set
		assert_eq!(ConfirmationThreshold::<T>::get(), 2u32);
	}

	impl_benchmark_test_suite!(Bridge, crate::mock::new_test_ext(), crate::mock::Test);
}