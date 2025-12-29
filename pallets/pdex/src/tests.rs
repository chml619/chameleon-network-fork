//! Unit tests for the pDEX pallet.

use crate::{mock::*, Error, Event};
use frame_support::{
    assert_noop, assert_ok,
    traits::fungibles::{Inspect, Mutate},
};
use sp_runtime::traits::Zero;

#[test]
fn create_pool_works() {
    new_test_ext().execute_with(|| {
        // Create a pool for CHML/ETH
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        // Check that pool was created
        let pool = Pdex::get_pool(0).unwrap();
        assert_eq!(pool.asset_a, 1); // CHML (smaller ID)
        assert_eq!(pool.asset_b, 2); // ETH
        assert_eq!(pool.reserve_a, 0);
        assert_eq!(pool.reserve_b, 0);
        assert_eq!(pool.total_lp_tokens, 0);
        
        // Check pool count
        assert_eq!(Pdex::pool_count(), 1);
        
        // Check asset pair mapping
        assert_eq!(Pdex::get_pool_id(1, 2), Some(0));
        assert_eq!(Pdex::get_pool_id(2, 1), Some(0)); // Order doesn't matter
        
        // Check event
        assert_eq!(
            last_event(),
            RuntimeEvent::Pdex(Event::PoolCreated {
                pool_id: 0,
                asset_a: 1,
                asset_b: 2,
                lp_asset_id: 10000, // pool_id + 10000
                creator: 1,
            })
        );
    });
}

#[test]
fn create_pool_fails_with_same_asset() {
    new_test_ext().execute_with(|| {
        // Cannot create pool with same asset
        assert_noop!(
            Pdex::create_pool(RuntimeOrigin::signed(1), 1, 1),
            Error::<Test>::InvalidAssetPair
        );
    });
}

#[test]
fn create_pool_fails_if_already_exists() {
    new_test_ext().execute_with(|| {
        // Create first pool
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        // Try to create same pool again
        assert_noop!(
            Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2),
            Error::<Test>::PoolAlreadyExists
        );
        
        // Try with reversed order
        assert_noop!(
            Pdex::create_pool(RuntimeOrigin::signed(1), 2, 1),
            Error::<Test>::PoolAlreadyExists
        );
    });
}

#[test]
fn add_liquidity_works_first_time() {
    new_test_ext().execute_with(|| {
        // Create pool
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        // Add initial liquidity: 1000 CHML + 10 ETH
        let amount_a = 1_000_000_000_000_000_000_000u128; // 1000 CHML
        let amount_b = 10_000_000_000_000_000_000u128;    // 10 ETH
        
        assert_ok!(Pdex::add_liquidity(
            RuntimeOrigin::signed(1),
            0, // pool_id
            amount_a,
            amount_b,
            0, // min_lp_tokens
        ));
        
        // Check pool state
        let pool = Pdex::get_pool(0).unwrap();
        assert_eq!(pool.reserve_a, amount_a);
        assert_eq!(pool.reserve_b, amount_b);
        
        // LP tokens = sqrt(1000 * 10) - minimum_liquidity = sqrt(10000) - 1000 = 100 - 1000
        // But we use 10^18 units, so sqrt(1000*10^18 * 10*10^18) - 1000 = sqrt(10^40) - 1000 = 10^20 - 1000
        let expected_lp = Pdex::integer_sqrt(amount_a * amount_b) - 1000;
        assert_eq!(pool.total_lp_tokens, expected_lp);
        
        // Check user LP balance
        assert_eq!(Pdex::user_lp_tokens(1, 0), expected_lp);
        
        // Check that tokens were transferred
        let pool_account = Pdex::pool_account(0);
        assert_eq!(Assets::balance(1, &pool_account), amount_a);
        assert_eq!(Assets::balance(2, &pool_account), amount_b);
        
        // Check user balances decreased
        assert_eq!(Assets::balance(1, &1), 0); // Started with 1000, added 1000
        assert_eq!(Assets::balance(2, &1), 90_000_000_000_000_000_000u128); // Started with 100, added 10
    });
}

