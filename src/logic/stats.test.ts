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

  it("returns { current: 5, longest: 5 } for 5 consecutive days ending today", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 5; i++) {
      counts.set(daysAgo(i), 1);
    }
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 5, longest: 5 });
  });

  it("handles a gap in the middle correctly", () => {
    // Days: today, -1, -2, (gap at -3), -4, -5, -6, -7
    const counts = new Map<string, number>();
    for (let i = 0; i < 3; i++) counts.set(daysAgo(i), 1);
    for (let i = 4; i < 8; i++) counts.set(daysAgo(i), 1);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 3, longest: 4 });
  });

  it("handles a 10-day old streak plus today", () => {
    // 10-day streak ended 3 days ago, plus today alone
    const counts = new Map<string, number>();
    counts.set(TODAY, 1);
    for (let i = 3; i < 13; i++) counts.set(daysAgo(i), 1);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 1, longest: 10 });
  });

  it("returns current: 0 for a streak ending yesterday", () => {
    const counts = new Map<string, number>();
    for (let i = 1; i <= 4; i++) counts.set(daysAgo(i), 1);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 0, longest: 4 });
  });

  it("returns current equal to longest for a streak ending today", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 7; i++) counts.set(daysAgo(i), 1);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 7, longest: 7 });
  });
});

describe("computeStreaks edge cases", () => {
  it("handles a 365-day streak ending today", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 365; i++) counts.set(daysAgo(i), 1);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 365, longest: 365 });
  });

  it("handles a streak spanning a year boundary", () => {
    // Dec 30 2023 → Jan 3 2024
    const ref = "2024-01-03";
    const counts = new Map<string, number>();
    for (let i = 0; i < 5; i++) counts.set(daysAgo(i, ref), 1);
    const result = computeStreaks(counts, ref);
    expect(result).toEqual({ current: 5, longest: 5 });
  });

  it("treats multiple messages per day as 1 active day", () => {
    const counts = new Map<string, number>();
    counts.set(TODAY, 10);
    counts.set(daysAgo(1), 5);
    counts.set(daysAgo(2), 1);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 3, longest: 3 });
  });

  it("returns the correct longest when two equal-length streaks exist", () => {
    // Two streaks of 3 separated by a gap
    const counts = new Map<string, number>();
    for (let i = 0; i < 3; i++) counts.set(daysAgo(i), 1);
    for (let i = 4; i < 7; i++) counts.set(daysAgo(i), 1);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 3, longest: 3 });
  });

  it("returns zeros when map contains only future dates", () => {
    const counts = new Map<string, number>();
    counts.set("2025-01-01", 5);
    counts.set("2025-01-02", 3);
    const result = computeStreaks(counts, TODAY);
    expect(result).toEqual({ current: 0, longest: 0 });
  });
});

describe("getDailyCountsForUser", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns an empty map when no messages exist", () => {
    const result = getDailyCountsForUser("chat1", "user1", 52, db, TODAY);
    expect(result.size).toBe(0);
  });

  it("counts 3 messages on one date correctly", () => {
    insertMessage(makeMessage({ date: "2024-06-10" }), db);
    insertMessage(makeMessage({ date: "2024-06-10" }), db);
    insertMessage(makeMessage({ date: "2024-06-10" }), db);

    const result = getDailyCountsForUser("chat1", "user1", 52, db, TODAY);
    expect(result.get("2024-06-10")).toBe(3);
    expect(result.size).toBe(1);
  });

  it("returns correct counts across multiple dates", () => {
    insertMessage(makeMessage({ date: "2024-06-10" }), db);
    insertMessage(makeMessage({ date: "2024-06-10" }), db);
    insertMessage(makeMessage({ date: "2024-06-12" }), db);

    const result = getDailyCountsForUser("chat1", "user1", 52, db, TODAY);
    expect(result.get("2024-06-10")).toBe(2);
    expect(result.get("2024-06-12")).toBe(1);
    expect(result.size).toBe(2);
  });

  it("excludes messages older than the specified weeks", () => {
    // 52 weeks before 2024-06-15 is 2023-06-17
    insertMessage(makeMessage({ date: "2023-06-16" }), db); // too old
    insertMessage(makeMessage({ date: "2023-06-17" }), db); // exactly at cutoff

    const result = getDailyCountsForUser("chat1", "user1", 52, db, TODAY);
    expect(result.has("2023-06-16")).toBe(false);
    expect(result.get("2023-06-17")).toBe(1);
  });

  it("excludes messages from a different chat_id", () => {
    insertMessage(makeMessage({ chat_id: "chat1", date: "2024-06-10" }), db);
    insertMessage(makeMessage({ chat_id: "chat2", date: "2024-06-10" }), db);

    const result = getDailyCountsForUser("chat1", "user1", 52, db, TODAY);
    expect(result.get("2024-06-10")).toBe(1);
  });

  it("excludes messages from a different user_id", () => {
    insertMessage(makeMessage({ user_id: "user1", date: "2024-06-10" }), db);
    insertMessage(makeMessage({ user_id: "user2", date: "2024-06-10" }), db);

    const result = getDailyCountsForUser("chat1", "user1", 52, db, TODAY);
    expect(result.get("2024-06-10")).toBe(1);
  });
});
