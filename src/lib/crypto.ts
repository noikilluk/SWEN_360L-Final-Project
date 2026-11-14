/**
 * Crypto provider backed by expo-crypto (native on Android/iOS, Web Crypto in
 * the browser).
 *
 * Passwords: SHA-256 of salt + password, repeated HASH_ROUNDS times. This keeps
 * plain passwords out of storage (NFR-03). A production system with a server
 * would use a slow, memory-hard hash such as Argon2 or bcrypt instead.
 */
import * as Crypto from 'expo-crypto';

import { CODE_ALPHABET, type CryptoProvider } from '@/services/context';

export const HASH_ROUNDS = 50;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export const expoCrypto: CryptoProvider = {
  randomId: () => Crypto.randomUUID(),
  randomCode: (length) => {
    const bytes = Crypto.getRandomBytes(length);
    let code = '';
    for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    return code;
  },
  newSalt: () => toHex(Crypto.getRandomBytes(16)),
  hashPassword: async (password, salt) => {
    let hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
    for (let round = 1; round < HASH_ROUNDS; round++) {
      hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${hash}:${salt}`);
    }
    return hash;
  },
};
