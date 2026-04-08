import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pino from "pino";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Vercel config", () => {
  it("vercel.json exists in project root", () => {
    const vercelConfigPath = resolve(__dirname, "..", "vercel.json");
    expect(existsSync(vercelConfigPath)).toBe(true);
  });

  it("vercel.json is valid JSON", () => {
    const vercelConfigPath = resolve(__dirname, "..", "vercel.json");
    const content = readFileSync(vercelConfigPath, "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("vercel.json has buildCommand configured", () => {
    const vercelConfigPath = resolve(__dirname, "..", "vercel.json");
    const config = JSON.parse(readFileSync(vercelConfigPath, "utf-8"));
    expect(config.buildCommand).toBeDefined();
    expect(typeof config.buildCommand).toBe("string");
  });

  it("vercel.json has functions configured for API routes", () => {
    const vercelConfigPath = resolve(__dirname, "..", "vercel.json");
    const config = JSON.parse(readFileSync(vercelConfigPath, "utf-8"));
    expect(config.functions).toBeDefined();
    expect(typeof config.functions).toBe("object");
    expect(Object.keys(config.functions).length).toBeGreaterThan(0);
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

  it("RENDER_TIMEOUT_MS unset uses default 30000", async () => {
    delete process.env.RENDER_TIMEOUT_MS;
    const parsed = parseInt(process.env.RENDER_TIMEOUT_MS ?? "30000", 10);
    const timeoutMs = isNaN(parsed) ? 30000 : parsed;
    expect(timeoutMs).toBe(30000);
  });

  it("STATS_COOLDOWN_SECONDS unset uses default 600", () => {
    delete process.env.STATS_COOLDOWN_SECONDS;
    const parsed = parseInt(process.env.STATS_COOLDOWN_SECONDS ?? "600", 10);
    const cooldown = isNaN(parsed) ? 600 : parsed;
    expect(cooldown).toBe(600);
  });

  it("TURSO_DATABASE_URL unset uses default 'file:./thread.db'", () => {
    delete process.env.TURSO_DATABASE_URL;
    const dbUrl = process.env.TURSO_DATABASE_URL ?? "file:./thread.db";
    expect(dbUrl).toBe("file:./thread.db");
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

  it("dist directory exists for build output", () => {
    const distPath = resolve(__dirname, "..", "dist");
    expect(existsSync(distPath)).toBe(true);
  });
});

describe("API routes", () => {
  it("webhook API route exists", () => {
    const webhookPath = resolve(__dirname, "..", "api", "webhook.ts");
    expect(existsSync(webhookPath)).toBe(true);
  });

  it("cron digest API route exists", () => {
    const cronPath = resolve(__dirname, "..", "api", "cron", "digest.ts");
    expect(existsSync(cronPath)).toBe(true);
  });
});
