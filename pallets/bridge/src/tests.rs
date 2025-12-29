//! Tests for the bridge pallet.

use crate::{mock::*, pallet::{Error, Event, Chain, Asset, DepositStatus}};
use frame_support::{
    assert_noop, assert_ok,
    traits::Get,
};
use sp_core::H256;

#[test]
fn initiate_deposit_works() {
    new_test_ext().execute_with(|| {
        // Go past genesis block so events get deposited
        System::set_block_number(1);
        
        // Test successful deposit initiation
        assert_ok!(Bridge::initiate_deposit(
            RuntimeOrigin::signed(1),
            Chain::Ethereum,
            Asset::ETH,
            1_000_000_000_000_000_000, // 1 ETH equivalent
            2, // destination account
        ));
        
        // Check that event was emitted
        System::assert_last_event(Event::DepositInitiated {
            deposit_id: 1,
            chain: Chain::Ethereum,
            asset: Asset::ETH,
            amount: 1_000_000_000_000_000_000,
            depositor: 1,
            destination: 2,
        }.into());
        
        // Check that deposit was stored
        let deposit = Bridge::pending_deposits(1).unwrap();
        assert_eq!(deposit.depositor, 1);
        assert_eq!(deposit.destination, 2);
        assert_eq!(deposit.amount, 1_000_000_000_000_000_000);
        assert_eq!(deposit.confirmations, 0);
    });
}

#[test]
fn initiate_deposit_fails_with_invalid_amount() {
    new_test_ext().execute_with(|| {
        // Test with zero amount
        assert_noop!(
            Bridge::initiate_deposit(
                RuntimeOrigin::signed(1),
                Chain::Ethereum,
                Asset::ETH,
                0,
                2,
            ),
            Error::<Test>::InvalidAmount
        );
        
        // Test with amount below minimum
        assert_noop!(
            Bridge::initiate_deposit(
                RuntimeOrigin::signed(1),
                Chain::Ethereum,
                Asset::ETH,
                500_000_000_000_000_000, // 0.5 CHML (below 1 CHML minimum)
                2,
            ),
            Error::<Test>::InvalidAmount
        );
    });
}

#[test]
fn confirm_deposit_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        // First initiate a deposit
        assert_ok!(Bridge::initiate_deposit(
            RuntimeOrigin::signed(1),
            Chain::Ethereum,
            Asset::ETH,
            1_000_000_000_000_000_000,
            2,
        ));
        
        let tx_hash = H256::from([1u8; 32]);
        
        // First validator confirms
        assert_ok!(Bridge::confirm_deposit(
            RuntimeOrigin::signed(10), // validator
            1, // deposit_id
            tx_hash,
        ));
        
        // Check confirmation event
        System::assert_has_event(Event::DepositConfirmed {
            deposit_id: 1,
            validator: 10,
            confirmations: 1,
            threshold: 2,
        }.into());
        
        // Deposit should still be pending (need 2 confirmations)
        let deposit = Bridge::pending_deposits(1).unwrap();
        assert_eq!(deposit.confirmations, 1);
        assert_eq!(deposit.status, DepositStatus::Pending);
        
        // Second validator confirms - should complete the deposit
        assert_ok!(Bridge::confirm_deposit(
            RuntimeOrigin::signed(11), // another validator
            1,
            tx_hash,
        ));
        
        // Check completion event
        System::assert_has_event(Event::DepositCompleted {
            deposit_id: 1,
            depositor: 1,
            amount_minted: 1_000_000_000_000_000_000,
            external_tx_hash: tx_hash,
        }.into());
        
        // Deposit should be removed from storage
        assert!(Bridge::pending_deposits(1).is_none());
        
        // Check that tokens were minted to destination account
        assert_eq!(Balances::free_balance(2), 5000_000_000_000_000_000_000 + 1_000_000_000_000_000_000);
    });
}

