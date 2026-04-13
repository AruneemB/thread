import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

// Rate limiting and validation constants
const MAX_MSG_LENGTH = 500;
const MAX_HISTORY_MSGS = 10;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const { message, history } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Invalid message" });
  }

  if (message.length > MAX_MSG_LENGTH) {
    return res.status(400).json({ error: "Message too long" });
  }

  try {
    // 1. Gather docs context
    let context = "You are the Thread Assistant, an expert AI for the 'Thread' project. ";
    context += "Thread visualizes Telegram group activity as GitHub-style heatmaps. ";
    context += "Use the following documentation to answer questions accurately and concisely. ";
    context += "If you don't know the answer, say you don't know and suggest checking the docs.\n\n";

    const docFiles = [
      "README.md",
      "docs-thread/THREAD-SPEC.md",
      "docs-thread/THREAD-LANDING-PAGE.md"
    ];

    for (const file of docFiles) {
      try {
        const fullPath = path.resolve(process.cwd(), file);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          context += `--- DOCUMENT: ${file} ---\n${content}\n\n`;
        }
      } catch (err) {
        console.error(`Error reading ${file}:`, err);
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Using gemini-1.5-flash as it is more stable and widely available
    // systemInstruction MUST be passed here for @google/generative-ai
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: context 
    });

    // 2. Format chat history
    const chatHistory = (history || []).slice(-MAX_HISTORY_MSGS).map((h: any) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    }));

    // 3. Generate response
    const chat = model.startChat({
      history: chatHistory,
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();

    return res.status(200).json({ response: responseText });
  } catch (error: any) {
    // Log detailed error for Vercel logs
    console.error("Gemini API error detail:", {
      message: error.message,
      stack: error.stack,
      status: error.status,
      details: error.details
    });
    return res.status(500).json({ error: "Failed to generate response", details: error.message });
  }
}
