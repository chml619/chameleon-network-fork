# Chameleon Network – Fee Structure v2.0

**Version:** 2.0  
**Last Updated:** January 17, 2026  
**Status:** Approved for Devnet/Testnet  

---

## Overview

Chameleon Network operates on a **fixed-supply tokenomics model** (100M CHML total, with 65M reserved as a reward pool). The fee structure is designed to:

1. Fund Treasury operations for long-term sustainability
2. Incentivize liquidity providers with real yield
3. Prevent spam while keeping transactions affordable
4. Maintain simplicity during early network phases

---

## Fee Summary

| Fee Type | Rate | Distribution |
|----------|------|--------------|
| **Shielding** | 0.02% OR 0.1 CHML (whichever is higher) | 100% Treasury |
| **Unshielding** | 0.05% OR 0.25 CHML (whichever is higher) | 100% Treasury |
| **pDEX Swaps** | 0.25% | 90% LPs, 10% Treasury |
| **Gas Fees** | ~0.1 CHML per transaction | 100% Treasury |

---

## A) Shielding & Unshielding Fees

**Hybrid Fee Model:**

| Operation | Percentage Fee | Minimum Fee | Applied |
|-----------|---------------|-------------|---------|
| **Shield** (Public → Private) | 0.02% | 0.1 CHML | Whichever is higher |
| **Unshield** (Private → Public) | 0.05% | 0.25 CHML | Whichever is higher |

**Distribution:** 100% → Treasury

**Rationale:**
- Hybrid model ensures small transactions aren't free while large transactions scale fairly
- Higher unshield fee (2.5x shield) discourages rapid in/out churn
- 100% to Treasury during early phases when no custodian infrastructure exists
- Future consideration: When BTC/non-EVM bridges launch with real custodians, revisit split (e.g., 70% Custodians / 30% Treasury)

---

## B) pDEX Trading Fees

**Fee per Swap:** 0.25%

**Distribution:**
| Recipient | Share | Rationale |
|-----------|-------|-----------|
| Liquidity Providers | 90% | Real yield incentive beyond emissions |
| Treasury | 10% | Sustainable protocol revenue |

**Rationale:**
- Competitive with industry standards (Uniswap 0.3%, PancakeSwap 0.25%)
- LPs earn real yield from trading activity, not just inflationary rewards
- Treasury builds recurring revenue stream
- Privacy is the premium feature justifying competitive fees

---

## C) Network Gas Fees

**Fee:** ~0.1 CHML per transaction (governance adjustable)

**Applied To:** All on-chain actions (send, swap, stake, provide liquidity, shield/unshield)

**Distribution:** 100% → Treasury

**Rationale:**
- Validators already receive 70% of block rewards from 65M emission pool
- Avoiding double-compensation for validators in early years
- Treasury needs funding for audits, development, ecosystem growth
- Governance can later vote to redirect portion to validators if needed
- Simplifies economics: users see "gas = Treasury revenue"

---

## D) Treasury Revenue Streams

| Source | Treasury Share |
|--------|---------------|
| Shield/Unshield fees | 100% |
| pDEX swap fees | 10% |
| Gas fees | 100% |

**Treasury Use Cases:**
- Security audits
- Development funding
- Ecosystem grants
- Marketing and community growth
- Emergency reserves
- Future bridge infrastructure

---

## E) Validator & LP Incentives

**Validators receive:**
- 70% of block rewards from emission pool (~0.985 pCHML per block)
- No gas fee share (Treasury needs early-stage funding)

**Liquidity Providers receive:**
- 30% of block rewards from emission pool
- 90% of pDEX swap fees (real yield)

---

## F) Long-Term Sustainability Path

### Phase 1: Early Stage (Mainnet Launch)
- Rewards from 65M CHML pool are primary driver
- Fees supplement Treasury but volume is low
- 100% of gas/bridge fees to Treasury builds reserves

### Phase 2: Growth Stage (Increased Usage)
- Shield/unshield + pDEX volume grows → Treasury revenue grows
- CHML reward emissions can be tapered (slower burn of 65M pool)
- Consider introducing custodian splits when BTC bridge launches

### Phase 3: Maturity Stage (5-10 years)
- Network runs primarily on fees, reward pool nearly exhausted
- Validators + LPs incentivized by real activity
- Treasury financially independent of token emissions
- Governance may vote to share gas fees with validators

---

## G) Governance Adjustability

The following parameters can be adjusted via governance:

| Parameter | Current Value | Adjustable |
|-----------|---------------|------------|
| Gas fee amount | ~0.1 CHML | ✅ Yes |
| Swap fee percentage | 0.25% | ✅ Yes |
| Treasury share of swaps | 10% | ✅ Yes |
| Shield/Unshield percentages | 0.02% / 0.05% | ✅ Yes |
| Shield/Unshield minimums | 0.1 / 0.25 CHML | ✅ Yes |

---

## H) Comparison with Document v1.0

| Fee Type | v1.0 | v2.0 | Change Rationale |
|----------|------|------|------------------|
| Gas fees | 80% Validators, 20% Treasury | 100% Treasury | Validators already get block rewards; Treasury needs early funding |
| Bridge fees | 70% Custodians, 30% Treasury | 100% Treasury | No custodian infrastructure exists; revisit for mainnet BTC bridge |
| Swap fees | 90% LPs, 10% Treasury | No change | LPs need real yield incentive |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | December 2025 | Initial fee structure |
| 2.0 | January 17, 2026 | Gas fees 100% Treasury, Bridge fees 100% Treasury |

---

**Approved by:** Project Team  
**Next Review:** Pre-Mainnet Launch

