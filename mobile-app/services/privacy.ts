import { ApiPromise } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { blake2AsU8a } from '@polkadot/util-crypto';
import BN from 'bn.js';

// Stealth meta-address (spend + view keys)
export interface StealthMetaAddress {
  spendPubkey: Uint8Array;
  viewPubkey: Uint8Array;
}

// Shielded note structure
export interface ShieldedNote {
  stealthHash: Uint8Array;
  amount: BN;
  spent: boolean;
}

// Generate stealth meta-address from seed
export function generateStealthMetaAddress(seed: string): StealthMetaAddress {
  const keyring = new Keyring({ type: 'sr25519' });
  const spendPair = keyring.addFromUri(`${seed}//spend`);
  const viewPair = keyring.addFromUri(`${seed}//view`);
  
  return {
    spendPubkey: spendPair.publicKey,
    viewPubkey: viewPair.publicKey,
  };
}

// Generate stealth hash for receiving payments
export function generateStealthHash(metaAddress: StealthMetaAddress): Uint8Array {
  // Ensure we have proper Uint8Arrays
  const spend = metaAddress.spendPubkey instanceof Uint8Array 
    ? metaAddress.spendPubkey 
    : new Uint8Array(Object.values(metaAddress.spendPubkey));
  const view = metaAddress.viewPubkey instanceof Uint8Array 
    ? metaAddress.viewPubkey 
    : new Uint8Array(Object.values(metaAddress.viewPubkey));
  const combined = new Uint8Array([...spend, ...view]);
  return blake2AsU8a(combined, 256);
}

// Format for display
export function formatStealthHash(hash: Uint8Array): string {
  const hex = u8aToHex(hash);
  return `${hex.slice(0, 10)}...${hex.slice(-8)}`;
}

// Privacy service
export class PrivacyService {
  private api: ApiPromise | null = null;

  setApi(api: ApiPromise) {
    this.api = api;
  }

  // Get user's private balance from their shielded notes
  async getPrivateBalance(stealthHash: Uint8Array): Promise<BN> {
    if (!this.api) throw new Error('API not connected');
    
    const note = await this.api.query.confidentialTransfer.shieldedNotes(
      Array.from(stealthHash)
    );
    
    if (note.isEmpty) return new BN(0);
    const noteData = note.toJSON() as any;
    if (noteData.spent) return new BN(0);
    
    return new BN(noteData.amount.toString());
  }

  // For devnet testing: Create a minimal ring (2 members)
  async buildTestRing(senderPubkey: Uint8Array): Promise<Uint8Array[]> {
    if (!this.api) throw new Error('API not connected');
    
    // For devnet, use sender + one decoy (Alice's pubkey as decoy)
    const keyring = new Keyring({ type: 'sr25519' });
    const alice = keyring.addFromUri('//Alice');
    
    return [senderPubkey, alice.publicKey];
  }

  // Check if user has shielded notes
  async hasShieldedNotes(stealthHash: Uint8Array): Promise<boolean> {
    if (!this.api) return false;
    
    try {
      const note = await this.api.query.confidentialTransfer.shieldedNotes(
        Array.from(stealthHash)
      );
      if (note.isEmpty) return false;
      const noteData = note.toJSON() as any;
      return noteData && !noteData.spent && noteData.amount > 0;
    } catch {
      return false;
    }
  }

  // Public transfer fallback
  async publicTransfer(
    senderKeypair: any,
    toAddress: string,
    amount: BN
  ): Promise<string> {
    if (!this.api) throw new Error('API not connected');
    
    const tx = this.api.tx.balances.transferKeepAlive(toAddress, amount.toString());
    
    return new Promise((resolve, reject) => {
      tx.signAndSend(senderKeypair, (result: any) => {
        const { status, dispatchError } = result;
        if (status.isInBlock || status.isFinalized) {
          if (dispatchError) {
            reject(new Error(dispatchError.toString()));
          } else {
            resolve(status.asFinalized?.toString() || status.asInBlock.toString());
          }
        }
      }).catch(reject);
    });
  }

  // Generate key image (simplified for devnet)
  generateKeyImage(privateKey: Uint8Array): Uint8Array {
    // Key image = hash of private key (simplified)
    return blake2AsU8a(privateKey, 256);
  }

