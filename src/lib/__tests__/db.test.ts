import { describe, it, expect, beforeEach } from "bun:test";
import {
  _resetForTesting,
  dbCreateSession,
  dbGetSession,
  dbUpdateSession,
  dbListSessions,
  dbInsertMessage,
  dbGetMessages,
  dbInsertMemory,
  dbGetActiveMemories,
  dbSupersedeMemory,
  dbFindMemoryByFact,
  dbSearchMessages,
  dbSearchMemories,
  dbSearch,
} from "../db";

beforeEach(() => {
  _resetForTesting();
});

describe("sessions", () => {
  it("creates and retrieves a session", () => {
    dbCreateSession("s1", "Test Session", "2025-01-01T00:00:00Z");
    const session = dbGetSession("s1");
    expect(session).not.toBeNull();
    expect(session!.id).toBe("s1");
    expect(session!.title).toBe("Test Session");
    expect(session!.created_at).toBe("2025-01-01T00:00:00Z");
    expect(session!.updated_at).toBe("2025-01-01T00:00:00Z");
  });

  it("returns null for nonexistent session", () => {
    expect(dbGetSession("nonexistent")).toBeNull();
  });

  it("updates title and updated_at", () => {
    dbCreateSession("s1", "Original", "2025-01-01T00:00:00Z");
    dbUpdateSession("s1", { title: "Updated", updatedAt: "2025-01-01T01:00:00Z" });
    const session = dbGetSession("s1");
    expect(session!.title).toBe("Updated");
    expect(session!.updated_at).toBe("2025-01-01T01:00:00Z");
  });

  it("updates tags as JSON", () => {
    dbCreateSession("s1", "Tagged", "2025-01-01T00:00:00Z");
    dbUpdateSession("s1", { tags: ["dev", "test"] });
    const session = dbGetSession("s1");
    expect(JSON.parse(session!.tags)).toEqual(["dev", "test"]);
  });

  it("updates summary", () => {
    dbCreateSession("s1", "Summarized", "2025-01-01T00:00:00Z");
    dbUpdateSession("s1", { summary: "A brief chat about testing" });
    const session = dbGetSession("s1");
    expect(session!.summary).toBe("A brief chat about testing");
  });

  it("no-ops when no fields are provided", () => {
    dbCreateSession("s1", "Unchanged", "2025-01-01T00:00:00Z");
    dbUpdateSession("s1", {});
    const session = dbGetSession("s1");
    expect(session!.title).toBe("Unchanged");
  });

  it("lists sessions in descending created_at order", () => {
    dbCreateSession("s1", "First", "2025-01-01T00:00:00Z");
    dbCreateSession("s2", "Second", "2025-01-02T00:00:00Z");
    dbCreateSession("s3", "Third", "2025-01-03T00:00:00Z");
    const sessions = dbListSessions(10);
    expect(sessions).toHaveLength(3);
    expect(sessions[0].id).toBe("s3");
    expect(sessions[1].id).toBe("s2");
    expect(sessions[2].id).toBe("s1");
  });

  it("respects limit parameter", () => {
    dbCreateSession("s1", "First", "2025-01-01T00:00:00Z");
    dbCreateSession("s2", "Second", "2025-01-02T00:00:00Z");
    dbCreateSession("s3", "Third", "2025-01-03T00:00:00Z");
    const sessions = dbListSessions(2);
    expect(sessions).toHaveLength(2);
  });
});

describe("messages", () => {
  beforeEach(() => {
    dbCreateSession("s1", "Test", "2025-01-01T00:00:00Z");
  });

  it("inserts and retrieves messages", () => {
    dbInsertMessage("s1", "user", "Hello", "2025-01-01T00:00:01Z");
    dbInsertMessage("s1", "assistant", "Hi there!", "2025-01-01T00:00:02Z");
    const msgs = dbGetMessages("s1");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hello");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content).toBe("Hi there!");
  });

  it("preserves insertion order", () => {
    dbInsertMessage("s1", "user", "First", "2025-01-01T00:00:01Z");
    dbInsertMessage("s1", "assistant", "Second", "2025-01-01T00:00:02Z");
    dbInsertMessage("s1", "user", "Third", "2025-01-01T00:00:03Z");
    const msgs = dbGetMessages("s1");
    expect(msgs.map((m) => m.content)).toEqual(["First", "Second", "Third"]);
  });

  it("returns empty array for session with no messages", () => {
    expect(dbGetMessages("s1")).toEqual([]);
  });

  it("returns a positive row id on insert", () => {
    const id = dbInsertMessage("s1", "user", "Hello", "2025-01-01T00:00:01Z");
    expect(id).toBeGreaterThan(0);
  });

  it("stores token_count when provided", () => {
    dbInsertMessage("s1", "user", "Hello", "2025-01-01T00:00:01Z", 5);
    const msgs = dbGetMessages("s1");
    expect(msgs[0].token_count).toBe(5);
  });

  it("isolates messages by session", () => {
    dbCreateSession("s2", "Other", "2025-01-01T00:00:00Z");
    dbInsertMessage("s1", "user", "Session 1 msg", "2025-01-01T00:00:01Z");
    dbInsertMessage("s2", "user", "Session 2 msg", "2025-01-01T00:00:01Z");
    expect(dbGetMessages("s1")).toHaveLength(1);
    expect(dbGetMessages("s2")).toHaveLength(1);
  });
});

