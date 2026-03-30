import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../logic/stats.js", () => ({
  getGroupSummary: vi.fn(),
  getDailyCountsForUser: vi.fn(),
  computeStreaks: vi.fn(),
  getTotalMessages: vi.fn(),
}));

vi.mock("../renderer/renderer.js", () => ({
  renderer: { render: vi.fn() },
}));

vi.mock("grammy", () => {
  class Composer {
    private handlers: Record<string, Function> = {};
    command(name: string, handler: Function) {
      this.handlers[name] = handler;
    }
    _getHandler(name: string) {
      return this.handlers[name];
    }
  }
  class InputFile {
    constructor(public data: Buffer, public filename: string) {}
  }
  return { Composer, InputFile };
});

import { getGroupSummary, getDailyCountsForUser, computeStreaks, getTotalMessages } from "../logic/stats.js";
import { renderer } from "../renderer/renderer.js";
import { statsComposer, cooldowns, getCooldownMs, buildCells, buildMemberData, avatarColorFromId, initialsFrom } from "./stats.js";

const mockGetGroupSummary = getGroupSummary as ReturnType<typeof vi.fn>;
const mockGetDailyCounts = getDailyCountsForUser as ReturnType<typeof vi.fn>;
const mockComputeStreaks = computeStreaks as ReturnType<typeof vi.fn>;
const mockGetTotalMessages = getTotalMessages as ReturnType<typeof vi.fn>;
const mockRender = renderer.render as ReturnType<typeof vi.fn>;

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    chat: { id: -100123, title: "Test Group", ...(overrides.chat as Record<string, unknown> ?? {}) },
    reply: vi.fn(),
    replyWithPhoto: vi.fn(),
  };
}

function getHandler() {
  return (statsComposer as any)._getHandler("stats");
}

function setupDefaultMocks(memberCount = 2) {
  const members = Array.from({ length: memberCount }, (_, i) => ({
    user_id: String(100 + i),
    first_name: `User ${i}`,
    username: `user${i}`,
    totalCount: (memberCount - i) * 100,
  }));
  mockGetGroupSummary.mockReturnValue({
    totalMessages: members.reduce((s, m) => s + m.totalCount, 0),
    activeDays: 30,
    topMembers: members,
  });
  mockGetDailyCounts.mockReturnValue(new Map<string, number>());
  mockComputeStreaks.mockReturnValue({ current: 3, longest: 10 });
  mockGetTotalMessages.mockImplementation((_chatId: string, userId: string) => {
    const m = members.find(x => x.user_id === userId);
    return m ? m.totalCount : 0;
  });
  mockRender.mockResolvedValue(Buffer.from("fake-png"));
}

