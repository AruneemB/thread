import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("grammy", () => {
  class Bot {
    start = vi.fn();
    stop = vi.fn();
    on = vi.fn();
    command = vi.fn();
    use = vi.fn();
  }
  class Composer {
    command = vi.fn();
    callbackQuery = vi.fn();
  }
  class InputFile {
    constructor(public data: Buffer, public filename: string) {}
  }
  return { Bot, Composer, InputFile };
});

vi.mock("./middleware.js", () => ({ registerMessageHandler: vi.fn() }));

vi.mock("../commands/stats.js", () => ({
  statsComposer: { middleware: vi.fn() },
}));

vi.mock("../commands/mystats.js", () => ({
  mystatsComposer: { middleware: vi.fn() },
}));

vi.mock("../commands/tldr.js", () => ({
  tldrComposer: { middleware: vi.fn() },
}));

vi.mock("../db/db.js", () => ({
  closeDb: vi.fn(),
  incrementMetric: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../renderer/renderer.js", () => ({
  closeRenderer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../utils/logger.js", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      bindings: vi.fn(() => ({ module: "bot" })),
    })),
  },
}));

describe("Token validation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
  });

  it("throws when TELEGRAM_BOT_TOKEN is unset", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(import("./bot.js")).rejects.toThrow("TELEGRAM_BOT_TOKEN");
  });

  it("throws when TELEGRAM_BOT_TOKEN is empty string", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "";
    await expect(import("./bot.js")).rejects.toThrow("TELEGRAM_BOT_TOKEN");
  });

  it("creates bot instance when TELEGRAM_BOT_TOKEN is set", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
    const mod = await import("./bot.js");
    expect(mod.bot).toBeDefined();
  });
});

describe("Bot instance", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
  });

  afterEach(() => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
  });

  it("exports bot with start, stop, on, and command methods", async () => {
    const { bot } = await import("./bot.js");
    expect(typeof bot.start).toBe("function");
    expect(typeof bot.stop).toBe("function");
    expect(typeof bot.on).toBe("function");
    expect(typeof bot.command).toBe("function");
  });

  it("registers command tracking middleware that increments metric on commands", async () => {
    const { bot } = await import("./bot.js");
    const { incrementMetric } = await import("../db/db.js");

    // Get the first middleware registered (command tracking)
    const trackingMiddleware = vi.mocked(bot.use).mock.calls[0][0] as any;
    expect(typeof trackingMiddleware).toBe("function");

    const next = vi.fn();

    // Test with a command
    const ctxCommand = { message: { text: "/stats" } } as any;
    await trackingMiddleware(ctxCommand, next);
    expect(incrementMetric).toHaveBeenCalledWith("bot_commands_called", 1);
    expect(next).toHaveBeenCalled();

    vi.clearAllMocks();

    // Test with a non-command
    const ctxMsg = { message: { text: "hello world" } } as any;
    await trackingMiddleware(ctxMsg, next);
    expect(incrementMetric).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});

describe("Logger", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
  });

  afterEach(() => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
  });

  it("has module: 'bot' binding", async () => {
    const { _logger } = await import("./bot.js");
    expect(_logger.bindings()).toEqual(expect.objectContaining({ module: "bot" }));
  });

  it("does not leak token value in log output during module load", async () => {
    const token = "super-secret-token-xyz";
    process.env.TELEGRAM_BOT_TOKEN = token;

    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as typeof process.stdout.write;

    try {
      await import("./bot.js");
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).not.toContain(token);
  });
});
