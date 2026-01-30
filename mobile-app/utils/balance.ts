/**
 * Centralized balance formatting utilities for Chameleon Network
 * Chain uses 12 decimals (UNIT = 10^12)
 */

import BN from 'bn.js';
import { NETWORK_CONFIG } from '../config/network';

const DECIMALS = NETWORK_CONFIG.tokenDecimals || 12;
const UNIT = new BN(10).pow(new BN(DECIMALS)); // 10^12

/**
 * Format raw chain balance for display
 * @param rawBalance - Raw balance from chain (string, BN, or null/undefined)
 * @returns Formatted balance string with thousand separators (e.g., "1,234.56")
 */
export function formatBalance(rawBalance: string | BN | null | undefined): string {
  if (!rawBalance) return '0';
  
  try {
    const bn = BN.isBN(rawBalance) ? rawBalance : new BN(rawBalance.toString());
    
    if (bn.isZero()) return '0';
    
    const whole = bn.div(UNIT);
    const remainder = bn.mod(UNIT);
    
    // Format whole part with thousand separators
    let wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    if (remainder.isZero()) {
      return wholeStr;
    }
    
    // Format fractional part - pad to DECIMALS, then trim trailing zeros
    const remainderStr = remainder.toString().padStart(DECIMALS, '0');
    // Keep up to 6 decimal places, trim trailing zeros
    let fracStr = remainderStr.slice(0, 6).replace(/0+$/, '');
    
    if (fracStr.length === 0) {
      return wholeStr;
    }
    
    return `${wholeStr}.${fracStr}`;
  } catch (error) {
    console.error('[formatBalance] Error:', error);
    return '0';
  }
}

/**
 * Parse user input (e.g., "5.5") to chain units (BN in planck)
 * @param userInput - User input string (e.g., "5.5" or "1,234.56")
 * @returns BN in chain units (e.g., 5500000000000 for 5.5 CHML with 12 decimals)
 */
export function parseAmount(userInput: string): BN {
  if (!userInput || userInput.trim() === '') return new BN(0);
  
  try {
    // Remove thousand separators and whitespace
    const cleaned = userInput.replace(/,/g, '').trim();
    
    const parts = cleaned.split('.');
    const wholePart = parts[0] || '0';
    let fractionalPart = parts[1] || '';
    
    // Pad or truncate fractional part to DECIMALS
    if (fractionalPart.length > DECIMALS) {
      fractionalPart = fractionalPart.substring(0, DECIMALS);
    } else {
      fractionalPart = fractionalPart.padEnd(DECIMALS, '0');
    }
    
    // Combine whole and fractional parts
    const combined = wholePart + fractionalPart;
    
    // Remove leading zeros (but keep at least one digit)
    const trimmed = combined.replace(/^0+/, '') || '0';
    
    return new BN(trimmed);
  } catch (error) {
    console.error('[parseAmount] Error parsing:', userInput, error);
    return new BN(0);
  }
}

/**
 * Format for display with CHML suffix
 * @param rawBalance - Raw balance from chain
 * @returns Formatted balance with unit (e.g., "1,234.56 CHML")
 */
export function formatBalanceWithUnit(rawBalance: string | BN | null | undefined): string {
  return `${formatBalance(rawBalance)} pCHML`;
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
 * Compare two BN values for UI display
 * Returns true if a >= b
 */
export function isBalanceSufficient(balance: BN | null, required: BN): boolean {
  if (!balance) return false;
  return balance.gte(required);
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

/**
 * Format a balance for display with proper decimal places and thousand separators
 * @param rawValue - Raw blockchain value (string, number, or BN)
 * @param decimals - Number of decimal places to show (default: 2)
 * @param tokenDecimals - Token decimals for conversion (default: 12 for CHML)
 * @returns Formatted string like "499,999.99"
 */
export function formatDisplayBalance(
  rawValue: string | number | BN, 
  decimals: number = 2,
  tokenDecimals: number = 12
): string {
  try {
    let value: number;
    
    if (typeof rawValue === 'string') {
      // If it's already a formatted string (like "499999.992035"), parse it
      if (rawValue.includes('.') && !rawValue.includes('e')) {
        value = parseFloat(rawValue);
      } else {
        // Raw blockchain value - divide by 10^tokenDecimals
        const bn = new BN(rawValue);
        const divisor = new BN(10).pow(new BN(tokenDecimals));
        value = parseFloat(bn.toString()) / parseFloat(divisor.toString());
      }
    } else if (typeof rawValue === 'number') {
      value = rawValue;
    } else {
      // BN instance
      const divisor = new BN(10).pow(new BN(tokenDecimals));
      value = parseFloat(rawValue.toString()) / parseFloat(divisor.toString());
    }
    
    // Round to specified decimal places
    const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
    
    // Format with thousand separators
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch (error) {
    console.error('Error formatting balance:', error);
    return '0.00';
  }
}

/**
 * Format a balance for display without thousand separators (for inputs)
 * @param rawValue - Raw value
 * @param decimals - Number of decimal places
 * @returns Formatted string like "499999.99"
 */
export function formatInputBalance(
  rawValue: string | number | BN, 
  decimals: number = 6
): string {
  try {
    const formatted = formatDisplayBalance(rawValue, decimals);
    // Remove thousand separators for input fields
    return formatted.replace(/,/g, '');
  } catch (error) {
    console.error('Error formatting input balance:', error);
    return '0';
  }
}
