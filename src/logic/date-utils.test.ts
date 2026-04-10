import { describe, it, expect } from "vitest";
import { subtractOneDay, addOneDay } from "./date-utils.js";

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

    it("handles leap year", () => {
      expect(addOneDay("2024-02-28")).toBe("2024-02-29");
      expect(addOneDay("2024-02-29")).toBe("2024-03-01");
    });
  });
});
