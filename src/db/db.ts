import Database from "better-sqlite3";

const DATABASE_PATH = process.env.DATABASE_PATH ?? "./thread.db";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DATABASE_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

// Initialize the connection eagerly
const instance = getDb();

instance.exec(`
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

instance.exec(`
  CREATE TABLE IF NOT EXISTS members (
    chat_id     TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    username    TEXT,
    first_name  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    PRIMARY KEY (chat_id, user_id)
  )
`);
