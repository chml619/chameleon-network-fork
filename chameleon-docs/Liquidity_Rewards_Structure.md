# Chameleon Network - Liquidity Rewards Structure

**Version:** 1.0  
**Date:** January 19, 2026  
**Status:** Approved for Implementation  

---

## Overview

Chameleon Network incentivizes liquidity through two mechanisms:

1. **Two-Sided LP (AMM Pools):** Provide paired tokens to trading pools
2. **Single-Sided Provisioning:** Deposit single tokens with optional lock periods

This document defines the reward structure, lock mechanics, and distribution rules.

---

## Emission Allocation

Per the tokenomics (100M CHML total, 65M reward pool over 20 years):

| Recipient | Share | Year 1 CHML | Year 5 CHML | Year 10 CHML |
|-----------|-------|-------------|-------------|--------------|
| **Validators** | 70% | 5,180,000 | 3,388,000 | 2,002,000 |
| **LP Pool (Total)** | 30% | 2,220,000 | 1,452,000 | 858,000 |

The 30% LP Pool is subdivided as follows.

---

## LP Pool Subdivision

| Category | Share of LP Pool | Effective % of Total Emissions | Year 1 CHML |
|----------|------------------|-------------------------------|-------------|
| **Two-Sided LP** | 40% | 12.0% | 888,000 |
| **Single-Sided (24mo lock)** | 25% | 7.5% | 555,000 |
| **Single-Sided (12mo lock)** | 15% | 4.5% | 333,000 |
| **Single-Sided (6mo lock)** | 12% | 3.6% | 266,400 |
| **Single-Sided (no lock)** | 8% | 2.4% | 177,600 |
| **Total** | **100%** | **30%** | **2,220,000** |

---

## Two-Sided LP (AMM Pools)

### Description
Users provide equal value of two tokens to AMM pools (e.g., pCHML + pBTC). They receive LP tokens representing their pool share.

### Reward Sources

| Source | Share | Description |
|--------|-------|-------------|
| Swap Fees | 90% of 0.25% per trade | Real yield from trading activity |
| Emissions | 40% of LP pool (12% total) | Distributed proportionally to LP token holders |

### Supported Pools (Launch)

| Pool ID | Pair | Notes |
|---------|------|-------|
| 0 | pCHML/pBTC | Primary BTC liquidity |
| 1 | pCHML/pETH | Primary ETH liquidity |
| 2 | pCHML/pUSDT | Stablecoin liquidity |

### Key Characteristics
- No lock period required
- Subject to impermanent loss (IL)
- Enables trading on pDEX
- LP tokens are liquid and transferable

---

## Single-Sided Provisioning

### Description
Users deposit a single token type without needing a paired token. Rewards come from emissions only (no swap fees). Optional lock periods provide higher reward tiers.

### Lock Tiers

| Tier | Lock Period | Share of LP Pool | Multiplier vs No-Lock |
|------|-------------|------------------|----------------------|
| **Tier 4 (Max)** | 24 months | 25% | 3.125x |
| **Tier 3** | 12 months | 15% | 1.875x |
| **Tier 2** | 6 months | 12% | 1.5x |
| **Tier 1 (Flexible)** | No lock | 8% | 1.0x (baseline) |

### Supported Tokens (Launch)

| Token | Token ID | Status | Boost Multiplier |
|-------|----------|--------|------------------|
| pCHML | 0 | ✅ Active | 1.0x |
| pBTC | 1 | ✅ Active | 1.0x |
| pETH | 2 | ✅ Active | 1.0x |
| pUSDT | 3 | ✅ Active | 1.0x |

### Future Tokens (Governance Adjustable)

| Token | Status | Suggested Boost | Rationale |
|-------|--------|-----------------|-----------|
| pSOL | ⏳ Planned | 1.2-1.5x | Onboarding incentive |
| pBNB | ⏳ Planned | 1.2-1.5x | Onboarding incentive |

New token boost multipliers are temporary (e.g., 3-6 months) to bootstrap liquidity, then normalize to 1.0x.

---

## Early Unlock Rules

Single-sided provisions with lock periods can be unlocked early with partial reward forfeiture.

### Forfeiture Schedule

| Unlock Point | Rewards Kept | Rewards Forfeited |
|--------------|--------------|-------------------|
| 0-25% of term | 25% | 75% |
| 25-50% of term | 50% | 50% |
| 50-75% of term | 75% | 25% |
| 75-100% of term | 100% | 0% |

### Examples

**24-Month Lock, Unlock at Month 6 (25%):**
- Accrued rewards: 1,000 pCHML
- Kept: 250 pCHML (25%)
- Forfeited: 750 pCHML (returned to pool)

