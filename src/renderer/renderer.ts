import { chromium, type Browser } from "playwright";
import { resolve } from "path";
import { pathToFileURL } from "url";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" }).child({ module: "renderer" });

const TEMPLATE_PATH = resolve(__dirname, "..", "templates", "dashboard.html");
const RENDER_TIMEOUT_MS = parseInt(process.env.RENDER_TIMEOUT_MS ?? "15000", 10);

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

export class DashboardRenderer {
  private browser: Browser | null = null;

  async launch(): Promise<void> {
    logger.info("Launching Chromium browser");
    this.browser = await chromium.launch();
    logger.info("Chromium browser launched");
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info("Chromium browser closed");
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      if (this.browser) {
        logger.warn("Browser disconnected, relaunching");
      }
      await this.launch();
    }
  }

  async render(data: DashboardData): Promise<Buffer> {
    await this.ensureBrowser();
    try {
      return await this._doRender(data);
    } catch (err) {
      logger.warn({ err }, "Render failed, relaunching browser and retrying");
      await this.launch();
      return await this._doRender(data);
    }
  }

  private async _doRender(data: DashboardData): Promise<Buffer> {
    const timeoutMs = RENDER_TIMEOUT_MS;
    const url = pathToFileURL(TEMPLATE_PATH).href;
    const page = await this.browser!.newPage({ viewport: { width: 900, height: 800 } });

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
      await page.evaluate((d) => {
        (window as any).__THREAD_DATA__ = d;
      }, data);
      await page.waitForLoadState("networkidle", { timeout: timeoutMs });

      const buffer = await page.screenshot({ fullPage: true, type: "png", timeout: timeoutMs });
      return Buffer.from(buffer);
    } finally {
      await page.close();
    }
  }
}

export const renderer = new DashboardRenderer();

export async function closeRenderer(): Promise<void> {
  try {
    await renderer.close();
  } catch (err) {
    logger.error({ err }, "Error closing renderer");
  }
}
