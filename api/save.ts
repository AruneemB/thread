import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateSnapshotToken, saveSnapshot } from "../src/db/db.js";
import type { DashboardData } from "../src/renderer/renderer.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "Payload too large" });
  }

  const token = generateSnapshotToken();
  try {
    await saveSnapshot(token, body as unknown as DashboardData);
  } catch {
    return res.status(500).json({ error: "Failed to save snapshot" });
  }

  const baseUrl = process.env.APP_BASE_URL ?? "";
  const url = `${baseUrl}/?s=${token}`;
  return res.status(200).json({ token, url });
}
