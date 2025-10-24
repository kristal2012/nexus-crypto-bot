// Encryption utilities for Binance API secrets
// Uses AES-256-GCM with PBKDF2 key derivation

const ENCRYPTION_KEY = Deno.env.get('BINANCE_ENCRYPTION_KEY');
const PBKDF2_ITERATIONS = 100000; // 100k iterations for security

// Validate encryption key on module load
if (!ENCRYPTION_KEY) {
  throw new Error('BINANCE_ENCRYPTION_KEY not configured');
}
if (ENCRYPTION_KEY.length < 32) {
  throw new Error('BINANCE_ENCRYPTION_KEY must be at least 32 characters');
}
// Verify character diversity to prevent weak keys
const uniqueChars = new Set(ENCRYPTION_KEY).size;
if (uniqueChars < 16) {
  throw new Error('BINANCE_ENCRYPTION_KEY must contain at least 16 unique characters for sufficient entropy. Generate with: openssl rand -base64 48');
}

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(ENCRYPTION_KEY);
  
  // Import base key material
  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  // Derive a strong 256-bit key using PBKDF2
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return derivedKey;
}

export async function encryptSecret(plaintext: string): Promise<{ encrypted: string, salt: string }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate random salt (16 bytes) for PBKDF2
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive key using PBKDF2 with the salt
  const key = await deriveKey(salt);
  
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Return both encrypted data and salt as base64
  return {
    encrypted: btoa(String.fromCharCode(...combined)),
    salt: btoa(String.fromCharCode(...salt))
  };
}

export async function decryptSecret(encryptedBase64: string, saltBase64: string): Promise<string> {
  // Decode salt
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  
  // Derive key using PBKDF2 with the stored salt
  const key = await deriveKey(salt);
  
  // Decode encrypted data
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  
  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Legacy decrypt function for backward compatibility (no salt)
export async function decryptSecretLegacy(encryptedBase64: string): Promise<string> {
  // For legacy data without salt, use a fixed salt derived from the key itself
  const encoder = new TextEncoder();
  const fixedSalt = encoder.encode('legacy_salt_v1').slice(0, 16);
  const paddedSalt = new Uint8Array(16);
  paddedSalt.set(fixedSalt);
  
  return decryptSecret(encryptedBase64, btoa(String.fromCharCode(...paddedSalt)));
}
