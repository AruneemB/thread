import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

// Mock node-cron
const mockSchedule = vi.fn();
const mockTask = { stop: vi.fn() };
vi.mock("node-cron", () => ({
  default: { schedule: mockSchedule },
}));

// Mock dependencies
vi.mock("../db/db.js", () => ({
  db: {},
}));

vi.mock("../logic/stats.js", () => ({
  getGroupSummary: vi.fn(),
  getDailyCountsForUser: vi.fn(),
  computeStreaks: vi.fn(),
  getTotalMessages: vi.fn(),
}));

vi.mock("../renderer/renderer.js", () => ({
  renderer: { render: vi.fn() },
}));

vi.mock("../commands/stats.js", () => ({
  buildMemberData: vi.fn(),
  formatDateRange: vi.fn(),
}));

vi.mock("grammy", () => {
  class Bot {
    api = {
      getChat: vi.fn(),
      sendPhoto: vi.fn(),
    };
  }
  class InputFile {
    constructor(public data: Buffer) {}
  }
  return { Bot, InputFile };
});

describe("Cron schedule tests", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSchedule.mockClear();
    mockTask.stop.mockClear();
    delete process.env.WEEKLY_DIGEST_ENABLED;
  });

  it("startScheduler registers a cron job without throwing", async () => {
    mockSchedule.mockReturnValue(mockTask);
    const { Bot } = await import("grammy");
    const { startScheduler } = await import("./scheduler.js");
    const bot = new Bot();

    expect(() => startScheduler(bot)).not.toThrow();
  });

  it("stopScheduler cancels job without throwing", async () => {
    mockSchedule.mockReturnValue(mockTask);
    const { Bot } = await import("grammy");
    const { startScheduler, stopScheduler } = await import("./scheduler.js");
    const bot = new Bot();

    startScheduler(bot);
    expect(() => stopScheduler()).not.toThrow();
    expect(mockTask.stop).toHaveBeenCalled();
  });

  it("stopScheduler when no job exists does not throw", async () => {
    const { stopScheduler } = await import("./scheduler.js");
    expect(() => stopScheduler()).not.toThrow();
  });

  it("cron.schedule called with '0 9 * * 1' and { timezone: 'UTC' }", async () => {
    mockSchedule.mockReturnValue(mockTask);
    const { Bot } = await import("grammy");
    const { startScheduler } = await import("./scheduler.js");
    const bot = new Bot();

    startScheduler(bot);

    expect(mockSchedule).toHaveBeenCalledWith(
      "0 9 * * 1",
      expect.any(Function),
      { timezone: "UTC" }
    );
  });
});

