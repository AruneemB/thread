import { Bot } from "grammy";
import pino from "pino";
import { closeDb } from "../db/db.js";
import { closeRenderer } from "../renderer/renderer.js";
import { registerMessageHandler } from "./middleware.js";
import { statsComposer } from "../commands/stats.js";

export const _logger = pino({ level: process.env.LOG_LEVEL ?? "info" }).child({ module: "bot" });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set. Please set it in your .env file.");
}
_logger.info("Bot token loaded");

export const bot = new Bot(token);
registerMessageHandler(bot, _logger);
bot.use(statsComposer);
_logger.info("Bot instance created");

let shuttingDown = false;

export async function _shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  _logger.info({ signal }, "Shutdown signal received");

  try {
    bot.stop();
  } catch (err) {
    _logger.error({ err }, "Error stopping bot");
  }

  try {
    closeDb();
  } catch (err) {
    _logger.error({ err }, "Error closing database");
  }

  try {
    await closeRenderer();
  } catch (err) {
    _logger.error({ err }, "Error closing renderer");
  }

  process.exit(0);
}

export function _resetShutdownFlag(): void {
  shuttingDown = false;
}

process.on("SIGTERM", () => void _shutdown("SIGTERM"));
process.on("SIGINT", () => void _shutdown("SIGINT"));
