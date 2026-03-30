import { Composer, InputFile } from "grammy";

const AVATAR_COLORS = [
  "#e57373", "#f06292", "#ba68c8", "#9575cd",
  "#7986cb", "#64b5f6", "#4fc3f7", "#4dd0e1",
  "#4db6ac", "#81c784", "#aed581", "#dce775",
  "#ffd54f", "#ffb74d", "#ff8a65", "#a1887f",
];

export function avatarColorFromId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function initialsFrom(firstName: string): string {
  const words = firstName.trim().split(/\s+/);
  if (words.length === 0 || words[0] === "") return "?";
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function buildCells(
  dailyCounts: Map<string, number>,
  referenceDate?: Date,
): number[] {
  const now = referenceDate ?? new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayOfWeek = new Date(todayUTC).getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = todayUTC - mondayOffset * 86400000;
  const startMonday = thisMonday - 52 * 7 * 86400000;

  const todayStr = new Date(todayUTC).toISOString().slice(0, 10);
  const cells: number[] = new Array(371);

  for (let i = 0; i < 371; i++) {
    const col = i % 53;
    const row = Math.floor(i / 53);
    const dateMs = startMonday + (col * 7 + row) * 86400000;
    const dateStr = new Date(dateMs).toISOString().slice(0, 10);

    if (dateStr > todayStr) {
      cells[i] = -1;
    } else {
      cells[i] = dailyCounts.get(dateStr) ?? 0;
    }
  }
  return cells;
}

export function buildMemberData(
  member: { user_id: string; first_name: string; totalCount: number },
  dailyCounts: Map<string, number>,
  streaks: { current: number; longest: number },
  totalMessages: number,
): import("../renderer/renderer.js").MemberData {
  return {
    displayName: member.first_name,
    initials: initialsFrom(member.first_name),
    avatarColor: avatarColorFromId(member.user_id),
    role: "member",
    totalMessages,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    activeDays: dailyCounts.size,
    cells: buildCells(dailyCounts),
  };
}

export const statsComposer = new Composer();

statsComposer.command("stats", async (ctx) => {
  await ctx.reply("Stats coming soon.");
});
