import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { readdirSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import {
  _resetForTesting,
  dbCreateSession,
  dbGetSession,
  dbGetMessages,
  dbInsertMessage,
} from "../db";
import {
  initSession,
  appendMessage,
  getCurrentSessionId,
  getCurrentMessages,
  loadSession,
  resumeSession,
  listRecentSessions,
  _initForTesting,
} from "../session";
import type { Message } from "../../types";

const SESSIONS_DIR = join(import.meta.dir, "../../../workspace/sessions");
let preExistingFiles: Set<string>;

beforeAll(() => {
  preExistingFiles = new Set(
    existsSync(SESSIONS_DIR) ? readdirSync(SESSIONS_DIR) : [],
  );
});

beforeEach(() => {
  _resetForTesting();
});

afterAll(() => {
  if (!existsSync(SESSIONS_DIR)) return;
  for (const file of readdirSync(SESSIONS_DIR)) {
    if (!preExistingFiles.has(file)) {
      try { unlinkSync(join(SESSIONS_DIR, file)); } catch {}
    }
  }
});

describe("initSession", () => {
  it("returns a session with a valid structure", () => {
    const session = initSession();
    expect(session.id).toBeTruthy();
    expect(session.title).toBe("New session");
    expect(session.messages).toEqual([]);
    expect(session.tags).toEqual([]);
    expect(session.created_at).toBeTruthy();
    expect(session.updated_at).toBeTruthy();
  });

  it("creates a corresponding DB record", () => {
    const session = initSession();
    const row = dbGetSession(session.id);
    expect(row).not.toBeNull();
    expect(row!.title).toBe("New session");
  });

  it("sets the current session id", () => {
    const session = initSession();
    expect(getCurrentSessionId()).toBe(session.id);
  });

  it("resets current messages to empty", () => {
    const session1 = initSession();
    appendMessage({ role: "user", content: "Hello", timestamp: new Date().toISOString() });
    expect(getCurrentMessages()).toHaveLength(1);

    initSession();
    expect(getCurrentMessages()).toEqual([]);
  });
});

describe("appendMessage", () => {
  let sessionId: string;

  beforeEach(() => {
    const session = initSession();
    sessionId = session.id;
  });

  it("persists a user message to the database", () => {
    const msg: Message = { role: "user", content: "Hello!", timestamp: "2025-01-01T00:00:01Z" };
    appendMessage(msg);

    const dbMsgs = dbGetMessages(sessionId);
    expect(dbMsgs).toHaveLength(1);
    expect(dbMsgs[0].role).toBe("user");
    expect(dbMsgs[0].content).toBe("Hello!");
  });

  it("persists an assistant message to the database", () => {
    appendMessage({ role: "user", content: "Hi", timestamp: "2025-01-01T00:00:01Z" });
    appendMessage({ role: "assistant", content: "Hello! How can I help?", timestamp: "2025-01-01T00:00:02Z" });

    const dbMsgs = dbGetMessages(sessionId);
    expect(dbMsgs).toHaveLength(2);
    expect(dbMsgs[1].role).toBe("assistant");
  });

  it("auto-titles session from first user message", () => {
    appendMessage({ role: "user", content: "Tell me about TypeScript generics", timestamp: "2025-01-01T00:00:01Z" });
    const row = dbGetSession(sessionId);
    expect(row!.title).toBe("Tell me about TypeScript generics");
  });

  it("truncates auto-title to 60 characters", () => {
    const longMsg = "A".repeat(100);
    appendMessage({ role: "user", content: longMsg, timestamp: "2025-01-01T00:00:01Z" });
    const row = dbGetSession(sessionId);
    expect(row!.title).toBe("A".repeat(60));
  });

  it("does not re-title on subsequent messages", () => {
    appendMessage({ role: "user", content: "First message", timestamp: "2025-01-01T00:00:01Z" });
    appendMessage({ role: "user", content: "Second message", timestamp: "2025-01-01T00:00:02Z" });
    const row = dbGetSession(sessionId);
    expect(row!.title).toBe("First message");
  });

  it("tracks messages in getCurrentMessages()", () => {
    appendMessage({ role: "user", content: "Hello", timestamp: "2025-01-01T00:00:01Z" });
    appendMessage({ role: "assistant", content: "Hi!", timestamp: "2025-01-01T00:00:02Z" });
    const msgs = getCurrentMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("Hello");
    expect(msgs[1].content).toBe("Hi!");
  });
});

describe("loadSession", () => {
  it("returns null for nonexistent session", () => {
    expect(loadSession("nonexistent")).toBeNull();
  });

  it("round-trips session data through the database", () => {
    dbCreateSession("load-test", "Load Test", "2025-01-01T00:00:00Z");
    dbInsertMessage("load-test", "user", "Hello", "2025-01-01T00:00:01Z");
    dbInsertMessage("load-test", "assistant", "Hi!", "2025-01-01T00:00:02Z");

    const session = loadSession("load-test");
    expect(session).not.toBeNull();
    expect(session!.id).toBe("load-test");
    expect(session!.title).toBe("Load Test");
    expect(session!.messages).toHaveLength(2);
    expect(session!.messages[0].role).toBe("user");
    expect(session!.messages[1].role).toBe("assistant");
  });
});

describe("resumeSession", () => {
  it("returns null for nonexistent session", () => {
    expect(resumeSession("nonexistent")).toBeNull();
  });

  it("restores session state as the current session", () => {
    dbCreateSession("resume-test", "Resume Test", "2025-01-01T00:00:00Z");
    dbInsertMessage("resume-test", "user", "Previous msg", "2025-01-01T00:00:01Z");

    const session = resumeSession("resume-test");
    expect(session).not.toBeNull();
    expect(getCurrentSessionId()).toBe("resume-test");
    expect(getCurrentMessages()).toHaveLength(1);
    expect(getCurrentMessages()[0].content).toBe("Previous msg");
  });
});

describe("listRecentSessions", () => {
  it("returns empty array when no sessions exist", () => {
    expect(listRecentSessions()).toEqual([]);
  });

  it("returns sessions with their messages", () => {
    dbCreateSession("list-1", "First", "2025-01-01T00:00:00Z");
    dbInsertMessage("list-1", "user", "Hello", "2025-01-01T00:00:01Z");
    dbCreateSession("list-2", "Second", "2025-01-02T00:00:00Z");

    const sessions = listRecentSessions(10);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("list-2");
    expect(sessions[1].id).toBe("list-1");
    expect(sessions[1].messages).toHaveLength(1);
  });

  it("respects the limit parameter", () => {
    dbCreateSession("list-1", "First", "2025-01-01T00:00:00Z");
    dbCreateSession("list-2", "Second", "2025-01-02T00:00:00Z");
    dbCreateSession("list-3", "Third", "2025-01-03T00:00:00Z");

    const sessions = listRecentSessions(2);
    expect(sessions).toHaveLength(2);
  });
});
