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

describe("Shutdown handlers", () => {
  let mod: Awaited<ReturnType<typeof import("./bot.js")>>;
  let closeDb: ReturnType<typeof vi.fn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    mod = await import("./bot.js");
    const dbMod = await import("../db/db.js");
    closeDb = dbMod.closeDb as unknown as ReturnType<typeof vi.fn>;
    closeDb.mockClear();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
  });

  it("calls bot.stop() on SIGTERM shutdown", async () => {
    await mod._shutdown("SIGTERM");
    expect(mod.bot.stop).toHaveBeenCalled();
  });

  it("calls closeDb() on SIGTERM shutdown", async () => {
    await mod._shutdown("SIGTERM");
    expect(closeDb).toHaveBeenCalled();
  });

  it("calls bot.stop() and closeDb() on SIGINT shutdown", async () => {
    await mod._shutdown("SIGINT");
    expect(mod.bot.stop).toHaveBeenCalled();
    expect(closeDb).toHaveBeenCalled();
  });

  it("is idempotent — second call does not invoke stop/closeDb again", async () => {
    await mod._shutdown("SIGTERM");
    await mod._shutdown("SIGTERM");
    expect(mod.bot.stop).toHaveBeenCalledTimes(1);
    expect(closeDb).toHaveBeenCalledTimes(1);
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
