//! Tests for the staking pallet.

use crate::{mock::*, Error, Event};
use frame_support::{
    assert_noop, assert_ok,
    traits::{Get, OnFinalize},
};
use sp_runtime::traits::Zero;

#[test]
fn stake_works() {
    new_test_ext().execute_with(|| {
        let stake_amount = 50_000_000_000_000_000_000; // 50 CHML
        
        // Stake tokens
        assert_ok!(Staking::stake(RuntimeOrigin::signed(1), stake_amount));
        
        // Check storage
        let stake_info = Staking::stakers(1);
        assert_eq!(stake_info.amount, stake_amount);
        assert_eq!(Staking::total_staked(), stake_amount);
        
        // Check event
        System::assert_last_event(Event::Staked {
            account: 1,
            amount: stake_amount,
            total_staked: stake_amount,
        }.into());
    });
}

#[test]
fn stake_fails_with_insufficient_balance() {
    new_test_ext().execute_with(|| {
        let stake_amount = 2000_000_000_000_000_000_000; // 2000 CHML (more than account 1 has)
        
        // Should fail
        assert_noop!(
            Staking::stake(RuntimeOrigin::signed(1), stake_amount),
            Error::<Test>::InsufficientBalance
        );
    });
}

#[test]
fn stake_fails_with_amount_too_low() {
    new_test_ext().execute_with(|| {
        let stake_amount = 5_000_000_000_000_000_000; // 5 CHML (below minimum)
        
        // Should fail
        assert_noop!(
            Staking::stake(RuntimeOrigin::signed(1), stake_amount),
            Error::<Test>::StakeAmountTooLow
        );
    });
}

#[test]
fn unstake_works() {
    new_test_ext().execute_with(|| {
        let stake_amount = 50_000_000_000_000_000_000; // 50 CHML
        let unstake_amount = 20_000_000_000_000_000_000; // 20 CHML
        
        // First stake
        assert_ok!(Staking::stake(RuntimeOrigin::signed(1), stake_amount));
        
        // Then unstake
        assert_ok!(Staking::unstake(RuntimeOrigin::signed(1), unstake_amount));
        
        // Check storage
        let stake_info = Staking::stakers(1);
        assert_eq!(stake_info.amount, stake_amount - unstake_amount);
        assert_eq!(Staking::total_staked(), stake_amount - unstake_amount);
        
        // Check event
        System::assert_last_event(Event::Unstaked {
            account: 1,
            amount: unstake_amount,
            remaining_stake: stake_amount - unstake_amount,
        }.into());
    });
}

#[test]
fn unstake_fails_with_insufficient_stake() {
    new_test_ext().execute_with(|| {
        let stake_amount = 50_000_000_000_000_000_000; // 50 CHML
        let unstake_amount = 100_000_000_000_000_000_000; // 100 CHML
        
        // First stake
        assert_ok!(Staking::stake(RuntimeOrigin::signed(1), stake_amount));
        
        // Try to unstake more than staked
        assert_noop!(
            Staking::unstake(RuntimeOrigin::signed(1), unstake_amount),
            Error::<Test>::InsufficientStake
        );
    });
}

#[test]
fn claim_rewards_works() {
    new_test_ext().execute_with(|| {
        let stake_amount = 50_000_000_000_000_000_000; // 50 CHML
        let reward_rate = 1_000_000_000_000_000_000; // 1 CHML per block
        let fund_amount = 1000_000_000_000_000_000_000; // 1000 CHML for rewards
        
        // Set up reward rate and fund pool
        assert_ok!(Staking::set_reward_rate(RuntimeOrigin::root(), reward_rate));
        assert_ok!(Staking::fund_reward_pool(RuntimeOrigin::signed(2), fund_amount));
        
        // Stake tokens
        assert_ok!(Staking::stake(RuntimeOrigin::signed(1), stake_amount));
        
        // Advance block to trigger reward calculation
        System::set_block_number(2);
        Staking::on_finalize(2);
        
        // Check that rewards were accumulated
        let stake_info = Staking::stakers(1);
        assert!(!stake_info.rewards_accumulated.is_zero());
        
        // Claim rewards
        assert_ok!(Staking::claim_rewards(RuntimeOrigin::signed(1)));
        
        // Check that rewards were reset
        let stake_info = Staking::stakers(1);
        assert!(stake_info.rewards_accumulated.is_zero());
    });
}

#[test]
fn claim_rewards_fails_with_no_rewards() {
    new_test_ext().execute_with(|| {
        // Try to claim without any rewards
        assert_noop!(
            Staking::claim_rewards(RuntimeOrigin::signed(1)),
            Error::<Test>::NoRewardsToClaim
        );
    });
}