describe("Active chats query tests", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(":memory:");
    testDb.exec(`
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY,
        chat_id TEXT NOT NULL,
        date TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    testDb.close();
  });

  it("chat with message from 3 days ago is included", async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const dateStr = threeDaysAgo.toISOString().split("T")[0];

    testDb.prepare("INSERT INTO messages (chat_id, date) VALUES (?, ?)").run("-100123", dateStr);

    const { getActiveChatIds } = await import("./scheduler.js");
    const chatIds = getActiveChatIds(testDb);

    expect(chatIds).toContain("-100123");
  });

  it("chat with message from 8 days ago is excluded", async () => {
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
    const dateStr = eightDaysAgo.toISOString().split("T")[0];

    testDb.prepare("INSERT INTO messages (chat_id, date) VALUES (?, ?)").run("-100456", dateStr);

    const { getActiveChatIds } = await import("./scheduler.js");
    const chatIds = getActiveChatIds(testDb);

    expect(chatIds).not.toContain("-100456");
  });

  it("chat with no messages is excluded", async () => {
    const { getActiveChatIds } = await import("./scheduler.js");
    const chatIds = getActiveChatIds(testDb);

    expect(chatIds).toEqual([]);
  });

  it("multiple active chats all returned", async () => {
    const today = new Date().toISOString().split("T")[0];

    testDb.prepare("INSERT INTO messages (chat_id, date) VALUES (?, ?)").run("-100111", today);
    testDb.prepare("INSERT INTO messages (chat_id, date) VALUES (?, ?)").run("-100222", today);
    testDb.prepare("INSERT INTO messages (chat_id, date) VALUES (?, ?)").run("-100333", today);

    const { getActiveChatIds } = await import("./scheduler.js");
    const chatIds = getActiveChatIds(testDb);

    expect(chatIds).toContain("-100111");
    expect(chatIds).toContain("-100222");
    expect(chatIds).toContain("-100333");
    expect(chatIds.length).toBe(3);
  });

  it("duplicate chat_id produces only one entry (DISTINCT)", async () => {
    const today = new Date().toISOString().split("T")[0];

    testDb.prepare("INSERT INTO messages (chat_id, date) VALUES (?, ?)").run("-100999", today);
    testDb.prepare("INSERT INTO messages (chat_id, date) VALUES (?, ?)").run("-100999", today);
    testDb.prepare("INSERT INTO messages (chat_id, date) VALUES (?, ?)").run("-100999", today);

    const { getActiveChatIds } = await import("./scheduler.js");
    const chatIds = getActiveChatIds(testDb);

    expect(chatIds).toEqual(["-100999"]);
  });
});

describe("Digest generation tests", () => {
  let cronCallback: () => Promise<void>;
  let mockBot: any;
  let mockRenderer: any;
  let mockGetGroupSummary: any;
  let mockBuildMemberData: any;
  let mockFormatDateRange: any;
  let mockDb: any;

  beforeEach(async () => {
    vi.resetModules();
    mockSchedule.mockClear();
    mockTask.stop.mockClear();
    delete process.env.WEEKLY_DIGEST_ENABLED;

    // Capture the cron callback
    mockSchedule.mockImplementation((expr, callback, opts) => {
      cronCallback = callback;
      return mockTask;
    });

    const { Bot } = await import("grammy");
    mockBot = new Bot();
    mockBot.api.getChat.mockResolvedValue({ type: "supergroup", title: "Test Group" });
    mockBot.api.sendPhoto.mockResolvedValue({});

    const rendererMod = await import("../renderer/renderer.js");
    mockRenderer = rendererMod.renderer;
    mockRenderer.render.mockResolvedValue(Buffer.from("fake-image"));

    const statsMod = await import("../logic/stats.js");
    mockGetGroupSummary = statsMod.getGroupSummary;
    mockGetGroupSummary.mockReturnValue({ topMembers: [] });

    const cmdStatsMod = await import("../commands/stats.js");
    mockBuildMemberData = cmdStatsMod.buildMemberData;
    mockBuildMemberData.mockReturnValue({});
    mockFormatDateRange = cmdStatsMod.formatDateRange;
    mockFormatDateRange.mockReturnValue("Jan 1 – Dec 31, 2025");

    const dbMod = await import("../db/db.js");
    mockDb = dbMod.db;
    mockDb.prepare = vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue([]),
    });
  });

  it("renderer called for each active chat", async () => {
    mockDb.prepare.mockReturnValue({
      all: vi.fn().mockReturnValue([
        { chat_id: "-100111" },
        { chat_id: "-100222" },
      ]),
    });

    const { startScheduler } = await import("./scheduler.js");
    startScheduler(mockBot);

    await cronCallback();

    expect(mockRenderer.render).toHaveBeenCalledTimes(2);
  });

  it("bot.api.sendPhoto called with correct chatId", async () => {
    mockDb.prepare.mockReturnValue({
      all: vi.fn().mockReturnValue([{ chat_id: "-100777" }]),
    });

    const { startScheduler } = await import("./scheduler.js");
    startScheduler(mockBot);

    await cronCallback();

    expect(mockBot.api.sendPhoto).toHaveBeenCalledWith(
      "-100777",
      expect.any(Object),
      expect.objectContaining({ caption: expect.any(String) })
    );
  });

  it("caption matches 'Thread — weekly recap · [date] – [date]'", async () => {
    mockDb.prepare.mockReturnValue({
      all: vi.fn().mockReturnValue([{ chat_id: "-100888" }]),
    });

    const { startScheduler } = await import("./scheduler.js");
    startScheduler(mockBot);

    await cronCallback();

    const call = mockBot.api.sendPhoto.mock.calls[0];
    expect(call[2].caption).toMatch(/^Thread — weekly recap · .+ – .+$/);
  });

  it("renderer error for one chat doesn't block others", async () => {
    mockRenderer.render
      .mockRejectedValueOnce(new Error("Render failed"))
      .mockResolvedValueOnce(Buffer.from("image-2"));

    mockDb.prepare.mockReturnValue({
      all: vi.fn().mockReturnValue([
        { chat_id: "-100001" },
        { chat_id: "-100002" },
      ]),
    });

    const { startScheduler } = await import("./scheduler.js");
    startScheduler(mockBot);

    await cronCallback();

    // First chat failed, second succeeded
    expect(mockBot.api.sendPhoto).toHaveBeenCalledTimes(1);
    expect(mockBot.api.sendPhoto).toHaveBeenCalledWith(
      "-100002",
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("sendPhoto error for one chat doesn't block others", async () => {
    mockBot.api.sendPhoto
      .mockRejectedValueOnce(new Error("Send failed"))
      .mockResolvedValueOnce({});

    mockDb.prepare.mockReturnValue({
      all: vi.fn().mockReturnValue([
        { chat_id: "-100003" },
        { chat_id: "-100004" },
      ]),
    });

    const { startScheduler } = await import("./scheduler.js");
    startScheduler(mockBot);

    await cronCallback();

    expect(mockBot.api.sendPhoto).toHaveBeenCalledTimes(2);
  });
});

describe("WEEKLY_DIGEST_ENABLED tests", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSchedule.mockClear();
    mockTask.stop.mockClear();
    mockSchedule.mockReturnValue(mockTask);
  });

  it("false → no cron job registered", async () => {
    process.env.WEEKLY_DIGEST_ENABLED = "false";

    const { Bot } = await import("grammy");
    const { startScheduler } = await import("./scheduler.js");
    const bot = new Bot();

    startScheduler(bot);

    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("true → cron job registered", async () => {
    process.env.WEEKLY_DIGEST_ENABLED = "true";

    const { Bot } = await import("grammy");
    const { startScheduler } = await import("./scheduler.js");
    const bot = new Bot();

    startScheduler(bot);

    expect(mockSchedule).toHaveBeenCalled();
  });

  it("unset (default) → cron job registered", async () => {
    delete process.env.WEEKLY_DIGEST_ENABLED;

    const { Bot } = await import("grammy");
    const { startScheduler } = await import("./scheduler.js");
    const bot = new Bot();

    startScheduler(bot);

    expect(mockSchedule).toHaveBeenCalled();
  });
});
