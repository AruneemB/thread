import type { Bot } from "grammy";
import type { Logger } from "pino";

export function extractDateFields(unixTimestamp: number): { date: string; hour: number; dow: number } {
  const d = new Date(unixTimestamp * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    hour: d.getUTCHours(),
    dow: (d.getUTCDay() + 6) % 7,
  };
}

export function computeMsgLength(text: string | undefined): number {
  return text?.length ?? 0;
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
