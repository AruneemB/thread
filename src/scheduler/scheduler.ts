import cron, { ScheduledTask } from "node-cron";
import { Bot } from "grammy";
import { logger } from "../utils/logger.js";

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

async function runWeeklyDigest(bot: Bot): Promise<void> {
  log.info("Running weekly digest job");
  // Implementation will be added in subsequent commits
}
