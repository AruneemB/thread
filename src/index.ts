import "dotenv/config";
import { bot } from "./bot/bot.js";
import { logger } from "./utils/logger.js";

const log = logger.child({ module: "main" });

log.info("Starting Thread bot (local polling mode)");
bot.start();
