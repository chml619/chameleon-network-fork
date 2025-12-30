/**
 * Centralized balance formatting utilities for Chameleon Network
 * Fixes the critical decimal formatting bug (12 decimals, not 18)
 */

import BN from 'bn.js';
import { NETWORK_CONFIG } from '../config/network';

const DECIMALS = NETWORK_CONFIG.tokenDecimals || 12;
const DIVISOR = new BN(10).pow(new BN(DECIMALS));

/**
 * Format raw chain balance for display
 * @param rawBalance - Raw balance from chain (string, BN, or null/undefined)
 * @returns Formatted balance string (e.g., "95.00")
 */
export function formatBalance(rawBalance: string | BN | null | undefined): string {
  if (!rawBalance) return '0.00';
  
  const bn = new BN(rawBalance.toString());
  const whole = bn.div(DIVISOR);
  const remainder = bn.mod(DIVISOR);
  
  if (remainder.isZero()) {
    return whole.toString();
  }
  
  const remainderStr = remainder.toString().padStart(DECIMALS, '0');
  // Keep 2 decimal places for display, trimming trailing zeros
  const decimal = remainderStr.slice(0, 2);
  return `${whole}.${decimal}`;
}

/**
 * Parse user input (e.g., "5.5") to chain units
 * @param userInput - User input string (e.g., "5.5")
 * @returns BN in chain units (e.g., 5500000000000 for 5.5 CHML)
 */
export function parseAmount(userInput: string): BN {
  if (!userInput || userInput === '') return new BN(0);
  
  const parts = userInput.split('.');
  const whole = parts[0] || '0';
  const fraction = (parts[1] || '').padEnd(DECIMALS, '0').slice(0, DECIMALS);
  return new BN(whole + fraction);
}

/**
 * Format for display with CHML suffix
 * @param rawBalance - Raw balance from chain
 * @returns Formatted balance with unit (e.g., "95.00 CHML")
 */
export function formatBalanceWithUnit(rawBalance: string | BN | null | undefined): string {
  return `${formatBalance(rawBalance)} CHML`;
}

/**
 * Check if balance is sufficient for amount + fee
 * @param balance - Current balance (BN)
 * @param amount - Amount to send (BN)
 * @param fee - Transaction fee (BN)
 * @returns true if sufficient, false otherwise
 */
export function hasSufficientBalance(balance: BN, amount: BN, fee: BN): boolean {
  const total = amount.add(fee);
  return balance.gte(total);
}

/**
 * Calculate maximum sendable amount (balance - fee)
 * @param balance - Current balance (BN)
 * @param fee - Transaction fee (BN)
 * @returns Maximum sendable amount (BN)
 */
export function getMaxSendableAmount(balance: BN, fee: BN): BN {
  const max = balance.sub(fee);
  return max.gt(new BN(0)) ? max : new BN(0);
}

/**
 * Debug function to log balance conversion
 * @param rawBalance - Raw balance from chain
 * @param label - Label for logging
 */
export function debugBalance(rawBalance: string | BN | null | undefined, label: string = 'Balance'): void {
  console.log(`[Balance Debug] ${label}:`);
  console.log(`  Raw: ${rawBalance?.toString() || 'null'}`);
  console.log(`  Formatted: ${formatBalance(rawBalance)}`);
  console.log(`  With Unit: ${formatBalanceWithUnit(rawBalance)}`);
  console.log(`  Decimals: ${DECIMALS}`);
}
