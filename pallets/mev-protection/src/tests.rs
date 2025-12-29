use crate::{mock::*, Error, Event, PendingProtectedTxs, ProtectedTransaction};
use frame_support::{assert_noop, assert_ok, traits::Get};
use sp_runtime::traits::Hash;

#[test]
fn submit_protected_tx_works() {
    new_test_ext().execute_with(|| {
        // Go past genesis block so events get deposited
        System::set_block_number(1);
        
        let encrypted_call = vec![1, 2, 3, 4, 5];
        let delay_blocks = 50u64;
        
        // Submit a protected transaction
        assert_ok!(MevProtection::submit_protected_tx(
            RuntimeOrigin::signed(1),
            encrypted_call.clone(),
            delay_blocks
        ));
        
        // Check that the transaction was stored
        let protected_tx = ProtectedTransaction {
            submitter: 1,
            encrypted_call: encrypted_call.try_into().unwrap(),
            execute_at_block: 1 + delay_blocks,
            submitted_at_block: 1,
        };
        
        let tx_hash = <Test as frame_system::Config>::Hashing::hash_of(&protected_tx);
        assert_eq!(PendingProtectedTxs::<Test>::get(&tx_hash), Some(protected_tx));
        
        // Check that the correct event was deposited
        System::assert_last_event(
            Event::ProtectedTxSubmitted {
                tx_hash,
                submitter: 1,
                execute_at: 1 + delay_blocks,
            }
            .into(),
        );
    });
}

#[test]
fn submit_protected_tx_fails_with_delay_too_short() {
    new_test_ext().execute_with(|| {
        let encrypted_call = vec![1, 2, 3, 4, 5];
        let delay_blocks = 5u64; // Below minimum of 10
        
        assert_noop!(
            MevProtection::submit_protected_tx(
                RuntimeOrigin::signed(1),
                encrypted_call,
                delay_blocks
            ),
            Error::<Test>::DelayTooShort
        );
    });
}

#[test]
fn submit_protected_tx_fails_with_delay_too_long() {
    new_test_ext().execute_with(|| {
        let encrypted_call = vec![1, 2, 3, 4, 5];
        let delay_blocks = 2000u64; // Above maximum of 1000
        
        assert_noop!(
            MevProtection::submit_protected_tx(
                RuntimeOrigin::signed(1),
                encrypted_call,
                delay_blocks
            ),
            Error::<Test>::DelayTooLong
        );
    });
}

#[test]
fn submit_protected_tx_fails_with_call_too_large() {
    new_test_ext().execute_with(|| {
        let encrypted_call = vec![0u8; 2000]; // Above maximum of 1024
        let delay_blocks = 50u64;
        
        assert_noop!(
            MevProtection::submit_protected_tx(
                RuntimeOrigin::signed(1),
                encrypted_call,
                delay_blocks
            ),
            Error::<Test>::CallTooLarge
        );
    });
}

#[test]
fn execute_protected_tx_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        let encrypted_call = vec![1, 2, 3, 4, 5];
        let delay_blocks = 50u64;
        
        // Submit a protected transaction
        assert_ok!(MevProtection::submit_protected_tx(
            RuntimeOrigin::signed(1),
            encrypted_call.clone(),
            delay_blocks
        ));
        
        // Get the tx_hash from the submitted event
        let events = System::events();
        let tx_hash = if let RuntimeEvent::MevProtection(Event::ProtectedTxSubmitted { tx_hash, .. }) = &events.last().unwrap().event {
            *tx_hash
        } else {
            panic!("Expected ProtectedTxSubmitted event");
        };
        
        // Fast forward to execution time
        System::set_block_number(1 + delay_blocks);
        
        // Execute the transaction
        assert_ok!(MevProtection::execute_protected_tx(
            RuntimeOrigin::signed(2), // Different user can execute
            tx_hash
        ));
        
        // Check that the transaction was removed from storage
        assert_eq!(PendingProtectedTxs::<Test>::get(&tx_hash), None);
        
        // Check that the correct event was deposited
        System::assert_last_event(
            Event::ProtectedTxExecuted {
                tx_hash,
                executor: 2,
            }
            .into(),
        );
    });
}

#[test]
fn execute_protected_tx_fails_too_early() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        let encrypted_call = vec![1, 2, 3, 4, 5];
        let delay_blocks = 50u64;
        
        // Submit a protected transaction
        assert_ok!(MevProtection::submit_protected_tx(
            RuntimeOrigin::signed(1),
            encrypted_call.clone(),
            delay_blocks
        ));
        
        // Get the tx_hash from the submitted event
        let events = System::events();
        let tx_hash = if let RuntimeEvent::MevProtection(Event::ProtectedTxSubmitted { tx_hash, .. }) = &events.last().unwrap().event {
            *tx_hash
        } else {
            panic!("Expected ProtectedTxSubmitted event");
        };
        
        // Try to execute before delay period
        System::set_block_number(25); // Before execution time
        
        assert_noop!(
            MevProtection::execute_protected_tx(RuntimeOrigin::signed(2), tx_hash),
            Error::<Test>::TooEarly
        );
    });
}

