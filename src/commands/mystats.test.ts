import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logic/stats.js", () => ({
  getDailyCountsForUser: vi.fn(),
  computeStreaks: vi.fn(),
  getTotalMessages: vi.fn(),
}));

vi.mock("../renderer/renderer.js", () => ({
  renderer: { render: vi.fn() },
}));

vi.mock("./stats.js", () => ({
  buildMemberData: vi.fn(),
  formatDateRange: vi.fn(),
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

import { getDailyCountsForUser, computeStreaks, getTotalMessages } from "../logic/stats.js";
import { renderer } from "../renderer/renderer.js";
import { buildMemberData, formatDateRange } from "./stats.js";
import { mystatsComposer } from "./mystats.js";

const mockGetDailyCounts = getDailyCountsForUser as ReturnType<typeof vi.fn>;
const mockComputeStreaks = computeStreaks as ReturnType<typeof vi.fn>;
const mockGetTotalMessages = getTotalMessages as ReturnType<typeof vi.fn>;
const mockRender = renderer.render as ReturnType<typeof vi.fn>;
const mockBuildMemberData = buildMemberData as ReturnType<typeof vi.fn>;
const mockFormatDateRange = formatDateRange as ReturnType<typeof vi.fn>;

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    chat: { id: -100123, title: "Test Group", ...(overrides.chat as Record<string, unknown> ?? {}) },
    from: overrides.from ?? { id: 42, first_name: "Test User" },
    reply: vi.fn(),
    replyWithChatAction: vi.fn(),
    api: {
      sendPhoto: vi.fn(),
      ...(overrides.api as Record<string, unknown> ?? {}),
    },
  };
}

function getHandler() {
  return (mystatsComposer as any)._getHandler("mystats");
}

function setupDefaultMocks() {
  mockGetTotalMessages.mockResolvedValue(100);
  mockGetDailyCounts.mockResolvedValue(new Map<string, number>());
  mockComputeStreaks.mockReturnValue({ current: 3, longest: 10 });
  mockBuildMemberData.mockReturnValue({
    displayName: "Test User",
    initials: "TU",
    avatarColor: "#e57373",
    role: "member",
    totalMessages: 100,
    currentStreak: 3,
    longestStreak: 10,
    activeDays: 5,
    cells: new Array(371).fill(0),
  });
  mockFormatDateRange.mockReturnValue("Mar 2025 – Mar 2026");
  mockRender.mockResolvedValue(Buffer.from("fake-png"));
}

describe("/mystats command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses ctx.from.id as the user_id for stats lookup", async () => {
    setupDefaultMocks();
    const ctx = makeCtx({ from: { id: 555, first_name: "Alice" } });
    await getHandler()(ctx);
    expect(mockGetTotalMessages).toHaveBeenCalledWith("-100123", "555");
  });

  it("stats are scoped to the current chat_id", async () => {
    setupDefaultMocks();
    const ctx = makeCtx({ chat: { id: -999, title: "Other Chat" } });
    await getHandler()(ctx);
    expect(mockGetTotalMessages).toHaveBeenCalledWith("-999", "42");
  });

  it("sends PNG via ctx.api.sendPhoto to user DM", async () => {
    setupDefaultMocks();
    const ctx = makeCtx();
    await getHandler()(ctx);
    expect(ctx.api.sendPhoto).toHaveBeenCalledTimes(1);
    const args = ctx.api.sendPhoto.mock.calls[0];
    expect(args[0]).toBe(42); // ctx.from.id
  });

  it("replies with fallback when bot cannot DM (Forbidden)", async () => {
    setupDefaultMocks();
    const ctx = makeCtx();
    ctx.api.sendPhoto.mockRejectedValueOnce(new Error("Forbidden: bot can't initiate conversation"));
    await getHandler()(ctx);
    expect(ctx.reply).toHaveBeenCalledWith("Send me a DM first so I can reply privately.");
  });

  it("replies with no-data message when user has no stats", async () => {
    setupDefaultMocks();
    mockGetTotalMessages.mockResolvedValue(0);
    const ctx = makeCtx();
    await getHandler()(ctx);
    expect(ctx.reply).toHaveBeenCalledWith("I don't have any stats for you in this chat yet.");
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("does not trigger or respect /stats cooldown", async () => {
    setupDefaultMocks();
    // Call mystats twice in a row — both should succeed
    const ctx1 = makeCtx();
    await getHandler()(ctx1);
    expect(ctx1.api.sendPhoto).toHaveBeenCalled();

    const ctx2 = makeCtx();
    await getHandler()(ctx2);
    expect(ctx2.api.sendPhoto).toHaveBeenCalled();
  });
});
