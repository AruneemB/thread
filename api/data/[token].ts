import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSnapshot } from "../../src/db/db.js";

const TOKEN_RE = /^[0-9a-f]{32}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = String(req.query.token ?? "");

  if (!TOKEN_RE.test(token)) {
    return res.status(404).json({ error: "Not found" });
  }

  let data;
  try {
    data = await getSnapshot(token);
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }

  if (!data) {
    return res.status(404).json({ error: "Not found" });
  }

  return res
    .status(200)
    .setHeader("Content-Type", "application/json")
    .setHeader("Cache-Control", "public, max-age=300")
    .json(data);
}
