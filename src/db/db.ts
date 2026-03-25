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
