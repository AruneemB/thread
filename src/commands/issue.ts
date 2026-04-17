import { Composer } from "grammy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "issue" });

const REQUIRED_LABELS = [
  { name: "needs-triage", color: "e4e669", description: "Awaiting triage" },
  { name: "user-reported", color: "0075ca", description: "Reported by a user via Telegram" },
];

export async function ensureGitHubLabels(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return;

  for (const label of REQUIRED_LABELS) {
    const res = await fetch(`https://api.github.com/repos/${repo}/labels`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(label),
    });

    if (res.ok) {
      log.info({ label: label.name }, "GitHub label created");
    } else if (res.status === 422) {
      log.info({ label: label.name }, "GitHub label already exists");
    } else {
      const err = await res.json();
      log.error({ label: label.name, err }, "Failed to ensure GitHub label");
    }
  }
}

export const issueComposer = new Composer();

issueComposer.command("issue", async (ctx) => {
  const message = ctx.match?.trim();
  
  if (!message) {
    await ctx.reply("Please provide a description of the issue. Usage: `/issue <your message>`", { parse_mode: "Markdown" });
    return;
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY_ISSUE;
  if (!apiKey) {
    log.error("GOOGLE_AI_API_KEY_ISSUE is not set");
    await ctx.reply("Sorry, the issue reporting system is not configured (missing AI key).");
    return;
  }

  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
    log.error("GITHUB_TOKEN or GITHUB_REPO is not set");
    await ctx.reply("Sorry, the issue reporting system is not configured (missing GitHub configuration).");
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `
      You are an assistant for a GitHub project. A user has submitted a message for a new issue.
      Your task is to extract a concise, professional title and a summary in the form of short bullet points.
      
      User message: "${message}"
      
      Return the result in the following JSON format:
      {
        "title": "A concise title",
        "summary": "• Point 1\\n• Point 2"
      }
      
      Only return the JSON object, nothing else.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().replace(/```json|```/g, "").trim();
    const aiData = JSON.parse(responseText);

    const user = ctx.from;
    const senderInfo = user?.username ? `@${user.username}` : `${user?.first_name || 'User'} (ID: ${user?.id})`;

    const issueBody = `
### AI Summary
${aiData.summary}

---
### Original Message
${message}

---
**Submitted by:** ${senderInfo}
    `.trim();

    const githubResponse = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: aiData.title,
        body: issueBody,
        labels: ["needs-triage", "user-reported"],
      }),
    });

    if (!githubResponse.ok) {
      const errorData = await githubResponse.json();
      log.error({ errorData }, "GitHub API error");
      throw new Error("Failed to create GitHub issue");
    }

    const issueData = await githubResponse.json();
    
    await ctx.reply(`✅ *Issue Created!* \n\n[#${issueData.number} - ${issueData.title}](${issueData.html_url})`, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true }
    });

    log.info({ issue_number: issueData.number, chat_id: ctx.chat.id }, "GitHub issue created successfully");
  } catch (err) {
    log.error({ err, chat_id: ctx.chat.id }, "Failed to process /issue command");
    await ctx.reply("❌ Sorry, something went wrong while creating the issue. Please try again later.");
  }
});