#[test]
fn add_liquidity_works_proportional() {
    new_test_ext().execute_with(|| {
        // Create pool and add initial liquidity
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        let initial_a = 1_000_000_000_000_000_000_000u128; // 1000 CHML
        let initial_b = 10_000_000_000_000_000_000u128;    // 10 ETH
        
        assert_ok!(Pdex::add_liquidity(
            RuntimeOrigin::signed(1),
            0,
            initial_a,
            initial_b,
            0,
        ));
        
        // Add more liquidity proportionally (double the amounts)
        let add_a = 2_000_000_000_000_000_000_000u128; // 2000 CHML
        let add_b = 20_000_000_000_000_000_000u128;    // 20 ETH
        
        assert_ok!(Pdex::add_liquidity(
            RuntimeOrigin::signed(2),
            0,
            add_a,
            add_b,
            0,
        ));
        
        // Check pool state
        let pool = Pdex::get_pool(0).unwrap();
        assert_eq!(pool.reserve_a, initial_a + add_a);
        assert_eq!(pool.reserve_b, initial_b + add_b);
        
        // User 2 should get 2x the LP tokens of user 1
        let user1_lp = Pdex::user_lp_tokens(1, 0);
        let user2_lp = Pdex::user_lp_tokens(2, 0);
        assert_eq!(user2_lp, user1_lp * 2);
    });
}

#[test]
fn add_liquidity_fails_with_zero_amount() {
    new_test_ext().execute_with(|| {
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        assert_noop!(
            Pdex::add_liquidity(RuntimeOrigin::signed(1), 0, 0, 100, 0),
            Error::<Test>::ZeroAmount
        );
        
        assert_noop!(
            Pdex::add_liquidity(RuntimeOrigin::signed(1), 0, 100, 0, 0),
            Error::<Test>::ZeroAmount
        );
    });
}

#[test]
fn remove_liquidity_works() {
    new_test_ext().execute_with(|| {
        // Setup: Create pool and add liquidity
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        let amount_a = 1_000_000_000_000_000_000_000u128; // 1000 CHML
        let amount_b = 10_000_000_000_000_000_000u128;    // 10 ETH
        
        assert_ok!(Pdex::add_liquidity(
            RuntimeOrigin::signed(1),
            0,
            amount_a,
            amount_b,
            0,
        ));
        
        let initial_lp = Pdex::user_lp_tokens(1, 0);
        let remove_lp = initial_lp / 2; // Remove half
        
        // Remove liquidity
        assert_ok!(Pdex::remove_liquidity(
            RuntimeOrigin::signed(1),
            0,
            remove_lp,
            0, // min_amount_a
            0, // min_amount_b
        ));
        
        // Check pool state
        let pool = Pdex::get_pool(0).unwrap();
        assert_eq!(pool.reserve_a, amount_a / 2);
        assert_eq!(pool.reserve_b, amount_b / 2);
        assert_eq!(pool.total_lp_tokens, initial_lp - remove_lp);
        
        // Check user LP balance
        assert_eq!(Pdex::user_lp_tokens(1, 0), initial_lp - remove_lp);
        
        // Check user got tokens back
        assert_eq!(Assets::balance(1, &1), amount_a / 2);
        assert_eq!(Assets::balance(2, &1), 90_000_000_000_000_000_000u128 + amount_b / 2);
    });
}

#[test]
fn swap_works() {
    new_test_ext().execute_with(|| {
        // Setup: Create pool and add liquidity
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        let amount_a = 1_000_000_000_000_000_000_000u128; // 1000 CHML
        let amount_b = 10_000_000_000_000_000_000u128;    // 10 ETH
        
        assert_ok!(Pdex::add_liquidity(
            RuntimeOrigin::signed(1),
            0,
            amount_a,
            amount_b,
            0,
        ));
        
        // User 2 swaps 100 CHML for ETH
        let swap_amount = 100_000_000_000_000_000_000u128; // 100 CHML
        
        // Calculate expected output
        let expected_out = Pdex::get_swap_amount_out(0, 1, swap_amount).unwrap();
        
        assert_ok!(Pdex::swap(
            RuntimeOrigin::signed(2),
            0,
            1, // asset_in (CHML)
            swap_amount,
            0, // min_amount_out
        ));
        
        // Check pool reserves changed
        let pool = Pdex::get_pool(0).unwrap();
        assert_eq!(pool.reserve_a, amount_a + swap_amount);
        assert_eq!(pool.reserve_b, amount_b - expected_out);
        
        // Check user balances
        assert_eq!(Assets::balance(1, &2), 1_000_000_000_000_000_000_000u128 - swap_amount);
        assert_eq!(Assets::balance(2, &2), 100_000_000_000_000_000_000u128 + expected_out);
    });
}

