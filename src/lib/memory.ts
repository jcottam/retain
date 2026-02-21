import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

const STORE_ROOT = join(import.meta.dir, "../../workspace/");
const FACTS_FILE = join(STORE_ROOT, "memories/facts.md");

/**
 * Scans an assistant response for [MEMORY] blocks and appends extracted
 * facts as bullet points to memories/facts.md.
 *
 * Handles two formats:
 *   Single-line:  [MEMORY] Jamie loves skiing
 *   Multi-line:   [MEMORY] Updated facts:
 *                 - fact one
 *                 - fact two
 *
 * Returns the list of saved facts.
 */
export function extractAndSaveMemories(responseText: string): string[] {
  const saved: string[] = [];
  const lines = responseText.split("\n");
  let i = 0;

  while (i < lines.length) {
    const trimmedLine = lines[i].trimStart();

    if (!trimmedLine.startsWith("[MEMORY]")) {
      i++;
      continue;
    }

    // Text on the same line as [MEMORY], after the tag
    const inline = trimmedLine.slice("[MEMORY]".length).trim();

    // Check if the next lines are bullet points
    const bullets: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j].trim();
      if (next.startsWith("- ")) {
        bullets.push(next.slice(2).trim());
        j++;
      } else if (next === "") {
        // Allow one blank line inside the block then stop
        j++;
        break;
      } else {
        break;
      }
    }
    i = j;

    if (bullets.length > 0) {
      // Multi-line block: save each bullet, ignore the inline header
      for (const bullet of bullets) {
        if (appendToFacts(bullet)) saved.push(bullet);
      }
    } else {
      // Single-line: save the inline text (strip generic prefixes)
      const fact = inline.replace(/^(added|updated) to \w+:\s*/i, "");
      if (fact && appendToFacts(fact)) saved.push(fact);
    }
  }

  return saved;
}

/** Appends a fact bullet to facts.md. Returns true if written, false if duplicate. */
function appendToFacts(fact: string): boolean {
  if (!existsSync(FACTS_FILE)) return false;

  const current = readFileSync(FACTS_FILE, "utf-8");
  const bullet = `- ${fact}`;

  if (current.includes(bullet)) return false;

  writeFileSync(FACTS_FILE, current.trimEnd() + "\n" + bullet + "\n", "utf-8");
  return true;
}
