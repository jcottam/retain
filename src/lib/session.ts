import { join } from "path";
import { readdirSync, writeFileSync, existsSync, mkdirSync } from "fs";
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
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"));

  const next = String(existing.length + 1).padStart(3, "0");
  return `${prefix}_${next}`;
}

let currentSession: Session;

export function initSession(): Session {
  const id = nextSessionId();
  const now = new Date().toISOString();
  currentSession = {
    id,
    created_at: now,
    updated_at: now,
    title: "New session",
    tags: [],
    messages: [],
  };
  return currentSession;
}

export function appendMessage(msg: Message): void {
  currentSession.messages.push(msg);
  currentSession.updated_at = new Date().toISOString();

  // Use first user message as title
  if (currentSession.title === "New session") {
    const firstUser = currentSession.messages.find((m) => m.role === "user");
    if (firstUser) {
      currentSession.title = firstUser.content.slice(0, 60);
    }
  }

  saveSession();
}

function saveSession(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  const filePath = join(SESSIONS_DIR, `${currentSession.id}.json`);
  writeFileSync(filePath, JSON.stringify(currentSession, null, 2), "utf-8");
}
