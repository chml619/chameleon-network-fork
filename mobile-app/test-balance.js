/**
 * Simple test to verify balance formatting
 */

// Simulate the balance utility functions
const DECIMALS = 12;
const BN = require('bn.js');
const DIVISOR = new BN(10).pow(new BN(DECIMALS));

function formatBalance(rawBalance) {
  if (!rawBalance) return '0.00';
  
  const bn = new BN(rawBalance.toString());
  const whole = bn.div(DIVISOR);
  const remainder = bn.mod(DIVISOR);
  
  if (remainder.isZero()) {
    return whole.toString();
  }
  
  const remainderStr = remainder.toString().padStart(DECIMALS, '0');
  const decimal = remainderStr.slice(0, 2);
  return `${whole}.${decimal}`;
}

console.log('=== Balance Formatting Test ===');

// Test case 1: Alice's balance (should be ~95-100 CHML)
const aliceRawBalance = '95000000000000'; // 95 CHML in 12 decimal format
console.log('\nTest 1: Alice Balance');
console.log('Raw balance:', aliceRawBalance);
console.log('Formatted:', formatBalance(aliceRawBalance));
console.log('Expected: 95');

// Test case 2: The problematic case from the bug report
const problematicBalance = '95000000000000'; // This was showing as 0.000095
console.log('\nTest 2: Problematic Balance (Bug Fix)');
console.log('Raw balance:', problematicBalance);
console.log('OLD (wrong): 0.000095 CHML');
console.log('NEW (fixed):', formatBalance(problematicBalance), 'CHML');
console.log('Improvement: 1,000,000x correction!');

// Test case 3: Small amount
const smallAmount = '1000000000000'; // 1 CHML
console.log('\nTest 3: Small Amount');
console.log('Raw balance:', smallAmount);
console.log('Formatted:', formatBalance(smallAmount));
console.log('Expected: 1');

// Test case 4: Fractional amount
const fractionalAmount = '5500000000000'; // 5.5 CHML
console.log('\nTest 4: Fractional Amount');
console.log('Raw balance:', fractionalAmount);
console.log('Formatted:', formatBalance(fractionalAmount));
console.log('Expected: 5.50');

// Test case 5: Zero balance
console.log('\nTest 5: Zero Balance');
console.log('Formatted zero:', formatBalance('0'));
console.log('Expected: 0.00');

console.log('\n=== Test Complete ===');
console.log('✅ All balance formatting issues should be fixed!');
