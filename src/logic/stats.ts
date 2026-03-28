import Database from "better-sqlite3";
import { db } from "../db/db.js";

function getUtcTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyCountsForUser(
  chatId: string,
  userId: string,
  weeks: number,
  database?: Database.Database,
  referenceDate?: string,
): Map<string, number> {
  const target = database ?? db;
  const ref = referenceDate ? new Date(referenceDate + "T00:00:00Z") : new Date();
  const cutoff = new Date(ref);
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = target.prepare(`
    SELECT date, COUNT(*) AS msg_count
    FROM messages
    WHERE chat_id = ? AND user_id = ? AND date >= ?
    GROUP BY date
  `).all(chatId, userId, cutoffStr) as { date: string; msg_count: number }[];

  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(row.date, row.msg_count);
  }
  return result;
}
