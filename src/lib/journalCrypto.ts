export const ENC_PREFIX = 'j42:v1:'
const VERIFIER_PLAINTEXT = 'journal42-lock-v1'
const PBKDF2_ITERATIONS = 100_000

export function isEncryptedText(value: string): boolean {
  return value.startsWith(ENC_PREFIX)
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function deriveKey(
  passcode: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passcode),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const saltBytes = new Uint8Array(salt)

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function createVerifier(key: CryptoKey): Promise<string> {
  return encryptText(VERIFIER_PLAINTEXT, key)
}

export async function verifyKey(
  key: CryptoKey,
  verifier: string,
): Promise<boolean> {
  try {
    const decrypted = await decryptText(verifier, key)
    return decrypted === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

export async function encryptText(
  plaintext: string,
  key: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  )
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return `${ENC_PREFIX}${bytesToBase64(combined)}`
}

export async function decryptText(
  payload: string,
  key: CryptoKey,
): Promise<string> {
  if (!isEncryptedText(payload)) return payload

  const combined = base64ToBytes(payload.slice(ENC_PREFIX.length))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  return new TextDecoder().decode(plainBuffer)
}

export function saltToBase64(salt: Uint8Array): string {
  return bytesToBase64(salt)
}

export function saltFromBase64(value: string): Uint8Array {
  return base64ToBytes(value)
}
