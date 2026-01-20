# Chameleon Network Devnet Setup Guide

**Last Updated:** December 23, 2025  
**Version:** 2.0.0

This guide provides comprehensive instructions for setting up and running the Chameleon Network devnet for development and testing purposes.

## Table of Contents

1. [Current Deployment](#current-deployment)
2. [Prerequisites](#prerequisites)
3. [Network Overview](#network-overview)
4. [Building the Node](#building-the-node)
5. [Running the Node](#running-the-node)
6. [MEV Protection Pallet](#mev-protection-pallet)
7. [Mobile App Integration](#mobile-app-integration)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

## Current Deployment

### Active Devnet Node

| Property | Value |
|----------|-------|
| Server | DigitalOcean Droplet 2 (SFO3) |
| IP | `64.23.233.36` |
| RPC Port | 9944 (HTTP & WebSocket) |
| Status | ✅ Running |

### Network Endpoints

```
HTTP RPC:  http://64.23.233.36:9944
WebSocket: ws://64.23.233.36:9944
```

> **Note:** Substrate now uses a unified port 9944 for both HTTP and WebSocket connections.

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 22.04+ recommended) or macOS
- **CPU**: 4+ cores
- **RAM**: 8GB minimum (16GB+ recommended)
- **Storage**: 50GB+ SSD space
- **Network**: Stable internet connection

### Software Dependencies

```bash
# Install Rust and Cargo
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
rustup default stable
rustup update
rustup target add wasm32-unknown-unknown

# Install additional tools (Ubuntu)
sudo apt update
sudo apt install -y git clang curl libssl-dev llvm libudev-dev make protobuf-compiler
```

## Network Overview

### Chameleon Devnet Specifications

| Property | Value |
|----------|-------|
| Network Name | Chameleon Network Devnet |
| Architecture | Standalone Substrate Node |
| Block Time | ~6 seconds |
| Token Symbol | CHML |
| Token Decimals | 18 |
| SS58 Prefix | 42 |
| Total Supply | 100,000,000 CHML |

### Integrated Pallets

| Pallet | Status | Description |
|--------|--------|-------------|
| `pallet-balances` | ✅ Active | Token transfers |
| `pallet-mev-protection` | ✅ Active | MEV protection |
| `pallet-timestamp` | ✅ Active | Block timestamps |
| `pallet-transaction-payment` | ✅ Active | Fee handling |

## Building the Node

### Clone and Build

```bash
# Clone the repository
git clone https://github.com/anthropics/chameleon-network.git
cd chameleon-network/node-template

# Build release binary (takes 10-30 minutes)
cargo build --release

# Verify build
./target/release/chameleon-node-devnet --version
```

### Build on Remote Server (Contabo)

See `/scripts/BUILD_ON_CONTABO.md` for detailed instructions on building on the Contabo VPS.

## Running the Node

### Development Mode (Local)

```bash
# Quick start for local development
./target/release/chameleon-node-devnet --dev
```

### Production Mode (External Access)

```bash
./target/release/chameleon-node-devnet \
  --dev \
  --rpc-external \
  --rpc-cors all \
  --rpc-methods unsafe
```

### With Custom Chain Spec

```bash
./target/release/chameleon-node-devnet \
  --chain chameleon-devnet \
  --rpc-external \
  --rpc-cors all
```

## MEV Protection Pallet

The `pallet-mev-protection` provides front-running and MEV attack protection.

### Pallet Features

- **Encrypted Mempool**: Transactions hidden until execution
- **Fair Ordering**: Time-based ordering, not fee-based
- **Configurable Delays**: Min/max delay blocks
- **Cancellation**: Cancel pending protected transactions

### Extrinsics

```rust
// Submit a protected transaction
mevProtection.submitProtectedTx(
    encrypted_call: Vec<u8>,  // Encoded call data
    delay_blocks: u32         // Blocks to wait before execution
)

// Execute a ready protected transaction
mevProtection.executeProtectedTx(
    tx_hash: Hash
)

// Cancel a pending protected transaction (owner only)
mevProtection.cancelProtectedTx(
    tx_hash: Hash
)
```

### Configuration Constants

```rust
MinDelay: 1 block
MaxDelay: 100 blocks
MaxCallLength: 1024 bytes
```

## Mobile App Integration

The mobile app (`/mobile-app/`) is configured to connect to the devnet.

### Network Configuration

```typescript
// /mobile-app/config/network.ts
export const NETWORK_CONFIG = {
  name: 'Chameleon Devnet',
  isTestnet: true,
  httpEndpoint: 'http://64.23.233.36:9944',
  wsEndpoint: 'ws://64.23.233.36:9944',
  tokenSymbol: 'CHML',
  tokenDecimals: 18,
  ss58Prefix: 42,
};
```

### MEV Service Integration

The mobile app's MEV service (`/mobile-app/services/mev.ts`) provides:

- Dynamic MEV pallet detection
- Protected transaction submission
- Toggle for MEV protection in UI
- Fallback to standard transactions

```typescript
// Check if MEV pallet is available
mevService.isMEVPalletAvailable(api)  // Returns boolean

// Submit protected transaction
await mevService.submitProtectedTransaction(
  api,
  keyPair,
  recipient,
  amount
)
```

## Monitoring

### Health Checks

```bash
# System health
curl -s http://64.23.233.36:9944 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"system_health","params":[]}'

# Expected response:
# {"jsonrpc":"2.0","id":1,"result":{"peers":0,"isSyncing":false,"shouldHavePeers":false}}
```

### Block Production

```bash
# Get latest block header
curl -s http://64.23.233.36:9944 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"chain_getHeader","params":[]}'
```

### RPC Methods

```bash
# List all available RPC methods
curl -s http://64.23.233.36:9944 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"rpc_methods","params":[]}'
```

## Troubleshooting

### Common Issues

#### 1. Connection Refused

**Problem**: Cannot connect to RPC endpoint

**Solutions**:
```bash
# Check if node is running
ps aux | grep solochain

# Check port is listening
ss -tlnp | grep 9944

# Check firewall
ufw allow 9944/tcp
```

#### 2. Mobile App Not Connecting

**Problem**: Wallet shows "Disconnected"

**Solutions**:
- Verify network config uses port 9944 for both endpoints
- Ensure node has `--rpc-external --rpc-cors all` flags
- Check device has internet connectivity

#### 3. MEV Pallet Not Detected

**Problem**: App shows "Pallet unavailable"

**Solutions**:
- Verify node was built with MEV pallet in runtime
- Check runtime metadata includes `mevProtection`
- Restart node if recently updated

#### 4. Build Failures

**Problem**: `cargo build` fails

**Solutions**:
```bash
# Clear build cache
cargo clean

# Update Rust
rustup update

# Check Cargo.lock is present
ls -la Cargo.lock
```

### Log Locations

- Node logs: `journalctl -u chameleon-node -f`
- Build logs: Check terminal output during `cargo build`
- Mobile logs: Check Expo dev server output

## Security Considerations

### Development vs Production

⚠️ **Current devnet is for development only:**

- Uses `--dev` flag with pre-funded accounts
- RPC methods are unsafe (`--rpc-methods unsafe`)
- No authentication on RPC endpoints
- Single validator (no consensus security)

### Production Hardening (Future)

- Remove unsafe RPC methods
- Add authentication/rate limiting
- Deploy multiple validators
- Use proper key management

---

**Version History:**
- v2.0.0 (Dec 2025): Standalone node architecture, MEV pallet integration, unified port 9944
- v1.0.0 (Dec 2024): Initial devnet setup documentation
