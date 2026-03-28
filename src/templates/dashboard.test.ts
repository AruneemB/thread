import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const html = readFileSync(
  resolve(__dirname, "dashboard.html"),
  "utf-8",
);

describe("dashboard skeleton", () => {
  describe("structure", () => {
    it("contains DOCTYPE declaration", () => {
      expect(html).toContain("<!DOCTYPE html>");
    });

    it("contains charset meta tag", () => {
      expect(html.toLowerCase()).toContain('<meta charset="utf-8">');
    });

    it("sets 900px width", () => {
      expect(html).toContain("900px");
    });

    it("uses system-ui font family", () => {
      expect(html).toContain("system-ui");
    });

    it("sets white background", () => {
      expect(html).toContain("#ffffff");
    });
  });

  describe("header", () => {
    it("contains group name placeholder element", () => {
      expect(html).toContain('class="group-name"');
    });

    it("contains date range placeholder element", () => {
      expect(html).toContain('class="date-range"');
    });
  });

  describe("sort bar", () => {
    it("contains all 4 sort button labels", () => {
      expect(html).toContain("total messages");
      expect(html).toContain("streak");
      expect(html).toContain("longest");
      expect(html).toContain("recent");
    });

    it("has at least one element with active class", () => {
      expect(html).toMatch(/class="[^"]*active[^"]*"/);
    });
  });

  describe("self-containment", () => {
    it("has no external stylesheet links", () => {
      expect(html).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="http/i);
    });

    it("has no external script sources", () => {
      expect(html).not.toMatch(/<script[^>]+src="http/i);
    });

    it("has no CSS @import url with http", () => {
      expect(html).not.toMatch(/@import\s+url\(["']?http/i);
    });
  });

  describe("CSS custom properties", () => {
    it("defines at least 3 --teal- custom properties", () => {
      const matches = html.match(/--teal-\d+/g) || [];
      const unique = new Set(matches);
      expect(unique.size).toBeGreaterThanOrEqual(3);
    });
  });
});
