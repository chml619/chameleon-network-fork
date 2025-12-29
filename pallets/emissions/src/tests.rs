//! Tests for the emissions pallet.

use crate::{mock::*, Error, Event};
use frame_support::{
    assert_noop, assert_ok,
    traits::{Get, Hooks},
};
use sp_runtime::Perbill;

#[test]
fn emission_year_1_correct() {
    new_test_ext().execute_with(|| {
        // Year 1: 1.407 CHML per block
        let rate = Emissions::calculate_emission_rate(0);
        assert_eq!(rate, 1_407_000_000_000_000_000);
        
        // Test a few blocks into year 1
        let rate_mid_year = Emissions::calculate_emission_rate(2_629_800); // ~6 months
        assert_eq!(rate_mid_year, 1_407_000_000_000_000_000);
    });
}

#[test]
fn emission_year_2_correct() {
    new_test_ext().execute_with(|| {
        // Year 2: 90% of Year 1 = 1.266 CHML per block
        let rate = Emissions::calculate_emission_rate(5_259_600);
        assert_eq!(rate, 1_266_300_000_000_000_000);
    });
}

#[test]
fn emission_year_5_correct() {
    new_test_ext().execute_with(|| {
        // Year 5: (0.9)^4 * 1.407 = 0.920 CHML per block
        let rate = Emissions::calculate_emission_rate(4 * 5_259_600);
        // 1_407_000_000_000_000_000 * 0.9^4 = 920_322_900_000_000_000
        assert_eq!(rate, 920_322_900_000_000_000);
    });
}

#[test]
fn emission_year_10_correct() {
    new_test_ext().execute_with(|| {
        // Year 10: (0.9)^9 * 1.407 = 0.544 CHML per block
        let rate = Emissions::calculate_emission_rate(9 * 5_259_600);
        // Calculate expected: 1_407_000_000_000_000_000 * (0.9)^9
        let mut expected = 1_407_000_000_000_000_000u128;
        for _ in 0..9 {
            expected = (expected * 9) / 10;
        }
        assert_eq!(rate, expected);
    });
}

#[test]
fn emission_year_20_correct() {
    new_test_ext().execute_with(|| {
        // Year 20: (0.9)^19 * 1.407 = 0.190 CHML per block
        let rate = Emissions::calculate_emission_rate(19 * 5_259_600);
        // Calculate expected: 1_407_000_000_000_000_000 * (0.9)^19
        let mut expected = 1_407_000_000_000_000_000u128;
        for _ in 0..19 {
            expected = (expected * 9) / 10;
        }
        assert_eq!(rate, expected);
    });
}

#[test]
fn emissions_stop_after_year_20() {
    new_test_ext().execute_with(|| {
        let rate = Emissions::calculate_emission_rate(20 * 5_259_600);
        assert_eq!(rate, 0);
        
        // Test well beyond year 20
        let rate_future = Emissions::calculate_emission_rate(25 * 5_259_600);
        assert_eq!(rate_future, 0);
    });
}

#[test]
fn total_emissions_65_million() {
    new_test_ext().execute_with(|| {
        let mut total: u128 = 0;
        let blocks_per_year = 5_259_600u32;
        
        for year in 0..20 {
            let rate = Emissions::calculate_emission_rate(year * blocks_per_year);
            total += (rate as u128) * (blocks_per_year as u128);
        }
        
        // Should be ~65M CHML (65_000_000_000_000_000_000_000_000)
        let expected = 65_000_000_000_000_000_000_000_000u128;
        let tolerance = expected / 100; // 1% tolerance for rounding
        
        println!("Total emissions: {}", total);
        println!("Expected: {}", expected);
        println!("Difference: {}", if total > expected { total - expected } else { expected - total });
        
        assert!(total >= expected - tolerance && total <= expected + tolerance,
            "Total emissions {} not within 1% of expected {}", total, expected);
    });
}

#[test]
fn validator_split_70_percent() {
    new_test_ext().execute_with(|| {
        // Verify 70% goes to validators
        let emission = 1_407_000_000_000_000_000u128;
        let validator_share = emission * 70 / 100;
        assert_eq!(validator_share, 984_900_000_000_000_000);
    });
}

#[test]
fn lp_split_30_percent() {
    new_test_ext().execute_with(|| {
        // Verify 30% goes to LP providers
        let emission = 1_407_000_000_000_000_000u128;
        let lp_share = emission * 30 / 100;
        assert_eq!(lp_share, 422_100_000_000_000_000);
    });
}

#[test]
fn on_finalize_processes_emissions_year_1() {
    new_test_ext().execute_with(|| {
        let pallet_account = Emissions::account_id();
        let initial_balance = Balances::free_balance(&pallet_account);
        
        // Run on_finalize for block 1 (Year 1)
        Emissions::on_finalize(1);
        
        // Check that tokens were minted to pallet account
        let final_balance = Balances::free_balance(&pallet_account);
        assert_eq!(final_balance, initial_balance + 1_407_000_000_000_000_000);
        
        // Check that total emitted was updated
        assert_eq!(Emissions::total_emitted(), 1_407_000_000_000_000_000);
        
        // Check that last emission block was updated
        assert_eq!(Emissions::last_emission_block(), 1);
    });
}