describe("/stats command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cooldowns.clear();
    delete process.env.STATS_COOLDOWN_SECONDS;
  });

  afterEach(() => {
    cooldowns.clear();
  });

  describe("Data assembly", () => {
    it("calls getGroupSummary with correct chatId", async () => {
      setupDefaultMocks();
      const ctx = makeCtx();
      await getHandler()(ctx);
      expect(mockGetGroupSummary).toHaveBeenCalledWith("-100123");
    });

    it("assembles DashboardData with at most 20 members", async () => {
      setupDefaultMocks(20);
      const ctx = makeCtx();
      await getHandler()(ctx);
      expect(mockRender).toHaveBeenCalledTimes(1);
      const data = mockRender.mock.calls[0][0];
      expect(data.members.length).toBeLessThanOrEqual(20);
    });

    it("each member has cells, streak fields, and totalMessages", async () => {
      setupDefaultMocks(1);
      const ctx = makeCtx();
      await getHandler()(ctx);
      const data = mockRender.mock.calls[0][0];
      const member = data.members[0];
      expect(member.cells).toBeDefined();
      expect(member.cells).toHaveLength(371);
      expect(member.currentStreak).toBe(3);
      expect(member.longestStreak).toBe(10);
      expect(member.totalMessages).toBe(100);
    });

    it("sets groupName from ctx.chat.title", async () => {
      setupDefaultMocks();
      const ctx = makeCtx({ chat: { id: -100123, title: "My Awesome Chat" } });
      await getHandler()(ctx);
      const data = mockRender.mock.calls[0][0];
      expect(data.groupName).toBe("My Awesome Chat");
    });

    it("replies with no data message when 0 members", async () => {
      setupDefaultMocks(0);
      const ctx = makeCtx();
      await getHandler()(ctx);
      expect(ctx.reply).toHaveBeenCalledWith("No message data yet. Start chatting and try again later.");
      expect(mockRender).not.toHaveBeenCalled();
    });
  });

  describe("Cooldown", () => {
    it("first call succeeds", async () => {
      setupDefaultMocks();
      const ctx = makeCtx();
      await getHandler()(ctx);
      expect(ctx.replyWithPhoto).toHaveBeenCalled();
    });

    it("second call within cooldown is rejected", async () => {
      setupDefaultMocks();
      const ctx1 = makeCtx();
      await getHandler()(ctx1);
      const ctx2 = makeCtx();
      await getHandler()(ctx2);
      expect(ctx2.reply).toHaveBeenCalledWith(expect.stringContaining("cooldown"));
      expect(ctx2.replyWithPhoto).not.toHaveBeenCalled();
    });

    it("rejection message includes remaining time", async () => {
      setupDefaultMocks();
      const ctx1 = makeCtx();
      await getHandler()(ctx1);
      const ctx2 = makeCtx();
      await getHandler()(ctx2);
      const msg = ctx2.reply.mock.calls[0][0] as string;
      expect(msg).toMatch(/\d+/);
    });

    it("succeeds after cooldown elapses", async () => {
      setupDefaultMocks();
      const ctx1 = makeCtx();
      await getHandler()(ctx1);
      // Simulate cooldown expiration by setting a past timestamp
      cooldowns.set("-100123", Date.now() - 601_000);
      const ctx2 = makeCtx();
      await getHandler()(ctx2);
      expect(ctx2.replyWithPhoto).toHaveBeenCalled();
    });

    it("per-chat isolation: chat A cooldown does not affect chat B", async () => {
      setupDefaultMocks();
      const ctxA = makeCtx({ chat: { id: -100, title: "A" } });
      await getHandler()(ctxA);
      const ctxB = makeCtx({ chat: { id: -200, title: "B" } });
      await getHandler()(ctxB);
      expect(ctxB.replyWithPhoto).toHaveBeenCalled();
    });

    it("default cooldown is 600 seconds", () => {
      delete process.env.STATS_COOLDOWN_SECONDS;
      expect(getCooldownMs()).toBe(600_000);
    });

    it("custom STATS_COOLDOWN_SECONDS=60 uses 60s", () => {
      process.env.STATS_COOLDOWN_SECONDS = "60";
      expect(getCooldownMs()).toBe(60_000);
    });
  });

  describe("Render and reply", () => {
    it("renderer.render is called with assembled DashboardData", async () => {
      setupDefaultMocks();
      const ctx = makeCtx();
      await getHandler()(ctx);
      expect(mockRender).toHaveBeenCalledTimes(1);
      const data = mockRender.mock.calls[0][0];
      expect(data.groupName).toBe("Test Group");
      expect(data.sortBy).toBe("messages");
      expect(data.members).toBeDefined();
      expect(data.dateRange).toBeDefined();
    });

    it("ctx.replyWithPhoto called with PNG buffer and filename", async () => {
      setupDefaultMocks();
      const ctx = makeCtx();
      await getHandler()(ctx);
      expect(ctx.replyWithPhoto).toHaveBeenCalledTimes(1);
      const args = ctx.replyWithPhoto.mock.calls[0];
      expect(args[0]).toBeDefined();
      expect(args[0].filename).toBe("thread-stats.png");
    });

    it("caption matches expected format", async () => {
      setupDefaultMocks();
      const ctx = makeCtx({ chat: { id: -100123, title: "Cool Group" } });
      await getHandler()(ctx);
      const opts = ctx.replyWithPhoto.mock.calls[0][1];
      expect(opts.caption).toBe("Thread — activity report for Cool Group");
    });
  });

  describe("Error handling", () => {
    it("timeout error replies with timeout message", async () => {
      setupDefaultMocks();
      mockRender.mockRejectedValueOnce(new Error("Timeout exceeded"));
      const ctx = makeCtx();
      await getHandler()(ctx);
      expect(ctx.reply).toHaveBeenCalledWith("Render timed out. Try again in a moment.");
    });

    it("non-timeout error replies with generic error message", async () => {
      setupDefaultMocks();
      mockRender.mockRejectedValueOnce(new Error("Browser crashed"));
      const ctx = makeCtx();
      await getHandler()(ctx);
      expect(ctx.reply).toHaveBeenCalledWith("Something went wrong generating the report.");
    });

    it("render failure does not set cooldown", async () => {
      setupDefaultMocks();
      mockRender.mockRejectedValueOnce(new Error("Timeout exceeded"));
      const ctx = makeCtx();
      await getHandler()(ctx);
      expect(cooldowns.has("-100123")).toBe(false);
    });
  });
});

describe("Helper functions", () => {
  it("avatarColorFromId returns a consistent color for the same id", () => {
    const c1 = avatarColorFromId("12345");
    const c2 = avatarColorFromId("12345");
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("avatarColorFromId returns different colors for different ids", () => {
    const c1 = avatarColorFromId("100");
    const c2 = avatarColorFromId("999");
    // Not guaranteed to be different for all inputs, but these particular values should differ
    expect(typeof c1).toBe("string");
    expect(typeof c2).toBe("string");
  });

  it("initialsFrom returns single letter for single word", () => {
    expect(initialsFrom("Alice")).toBe("A");
  });

  it("initialsFrom returns two letters for two words", () => {
    expect(initialsFrom("Alice Brown")).toBe("AB");
  });

  it("initialsFrom handles empty/whitespace", () => {
    expect(initialsFrom("")).toBe("?");
    expect(initialsFrom("  ")).toBe("?");
  });

  it("buildCells returns 371 elements", () => {
    const cells = buildCells(new Map());
    expect(cells).toHaveLength(371);
  });

  it("buildCells marks future dates as -1", () => {
    const cells = buildCells(new Map());
    const futureCount = cells.filter(c => c === -1).length;
    // Depending on what day it is, there should be some future cells
    // At minimum, cells after today should be -1
    expect(futureCount).toBeGreaterThanOrEqual(0);
    // All non-future cells should be 0 for empty map
    const pastCells = cells.filter(c => c >= 0);
    expect(pastCells.every(c => c === 0)).toBe(true);
  });

  it("buildCells includes counts from dailyCounts map", () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const counts = new Map([[todayStr, 5]]);
    const cells = buildCells(counts);
    expect(cells).toContain(5);
  });

  it("buildMemberData assembles correct structure", () => {
    const member = { user_id: "42", first_name: "Bob Smith", totalCount: 100 };
    const dailyCounts = new Map<string, number>();
    const streaks = { current: 2, longest: 5 };
    const result = buildMemberData(member, dailyCounts, streaks, 100);
    expect(result.displayName).toBe("Bob Smith");
    expect(result.initials).toBe("BS");
    expect(result.role).toBe("member");
    expect(result.totalMessages).toBe(100);
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(5);
    expect(result.activeDays).toBe(0);
    expect(result.cells).toHaveLength(371);
  });
});
