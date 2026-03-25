import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  initSchema,
  upsertMember,
  insertMessage,
  MessageSchema,
  MemberSchema,
} from "./db.js";
import type { Member, Message } from "./db.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
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
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("inserts a new member with correct fields", () => {
    const member = makeMember();
    upsertMember(member, db);

    const row = db
      .prepare("SELECT * FROM members WHERE chat_id = ? AND user_id = ?")
      .get(member.chat_id, member.user_id) as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.chat_id).toBe("chat1");
    expect(row.user_id).toBe("user1");
    expect(row.username).toBe("alice");
    expect(row.first_name).toBe("Alice");
    expect(row.last_seen).toBe("2024-01-15T10:30:00Z");
  });

  it("updates existing member on conflict", () => {
    upsertMember(makeMember(), db);
    upsertMember(
      makeMember({
        username: "alice_new",
        first_name: "Alice Updated",
        last_seen: "2024-02-01T00:00:00Z",
      }),
      db,
    );

    const row = db
      .prepare("SELECT * FROM members WHERE chat_id = ? AND user_id = ?")
      .get("chat1", "user1") as Record<string, unknown>;

    expect(row.username).toBe("alice_new");
    expect(row.first_name).toBe("Alice Updated");
    expect(row.last_seen).toBe("2024-02-01T00:00:00Z");
  });

  it("stores null username when username is null", () => {
    upsertMember(makeMember({ username: null }), db);

    const row = db
      .prepare("SELECT * FROM members WHERE chat_id = ? AND user_id = ?")
      .get("chat1", "user1") as Record<string, unknown>;

    expect(row.username).toBeNull();
  });

  it("keeps only the latest first_name after two upserts", () => {
    upsertMember(makeMember({ first_name: "Alice" }), db);
    upsertMember(makeMember({ first_name: "Alicia" }), db);

    const row = db
      .prepare("SELECT * FROM members WHERE chat_id = ? AND user_id = ?")
      .get("chat1", "user1") as Record<string, unknown>;

    expect(row.first_name).toBe("Alicia");
  });

  it("stores same user_id in different chats as separate rows", () => {
    upsertMember(makeMember({ chat_id: "chatA" }), db);
    upsertMember(makeMember({ chat_id: "chatB" }), db);

    const count = db
      .prepare("SELECT COUNT(*) AS cnt FROM members WHERE user_id = ?")
      .get("user1") as { cnt: number };

    expect(count.cnt).toBe(2);
  });
});

describe("insertMessage", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("inserts a valid message with all fields", () => {
    const msg = makeMessage();
    insertMessage(msg, db);

    const row = db
      .prepare("SELECT * FROM messages WHERE chat_id = ? AND user_id = ?")
      .get(msg.chat_id, msg.user_id) as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.chat_id).toBe("chat1");
    expect(row.user_id).toBe("user1");
    expect(row.username).toBe("alice");
    expect(row.first_name).toBe("Alice");
    expect(row.date).toBe("2024-01-15");
    expect(row.hour).toBe(10);
    expect(row.dow).toBe(0);
    expect(row.msg_length).toBe(42);
  });

  it("does not deduplicate — multiple messages for same user/date persist", () => {
    insertMessage(makeMessage(), db);
    insertMessage(makeMessage(), db);
    insertMessage(makeMessage(), db);

    const count = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = ? AND user_id = ?",
      )
      .get("chat1", "user1") as { cnt: number };

    expect(count.cnt).toBe(3);
  });

  it("accepts msg_length of 0 for non-text messages", () => {
    insertMessage(makeMessage({ msg_length: 0 }), db);

    const row = db
      .prepare("SELECT msg_length FROM messages WHERE chat_id = ? AND user_id = ?")
      .get("chat1", "user1") as { msg_length: number };

    expect(row.msg_length).toBe(0);
  });

  it("accepts null username", () => {
    insertMessage(makeMessage({ username: null }), db);

    const row = db
      .prepare("SELECT username FROM messages WHERE chat_id = ? AND user_id = ?")
      .get("chat1", "user1") as { username: string | null };

    expect(row.username).toBeNull();
  });

  it("auto-increments id across inserts", () => {
    insertMessage(makeMessage(), db);
    insertMessage(makeMessage(), db);

    const rows = db
      .prepare("SELECT id FROM messages ORDER BY id")
      .all() as { id: number }[];

    expect(rows).toHaveLength(2);
    expect(rows[1].id).toBeGreaterThan(rows[0].id);
  });
});

describe("Zod validation", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("throws ZodError when first_name is missing from message", () => {
    const invalid = { ...makeMessage() } as Record<string, unknown>;
    delete invalid.first_name;

    expect(() => insertMessage(invalid as Message, db)).toThrow();
  });

  it("throws when hour is -1", () => {
    expect(() => insertMessage(makeMessage({ hour: -1 }), db)).toThrow();
  });

  it("throws when hour is 24", () => {
    expect(() => insertMessage(makeMessage({ hour: 24 }), db)).toThrow();
  });

  it("throws when dow is -1", () => {
    expect(() => insertMessage(makeMessage({ dow: -1 }), db)).toThrow();
  });

  it("throws when dow is 7", () => {
    expect(() => insertMessage(makeMessage({ dow: 7 }), db)).toThrow();
  });

  it("throws when msg_length is -1", () => {
    expect(() => insertMessage(makeMessage({ msg_length: -1 }), db)).toThrow();
  });

  it("accepts boundary hour: 0", () => {
    expect(() => insertMessage(makeMessage({ hour: 0 }), db)).not.toThrow();
  });

  it("accepts boundary hour: 23", () => {
    expect(() => insertMessage(makeMessage({ hour: 23 }), db)).not.toThrow();
  });

  it("accepts boundary dow: 0", () => {
    expect(() => insertMessage(makeMessage({ dow: 0 }), db)).not.toThrow();
  });

  it("accepts boundary dow: 6", () => {
    expect(() => insertMessage(makeMessage({ dow: 6 }), db)).not.toThrow();
  });

  it("accepts boundary msg_length: 0", () => {
    expect(() => insertMessage(makeMessage({ msg_length: 0 }), db)).not.toThrow();
  });

  it("throws when chat_id is empty string", () => {
    expect(() =>
      insertMessage(makeMessage({ chat_id: "" }), db),
    ).toThrow();
  });

  it("throws ZodError when first_name is missing from member", () => {
    const invalid = { ...makeMember() } as Record<string, unknown>;
    delete invalid.first_name;

    expect(() => upsertMember(invalid as Member, db)).toThrow();
  });

  it("throws when member chat_id is empty string", () => {
    expect(() =>
      upsertMember(makeMember({ chat_id: "" }), db),
    ).toThrow();
  });
});

describe("Cross-module integration", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("inserts a member then a message and both are queryable", () => {
    const member = makeMember();
    const message = makeMessage();

    upsertMember(member, db);
    insertMessage(message, db);

    const memberRow = db
      .prepare("SELECT * FROM members WHERE chat_id = ? AND user_id = ?")
      .get("chat1", "user1") as Record<string, unknown>;

    const messageRow = db
      .prepare("SELECT * FROM messages WHERE chat_id = ? AND user_id = ?")
      .get("chat1", "user1") as Record<string, unknown>;

    expect(memberRow).toBeDefined();
    expect(memberRow.first_name).toBe("Alice");

    expect(messageRow).toBeDefined();
    expect(messageRow.first_name).toBe("Alice");
    expect(messageRow.date).toBe("2024-01-15");
  });
});
