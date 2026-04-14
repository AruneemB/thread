import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDbInstance } from "../src/db/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = await getDbInstance();
    const [groupsResult, messagesResult] = await Promise.all([
      db.execute(`SELECT COUNT(DISTINCT chat_id) AS cnt FROM messages`),
      db.execute(`SELECT COUNT(*) AS cnt FROM messages`),
    ]);

    const groups = groupsResult.rows[0].cnt as number;
    const messages = messagesResult.rows[0].cnt as number;

    return res
      .status(200)
      .setHeader("Content-Type", "application/json")
      .setHeader(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=600"
      )
      .json({ groups, messages });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}
