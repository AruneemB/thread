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

vi.mock("../db/db.js", () => ({
  closeDb: vi.fn(),
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
