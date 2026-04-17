import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock grammy BEFORE importing issueComposer
vi.mock("grammy", () => {
  class Composer {
    private handlers: Record<string, any> = {};
    command(name: string, handler: any) {
      this.handlers[name] = handler;
    }
    _getHandler(name: string) {
      return this.handlers[name];
    }
  }
  return { Composer };
});

// Mock @google/generative-ai
const mockGenerateContent = vi.fn();
vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return {
          generateContent: mockGenerateContent,
        };
      }
    },
  };
});

import { issueComposer } from "./issue.js";

// Mock other dependencies
vi.mock("../utils/logger.js", () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function getHandler() {
  return (issueComposer as any)._getHandler("issue");
}

describe("issue command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY_ISSUE = "test-key";
    process.env.GITHUB_TOKEN = "test-github-token";
    process.env.GITHUB_REPO = "owner/repo";
  });

  it("should reply with usage message if no input is provided", async () => {
    const ctx = {
      match: "",
      reply: vi.fn(),
    } as any;

    const handler = getHandler();
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Usage: `/issue <your message>`"),
      expect.anything()
    );
  });

  it("should handle missing configuration (GitHub token)", async () => {
    delete process.env.GITHUB_TOKEN;
    const ctx = {
      match: "test issue",
      reply: vi.fn(),
    } as any;

    const handler = getHandler();
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("missing GitHub configuration")
    );
  });

  it("should handle missing configuration (AI key)", async () => {
    delete process.env.GOOGLE_AI_API_KEY_ISSUE;
    const ctx = {
      match: "test issue",
      reply: vi.fn(),
    } as any;

    const handler = getHandler();
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("missing AI key")
    );
  });

  it("should successfully create a GitHub issue", async () => {
    const ctx = {
      match: "This is a bug report",
      from: { id: 123, username: "testuser" },
      chat: { id: -1 },
      reply: vi.fn(),
    } as any;

    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify({
          title: "Bug: Test Title",
          summary: "• Point 1\n• Point 2"
        })
      }
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        number: 42,
        title: "Bug: Test Title",
        html_url: "https://github.com/owner/repo/issues/42"
      })
    });

    const handler = getHandler();
    await handler(ctx);

    expect(mockGenerateContent).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/issues",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Authorization": "Bearer test-github-token"
        }),
        body: expect.stringContaining('"needs-triage"') && expect.stringContaining('"user-reported"'),
      })
    );
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Issue Created!"),
      expect.objectContaining({ parse_mode: "Markdown" })
    );
  });
});
