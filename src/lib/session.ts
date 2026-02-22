import { readdirSync, existsSync, mkdirSync, writeFileSync, appendFileSync, unlinkSync } from "fs";
import { join } from "path";
import {
  dbCreateSession,
  dbUpdateSession,
  dbDeleteSession,
  dbInsertMessage,
  dbGetMessages,
  dbGetSession,
  dbListSessions,
  type SessionRow,
  type MessageRow,
} from "./db";
import { isVectorEnabled, upsertSessionSummary } from "./vector";
import type { Message, Session } from "../types";

const STORE_ROOT = join(import.meta.dir, "../../workspace/");
const SESSIONS_DIR = join(STORE_ROOT, "sessions");

function todayPrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `session_${y}${m}${d}`;
}

function nextSessionId(): string {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  const prefix = todayPrefix();
  const existing = readdirSync(SESSIONS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".jsonl"));

  const dbSessions = dbListSessions(100)
    .filter((s) => s.id.startsWith(prefix));

  const maxCount = Math.max(existing.length, dbSessions.length);
  return `${prefix}_${String(maxCount + 1).padStart(3, "0")}`;
}

let currentSessionId: string;
let currentMessages: Message[] = [];
let sessionFile: string;
const ownedSessionIds: string[] = [];

function jsonlLine(obj: object): void {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
  appendFileSync(sessionFile, JSON.stringify(obj) + "\n", "utf-8");
}

export function initSession(): Session {
  const id = nextSessionId();
  const now = new Date().toISOString();
  currentSessionId = id;
  currentMessages = [];
  sessionFile = join(SESSIONS_DIR, `${id}.jsonl`);
  ownedSessionIds.push(id);

  dbCreateSession(id, "New session", now);

  const meta = { type: "meta", id, created_at: now, updated_at: now, title: "New session", tags: [] as string[] };
  writeFileSync(sessionFile, JSON.stringify(meta) + "\n", "utf-8");

  return {
    id,
    created_at: now,
    updated_at: now,
    title: "New session",
    tags: [],
    messages: [],
  };
}

export function appendMessage(msg: Message): void {
  const session = dbGetSession(currentSessionId);
  if (!session) return;

  const wasUntitled = session.title === "New session";
  currentMessages.push(msg);

  const now = new Date().toISOString();
  dbInsertMessage(currentSessionId, msg.role, msg.content, msg.timestamp);

  if (wasUntitled && msg.role === "user") {
    const title = msg.content.slice(0, 60);
    dbUpdateSession(currentSessionId, { title, updatedAt: now });
    jsonlLine({ type: "meta", id: currentSessionId, created_at: session.created_at, updated_at: now, title, tags: [] });
  } else {
    dbUpdateSession(currentSessionId, { updatedAt: now });
  }

  jsonlLine({ type: "message", role: msg.role, content: msg.content, timestamp: msg.timestamp });
}

export function getCurrentSessionId(): string {
  return currentSessionId;
}

export function _initForTesting(sessionId: string): void {
  currentSessionId = sessionId;
  currentMessages = [];
}

export function getCurrentMessages(): Message[] {
  return currentMessages;
}

export function loadSession(sessionId: string): Session | null {
  const row = dbGetSession(sessionId);
  if (!row) return null;

  const msgRows = dbGetMessages(sessionId);
  return rowToSession(row, msgRows);
}

export function resumeSession(sessionId: string): Session | null {
  const session = loadSession(sessionId);
  if (!session) return null;

  currentSessionId = sessionId;
  currentMessages = [...session.messages];
  return session;
}

export function listRecentSessions(limit = 20): Session[] {
  const rows = dbListSessions(limit);
  return rows.map((row) => {
    const msgs = dbGetMessages(row.id);
    return rowToSession(row, msgs);
  });
}

/**
 * Embeds the current session into Upstash Vector.
 * Builds a text summary from the session title + message excerpts,
 * then upserts it as a session embedding.
 */
export function embedCurrentSession(): void {
  if (!isVectorEnabled()) return;

  const session = dbGetSession(currentSessionId);
  if (!session || session.title === "New session") return;

  const msgs = dbGetMessages(currentSessionId);
  if (msgs.length === 0) return;

  const excerpts = msgs.slice(0, 10).map((m) => {
    const role = m.role === "user" ? "User" : "Assistant";
    return `${role}: ${m.content.slice(0, 200)}`;
  });
  const summaryText = `Session: "${session.title}"\n${excerpts.join("\n")}`;

  upsertSessionSummary(
    currentSessionId,
    session.title ?? "Untitled",
    summaryText,
    session.created_at,
  ).catch(() => {});
}

/**
 * Embeds a session with a provided summary (e.g. from /compact).
 */
export function embedSessionWithSummary(summary: string): void {
  if (!isVectorEnabled()) return;

  const session = dbGetSession(currentSessionId);
  if (!session) return;

  upsertSessionSummary(
    currentSessionId,
    session.title ?? "Untitled",
    summary,
    session.created_at,
  ).catch(() => {});
}

export function cleanupEmptySessions(): void {
  console.log("Cleaning up empty sessions");
  for (const id of ownedSessionIds) {
    const msgs = dbGetMessages(id);
    if (msgs.length > 0) continue;

    dbDeleteSession(id);
    const file = join(SESSIONS_DIR, `${id}.jsonl`);
    if (existsSync(file)) unlinkSync(file);
  }
}

function rowToSession(row: SessionRow, msgs: MessageRow[]): Session {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    title: row.title ?? "Untitled",
    tags: JSON.parse(row.tags || "[]"),
    messages: msgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: m.timestamp,
    })),
  };
}
