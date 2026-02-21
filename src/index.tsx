#!/usr/bin/env bun
import { render } from "ink";
import App from "./components/App";
import { buildSystemPrompt } from "./lib/context";
import { initSession } from "./lib/session";

const systemPrompt = buildSystemPrompt(3);
initSession();

render(<App systemPrompt={systemPrompt} initialMessages={[]} />);