#[test]
fn swap_fails_with_slippage() {
    new_test_ext().execute_with(|| {
        // Setup: Create pool and add liquidity
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        let amount_a = 1_000_000_000_000_000_000_000u128; // 1000 CHML
        let amount_b = 10_000_000_000_000_000_000u128;    // 10 ETH
        
        assert_ok!(Pdex::add_liquidity(
            RuntimeOrigin::signed(1),
            0,
            amount_a,
            amount_b,
            0,
        ));
        
        let swap_amount = 100_000_000_000_000_000_000u128; // 100 CHML
        let expected_out = Pdex::get_swap_amount_out(0, 1, swap_amount).unwrap();
        
        // Set min_amount_out higher than expected
        assert_noop!(
            Pdex::swap(
                RuntimeOrigin::signed(2),
                0,
                1,
                swap_amount,
                expected_out + 1, // Too high
            ),
            Error::<Test>::SlippageExceeded
        );
    });
}

#[test]
fn swap_fails_with_zero_amount() {
    new_test_ext().execute_with(|| {
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        assert_noop!(
            Pdex::swap(RuntimeOrigin::signed(1), 0, 1, 0, 0),
            Error::<Test>::ZeroAmount
        );
    });
}

#[test]
fn swap_fails_with_insufficient_liquidity() {
    new_test_ext().execute_with(|| {
        // Create pool but don't add liquidity
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        assert_noop!(
            Pdex::swap(RuntimeOrigin::signed(1), 0, 1, 100, 0),
            Error::<Test>::InsufficientLiquidity
        );
    });
}

#[test]
fn get_swap_amount_out_works() {
    new_test_ext().execute_with(|| {
        // Setup pool with liquidity
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        let amount_a = 1_000_000_000_000_000_000_000u128; // 1000 CHML
        let amount_b = 10_000_000_000_000_000_000u128;    // 10 ETH
        
        assert_ok!(Pdex::add_liquidity(
            RuntimeOrigin::signed(1),
            0,
            amount_a,
            amount_b,
            0,
        ));
        
        // Test swap calculation
        let swap_in = 100_000_000_000_000_000_000u128; // 100 CHML
        let amount_out = Pdex::get_swap_amount_out(0, 1, swap_in).unwrap();
        
        // Should be less than 1 ETH due to constant product formula and fees
        assert!(amount_out < 1_000_000_000_000_000_000u128);
        assert!(amount_out > 0);
        
        // Test reverse direction
        let amount_out_reverse = Pdex::get_swap_amount_out(0, 2, 1_000_000_000_000_000_000u128).unwrap();
        assert!(amount_out_reverse > 0);
        assert!(amount_out_reverse < 100_000_000_000_000_000_000u128);
    });
}

#[test]
fn constant_product_formula_maintained() {
    new_test_ext().execute_with(|| {
        // Setup pool
        assert_ok!(Pdex::create_pool(RuntimeOrigin::signed(1), 1, 2));
        
        let amount_a = 1_000_000_000_000_000_000_000u128; // 1000 CHML
        let amount_b = 10_000_000_000_000_000_000u128;    // 10 ETH
        
        assert_ok!(Pdex::add_liquidity(
            RuntimeOrigin::signed(1),
            0,
            amount_a,
            amount_b,
            0,
        ));
        
        let pool_before = Pdex::get_pool(0).unwrap();
        let k_before = pool_before.reserve_a.saturating_mul(pool_before.reserve_b);
        
        // Execute swap
        let swap_amount = 100_000_000_000_000_000_000u128; // 100 CHML
        assert_ok!(Pdex::swap(
            RuntimeOrigin::signed(2),
            0,
            1,
            swap_amount,
            0,
        ));
        
        let pool_after = Pdex::get_pool(0).unwrap();
        let k_after = pool_after.reserve_a.saturating_mul(pool_after.reserve_b);
        
        // k should increase due to fees (0.3% fee stays in pool)
        assert!(k_after >= k_before);
    });
}

