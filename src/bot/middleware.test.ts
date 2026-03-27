import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractDateFields, computeMsgLength, registerMessageHandler } from "./middleware.js";
import { upsertMember, insertMessage } from "../db/db.js";

vi.mock("../db/db.js", () => ({
  upsertMember: vi.fn(),
  insertMessage: vi.fn(),
}));

const mockedUpsertMember = upsertMember as unknown as ReturnType<typeof vi.fn>;
const mockedInsertMessage = insertMessage as unknown as ReturnType<typeof vi.fn>;

function createFakeBot() {
  const handlers: Record<string, Function> = {};
  return {
    on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }),
    _trigger: (event: string, ctx: unknown) => { handlers[event]?.(ctx); },
  };
}

function createFakeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMessageCtx(overrides: Record<string, unknown> = {}) {
  return {
    message: {
      chat: { id: 12345 },
      from: { id: 67890, username: "testuser", first_name: "Test" },
      date: 1700000000,
      text: "hello world",
      ...overrides,
    },
  };
}

describe("extractDateFields", () => {
  it("returns correct fields for 1700000000 (Tue 2023-11-14)", () => {
    const result = extractDateFields(1700000000);
    expect(result).toEqual({ date: "2023-11-14", hour: 22, dow: 1 });
  });

  it("returns correct fields for 1609459200 (Fri 2021-01-01)", () => {
    const result = extractDateFields(1609459200);
    expect(result).toEqual({ date: "2021-01-01", hour: 0, dow: 4 });
  });

  it("returns correct fields for 1704153540 (Mon 2024-01-01)", () => {
    const result = extractDateFields(1704153540);
    expect(result).toEqual({ date: "2024-01-01", hour: 23, dow: 0 });
  });

  it("returns correct fields for 1704585600 (Sun 2024-01-07)", () => {
    const result = extractDateFields(1704585600);
    expect(result).toEqual({ date: "2024-01-07", hour: 0, dow: 6 });
  });
});

describe("computeMsgLength", () => {
  it("returns length of a normal string", () => {
    expect(computeMsgLength("hello")).toBe(5);
  });

  it("returns 0 for empty string", () => {
    expect(computeMsgLength("")).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(computeMsgLength(undefined)).toBe(0);
  });

  it("counts UTF-16 code units for emoji", () => {
    expect(computeMsgLength("hello 👋")).toBe(8);
  });
});

describe("Database persistence", () => {
  beforeEach(() => {
    mockedUpsertMember.mockClear();
    mockedInsertMessage.mockClear();
  });

  it("calls upsertMember and insertMessage for a text message", () => {
    const bot = createFakeBot();
    const logger = createFakeLogger();
    registerMessageHandler(bot as never, logger as never);

    bot._trigger("message", createMessageCtx());

    expect(mockedUpsertMember).toHaveBeenCalledTimes(1);
    expect(mockedInsertMessage).toHaveBeenCalledTimes(1);
  });

  it("passes chat_id and user_id as strings, not numbers", () => {
    const bot = createFakeBot();
    const logger = createFakeLogger();
    registerMessageHandler(bot as never, logger as never);

    bot._trigger("message", createMessageCtx());

    const memberArg = mockedUpsertMember.mock.calls[0][0];
    expect(typeof memberArg.chat_id).toBe("string");
    expect(typeof memberArg.user_id).toBe("string");

    const msgArg = mockedInsertMessage.mock.calls[0][0];
    expect(typeof msgArg.chat_id).toBe("string");
    expect(typeof msgArg.user_id).toBe("string");
  });

  it("passes username as null when from.username is undefined", () => {
    const bot = createFakeBot();
    const logger = createFakeLogger();
    registerMessageHandler(bot as never, logger as never);

    bot._trigger("message", createMessageCtx({
      from: { id: 67890, first_name: "Test" },
    }));

    const memberArg = mockedUpsertMember.mock.calls[0][0];
    expect(memberArg.username).toBeNull();

    const msgArg = mockedInsertMessage.mock.calls[0][0];
    expect(msgArg.username).toBeNull();
  });

  it("never passes message text to insertMessage", () => {
    const bot = createFakeBot();
    const logger = createFakeLogger();
    registerMessageHandler(bot as never, logger as never);

    bot._trigger("message", createMessageCtx({ text: "secret content" }));

    const msgArg = mockedInsertMessage.mock.calls[0][0];
    const allValues = Object.values(msgArg);
    expect(allValues).not.toContain("secret content");
  });
});

describe("Error boundary", () => {
  beforeEach(() => {
    mockedUpsertMember.mockReset();
    mockedInsertMessage.mockReset();
  });

  it("does not re-throw when insertMessage throws", () => {
    mockedInsertMessage.mockImplementation(() => { throw new Error("DB insert error"); });
    const bot = createFakeBot();
    const logger = createFakeLogger();
    registerMessageHandler(bot as never, logger as never);

    expect(() => bot._trigger("message", createMessageCtx())).not.toThrow();
  });

  it("still calls insertMessage when upsertMember throws", () => {
    mockedUpsertMember.mockImplementation(() => { throw new Error("DB upsert error"); });
    const bot = createFakeBot();
    const logger = createFakeLogger();
    registerMessageHandler(bot as never, logger as never);

    bot._trigger("message", createMessageCtx());

    expect(mockedInsertMessage).toHaveBeenCalledTimes(1);
  });

  it("processes next message normally after a DB error", () => {
    let callCount = 0;
    mockedUpsertMember.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error("DB error");
    });
    const bot = createFakeBot();
    const logger = createFakeLogger();
    registerMessageHandler(bot as never, logger as never);

    bot._trigger("message", createMessageCtx());
    expect(() => bot._trigger("message", createMessageCtx())).not.toThrow();
  });

  it("logs error with chat_id and user_id context", () => {
    mockedUpsertMember.mockImplementation(() => { throw new Error("DB error"); });
    const bot = createFakeBot();
    const logger = createFakeLogger();
    registerMessageHandler(bot as never, logger as never);

    bot._trigger("message", createMessageCtx());

    expect(logger.error).toHaveBeenCalled();
    const errorCallArgs = logger.error.mock.calls[0][0];
    expect(errorCallArgs).toHaveProperty("chat_id");
    expect(errorCallArgs).toHaveProperty("user_id");
  });
});
