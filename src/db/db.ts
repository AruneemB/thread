import Database from "better-sqlite3";
import { z } from "zod";

// --- Zod Validation Schemas ---

export const MessageSchema = z.object({
  chat_id: z.string().min(1),
  user_id: z.string().min(1),
  username: z.string().nullable(),
  first_name: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hour: z.number().int().min(0).max(23),
  dow: z.number().int().min(0).max(6),
  msg_length: z.number().int().min(0),
});

export const MemberSchema = z.object({
  chat_id: z.string().min(1),
  user_id: z.string().min(1),
  username: z.string().nullable(),
  first_name: z.string(),
  last_seen: z.string(),
});

export type Message = z.infer<typeof MessageSchema>;
export type Member = z.infer<typeof MemberSchema>;

// --- Schema Initialization ---

export function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id     TEXT    NOT NULL,
      user_id     TEXT    NOT NULL,
      username    TEXT,
      first_name  TEXT    NOT NULL,
      date        TEXT    NOT NULL,
      hour        INTEGER NOT NULL,
      dow         INTEGER NOT NULL,
      msg_length  INTEGER NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS members (
      chat_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      username    TEXT,
      first_name  TEXT NOT NULL,
      last_seen   TEXT NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_user_date
      ON messages(chat_id, user_id, date)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_date
      ON messages(chat_id, date)
  `);
}

// --- Singleton Connection ---

const DATABASE_PATH = process.env.DATABASE_PATH ?? "./thread.db";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DATABASE_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

const instance = getDb();

// --- Data Access Functions ---

export function upsertMember(member: Member, database?: Database.Database): Database.RunResult {
  const parsed = MemberSchema.parse(member);
  const target = database ?? instance;
  const stmt = target.prepare(`
    INSERT INTO members (chat_id, user_id, username, first_name, last_seen)
    VALUES (@chat_id, @user_id, @username, @first_name, @last_seen)
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_seen = excluded.last_seen
  `);
  return stmt.run(parsed);
}

export function insertMessage(message: Message, database?: Database.Database): Database.RunResult {
  const parsed = MessageSchema.parse(message);
  const target = database ?? instance;
  const stmt = target.prepare(`
    INSERT INTO messages (chat_id, user_id, username, first_name, date, hour, dow, msg_length)
    VALUES (@chat_id, @user_id, @username, @first_name, @date, @hour, @dow, @msg_length)
  `);
  return stmt.run(parsed);
}

// --- Exports ---

export { instance as db };

export function closeDb(): void {
  instance.close();
}
