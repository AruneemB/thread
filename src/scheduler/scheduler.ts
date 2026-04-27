import { Bot, InputFile } from "grammy";
import { getDbInstance } from "../db/db.js";
import {
  getGroupSummary,
  getBatchDailyCountsForUsers,
  computeStreaks,
} from "../logic/stats.js";
import { renderer } from "../renderer/renderer.js";
import type { DashboardData, MemberData } from "../renderer/renderer.js";
import { buildMemberData, formatDateRange } from "../commands/stats.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "scheduler" });

const PER_CHAT_TIMEOUT_MS = 25_000;

export async function getActiveChatIds(): Promise<string[]> {
  const client = await getDbInstance();
  const result = await client.execute({
    sql: `SELECT DISTINCT chat_id FROM messages WHERE date >= date('now', '-7 days')`,
    args: [],
  });
  return result.rows.map((row) => row.chat_id as string);
}

async function processChat(bot: Bot, chatId: string): Promise<void> {
  let chatTitle = "Group Chat";
  try {
    const chat = await bot.api.getChat(chatId);
    if (chat.type === "group" || chat.type === "supergroup") {
      chatTitle = chat.title;
    }
  } catch (error) {
    log.warn({ chatId, error }, "Failed to get chat title, using fallback");
  }

  const summary = await getGroupSummary(chatId);
  const userIds = summary.topMembers.map(tm => tm.user_id);
  const batchCounts = await getBatchDailyCountsForUsers(chatId, userIds, 52);
  const members: MemberData[] = summary.topMembers.map(tm => {
    const dailyCounts = batchCounts.get(tm.user_id) ?? new Map();
    const streaks = computeStreaks(dailyCounts);
    return buildMemberData(tm, dailyCounts, streaks, tm.totalCount);
  });

  const dashboardData: DashboardData = {
    groupName: chatTitle,
    dateRange: formatDateRange(),
    sortBy: "messages",
    members,
  };

  const imageBuffer = await renderer.render(dashboardData);

  await bot.api.sendPhoto(chatId, new InputFile(imageBuffer), {
    caption: `Thread — activity report · ${dashboardData.dateRange}`,
  });

  log.info({ chatId, chatTitle }, "Weekly digest sent successfully");
}

export async function runWeeklyDigest(): Promise<void> {
  const enabled = (process.env.WEEKLY_DIGEST_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled) {
    log.info("Weekly digest disabled via WEEKLY_DIGEST_ENABLED");
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }

  const bot = new Bot(token);

  log.info("Running weekly digest job");
  const chatIds = await getActiveChatIds();
  log.info({ count: chatIds.length }, "Found active chats");

  for (const chatId of chatIds) {
    try {
      await Promise.race([
        processChat(bot, chatId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Chat ${chatId} timed out`)), PER_CHAT_TIMEOUT_MS)
        ),
      ]);
    } catch (error) {
      log.error({ chatId, error }, "Failed or timed out sending weekly digest");
    }
  }

  log.info("Weekly digest job completed");
}
