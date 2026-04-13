import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bot } from "../src/bot/bot.js";

let initialized = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }
  const update = req.body;
  const updateId = update?.update_id;
  const chatId = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;
  const text = update?.message?.text ?? "(no text)";
  console.log(`[webhook] update_id=${updateId} chat_id=${chatId} text=${text}`);
  try {
    if (!initialized) {
      await bot.init();
      initialized = true;
      console.log("[webhook] bot initialized");
    }
    await bot.handleUpdate(update);
    console.log(`[webhook] handleUpdate OK for update_id=${updateId}`);
    res.status(200).send("OK");
  } catch (err) {
    console.error(`[webhook] handleUpdate ERROR for update_id=${updateId}:`, err);
    res.status(500).send("Internal Server Error");
  }
}
