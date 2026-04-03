import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Client } from "@libsql/client";
import {
  computeStreaks,
  getDailyCountsForUser,
  getHourlyMatrix,
  getTotalMessages,
  getPeakHour,
  getGroupSummary,
} from "./stats.js";

// Mock getDbInstance
vi.mock("../db/db.js", () => ({
  getDbInstance: vi.fn(),
}));

import { getDbInstance } from "../db/db.js";

const TODAY = "2024-06-15";

function createMockClient(): Client {
  const mockExecute = vi.fn(async () => ({ rows: [], columns: [] }));
  return {
    execute: mockExecute,
    close: vi.fn(),
  } as unknown as Client;
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
  let client: Client;

  beforeEach(() => {
    client = createMockClient();
    (getDbInstance as any).mockResolvedValue(client);
  });

  it("returns an empty map when no messages exist", async () => {
    (client.execute as any).mockResolvedValue({ rows: [], columns: [] });
    const result = await getDailyCountsForUser("chat1", "user1", 52, TODAY);
    expect(result.size).toBe(0);
  });

  it("counts 3 messages on one date correctly", async () => {
    (client.execute as any).mockResolvedValue({
      rows: [{ date: "2024-06-10", msg_count: 3 }],
      columns: ["date", "msg_count"],
    });

    const result = await getDailyCountsForUser("chat1", "user1", 52, TODAY);
    expect(result.get("2024-06-10")).toBe(3);
    expect(result.size).toBe(1);
  });

  it("returns correct counts across multiple dates", async () => {
    (client.execute as any).mockResolvedValue({
      rows: [
        { date: "2024-06-10", msg_count: 2 },
        { date: "2024-06-12", msg_count: 1 },
      ],
      columns: ["date", "msg_count"],
    });

    const result = await getDailyCountsForUser("chat1", "user1", 52, TODAY);
    expect(result.get("2024-06-10")).toBe(2);
    expect(result.get("2024-06-12")).toBe(1);
    expect(result.size).toBe(2);
  });

  it("calls execute with correct SQL and parameters", async () => {
    (client.execute as any).mockResolvedValue({ rows: [], columns: [] });
    await getDailyCountsForUser("chat1", "user1", 52, TODAY);

    expect(client.execute).toHaveBeenCalledWith({
      sql: expect.stringContaining("SELECT date, COUNT(*) AS msg_count"),
      args: ["chat1", "user1", expect.any(String)],
    });
  });
});

describe("getHourlyMatrix", () => {
  let client: Client;

  beforeEach(() => {
    client = createMockClient();
    (getDbInstance as any).mockResolvedValue(client);
  });

  it("returns a 7x24 all-zero matrix when no data exists", async () => {
    (client.execute as any).mockResolvedValue({ rows: [], columns: [] });
    const matrix = await getHourlyMatrix("chat1", "user1", 52, TODAY);
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        expect(matrix[dow][hour]).toBe(0);
      }
    }
  });

  it("has correct dimensions: 7 rows each with 24 columns", async () => {
    (client.execute as any).mockResolvedValue({ rows: [], columns: [] });
    const matrix = await getHourlyMatrix("chat1", "user1", 52, TODAY);
    expect(matrix.length).toBe(7);
    for (const row of matrix) {
      expect(row.length).toBe(24);
    }
  });

  it("places a single message at the correct cell", async () => {
    (client.execute as any).mockResolvedValue({
      rows: [{ dow: 0, hour: 14, msg_count: 1 }],
      columns: ["dow", "hour", "msg_count"],
    });

    const matrix = await getHourlyMatrix("chat1", "user1", 52, TODAY);
    expect(matrix[0][14]).toBe(1);
    expect(matrix[0][0]).toBe(0);
    expect(matrix[6][23]).toBe(0);
  });

  it("accumulates multiple messages at the same cell", async () => {
    (client.execute as any).mockResolvedValue({
      rows: [{ dow: 2, hour: 9, msg_count: 3 }],
      columns: ["dow", "hour", "msg_count"],
    });

    const matrix = await getHourlyMatrix("chat1", "user1", 52, TODAY);
    expect(matrix[2][9]).toBe(3);
  });

  it("fills correct cells for messages across different dow/hour", async () => {
    (client.execute as any).mockResolvedValue({
      rows: [
        { dow: 0, hour: 8, msg_count: 1 },
        { dow: 3, hour: 17, msg_count: 1 },
        { dow: 6, hour: 23, msg_count: 1 },
      ],
      columns: ["dow", "hour", "msg_count"],
    });

    const matrix = await getHourlyMatrix("chat1", "user1", 52, TODAY);
    expect(matrix[0][8]).toBe(1);
    expect(matrix[3][17]).toBe(1);
    expect(matrix[6][23]).toBe(1);
  });
});

