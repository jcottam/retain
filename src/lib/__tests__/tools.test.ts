import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, rmSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { executeTool, getBinDir } from "../tools";

const TMP_ROOT = join(tmpdir(), `minichat-tools-test-${Date.now()}`);
const BIN_DIR = getBinDir();

beforeAll(() => {
  mkdirSync(TMP_ROOT, { recursive: true });
  mkdirSync(BIN_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("read_file", () => {
  it("returns file contents for an existing file", () => {
    const filePath = join(TMP_ROOT, "readable.txt");
    writeFileSync(filePath, "Hello from test", "utf-8");

    const result = executeTool("read_file", { path: filePath });
    expect(result).toBe("Hello from test");
  });

  it("returns an error message for a missing file", () => {
    const result = executeTool("read_file", { path: join(TMP_ROOT, "nonexistent.txt") });
    expect(result).toContain("Error");
    expect(result).toContain("not found");
  });

  it("reads files with special characters", () => {
    const filePath = join(TMP_ROOT, "special.txt");
    writeFileSync(filePath, "Line 1\nLine 2\n\ttabbed", "utf-8");

    const result = executeTool("read_file", { path: filePath });
    expect(result).toContain("Line 1");
    expect(result).toContain("\ttabbed");
  });
});

describe("write_file", () => {
  it("creates a new file with content", () => {
    const filePath = join(TMP_ROOT, "writable.txt");
    const result = executeTool("write_file", { path: filePath, content: "Test content" });
    expect(result).toContain("written successfully");
    expect(result).toContain("12 chars");

    const readBack = executeTool("read_file", { path: filePath });
    expect(readBack).toBe("Test content");
  });

  it("creates parent directories if they do not exist", () => {
    const filePath = join(TMP_ROOT, "nested", "deep", "file.txt");
    const result = executeTool("write_file", { path: filePath, content: "Nested" });
    expect(result).toContain("written successfully");
    expect(existsSync(filePath)).toBe(true);
  });

  it("overwrites existing file content", () => {
    const filePath = join(TMP_ROOT, "overwrite.txt");
    executeTool("write_file", { path: filePath, content: "Original" });
    executeTool("write_file", { path: filePath, content: "Replaced" });

    const readBack = executeTool("read_file", { path: filePath });
    expect(readBack).toBe("Replaced");
  });
});

describe("run_command", () => {
  const testScript = join(BIN_DIR, "_test-echo");
  const testSilent = join(BIN_DIR, "_test-silent");
  const testFail = join(BIN_DIR, "_test-fail");

  beforeAll(() => {
    writeFileSync(testScript, '#!/bin/sh\necho "$@"', "utf-8");
    chmodSync(testScript, 0o755);

    writeFileSync(testSilent, "#!/bin/sh\nexit 0", "utf-8");
    chmodSync(testSilent, 0o755);

    writeFileSync(testFail, "#!/bin/sh\nexit 1", "utf-8");
    chmodSync(testFail, 0o755);
  });

  afterAll(() => {
    for (const f of [testScript, testSilent, testFail]) {
      if (existsSync(f)) rmSync(f);
    }
  });

  it("executes a script from workspace/bin and returns stdout", () => {
    const result = executeTool("run_command", { command: "_test-echo hello world" });
    expect(result).toBe("hello world");
  });

  it("returns error output for a failing script", () => {
    const result = executeTool("run_command", { command: "_test-fail" });
    expect(result).toContain("Command failed");
  });

  it("returns '(no output)' for scripts with no stdout", () => {
    const result = executeTool("run_command", { command: "_test-silent" });
    expect(result).toBe("(no output)");
  });

  it("rejects commands not in workspace/bin", () => {
    const result = executeTool("run_command", { command: "echo hello" });
    expect(result).toContain("Script not found");
  });

  it("rejects path traversal attempts", () => {
    const result = executeTool("run_command", { command: "../../etc/passwd" });
    expect(result).toContain("Path traversal not allowed");
  });

  it("rejects empty command", () => {
    const result = executeTool("run_command", { command: "" });
    expect(result).toContain("No script name provided");
  });
});

describe("read_skill", () => {
  it("returns skill content for an installed skill", () => {
    const result = executeTool("read_skill", { name: "example" });
    expect(result).toContain("Example Skill");
    expect(result).not.toContain("---");
  });

  it("returns error for a nonexistent skill", () => {
    const result = executeTool("read_skill", { name: "does-not-exist" });
    expect(result).toContain("Skill not found");
  });
});

describe("unknown tool", () => {
  it("returns an error message for unrecognized tool names", () => {
    const result = executeTool("nonexistent_tool", {});
    expect(result).toBe("Unknown tool: nonexistent_tool");
  });
});
