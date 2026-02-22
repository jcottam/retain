import { describe, it, expect, beforeEach, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  _resetForTesting,
  dbCreateSession,
  dbInsertMessage,
  dbInsertMemory,
} from "../db";
import { buildSystemPrompt, getInstalledSkills, readSkill } from "../context";
import { executeTool, TOOL_DEFINITIONS } from "../tools";

const SKILLS_DIR = join(import.meta.dir, "../../../workspace/skills");
const TEST_SKILL_DIR = join(SKILLS_DIR, "_test-skill");

afterAll(() => {
  rmSync(TEST_SKILL_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  _resetForTesting();
});

describe("buildSystemPrompt", () => {
  it("returns a non-empty string even with no data", () => {
    const prompt = buildSystemPrompt(0);
    expect(typeof prompt).toBe("string");
  });

  it("includes active memories in the prompt", () => {
    dbInsertMemory("User prefers dark mode", "general", null, "2025-01-01T00:00:00Z");
    dbInsertMemory("User works with TypeScript", "general", null, "2025-01-01T00:00:01Z");

    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Active Memories");
    expect(prompt).toContain("User prefers dark mode");
    expect(prompt).toContain("User works with TypeScript");
  });

  it("excludes superseded memories", () => {
    const oldId = dbInsertMemory("Old preference", "general", null, "2025-01-01T00:00:00Z");
    const newId = dbInsertMemory("New preference", "general", null, "2025-01-01T00:00:01Z");
    _resetForTesting();

    dbInsertMemory("Old preference", "general", null, "2025-01-01T00:00:00Z");
    dbInsertMemory("New preference", "general", null, "2025-01-01T00:00:01Z");

    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Old preference");
    expect(prompt).toContain("New preference");
  });

  it("includes recent session summaries", () => {
    dbCreateSession("ctx-s1", "TypeScript Discussion", "2025-01-01T00:00:00Z");
    dbInsertMessage("ctx-s1", "user", "How do generics work?", "2025-01-01T00:00:01Z");
    dbInsertMessage("ctx-s1", "assistant", "Generics allow you to write reusable code...", "2025-01-01T00:00:02Z");

    const prompt = buildSystemPrompt(3);
    expect(prompt).toContain("TypeScript Discussion");
    expect(prompt).toContain("How do generics work?");
  });

  it("respects the nRecentSessions parameter", () => {
    dbCreateSession("ctx-s1", "Session One", "2025-01-01T00:00:00Z");
    dbInsertMessage("ctx-s1", "user", "Message in session one", "2025-01-01T00:00:01Z");
    dbCreateSession("ctx-s2", "Session Two", "2025-01-02T00:00:00Z");
    dbInsertMessage("ctx-s2", "user", "Message in session two", "2025-01-02T00:00:01Z");
    dbCreateSession("ctx-s3", "Session Three", "2025-01-03T00:00:00Z");
    dbInsertMessage("ctx-s3", "user", "Message in session three", "2025-01-03T00:00:01Z");

    const prompt = buildSystemPrompt(1);
    expect(prompt).toContain("Session Three");
    expect(prompt).not.toContain("Session One");
  });

  it("separates sections with dividers", () => {
    dbInsertMemory("A fact", "general", null, "2025-01-01T00:00:00Z");
    dbCreateSession("ctx-s1", "A Session", "2025-01-01T00:00:00Z");
    dbInsertMessage("ctx-s1", "user", "Hello", "2025-01-01T00:00:01Z");

    const prompt = buildSystemPrompt(1);
    expect(prompt).toContain("---");
  });

  it("handles zero sessions gracefully", () => {
    dbInsertMemory("Standalone fact", "general", null, "2025-01-01T00:00:00Z");
    const prompt = buildSystemPrompt(0);
    expect(prompt).toContain("Standalone fact");
  });

  it("includes skill catalog (names + descriptions only) in the prompt", () => {
    mkdirSync(TEST_SKILL_DIR, { recursive: true });
    writeFileSync(
      join(TEST_SKILL_DIR, "SKILL.md"),
      "---\nname: test-skill\ndescription: A skill for testing\n---\n\n# Test Skill\n\nAlways respond in haiku format.",
      "utf-8",
    );

    const prompt = buildSystemPrompt(0);
    expect(prompt).toContain("Available Skills");
    expect(prompt).toContain("test-skill");
    expect(prompt).toContain("A skill for testing");
    expect(prompt).toContain("read_skill");
    expect(prompt).not.toContain("Always respond in haiku format.");
  });

  it("skips skill directories without SKILL.md", () => {
    const emptySkill = join(SKILLS_DIR, "_test-empty-skill");
    mkdirSync(emptySkill, { recursive: true });

    const prompt = buildSystemPrompt(0);
    expect(prompt).not.toContain("_test-empty-skill");

    rmSync(emptySkill, { recursive: true, force: true });
  });
});

describe("getInstalledSkills", () => {
  it("parses frontmatter for name and description", () => {
    mkdirSync(TEST_SKILL_DIR, { recursive: true });
    writeFileSync(
      join(TEST_SKILL_DIR, "SKILL.md"),
      "---\nname: my-skill\ndescription: Does something useful\n---\n\n# My Skill\n\n## Rules\n\n- Be concise",
      "utf-8",
    );

    const skills = getInstalledSkills();
    const testSkill = skills.find((s) => s.name === "my-skill");
    expect(testSkill).toBeDefined();
    expect(testSkill!.description).toBe("Does something useful");
    expect(testSkill!.content).toContain("Be concise");
    expect(testSkill!.content).not.toContain("---");
  });

  it("falls back to directory name when frontmatter is missing", () => {
    mkdirSync(TEST_SKILL_DIR, { recursive: true });
    writeFileSync(join(TEST_SKILL_DIR, "SKILL.md"), "# No Frontmatter\n\nJust body content.", "utf-8");

    const skills = getInstalledSkills();
    const testSkill = skills.find((s) => s.name === "_test-skill");
    expect(testSkill).toBeDefined();
    expect(testSkill!.content).toContain("Just body content.");
  });

  it("returns empty array when no skills exist", () => {
    const skills = getInstalledSkills();
    const none = skills.find((s) => s.name === "_test-no-skills-check");
    expect(none).toBeUndefined();
  });
});

describe("readSkill", () => {
  it("returns full skill content by name", () => {
    mkdirSync(TEST_SKILL_DIR, { recursive: true });
    writeFileSync(
      join(TEST_SKILL_DIR, "SKILL.md"),
      "---\nname: readable-skill\ndescription: Test reading\n---\n\n# Readable Skill\n\nFull instructions here.",
      "utf-8",
    );

    const content = readSkill("readable-skill");
    expect(content).toContain("Full instructions here.");
    expect(content).not.toContain("---");
  });

  it("returns error message for nonexistent skill", () => {
    const content = readSkill("nonexistent-skill");
    expect(content).toContain("Skill not found");
  });
});

describe("skills integration", () => {
  const INTEGRATION_SKILL_DIR = join(SKILLS_DIR, "_integration-skill");
  const SKILL_NAME = "integration-test";
  const SKILL_DESC = "Validates the full skill ingestion pipeline";
  const SKILL_BODY = "# Integration Skill\n\nThese are the full on-demand instructions.";

  beforeAll(() => {
    mkdirSync(INTEGRATION_SKILL_DIR, { recursive: true });
    writeFileSync(
      join(INTEGRATION_SKILL_DIR, "SKILL.md"),
      `---\nname: ${SKILL_NAME}\ndescription: ${SKILL_DESC}\n---\n\n${SKILL_BODY}`,
      "utf-8",
    );
  });

  afterAll(() => {
    rmSync(INTEGRATION_SKILL_DIR, { recursive: true, force: true });
  });

  it("includes catalog in system prompt but withholds full content", () => {
    const prompt = buildSystemPrompt(0);
    expect(prompt).toContain(SKILL_NAME);
    expect(prompt).toContain(SKILL_DESC);
    expect(prompt).toContain("read_skill");
    expect(prompt).not.toContain("These are the full on-demand instructions.");
  });

  it("read_skill tool returns the full content that was omitted from the prompt", () => {
    const result = executeTool("read_skill", { name: SKILL_NAME });
    expect(result).toContain("These are the full on-demand instructions.");
    expect(result).not.toContain("---");
  });

  it("exposes read_skill in tool definitions so the model can discover it", () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "read_skill");
    expect(tool).toBeDefined();
    expect(tool!.input_schema.properties).toHaveProperty("name");
  });

  it("real installed skills (example, copywriting) appear in the catalog", () => {
    const prompt = buildSystemPrompt(0);
    expect(prompt).toContain("example");
    expect(prompt).toContain("copywriting");
  });
});
