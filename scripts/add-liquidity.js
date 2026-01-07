/**
 * Chameleon Network - Add Initial Liquidity
 * 
 * Seeds the 3 liquidity pools with initial liquidity from Alice's wallet.
 * 
 * Pool allocations (from Alice's genesis balance):
 * - Pool 0 (pCHML/pBTC): 225,000 pCHML + 1.1 pBTC
 * - Pool 1 (pCHML/pETH): 225,000 pCHML + 31 pETH
 * - Pool 2 (pCHML/pUSDT): 225,000 pCHML + 100,000 pUSDT
 * 
 * Price ratios (as of Jan 2026):
 * - 1 pBTC ≈ 204,545 pCHML ($93,600 / $0.45)
 * - 1 pETH ≈ 7,258 pCHML ($3,256 / $0.45)
 * - 1 pUSDT ≈ 2.22 pCHML ($1 / $0.45)
 * 
 * Usage: node add-liquidity.js
 * Prerequisites: Run create-pools.js first
 * Run from: SFO droplet (64.23.233.36) or any machine with node.js
 */
const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'ws://127.0.0.1:9944';

async function main() {
  console.log(`Connecting to ${RPC_ENDPOINT}...`);
  const provider = new WsProvider(RPC_ENDPOINT);
  const api = await ApiPromise.create({ provider });
  
  const keyring = new Keyring({ type: 'sr25519' });
  const alice = keyring.addFromUri('//Alice');
  
  console.log('Connected to chain:', (await api.rpc.system.chain()).toString());
  console.log('Alice address:', alice.address);
  
  // Pool 0: pCHML/pBTC - 225,000 pCHML + 1.1 pBTC
  // 225,000 * 10^12 = 225000000000000000000
  // 1.1 * 10^12 = 1100000000000
  console.log('\nAdding liquidity to Pool 0 (pCHML/pBTC)...');
  console.log('  225,000 pCHML + 1.1 pBTC');
  const tx1 = api.tx.pdex.addLiquidity(0, '225000000000000000000', '1100000000000', '0');
  await tx1.signAndSend(alice, { nonce: -1 });
  await new Promise(r => setTimeout(r, 6000));
  
  // Pool 1: pCHML/pETH - 225,000 pCHML + 31 pETH
  // 31 * 10^12 = 31000000000000
  console.log('Adding liquidity to Pool 1 (pCHML/pETH)...');
  console.log('  225,000 pCHML + 31 pETH');
  const tx2 = api.tx.pdex.addLiquidity(1, '225000000000000000000', '31000000000000', '0');
  await tx2.signAndSend(alice, { nonce: -1 });
  await new Promise(r => setTimeout(r, 6000));
  
  // Pool 2: pCHML/pUSDT - 225,000 pCHML + 100,000 pUSDT
  // 100,000 * 10^12 = 100000000000000000000
  console.log('Adding liquidity to Pool 2 (pCHML/pUSDT)...');
  console.log('  225,000 pCHML + 100,000 pUSDT');
  const tx3 = api.tx.pdex.addLiquidity(2, '225000000000000000000', '100000000000000000000', '0');
  await tx3.signAndSend(alice, { nonce: -1 });
  await new Promise(r => setTimeout(r, 6000));
  
  console.log('\n✅ Liquidity added to all 3 pools!');
  console.log('\nTotal liquidity seeded:');
  console.log('  - 675,000 pCHML (~$303,750)');
  console.log('  - 1.1 pBTC (~$102,960)');
  console.log('  - 31 pETH (~$100,936)');
  console.log('  - 100,000 pUSDT (~$100,000)');
  console.log('\nAlice remaining balances:');
  console.log('  - 325,000 pCHML');
  console.log('  - 3.9 pBTC');
  console.log('  - 69 pETH');
  console.log('  - 400,000 pUSDT');
  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