#[test]
fn execute_protected_tx_fails_not_found() {
    new_test_ext().execute_with(|| {
        let fake_hash = <Test as frame_system::Config>::Hashing::hash(&[1, 2, 3]);
        
        assert_noop!(
            MevProtection::execute_protected_tx(RuntimeOrigin::signed(1), fake_hash),
            Error::<Test>::TxNotFound
        );
    });
}

#[test]
fn cancel_protected_tx_works() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        let encrypted_call = vec![1, 2, 3, 4, 5];
        let delay_blocks = 50u64;
        
        // Submit a protected transaction
        assert_ok!(MevProtection::submit_protected_tx(
            RuntimeOrigin::signed(1),
            encrypted_call.clone(),
            delay_blocks
        ));
        
        // Get the tx_hash from the submitted event
        let events = System::events();
        let tx_hash = if let RuntimeEvent::MevProtection(Event::ProtectedTxSubmitted { tx_hash, .. }) = &events.last().unwrap().event {
            *tx_hash
        } else {
            panic!("Expected ProtectedTxSubmitted event");
        };
        
        // Cancel the transaction
        assert_ok!(MevProtection::cancel_protected_tx(
            RuntimeOrigin::signed(1), // Same user who submitted
            tx_hash
        ));
        
        // Check that the transaction was removed from storage
        assert_eq!(PendingProtectedTxs::<Test>::get(&tx_hash), None);
        
        // Check that the correct event was deposited
        System::assert_last_event(
            Event::ProtectedTxCancelled {
                tx_hash,
                canceller: 1,
            }
            .into(),
        );
    });
}

#[test]
fn cancel_protected_tx_fails_not_authorized() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        let encrypted_call = vec![1, 2, 3, 4, 5];
        let delay_blocks = 50u64;
        
        // Submit a protected transaction
        assert_ok!(MevProtection::submit_protected_tx(
            RuntimeOrigin::signed(1),
            encrypted_call.clone(),
            delay_blocks
        ));
        
        // Get the tx_hash from the submitted event
        let events = System::events();
        let tx_hash = if let RuntimeEvent::MevProtection(Event::ProtectedTxSubmitted { tx_hash, .. }) = &events.last().unwrap().event {
            *tx_hash
        } else {
            panic!("Expected ProtectedTxSubmitted event");
        };
        
        // Try to cancel with different user
        assert_noop!(
            MevProtection::cancel_protected_tx(
                RuntimeOrigin::signed(2), // Different user
                tx_hash
            ),
            Error::<Test>::NotAuthorized
        );
    });
}

#[test]
fn cancel_protected_tx_fails_not_found() {
    new_test_ext().execute_with(|| {
        let fake_hash = <Test as frame_system::Config>::Hashing::hash(&[1, 2, 3]);
        
        assert_noop!(
            MevProtection::cancel_protected_tx(RuntimeOrigin::signed(1), fake_hash),
            Error::<Test>::TxNotFound
        );
    });
}

#[test]
fn helper_functions_work() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        
        let encrypted_call = vec![1, 2, 3, 4, 5];
        let delay_blocks = 50u64;
        
        // Submit a protected transaction
        assert_ok!(MevProtection::submit_protected_tx(
            RuntimeOrigin::signed(1),
            encrypted_call.clone(),
            delay_blocks
        ));
        
        // Get the tx_hash from the submitted event
        let events = System::events();
        let tx_hash = if let RuntimeEvent::MevProtection(Event::ProtectedTxSubmitted { tx_hash, .. }) = &events.last().unwrap().event {
            *tx_hash
        } else {
            panic!("Expected ProtectedTxSubmitted event");
        };
        
        // Test get_protected_tx
        let protected_tx = MevProtection::get_protected_tx(&tx_hash).unwrap();
        assert_eq!(protected_tx.submitter, 1);
        assert_eq!(protected_tx.encrypted_call.to_vec(), encrypted_call);
        assert_eq!(protected_tx.execute_at_block, 1 + delay_blocks);
        assert_eq!(protected_tx.submitted_at_block, 1);
        
        // Test is_ready_for_execution (should be false initially)
        assert_eq!(MevProtection::is_ready_for_execution(&tx_hash), false);
        
        // Fast forward to execution time
        System::set_block_number(1 + delay_blocks);
        
        // Test is_ready_for_execution (should be true now)
        assert_eq!(MevProtection::is_ready_for_execution(&tx_hash), true);
    });
}