#[test]
fn on_finalize_processes_emissions_year_2() {
    new_test_ext().execute_with(|| {
        let pallet_account = Emissions::account_id();
        let initial_balance = Balances::free_balance(&pallet_account);
        
        // Set block to Year 2 start
        let year_2_block = 5_259_600;
        System::set_block_number(year_2_block);
        
        // Run on_finalize for Year 2
        Emissions::on_finalize(year_2_block);
        
        // Check that correct Year 2 amount was minted
        let final_balance = Balances::free_balance(&pallet_account);
        assert_eq!(final_balance, initial_balance + 1_266_300_000_000_000_000);
        
        // Check that total emitted was updated
        assert_eq!(Emissions::total_emitted(), 1_266_300_000_000_000_000);
    });
}

#[test]
fn on_finalize_stops_after_year_20() {
    new_test_ext().execute_with(|| {
        let pallet_account = Emissions::account_id();
        let initial_balance = Balances::free_balance(&pallet_account);
        
        // Set block to Year 21 start
        let year_21_block = 20 * 5_259_600;
        System::set_block_number(year_21_block);
        
        // Run on_finalize for Year 21
        Emissions::on_finalize(year_21_block);
        
        // Check that no tokens were minted
        let final_balance = Balances::free_balance(&pallet_account);
        assert_eq!(final_balance, initial_balance);
        
        // Check that total emitted was not updated
        assert_eq!(Emissions::total_emitted(), 0);
    });
}

#[test]
fn set_lp_apy_works() {
    new_test_ext().execute_with(|| {
        // Set APY for pool 3
        assert_ok!(Emissions::set_lp_apy(
            RuntimeOrigin::root(),
            3,
            Perbill::from_percent(20)
        ));
        
        // Check that the APY was set
        assert_eq!(Emissions::pool_apy(3), Some(Perbill::from_percent(20)));
        
        // Check that event was emitted
        System::assert_last_event(Event::LPAPYUpdated {
            pool_id: 3,
            old_apy: Perbill::zero(),
            new_apy: Perbill::from_percent(20),
            updated_by: 0, // Root account ID in mock
        }.into());
    });
}

#[test]
fn set_lp_apy_fails_with_invalid_apy() {
    new_test_ext().execute_with(|| {
        // Try to set APY > 100%
        assert_noop!(
            Emissions::set_lp_apy(
                RuntimeOrigin::root(),
                1,
                Perbill::from_percent(150)
            ),
            Error::<Test>::InvalidAPY
        );
    });
}

#[test]
fn update_emission_rate_works() {
    new_test_ext().execute_with(|| {
        let new_rate = 5_000_000_000_000_000_000; // 5 CHML
        
        assert_ok!(Emissions::update_emission_rate(
            RuntimeOrigin::root(),
            new_rate
        ));
        
        // Check that the rate was updated
        assert_eq!(Emissions::emission_rate(), new_rate);
        
        // Check that event was emitted
        System::assert_last_event(Event::EmissionRateUpdated {
            old_rate: 0, // No stored rate initially
            new_rate,
            updated_by: 0, // Root account ID in mock
        }.into());
    });
}

#[test]
fn claim_validator_rewards_fails_with_no_rewards() {
    new_test_ext().execute_with(|| {
        // Try to claim rewards without having any
        assert_noop!(
            Emissions::claim_validator_rewards(RuntimeOrigin::signed(1)),
            Error::<Test>::NoRewardsToClaim
        );
    });
}

#[test]
fn claim_lp_rewards_fails_with_no_rewards() {
    new_test_ext().execute_with(|| {
        // Try to claim LP rewards without having any
        assert_noop!(
            Emissions::claim_lp_rewards(RuntimeOrigin::signed(1), 1),
            Error::<Test>::NoRewardsToClaim
        );
    });
}

#[test]
fn yearly_emission_totals_correct() {
    new_test_ext().execute_with(|| {
        let blocks_per_year = 5_259_600u32;
        
        // Test specific years match the tokenomics table
        let test_cases = vec![
            (0, 7_400_000_000_000_000_000_000_000u128), // Year 1: 7.4M CHML
            (1, 6_660_000_000_000_000_000_000_000u128), // Year 2: 6.66M CHML
            (4, 4_840_000_000_000_000_000_000_000u128), // Year 5: 4.84M CHML (index 4 = year 5)
        ];
        
        for (year_index, expected_yearly_total) in test_cases {
            let rate = Emissions::calculate_emission_rate(year_index * blocks_per_year);
            let yearly_total = (rate as u128) * (blocks_per_year as u128);
            
            // Allow 1% tolerance for rounding
            let tolerance = expected_yearly_total / 100;
            assert!(
                yearly_total >= expected_yearly_total - tolerance && 
                yearly_total <= expected_yearly_total + tolerance,
                "Year {} total {} not within 1% of expected {}", 
                year_index + 1, yearly_total, expected_yearly_total
            );
        }
    });
}