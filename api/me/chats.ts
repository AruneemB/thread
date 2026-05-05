import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySessionToken } from "../../src/utils/auth.js";
import { getChatsForUser } from "../../src/db/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jwtSecret = process.env.THREAD_JWT_SECRET;
  if (!jwtSecret) return res.status(500).json({ error: "Server misconfigured" });

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let userId: string;
  try {
    userId = verifySessionToken(auth.slice(7), jwtSecret);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const chats = await getChatsForUser(userId);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ chats });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}
