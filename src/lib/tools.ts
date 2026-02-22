import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join, resolve } from "path";
import type Anthropic from "@anthropic-ai/sdk";
import { readSkill } from "./context";

const BIN_DIR = resolve(join(import.meta.dir, "../../workspace/bin"));

export type ToolDefinition = Anthropic.Tool;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path. Returns the file content as a string.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative file path to read",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path. Creates parent directories if needed. Overwrites existing content.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative file path to write to",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "read_skill",
    description: "Load the full instructions of an installed skill by name. Use this when a user's request matches a skill listed in the Available Skills section of your system prompt.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "The name of the skill to load",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "run_command",
    description:
      "Run a script from the workspace/bin/ directory. Only scripts placed in workspace/bin/ are allowed. Pass the script name and any arguments as the command string (e.g. 'my-script arg1 arg2'). Times out after 30 seconds.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "Script name followed by arguments (e.g. 'my-script arg1 arg2'). The script must exist in workspace/bin/.",
        },
      },
      required: ["command"],
    },
  },
];

export function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "read_file":
      return executeReadFile(input.path as string);
    case "write_file":
      return executeWriteFile(input.path as string, input.content as string);
    case "read_skill":
      return readSkill(input.name as string);
    case "run_command":
      return executeRunCommand(input.command as string);
    default:
      return `Unknown tool: ${name}`;
  }
}

function executeReadFile(path: string): string {
  try {
    if (!existsSync(path)) return `Error: File not found: ${path}`;
    const content = readFileSync(path, "utf-8");
    if (content.length > 50_000) {
      return content.slice(0, 50_000) + `\n\n[truncated — file is ${content.length} chars]`;
    }
    return content;
  } catch (err) {
    return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function executeWriteFile(path: string, content: string): string {
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, content, "utf-8");
    return `File written successfully: ${path} (${content.length} chars)`;
  } catch (err) {
    return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function getBinDir(): string {
  return BIN_DIR;
}

function executeRunCommand(command: string): string {
  const parts = command.trim().split(/\s+/);
  const scriptName = parts[0];
  if (!scriptName) return "Error: No script name provided.";

  const scriptPath = resolve(BIN_DIR, scriptName);

  if (!scriptPath.startsWith(BIN_DIR + "/")) {
    return `Error: Path traversal not allowed. Scripts must reside in workspace/bin/.`;
  }

  if (!existsSync(scriptPath)) {
    return `Error: Script not found: "${scriptName}". Place executable scripts in workspace/bin/.`;
  }

  const args = parts.slice(1);

  try {
    const result = execFileSync(scriptPath, args, {
      cwd: resolve(BIN_DIR, "../"),
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = result.toString().trim();
    if (output.length > 20_000) {
      return output.slice(0, 20_000) + `\n\n[truncated — output is ${output.length} chars]`;
    }
    return output || "(no output)";
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    const stderr = execErr.stderr?.toString().trim() ?? "";
    const stdout = execErr.stdout?.toString().trim() ?? "";
    return `Command failed:\n${stderr || stdout || execErr.message || String(err)}`;
  }
}
