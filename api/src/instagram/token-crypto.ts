import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM over a platform access token.
 *
 * Node's own crypto rather than a library: this is one cipher used in one
 * place, and a dependency that holds the key to every user's Instagram account
 * is not worth the supply chain.
 *
 * GCM rather than CBC because the token has to be *authenticated*, not merely
 * hidden — a tampered ciphertext must fail to open rather than decrypt to
 * garbage that then gets sent to Meta as a bearer credential.
 *
 * `keyId` is stored beside every ciphertext so a future key rotation can read
 * old rows while writing new ones. Without it, rotating the key means every
 * stored token becomes unreadable at once.
 */
export interface EncryptedToken {
  readonly keyId: string;
  readonly iv: Buffer;
  readonly authTag: Buffer;
  readonly ciphertext: Buffer;
}

export interface EncryptTokenInput {
  readonly plaintext: string;
  readonly key: Buffer;
  readonly keyId: string;
  /**
   * Additional authenticated data. Binding the row's identity here is what
   * stops a ciphertext lifted onto another user's row from opening: the bytes
   * decrypt only under the identity they were sealed for.
   */
  readonly aad: string;
}

export interface DecryptTokenInput extends EncryptedToken {
  readonly key: Buffer;
  readonly aad: string;
}

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

// 96 bits is the GCM-recommended nonce length: it is the size the cipher uses
// directly, so any other length costs a rehash for no benefit.
const ivBytes = 12;

export function encryptToken(input: EncryptTokenInput): EncryptedToken {
  assertKeyLength(input.key);

  if (!input.plaintext) {
    throw new TokenCryptoError("Refusing to encrypt an empty token.");
  }

  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv("aes-256-gcm", input.key, iv);

  cipher.setAAD(Buffer.from(input.aad, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(input.plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    keyId: input.keyId,
    iv,
    authTag: cipher.getAuthTag(),
    ciphertext,
  };
}

export function decryptToken(input: DecryptTokenInput): string {
  assertKeyLength(input.key);

  const decipher = createDecipheriv("aes-256-gcm", input.key, input.iv);

  decipher.setAAD(Buffer.from(input.aad, "utf8"));
  decipher.setAuthTag(input.authTag);

  try {
    return Buffer.concat([
      decipher.update(input.ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // The underlying error carries no useful detail and its message varies by
    // Node version. What matters to every caller is the same thing: these bytes
    // are not a token this key and this identity sealed.
    throw new TokenCryptoError(
      "Stored token failed authentication; it was not sealed with this key and identity.",
    );
  }
}

function assertKeyLength(key: Buffer): void {
  if (key.length !== 32) {
    throw new TokenCryptoError(
      `AES-256 needs a 32-byte key; received ${key.length}.`,
    );
  }
}
