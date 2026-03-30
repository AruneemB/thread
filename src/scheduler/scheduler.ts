import cron, { ScheduledTask } from "node-cron";
import { Bot } from "grammy";
import { logger } from "../utils/logger.js";
import { db } from "../db/db.js";
import type { Database } from "better-sqlite3";

const log = logger.child({ module: "scheduler" });

const CRON_EXPRESSION = "0 9 * * 1"; // Every Monday at 09:00 UTC

let task: ScheduledTask | null = null;

export function startScheduler(bot: Bot): void {
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

async function runWeeklyDigest(bot: Bot): Promise<void> {
  log.info("Running weekly digest job");
  const chatIds = getActiveChatIds();
  log.info({ count: chatIds.length }, "Found active chats");
  // Digest generation will be added in next commit
}
