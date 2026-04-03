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

vi.mock("../db/db.js", () => ({
  getMemberByUsername: vi.fn(),
  getCooldown: vi.fn(),
  setCooldown: vi.fn(),
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
import { getMemberByUsername, getCooldown, setCooldown } from "../db/db.js";
import { statsComposer, getCooldownMs, buildCells, buildMemberData, avatarColorFromId, initialsFrom } from "./stats.js";

const mockGetGroupSummary = getGroupSummary as ReturnType<typeof vi.fn>;
const mockGetDailyCounts = getDailyCountsForUser as ReturnType<typeof vi.fn>;
const mockComputeStreaks = computeStreaks as ReturnType<typeof vi.fn>;
const mockGetTotalMessages = getTotalMessages as ReturnType<typeof vi.fn>;
const mockRender = renderer.render as ReturnType<typeof vi.fn>;
const mockGetMemberByUsername = getMemberByUsername as ReturnType<typeof vi.fn>;
const mockGetCooldown = getCooldown as ReturnType<typeof vi.fn>;
const mockSetCooldown = setCooldown as ReturnType<typeof vi.fn>;

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    chat: { id: -100123, title: "Test Group", ...(overrides.chat as Record<string, unknown> ?? {}) },
    match: overrides.match ?? "",
    from: overrides.from ?? { id: 42, first_name: "Test User" },
    reply: vi.fn(),
    replyWithPhoto: vi.fn(),
  };
}

function getHandler(name = "stats") {
  return (statsComposer as any)._getHandler(name);
}

function setupDefaultMocks(memberCount = 2) {
  const members = Array.from({ length: memberCount }, (_, i) => ({
    user_id: String(100 + i),
    first_name: `User ${i}`,
    username: `user${i}`,
    totalCount: (memberCount - i) * 100,
  }));
  mockGetGroupSummary.mockResolvedValue({
    totalMessages: members.reduce((s, m) => s + m.totalCount, 0),
    activeDays: 30,
    topMembers: members,
  });
  mockGetDailyCounts.mockResolvedValue(new Map<string, number>());
  mockComputeStreaks.mockReturnValue({ current: 3, longest: 10 });
  mockGetTotalMessages.mockImplementation(async (_chatId: string, userId: string) => {
    const m = members.find(x => x.user_id === userId);
    return m ? m.totalCount : 0;
  });
  mockRender.mockResolvedValue(Buffer.from("fake-png"));
  mockGetCooldown.mockResolvedValue(null);
  mockSetCooldown.mockResolvedValue(undefined);
}

describe("/stats command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STATS_COOLDOWN_SECONDS;
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      mockGetCooldown.mockResolvedValueOnce(null);
      const ctx1 = makeCtx();
      await getHandler()(ctx1);

      // Mock cooldown active for second call
      const futureTime = new Date(Date.now() + 300000).toISOString();
      mockGetCooldown.mockResolvedValueOnce(futureTime);
      const ctx2 = makeCtx();
      await getHandler()(ctx2);
      expect(ctx2.reply).toHaveBeenCalledWith(expect.stringContaining("cooldown"));
      expect(ctx2.replyWithPhoto).not.toHaveBeenCalled();
    });

    it("rejection message includes remaining time", async () => {
      setupDefaultMocks();
      mockGetCooldown.mockResolvedValueOnce(null);
      const ctx1 = makeCtx();
      await getHandler()(ctx1);

      const futureTime = new Date(Date.now() + 300000).toISOString();
      mockGetCooldown.mockResolvedValueOnce(futureTime);
      const ctx2 = makeCtx();
      await getHandler()(ctx2);
      const msg = ctx2.reply.mock.calls[0][0] as string;
      expect(msg).toMatch(/\d+/);
    });

    it("succeeds after cooldown elapses", async () => {
      setupDefaultMocks();
      mockGetCooldown.mockResolvedValueOnce(null);
      const ctx1 = makeCtx();
      await getHandler()(ctx1);

      // Mock expired cooldown
      const pastTime = new Date(Date.now() - 601000).toISOString();
      mockGetCooldown.mockResolvedValueOnce(pastTime);
      const ctx2 = makeCtx();
      await getHandler()(ctx2);
      expect(ctx2.replyWithPhoto).toHaveBeenCalled();
    });

    it("per-chat isolation: chat A cooldown does not affect chat B", async () => {
      setupDefaultMocks();
      mockGetCooldown.mockResolvedValue(null);
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
      expect(mockSetCooldown).not.toHaveBeenCalled();
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
    expect(futureCount).toBeGreaterThanOrEqual(0);
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

describe("/stats @username", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STATS_COOLDOWN_SECONDS;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses username from @alice", async () => {
    setupDefaultMocks();
    mockGetMemberByUsername.mockResolvedValue({ user_id: "200", first_name: "Alice" });
    const ctx = makeCtx({ match: "@alice" });
    await getHandler()(ctx);
    expect(mockGetMemberByUsername).toHaveBeenCalledWith("-100123", "alice");
  });

  it("parses username with extra space", async () => {
    setupDefaultMocks();
    mockGetMemberByUsername.mockResolvedValue({ user_id: "200", first_name: "Alice" });
    const ctx = makeCtx({ match: "  @alice  " });
    await getHandler()(ctx);
    expect(mockGetMemberByUsername).toHaveBeenCalledWith("-100123", "alice");
  });

  it("preserves original casing for DB lookup", async () => {
    setupDefaultMocks();
    mockGetMemberByUsername.mockResolvedValue({ user_id: "200", first_name: "Alice" });
    const ctx = makeCtx({ match: "@Alice" });
    await getHandler()(ctx);
    expect(mockGetMemberByUsername).toHaveBeenCalledWith("-100123", "Alice");
  });

  it("renders single-member dashboard for known user", async () => {
    setupDefaultMocks();
    mockGetMemberByUsername.mockResolvedValue({ user_id: "200", first_name: "Alice" });
    mockGetTotalMessages.mockResolvedValue(50);
    const ctx = makeCtx({ match: "@alice" });
    await getHandler()(ctx);
    expect(mockRender).toHaveBeenCalledTimes(1);
    const data = mockRender.mock.calls[0][0];
    expect(data.members).toHaveLength(1);
    expect(data.members[0].displayName).toBe("Alice");
  });

  it("replies with not-found message for unknown user", async () => {
    setupDefaultMocks();
    mockGetMemberByUsername.mockResolvedValue(null);
    const ctx = makeCtx({ match: "@unknown" });
    await getHandler()(ctx);
    expect(ctx.reply).toHaveBeenCalledWith("I don't have any data for @unknown yet.");
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("single-member DashboardData has exactly 1 entry in members[]", async () => {
    setupDefaultMocks();
    mockGetMemberByUsername.mockResolvedValue({ user_id: "200", first_name: "Alice" });
    mockGetTotalMessages.mockResolvedValue(50);
    const ctx = makeCtx({ match: "@alice" });
    await getHandler()(ctx);
    const data = mockRender.mock.calls[0][0];
    expect(data.members.length).toBe(1);
  });

  it("shares cooldown with /stats (same chat, same timer)", async () => {
    setupDefaultMocks();
    mockGetMemberByUsername.mockResolvedValue({ user_id: "200", first_name: "Alice" });
    mockGetTotalMessages.mockResolvedValue(50);
    mockGetCooldown.mockResolvedValueOnce(null);

    const ctx1 = makeCtx({ match: "@alice" });
    await getHandler()(ctx1);
    expect(ctx1.replyWithPhoto).toHaveBeenCalled();

    // Mock active cooldown
    const futureTime = new Date(Date.now() + 300000).toISOString();
    mockGetCooldown.mockResolvedValueOnce(futureTime);
    const ctx2 = makeCtx();
    await getHandler()(ctx2);
    expect(ctx2.reply).toHaveBeenCalledWith(expect.stringContaining("cooldown"));
  });
});

describe("/threadhelp command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replies with a text message", async () => {
    const ctx = makeCtx();
    await getHandler("threadhelp")(ctx);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.replyWithPhoto).not.toHaveBeenCalled();
  });

  it("response contains /stats", async () => {
    const ctx = makeCtx();
    await getHandler("threadhelp")(ctx);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain("/stats");
  });

  it("response contains /stats @username", async () => {
    const ctx = makeCtx();
    await getHandler("threadhelp")(ctx);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain("/stats @username");
  });

  it("response contains /mystats", async () => {
    const ctx = makeCtx();
    await getHandler("threadhelp")(ctx);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain("/mystats");
  });

  it("response contains /threadhelp", async () => {
    const ctx = makeCtx();
    await getHandler("threadhelp")(ctx);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain("/threadhelp");
  });

  it("each command has a brief description", async () => {
    const ctx = makeCtx();
    await getHandler("threadhelp")(ctx);
    const text = ctx.reply.mock.calls[0][0] as string;
    const lines = text.split("\n").filter((l: string) => l.trim().length > 0);
    for (const line of lines) {
      expect(line).toMatch(/^\/\S+.*—.+/);
    }
  });
});
