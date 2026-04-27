import { Composer } from "grammy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getChatHistory, appendChatHistory, clearChatHistory } from "../db/db.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "chat" });

const SYSTEM_INSTRUCTION =
  "You are the Thread Assistant, an expert AI for the 'Thread' Telegram bot. " +
  "Thread visualizes Telegram group activity as GitHub-style heatmaps. " +
  "It tracks message counts per day and renders them as contribution graphs, similar to GitHub. " +
  "Commands: /stats (group heatmap), /mystats (personal card), /tldr (overview), /summon (ping admins), /issue (report a bug). " +
  "Answer questions about Thread's features and commands concisely. " +
  "Keep responses short and suitable for a Telegram chat.";

const MAX_HISTORY_TURNS = 10;

export const chatComposer = new Composer();

chatComposer.command("chat", async (ctx) => {
  const message = ctx.match?.trim();
  const chatId = String(ctx.chat.id);
  const userId = String(ctx.from?.id ?? "unknown");

  if (!message) {
    await ctx.reply(
      "Ask me anything about Thread! Usage: `/chat <your question>`\n\nTo reset our conversation: `/chat reset`",
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (message === "reset" || message === "clear") {
    try {
      await clearChatHistory(chatId, userId);
      await ctx.reply("Conversation history cleared.");
    } catch (err) {
      log.error({ err, chat_id: chatId, user_id: userId }, "Failed to clear chat history");
      await ctx.reply("Sorry, something went wrong. Please try again.");
    }
    return;
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY_CHAT;
  if (!apiKey) {
    log.error("GOOGLE_AI_API_KEY_CHAT is not set");
    await ctx.reply("Sorry, the chat feature is not configured.");
    return;
  }

  try {
    await ctx.replyWithChatAction("typing");

    const history = await getChatHistory(chatId, userId, MAX_HISTORY_TURNS * 2);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const chat = model.startChat({
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.content }],
      })),
    });

    await appendChatHistory(chatId, userId, "user", message);
    const result = await chat.sendMessage(message);
    const reply = result.response.text();
    await appendChatHistory(chatId, userId, "model", reply);

    await ctx.reply(reply);
    log.info({ chat_id: chatId, user_id: userId }, "Chat response sent");
  } catch (err) {
    log.error({ err, chat_id: chatId, user_id: userId }, "Failed to process /chat command");
    await ctx.reply("Sorry, something went wrong. Please try again later.");
  }
});
