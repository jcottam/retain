import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  _resetForTesting,
  dbCreateSession,
  dbGetActiveMemories,
  dbFindMemoryByFact,
} from "../db";
import { _initForTesting } from "../session";
import { extractAndSaveMemories, getActiveMemories } from "../memory";

const SESSION_ID = "test-mem-001";
const MEMORY_FILE = join(import.meta.dir, "../../../workspace/context/MEMORY.md");
let originalMemoryContent: string | null = null;

beforeAll(() => {
  if (existsSync(MEMORY_FILE)) {
    originalMemoryContent = readFileSync(MEMORY_FILE, "utf-8");
  }
});

beforeEach(() => {
  _resetForTesting();
  dbCreateSession(SESSION_ID, "Memory Test", "2025-01-01T00:00:00Z");
  _initForTesting(SESSION_ID);
});

afterAll(() => {
  if (originalMemoryContent !== null) {
    writeFileSync(MEMORY_FILE, originalMemoryContent, "utf-8");
  }
});

describe("extractAndSaveMemories", () => {
  it("extracts a single-line [MEMORY] fact", () => {
    const text = "Sure thing!\n[MEMORY] Jamie loves skiing\nAnything else?";
    const saved = extractAndSaveMemories(text);
    expect(saved).toEqual(["Jamie loves skiing"]);
    expect(dbGetActiveMemories()).toHaveLength(1);
    expect(dbGetActiveMemories()[0].fact).toBe("Jamie loves skiing");
  });

  it("extracts multiple single-line [MEMORY] facts", () => {
    const text = [
      "Got it!",
      "[MEMORY] User prefers dark mode",
      "Also noted:",
      "[MEMORY] User works at Acme Corp",
    ].join("\n");
    const saved = extractAndSaveMemories(text);
    expect(saved).toHaveLength(2);
    expect(saved).toContain("User prefers dark mode");
    expect(saved).toContain("User works at Acme Corp");
  });

  it("extracts multi-line bullet format", () => {
    const text = [
      "[MEMORY] Updated facts:",
      "- Likes TypeScript",
      "- Uses Bun runtime",
      "- Prefers TUI apps",
      "",
      "Let me know if you need anything else.",
    ].join("\n");
    const saved = extractAndSaveMemories(text);
    expect(saved).toEqual(["Likes TypeScript", "Uses Bun runtime", "Prefers TUI apps"]);
    expect(dbGetActiveMemories()).toHaveLength(3);
  });

  it("deduplicates identical facts", () => {
    const text1 = "[MEMORY] User likes coffee";
    extractAndSaveMemories(text1);
    expect(dbGetActiveMemories()).toHaveLength(1);

    const text2 = "[MEMORY] User likes coffee";
    const saved = extractAndSaveMemories(text2);
    expect(saved).toEqual([]);
    expect(dbGetActiveMemories()).toHaveLength(1);
  });

  it("strips 'added to' / 'updated to' prefixes", () => {
    const text = "[MEMORY] Added to memories: User has a cat named Pixel";
    const saved = extractAndSaveMemories(text);
    expect(saved).toEqual(["User has a cat named Pixel"]);
  });

  it("extracts first sentence from long inline text", () => {
    const text = "[MEMORY] User enjoys hiking. They also mentioned they live in Colorado.";
    const saved = extractAndSaveMemories(text);
    expect(saved).toEqual(["User enjoys hiking."]);
  });

  it("strips trailing punctuation from simple facts", () => {
    const text = "[MEMORY] User's favorite color is blue.";
    const saved = extractAndSaveMemories(text);
    expect(saved).toEqual(["User's favorite color is blue"]);
  });

  it("returns empty array when no [MEMORY] tags present", () => {
    const text = "Just a normal response with no memory tags.";
    const saved = extractAndSaveMemories(text);
    expect(saved).toEqual([]);
  });

  it("handles [MEMORY] at start of response", () => {
    const text = "[MEMORY] First line is a memory";
    const saved = extractAndSaveMemories(text);
    expect(saved).toHaveLength(1);
  });

  it("handles indented [MEMORY] tags", () => {
    const text = "  [MEMORY] Indented fact";
    const saved = extractAndSaveMemories(text);
    expect(saved).toEqual(["Indented fact"]);
  });

  it("ignores empty [MEMORY] lines", () => {
    const text = "[MEMORY] ";
    const saved = extractAndSaveMemories(text);
    expect(saved).toEqual([]);
  });

  it("persists memories to the database with correct metadata", () => {
    extractAndSaveMemories("[MEMORY] User is a software engineer");
    const memories = dbGetActiveMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].category).toBe("general");
    expect(memories[0].source_session).toBe(SESSION_ID);
    expect(memories[0].superseded_by).toBeNull();
  });
});

describe("getActiveMemories", () => {
  it("returns all non-superseded memories", () => {
    extractAndSaveMemories("[MEMORY] Fact one");
    extractAndSaveMemories("[MEMORY] Fact two");
    const memories = getActiveMemories();
    expect(memories).toHaveLength(2);
  });

  it("returns empty array when no memories exist", () => {
    expect(getActiveMemories()).toEqual([]);
  });
});
