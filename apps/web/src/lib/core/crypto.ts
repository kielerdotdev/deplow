import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest()
}

/**
 * Encrypt UTF-8 plaintext with AES-256-GCM.
 * Output format: base64(iv || authTag || ciphertext)
 */
export function encryptString(plaintext: string, secret: string): string {
  const key = deriveKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

export function decryptString(payload: string, secret: string): string {
  const key = deriveKey(secret)
  const buf = Buffer.from(payload, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  )
}

export function randomPassword(length = 32): string {
  return randomBytes(Math.ceil(length * 0.75))
    .toString("base64url")
    .slice(0, length)
}

export function sanitizeIdentifier(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^([0-9])/, "_$1")
    .slice(0, 48)
}
