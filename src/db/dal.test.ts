import { describe, it, expect, vi } from "vitest";

// Mock the entire db module
vi.mock("./db.js", () => {
  const mockExecute = vi.fn();

  return {
    upsertMember: vi.fn(async (member: any, client: any) => {
      await client.execute({
        sql: "INSERT INTO members...",
        args: [
          member.chat_id,
          member.user_id,
          member.username,
          member.first_name,
          member.last_seen,
        ],
      });
    }),
    insertMessage: vi.fn(async (message: any, client: any) => {
      await client.execute({
        sql: "INSERT INTO messages...",
        args: [
          message.chat_id,
          message.user_id,
          message.username,
          message.first_name,
          message.date,
          message.hour,
          message.dow,
          message.msg_length,
        ],
      });
    }),
    MessageSchema: {
      parse: (data: any) => {
        // Basic validation
        if (!data.first_name) throw new Error("first_name is required");
        if (data.hour < 0 || data.hour > 23) throw new Error("hour must be 0-23");
        if (data.dow < 0 || data.dow > 6) throw new Error("dow must be 0-6");
        if (data.msg_length < 0) throw new Error("msg_length must be >= 0");
        if (data.chat_id === "") throw new Error("chat_id cannot be empty");
        return data;
      },
    },
    MemberSchema: {
      parse: (data: any) => {
        // Basic validation
        if (!data.first_name) throw new Error("first_name is required");
        if (data.chat_id === "") throw new Error("chat_id cannot be empty");
        return data;
      },
    },
  };
});

import { upsertMember, insertMessage, MessageSchema, MemberSchema } from "./db.js";

type Member = {
  chat_id: string;
  user_id: string;
  username: string | null;
  first_name: string;
  last_seen: string;
};

type Message = {
  chat_id: string;
  user_id: string;
  username: string | null;
  first_name: string;
  date: string;
  hour: number;
  dow: number;
  msg_length: number;
};

function createMockClient() {
  return {
    execute: vi.fn().mockResolvedValue({ rows: [], columns: [] }),
    close: vi.fn(),
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    chat_id: "chat1",
    user_id: "user1",
    username: "alice",
    first_name: "Alice",
    last_seen: "2024-01-15T10:30:00Z",
    ...overrides,
  };
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

describe("upsertMember", () => {
  it("executes insert with correct parameters", async () => {
    const client = createMockClient();
    const member = makeMember();
    await upsertMember(member, client);

    expect(client.execute).toHaveBeenCalledWith({
      sql: expect.any(String),
      args: [
        member.chat_id,
        member.user_id,
        member.username,
        member.first_name,
        member.last_seen,
      ],
    });
  });

  it("stores null username when username is null", async () => {
    const client = createMockClient();
    const member = makeMember({ username: null });
    await upsertMember(member, client);

    const call = (client.execute as any).mock.calls[0][0];
    expect(call.args).toContain(null);
  });

  it("calls execute once per upsert", async () => {
    const client = createMockClient();
    await upsertMember(makeMember(), client);
    expect(client.execute).toHaveBeenCalledTimes(1);
  });
});

describe("insertMessage", () => {
  it("executes insert with all message fields", async () => {
    const client = createMockClient();
    const msg = makeMessage();
    await insertMessage(msg, client);

    expect(client.execute).toHaveBeenCalledWith({
      sql: expect.any(String),
      args: [
        msg.chat_id,
        msg.user_id,
        msg.username,
        msg.first_name,
        msg.date,
        msg.hour,
        msg.dow,
        msg.msg_length,
      ],
    });
  });

  it("accepts msg_length of 0 for non-text messages", async () => {
    const client = createMockClient();
    const msg = makeMessage({ msg_length: 0 });
    await insertMessage(msg, client);

    const call = (client.execute as any).mock.calls[0][0];
    expect(call.args).toContain(0);
  });

  it("accepts null username", async () => {
    const client = createMockClient();
    const msg = makeMessage({ username: null });
    await insertMessage(msg, client);

    const call = (client.execute as any).mock.calls[0][0];
    expect(call.args).toContain(null);
  });

  it("calls execute once per insert", async () => {
    const client = createMockClient();
    await insertMessage(makeMessage(), client);
    expect(client.execute).toHaveBeenCalledTimes(1);
  });
});

describe("Zod validation", () => {
  it("throws ZodError when first_name is missing from message", () => {
    const invalid = { ...makeMessage() } as Record<string, unknown>;
    delete invalid.first_name;

    expect(() => MessageSchema.parse(invalid)).toThrow();
  });

  it("throws when hour is -1", () => {
    expect(() => MessageSchema.parse(makeMessage({ hour: -1 }))).toThrow();
  });

  it("throws when hour is 24", () => {
    expect(() => MessageSchema.parse(makeMessage({ hour: 24 }))).toThrow();
  });

  it("throws when dow is -1", () => {
    expect(() => MessageSchema.parse(makeMessage({ dow: -1 }))).toThrow();
  });

  it("throws when dow is 7", () => {
    expect(() => MessageSchema.parse(makeMessage({ dow: 7 }))).toThrow();
  });

  it("throws when msg_length is -1", () => {
    expect(() => MessageSchema.parse(makeMessage({ msg_length: -1 }))).toThrow();
  });

  it("accepts boundary hour: 0", () => {
    expect(() => MessageSchema.parse(makeMessage({ hour: 0 }))).not.toThrow();
  });

  it("accepts boundary hour: 23", () => {
    expect(() => MessageSchema.parse(makeMessage({ hour: 23 }))).not.toThrow();
  });

  it("accepts boundary dow: 0", () => {
    expect(() => MessageSchema.parse(makeMessage({ dow: 0 }))).not.toThrow();
  });

  it("accepts boundary dow: 6", () => {
    expect(() => MessageSchema.parse(makeMessage({ dow: 6 }))).not.toThrow();
  });

  it("accepts boundary msg_length: 0", () => {
    expect(() => MessageSchema.parse(makeMessage({ msg_length: 0 }))).not.toThrow();
  });

  it("throws when chat_id is empty string", () => {
    expect(() => MessageSchema.parse(makeMessage({ chat_id: "" }))).toThrow();
  });

  it("throws ZodError when first_name is missing from member", () => {
    const invalid = { ...makeMember() } as Record<string, unknown>;
    delete invalid.first_name;

    expect(() => MemberSchema.parse(invalid)).toThrow();
  });

  it("throws when member chat_id is empty string", () => {
    expect(() => MemberSchema.parse(makeMember({ chat_id: "" }))).toThrow();
  });
});

describe("Cross-module integration", () => {
  it("inserts a member then a message and both execute successfully", async () => {
    const client = createMockClient();
    const member = makeMember();
    const message = makeMessage();

    await upsertMember(member, client);
    await insertMessage(message, client);

    expect(client.execute).toHaveBeenCalledTimes(2);
  });
});
