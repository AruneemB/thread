import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("grammy", () => {
  class Composer {
    private handlers: Record<string, Function> = {};
    private callbacks: Record<string, Function> = {};
    command(name: string, handler: Function) {
      this.handlers[name] = handler;
    }
    callbackQuery(data: string, handler: Function) {
      this.callbacks[data] = handler;
    }
    _getHandler(name: string) {
      return this.handlers[name];
    }
    _getCallback(data: string) {
      return this.callbacks[data];
    }
  }
  class InlineKeyboard {
    buttons: any[] = [];
    text(text: string, data: string) {
      this.buttons.push({ text, callback_data: data });
      return this;
    }
    row() { return this; }
    url(text: string, url: string) {
      this.buttons.push({ text, url });
      return this;
    }
  }
  return { Composer, InlineKeyboard };
});

import { tldrComposer } from "./tldr.js";

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    chat: { id: -100123, title: "Test Group" },
    from: { id: 42, first_name: "Test User" },
    reply: vi.fn(),
    answerCallbackQuery: vi.fn(),
    ...overrides,
  };
}

describe("/tldr command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("replies with summary and disclaimers", async () => {
    const ctx = makeCtx();
    const handler = (tldrComposer as any)._getHandler("tldr");
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0];
    expect(text).toContain("Thread");
    expect(text).toContain("heatmaps");
    expect(text).toContain("*after* it was added");
    expect(text).toContain("Export your Telegram chat history");
  });

  it("includes an inline keyboard with correct buttons", async () => {
    const ctx = makeCtx();
    const handler = (tldrComposer as any)._getHandler("tldr");
    await handler(ctx);

    const options = ctx.reply.mock.calls[0][1];
    expect(options.reply_markup).toBeDefined();
    const buttons = options.reply_markup.buttons;
    expect(buttons).toContainEqual(expect.objectContaining({ text: "📊 Group Stats", callback_data: "cmd_stats" }));
    expect(buttons).toContainEqual(expect.objectContaining({ text: "👤 My Stats", callback_data: "cmd_mystats" }));
    expect(buttons).toContainEqual(expect.objectContaining({ text: "🌐 Visit Website", url: expect.any(String) }));
  });

  it("handles cmd_stats callback query", async () => {
    const ctx = makeCtx();
    const callback = (tldrComposer as any)._getCallback("cmd_stats");
    await callback(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("/stats"),
      show_alert: true,
    }));
  });

  it("handles cmd_mystats callback query", async () => {
    const ctx = makeCtx();
    const callback = (tldrComposer as any)._getCallback("cmd_mystats");
    await callback(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("/mystats"),
      show_alert: true,
    }));
  });
});
