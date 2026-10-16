import test from "node:test";
import assert from "node:assert/strict";
import { seal, unseal, sameOrigin } from "../lib/security";
const secret = "test-only-session-secret-32-characters-long";
test("session is encrypted and authenticated, rejecting modification and wrong keys", () => {
  const session = { token: "private-token", userId: "123", expires: 12345 };
  const value = seal(session, secret);
  assert.equal(value.includes("private-token"), false);
  assert.deepEqual(unseal(value, secret), session);
  const bytes = Buffer.from(value, "base64url");
  bytes[bytes.length - 1] ^= 1;
  assert.equal(unseal(bytes.toString("base64url"), secret), null);
  assert.equal(unseal(value, secret + "wrong"), null);
  assert.equal(unseal("invalid", secret), null);
  assert.throws(() => seal(session, "short"));
});
test("write requests require exact configured origin", () => {
  assert.equal(
    sameOrigin("https://teacher.example", "https://teacher.example/"),
    true,
  );
  assert.equal(
    sameOrigin("https://teacher.example.evil.test", "https://teacher.example"),
    false,
  );
  assert.equal(
    sameOrigin("http://teacher.example", "https://teacher.example"),
    false,
  );
  assert.equal(sameOrigin(null, "https://teacher.example"), false);
  assert.equal(sameOrigin("null", "https://teacher.example"), false);
});
