import { join } from "path";
import { readFileSync, readdirSync, existsSync } from "fs";
import { dbListSessions, dbGetMessages, dbGetActiveMemories, dbGetSession } from "./db";
import { isVectorEnabled, queryRelevantMemories, queryRelevantSessions } from "./vector";
import type { Session } from "../types";

const STORE_ROOT = join(import.meta.dir, "../../workspace/");
const SKILLS_DIR = join(STORE_ROOT, "skills");

function readFile(filePath: string): string {
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf-8").trim();
}

export interface SkillInfo {
  name: string;
  description: string;
  content: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
  }
  return { meta, body: match[2].trim() };
}

export function getInstalledSkills(): SkillInfo[] {
  if (!existsSync(SKILLS_DIR)) return [];

  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const skillFile = join(SKILLS_DIR, d.name, "SKILL.md");
      const raw = readFile(skillFile);
      if (!raw) return null;
      const { meta, body } = parseFrontmatter(raw);
      return {
        name: meta.name || d.name,
        description: meta.description || "",
        content: body,
      };
    })
    .filter((s): s is SkillInfo => s !== null);
}

export function readSkill(name: string): string {
  const skills = getInstalledSkills();
  const skill = skills.find((s) => s.name === name);
  if (!skill) return `Skill not found: "${name}". Use /skills to see installed skills.`;
  return skill.content;
}

function loadSkillsCatalog(): string {
  const skills = getInstalledSkills();
  if (skills.length === 0) return "";

  const lines = [
    "# Available Skills",
    "",
    "Use the `read_skill` tool to load a skill's full instructions when it is relevant to the user's request.",
    "",
  ];
  for (const skill of skills) {
    lines.push(`- **${skill.name}**: ${skill.description}`);
  }
  return lines.join("\n");
}

function getRecentSessions(n: number): Session[] {
  const rows = dbListSessions(n);
  return rows.map((row) => {
    const msgs = dbGetMessages(row.id);
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
  });
}

function summarizeSession(session: Session): string {
  const lines = [`## Past session: "${session.title}"`];
  for (const msg of session.messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    const excerpt = msg.content.slice(0, 200) + (msg.content.length > 200 ? "…" : "");
    lines.push(`${role}: ${excerpt}`);
  }
  return lines.join("\n");
}

export function buildSystemPrompt(nRecentSessions = 3): string {
  const parts: string[] = [];

  const systemPrompt = readFile(join(STORE_ROOT, "context/SYSTEM.md"));
  if (systemPrompt) parts.push(systemPrompt);

  const contextDir = join(STORE_ROOT, "context");
  if (existsSync(contextDir)) {
    const userMd = readFile(join(contextDir, "USER.md"));
    if (userMd) parts.push(userMd);
  }

  const skillsCatalog = loadSkillsCatalog();
  if (skillsCatalog) parts.push(skillsCatalog);

  const activeMemories = dbGetActiveMemories();
  if (activeMemories.length > 0) {
    const memoryLines = ["# Active Memories", ""];
    for (const mem of activeMemories) {
      memoryLines.push(`- ${mem.fact}`);
    }
    parts.push(memoryLines.join("\n"));
  }

  const sessions = getRecentSessions(nRecentSessions);
  for (const session of sessions) {
    parts.push(summarizeSession(session));
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Builds an augmented system prompt using vector search to find the most
 * relevant memories and session summaries for the current user message.
 * Falls back to the standard buildSystemPrompt when vector is not configured.
 */
export async function buildAugmentedPrompt(
  userMessage: string,
  nFallbackSessions = 3,
): Promise<string> {
  if (!isVectorEnabled()) {
    return buildSystemPrompt(nFallbackSessions);
  }

  const parts: string[] = [];

  const systemPrompt = readFile(join(STORE_ROOT, "context/SYSTEM.md"));
  if (systemPrompt) parts.push(systemPrompt);

  const contextDir2 = join(STORE_ROOT, "context");
  if (existsSync(contextDir2)) {
    const userMd = readFile(join(contextDir2, "USER.md"));
    if (userMd) parts.push(userMd);
  }

  const skillsCatalog = loadSkillsCatalog();
  if (skillsCatalog) parts.push(skillsCatalog);

  // Vector-augmented memories: find the most relevant facts
  try {
    const relevantMemories = await queryRelevantMemories(userMessage, 10);
    if (relevantMemories.length > 0) {
      const memLines = ["# Relevant Memories", ""];
      for (const r of relevantMemories) {
        if (r.metadata.fact) {
          memLines.push(`- ${r.metadata.fact}`);
        }
      }
      parts.push(memLines.join("\n"));
    }
  } catch {
    // Fallback to SQLite memories
    const activeMemories = dbGetActiveMemories();
    if (activeMemories.length > 0) {
      const memLines = ["# Active Memories", ""];
      for (const mem of activeMemories) {
        memLines.push(`- ${mem.fact}`);
      }
      parts.push(memLines.join("\n"));
    }
  }

  // Vector-augmented sessions: find the most relevant past conversations
  try {
    const relevantSessions = await queryRelevantSessions(userMessage, 5);
    if (relevantSessions.length > 0) {
      const sessionLines = ["# Relevant Past Conversations", ""];
      for (const r of relevantSessions) {
        const sessionId = r.metadata.sessionId;
        if (!sessionId) continue;
        const session = dbGetSession(sessionId);
        if (!session) continue;

        const msgs = dbGetMessages(sessionId);
        const excerpts = msgs.slice(0, 6).map((m) => {
          const role = m.role === "user" ? "User" : "Assistant";
          const text = m.content.slice(0, 150) + (m.content.length > 150 ? "…" : "");
          return `  ${role}: ${text}`;
        });
        sessionLines.push(`## "${session.title}" (${r.metadata.date ?? ""})`);
        sessionLines.push(...excerpts);
        sessionLines.push("");
      }
      parts.push(sessionLines.join("\n"));
    }
  } catch {
    // Fallback to recent sessions
    const sessions = getRecentSessions(nFallbackSessions);
    for (const session of sessions) {
      parts.push(summarizeSession(session));
    }
  }

  return parts.join("\n\n---\n\n");
}