describe("getTotalMessages", () => {
  let client: Client;

  beforeEach(() => {
    client = createMockClient();
    (getDbInstance as any).mockResolvedValue(client);
  });

  it("returns 0 for an unknown user", async () => {
    (client.execute as any).mockResolvedValue({
      rows: [{ cnt: 0 }],
      columns: ["cnt"],
    });

    const result = await getTotalMessages("chat1", "unknown");
    expect(result).toBe(0);
  });

  it("returns correct count for a user with 5 messages", async () => {
    (client.execute as any).mockResolvedValue({
      rows: [{ cnt: 5 }],
      columns: ["cnt"],
    });

    const result = await getTotalMessages("chat1", "user1");
    expect(result).toBe(5);
  });

  it("calls execute with correct SQL and parameters", async () => {
    (client.execute as any).mockResolvedValue({
      rows: [{ cnt: 0 }],
      columns: ["cnt"],
    });

    await getTotalMessages("chat1", "user1");

    expect(client.execute).toHaveBeenCalledWith({
      sql: expect.stringContaining("SELECT COUNT(*) AS cnt"),
      args: ["chat1", "user1"],
    });
  });
});

describe("getPeakHour", () => {
  it("returns { dow: 0, hour: 0, count: 0 } for an all-zero matrix", () => {
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    expect(getPeakHour(matrix)).toEqual({ dow: 0, hour: 0, count: 0 });
  });

  it("returns the single non-zero cell", () => {
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    matrix[3][15] = 42;
    expect(getPeakHour(matrix)).toEqual({ dow: 3, hour: 15, count: 42 });
  });

  it("returns the cell with the clear maximum", () => {
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    matrix[1][8] = 5;
    matrix[4][20] = 50;
    matrix[2][12] = 10;
    expect(getPeakHour(matrix)).toEqual({ dow: 4, hour: 20, count: 50 });
  });

  it("returns deterministic results on tie", () => {
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    matrix[1][5] = 10;
    matrix[3][18] = 10;
    const result1 = getPeakHour(matrix);
    const result2 = getPeakHour(matrix);
    expect(result1).toEqual(result2);
  });

  it("handles peak at boundary { dow: 6, hour: 23 }", () => {
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    matrix[6][23] = 99;
    expect(getPeakHour(matrix)).toEqual({ dow: 6, hour: 23, count: 99 });
  });
});

describe("getGroupSummary", () => {
  let client: Client;

  beforeEach(() => {
    client = createMockClient();
    (getDbInstance as any).mockResolvedValue(client);
  });

  it("returns zeros and empty array for an empty chat", async () => {
    // Mock three execute calls: totalMessages, activeDays, topMembers
    (client.execute as any)
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }], columns: ["cnt"] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }], columns: ["cnt"] })
      .mockResolvedValueOnce({ rows: [], columns: [] });
    const summary = await getGroupSummary("chat1", 20);
    expect(summary).toEqual({ totalMessages: 0, activeDays: 0, topMembers: [] });
  });

  it("returns a single member in topMembers", async () => {
    (client.execute as any)
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }], columns: ["cnt"] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }], columns: ["cnt"] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "user1",
            first_name: "Alice",
            username: "alice",
            totalCount: 1,
          },
        ],
        columns: ["user_id", "first_name", "username", "totalCount"],
      });

    const summary = await getGroupSummary("chat1", 20);
    expect(summary.topMembers.length).toBe(1);
  });

  it("sorts members by totalCount descending", async () => {
    (client.execute as any)
      .mockResolvedValueOnce({ rows: [{ cnt: 4 }], columns: ["cnt"] })
      .mockResolvedValueOnce({ rows: [{ cnt: 3 }], columns: ["cnt"] })
      .mockResolvedValueOnce({
        rows: [
          { user_id: "u2", first_name: "Bob", username: "bob", totalCount: 3 },
          { user_id: "u1", first_name: "Alice", username: "alice", totalCount: 1 },
        ],
        columns: ["user_id", "first_name", "username", "totalCount"],
      });

    const summary = await getGroupSummary("chat1", 20);
    expect(summary.topMembers[0].user_id).toBe("u2");
    expect(summary.topMembers[0].totalCount).toBe(3);
    expect(summary.topMembers[1].user_id).toBe("u1");
    expect(summary.topMembers[1].totalCount).toBe(1);
  });

  it("limits results to topN members", async () => {
    (client.execute as any)
      .mockResolvedValueOnce({ rows: [{ cnt: 4 }], columns: ["cnt"] })
      .mockResolvedValueOnce({ rows: [{ cnt: 4 }], columns: ["cnt"] })
      .mockResolvedValueOnce({
        rows: [
          { user_id: "u1", first_name: "A", username: "a", totalCount: 4 },
          { user_id: "u2", first_name: "B", username: "b", totalCount: 3 },
          { user_id: "u3", first_name: "C", username: "c", totalCount: 2 },
        ],
        columns: ["user_id", "first_name", "username", "totalCount"],
      });

    const summary = await getGroupSummary("chat1", 3);
    expect(summary.topMembers.length).toBe(3);
  });

  it("includes user_id, first_name, username, and totalCount in entries", async () => {
    (client.execute as any)
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }], columns: ["cnt"] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }], columns: ["cnt"] })
      .mockResolvedValueOnce({
        rows: [
          { user_id: "u1", first_name: "Alice", username: "alice", totalCount: 1 },
        ],
        columns: ["user_id", "first_name", "username", "totalCount"],
      });

    const summary = await getGroupSummary("chat1", 20);
    const member = summary.topMembers[0];
    expect(member.user_id).toBe("u1");
    expect(member.first_name).toBe("Alice");
    expect(member.username).toBe("alice");
    expect(member.totalCount).toBe(1);
  });
});
