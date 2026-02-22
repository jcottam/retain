import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const WORKSPACE_ROOT = join(import.meta.dir, "../../workspace/");
const DB_PATH = join(WORKSPACE_ROOT, "minichat.db");

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  if (!existsSync(WORKSPACE_ROOT)) {
    mkdirSync(WORKSPACE_ROOT, { recursive: true });
  }

  _db = new Database(DB_PATH, { create: true });
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");

  runMigrations(_db);
  return _db;
}

function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);

  const row = db.query("SELECT MAX(version) as v FROM schema_version").get() as { v: number | null } | null;
  const current = row?.v ?? 0;

  if (current < 1) applyV1(db);
}

function applyV1(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      tags TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      token_count INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fact TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      source_session TEXT REFERENCES sessions(id),
      created_at TEXT NOT NULL,
      superseded_by INTEGER REFERENCES memories(id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      content=messages,
      content_rowid=id
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      fact,
      content=memories,
      content_rowid=id
    );
  `);

  // Triggers to keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, fact) VALUES (new.id, new.fact);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, fact) VALUES ('delete', old.id, old.fact);
    END;
  `);

  db.exec("INSERT INTO schema_version (version) VALUES (1)");
}

export function _resetForTesting(): Database {
  if (_db) _db.close();
  _db = new Database(":memory:");
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  runMigrations(_db);
  return _db;
}

// --- Session helpers ---

export function dbCreateSession(id: string, title: string, createdAt: string): void {
  getDb().query(
    "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run(id, title, createdAt, createdAt);
}

export function dbUpdateSession(id: string, fields: { title?: string; summary?: string; updatedAt?: string; tags?: string[] }): void {
  const sets: string[] = [];
  const vals: string[] = [];

  if (fields.title !== undefined) { sets.push("title = ?"); vals.push(fields.title); }
  if (fields.summary !== undefined) { sets.push("summary = ?"); vals.push(fields.summary); }
  if (fields.updatedAt !== undefined) { sets.push("updated_at = ?"); vals.push(fields.updatedAt); }
  if (fields.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(fields.tags)); }

  if (sets.length === 0) return;
  vals.push(id);
  getDb().query(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

export interface SessionRow {
  id: string;
  title: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  tags: string;
}

export function dbGetSession(id: string): SessionRow | null {
  return getDb().query("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | null;
}

export function dbListSessions(limit = 20): SessionRow[] {
  return getDb().query("SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?").all(limit) as SessionRow[];
}

export function dbDeleteSession(id: string): void {
  const db = getDb();
  db.query("DELETE FROM messages WHERE session_id = ?").run(id);
  db.query("DELETE FROM sessions WHERE id = ?").run(id);
}

// --- Message helpers ---

export interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  token_count: number | null;
}

export function dbInsertMessage(sessionId: string, role: string, content: string, timestamp: string, tokenCount?: number): number {
  const result = getDb().query(
    "INSERT INTO messages (session_id, role, content, timestamp, token_count) VALUES (?, ?, ?, ?, ?)"
  ).run(sessionId, role, content, timestamp, tokenCount ?? null);
  return Number(result.lastInsertRowid);
}

export function dbGetMessages(sessionId: string): MessageRow[] {
  return getDb().query(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC"
  ).all(sessionId) as MessageRow[];
}

// --- Memory helpers ---

export interface MemoryRow {
  id: number;
  fact: string;
  category: string;
  source_session: string | null;
  created_at: string;
  superseded_by: number | null;
}

export function dbInsertMemory(fact: string, category: string, sourceSession: string | null, createdAt: string): number {
  const result = getDb().query(
    "INSERT INTO memories (fact, category, source_session, created_at) VALUES (?, ?, ?, ?)"
  ).run(fact, category, sourceSession, createdAt);
  return Number(result.lastInsertRowid);
}

export function dbGetActiveMemories(): MemoryRow[] {
  return getDb().query(
    "SELECT * FROM memories WHERE superseded_by IS NULL ORDER BY created_at ASC"
  ).all() as MemoryRow[];
}

export function dbSupersedeMemory(oldId: number, newId: number): void {
  getDb().query("UPDATE memories SET superseded_by = ? WHERE id = ?").run(newId, oldId);
}

export function dbFindMemoryByFact(fact: string): MemoryRow | null {
  return getDb().query(
    "SELECT * FROM memories WHERE fact = ? AND superseded_by IS NULL"
  ).get(fact) as MemoryRow | null;
}

// --- FTS search helpers ---

export interface SearchResult {
  source: "message" | "memory";
  content: string;
  sessionId?: string;
  sessionTitle?: string;
  timestamp?: string;
  rank: number;
}

export function dbSearchMessages(query: string, limit = 10): SearchResult[] {
  const rows = getDb().query(`
    SELECT m.content, m.session_id, m.timestamp, s.title as session_title,
           rank
    FROM messages_fts
    JOIN messages m ON m.id = messages_fts.rowid
    LEFT JOIN sessions s ON s.id = m.session_id
    WHERE messages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as Array<{ content: string; session_id: string; timestamp: string; session_title: string | null; rank: number }>;

  return rows.map((r) => ({
    source: "message" as const,
    content: r.content,
    sessionId: r.session_id,
    sessionTitle: r.session_title ?? undefined,
    timestamp: r.timestamp,
    rank: r.rank,
  }));
}

export function dbSearchMemories(query: string, limit = 10): SearchResult[] {
  const rows = getDb().query(`
    SELECT mem.fact as content, mem.source_session as session_id, mem.created_at as timestamp,
           rank
    FROM memories_fts
    JOIN memories mem ON mem.id = memories_fts.rowid
    WHERE memories_fts MATCH ? AND mem.superseded_by IS NULL
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as Array<{ content: string; session_id: string | null; timestamp: string; rank: number }>;

  return rows.map((r) => ({
    source: "memory" as const,
    content: r.content,
    sessionId: r.session_id ?? undefined,
    timestamp: r.timestamp,
    rank: r.rank,
  }));
}

export function dbSearch(query: string, limit = 10): SearchResult[] {
  const messages = dbSearchMessages(query, limit);
  const memories = dbSearchMemories(query, limit);
  return [...memories, ...messages].sort((a, b) => a.rank - b.rank).slice(0, limit);
}
