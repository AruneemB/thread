import { Bot } from "grammy";
import { registerMessageHandler } from "./middleware.js";
import { statsComposer } from "../commands/stats.js";
import { mystatsComposer } from "../commands/mystats.js";
import { tldrComposer } from "../commands/tldr.js";
import { summonComposer } from "../commands/summon.js";
import { issueComposer, ensureGitHubLabels } from "../commands/issue.js";
import { logger } from "../utils/logger.js";
import { incrementMetric } from "../db/db.js";

export const _logger = logger.child({ module: "bot" });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set. Please set it in your .env file.");
}
_logger.info("Bot token loaded");

export const bot = new Bot(token);

// Track command usage
bot.use(async (ctx, next) => {
  if (ctx.message?.text?.startsWith("/")) {
    try {
      await incrementMetric("bot_commands_called", 1);
    } catch (err) {
      _logger.error({ err }, "Failed to increment bot_commands_called metric");
    }
  }
  await next();
});

registerMessageHandler(bot, _logger);
bot.use(statsComposer);
bot.use(mystatsComposer);
bot.use(tldrComposer);
bot.use(summonComposer);
bot.use(issueComposer);
_logger.info("Bot instance created");
ensureGitHubLabels().catch((err) => _logger.error({ err }, "Failed to ensure GitHub labels"));
