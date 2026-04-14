import { Composer, InlineKeyboard } from "grammy";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "tldr" });

export const tldrComposer = new Composer();

tldrComposer.command("tldr", async (ctx) => {
  const baseUrl = process.env.APP_BASE_URL || "https://thread.com"; // Fallback if not set
  
  const text = 
    `🧵 *Thread* turns your chat activity into beautiful, GitHub-style heatmaps!\n\n` +
    `⚠️ *Note:* Thread only analyzes messages sent *after* it was added to this group.\n\n` +
    `🕰️ *Want your full history?* Export your Telegram chat history and upload it on our website for a complete heatmap of your group's entire past!`;

  const keyboard = new InlineKeyboard()
    .text("📊 Group Stats", "cmd_stats")
    .text("👤 My Stats", "cmd_mystats")
    .row()
    .url("🌐 Visit Website", baseUrl);

  try {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    log.info({ chat_id: ctx.chat.id }, "tldr command sent");
  } catch (err) {
    log.error({ err, chat_id: ctx.chat.id }, "tldr command failed");
  }
});

tldrComposer.callbackQuery("cmd_stats", async (ctx) => {
  await ctx.answerCallbackQuery({
    text: "Type /stats in the chat to see the group activity dashboard!",
    show_alert: true,
  });
});

tldrComposer.callbackQuery("cmd_mystats", async (ctx) => {
  await ctx.answerCallbackQuery({
    text: "Type /mystats to get your personal activity card sent via DM!",
    show_alert: true,
  });
});
