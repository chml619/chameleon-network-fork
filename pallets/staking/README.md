# Chameleon Staking Pallet

A flexible staking pallet for CHML tokens with proportional reward distribution.

## Overview

This pallet provides a simple and flexible staking mechanism designed for testnet environments. It allows users to stake CHML tokens without lock periods and earn proportional rewards based on their stake amount.

## Features

- **Flexible Staking**: Stake and unstake CHML tokens without waiting periods
- **Proportional Rewards**: Rewards distributed based on stake proportion
- **Admin Controls**: Configurable reward rates and pool management
- **Production Ready**: Proper weight calculations and error handling
- **Automatic Rewards**: Rewards calculated and distributed on each block

## Extrinsics

### User Functions

- `stake(amount)` - Stake CHML tokens to earn rewards
- `unstake(amount)` - Unstake CHML tokens (no waiting period)
- `claim_rewards()` - Claim accumulated staking rewards

### Admin Functions (Root/Sudo only)

- `set_reward_rate(rate)` - Set the reward rate per block
- `fund_reward_pool(amount)` - Add funds to the reward pool

## Storage

- `Stakers`: Map of account → StakeInfo (amount, rewards, last_claim_block)
- `TotalStaked`: Total CHML currently staked across all users
- `RewardRate`: Rewards per block distributed to all stakers
- `RewardPool`: Total CHML allocated for staking rewards

## Events

- `Staked`: Tokens were successfully staked
- `Unstaked`: Tokens were successfully unstaked
- `RewardsClaimed`: Rewards were successfully claimed
- `RewardRateUpdated`: Reward rate was updated by admin
- `RewardPoolFunded`: Reward pool was funded

## Errors

- `InsufficientBalance`: Not enough balance to stake
- `InsufficientStake`: Not enough stake to unstake
- `NoRewardsToClaim`: No rewards available to claim
- `StakeAmountTooLow`: Stake amount below minimum
- `RewardPoolDepleted`: Reward pool has insufficient funds
- `InvalidRewardRate`: Reward rate must be greater than zero

## Configuration

```rust
impl pallet_staking::Config for Runtime {
    type RuntimeEvent = RuntimeEvent;
    type Currency = Balances;
    type WeightInfo = pallet_staking::weights::SubstrateWeight<Runtime>;
    type MinimumStake = MinimumStake; // 10 CHML
    type RewardsPalletId = RewardsPalletId;
}
```

## Usage Example

```rust
// Stake 50 CHML tokens
let stake_amount = 50_000_000_000_000_000_000; // 50 CHML (18 decimals)
Staking::stake(RuntimeOrigin::signed(account), stake_amount)?;

// Set reward rate (admin only)
let reward_rate = 1_000_000_000_000_000_000; // 1 CHML per block
Staking::set_reward_rate(RuntimeOrigin::root(), reward_rate)?;

// Fund reward pool (anyone can fund)
let fund_amount = 1000_000_000_000_000_000_000; // 1000 CHML
Staking::fund_reward_pool(RuntimeOrigin::signed(funder), fund_amount)?;

// Claim accumulated rewards
Staking::claim_rewards(RuntimeOrigin::signed(account))?;

// Unstake 20 CHML tokens
let unstake_amount = 20_000_000_000_000_000_000; // 20 CHML
Staking::unstake(RuntimeOrigin::signed(account), unstake_amount)?;
```

## Reward Calculation

Rewards are calculated proportionally based on stake amount:

```
user_reward = (total_block_reward * user_stake) / total_network_stake
```

Rewards are automatically calculated and accumulated on each block finalization.

## Testing

Run the test suite:

```bash
cargo test -p pallet-staking
```

## Integration

To integrate this pallet into your runtime:

1. Add to `Cargo.toml`:
```toml
pallet-staking = { path = "../pallets/staking", default-features = false }
```

2. Add to runtime configuration
3. Include in `construct_runtime!` macro
4. Configure genesis if needed

## License

MIT-0