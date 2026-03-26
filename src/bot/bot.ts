import { Bot } from "grammy";
import pino from "pino";

export const _logger = pino({ level: process.env.LOG_LEVEL ?? "info" }).child({ module: "bot" });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set. Please set it in your .env file.");
}
_logger.info("Bot token loaded");

export const bot = new Bot(token);
_logger.info("Bot instance created");
