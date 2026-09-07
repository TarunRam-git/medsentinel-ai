import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  auditHash,
} from "../src/lib/crypto";
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
test("AES-GCM roundtrip hides payload and uses fresh nonces", () => {
  const payload = { patient: "SYNTHETIC-PATIENT", value: 97 };
  const a = encrypt(payload),
    b = encrypt(payload);
  assert.notEqual(a, b);
  assert.deepEqual(decrypt(a), payload);
  assert.ok(!a.includes(payload.patient));
});
test("modified ciphertext fails authentication", () => {
  const data = Buffer.from(encrypt({ value: 1 }), "base64");
  data[data.length - 1] ^= 1;
  assert.throws(() => decrypt(data.toString("base64")));
});
test("passwords are salted and wrong passwords fail", () => {
  const a = hashPassword("a-long-research-test-password");
  assert.notEqual(a, hashPassword("a-long-research-test-password"));
  assert.equal(verifyPassword("a-long-research-test-password", a), true);
  assert.equal(verifyPassword("incorrect", a), false);
});
test("audit hashes are keyed and content dependent", () => {
  assert.equal(auditHash("abc"), auditHash("abc"));
  assert.notEqual(auditHash("abc"), auditHash("abd"));
});
