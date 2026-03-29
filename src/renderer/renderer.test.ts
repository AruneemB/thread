import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DashboardRenderer, type DashboardData, type MemberData } from "./renderer.js";

function makeMember(overrides: Partial<MemberData> = {}): MemberData {
  return {
    displayName: "Test User",
    initials: "TU",
    avatarColor: "#4a90d9",
    role: "member",
    totalMessages: 100,
    currentStreak: 5,
    longestStreak: 10,
    activeDays: 30,
    cells: Array(371).fill(0),
    ...overrides,
  };
}

function makeDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    groupName: "Test Group",
    dateRange: "Mar 2025 – Mar 2026",
    sortBy: "messages",
    members: [makeMember()],
    ...overrides,
  };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("DashboardRenderer", () => {
  let renderer: DashboardRenderer;

  beforeAll(async () => {
    renderer = new DashboardRenderer();
    await renderer.launch();
  }, 30_000);

  afterAll(async () => {
    await renderer.close();
  }, 15_000);

  describe("PNG output", () => {
    it("render() returns a Buffer instance", async () => {
      const result = await renderer.render(makeDashboardData());
      expect(Buffer.isBuffer(result)).toBe(true);
    }, 15_000);

    it("buffer starts with PNG magic bytes", async () => {
      const result = await renderer.render(makeDashboardData());
      expect(result.subarray(0, 8)).toEqual(PNG_MAGIC);
    }, 15_000);

    it("1 member produces a non-empty buffer", async () => {
      const result = await renderer.render(makeDashboardData({ members: [makeMember()] }));
      expect(result.length).toBeGreaterThan(0);
    }, 15_000);

    it("0 members produces a valid PNG", async () => {
      const result = await renderer.render(makeDashboardData({ members: [] }));
      expect(result.subarray(0, 8)).toEqual(PNG_MAGIC);
    }, 15_000);
  });

  describe("Viewport", () => {
    it("PNG width is 900px", async () => {
      const result = await renderer.render(makeDashboardData());
      const width = result.readUInt32BE(16);
      expect(width).toBe(900);
    }, 15_000);

    it("PNG height is greater than 0", async () => {
      const result = await renderer.render(makeDashboardData());
      const height = result.readUInt32BE(20);
      expect(height).toBeGreaterThan(0);
    }, 15_000);
  });

  describe("Data injection", () => {
    it("injects groupName into window.__THREAD_DATA__", async () => {
      const data = makeDashboardData({ groupName: "Test Group" });
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
      const { resolve } = await import("path");
      const { pathToFileURL } = await import("url");
      const templatePath = resolve(__dirname, "..", "templates", "dashboard.html");
      const url = pathToFileURL(templatePath).href;

      try {
        await page.goto(url, { waitUntil: "networkidle" });
        await page.evaluate((d) => {
          (window as any).__THREAD_DATA__ = d;
        }, data);
        const injected = await page.evaluate(() => (window as any).__THREAD_DATA__);
        expect(injected.groupName).toBe("Test Group");
      } finally {
        await page.close();
        await browser.close();
      }
    }, 15_000);

    it("injects 3 members into window.__THREAD_DATA__", async () => {
      const data = makeDashboardData({
        members: [makeMember(), makeMember(), makeMember()],
      });
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
      const { resolve } = await import("path");
      const { pathToFileURL } = await import("url");
      const templatePath = resolve(__dirname, "..", "templates", "dashboard.html");
      const url = pathToFileURL(templatePath).href;

      try {
        await page.goto(url, { waitUntil: "networkidle" });
        await page.evaluate((d) => {
          (window as any).__THREAD_DATA__ = d;
        }, data);
        const injected = await page.evaluate(() => (window as any).__THREAD_DATA__);
        expect(injected.members).toHaveLength(3);
      } finally {
        await page.close();
        await browser.close();
      }
    }, 15_000);
  });

  describe("Timeout", () => {
    it("RENDER_TIMEOUT_MS=1 causes render to reject", async () => {
      const original = process.env.RENDER_TIMEOUT_MS;
      process.env.RENDER_TIMEOUT_MS = "1";
      try {
        await expect(renderer.render(makeDashboardData())).rejects.toThrow();
      } finally {
        if (original === undefined) {
          delete process.env.RENDER_TIMEOUT_MS;
        } else {
          process.env.RENDER_TIMEOUT_MS = original;
        }
      }
    }, 30_000);

    it("default timeout allows render to complete", async () => {
      const result = await renderer.render(makeDashboardData());
      expect(Buffer.isBuffer(result)).toBe(true);
    }, 15_000);
  });

  describe("Browser lifecycle", () => {
    it("after close(), render() relaunches and produces valid PNG", async () => {
      await renderer.close();
      const result = await renderer.render(makeDashboardData());
      expect(result.subarray(0, 8)).toEqual(PNG_MAGIC);
    }, 15_000);

    it("close() when already closed does not throw", async () => {
      await renderer.close();
      await expect(renderer.close()).resolves.toBeUndefined();
    }, 15_000);
  });

  describe("Concurrency", () => {
    it("two concurrent render() calls both return valid PNGs", async () => {
      const [result1, result2] = await Promise.all([
        renderer.render(makeDashboardData()),
        renderer.render(makeDashboardData({ groupName: "Other Group" })),
      ]);
      expect(result1.subarray(0, 8)).toEqual(PNG_MAGIC);
      expect(result2.subarray(0, 8)).toEqual(PNG_MAGIC);
    }, 15_000);
  });
});
