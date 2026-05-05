import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySessionToken } from "../../../src/utils/auth.js";
import { getDbInstance } from "../../../src/db/db.js";
import {
  getGroupSummary,
  getBatchDailyCountsForUsers,
  computeStreaks,
} from "../../../src/logic/stats.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jwtSecret = process.env.THREAD_JWT_SECRET;
  if (!jwtSecret) return res.status(500).json({ error: "Server misconfigured" });

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let userId: string;
  try {
    userId = verifySessionToken(auth.slice(7), jwtSecret);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { chatId } = req.query;
  if (typeof chatId !== "string" || !/^-?\d+$/.test(chatId)) {
    return res.status(400).json({ error: "Invalid chat ID" });
  }

  try {
    const db = await getDbInstance();

    const memberCheck = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = ? AND user_id = ? LIMIT 1`,
      args: [chatId, userId],
    });
    if ((memberCheck.rows[0].cnt as number) === 0) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [chatRow, summary] = await Promise.all([
      db.execute({ sql: `SELECT title FROM chats WHERE chat_id = ?`, args: [chatId] }),
      getGroupSummary(chatId, 20),
    ]);

    const chatTitle =
      chatRow.rows.length > 0 ? (chatRow.rows[0].title as string) : "Group Chat";
    const userIds = summary.topMembers.map((m) => m.user_id);
    const batchCounts = await getBatchDailyCountsForUsers(chatId, userIds, 52);

    const members = summary.topMembers.map((member) => {
      const dailyCountsMap = batchCounts.get(member.user_id) ?? new Map<string, number>();
      const streaks = computeStreaks(dailyCountsMap);

      const dailyCounts: Record<string, number> = {};
      for (const [date, count] of dailyCountsMap) {
        dailyCounts[date] = count;
      }

      const dates = Object.keys(dailyCounts).sort();
      const mostRecent = dates[dates.length - 1] ?? "";

      return {
        id: member.user_id,
        name: member.first_name,
        dailyCounts,
        total: member.totalCount,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
        mostRecent,
      };
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ name: chatTitle, members });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}
