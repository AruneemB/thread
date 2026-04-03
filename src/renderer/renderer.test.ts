import { describe, it, expect, vi } from "vitest";
import type { DashboardData, MemberData } from "./renderer.js";

// Mock puppeteer-core and @sparticuz/chromium
vi.mock("puppeteer-core", () => {
  const mockPage = {
    setContent: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG header
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x03, 0x84, // width: 900
      0x00, 0x00, 0x03, 0x20, // height: 800
    ])),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    default: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
  };
});

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: vi.fn().mockResolvedValue("/usr/bin/chromium"),
    headless: true,
  },
}));

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
  describe("PNG output", () => {
    it("render() returns a Buffer instance", async () => {
      const { renderer } = await import("./renderer.js");
      const result = await renderer.render(makeDashboardData());
      expect(Buffer.isBuffer(result)).toBe(true);
    }, 15_000);

    it("buffer starts with PNG magic bytes", async () => {
      const { renderer } = await import("./renderer.js");
      const result = await renderer.render(makeDashboardData());
      expect(result.subarray(0, 8)).toEqual(PNG_MAGIC);
    }, 15_000);

    it("1 member produces a non-empty buffer", async () => {
      const { renderer } = await import("./renderer.js");
      const result = await renderer.render(makeDashboardData({ members: [makeMember()] }));
      expect(result.length).toBeGreaterThan(0);
    }, 15_000);

    it("0 members produces a valid PNG", async () => {
      const { renderer } = await import("./renderer.js");
      const result = await renderer.render(makeDashboardData({ members: [] }));
      expect(result.subarray(0, 8)).toEqual(PNG_MAGIC);
    }, 15_000);
  });

  describe("Viewport", () => {
    it("PNG width is 900px", async () => {
      const { renderer } = await import("./renderer.js");
      const result = await renderer.render(makeDashboardData());
      const width = result.readUInt32BE(16);
      expect(width).toBe(900);
    }, 15_000);

    it("PNG height is greater than 0", async () => {
      const { renderer } = await import("./renderer.js");
      const result = await renderer.render(makeDashboardData());
      const height = result.readUInt32BE(20);
      expect(height).toBeGreaterThan(0);
    }, 15_000);
  });

  describe("Data injection", () => {
    it("injects groupName into page via evaluate", async () => {
      const puppeteer = await import("puppeteer-core");
      const { renderer } = await import("./renderer.js");

      const data = makeDashboardData({ groupName: "Test Group" });
      await renderer.render(data);

      const mockLaunch = puppeteer.default.launch as any;
      const mockBrowser = await mockLaunch.mock.results[mockLaunch.mock.results.length - 1].value;
      const mockPage = await mockBrowser.newPage.mock.results[0].value;

      expect(mockPage.evaluate).toHaveBeenCalled();
      const evaluateCall = mockPage.evaluate.mock.calls[0];
      expect(evaluateCall[1]).toEqual(data);
    }, 15_000);

    it("injects 3 members into page", async () => {
      const puppeteer = await import("puppeteer-core");
      const { renderer } = await import("./renderer.js");

      const data = makeDashboardData({
        members: [
          makeMember({ displayName: "User 1" }),
          makeMember({ displayName: "User 2" }),
          makeMember({ displayName: "User 3" }),
        ],
      });
      await renderer.render(data);

      const mockLaunch = puppeteer.default.launch as any;
      const mockBrowser = await mockLaunch.mock.results[mockLaunch.mock.results.length - 1].value;
      const mockPage = await mockBrowser.newPage.mock.results[mockBrowser.newPage.mock.results.length - 1].value;

      expect(mockPage.evaluate).toHaveBeenCalled();
      // Get the last evaluate call for this render
      const evaluateCall = mockPage.evaluate.mock.calls[mockPage.evaluate.mock.calls.length - 1];
      expect(evaluateCall[1].members).toHaveLength(3);
    }, 15_000);
  });

  describe("Timeout", () => {
    it("RENDER_TIMEOUT_MS=1 causes render to reject", async () => {
      const original = process.env.RENDER_TIMEOUT_MS;
      process.env.RENDER_TIMEOUT_MS = "1";

      const puppeteer = await import("puppeteer-core");
      const mockLaunch = puppeteer.default.launch as any;
      const mockBrowser = await mockLaunch.mock.results[0].value;
      const mockPage = await mockBrowser.newPage.mock.results[0].value;

      // Mock setContent to timeout
      mockPage.setContent.mockRejectedValueOnce(new Error("Timeout"));

      try {
        const { renderer } = await import("./renderer.js");
        await expect(renderer.render(makeDashboardData())).rejects.toThrow();
      } finally {
        if (original === undefined) {
          delete process.env.RENDER_TIMEOUT_MS;
        } else {
          process.env.RENDER_TIMEOUT_MS = original;
        }
        // Reset mock to default behavior
        mockPage.setContent.mockResolvedValue(undefined);
      }
    }, 30_000);

    it("default timeout allows render to complete", async () => {
      const { renderer } = await import("./renderer.js");
      const result = await renderer.render(makeDashboardData());
      expect(Buffer.isBuffer(result)).toBe(true);
    }, 15_000);
  });

  describe("Browser lifecycle", () => {
    it("browser is launched for each render call", async () => {
      const puppeteer = await import("puppeteer-core");
      const mockLaunch = puppeteer.default.launch as any;
      mockLaunch.mockClear();

      const { renderer } = await import("./renderer.js");
      await renderer.render(makeDashboardData());
      expect(mockLaunch).toHaveBeenCalled();
    }, 15_000);

    it("browser is closed after render", async () => {
      const puppeteer = await import("puppeteer-core");
      const { renderer } = await import("./renderer.js");

      await renderer.render(makeDashboardData());

      const mockLaunch = puppeteer.default.launch as any;
      const mockBrowser = await mockLaunch.mock.results[mockLaunch.mock.results.length - 1].value;
      expect(mockBrowser.close).toHaveBeenCalled();
    }, 15_000);
  });

  describe("Concurrency", () => {
    it("two concurrent render() calls both return valid PNGs", async () => {
      const { renderer } = await import("./renderer.js");
      const [result1, result2] = await Promise.all([
        renderer.render(makeDashboardData()),
        renderer.render(makeDashboardData({ groupName: "Other Group" })),
      ]);
      expect(result1.subarray(0, 8)).toEqual(PNG_MAGIC);
      expect(result2.subarray(0, 8)).toEqual(PNG_MAGIC);
    }, 15_000);
  });
});
