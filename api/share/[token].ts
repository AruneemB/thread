import type { VercelRequest, VercelResponse } from "@vercel/node";
import { join } from "path";
import { readFileSync } from "fs";
import { getSnapshot } from "../../src/db/db.js";

const templateHtml = readFileSync(
  join(process.cwd(), "src", "templates", "dashboard.html"),
  "utf-8",
);

const TOKEN_RE = /^[0-9a-f]{32}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = String(req.query.token ?? "");

  if (!TOKEN_RE.test(token)) {
    return res.status(404).send("Not found");
  }

  let data;
  try {
    data = await getSnapshot(token);
  } catch {
    return res.status(500).send("Internal server error");
  }

  if (!data) {
    return res
      .status(404)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .send("<h1>Dashboard not found</h1><p>This link may have expired.</p>");
  }

  const safeJson = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  const inject =
    `<script>window.__THREAD_DATA__=${safeJson};` +
    `if(typeof window.renderDashboard==="function")window.renderDashboard();</script>`;

  const html = templateHtml.replace("</body>", inject + "</body>");

  return res
    .status(200)
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .setHeader("Cache-Control", "public, max-age=300")
    .send(html);
}
