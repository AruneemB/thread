import cron, { ScheduledTask } from "node-cron";
import { Bot, InputFile } from "grammy";
import { logger } from "../utils/logger.js";
import { db } from "../db/db.js";
import type { Database } from "better-sqlite3";
import {
  getGroupSummary,
  getDailyCountsForUser,
  computeStreaks,
  getTotalMessages,
} from "../logic/stats.js";
import { renderer } from "../renderer/renderer.js";
import type { DashboardData } from "../renderer/renderer.js";
import { buildMemberData, formatDateRange } from "../commands/stats.js";

const log = logger.child({ module: "scheduler" });

const CRON_EXPRESSION = "0 9 * * 1"; // Every Monday at 09:00 UTC

let task: ScheduledTask | null = null;

export function startScheduler(bot: Bot): void {
  const enabled = (process.env.WEEKLY_DIGEST_ENABLED ?? "true").toLowerCase() !== "false";

  if (!enabled) {
    log.info("Weekly digest disabled via WEEKLY_DIGEST_ENABLED");
    return;
  }

  log.info("Starting scheduler");

  task = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await runWeeklyDigest(bot);
    },
    { timezone: "UTC" }
  );

  log.info({ cron: CRON_EXPRESSION, timezone: "UTC" }, "Weekly digest job registered");
}

export function stopScheduler(): void {
  if (task) {
    log.info("Stopping scheduler");
    task.stop();
    task = null;
  }
}

export function getActiveChatIds(database: Database = db): string[] {
  const sql = `SELECT DISTINCT chat_id FROM messages WHERE date >= date('now', '-7 days')`;
  const rows = database.prepare(sql).all() as { chat_id: string }[];
  return rows.map((row) => row.chat_id);
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

async function runWeeklyDigest(bot: Bot): Promise<void> {
  log.info("Running weekly digest job");
  const chatIds = getActiveChatIds();
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
      const summary = getGroupSummary(chatId);
      const members = buildMemberData(summary.topUsers, chatId);

      const dashboardData: DashboardData = {
        chatTitle,
        dateRange: formatDateRange(),
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