  // Build ring signature (simplified for devnet testing)
  // In production, this uses proper MLSAG signing
  buildTestSignature(
    ringMembers: Uint8Array[],
    keyImage: Uint8Array,
    message: Uint8Array,
    signerIndex: number,
    privateKey: Uint8Array
  ): Uint8Array {
    // For devnet: Create minimal valid signature structure
    // Format: c0 (32 bytes) || r[0] (32 bytes) || r[1] (32 bytes)
    const ringSize = ringMembers.length;
    const sigLength = 32 + (ringSize * 32);
    const signature = new Uint8Array(sigLength);
    
    // Fill with deterministic values based on message hash
    const msgHash = blake2AsU8a(message, 512);
    signature.set(msgHash.slice(0, sigLength));
    
    return signature;
  }

  // Confidential transfer (private to private)
  async confidentialTransfer(
    signerKeypair: any,
    inputStealthHash: Uint8Array,
    outputStealthHash: Uint8Array,
    amount: BN,
    ephemeralPubkey: Uint8Array
  ): Promise<string> {
    if (!this.api) throw new Error('API not connected');

    // Build ring
    const ringMembers = await this.buildTestRing(signerKeypair.publicKey);
    
    // Generate key image
    const keyImage = this.generateKeyImage(signerKeypair.secretKey || signerKeypair.publicKey);
    
    // Build message for signing
    const message = new Uint8Array([
      ...inputStealthHash,
      ...outputStealthHash,
      ...new BN(amount).toArray('le', 16)
    ]);
    
    // Build signature
    const signature = this.buildTestSignature(
      ringMembers,
      keyImage,
      message,
      0,
      signerKeypair.secretKey || signerKeypair.publicKey
    );

    const tx = this.api.tx.confidentialTransfer.confidentialTransfer(
      ringMembers.map(m => Array.from(m)),
      Array.from(keyImage),
      Array.from(signature),
      Array.from(inputStealthHash),
      Array.from(outputStealthHash),
      Array.from(ephemeralPubkey),
      amount.toString()
    );

    return new Promise((resolve, reject) => {
      tx.signAndSend(signerKeypair, (result: any) => {
        const { status, dispatchError } = result;
        if (status.isInBlock || status.isFinalized) {
          if (dispatchError) {
            reject(new Error(dispatchError.toString()));
          } else {
            resolve(status.asFinalized?.toString() || status.asInBlock.toString());
          }
        }
      }).catch(reject);
    });
  }

  // Shield tokens (bridge entry)
  async shield(
    signerKeypair: any,
    amount: BN,
    outputStealthHash: Uint8Array
  ): Promise<string> {
    if (!this.api) throw new Error('API not connected');

    const tx = this.api.tx.confidentialTransfer.shield(
      amount.toString(),
      Array.from(outputStealthHash)
    );

    return new Promise((resolve, reject) => {
      tx.signAndSend(signerKeypair, (result: any) => {
        const { status, dispatchError } = result;
        if (status.isInBlock || status.isFinalized) {
          if (dispatchError) {
            reject(new Error(dispatchError.toString()));
          } else {
            resolve(status.asFinalized?.toString() || status.asInBlock.toString());
          }
        }
      }).catch(reject);
    });
  }

  // Unshield tokens (bridge exit)
  async unshield(
    signerKeypair: any,
    inputStealthHash: Uint8Array,
    amount: BN,
    destinationAddress: string
  ): Promise<string> {
    if (!this.api) throw new Error('API not connected');

    // Build ring for unshield
    const ringMembers = await this.buildTestRing(signerKeypair.publicKey);
    const keyImage = this.generateKeyImage(signerKeypair.secretKey || signerKeypair.publicKey);
    
    // Build message for unshield
    const message = new Uint8Array([
      ...inputStealthHash,
      ...new BN(amount).toArray('le', 16)
    ]);
    
    const signature = this.buildTestSignature(
      ringMembers,
      keyImage,
      message,
      0,
      signerKeypair.secretKey || signerKeypair.publicKey
    );

    const tx = this.api.tx.confidentialTransfer.unshield(
      ringMembers.map(m => Array.from(m)),
      Array.from(keyImage),
      Array.from(signature),
      Array.from(inputStealthHash),
      amount.toString(),
      destinationAddress
    );

    return new Promise((resolve, reject) => {
      tx.signAndSend(signerKeypair, (result: any) => {
        const { status, dispatchError } = result;
        if (status.isInBlock || status.isFinalized) {
          if (dispatchError) {
            reject(new Error(dispatchError.toString()));
          } else {
            resolve(status.asFinalized?.toString() || status.asInBlock.toString());
          }
        }
      }).catch(reject);
    });
  }
}

export const privacyService = new PrivacyService();
