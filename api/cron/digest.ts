import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runWeeklyDigest } from "../../src/scheduler/scheduler.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron sends Authorization header with CRON_SECRET
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await runWeeklyDigest();
    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}
