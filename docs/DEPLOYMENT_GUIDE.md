# Chameleon Network Deployment Guide

**Last Updated:** December 23, 2025  
**Version:** 2.1.0

This guide provides step-by-step instructions for deploying the Chameleon Network devnet.

## 📋 Current Deployment Status

✅ **Active Devnet Node**: `64.23.233.36` (DigitalOcean Droplet 2 - SFO3)
- OS: Ubuntu 22.04 LTS
- Running: Substrate standalone node with MEV Protection pallet
- RPC/WS Port: 9944 (unified endpoint)

## 🌐 Network Endpoints

### Public RPC Endpoint (Current)

| Protocol | Endpoint | Status |
|----------|----------|--------|
| HTTP RPC | `http://64.23.233.36:9944` | ✅ Active |
| WebSocket | `ws://64.23.233.36:9944` | ✅ Active |

> **Note:** Newer Substrate versions use port 9944 for both HTTP and WebSocket.

### RPC Endpoint Testing

```bash
# Test RPC health
curl -H "Content-Type: application/json" \
  -d '{"id":1, "jsonrpc":"2.0", "method": "system_health", "params":[]}' \
  http://64.23.233.36:9944

# Test system info
curl -H "Content-Type: application/json" \
  -d '{"id":1, "jsonrpc":"2.0", "method": "system_name", "params":[]}' \
  http://64.23.233.36:9944

# Test chain info
curl -H "Content-Type: application/json" \
  -d '{"id":1, "jsonrpc":"2.0", "method": "system_chain", "params":[]}' \
  http://64.23.233.36:9944

# Check for MEV pallet
curl -H "Content-Type: application/json" \
  -d '{"id":1, "jsonrpc":"2.0", "method": "state_getMetadata"}' \
  http://64.23.233.36:9944 | grep -i "mev"
```

## 📱 Mobile App Configuration

Use these settings in the Chameleon mobile app (`/mobile-app/config/network.ts`):

```typescript
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

## 🔧 Building the Node

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
rustup default stable
rustup update
rustup target add wasm32-unknown-unknown

# Install dependencies (Ubuntu)
sudo apt update
sudo apt install -y git clang curl libssl-dev llvm libudev-dev make protobuf-compiler
```

### Build Commands

```bash
# Clone repository
git clone https://github.com/anthropics/chameleon-network.git
cd chameleon-network/node-template

# Build release binary
cargo build --release

# Binary location
./target/release/chameleon-node-devnet --version
```

### Running the Node

```bash
# Development mode (local testing)
./target/release/chameleon-node-devnet --dev

# Production mode with external RPC
./target/release/chameleon-node-devnet \
  --dev \
  --rpc-external \
  --rpc-cors all \
  --rpc-methods unsafe
```

## 🛡️ MEV Protection Pallet

The Chameleon node includes the MEV Protection pallet (`pallet-mev-protection`) which provides:

- **Protected Transaction Submission**: Encrypt transaction details until execution
- **Fair Ordering**: Time-based ordering instead of fee-based
- **Configurable Delays**: Min/max delay blocks for protection
- **Transaction Cancellation**: Cancel pending protected transactions

### MEV Pallet Calls

```
mevProtection.submitProtectedTx(encrypted_call, delay_blocks)
mevProtection.executeProtectedTx(tx_hash)
mevProtection.cancelProtectedTx(tx_hash)
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Connection Refused on Port 9944

**Problem**: Cannot reach RPC endpoint

**Solutions**:
```bash
# Check if node is running
ps aux | grep chameleon-node-devnet

# Check if port is listening
ss -tlnp | grep 9944

# Check firewall
ufw status
ufw allow 9944/tcp
```

#### 2. Node Not Starting

**Problem**: Binary fails to start

**Solutions**:
```bash
# Check logs
journalctl -u chameleon-node -f

# Verify binary permissions
chmod +x ./target/release/chameleon-node-devnet

# Check disk space
df -h
```

#### 3. Mobile App Can't Connect

**Problem**: Wallet not connecting to devnet

**Solutions**:
- Verify network config uses port 9944 for both HTTP and WS
- Ensure CORS is enabled on the node (`--rpc-cors all`)
- Check firewall allows external connections

## 📊 Monitoring

```bash
# Check node health
curl -s http://64.23.233.36:9944 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"system_health","params":[]}'

# Get current block
curl -s http://64.23.233.36:9944 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"chain_getHeader","params":[]}'
```

## ✅ Deployment Checklist

- [x] Substrate node compiled with MEV pallet
- [x] Node deployed on DigitalOcean Droplet 2
- [x] RPC endpoint accessible (port 9944)
- [x] Mobile app configured with correct endpoints
- [x] MEV pallet integrated in mobile app
- [ ] Multi-validator network setup
- [ ] Block explorer deployment
- [ ] Telemetry configuration

---

**Version History:**
- v2.1.0 (Dec 2025): Updated to unified port 9944, MEV pallet integration
- v2.0.0 (Dec 2025): Pivoted to standalone Substrate node
- v1.0.0 (Dec 2024): Initial DigitalOcean deployment guide
