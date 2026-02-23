# Spark — Project Vision

**Domain:** [sparkagent.dev](https://sparkagent.dev)
**Repo:** github.com/jcottam/retain (rename pending)

---

## What Is This?

Spark is a minimal AI agent framework built from scratch to understand — brick by brick — how agentic systems work. It's a learning lab, not a product competitor.

The goal: deeply understand the architecture behind tools like OpenClaw, LangChain, and similar agent frameworks by building one from zero.

## Why Open Source?

- **Learning in public** — forces cleaner code, better docs, sharper thinking
- **Portfolio piece** — proof that a Director of Engineering can still build, not just manage
- **Content companion** — blog posts on [noteworthy.solutions](https://noteworthy.solutions) will walk through the decisions and patterns discovered here
- **Community** — others learning the same patterns can follow along, contribute, or fork

## Core Pillars

1. **Memory** — what to remember, how to recall, when to forget
2. **Context Assembly** — building the right prompt from scattered sources
3. **Tool Use** — how agents safely interact with the real world
4. **Session Continuity** — making a stateless model feel stateful
5. **Provider Abstraction** — same agent logic, any model underneath (Anthropic, OpenAI, Ollama, etc.)
6. **Skills & MCP** — pluggable capabilities via Model Context Protocol servers

## Architecture Direction

```
spark/
├── src/
│   ├── core/           # Shared: db, memory, sessions, context, tools
│   ├── providers/      # Model adapters (Anthropic, OpenAI, Ollama)
│   ├── cli/            # Ink TUI (primary interface)
│   ├── server/         # Hono API backend
│   └── web/            # Dashboard frontend
```

### Key Decisions

- **Runtime:** Bun
- **Storage:** SQLite (local-first, via bun:sqlite)
- **Semantic Search:** Upstash Vector (optional)
- **CLI UI:** React + Ink
- **API:** Hono (runs natively on Bun)
- **Frontend:** TBD (lightweight — possibly HTMX or minimal React)

### Interfaces (in order of priority)

1. **CLI** — `spark chat`, `spark search`, `spark serve`
2. **Web Dashboard** — search memories, review sessions, manage cron/tools/config
3. **Web Chat** — full chat via SSE streaming through the Hono API
4. **Chrome Extension** — context-aware AI anywhere in the browser (highlight → remember, right-click → ask)

### Hosting Model

- Local-first for CLI
- Self-hosted API for web + extension (single VPS, SQLite, Cloudflare Tunnel)
- No multi-tenant complexity unless/until needed

## Philosophy

- **Keep it minimal.** Add features to learn patterns, not to ship a product.
- **Document the journey.** The real output is understanding, not code.
- **Experiment freely.** Try different memory strategies, context windows, provider quirks.
- **Ship ugly.** Polish comes after comprehension.

## Current State (as of February 2026)

- ✅ CLI chat with persistent memory (SQLite + JSONL)
- ✅ Session resume and search (FTS5)
- ✅ Memory extraction via `[MEMORY]` tags
- ✅ Optional semantic recall (Upstash Vector)
- ✅ Tool use (read_file, write_file, run_command)
- ✅ Test suite (db, memory, session, tools, context)
- 🔲 Model-agnostic provider layer
- 🔲 MCP server integration
- 🔲 Skills/plugin system
- 🔲 Hono API backend
- 🔲 Web dashboard
- 🔲 Web chat
- 🔲 Chrome extension
- 🔲 Rename from MiniChat → Spark

## Author

**John Ryan Cottam** — Director of Engineering, fullstack developer since 2000, building the future one brick at a time.

- [noteworthy.solutions](https://noteworthy.solutions)
- [github.com/jcottam](https://github.com/jcottam)
