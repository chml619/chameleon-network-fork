// This file is part of Substrate.

// Copyright (C) Parity Technologies (UK) Ltd.
// SPDX-License-Identifier: Apache-2.0

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use crate::{AccountId, BalancesConfig, RuntimeGenesisConfig, SudoConfig, PdexConfig, SessionConfig, SessionKeys};
use alloc::{vec, vec::Vec};
use frame_support::build_struct_json_patch;
use serde_json::Value;
use sp_consensus_aura::sr25519::AuthorityId as AuraId;
use sp_consensus_grandpa::AuthorityId as GrandpaId;
use sp_genesis_builder::{self, PresetId};
use sp_keyring::Sr25519Keyring;

// Token IDs for pDEX
const PCHML_ID: u32 = 0;
const PETH_ID: u32 = 1;
const PBTC_ID: u32 = 2;
const PUSDT_ID: u32 = 3;

// Returns the genesis config presets populated with given parameters.
fn testnet_genesis(
        initial_authorities: Vec<(AuraId, GrandpaId)>,
        root: AccountId,
) -> Value {
        // Pre-funded dev wallets with specific CHML amounts
        // Using 12 decimals: 1 CHML = 1_000_000_000_000
        // Updated: Significantly increased for comprehensive testing
        let endowed_accounts: Vec<(AccountId, u128)> = vec![
                (Sr25519Keyring::Alice.to_account_id(), 500_000_000_000_000_000),   // 500,000 CHML
                (Sr25519Keyring::Bob.to_account_id(), 250_000_000_000_000_000),     // 250,000 CHML
                (Sr25519Keyring::Charlie.to_account_id(), 185_000_000_000_000_000), // 185,000 CHML
                (Sr25519Keyring::Dave.to_account_id(), 150_000_000_000_000_000),    // 150,000 CHML
                (Sr25519Keyring::Eve.to_account_id(), 125_000_000_000_000_000),     // 125,000 CHML
        ];

        // Pre-funded pToken balances for dev wallets
        // Format: (account, token_id, balance)
        // Using 12 decimals for all pTokens
        // Token IDs: 0=pCHML, 1=pETH, 2=pBTC, 3=pUSDT
        // Updated: Significantly increased for comprehensive testing
        let pdex_token_balances: Vec<(AccountId, u32, u128)> = vec![
                // ===== pCHML (TokenId 0) - Privacy CHML =====
                (Sr25519Keyring::Alice.to_account_id(), PCHML_ID, 1_000_000_000_000_000_000),   // 1,000,000 pCHML
                (Sr25519Keyring::Bob.to_account_id(), PCHML_ID, 175_000_000_000_000_000),       // 175,000 pCHML
                (Sr25519Keyring::Charlie.to_account_id(), PCHML_ID, 125_000_000_000_000_000),   // 125,000 pCHML
                (Sr25519Keyring::Dave.to_account_id(), PCHML_ID, 95_000_000_000_000_000),       // 95,000 pCHML
                (Sr25519Keyring::Eve.to_account_id(), PCHML_ID, 77_500_000_000_000_000),        // 77,500 pCHML
                
                // ===== pETH (TokenId 1) - Privacy Ethereum =====
                (Sr25519Keyring::Alice.to_account_id(), PETH_ID, 100_000_000_000_000),          // 100 pETH
                (Sr25519Keyring::Bob.to_account_id(), PETH_ID, 45_000_000_000_000),             // 45 pETH
                (Sr25519Keyring::Charlie.to_account_id(), PETH_ID, 37_500_000_000_000),         // 37.5 pETH
                (Sr25519Keyring::Dave.to_account_id(), PETH_ID, 28_500_000_000_000),            // 28.5 pETH
                (Sr25519Keyring::Eve.to_account_id(), PETH_ID, 22_000_000_000_000),             // 22 pETH
                
                // ===== pBTC (TokenId 2) - Privacy Bitcoin =====
                (Sr25519Keyring::Alice.to_account_id(), PBTC_ID, 5_000_000_000_000),            // 5 pBTC
                (Sr25519Keyring::Bob.to_account_id(), PBTC_ID, 2_500_000_000_000),              // 2.5 pBTC
                (Sr25519Keyring::Charlie.to_account_id(), PBTC_ID, 1_850_000_000_000),          // 1.85 pBTC
                (Sr25519Keyring::Dave.to_account_id(), PBTC_ID, 1_500_000_000_000),             // 1.5 pBTC
                (Sr25519Keyring::Eve.to_account_id(), PBTC_ID, 1_250_000_000_000),              // 1.25 pBTC
                
                // ===== pUSDT (TokenId 3) - Privacy USDT =====
                (Sr25519Keyring::Alice.to_account_id(), PUSDT_ID, 500_000_000_000_000_000),     // 500,000 pUSDT
                (Sr25519Keyring::Bob.to_account_id(), PUSDT_ID, 250_000_000_000_000_000),       // 250,000 pUSDT
                (Sr25519Keyring::Charlie.to_account_id(), PUSDT_ID, 185_000_000_000_000_000),   // 185,000 pUSDT
                (Sr25519Keyring::Dave.to_account_id(), PUSDT_ID, 150_000_000_000_000_000),      // 150,000 pUSDT
                (Sr25519Keyring::Eve.to_account_id(), PUSDT_ID, 125_000_000_000_000_000),       // 125,000 pUSDT
        ];

        build_struct_json_patch!(RuntimeGenesisConfig {
                balances: BalancesConfig {
                        balances: endowed_accounts,
                },
                aura: pallet_aura::GenesisConfig {
                        authorities: initial_authorities.iter().map(|x| (x.0.clone())).collect::<Vec<_>>(),
                },
                grandpa: pallet_grandpa::GenesisConfig {
                        authorities: initial_authorities.iter().map(|x| (x.1.clone(), 1)).collect::<Vec<_>>(),
                },
                sudo: SudoConfig { key: Some(root) },
                session: SessionConfig {
                        keys: initial_authorities.iter().map(|x| {
                                let account = AccountId::from(<[u8; 32]>::try_from(x.0.as_ref() as &[u8]).unwrap());
                                (account.clone(), account, SessionKeys { aura: x.0.clone(), grandpa: x.1.clone() })
                        }).collect(),
                },
                pdex: PdexConfig {
                        token_balances: pdex_token_balances,
                },
        })
}

