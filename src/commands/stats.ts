import { Composer, InputFile } from "grammy";
import { getGroupSummary, getDailyCountsForUser, getBatchDailyCountsForUsers, computeStreaks, getTotalMessages } from "../logic/stats.js";
import { renderer, type DashboardData, type MemberData } from "../renderer/renderer.js";
import { getMemberByUsername, getCooldown, setCooldown, generateSnapshotToken, saveSnapshot } from "../db/db.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "stats" });

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
): MemberData {
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

export function formatDateRange(): string {
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayOfWeek = new Date(todayUTC).getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = todayUTC - mondayOffset * 86400000;
  const startMonday = thisMonday - 52 * 7 * 86400000;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const startDate = new Date(startMonday);
  const endDate = new Date(todayUTC);

  return `${MONTHS[startDate.getUTCMonth()]} ${startDate.getUTCFullYear()} – ${MONTHS[endDate.getUTCMonth()]} ${endDate.getUTCFullYear()}`;
}

export function getCooldownMs(): number {
  const seconds = parseInt(process.env.STATS_COOLDOWN_SECONDS ?? "600", 10);
  return (isNaN(seconds) ? 600 : seconds) * 1000;
}

export const statsComposer = new Composer();

statsComposer.command("stats", async (ctx) => {
  const chatId = String(ctx.chat.id);
  const groupName = ctx.chat.title ?? "Group Chat";

  const rawMatch = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const usernameMatch = rawMatch.match(/^@(\S+)$/);
  const targetUsername = usernameMatch ? usernameMatch[1] : null;

  // Check cooldown from database
  const lastStatsAt = await getCooldown(chatId);
  const cooldownMs = getCooldownMs();
  if (lastStatsAt !== null) {
    const lastCall = new Date(lastStatsAt).getTime();
    const elapsed = Date.now() - lastCall;
    if (elapsed < cooldownMs) {
      const remainingMs = cooldownMs - elapsed;
      const remainingMin = Math.floor(remainingMs / 60000);
      const remainingSec = Math.ceil((remainingMs % 60000) / 1000);
      const timeStr = remainingMin > 0
        ? `${remainingMin}m ${remainingSec}s`
        : `${remainingSec}s`;
      await ctx.reply(`Stats are on cooldown. Try again in ${timeStr}.`);
      return;
    }
  }

  // Single-member lookup by username
  if (targetUsername !== null) {
    const member = await getMemberByUsername(chatId, targetUsername);
    if (!member) {
      await ctx.reply(`I don't have any data for @${targetUsername} yet.`);
      return;
    }
    const dailyCounts = await getDailyCountsForUser(chatId, member.user_id, 52);
    const streaks = computeStreaks(dailyCounts);
    const total = await getTotalMessages(chatId, member.user_id);
    const memberData = buildMemberData(
      { user_id: member.user_id, first_name: member.first_name, totalCount: total },
      dailyCounts,
      streaks,
      total,
    );

    const dashboardData: DashboardData = {
      groupName,
      dateRange: formatDateRange(),
      sortBy: "messages",
      members: [memberData],
    };

    let png: Buffer;
    try {
      png = await renderer.render(dashboardData);
    } catch (err: unknown) {
      log.error({ err }, "Render failed (single member)");
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Timeout") || message.includes("timeout")) {
        await ctx.reply("Render timed out. Try again in a moment.");
      } else {
        await ctx.reply("Something went wrong generating the report.");
      }
      return;
    }

    const token = generateSnapshotToken();
    const baseUrl = process.env.APP_BASE_URL ?? "";
    let shareUrl: string | null = null;
    try {
      await saveSnapshot(token, dashboardData);
      if (baseUrl) shareUrl = `${baseUrl}/api/share/${token}`;
    } catch (err) {
      log.warn({ err }, "Failed to save snapshot");
    }

    await ctx.replyWithPhoto(new InputFile(png, "thread-stats.png"), {
      caption: shareUrl
        ? `Thread — activity report for ${groupName}\n\nView live: ${shareUrl}`
        : `Thread — activity report for ${groupName}`,
    });

    await setCooldown(chatId, new Date().toISOString());
    return;
  }

  // Fetch group summary
  const summary = await getGroupSummary(chatId);
  if (summary.topMembers.length === 0) {
    await ctx.reply("No message data yet. Start chatting and try again later.");
    return;
  }

  // Build member data — one batch query for all members' daily counts
  const userIds = summary.topMembers.map(tm => tm.user_id);
  const batchCounts = await getBatchDailyCountsForUsers(chatId, userIds, 52);
  const members: MemberData[] = summary.topMembers.map(tm => {
    const dailyCounts = batchCounts.get(tm.user_id) ?? new Map();
    const streaks = computeStreaks(dailyCounts);
    return buildMemberData(tm, dailyCounts, streaks, tm.totalCount);
  });

  const dashboardData: DashboardData = {
    groupName,
    dateRange: formatDateRange(),
    sortBy: "messages",
    members,
  };

  // Render PNG
  let png: Buffer;
  try {
    png = await renderer.render(dashboardData);
  } catch (err: unknown) {
    log.error({ err }, "Render failed (group stats)");
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Timeout") || message.includes("timeout")) {
      await ctx.reply("Render timed out. Try again in a moment.");
    } else {
      await ctx.reply("Something went wrong generating the report.");
    }
    return;
  }

  // Generate share link
  const token = generateSnapshotToken();
  const baseUrl = process.env.APP_BASE_URL ?? "";
  let shareUrl: string | null = null;
  try {
    await saveSnapshot(token, dashboardData);
    if (baseUrl) shareUrl = `${baseUrl}/api/share/${token}`;
  } catch (err) {
    log.warn({ err }, "Failed to save snapshot");
  }

  // Send photo
  await ctx.replyWithPhoto(new InputFile(png, "thread-stats.png"), {
    caption: shareUrl
      ? `Thread — activity report for ${groupName}\n\nView live: ${shareUrl}`
      : `Thread — activity report for ${groupName}`,
  });

  // Set cooldown only after successful send
  await setCooldown(chatId, new Date().toISOString());
});

statsComposer.command("threadhelp", async (ctx) => {
  log.info({ chat_id: ctx.chat.id, user_id: ctx.from?.id }, "threadhelp command received");
  try {
    await ctx.reply(
      `/stats — Generate the full group activity dashboard\n` +
      `/stats @username — View a single member's activity card\n` +
      `/mystats — Get your personal stats sent via DM\n` +
      `/tldr — High-level summary and features\n` +
      `/summon — Summon all administrators in this group\n` +
      `/threadhelp — Show this help message`,
    );
    log.info({ chat_id: ctx.chat.id }, "threadhelp reply sent");
  } catch (err) {
    log.error({ err, chat_id: ctx.chat.id }, "threadhelp reply failed");
    throw err;
  }
});