#[test]
fn set_reward_rate_works() {
    new_test_ext().execute_with(|| {
        let reward_rate = 1_000_000_000_000_000_000; // 1 CHML per block
        
        // Set reward rate
        assert_ok!(Staking::set_reward_rate(RuntimeOrigin::root(), reward_rate));
        
        // Check storage
        assert_eq!(Staking::reward_rate(), reward_rate);
    });
}

#[test]
fn set_reward_rate_fails_with_zero_rate() {
    new_test_ext().execute_with(|| {
        // Try to set zero reward rate
        assert_noop!(
            Staking::set_reward_rate(RuntimeOrigin::root(), 0),
            Error::<Test>::InvalidRewardRate
        );
    });
}

#[test]
fn fund_reward_pool_works() {
    new_test_ext().execute_with(|| {
        let fund_amount = 100_000_000_000_000_000_000; // 100 CHML
        
        // Fund reward pool
        assert_ok!(Staking::fund_reward_pool(RuntimeOrigin::signed(1), fund_amount));
        
        // Check storage
        assert_eq!(Staking::reward_pool(), fund_amount);
        
        // Check event
        System::assert_last_event(Event::RewardPoolFunded {
            amount: fund_amount,
            funded_by: 1,
        }.into());
    });
}

#[test]
fn proportional_rewards_work() {
    new_test_ext().execute_with(|| {
        let stake_amount_1 = 30_000_000_000_000_000_000; // 30 CHML
        let stake_amount_2 = 70_000_000_000_000_000_000; // 70 CHML
        let reward_rate = 100_000_000_000_000_000_000; // 100 CHML per block
        let fund_amount = 1000_000_000_000_000_000_000; // 1000 CHML for rewards
        
        // Set up reward rate and fund pool
        assert_ok!(Staking::set_reward_rate(RuntimeOrigin::root(), reward_rate));
        assert_ok!(Staking::fund_reward_pool(RuntimeOrigin::signed(3), fund_amount));
        
        // Two users stake different amounts
        assert_ok!(Staking::stake(RuntimeOrigin::signed(1), stake_amount_1));
        assert_ok!(Staking::stake(RuntimeOrigin::signed(2), stake_amount_2));
        
        // Advance block to trigger reward calculation
        System::set_block_number(2);
        Staking::on_finalize(2);
        
        // Check proportional rewards
        let stake_info_1 = Staking::stakers(1);
        let stake_info_2 = Staking::stakers(2);
        
        // User 1 should get 30% of rewards (30/100)
        // User 2 should get 70% of rewards (70/100)
        let expected_reward_1 = reward_rate * 30 / 100;
        let expected_reward_2 = reward_rate * 70 / 100;
        
        assert_eq!(stake_info_1.rewards_accumulated, expected_reward_1);
        assert_eq!(stake_info_2.rewards_accumulated, expected_reward_2);
    });
}

#[test]
fn multiple_stake_unstake_works() {
    new_test_ext().execute_with(|| {
        let stake_amount_1 = 30_000_000_000_000_000_000; // 30 CHML
        let stake_amount_2 = 20_000_000_000_000_000_000; // 20 CHML
        let unstake_amount = 15_000_000_000_000_000_000; // 15 CHML
        
        // First stake
        assert_ok!(Staking::stake(RuntimeOrigin::signed(1), stake_amount_1));
        assert_eq!(Staking::stakers(1).amount, stake_amount_1);
        
        // Second stake (should add to existing)
        assert_ok!(Staking::stake(RuntimeOrigin::signed(1), stake_amount_2));
        assert_eq!(Staking::stakers(1).amount, stake_amount_1 + stake_amount_2);
        
        // Partial unstake
        assert_ok!(Staking::unstake(RuntimeOrigin::signed(1), unstake_amount));
        assert_eq!(Staking::stakers(1).amount, stake_amount_1 + stake_amount_2 - unstake_amount);
        
        // Total staked should be updated correctly
        assert_eq!(Staking::total_staked(), stake_amount_1 + stake_amount_2 - unstake_amount);
    });
}

#[test]
fn complete_unstake_removes_storage() {
    new_test_ext().execute_with(|| {
        let stake_amount = 50_000_000_000_000_000_000; // 50 CHML
        
        // Stake tokens
        assert_ok!(Staking::stake(RuntimeOrigin::signed(1), stake_amount));
        assert!(!Staking::stakers(1).amount.is_zero());
        
        // Unstake all tokens
        assert_ok!(Staking::unstake(RuntimeOrigin::signed(1), stake_amount));
        
        // Storage should be cleaned up (amount should be zero)
        assert!(Staking::stakers(1).amount.is_zero());
        assert_eq!(Staking::total_staked(), 0);
    });
}