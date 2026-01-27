# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chameleon Network is a privacy-focused blockchain built on Substrate (standalone solochain, NOT a parachain). The codebase has two main components:

1. **Substrate Node** (Rust) - The blockchain runtime and node implementation
2. **Mobile App** (React Native/Expo) - Wallet application

## Build Commands

### Substrate Node (Rust)
```bash
# Build release binary
cargo build --release

# Run development node (non-persistent state)
./target/release/chameleon-node-devnet --dev

# Run with persistent state
./target/release/chameleon-node-devnet --dev --base-path ./my-chain-state/

# Run pallet tests
cargo test --package pallet-emissions
cargo test --package pallet-staking

# Run all tests
cargo test

# Generate docs
cargo +nightly doc --open
```

### Mobile App (TypeScript)
```bash
cd mobile-app
yarn install
yarn start          # Start Expo dev server
yarn lint           # Run ESLint
yarn test           # Run Jest tests

# EAS Builds
yarn build:android:preview
yarn build:ios:preview
```

## Architecture

### Runtime Structure
The runtime (`/runtime/src/lib.rs`) integrates system pallets with 9 custom Chameleon pallets:

| Pallet | Purpose |
|--------|---------|
| `mev-protection` | MEV protection via encrypted mempool |
| `emissions` | 20-year declining token emission schedule |
| `staking` | Validator staking with commission |
| `pdex` | Privacy DEX with AMM |
| `bridge` | Ethereum/Bitcoin cross-chain bridge |
| `ring-signatures` | Privacy ring signatures |
| `stealth-addresses` | Stealth address generation |
| `confidential-transfer` | Private transfer mechanism |

### Consensus
- **Block Authoring**: Aura (6-second blocks)
- **Finality**: GRANDPA
- **Validators**: Dynamic rotation via Session pallet

### Token Economics
- **Token**: CHML (Chameleon)
- **Total Supply**: 100M CHML
- **Decimals**: 18
- **Minimum Stake**: 1,750 CHML
- **Validator Rewards**: 70% of emissions
- **LP Rewards**: 30% of emissions

### Key Configuration Files
- `/runtime/src/configs/mod.rs` - Pallet configurations
- `/node/src/chain_spec.rs` - Genesis configuration
- `/node/src/service.rs` - Node service setup
- `/chameleon-docs/CHAMELEON_CONSTANTS.md` - Token specs, fees, emission schedule

### Mobile App Structure
```
mobile-app/
├── app/           # Expo Router screens (tabs, send, receive, trade, etc.)
├── components/    # Reusable UI components
├── services/      # Blockchain interaction (mev.ts, bridge.ts, pdex.ts, etc.)
├── context/       # React context (WalletContext)
└── hooks/         # Custom hooks
```

Uses `@polkadot/api` for blockchain RPC communication.

## Critical Development Rules

### NEVER modify Cargo.toml dependencies without explicit approval
The workspace dependencies are carefully curated. Changing versions can break the build due to Polkadot SDK version conflicts. The `sc-network-types` issue is a known example.

### NEVER delete Cargo.lock
`Cargo.lock` pins all dependencies to known working versions. It ensures `sc-network-types = 0.15.3` (which has the kad module). Deleting it causes cargo to resolve to newer, broken versions.

### ALWAYS work on feature branches for new pallets
Never push pallet changes directly to `develop` without compilation test. Feature branches allow safe iteration.

### Known Dependency Constraints
```toml
# MUST remain at these versions (from Cargo.lock)
sc-network-types = "0.15.3"  # NOT 0.15.4+ (kad module removed)
frame-support = "40.1.0"
frame-system = "40.1.0"
sp-runtime = "41.1.0"
```

## Adding a New Pallet

1. Create feature branch: `git checkout -b feature/new-pallet`
2. Create pallet structure under `pallets/new-pallet/`
3. Add to workspace members in root `Cargo.toml` (MINIMAL changes only)
4. Add workspace dependency reference
5. Test compilation: `cargo build --release`
6. Only merge to develop after successful build

## Network Endpoints

- **Devnet RPC**: `ws://64.23.233.36:9944`
- **Polkadot.js UI**: Connect at `https://polkadot.js.org/apps/#/explorer?rpc=ws://localhost:9944`
