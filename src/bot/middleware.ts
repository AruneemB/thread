import type { Bot } from "grammy";
import type { Logger } from "pino";

export function extractDateFields(_unixTimestamp: number): { date: string; hour: number; dow: number } {
  throw new Error("Not implemented");
}

export function computeMsgLength(_text: string | undefined): number {
  throw new Error("Not implemented");
}

export function registerMessageHandler(bot: Bot, logger: Logger): void {
  bot.on("message", (ctx) => {
    const msg = ctx.message;
    if (!msg.from) return;

    const chat_id = String(msg.chat.id);
    const user_id = String(msg.from.id);
    const username = msg.from.username ?? null;
    const first_name = msg.from.first_name;
    const unixTimestamp = msg.date;

    logger.debug({ chat_id, user_id, username, first_name, unixTimestamp }, "Message received");
  });
}
