//! Benchmarking setup for pallet-staking

#![cfg(feature = "runtime-benchmarks")]

use super::*;
use frame_benchmarking::v2::*;
use frame_support::traits::Get;
use frame_system::RawOrigin;

#[benchmarks]
mod benchmarks {
    use super::*;

    #[benchmark]
    fn stake() {
        let caller: T::AccountId = whitelisted_caller();
        let stake_amount = T::MinimumStake::get();
        
        // Fund the caller
        T::Currency::make_free_balance_be(&caller, stake_amount * 2u32.into());

        #[extrinsic_call]
        stake(RawOrigin::Signed(caller.clone()), stake_amount);

        assert_eq!(Stakers::<T>::get(&caller).amount, stake_amount);
    }

    #[benchmark]
    fn unstake() {
        let caller: T::AccountId = whitelisted_caller();
        let stake_amount = T::MinimumStake::get();
        
        // Fund and stake first
        T::Currency::make_free_balance_be(&caller, stake_amount * 2u32.into());
        let _ = Pallet::<T>::stake(RawOrigin::Signed(caller.clone()).into(), stake_amount);

        #[extrinsic_call]
        unstake(RawOrigin::Signed(caller.clone()), stake_amount);

        assert_eq!(Stakers::<T>::get(&caller).amount, 0u32.into());
    }

    #[benchmark]
    fn claim_rewards() {
        let caller: T::AccountId = whitelisted_caller();
        let stake_amount = T::MinimumStake::get();
        let reward_amount = stake_amount;
        
        // Fund and stake first
        T::Currency::make_free_balance_be(&caller, stake_amount * 2u32.into());
        let _ = Pallet::<T>::stake(RawOrigin::Signed(caller.clone()).into(), stake_amount);
        
        // Manually add some rewards
        Stakers::<T>::mutate(&caller, |info| {
            info.rewards_accumulated = reward_amount;
        });
        
        // Fund the reward pool account
        let reward_account = Pallet::<T>::reward_account_id();
        T::Currency::make_free_balance_be(&reward_account, reward_amount * 2u32.into());

        #[extrinsic_call]
        claim_rewards(RawOrigin::Signed(caller.clone()));

        assert_eq!(Stakers::<T>::get(&caller).rewards_accumulated, 0u32.into());
    }

    #[benchmark]
    fn set_reward_rate() {
        let rate = T::MinimumStake::get();

        #[extrinsic_call]
        set_reward_rate(RawOrigin::Root, rate);

        assert_eq!(RewardRate::<T>::get(), rate);
    }

    #[benchmark]
    fn fund_reward_pool() {
        let caller: T::AccountId = whitelisted_caller();
        let fund_amount = T::MinimumStake::get();
        
        // Fund the caller
        T::Currency::make_free_balance_be(&caller, fund_amount * 2u32.into());

        #[extrinsic_call]
        fund_reward_pool(RawOrigin::Signed(caller.clone()), fund_amount);

        assert_eq!(RewardPool::<T>::get(), fund_amount);
    }

    impl_benchmark_test_suite!(Pallet, crate::mock::new_test_ext(), crate::mock::Test);
}