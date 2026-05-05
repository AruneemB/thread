import { createHmac, createHash, timingSafeEqual } from "crypto";

export function verifyTelegramAuth(
  data: Record<string, string>,
  botToken: string,
): boolean {
  const hash = data.hash;
  if (!hash) return false;

  const authDate = parseInt(data.auth_date ?? "0", 10);
  if (Date.now() / 1000 - authDate > 86400) return false;

  const fields = Object.entries(data)
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(fields).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export function issueSessionToken(userId: string, secret: string): string {
  const payload = Buffer.from(`${userId}:${Date.now()}`).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): string {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) throw new Error("Invalid token format");

  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);

  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
  let sigBuffer: Buffer, expectedBuffer: Buffer;
  try {
    sigBuffer = Buffer.from(sig, "hex");
    expectedBuffer = Buffer.from(expectedSig, "hex");
  } catch {
    throw new Error("Invalid token");
  }

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new Error("Invalid token signature");
  }

  const decoded = Buffer.from(payload, "base64url").toString("utf-8");
  const colonIdx = decoded.lastIndexOf(":");
  if (colonIdx === -1) throw new Error("Malformed token payload");

  const userId = decoded.slice(0, colonIdx);
  const issuedAt = parseInt(decoded.slice(colonIdx + 1), 10);

  if (Date.now() - issuedAt > 30 * 24 * 60 * 60 * 1000) {
    throw new Error("Token expired");
  }

  return userId;
}
