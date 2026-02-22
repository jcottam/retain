#!/usr/bin/env bun
import { loadConfig } from "./lib/config";
loadConfig();

import { getDb } from "./lib/db";
import { migrateExistingData } from "./lib/migrate";
import { render } from "ink";
import App from "./components/App";
import { buildSystemPrompt } from "./lib/context";
import { initSession, cleanupEmptySessions } from "./lib/session";

getDb();
migrateExistingData();

const systemPrompt = buildSystemPrompt(3);
initSession();

process.on("exit", cleanupEmptySessions);

render(<App systemPrompt={systemPrompt} initialMessages={[]} />);
