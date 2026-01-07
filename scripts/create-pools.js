/**
 * Chameleon Network - Create Liquidity Pools
 * 
 * Creates the 3 genesis liquidity pools on devnet:
 * - Pool 0: pCHML/pBTC
 * - Pool 1: pCHML/pETH
 * - Pool 2: pCHML/pUSDT
 * 
 * Usage: node create-pools.js
 * Prerequisites: npm install @polkadot/api @polkadot/keyring
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
  
  // Create Pool 0: pCHML(0) / pBTC(2)
  console.log('\nCreating Pool 0: pCHML/pBTC...');
  const tx1 = api.tx.pdex.createPool(0, 2);
  await tx1.signAndSend(alice, { nonce: -1 });
  await new Promise(r => setTimeout(r, 6000));
  
  // Create Pool 1: pCHML(0) / pETH(1)
  console.log('Creating Pool 1: pCHML/pETH...');
  const tx2 = api.tx.pdex.createPool(0, 1);
  await tx2.signAndSend(alice, { nonce: -1 });
  await new Promise(r => setTimeout(r, 6000));
  
  // Create Pool 2: pCHML(0) / pUSDT(3)
  console.log('Creating Pool 2: pCHML/pUSDT...');
  const tx3 = api.tx.pdex.createPool(0, 3);
  await tx3.signAndSend(alice, { nonce: -1 });
  await new Promise(r => setTimeout(r, 6000));
  
  console.log('\n✅ All 3 pools created!');
  console.log('Pool 0: pCHML/pBTC');
  console.log('Pool 1: pCHML/pETH');
  console.log('Pool 2: pCHML/pUSDT');
  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
