# Bridge Pallet

A Substrate pallet for cross-chain asset bridging on the Chameleon Network.

## Overview

The Bridge pallet enables users to transfer assets between external blockchains (Bitcoin, Ethereum, Polygon) and the Chameleon Network. It implements a validator-based confirmation system for secure cross-chain operations.

## Features

- **Cross-Chain Deposits**: Users can initiate deposits from external chains
- **Validator Confirmations**: Bridge validators confirm external chain transactions
- **Automated Token Minting**: Tokens are minted when confirmation threshold is reached
- **Withdrawal Processing**: Users can withdraw to external chains with validator processing
- **Multi-Signature Security**: Configurable confirmation threshold for validator consensus

## Supported Chains

- Bitcoin
- Ethereum  
- Polygon

## Supported Assets

- BTC (Bitcoin)
- ETH (Ethereum)
- USDT (Tether)
- USDC (USD Coin)

## Usage

### Deposits

1. User sends assets to bridge contract on external chain
2. User calls `initiate_deposit` with transaction details
3. Bridge validators monitor external chain and call `confirm_deposit`
4. When threshold reached, equivalent tokens are minted on Chameleon

### Withdrawals

1. User calls `initiate_withdrawal` with external address
2. User's tokens are immediately burned/locked
3. Validators process withdrawal on external chain
4. Validators call `confirm_withdrawal` when complete

### Validator Management

- Root can add/remove bridge validators with `add_validator`/`remove_validator`
- Root can set confirmation threshold with `set_confirmation_threshold`

## Configuration

```rust
impl pallet_bridge::Config for Runtime {
    type RuntimeEvent = RuntimeEvent;
    type WeightInfo = pallet_bridge::weights::SubstrateWeight<Runtime>;
    type Currency = Balances;
    type MinimumDeposit = ConstU128<{ 1_000_000_000_000_000_000 }>; // 1 CHML
    type MaximumWithdrawal = ConstU128<{ 1000_000_000_000_000_000_000 }>; // 1000 CHML
    type MaxValidators = ConstU32<10>; // Maximum 10 bridge validators
}
```

## Genesis Configuration

```rust
bridge: BridgeConfig {
    validators: vec![root_account], // Initial bridge validators
    confirmation_threshold: 2,      // Required confirmations
},
```

## Events

- `DepositInitiated`: A deposit was initiated
- `DepositConfirmed`: A deposit was confirmed by a validator
- `DepositCompleted`: A deposit was completed and tokens minted
- `WithdrawalInitiated`: A withdrawal was initiated
- `WithdrawalConfirmed`: A withdrawal was confirmed by a validator
- `WithdrawalCompleted`: A withdrawal was completed
- `ValidatorAdded`: A validator was added
- `ValidatorRemoved`: A validator was removed
- `ConfirmationThresholdUpdated`: Confirmation threshold was updated

## Errors

- `InvalidChain`: Invalid chain specified
- `UnsupportedAsset`: Unsupported asset for bridging
- `InsufficientConfirmations`: Insufficient confirmations for operation
- `DepositNotFound`: Deposit not found
- `WithdrawalNotFound`: Withdrawal not found
- `NotValidator`: Caller is not an authorized validator
- `AlreadyConfirmed`: Validator has already confirmed this operation
- `InvalidAmount`: Invalid amount specified
- `InsufficientBalance`: Insufficient balance for operation
- `ValidatorAlreadyExists`: Validator already exists
- `ValidatorNotFound`: Validator not found
- `ThresholdTooHigh`: Threshold is too high for current validator count
- `MaxValidatorsReached`: Maximum number of validators reached

## Security Considerations

- Bridge validators must be trusted entities
- Confirmation threshold should be set appropriately for security vs. efficiency
- External chain monitoring is critical for deposit confirmations
- Withdrawal processing requires careful validation on external chains

## Testing

Run tests with:

```bash
cargo test -p pallet-bridge
```

Run benchmarks with:

```bash
cargo test -p pallet-bridge --features runtime-benchmarks
```