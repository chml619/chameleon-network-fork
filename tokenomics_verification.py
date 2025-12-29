#!/usr/bin/env python3
"""
Chameleon Network Tokenomics Verification Script
Verifies that the emission schedule matches the specification.
"""

def calculate_emission_rate(year):
    """Calculate per-block emission rate for a given year (0-indexed)"""
    YEAR_1_PER_BLOCK = 1_407_000_000_000_000_000  # 1.407 CHML with 18 decimals
    
    if year >= 20:
        return 0
    
    # Calculate: Year_1_rate * (0.9)^year
    emission_per_block = YEAR_1_PER_BLOCK
    for _ in range(year):
        emission_per_block = (emission_per_block * 9) // 10
    
    return emission_per_block

def verify_tokenomics():
    """Verify the complete tokenomics schedule"""
    BLOCKS_PER_YEAR = 5_259_600
    TOTAL_EXPECTED = 65_000_000_000_000_000_000_000_000  # 65M CHML with 18 decimals
    
    print("Chameleon Network Tokenomics Verification")
    print("=" * 50)
    print(f"Blocks per year: {BLOCKS_PER_YEAR:,}")
    print(f"Expected total emissions: {TOTAL_EXPECTED / 10**18:,.0f} CHML")
    print()
    
    total_emissions = 0
    
    print("Year-by-Year Breakdown:")
    print("Year | Per Block (CHML) | Yearly Total (CHML) | Validator (70%) | LP (30%)")
    print("-" * 80)
    
    for year in range(20):
        per_block_wei = calculate_emission_rate(year)
        per_block_chml = per_block_wei / 10**18
        yearly_total_wei = per_block_wei * BLOCKS_PER_YEAR
        yearly_total_chml = yearly_total_wei / 10**18
        
        validator_share = yearly_total_chml * 0.7
        lp_share = yearly_total_chml * 0.3
        
        total_emissions += yearly_total_wei
        
        print(f"{year+1:4d} | {per_block_chml:13.3f} | {yearly_total_chml:15,.0f} | {validator_share:11,.0f} | {lp_share:9,.0f}")
    
    print("-" * 80)
    print(f"Total emissions: {total_emissions / 10**18:,.0f} CHML")
    print(f"Expected: {TOTAL_EXPECTED / 10**18:,.0f} CHML")
    print(f"Difference: {(total_emissions - TOTAL_EXPECTED) / 10**18:,.0f} CHML")
    print(f"Accuracy: {(total_emissions / TOTAL_EXPECTED) * 100:.2f}%")
    
    # Verify specific years match the tokenomics document
    test_cases = [
        (1, 7_400_000),   # Year 1: 7.4M CHML
        (2, 6_660_000),   # Year 2: 6.66M CHML  
        (5, 4_840_000),   # Year 5: 4.84M CHML
        (10, 2_860_000),  # Year 10: 2.86M CHML
        (20, 1_000_000),  # Year 20: 1M CHML
    ]
    
    print("\nVerification against tokenomics document:")
    print("Year | Expected (CHML) | Calculated (CHML) | Match")
    print("-" * 50)
    
    for year, expected in test_cases:
        per_block_wei = calculate_emission_rate(year - 1)  # Convert to 0-indexed
        yearly_total_chml = (per_block_wei * BLOCKS_PER_YEAR) / 10**18
        match = abs(yearly_total_chml - expected) < (expected * 0.01)  # 1% tolerance
        
        print(f"{year:4d} | {expected:13,.0f} | {yearly_total_chml:14,.0f} | {'✓' if match else '✗'}")
    
    # Test validator/LP split
    print("\nValidator/LP Split Verification:")
    year_1_emission = calculate_emission_rate(0)
    validator_share = (year_1_emission * 70) // 100
    lp_share = year_1_emission - validator_share
    
    print(f"Year 1 per-block emission: {year_1_emission / 10**18:.3f} CHML")
    print(f"Validator share (70%): {validator_share / 10**18:.3f} CHML")
    print(f"LP share (30%): {lp_share / 10**18:.3f} CHML")
    print(f"Split verification: {(validator_share + lp_share) == year_1_emission}")

if __name__ == "__main__":
    verify_tokenomics()
