import { Bot } from "grammy";
import { registerMessageHandler } from "./middleware.js";
import { statsComposer } from "../commands/stats.js";
import { mystatsComposer } from "../commands/mystats.js";
import { tldrComposer } from "../commands/tldr.js";
import { logger } from "../utils/logger.js";

export const _logger = logger.child({ module: "bot" });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set. Please set it in your .env file.");
}
_logger.info("Bot token loaded");

export const bot = new Bot(token);
registerMessageHandler(bot, _logger);
bot.use(statsComposer);
bot.use(mystatsComposer);
bot.use(tldrComposer);
_logger.info("Bot instance created");
