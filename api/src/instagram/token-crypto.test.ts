import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptToken,
  encryptToken,
  TokenCryptoError,
} from "./token-crypto";

const key = Buffer.alloc(32, 3);
const otherKey = Buffer.alloc(32, 9);
const aad = "42:user-1";
const plaintext = "IGQVJXcmFrZXR0ZW5zZWNyZXQtdG9rZW4";

function seal(overrides: { key?: Buffer; aad?: string } = {}) {
  return encryptToken({
    plaintext,
    key: overrides.key ?? key,
    keyId: "v1",
    aad: overrides.aad ?? aad,
  });
}

test("a sealed token round-trips under the same key and identity", () => {
  const sealed = seal();

  assert.equal(decryptToken({ ...sealed, key, aad }), plaintext);
  assert.equal(sealed.keyId, "v1");
});

test("the ciphertext never contains the plaintext", () => {
  const sealed = seal();

  assert.ok(!sealed.ciphertext.toString("utf8").includes(plaintext));
  assert.ok(!sealed.ciphertext.toString("base64").includes(plaintext));
});

test("every seal uses a fresh iv, so the same token twice is two ciphertexts", () => {
  const first = seal();
  const second = seal();

  assert.notDeepEqual(first.iv, second.iv);
  assert.notDeepEqual(first.ciphertext, second.ciphertext);
});

// The point of the AAD: a row's bytes are useless in another row.
test("a ciphertext lifted onto another identity fails to open", () => {
  const sealed = seal();

  assert.throws(
    () => decryptToken({ ...sealed, key, aad: "42:user-2" }),
    TokenCryptoError,
  );
});

test("a ciphertext opened with the wrong key fails", () => {
  const sealed = seal();

  assert.throws(
    () => decryptToken({ ...sealed, key: otherKey, aad }),
    TokenCryptoError,
  );
});

test("a tampered ciphertext fails rather than decrypting to garbage", () => {
  const sealed = seal();
  const tampered = Buffer.from(sealed.ciphertext);
  tampered[0] ^= 0xff;

  assert.throws(
    () => decryptToken({ ...sealed, ciphertext: tampered, key, aad }),
    TokenCryptoError,
  );
});

test("a tampered auth tag fails", () => {
  const sealed = seal();
  const tampered = Buffer.from(sealed.authTag);
  tampered[0] ^= 0xff;

  assert.throws(
    () => decryptToken({ ...sealed, authTag: tampered, key, aad }),
    TokenCryptoError,
  );
});

test("a key of the wrong length is rejected on both paths", () => {
  assert.throws(
    () => encryptToken({ plaintext, key: Buffer.alloc(31), keyId: "v1", aad }),
    TokenCryptoError,
  );
  assert.throws(
    () => decryptToken({ ...seal(), key: Buffer.alloc(16), aad }),
    TokenCryptoError,
  );
});

test("an empty token is refused rather than sealed", () => {
  assert.throws(
    () => encryptToken({ plaintext: "", key, keyId: "v1", aad }),
    TokenCryptoError,
  );
});