// Tests for pDEX-Assets Integration

#[test]
fn create_pool_with_assets() {
    new_test_ext().execute_with(|| {
        // Create test assets
        let asset_a: u32 = 1;
        let asset_b: u32 = 2;
        
        // Create pool
        assert_ok!(Pdex::create_pool(
            RuntimeOrigin::signed(1),
            asset_a.into(),
            asset_b.into(),
        ));
        
        // Verify pool exists
        assert!(Pdex::get_pool(0).is_some());
        
        let pool = Pdex::get_pool(0).unwrap();
        assert_eq!(pool.asset_a, asset_a);
        assert_eq!(pool.asset_b, asset_b);
        assert_eq!(pool.lp_asset_id, 10000); // pool_id + 10000
    });
}

#[test]
fn get_pool_info_for_emissions() {
    new_test_ext().execute_with(|| {
        setup_test_pool();
        
        let pool_info = Pdex::get_pool_info(0);
        assert!(pool_info.is_some());
        
        let info = pool_info.unwrap();
        assert!(info.total_lp_tokens > 0);
        assert_eq!(info.asset_a, 1);
        assert_eq!(info.asset_b, 2);
    });
}

#[test]
fn get_pool_lps_for_rewards() {
    new_test_ext().execute_with(|| {
        setup_test_pool();
        
        let lps = Pdex::get_pool_lps(0);
        assert!(!lps.is_empty());
        
        // Should have Alice as LP provider
        let alice_lp = lps.iter().find(|(account, _)| *account == 1);
        assert!(alice_lp.is_some());
        assert!(alice_lp.unwrap().1 > 0);
    });
}

#[test]
fn get_pool_total_liquidity() {
    new_test_ext().execute_with(|| {
        setup_test_pool();
        
        let total_liquidity = Pdex::get_pool_total_liquidity(0);
        assert!(total_liquidity > 0);
        
        // For non-existent pool
        let no_liquidity = Pdex::get_pool_total_liquidity(999);
        assert_eq!(no_liquidity, 0);
    });
}

#[test]
fn get_user_liquidity_share() {
    new_test_ext().execute_with(|| {
        setup_test_pool();
        
        // Alice should have 100% share (only LP provider in setup)
        let alice_share = Pdex::get_user_liquidity_share(&1, 0);
        assert!(alice_share.deconstruct() > 0);
        
        // Bob should have 0% share
        let bob_share = Pdex::get_user_liquidity_share(&2, 0);
        assert_eq!(bob_share.deconstruct(), 0);
        
        // For non-existent pool
        let no_share = Pdex::get_user_liquidity_share(&1, 999);
        assert_eq!(no_share.deconstruct(), 0);
    });
}

#[test]
fn assets_integration_works() {
    new_test_ext().execute_with(|| {
        // This test verifies that the Assets trait is properly integrated
        // The fact that setup_test_pool() works means asset transfers work
        setup_test_pool();
        
        let pool = Pdex::get_pool(0).unwrap();
        
        // Verify pool has reserves (assets were transferred)
        assert!(pool.reserve_a > 0);
        assert!(pool.reserve_b > 0);
        
        // Verify LP tokens were created and minted
        assert!(pool.total_lp_tokens > 0);
        assert_eq!(pool.lp_asset_id, 10000);
        
        // Verify user has LP tokens
        let alice_lp_balance = Pdex::user_lp_tokens(1, 0);
        assert!(alice_lp_balance > 0);
        assert_eq!(alice_lp_balance, pool.total_lp_tokens);
    });
}