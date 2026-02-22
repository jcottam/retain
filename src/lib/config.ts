import { existsSync, readFileSync } from "fs";
import { join } from "path";

const CONFIG_DIR = join(process.env.HOME!, ".config", "minichat");
const CONFIG_PATH = join(CONFIG_DIR, ".env");

export function loadConfig(): void {
  if (!existsSync(CONFIG_PATH)) return;

  const lines = readFileSync(CONFIG_PATH, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export { CONFIG_DIR, CONFIG_PATH };
