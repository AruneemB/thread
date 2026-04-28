import { Composer } from "grammy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getChatHistory, appendChatHistory, clearChatHistory } from "../db/db.js";
import { buildChatContext } from "../logic/stats.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "chat" });

const BASE_SYSTEM_INSTRUCTION =
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

    const rawHistory = await getChatHistory(chatId, userId, MAX_HISTORY_TURNS * 2);

    // Strip any orphaned trailing "user" entries so history always ends on "model"
    const history = [...rawHistory];
    while (history.length > 0 && history[history.length - 1].role !== "model") {
      history.pop();
    }

    let systemInstruction = BASE_SYSTEM_INSTRUCTION;
    try {
      const liveContext = await buildChatContext(chatId, userId, ctx.from?.first_name ?? "User");
      systemInstruction = BASE_SYSTEM_INSTRUCTION + " " + liveContext;
    } catch (ctxErr) {
      log.error({ err: ctxErr, chat_id: chatId, user_id: userId }, "Failed to fetch live context, using static instruction");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction,
    });

    const chat = model.startChat({
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.content }],
      })),
    });

    const result = await chat.sendMessage(message);
    const reply = result.response.text();
    await appendChatHistory(chatId, userId, "user", message);
    await appendChatHistory(chatId, userId, "model", reply);

    await ctx.reply(reply);
    log.info({ chat_id: chatId, user_id: userId }, "Chat response sent");
  } catch (err) {
    log.error({ err, chat_id: chatId, user_id: userId }, "Failed to process /chat command");
    await ctx.reply("Sorry, something went wrong. If this keeps happening, try `/chat reset`.", { parse_mode: "Markdown" });
  }
});
