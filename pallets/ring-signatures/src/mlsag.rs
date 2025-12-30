//! MLSAG (Multilayered Linkable Spontaneous Anonymous Group) Signature Implementation
//!
//! This implements ring signature verification compatible with Monero-style MLSAG.

use curve25519_dalek::{
    constants::RISTRETTO_BASEPOINT_POINT as G,
    ristretto::{CompressedRistretto, RistrettoPoint},
    scalar::Scalar,
};
use sha2::{Digest, Sha512};
use sp_std::vec::Vec;

/// Hash to scalar using SHA-512 and reduction
fn hash_to_scalar(data: &[u8]) -> Scalar {
    let mut hasher = Sha512::new();
    hasher.update(data);
    let hash = hasher.finalize();
    let mut bytes = [0u8; 64];
    bytes.copy_from_slice(&hash);
    Scalar::from_bytes_mod_order_wide(&bytes)
}

/// Hash a public key to a curve point (for key image computation)
fn hash_to_point(pubkey: &[u8; 32]) -> RistrettoPoint {
    let mut hasher = Sha512::new();
    hasher.update(b"Chameleon_HP");
    hasher.update(pubkey);
    let hash = hasher.finalize();
    let mut bytes = [0u8; 64];
    bytes.copy_from_slice(&hash);
    RistrettoPoint::from_uniform_bytes(&bytes)
}

/// Decompress a 32-byte compressed point
fn decompress_point(bytes: &[u8; 32]) -> Option<RistrettoPoint> {
    CompressedRistretto::from_slice(bytes)
        .ok()?
        .decompress()
}

/// MLSAG Signature structure
/// Format: c0 (32 bytes) || r[0] (32 bytes) || r[1] (32 bytes) || ... || r[n-1] (32 bytes)
pub struct MlsagSignature {
    pub c0: Scalar,
    pub responses: Vec<Scalar>,
}

impl MlsagSignature {
    /// Parse signature from bytes
    /// Expected format: c0 || r[0] || r[1] || ... || r[n-1]
    pub fn from_bytes(data: &[u8], ring_size: usize) -> Option<Self> {
        let expected_len = 32 + (ring_size * 32);
        if data.len() != expected_len {
            return None;
        }

        // Parse c0
        let mut c0_bytes = [0u8; 32];
        c0_bytes.copy_from_slice(&data[0..32]);
        let c0 = Scalar::from_canonical_bytes(c0_bytes).into_option()?;

        // Parse responses
        let mut responses = Vec::with_capacity(ring_size);
        for i in 0..ring_size {
            let start = 32 + (i * 32);
            let mut r_bytes = [0u8; 32];
            r_bytes.copy_from_slice(&data[start..start + 32]);
            let r = Scalar::from_canonical_bytes(r_bytes).into_option()?;
            responses.push(r);
        }

        Some(Self { c0, responses })
    }
}

/// Verify an MLSAG signature
///
/// # Arguments
/// * `ring_members` - Public keys forming the ring (compressed Ristretto points)
/// * `key_image` - The key image (compressed Ristretto point)
/// * `signature` - The MLSAG signature bytes
/// * `message` - The message that was signed
///
/// # Returns
/// * `Ok(())` if signature is valid
/// * `Err(...)` if verification fails
pub fn verify_mlsag(
    ring_members: &[[u8; 32]],
    key_image: &[u8; 32],
    signature: &[u8],
    message: &[u8],
) -> Result<(), &'static str> {
    let ring_size = ring_members.len();
    
    if ring_size == 0 {
        return Err("Empty ring");
    }

    // Parse signature
    let sig = MlsagSignature::from_bytes(signature, ring_size)
        .ok_or("Invalid signature format")?;

    // Decompress key image
    let key_image_point = decompress_point(key_image)
        .ok_or("Invalid key image")?;

    // Decompress ring members
    let mut ring_points = Vec::with_capacity(ring_size);
    for member in ring_members.iter() {
        let point = decompress_point(member)
            .ok_or("Invalid ring member")?;
        ring_points.push(point);
    }

    // Verification loop
    let mut c = sig.c0;

    for i in 0..ring_size {
        let r = sig.responses[i];
        let pubkey = ring_points[i];
        let hp = hash_to_point(&ring_members[i]);

        // L = r * G + c * P
        let l = G * r + pubkey * c;
        
        // R = r * H_p(P) + c * I
        let r_point = hp * r + key_image_point * c;

        // Compute next challenge: c = H(message || L || R)
        let mut hasher = Sha512::new();
        hasher.update(b"Chameleon_MLSAG");
        hasher.update(message);
        hasher.update(l.compress().as_bytes());
        hasher.update(r_point.compress().as_bytes());
        let hash = hasher.finalize();
        let mut bytes = [0u8; 64];
        bytes.copy_from_slice(&hash);
        c = Scalar::from_bytes_mod_order_wide(&bytes);
    }

    // Final check: c should equal c0
    if c == sig.c0 {
        Ok(())
    } else {
        Err("Signature verification failed")
    }
}

/// Verify a key image is validly formed
/// Key image should be on the curve and not the identity
pub fn verify_key_image(key_image: &[u8; 32]) -> Result<(), &'static str> {
    let point = decompress_point(key_image)
        .ok_or("Key image not on curve")?;
    
    // Check it's not identity
    if point == RistrettoPoint::default() {
        return Err("Key image is identity");
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_hash_to_scalar() {
        let scalar = hash_to_scalar(b"test message");
        assert!(scalar != Scalar::ZERO);
    }
    
    #[test]
    fn test_hash_to_point() {
        let pubkey = [1u8; 32];
        let point = hash_to_point(&pubkey);
        assert!(point != RistrettoPoint::default());
    }
}