#[test]
fn confirm_deposit_fails_for_non_validator() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        // First initiate a deposit
        assert_ok!(Bridge::initiate_deposit(
            RuntimeOrigin::signed(1),
            Chain::Ethereum,
            Asset::ETH,
            1_000_000_000_000_000_000,
            2,
        ));
        
        // Non-validator tries to confirm
        assert_noop!(
            Bridge::confirm_deposit(
                RuntimeOrigin::signed(1), // not a validator
                1,
                H256::from([1u8; 32]),
            ),
            Error::<Test>::NotValidator
        );
    });
}

#[test]
fn initiate_withdrawal_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        let initial_balance = Balances::free_balance(1);
        let withdrawal_amount = 1_000_000_000_000_000_000; // 1 CHML
        
        // Test successful withdrawal initiation
        assert_ok!(Bridge::initiate_withdrawal(
            RuntimeOrigin::signed(1),
            Chain::Ethereum,
            Asset::ETH,
            withdrawal_amount,
            b"0x1234567890abcdef".to_vec().try_into().unwrap(),
        ));
        
        // Check that event was emitted
        System::assert_last_event(Event::WithdrawalInitiated {
            withdrawal_id: 1,
            chain: Chain::Ethereum,
            asset: Asset::ETH,
            amount: withdrawal_amount,
            withdrawer: 1,
            external_address: b"0x1234567890abcdef".to_vec().try_into().unwrap(),
        }.into());
        
        // Check that tokens were burned from user account
        assert_eq!(Balances::free_balance(1), initial_balance - withdrawal_amount);
        
        // Check that withdrawal was stored
        let withdrawal = Bridge::pending_withdrawals(1).unwrap();
        assert_eq!(withdrawal.withdrawer, 1);
        assert_eq!(withdrawal.amount, withdrawal_amount);
        assert_eq!(withdrawal.confirmations, 0);
    });
}

#[test]
fn confirm_withdrawal_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        // First initiate a withdrawal
        assert_ok!(Bridge::initiate_withdrawal(
            RuntimeOrigin::signed(1),
            Chain::Ethereum,
            Asset::ETH,
            1_000_000_000_000_000_000,
            b"0x1234567890abcdef".to_vec().try_into().unwrap(),
        ));
        
        let tx_hash = H256::from([2u8; 32]);
        
        // First validator confirms
        assert_ok!(Bridge::confirm_withdrawal(
            RuntimeOrigin::signed(10),
            1,
            tx_hash,
        ));
        
        // Second validator confirms - should complete
        assert_ok!(Bridge::confirm_withdrawal(
            RuntimeOrigin::signed(11),
            1,
            tx_hash,
        ));
        
        // Check completion event
        System::assert_has_event(Event::WithdrawalCompleted {
            withdrawal_id: 1,
            withdrawer: 1,
            external_tx_hash: tx_hash,
        }.into());
        
        // Withdrawal should be removed from storage
        assert!(Bridge::pending_withdrawals(1).is_none());
    });
}

#[test]
fn add_validator_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        // Add a new validator
        assert_ok!(Bridge::add_validator(
            RuntimeOrigin::root(),
            20,
        ));
        
        // Check that validator was added
        let validators = Bridge::bridge_validators();
        assert!(validators.contains(&20));
        assert_eq!(validators.len(), 4); // 3 initial + 1 new
    });
}

#[test]
fn remove_validator_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        // Remove a validator
        assert_ok!(Bridge::remove_validator(
            RuntimeOrigin::root(),
            10,
        ));
        
        // Check that validator was removed
        let validators = Bridge::bridge_validators();
        assert!(!validators.contains(&10));
        assert_eq!(validators.len(), 2); // 3 initial - 1 removed
    });
}

#[test]
fn set_confirmation_threshold_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        // Set new threshold
        assert_ok!(Bridge::set_confirmation_threshold(
            RuntimeOrigin::root(),
            3,
        ));
        
        // Check that threshold was updated
        assert_eq!(Bridge::confirmation_threshold(), 3);
    });
}

#[test]
fn set_confirmation_threshold_fails_if_too_high() {
    new_test_ext().execute_with(|| {
        // Try to set threshold higher than validator count
        assert_noop!(
            Bridge::set_confirmation_threshold(
                RuntimeOrigin::root(),
                5, // higher than 3 validators
            ),
            Error::<Test>::ThresholdTooHigh
        );
    });
}