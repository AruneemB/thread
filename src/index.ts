import "dotenv/config";
import { bot } from "./bot/bot.js";
import { startScheduler } from "./scheduler/scheduler.js";
import { logger } from "./utils/logger.js";

const log = logger.child({ module: "main" });

log.info("Starting Thread bot");
bot.start();
startScheduler(bot);
