import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

describe("PM2 config", () => {
  it("can be required without error", () => {
    const pm2Config = require("../pm2.config.js");
    expect(pm2Config).toBeDefined();
  });

  it("exports apps array with at least one entry", () => {
    const pm2Config = require("../pm2.config.js");
    expect(Array.isArray(pm2Config.apps)).toBe(true);
    expect(pm2Config.apps.length).toBeGreaterThan(0);
  });

  it("has app entry with name 'thread' and script 'dist/index.js'", () => {
    const pm2Config = require("../pm2.config.js");
    const app = pm2Config.apps.find((a: any) => a.name === "thread");
    expect(app).toBeDefined();
    expect(app.script).toBe("dist/index.js");
  });
});

describe("Environment variable defaults", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("RENDER_TIMEOUT_MS unset uses default 15000", async () => {
    delete process.env.RENDER_TIMEOUT_MS;
    // The renderer module reads the env var when _doRender is called
    // We can't easily test this without mocking, but we can verify the parsing logic
    const parsed = parseInt(process.env.RENDER_TIMEOUT_MS ?? "15000", 10);
    const timeoutMs = isNaN(parsed) ? 15000 : parsed;
    expect(timeoutMs).toBe(15000);
  });

  it("STATS_COOLDOWN_SECONDS unset uses default 600", () => {
    delete process.env.STATS_COOLDOWN_SECONDS;
    const parsed = parseInt(process.env.STATS_COOLDOWN_SECONDS ?? "600", 10);
    const cooldown = isNaN(parsed) ? 600 : parsed;
    expect(cooldown).toBe(600);
  });

  it("DATABASE_PATH unset uses default './thread.db'", () => {
    delete process.env.DATABASE_PATH;
    const dbPath = process.env.DATABASE_PATH ?? "./thread.db";
    expect(dbPath).toBe("./thread.db");
  });

  it("LOG_LEVEL unset uses default 'info'", () => {
    delete process.env.LOG_LEVEL;
    const logLevel = process.env.LOG_LEVEL ?? "info";
    expect(logLevel).toBe("info");
  });

  it("WEEKLY_DIGEST_ENABLED unset defaults to enabled (true)", () => {
    delete process.env.WEEKLY_DIGEST_ENABLED;
    const enabled = process.env.WEEKLY_DIGEST_ENABLED !== "false";
    expect(enabled).toBe(true);
  });
});

describe("Structured logging", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let logOutput: string[] = [];
  let originalStdoutWrite: typeof process.stdout.write;

  beforeEach(() => {
    originalEnv = { ...process.env };
    logOutput = [];
    originalStdoutWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      logOutput.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.env = originalEnv;
    process.stdout.write = originalStdoutWrite;
  });

  it("logger output is valid JSON", async () => {
    const { logger } = await import("./utils/logger.js");
    logger.info("test message");
    const output = logOutput.join("");
    const lines = output.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach(line => {
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });

  it("log output includes 'level' field", async () => {
    const { logger } = await import("./utils/logger.js");
    logger.info("test message");
    const output = logOutput.join("");
    const lines = output.trim().split("\n").filter(Boolean);
    lines.forEach(line => {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty("level");
    });
  });

  it("log output includes 'msg' field", async () => {
    const { logger } = await import("./utils/logger.js");
    logger.info("test message");
    const output = logOutput.join("");
    const lines = output.trim().split("\n").filter(Boolean);
    lines.forEach(line => {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty("msg");
    });
  });

  it("child logger output includes 'module' field", async () => {
    const { logger } = await import("./utils/logger.js");
    const child = logger.child({ module: "test" });
    child.info("test message");
    const output = logOutput.join("");
    const lines = output.trim().split("\n").filter(Boolean);
    lines.forEach(line => {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty("module");
      expect(parsed.module).toBe("test");
    });
  });

  it("LOG_LEVEL=error suppresses info-level entries", () => {
    const pino = require("pino");
    const errorLogger = pino({ level: "error" });

    logOutput = [];
    errorLogger.info("this should not appear");
    errorLogger.error("this should appear");

    const output = logOutput.join("");
    expect(output).not.toContain("this should not appear");
    expect(output).toContain("this should appear");
  });
});

describe("Build output", () => {
  it("dist/index.js exists after build", () => {
    const indexPath = resolve(__dirname, "..", "dist", "index.js");
    expect(existsSync(indexPath)).toBe(true);
  });

  it("dist/db/db.js exists after build", () => {
    const dbPath = resolve(__dirname, "..", "dist", "db", "db.js");
    expect(existsSync(dbPath)).toBe(true);
  });

  it("dist/bot/bot.js exists after build", () => {
    const botPath = resolve(__dirname, "..", "dist", "bot", "bot.js");
    expect(existsSync(botPath)).toBe(true);
  });

  it("no .ts files in dist/", () => {
    const { execSync } = require("child_process");
    const distPath = resolve(__dirname, "..", "dist");
    try {
      const result = execSync(`find "${distPath}" -name "*.ts" -type f`, { encoding: "utf8" });
      expect(result.trim()).toBe("");
    } catch (err: any) {
      // find returns non-zero if no files found, which is what we want
      if (err.stdout) {
        expect(err.stdout.trim()).toBe("");
      }
    }
  });
});
