import { chromium, type Browser } from "playwright";
import { resolve } from "path";
import { pathToFileURL } from "url";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" }).child({ module: "renderer" });

const TEMPLATE_PATH = resolve(__dirname, "..", "templates", "dashboard.html");

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
}
