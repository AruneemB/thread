import type { Bot } from "grammy";
import type { Logger } from "pino";
import { upsertMember, insertMessage } from "../db/db.js";

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
  bot.on("message", async (ctx) => {
    const msg = ctx.message;
    if (!msg.from) return;

    const chat_id = String(msg.chat.id);
    const user_id = String(msg.from.id);
    const username = msg.from.username ?? null;
    const first_name = msg.from.first_name;
    const unixTimestamp = msg.date;
    const { date, hour, dow } = extractDateFields(unixTimestamp);
    const msg_length = computeMsgLength(msg.text);
    const last_seen = new Date(unixTimestamp * 1000).toISOString();

    try { await upsertMember({ chat_id, user_id, username, first_name, last_seen }); }
    catch (err) { logger.error({ err, chat_id, user_id }, "Failed to upsert member"); }

    try { await insertMessage({ chat_id, user_id, username, first_name, date, hour, dow, msg_length }); }
    catch (err) { logger.error({ err, chat_id, user_id }, "Failed to insert message"); }
  });
}
