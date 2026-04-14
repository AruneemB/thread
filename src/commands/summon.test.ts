import { describe, it, expect, vi, beforeEach } from "vitest";

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
  return { Composer };
});

import { summonComposer } from "./summon.js";

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    chat: { id: -100123, title: "Test Group", type: "supergroup", ...overrides.chat },
    from: overrides.from ?? { id: 42, first_name: "Test User" },
    getChatAdministrators: vi.fn(),
    reply: vi.fn(),
    ...overrides,
  };
}

function getHandler() {
  return (summonComposer as any)._getHandler("summon");
}

describe("/summon command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fail in private chats", async () => {
    const ctx = makeCtx({ chat: { type: "private" } });
    const handler = getHandler();
    await handler(ctx);
    expect(ctx.reply).toHaveBeenCalledWith("This command only works in groups!");
  });

  it("should ping all human admins with usernames", async () => {
    const ctx = makeCtx();
    ctx.getChatAdministrators.mockResolvedValue([
      { user: { id: 1, first_name: "Admin1", username: "admin1", is_bot: false } },
      { user: { id: 2, first_name: "Admin2", username: "admin2", is_bot: false } },
      { user: { id: 3, first_name: "Bot1", username: "bot1", is_bot: true } },
    ]);

    const handler = getHandler();
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("@admin1 @admin2"),
      expect.objectContaining({ parse_mode: "MarkdownV2" })
    );
    expect(ctx.reply).not.toContain("@bot1");
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Pinging the admins\\.\\.\\."),
      expect.anything()
    );
  });

  it("should use markdown mentions for admins without usernames", async () => {
    const ctx = makeCtx();
    ctx.getChatAdministrators.mockResolvedValue([
      { user: { id: 1, first_name: "NoUsername", is_bot: false } },
    ]);

    const handler = getHandler();
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("[NoUsername](tg://user?id=1)"),
      expect.objectContaining({ parse_mode: "MarkdownV2" })
    );
  });

  it("should handle case with no human admins", async () => {
    const ctx = makeCtx();
    ctx.getChatAdministrators.mockResolvedValue([
      { user: { id: 3, first_name: "Bot1", username: "bot1", is_bot: true } },
    ]);

    const handler = getHandler();
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith("No human admins found to summon!");
  });

  it("should handle API errors gracefully", async () => {
    const ctx = makeCtx();
    ctx.getChatAdministrators.mockRejectedValue(new Error("API Error"));

    const handler = getHandler();
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Failed to summon the council. Ensure I have the necessary group permissions."
    );
  });
});
