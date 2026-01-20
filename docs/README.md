# Chameleon Network Documentation

**Version:** 2.0.0  
**Last Updated:** December 23, 2025

## Overview

Chameleon Network is a privacy-focused blockchain built on Substrate, featuring MEV protection, private DEX capabilities, and a mobile-first user experience.

## Architecture

Chameleon is built as a **standalone Substrate blockchain** (not a parachain), providing:

- Full control over consensus and runtime
- Simpler deployment and maintenance
- No relay chain dependencies
- Faster iteration and upgrades

For the architecture decision details, see [architecture-pivot.md](./architecture-pivot.md).

## Current Status (December 2025)

| Component | Status | Notes |
|-----------|--------|-------|
| **Substrate Node** | ✅ Deployed | Running on DigitalOcean Droplet 2 |
| **MEV Protection Pallet** | ✅ Integrated | Live on devnet |
| **Mobile Wallet** | ✅ In Development | React Native (Expo) |
| **pDEX Pallet** | 🔄 Planned | Week 2-10 |
| **Bridge Pallet** | 🔄 Planned | Week 2-10 |
| **Staking Improvements** | 🔄 Planned | Week 2-6 |

## Network Endpoints

**Devnet (Active):**
- HTTP RPC: `http://64.23.233.36:9944`
- WebSocket: `ws://64.23.233.36:9944`

## Documentation Index

### Deployment & Operations
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - How to deploy Chameleon nodes
- [Devnet Setup](./devnet-setup.md) - Detailed devnet configuration

### Architecture
- [Architecture Pivot](./architecture-pivot.md) - Decision to use standalone node

### Infrastructure
- [Cloud Deployment Plan](./infrastructure/cloud-deployment-plan.md)
- [Week 4 Checklist](./infrastructure/week4-deployment-checklist.md)

## Quick Start

### Connect to Devnet

```bash
# Test RPC connection
curl -H "Content-Type: application/json" \
  -d '{"id":1, "jsonrpc":"2.0", "method": "system_health"}' \
  http://64.23.233.36:9944
```

### Build from Source

```bash
git clone https://github.com/anthropics/chameleon-network.git
cd chameleon-network/node-template
cargo build --release
./target/release/chameleon-node-devnet --dev
```

### Mobile App Development

```bash
cd mobile-app
yarn install
yarn start
```

## Key Features

### 1. MEV Protection
Protects users from front-running and sandwich attacks through encrypted mempool and fair ordering.

### 2. Private DEX (pDEX)
AMM-based decentralized exchange with privacy-preserving swaps.

### 3. Mobile-First UX
React Native wallet app for iOS and Android with seamless blockchain interaction.

### 4. 100M Fixed Supply
CHML token with deflationary economics and 20-year emission schedule.

## Repository Structure

```
chameleon-network/
├── node-template/           # Substrate node
│   ├── pallets/
│   │   ├── template/        # Example pallet
│   │   └── mev-protection/  # MEV protection pallet
│   ├── runtime/             # Runtime configuration
│   └── node/                # Node binary
├── mobile-app/              # React Native wallet
├── docs/                    # Documentation
└── chameleon-docs/          # Project planning docs
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

## License

GPL-3.0 License

---

*This README supersedes the legacy Manta parachain documentation.*
