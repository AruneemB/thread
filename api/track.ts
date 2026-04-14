import type { VercelRequest, VercelResponse } from "@vercel/node";
import { incrementMetric } from "../src/db/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { type, count } = req.body;

  if (type === "json_upload" && typeof count === "number" && count > 0) {
    try {
      await incrementMetric("json_upload_messages", count);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[api/track] Error incrementing metric:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  return res.status(400).json({ error: "Invalid request payload" });
}