**12-Month Lock, Unlock at Month 9 (75%):**
- Accrued rewards: 500 pCHML
- Kept: 375 pCHML (75%)
- Forfeited: 125 pCHML (returned to pool)

### Forfeited Rewards
Forfeited rewards are returned to the respective lock tier pool and redistributed to remaining participants in that tier.

---

## Reward Distribution Mechanics

### Block-by-Block Distribution

Each block (~6 seconds):
1. Total block emission calculated from 20-year schedule
2. 70% → Validator rewards pool
3. 30% → LP rewards pool, subdivided:
   - 40% → Two-sided LP (proportional to LP tokens)
   - 60% → Single-sided pools (by tier and stake)

### Per-User Calculation

**Two-Sided LP:**
```
user_reward = (user_lp_tokens / total_pool_lp_tokens) * pool_emission_share
```

**Single-Sided:**
```
tier_pool = tier_percentage * total_lp_emission
user_share = (user_stake * token_boost) / total_tier_stake
user_reward = user_share * tier_pool
```

### Claim Mechanism
- Rewards accrue per block
- Users claim manually via mobile app or direct extrinsic
- Unclaimed rewards remain in user's pending balance (no expiry)

---

## Comparison: Two-Sided vs Single-Sided

| Aspect | Two-Sided LP | Single-Sided |
|--------|--------------|--------------|
| **Tokens Required** | 2 (paired) | 1 |
| **Emission Share** | 40% of LP pool | 60% of LP pool (combined) |
| **Swap Fees** | ✅ 90% of 0.25% | ❌ None |
| **Impermanent Loss** | ✅ Yes (risk) | ❌ No |
| **Lock Options** | None | 0/6/12/24 months |
| **Complexity** | Higher | Lower |
| **Best For** | Active traders, yield farmers | Long-term holders, new users |

---

## Governance Parameters

The following can be adjusted via governance:

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| Two-sided LP share | 40% | 30-50% | Of LP pool |
| Lock tier percentages | 25/15/12/8% | Flexible | Must sum to 60% |
| New token boost | 1.0-1.5x | 1.0-2.0x | Temporary only |
| Boost duration | 3-6 months | 1-12 months | Per new token |
| Swap fee LP share | 90% | 80-95% | Rest to Treasury |

---

## Implementation Status

| Component | Blockchain | Mobile App | Status |
|-----------|------------|------------|--------|
| Two-sided LP | ✅ pDEX pallet | ✅ Add/Remove Liquidity | Complete |
| LP emissions | ✅ Emissions pallet | ✅ Power tab | Complete |
| Single-sided deposit | ❌ Not implemented | ❌ Not implemented | **Week 14** |
| Lock periods | ❌ Not implemented | ❌ Not implemented | **Week 14** |
| Early unlock | ❌ Not implemented | ❌ Not implemented | **Week 14** |
| Token boost | ❌ Not implemented | ❌ Not implemented | Future |

---

## Year-by-Year Projections

### Total LP Pool Emissions (30% of total)

| Year | Total LP Pool | Two-Sided (40%) | Single-Sided (60%) |
|------|---------------|-----------------|-------------------|
| 1 | 2,220,000 | 888,000 | 1,332,000 |
| 2 | 1,998,000 | 799,200 | 1,198,800 |
| 3 | 1,800,000 | 720,000 | 1,080,000 |
| 5 | 1,452,000 | 580,800 | 871,200 |
| 10 | 858,000 | 343,200 | 514,800 |
| 20 | 300,000 | 120,000 | 180,000 |

### Single-Sided Breakdown (Year 1)

| Tier | Share | Year 1 CHML | Monthly Rate |
|------|-------|-------------|--------------|
| 24mo lock | 25% | 555,000 | 46,250 |
| 12mo lock | 15% | 333,000 | 27,750 |
| 6mo lock | 12% | 266,400 | 22,200 |
| No lock | 8% | 177,600 | 14,800 |

---

## Security Considerations

1. **Lock Enforcement:** Lock periods enforced on-chain, not bypassable
2. **Reward Calculation:** Verified per-block, no retroactive changes
3. **Forfeiture Handling:** Forfeited rewards immediately redistributed
4. **Boost Limits:** Maximum 2.0x boost to prevent manipulation
5. **Governance Timelocks:** Parameter changes have 7-day delay

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 19, 2026 | Initial version |

---

**Related Documents:**
- chameleon_tokenomics_v2_1_final.md
- Chameleon_Fee_Structure_v2.md
- ORCHESTRATOR_STATUS.md

**Approved by:** Project Team  
**Next Review:** Pre-Testnet Launch

