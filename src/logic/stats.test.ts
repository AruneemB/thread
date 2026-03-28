import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema, insertMessage } from "../db/db.js";
import type { Message } from "../db/db.js";
import { computeStreaks, getDailyCountsForUser } from "./stats.js";

const TODAY = "2024-06-15";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    chat_id: "chat1",
    user_id: "user1",
    username: "alice",
    first_name: "Alice",
    date: "2024-01-15",
    hour: 10,
    dow: 0,
    msg_length: 42,
    ...overrides,
  };
}

function daysAgo(n: number, from: string = TODAY): string {
  const d = new Date(from + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("computeStreaks", () => {
  it("returns zeros for an empty map", () => {
    const result = computeStreaks(new Map(), TODAY);
    expect(result).toEqual({ current: 0, longest: 0 });
  });

  it("returns { current: 1, longest: 1 } for a single day that is today", () => {
    const counts = new Map([[TODAY, 3]]);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 1, longest: 1 });
  });

  it("returns { current: 0, longest: 1 } for a single day that is not today", () => {
    const counts = new Map([[daysAgo(5), 2]]);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 0, longest: 1 });
  });
});
