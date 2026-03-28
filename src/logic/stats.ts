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

export function getHourlyMatrix(
  chatId: string,
  userId: string,
  weeks: number = 52,
  database?: Database.Database,
  referenceDate?: string,
): number[][] {
  const target = database ?? db;
  const ref = referenceDate ? new Date(referenceDate + "T00:00:00Z") : new Date();
  const cutoff = new Date(ref);
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  const rows = target.prepare(`
    SELECT dow, hour, COUNT(*) AS msg_count
    FROM messages
    WHERE chat_id = ? AND user_id = ? AND date >= ?
    GROUP BY dow, hour
  `).all(chatId, userId, cutoffStr) as { dow: number; hour: number; msg_count: number }[];

  for (const row of rows) {
    matrix[row.dow][row.hour] = row.msg_count;
  }
  return matrix;
}

export function getTotalMessages(
  chatId: string,
  userId: string,
  database?: Database.Database,
): number {
  const target = database ?? db;
  const row = target.prepare(`
    SELECT COUNT(*) AS cnt
    FROM messages
    WHERE chat_id = ? AND user_id = ?
  `).get(chatId, userId) as { cnt: number };
  return row.cnt;
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

export function getGroupSummary(
  chatId: string,
  topN: number = 20,
  database?: Database.Database,
): GroupSummary {
  const target = database ?? db;

  const totalRow = target.prepare(`
    SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = ?
  `).get(chatId) as { cnt: number };

  const daysRow = target.prepare(`
    SELECT COUNT(DISTINCT date) AS cnt FROM messages WHERE chat_id = ?
  `).get(chatId) as { cnt: number };

  const members = target.prepare(`
    SELECT user_id, first_name, username, COUNT(*) AS totalCount
    FROM messages
    WHERE chat_id = ?
    GROUP BY user_id
    ORDER BY totalCount DESC
    LIMIT ?
  `).all(chatId, topN) as TopMember[];

  return {
    totalMessages: totalRow.cnt,
    activeDays: daysRow.cnt,
    topMembers: members,
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
