import { createClient, type Client, type ResultSet } from "@libsql/client";
import { randomBytes } from "crypto";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import { type DashboardData } from "../renderer/renderer.js";

const log = logger.child({ module: "db" });

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

async function initSchema(client: Client): Promise<void> {
  await client.execute(`
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

  await client.execute(`
    CREATE TABLE IF NOT EXISTS members (
      chat_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      username    TEXT,
      first_name  TEXT NOT NULL,
      last_seen   TEXT NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS cooldowns (
      chat_id TEXT PRIMARY KEY,
      last_stats_at TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_user_date
      ON messages(chat_id, user_id, date)
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_date
      ON messages(chat_id, date)
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS snapshots (
      token      TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

// --- Client Connection ---

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL ?? "file:./thread.db";
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

let db: Client | null = null;
let schemaInitialized = false;

async function getDb(): Promise<Client> {
  if (!db) {
    if (TURSO_DATABASE_URL.startsWith("file:")) {
      // Local development mode
      db = createClient({ url: TURSO_DATABASE_URL });
      log.info({ url: TURSO_DATABASE_URL }, "Database opened (local file)");
    } else {
      // Turso remote mode
      db = createClient({
        url: TURSO_DATABASE_URL,
        authToken: TURSO_AUTH_TOKEN,
      });
      log.info({ url: TURSO_DATABASE_URL }, "Database opened (Turso remote)");
    }
  }

  if (!schemaInitialized) {
    await initSchema(db);
    schemaInitialized = true;
  }

  return db;
}

// --- Data Access Functions ---

export async function upsertMember(member: Member): Promise<ResultSet> {
  const parsed = MemberSchema.parse(member);
  const client = await getDb();
  return await client.execute({
    sql: `
      INSERT INTO members (chat_id, user_id, username, first_name, last_seen)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chat_id, user_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_seen = excluded.last_seen
    `,
    args: [parsed.chat_id, parsed.user_id, parsed.username, parsed.first_name, parsed.last_seen],
  });
}

export async function insertMessage(message: Message): Promise<ResultSet> {
  const parsed = MessageSchema.parse(message);
  const client = await getDb();
  return await client.execute({
    sql: `
      INSERT INTO messages (chat_id, user_id, username, first_name, date, hour, dow, msg_length)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      parsed.chat_id,
      parsed.user_id,
      parsed.username,
      parsed.first_name,
      parsed.date,
      parsed.hour,
      parsed.dow,
      parsed.msg_length,
    ],
  });
}

export async function getMemberByUsername(
  chatId: string,
  username: string,
): Promise<{ user_id: string; first_name: string } | null> {
  const client = await getDb();
  const result = await client.execute({
    sql: `SELECT user_id, first_name FROM members WHERE chat_id = ? AND username = ?`,
    args: [chatId, username],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    user_id: row.user_id as string,
    first_name: row.first_name as string,
  };
}

export async function getCooldown(chatId: string): Promise<string | null> {
  const client = await getDb();
  const result = await client.execute({
    sql: `SELECT last_stats_at FROM cooldowns WHERE chat_id = ?`,
    args: [chatId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].last_stats_at as string;
}

export async function setCooldown(chatId: string, timestamp: string): Promise<void> {
  const client = await getDb();
  await client.execute({
    sql: `
      INSERT INTO cooldowns (chat_id, last_stats_at)
      VALUES (?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET last_stats_at = excluded.last_stats_at
    `,
    args: [chatId, timestamp],
  });
}

// --- Snapshot Functions ---

export function generateSnapshotToken(): string {
  return randomBytes(16).toString("hex");
}

export async function saveSnapshot(token: string, data: DashboardData): Promise<void> {
  const client = await getDb();
  await client.execute({
    sql: `INSERT INTO snapshots (token, data, created_at) VALUES (?, ?, ?)`,
    args: [token, JSON.stringify(data), new Date().toISOString()],
  });
}

// --- Exports ---

export async function getDbInstance(): Promise<Client> {
  return await getDb();
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    log.info("Database closed");
    db = null;
    schemaInitialized = false;
  }
}
