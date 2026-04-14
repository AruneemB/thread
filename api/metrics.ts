import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDbInstance, getGlobalMetrics } from "../src/db/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = await getDbInstance();
    const [groupsResult, messagesResult, globalMetrics] = await Promise.all([
      db.execute(`SELECT COUNT(DISTINCT chat_id) AS cnt FROM messages`),
      db.execute(`SELECT COUNT(*) AS cnt FROM messages`),
      getGlobalMetrics(),
    ]);

    const groups = groupsResult.rows[0].cnt as number;
    const botMessages = messagesResult.rows[0].cnt as number;
    const jsonUploadMessages = globalMetrics["json_upload_messages"] || 0;
    const commandsCalled = globalMetrics["bot_commands_called"] || 0;

    const messages = botMessages + jsonUploadMessages;

    return res
      .status(200)
      .setHeader("Content-Type", "application/json")
      .setHeader(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=600"
      )
      .json({ groups, messages, commands_called: commandsCalled });
  } catch (error) {
    console.error("[api/metrics] Error fetching metrics:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
