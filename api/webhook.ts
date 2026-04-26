import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bot } from "../src/bot/bot.js";

let initialized = false;
let initPromise: Promise<void> | null = null;

async function ensureBotInitialized(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = bot.init()
      .then(() => {
        initialized = true;
        console.log("[webhook] bot initialized");
      })
      .catch(err => {
        // Allow a future webhook to retry init after transient failures.
        initPromise = null;
        throw err;
      });
  }
  await initPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }
  const update = req.body;
  const updateId = update?.update_id;
  const chatId = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;
  const text = update?.message?.text ?? "(no text)";
  console.log(`[webhook] update_id=${updateId} chat_id=${chatId} text=${text}`);

  // Respond to Telegram immediately — prevents the 30 s webhook timeout and
  // eliminates retry storms when rendering is slow. Vercel's Node.js runtime
  // keeps the function alive until maxDuration (60 s) regardless of when the
  // response is sent, so the update is processed in the background.
  res.status(200).send("OK");

  ensureBotInitialized()
    .then(() => bot.handleUpdate(update))
    .then(() => console.log(`[webhook] handleUpdate OK for update_id=${updateId}`))
    .catch(err => console.error(`[webhook] handleUpdate ERROR for update_id=${updateId}:`, err));
}
