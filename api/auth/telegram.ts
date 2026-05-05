import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyTelegramAuth, issueSessionToken } from "../../src/utils/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const jwtSecret = process.env.THREAD_JWT_SECRET;
  if (!botToken || !jwtSecret) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const body = req.body as Record<string, unknown>;
  if (!body?.id || !body?.auth_date || !body?.hash) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const dataAsStrings: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    dataAsStrings[k] = String(v);
  }

  if (!verifyTelegramAuth(dataAsStrings, botToken)) {
    return res.status(401).json({ error: "Invalid Telegram auth" });
  }

  const token = issueSessionToken(String(body.id), jwtSecret);
  return res.status(200).json({ token });
}
