import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  dbInsertMemory,
  dbGetActiveMemories,
  dbFindMemoryByFact,
  type MemoryRow,
} from "./db";
import { getCurrentSessionId } from "./session";
import { upsertMemory, isVectorEnabled } from "./vector";

const STORE_ROOT = join(import.meta.dir, "../../workspace/");
const FACTS_FILE = join(STORE_ROOT, "MEMORY.md");

export function readMemoryFile(filename: string): string {
  const filePath = join(STORE_ROOT, filename);
  if (!existsSync(filePath)) {
    return `No file found at workspace/${filename}`;
  }
  return readFileSync(filePath, "utf-8");
}

export function getActiveMemories(): MemoryRow[] {
  return dbGetActiveMemories();
}

/**
 * Scans an assistant response for [MEMORY] blocks, saves to SQLite,
 * and syncs the markdown file.
 *
 * Handles two formats:
 *   Single-line:  [MEMORY] Jamie loves skiing
 *   Multi-line:   [MEMORY] Updated facts:
 *                 - fact one
 *                 - fact two
 */
export function extractAndSaveMemories(responseText: string): string[] {
  const saved: string[] = [];
  const lines = responseText.split("\n");
  let i = 0;

  while (i < lines.length) {
    const trimmedLine = lines[i].trimStart();
    const memIdx = trimmedLine.indexOf("[MEMORY]");

    if (memIdx === -1) {
      i++;
      continue;
    }

    const inline = trimmedLine.slice(memIdx + "[MEMORY]".length).trim();

    const bullets: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j].trim();
      if (next.startsWith("- ")) {
        bullets.push(next.slice(2).trim());
        j++;
      } else if (next === "") {
        j++;
        break;
      } else {
        break;
      }
    }
    i = j;

    if (bullets.length > 0) {
      for (const bullet of bullets) {
        if (saveFact(bullet)) saved.push(bullet);
      }
    } else {
      // Strip generic prefixes, then take only the first sentence as the fact
      const cleaned = inline.replace(/^(added|updated) to \w+:\s*/i, "");
      const sentenceEnd = cleaned.search(/[.!?]\s+[A-Z]/);
      const fact = sentenceEnd !== -1 ? cleaned.slice(0, sentenceEnd + 1) : cleaned.replace(/[.!?]+$/, "").trim();
      if (fact && saveFact(fact)) saved.push(fact);
    }
  }

  if (saved.length > 0) {
    syncMemoryMarkdown();
  }

  return saved;
}

function saveFact(fact: string): boolean {
  const existing = dbFindMemoryByFact(fact);
  if (existing) return false;

  const sessionId = getCurrentSessionId();
  const memoryId = dbInsertMemory(fact, "general", sessionId, new Date().toISOString());

  if (isVectorEnabled()) {
    upsertMemory(memoryId, fact, "general").catch(() => { });
  }

  return true;
}

function syncMemoryMarkdown(): void {
  const memories = dbGetActiveMemories();
  const lines = ["# MEMORY.md - Persistent Memories", "", "## General Facts", ""];
  for (const mem of memories) {
    lines.push(`- ${mem.fact}`);
  }
  lines.push("");
  writeFileSync(FACTS_FILE, lines.join("\n"), "utf-8");
}
