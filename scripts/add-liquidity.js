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

async function sendAndWait(api, tx, signer, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n${description}...`);
    tx.signAndSend(signer, ({ status, events, dispatchError }) => {
      if (status.isInBlock) {
        console.log(`  In block: ${status.asInBlock.toHex()}`);
      }
      if (status.isFinalized) {
        console.log(`  Finalized: ${status.asFinalized.toHex()}`);
        
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            console.log(`  ERROR: ${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`);
            reject(new Error(`${decoded.section}.${decoded.name}`));
          } else {
            console.log(`  ERROR: ${dispatchError.toString()}`);
            reject(new Error(dispatchError.toString()));
          }
        } else {
          events.forEach(({ event }) => {
            if (event.section === 'pdex' && event.method === 'LiquidityAdded') {
              console.log(`  SUCCESS: LiquidityAdded`);
            }
          });
          resolve(true);
        }
      }
    }).catch(reject);
  });
}

async function main() {
  console.log('Connecting to ws://127.0.0.1:9944...');
  const provider = new WsProvider('ws://127.0.0.1:9944');
  const api = await ApiPromise.create({ provider });
  
  const keyring = new Keyring({ type: 'sr25519' });
  const alice = keyring.addFromUri('//Alice');
  
  console.log('Connected to:', (await api.rpc.system.chain()).toString());
  console.log('Alice:', alice.address);

  // 12 decimal places
  const DECIMALS = 1000000000000n; // 10^12
  
  // Correct amounts
  const pCHML_225k = (225000n * DECIMALS).toString();  // 225,000 pCHML
  const pBTC_1_1 = (11n * DECIMALS / 10n).toString();  // 1.1 pBTC
  const pETH_31 = (31n * DECIMALS).toString();          // 31 pETH
  const pUSDT_100k = (100000n * DECIMALS).toString();   // 100,000 pUSDT

  console.log('\nCalculated amounts:');
  console.log('  225,000 pCHML =', pCHML_225k);
  console.log('  1.1 pBTC =', pBTC_1_1);
  console.log('  31 pETH =', pETH_31);
  console.log('  100,000 pUSDT =', pUSDT_100k);

  try {
    // Pool 0: pCHML/pBTC
    await sendAndWait(
      api,
      api.tx.pdex.addLiquidity(0, pCHML_225k, pBTC_1_1, '0'),
      alice,
      'Adding liquidity to Pool 0 (225,000 pCHML + 1.1 pBTC)'
    );

    // Pool 1: pCHML/pETH
    await sendAndWait(
      api,
      api.tx.pdex.addLiquidity(1, pCHML_225k, pETH_31, '0'),
      alice,
      'Adding liquidity to Pool 1 (225,000 pCHML + 31 pETH)'
    );

    // Pool 2: pCHML/pUSDT
    await sendAndWait(
      api,
      api.tx.pdex.addLiquidity(2, pCHML_225k, pUSDT_100k, '0'),
      alice,
      'Adding liquidity to Pool 2 (225,000 pCHML + 100,000 pUSDT)'
    );

    console.log('\n✅ All liquidity added successfully!');
    
    // Verify pools
    console.log('\nVerifying pool reserves...');
    for (let i = 0; i < 3; i++) {
      const pool = await api.query.pdex.pools(i);
      console.log(`Pool ${i}:`, pool.toHuman());
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
  
  process.exit(0);
}

main();
