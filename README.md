# Chameleon Network

**Privacy-first blockchain with MEV protection for retail users**

Chameleon is a next-generation privacy blockchain built on Substrate, designed to protect retail users from MEV (Miner Extractable Value) exploitation while delivering a mobile-first user experience.

## 🎯 Key Features

- 🔒 **Privacy-Preserving Transactions** - zkSNARK-based shielded transactions
- 🛡️ **MEV Protection** - Encrypted mempool prevents front-running and sandwich attacks
- 📱 **Mobile-First Experience** - Native iOS and Android wallet for seamless UX
- 💱 **Privacy DEX (pDEX)** - Trade with full privacy guarantees
- 🌉 **Cross-Chain Bridges** - Connect to Ethereum, Bitcoin, Solana, and more
- 🏛️ **Community Governance** - Token holders control protocol upgrades



## 🌐 Network Information

- **Token:** CHML (Chameleon)
- **Total Supply:** 100,000,000 CHML (fixed, non-inflationary)
- **Consensus:** Proof-of-Stake (PoS) with 20-year declining emission
- **Block Time:** ~6 seconds
- **Minimum Validator Stake:** 1,750 CHML


## 🏗 Architecture Overview

Chameleon Network consists of:

- Custom Substrate runtime
- Modular pallets (pDEX, Bridge, Treasury, Staking)
- Ethereum smart contracts (bridge custody + multisig)
- Mobile application interface
- Off-chain relayer & validator coordination


## 📦 Repository Structure

```
node/                  → Node implementation
runtime/               → Runtime configuration
pallets/               → Custom pallets (pDEX, Bridge, etc.)
mobile-app/            → React Native mobile wallet
docs/                  → Technical documentation
chameleon-docs/        → Tokenomics & system documentation
```



## 🚀 Getting Started

### Prerequisites

- Rust 1.70+ (stable)
- Node.js 18+ (for wallet development)
- Substrate development environment


# Install Rust and dependencies
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable
rustup update
rustup target add wasm32-unknown-unknown


### Running a Validator

Documentation for running a Chameleon validator will be published soon. Stay tuned!



## 📱 Mobile Wallet

The Chameleon mobile wallet is available for Android.

You can download the latest APK from:

**https://chml.network → Resources → Download APK**

- **Android:** APK available via official website
- **iOS:** Coming soon


## 🔗 Testnet & Mainnet

- **Testnet Launch:** Estimated Week 15 (Q1 2026)
- **Mainnet Launch:** TBD (dependent on testnet results and audits)


## 🌐 Community

Stay connected with the Chameleon ecosystem:

- **Forum** → https://forum.chml.network/
- **Telegram** → https://t.me/Chameleon_Network
- **Twitter (X)** → https://x.com/CHMLnetwork
- **Discord** → https://discord.com/invite/gV79PXJQGA


## 🔐 Security

Security is our top priority. We have:
- Internal security audits (ongoing)
- External audits planned before mainnet (CertiK, Quantstamp, Trail of Bits)
- Bug bounty program (500K CHML pool)

**Found a security issue?** Please email security@chml.network (once set up) or open a confidential issue.

## 🤝 Contributing

Contributions are welcome.

Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

For major changes, open an issue first to discuss proposed updates.


**⚠️ Note:** Chameleon Network is in active development. Testnet is expected in Q1 2026. Use at your own risk. This is not financial advice.

**Built with 💜 for privacy and freedom**
