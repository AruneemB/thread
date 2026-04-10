import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subtractOneDay, addOneDay, formatDate, getTodayISOString, getDateNWeeksAgo, getDayOfWeek } from "./date-utils.js";

describe("date-utils", () => {
  describe("subtractOneDay", () => {
    it("subtracts one day from a mid-month date", () => {
      expect(subtractOneDay("2025-01-15")).toBe("2025-01-14");
    });

    it("crosses month boundary", () => {
      expect(subtractOneDay("2025-02-01")).toBe("2025-01-31");
    });

    it("crosses year boundary", () => {
      expect(subtractOneDay("2025-01-01")).toBe("2024-12-31");
    });
  });

  describe("addOneDay", () => {
    it("adds one day to a mid-month date", () => {
      expect(addOneDay("2025-01-15")).toBe("2025-01-16");
    });

    it("crosses month boundary", () => {
      expect(addOneDay("2025-01-31")).toBe("2025-02-01");
    });

    it("crosses year boundary", () => {
      expect(addOneDay("2024-12-31")).toBe("2025-01-01");
    });
  });

  describe("formatDate", () => {
    it('formats "2025-01-15" to "Jan 15, 2025"', () => {
      expect(formatDate("2025-01-15")).toBe("Jan 15, 2025");
    });

    it('formats "2024-12-31" to "Dec 31, 2024"', () => {
      expect(formatDate("2024-12-31")).toBe("Dec 31, 2024");
    });
  });

  describe("mocked time utilities", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("getTodayISOString returns correct date", () => {
      expect(getTodayISOString()).toBe("2025-01-15");
    });

    it("getDateNWeeksAgo(52) returns date 52 weeks ago", () => {
      // 52 weeks = 364 days. Jan 15, 2025 - 364 days = Jan 17, 2024
      expect(getDateNWeeksAgo(52)).toBe("2024-01-17");
    });
  });

  describe("getDayOfWeek", () => {
    it('returns 0 for "2025-01-13" (Monday)', () => {
      expect(getDayOfWeek("2025-01-13")).toBe(0);
    });

    it('returns 6 for "2025-01-19" (Sunday)', () => {
      expect(getDayOfWeek("2025-01-19")).toBe(6);
    });

    it('returns 2 for "2025-01-15" (Wednesday)', () => {
      expect(getDayOfWeek("2025-01-15")).toBe(2);
    });
  });
});