/// Return the development genesis config.
pub fn development_config_genesis() -> Value {
        testnet_genesis(
                vec![(
                        sp_keyring::Sr25519Keyring::Alice.public().into(),
                        sp_keyring::Ed25519Keyring::Alice.public().into(),
                )],
                sp_keyring::Sr25519Keyring::Alice.to_account_id(),
        )
}

/// Return the local genesis config preset.
pub fn local_config_genesis() -> Value {
        testnet_genesis(
                vec![
                        (
                                sp_keyring::Sr25519Keyring::Alice.public().into(),
                                sp_keyring::Ed25519Keyring::Alice.public().into(),
                        ),
                        (
                                sp_keyring::Sr25519Keyring::Bob.public().into(),
                                sp_keyring::Ed25519Keyring::Bob.public().into(),
                        ),
                ],
                Sr25519Keyring::Alice.to_account_id(),
        )
}

/// Provides the JSON representation of predefined genesis config for given `id`.
pub fn get_preset(id: &PresetId) -> Option<Vec<u8>> {
        let patch = match id.as_ref() {
                sp_genesis_builder::DEV_RUNTIME_PRESET => development_config_genesis(),
                sp_genesis_builder::LOCAL_TESTNET_RUNTIME_PRESET => local_config_genesis(),
                _ => return None,
        };
        Some(
                serde_json::to_string(&patch)
                        .expect("serialization to json is expected to work. qed.")
                        .into_bytes(),
        )
}

/// List of supported presets.
pub fn preset_names() -> Vec<PresetId> {
        vec![
                PresetId::from(sp_genesis_builder::DEV_RUNTIME_PRESET),
                PresetId::from(sp_genesis_builder::LOCAL_TESTNET_RUNTIME_PRESET),
        ]
}
