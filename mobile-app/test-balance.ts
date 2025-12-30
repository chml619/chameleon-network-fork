/**
 * Test script to verify balance formatting fixes
 */

import BN from 'bn.js';
import { formatBalance, parseAmount, formatBalanceWithUnit } from './utils/balance';

console.log('=== Balance Formatting Test ===');

// Test case 1: Alice's balance (should be ~95-100 CHML)
const aliceRawBalance = '95000000000000'; // 95 CHML in 12 decimal format
console.log('\nTest 1: Alice Balance');
console.log('Raw balance:', aliceRawBalance);
console.log('Formatted:', formatBalance(aliceRawBalance));
console.log('With unit:', formatBalanceWithUnit(aliceRawBalance));
console.log('Expected: 95.00 CHML');

// Test case 2: Small amount
const smallAmount = '1000000000000'; // 1 CHML
console.log('\nTest 2: Small Amount');
console.log('Raw balance:', smallAmount);
console.log('Formatted:', formatBalance(smallAmount));
console.log('Expected: 1.00 CHML');

// Test case 3: Fractional amount
const fractionalAmount = '5500000000000'; // 5.5 CHML
console.log('\nTest 3: Fractional Amount');
console.log('Raw balance:', fractionalAmount);
console.log('Formatted:', formatBalance(fractionalAmount));
console.log('Expected: 5.50 CHML');

// Test case 4: Parse amount (user input to chain units)
console.log('\nTest 4: Parse Amount');
const userInput = '5.5';
const parsed = parseAmount(userInput);
console.log('User input:', userInput);
console.log('Parsed to chain units:', parsed.toString());
console.log('Expected: 5500000000000');

// Test case 5: Round trip (parse then format)
console.log('\nTest 5: Round Trip');
const roundTrip = formatBalance(parseAmount('95.00'));
console.log('Input: 95.00');
console.log('Parse -> Format:', roundTrip);
console.log('Expected: 95.00');

// Test case 6: Zero balance
console.log('\nTest 6: Zero Balance');
console.log('Formatted zero:', formatBalance('0'));
console.log('Expected: 0.00');

// Test case 7: Null/undefined
console.log('\nTest 7: Null/Undefined');
console.log('Formatted null:', formatBalance(null));
console.log('Formatted undefined:', formatBalance(undefined));
console.log('Expected: 0.00 for both');

console.log('\n=== Test Complete ===');
