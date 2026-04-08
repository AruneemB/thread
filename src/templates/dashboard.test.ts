import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

describe("calendar component", () => {
  describe("color ramp", () => {
    it("cell-0 maps to #e1f5ee", () => {
      expect(html).toMatch(/\.cell-0\s*\{[^}]*#e1f5ee/);
    });

    it("cell-1 maps to #9fe1cb", () => {
      expect(html).toMatch(/\.cell-1\s*\{[^}]*#9fe1cb/);
    });

    it("cell-2 maps to #5dcaa5", () => {
      expect(html).toMatch(/\.cell-2\s*\{[^}]*#5dcaa5/);
    });

    it("cell-3 maps to #1d9e75", () => {
      expect(html).toMatch(/\.cell-3\s*\{[^}]*#1d9e75/);
    });

    it("cell-4 maps to #0f6e56", () => {
      expect(html).toMatch(/\.cell-4\s*\{[^}]*#0f6e56/);
    });

    it("cell-future class exists", () => {
      expect(html).toMatch(/\.cell-future\s*\{/);
    });
  });

  describe("grid structure", () => {
    it("defines .calendar-grid", () => {
      expect(html).toMatch(/\.calendar-grid\s*\{/);
    });

    it("uses repeat(53 for columns", () => {
      expect(html).toContain("repeat(53");
    });

    it("uses repeat(7 for rows", () => {
      expect(html).toContain("repeat(7");
    });
  });

  describe("labels", () => {
    it("contains M, W, F day labels", () => {
      expect(html).toContain(">M<");
      expect(html).toContain(">W<");
      expect(html).toContain(">F<");
    });

    it("contains at least 3 month names", () => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const found = months.filter((m) => html.includes(m));
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("placeholder grid", () => {
    it("contains at least 371 cell-0 placeholders", () => {
      const matches = html.match(/class="cell cell-0"/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(371);
    });
  });
});

describe("member cards", () => {
  describe("member card container", () => {
    it(".member-card has border property", () => {
      expect(html).toMatch(/\.member-card\s*\{[^}]*border:/);
    });

    it(".member-card has padding property", () => {
      expect(html).toMatch(/\.member-card\s*\{[^}]*padding:/);
    });
  });

  describe("avatar", () => {
    it(".avatar has border-radius 50%", () => {
      expect(html).toMatch(/\.avatar\s*\{[^}]*border-radius:\s*50%/);
    });

    it(".avatar has width 40px", () => {
      expect(html).toMatch(/\.avatar\s*\{[^}]*width:\s*40px/);
    });

    it(".avatar has height 40px", () => {
      expect(html).toMatch(/\.avatar\s*\{[^}]*height:\s*40px/);
    });

    it(".avatar has white text color", () => {
      expect(html).toMatch(/\.avatar\s*\{[^}]*color:\s*#ffffff/);
    });
  });

  describe("header row", () => {
    it(".member-header is flex", () => {
      expect(html).toMatch(/\.member-header\s*\{[^}]*display:\s*flex/);
    });

    it(".member-header has justify-content space-between", () => {
      expect(html).toMatch(/\.member-header\s*\{[^}]*justify-content:\s*space-between/);
    });

    it("contains display-name class in HTML", () => {
      expect(html).toContain('class="display-name"');
    });

    it("contains member-stats class in HTML", () => {
      expect(html).toContain('class="member-stats"');
    });
  });

  describe("streak pills", () => {
    it(".pill has border-radius", () => {
      expect(html).toMatch(/\.pill\s*\{[^}]*border-radius:/);
    });

    it(".pill-active has background", () => {
      expect(html).toMatch(/\.pill-active\s*\{[^}]*background:/);
    });

    it(".pill-grey has background", () => {
      expect(html).toMatch(/\.pill-grey\s*\{[^}]*background:/);
    });

    it('HTML contains "day streak"', () => {
      expect(html).toContain("day streak");
    });

    it('HTML contains "Best:"', () => {
      expect(html).toContain("Best:");
    });

    it('HTML contains "active"', () => {
      expect(html).toContain("active");
    });
  });

  describe("legend footer", () => {
    it('contains "Less" text', () => {
      expect(html).toContain("Less");
    });

    it('contains "More" text', () => {
      expect(html).toContain("More");
    });

    it("contains exactly 5 legend-swatch elements", () => {
      const matches = html.match(/class="legend-swatch"/g) || [];
      expect(matches.length).toBe(5);
    });
  });

  describe("multi-card stacking", () => {
    it(".cards-container has gap property", () => {
      expect(html).toMatch(/\.cards-container\s*\{[^}]*gap:/);
    });
  });
});
