import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

// Mock dependencies
vi.mock("../db/db.js", () => ({
  getDbInstance: vi.fn(),
}));

vi.mock("../logic/stats.js", () => ({
  getGroupSummary: vi.fn(),
  getBatchDailyCountsForUsers: vi.fn(),
  computeStreaks: vi.fn(),
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

import { getDbInstance } from "../db/db.js";
import { getGroupSummary, getBatchDailyCountsForUsers, computeStreaks } from "../logic/stats.js";
import { renderer } from "../renderer/renderer.js";
import { buildMemberData, formatDateRange } from "../commands/stats.js";

const mockGetDbInstance = getDbInstance as ReturnType<typeof vi.fn>;
const mockGetGroupSummary = getGroupSummary as ReturnType<typeof vi.fn>;
const mockGetBatchDailyCounts = getBatchDailyCountsForUsers as ReturnType<typeof vi.fn>;
const mockComputeStreaks = computeStreaks as ReturnType<typeof vi.fn>;
const mockRender = renderer.render as ReturnType<typeof vi.fn>;
const mockBuildMemberData = buildMemberData as ReturnType<typeof vi.fn>;
const mockFormatDateRange = formatDateRange as ReturnType<typeof vi.fn>;

describe("Active chats query tests", () => {
  let mockClient: Client;

  beforeEach(async () => {
    mockClient = {
      execute: vi.fn(),
      close: vi.fn(),
    } as unknown as Client;
    mockGetDbInstance.mockResolvedValue(mockClient);
  });

  it("chat with message from 3 days ago is included", async () => {
    (mockClient.execute as any).mockResolvedValue({
      rows: [{ chat_id: "-100123" }],
      columns: ["chat_id"],
    });

    const { getActiveChatIds } = await import("./scheduler.js");
    const chatIds = await getActiveChatIds();

    expect(chatIds).toContain("-100123");
  });

  it("chat with no messages is excluded", async () => {
    (mockClient.execute as any).mockResolvedValue({
      rows: [],
      columns: ["chat_id"],
    });

    const { getActiveChatIds } = await import("./scheduler.js");
    const chatIds = await getActiveChatIds();

    expect(chatIds).toEqual([]);
  });

  it("multiple active chats all returned", async () => {
    (mockClient.execute as any).mockResolvedValue({
      rows: [
        { chat_id: "-100111" },
        { chat_id: "-100222" },
        { chat_id: "-100333" },
      ],
      columns: ["chat_id"],
    });

    const { getActiveChatIds } = await import("./scheduler.js");
    const chatIds = await getActiveChatIds();

    expect(chatIds).toContain("-100111");
    expect(chatIds).toContain("-100222");
    expect(chatIds).toContain("-100333");
    expect(chatIds.length).toBe(3);
  });

  it("duplicate chat_id produces only one entry (DISTINCT)", async () => {
    (mockClient.execute as any).mockResolvedValue({
      rows: [{ chat_id: "-100999" }],
      columns: ["chat_id"],
    });

    const { getActiveChatIds } = await import("./scheduler.js");
    const chatIds = await getActiveChatIds();

    expect(chatIds).toEqual(["-100999"]);
  });
});

describe("Weekly digest functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockClient = {
      execute: vi.fn().mockResolvedValue({ rows: [], columns: [] }),
      close: vi.fn(),
    } as unknown as Client;
    mockGetDbInstance.mockResolvedValue(mockClient);

    mockGetGroupSummary.mockResolvedValue({ topMembers: [] });
    mockGetBatchDailyCounts.mockResolvedValue(new Map());
    mockComputeStreaks.mockReturnValue({ current: 0, longest: 0 });
    mockBuildMemberData.mockReturnValue({});
    mockFormatDateRange.mockReturnValue("Jan 1 – Dec 31, 2025");
    mockRender.mockResolvedValue(Buffer.from("fake-image"));

    process.env.TELEGRAM_BOT_TOKEN = "test-token";
  });

  it("respects WEEKLY_DIGEST_ENABLED=false", async () => {
    process.env.WEEKLY_DIGEST_ENABLED = "false";

    const { runWeeklyDigest } = await import("./scheduler.js");
    await runWeeklyDigest();

    // Should not call renderer when disabled
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("runs digest when WEEKLY_DIGEST_ENABLED is unset (default true)", async () => {
    delete process.env.WEEKLY_DIGEST_ENABLED;

    const mockClient = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ chat_id: "-100111" }],
        columns: ["chat_id"],
      }),
      close: vi.fn(),
    } as unknown as Client;
    mockGetDbInstance.mockResolvedValue(mockClient);

    const { runWeeklyDigest } = await import("./scheduler.js");
    await runWeeklyDigest();

    expect(mockRender).toHaveBeenCalled();
  });
});
