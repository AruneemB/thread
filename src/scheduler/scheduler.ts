import { Bot, InputFile } from "grammy";
import { getDbInstance } from "../db/db.js";
import {
  getGroupSummary,
  getDailyCountsForUser,
  computeStreaks,
  getTotalMessages,
} from "../logic/stats.js";
import { renderer } from "../renderer/renderer.js";
import type { DashboardData, MemberData } from "../renderer/renderer.js";
import { buildMemberData, formatDateRange } from "../commands/stats.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "scheduler" });

export async function getActiveChatIds(): Promise<string[]> {
  const client = await getDbInstance();
  const result = await client.execute({
    sql: `SELECT DISTINCT chat_id FROM messages WHERE date >= date('now', '-7 days')`,
    args: [],
  });
  return result.rows.map((row) => row.chat_id as string);
}

function formatWeeklyRange(): string {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const startStr = formatter.format(sevenDaysAgo);
  const endStr = formatter.format(now);

  return `${startStr} – ${endStr}`;
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
      // Get chat title
      let chatTitle = "Group Chat";
      try {
        const chat = await bot.api.getChat(chatId);
        if (chat.type === "group" || chat.type === "supergroup") {
          chatTitle = chat.title;
        }
      } catch (error) {
        log.warn({ chatId, error }, "Failed to get chat title, using fallback");
      }

      // Get group summary and build dashboard
      const summary = await getGroupSummary(chatId);
      const members: MemberData[] = [];
      for (const tm of summary.topMembers) {
        const dailyCounts = await getDailyCountsForUser(chatId, tm.user_id, 52);
        const streaks = computeStreaks(dailyCounts);
        const total = await getTotalMessages(chatId, tm.user_id);
        members.push(buildMemberData(tm, dailyCounts, streaks, total));
      }

      const dashboardData: DashboardData = {
        groupName: chatTitle,
        dateRange: formatDateRange(),
        sortBy: "messages",
        members,
      };

      const imageBuffer = await renderer.render(dashboardData);

      // Send digest
      await bot.api.sendPhoto(chatId, new InputFile(imageBuffer), {
        caption: `Thread — weekly recap · ${formatWeeklyRange()}`,
      });

      log.info({ chatId, chatTitle }, "Weekly digest sent successfully");
    } catch (error) {
      log.error({ chatId, error }, "Failed to send weekly digest");
    }
  }

  log.info("Weekly digest job completed");
}
