import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { join } from "path";
import { readFileSync } from "fs";
import { logger as rootLogger } from "../utils/logger.js";

const logger = rootLogger.child({ module: "renderer" });

const TEMPLATE_PATH = join(process.cwd(), "src", "templates", "dashboard.html");
const templateHtml = readFileSync(TEMPLATE_PATH, "utf-8");

export interface MemberData {
  displayName: string;
  initials: string;
  avatarColor: string;
  role: string;
  totalMessages: number;
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
  cells: number[];
}

export interface DashboardData {
  groupName: string;
  dateRange: string;
  sortBy: "messages" | "streak" | "longest" | "recent";
  members: MemberData[];
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  logger.info("Launching Chromium browser");
  browserInstance = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 900, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  return browserInstance;
}

async function renderDashboard(data: DashboardData): Promise<Buffer> {
  const parsed = parseInt(process.env.RENDER_TIMEOUT_MS ?? "30000", 10);
  const timeoutMs = isNaN(parsed) ? 30000 : parsed;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(templateHtml, { waitUntil: "networkidle0", timeout: timeoutMs });
    await page.evaluate((d) => {
      (window as any).__THREAD_DATA__ = d;
      if (typeof (window as any).renderDashboard === 'function') {
        (window as any).renderDashboard();
      }
    }, data);

    const buffer = await page.screenshot({ fullPage: true, type: "png" });
    logger.info("Screenshot captured successfully");
    return Buffer.from(buffer);
  } catch (err) {
    // On error, kill the browser so the next call gets a fresh one
    try { await browserInstance?.close(); } catch { /* ignore */ }
    browserInstance = null;
    throw err;
  } finally {
    try { await page.close(); } catch { /* ignore */ }
  }
}

// Keep DashboardRenderer class for API compatibility
export class DashboardRenderer {
  async render(data: DashboardData): Promise<Buffer> {
    return await renderDashboard(data);
  }

  async launch(): Promise<void> {
    // No-op for serverless compatibility
  }

  async close(): Promise<void> {
    // No-op for serverless compatibility
  }
}

export const renderer = new DashboardRenderer();

export async function closeRenderer(): Promise<void> {
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
    browserInstance = null;
    logger.info("Chromium browser closed");
  }
}