describe("memories", () => {
  it("inserts and retrieves active memories", () => {
    dbInsertMemory("User likes coffee", "general", null, "2025-01-01T00:00:00Z");
    const memories = dbGetActiveMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].fact).toBe("User likes coffee");
    expect(memories[0].category).toBe("general");
  });

  it("allows null source_session", () => {
    const id = dbInsertMemory("Standalone fact", "general", null, "2025-01-01T00:00:00Z");
    expect(id).toBeGreaterThan(0);
    const memories = dbGetActiveMemories();
    expect(memories[0].source_session).toBeNull();
  });

  it("links memory to source session", () => {
    dbCreateSession("s1", "Test", "2025-01-01T00:00:00Z");
    dbInsertMemory("Session fact", "general", "s1", "2025-01-01T00:00:00Z");
    const memories = dbGetActiveMemories();
    expect(memories[0].source_session).toBe("s1");
  });

  it("supersedes a memory, hiding the old one", () => {
    const oldId = dbInsertMemory("Old fact", "general", null, "2025-01-01T00:00:00Z");
    const newId = dbInsertMemory("New fact", "general", null, "2025-01-01T00:00:01Z");
    dbSupersedeMemory(oldId, newId);
    const active = dbGetActiveMemories();
    expect(active).toHaveLength(1);
    expect(active[0].fact).toBe("New fact");
  });

  it("finds memory by exact fact text", () => {
    dbInsertMemory("Exact match", "general", null, "2025-01-01T00:00:00Z");
    expect(dbFindMemoryByFact("Exact match")).not.toBeNull();
    expect(dbFindMemoryByFact("exact match")).toBeNull();
    expect(dbFindMemoryByFact("No match")).toBeNull();
  });

  it("does not find superseded memories by fact", () => {
    const oldId = dbInsertMemory("Superseded", "general", null, "2025-01-01T00:00:00Z");
    const newId = dbInsertMemory("Replacement", "general", null, "2025-01-01T00:00:01Z");
    dbSupersedeMemory(oldId, newId);
    expect(dbFindMemoryByFact("Superseded")).toBeNull();
    expect(dbFindMemoryByFact("Replacement")).not.toBeNull();
  });

  it("returns memories in created_at ASC order", () => {
    dbInsertMemory("Fact A", "general", null, "2025-01-01T00:00:00Z");
    dbInsertMemory("Fact B", "general", null, "2025-01-02T00:00:00Z");
    dbInsertMemory("Fact C", "general", null, "2025-01-03T00:00:00Z");
    const memories = dbGetActiveMemories();
    expect(memories.map((m) => m.fact)).toEqual(["Fact A", "Fact B", "Fact C"]);
  });
});

describe("FTS search", () => {
  beforeEach(() => {
    dbCreateSession("s1", "Coffee Chat", "2025-01-01T00:00:00Z");
  });

  it("searches messages by keyword", () => {
    dbInsertMessage("s1", "user", "I love coffee in the morning", "2025-01-01T00:00:01Z");
    dbInsertMessage("s1", "user", "Tea is also great", "2025-01-01T00:00:02Z");
    const results = dbSearchMessages("coffee", 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain("coffee");
    expect(results[0].source).toBe("message");
    expect(results[0].sessionId).toBe("s1");
  });

  it("includes session title in message search results", () => {
    dbInsertMessage("s1", "user", "I love coffee", "2025-01-01T00:00:01Z");
    const results = dbSearchMessages("coffee", 10);
    expect(results[0].sessionTitle).toBe("Coffee Chat");
  });

  it("searches memories by fact keyword", () => {
    dbInsertMemory("User drinks coffee daily", "general", "s1", "2025-01-01T00:00:00Z");
    dbInsertMemory("User works remotely", "general", "s1", "2025-01-01T00:00:01Z");
    const results = dbSearchMemories("coffee", 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain("coffee");
    expect(results[0].source).toBe("memory");
  });

  it("combined search returns both messages and memories", () => {
    dbInsertMessage("s1", "user", "I love coffee", "2025-01-01T00:00:01Z");
    dbInsertMemory("User drinks coffee", "general", "s1", "2025-01-01T00:00:00Z");
    const results = dbSearch("coffee", 10);
    expect(results.length).toBeGreaterThanOrEqual(2);
    const sources = new Set(results.map((r) => r.source));
    expect(sources.has("message")).toBe(true);
    expect(sources.has("memory")).toBe(true);
  });

  it("excludes superseded memories from search", () => {
    const oldId = dbInsertMemory("User loves coffee", "general", "s1", "2025-01-01T00:00:00Z");
    const newId = dbInsertMemory("User loves tea now", "general", "s1", "2025-01-01T00:00:01Z");
    dbSupersedeMemory(oldId, newId);
    const results = dbSearchMemories("coffee", 10);
    expect(results).toHaveLength(0);
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      dbInsertMessage("s1", "user", `Coffee message number ${i}`, `2025-01-01T00:00:0${i}Z`);
    }
    const results = dbSearchMessages("coffee", 2);
    expect(results).toHaveLength(2);
  });

  it("returns empty array when nothing matches", () => {
    dbInsertMessage("s1", "user", "Hello world", "2025-01-01T00:00:01Z");
    const results = dbSearchMessages("zzzznotaword", 10);
    expect(results).toEqual([]);
  });
});
