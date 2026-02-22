import { join } from "path";
import { readdirSync, readFileSync, existsSync } from "fs";
import {
  getDb,
  dbCreateSession,
  dbUpdateSession,
  dbInsertMessage,
  dbInsertMemory,
  dbGetSession,
} from "./db";

const WORKSPACE_ROOT = join(import.meta.dir, "../../workspace/");
const SESSIONS_DIR = join(WORKSPACE_ROOT, "sessions");
const MEMORIES_DIR = join(WORKSPACE_ROOT, "context");

export function migrateExistingData(): { sessions: number; messages: number; memories: number } {
  const db = getDb();
  const counts = { sessions: 0, messages: 0, memories: 0 };

  counts.sessions += migrateSessions();
  counts.messages = db.query("SELECT COUNT(*) as c FROM messages").get() as unknown as number;
  counts.memories += migrateMemoryFile();

  return counts;
}

function migrateSessions(): number {
  if (!existsSync(SESSIONS_DIR)) return 0;

  const files = readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();

  let count = 0;
  for (const file of files) {
    const filePath = join(SESSIONS_DIR, file);
    const migrated = migrateOneSession(filePath);
    if (migrated) count++;
  }
  return count;
}

function migrateOneSession(filePath: string): boolean {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());

  let sessionId = "";
  let title = "New session";
  let createdAt = "";
  let updatedAt = "";
  const messages: Array<{ role: string; content: string; timestamp: string }> = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === "meta") {
        sessionId = obj.id;
        title = obj.title || title;
        createdAt = createdAt || obj.created_at;
        updatedAt = obj.updated_at || createdAt;
      } else if (obj.type === "message") {
        messages.push({ role: obj.role, content: obj.content, timestamp: obj.timestamp });
      }
    } catch {
      continue;
    }
  }

  if (!sessionId || !createdAt) return false;
  if (dbGetSession(sessionId)) return false;

  dbCreateSession(sessionId, title, createdAt);
  dbUpdateSession(sessionId, { updatedAt });

  for (const msg of messages) {
    dbInsertMessage(sessionId, msg.role, msg.content, msg.timestamp);
  }

  return true;
}

function migrateMemoryFile(): number {
  const memoryFile = join(MEMORIES_DIR, "MEMORY.md");
  if (!existsSync(memoryFile)) return 0;

  const content = readFileSync(memoryFile, "utf-8");
  const lines = content.split("\n");
  let count = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;

    const fact = trimmed.slice(2).trim();
    if (!fact) continue;

    const existing = getDb()
      .query("SELECT id FROM memories WHERE fact = ?")
      .get(fact);
    if (existing) continue;

    dbInsertMemory(fact, "general", null, new Date().toISOString());
    count++;
  }

  return count;
}
