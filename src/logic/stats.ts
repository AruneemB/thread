import { getDbInstance } from "../db/db.js";
import type { Client } from "@libsql/client";

function getUtcTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyCountsForUser(
  chatId: string,
  userId: string,
  weeks: number,
  referenceDate?: string,
): Promise<Map<string, number>> {
  const client = await getDbInstance();
  const ref = referenceDate ? new Date(referenceDate + "T00:00:00Z") : new Date();
  const cutoff = new Date(ref);
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const result = await client.execute({
    sql: `
      SELECT date, COUNT(*) AS msg_count
      FROM messages
      WHERE chat_id = ? AND user_id = ? AND date >= ?
      GROUP BY date
    `,
    args: [chatId, userId, cutoffStr],
  });

  const counts = new Map<string, number>();
  for (const row of result.rows) {
    counts.set(row.date as string, row.msg_count as number);
  }
  return counts;
}

function subtractOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function getHourlyMatrix(
  chatId: string,
  userId: string,
  weeks: number = 52,
  referenceDate?: string,
): Promise<number[][]> {
  const client = await getDbInstance();
  const ref = referenceDate ? new Date(referenceDate + "T00:00:00Z") : new Date();
  const cutoff = new Date(ref);
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  const result = await client.execute({
    sql: `
      SELECT dow, hour, COUNT(*) AS msg_count
      FROM messages
      WHERE chat_id = ? AND user_id = ? AND date >= ?
      GROUP BY dow, hour
    `,
    args: [chatId, userId, cutoffStr],
  });

  for (const row of result.rows) {
    matrix[row.dow as number][row.hour as number] = row.msg_count as number;
  }
  return matrix;
}

export async function getTotalMessages(
  chatId: string,
  userId: string,
): Promise<number> {
  const client = await getDbInstance();
  const result = await client.execute({
    sql: `
      SELECT COUNT(*) AS cnt
      FROM messages
      WHERE chat_id = ? AND user_id = ?
    `,
    args: [chatId, userId],
  });
  return result.rows[0].cnt as number;
}

export interface TopMember {
  user_id: string;
  first_name: string;
  username: string | null;
  totalCount: number;
}

export interface GroupSummary {
  totalMessages: number;
  activeDays: number;
  topMembers: TopMember[];
}

export async function getGroupSummary(
  chatId: string,
  topN: number = 20,
): Promise<GroupSummary> {
  const client = await getDbInstance();

  const totalResult = await client.execute({
    sql: `SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = ?`,
    args: [chatId],
  });

  const daysResult = await client.execute({
    sql: `SELECT COUNT(DISTINCT date) AS cnt FROM messages WHERE chat_id = ?`,
    args: [chatId],
  });

  const membersResult = await client.execute({
    sql: `
      SELECT user_id, first_name, username, COUNT(*) AS totalCount
      FROM messages
      WHERE chat_id = ?
      GROUP BY user_id
      ORDER BY totalCount DESC
      LIMIT ?
    `,
    args: [chatId, topN],
  });

  const topMembers: TopMember[] = membersResult.rows.map(row => ({
    user_id: row.user_id as string,
    first_name: row.first_name as string,
    username: row.username as string | null,
    totalCount: row.totalCount as number,
  }));

  return {
    totalMessages: totalResult.rows[0].cnt as number,
    activeDays: daysResult.rows[0].cnt as number,
    topMembers,
  };
}

export function getPeakHour(
  matrix: number[][],
): { dow: number; hour: number; count: number } {
  let best = { dow: 0, hour: 0, count: 0 };
  for (let dow = 0; dow < matrix.length; dow++) {
    for (let hour = 0; hour < matrix[dow].length; hour++) {
      if (matrix[dow][hour] > best.count) {
        best = { dow, hour, count: matrix[dow][hour] };
      }
    }
  }
  return best;
}

export function computeStreaks(
  dailyCounts: Map<string, number>,
  today?: string,
): { current: number; longest: number } {
  if (dailyCounts.size === 0) return { current: 0, longest: 0 };

  const todayStr = today ?? getUtcTodayString();

  // Current streak: walk backward from today
  let current = 0;
  let cursor = todayStr;
  while (dailyCounts.has(cursor) && dailyCounts.get(cursor)! > 0) {
    current++;
    cursor = subtractOneDay(cursor);
  }

  // Longest streak: sort active dates forward, find longest consecutive run
  const sortedDates = Array.from(dailyCounts.keys())
    .filter(d => dailyCounts.get(d)! > 0 && d <= todayStr)
    .sort();

  let longest = 0;
  let run = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0 || sortedDates[i] === addOneDay(sortedDates[i - 1])) {
      run++;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
  }

  longest = Math.max(longest, current);
  return { current, longest };
}
