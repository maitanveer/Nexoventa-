import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createPaymentAccessToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashPaymentAccessToken(token) };
}

export function hashPaymentAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function matchesPaymentAccessToken(token: string, storedHash: string | null) {
  if (!storedHash) return false;
  const provided = Buffer.from(hashPaymentAccessToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function paymentAccessCookieName(applicationId: string) {
  return `nexoventa_payment_${applicationId}`;
}