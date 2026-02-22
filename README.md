```
 ███╗   ███╗██╗███╗   ██╗██╗ ██████╗██╗  ██╗ █████╗ ████████╗
 ████╗ ████║██║████╗  ██║██║██╔════╝██║  ██║██╔══██╗╚══██╔══╝
 ██╔████╔██║██║██╔██╗ ██║██║██║     ███████║███████║   ██║
 ██║╚██╔╝██║██║██║╚██╗██║██║██║     ██╔══██║██╔══██║   ██║
 ██║ ╚═╝ ██║██║██║ ╚████║██║╚██████╗██║  ██║██║  ██║   ██║
 ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
```

**Terminal AI chat that remembers you.**

Lightweight. Stateful. Open source.

## About

MiniChat is a lightweight, open-source CLI tool that preserves context across sessions. Pick up any conversation exactly where you left off.

Most AI chat tools forget you the moment you close the window. MiniChat doesn't. Stateful by design, minimal by default — built for developers who live in the terminal.

Install MiniChat — then just type `mchat`.

|   |   |
|---|---|
| **Lightweight** | Tiny footprint. Nothing you don't need. |
| **Stateful** | Memory persists across sessions — no recaps required. |
| **Open source** | Read it, fork it, own it. |
| **Terminal-native** | Lives where you work. |

## Getting Started

**Prerequisites:** [Bun](https://bun.sh) and an [Anthropic API key](https://console.anthropic.com/).

```bash
git clone https://github.com/your-username/minichat.git
cd minichat
bun install
```

Set your API key. MiniChat loads env vars from `~/.config/minichat/.env` at startup -- nothing to export in your shell profile.

```bash
mkdir -p ~/.config/minichat
echo "ANTHROPIC_API_KEY=sk-ant-..." > ~/.config/minichat/.env
chmod 600 ~/.config/minichat/.env
```

For optional semantic search, add Upstash Vector credentials to the same file:

```
UPSTASH_VECTOR_REST_URL=https://...
UPSTASH_VECTOR_REST_TOKEN=...
```

Register the global command and start chatting:

```bash
bun link    # registers `mchat` and `minichat` in ~/.bun/bin
mchat       # launch
```

## Usage

MiniChat displays an ASCII banner and drops you into an interactive chat. Type messages directly or use slash commands.

### Slash Commands

Type `/` to open the command palette. Suggestions filter in real time as you type.

| Key       | Action                                |
| --------- | ------------------------------------- |
| `↑` / `↓` | Move through suggestions              |
| `Tab`     | Auto-complete the highlighted command |
| `Enter`   | Run the highlighted (or typed) command|

| Command                  | Description                             |
| ------------------------ | --------------------------------------- |
| `/memories`              | Display saved facts from `MEMORY.md`    |
| `/profile`               | Display user profile from `USER.md`     |
| `/search <query>`        | Full-text search across sessions and memories |
| `/sessions`              | List recent sessions                    |
| `/resume <session_id>`   | Resume a past session                   |
| `/compact`               | Summarize and compress the current session |
| `/cancel`                | Dismiss the command palette             |

Slash commands are handled locally and never sent to the model.

### Tool Use

The model has access to three tools and uses them autonomously when a request requires it:

| Tool          | Description                                  |
| ------------- | -------------------------------------------- |
| `read_file`   | Read a file from disk                        |
| `write_file`  | Write content to a file (creates dirs)       |
| `run_command`  | Execute a shell command (30s timeout)        |

## How It Works

### Context assembly -- before the first message

Every launch, MiniChat builds a system prompt from four sources:

1. **System instructions** -- `workspace/context/SYSTEM.md`
2. **User profile** -- `workspace/context/USER.md`
3. **Active memories** -- all non-superseded facts from SQLite (or semantically relevant facts via Upstash Vector when configured)
4. **Recent sessions** -- the 3 most recent conversations, summarized as title + message excerpts (or the most relevant sessions via vector search)

All parts are joined with `---` separators and passed as the system prompt.

When Upstash Vector is configured, context assembly switches from recency-based to relevance-based: memories and sessions are ranked by semantic similarity to the current user message, with SQLite as the fallback.

### Memory retention -- during a session

The model tags new persistent information with `[MEMORY]` in its response. Two formats:

```
[MEMORY] Jamie prefers TypeScript over JavaScript

[MEMORY] Updated facts:
- Uses Bun as the JS runtime
- Prefers concise responses
```

After each reply, MiniChat scans the response for `[MEMORY]` blocks, deduplicates against existing facts in SQLite, and saves any new ones. A confirmation appears in the TUI:

```
✦ Memory saved: Uses Bun as the JS runtime
```

Saved facts are also synced to `workspace/context/MEMORY.md` for easy reading and manual editing.

## Architecture

| Layer     | Technology           | Purpose                                       |
| --------- | -------------------- | --------------------------------------------- |
| Runtime   | Bun                  | JavaScript runtime and package manager         |
| UI        | React + Ink          | Terminal UI rendering                          |
| LLM       | Claude (Anthropic)   | Chat model with tool use                       |
| Storage   | SQLite (via `bun:sqlite`) | Sessions, messages, memories, full-text search (FTS5) |
| Search    | Upstash Vector (optional) | Semantic similarity for memory and session retrieval |

SQLite is the primary data store. Sessions and messages are written to both SQLite and append-only JSONL files (`workspace/sessions/*.jsonl`). On first run, any existing JSONL session files and markdown memory files are migrated into the database automatically.

### Session lifecycle

A new session is created on every launch. When the app exits, any session with zero messages is automatically deleted from both SQLite and the JSONL file on disk -- so opening and closing without chatting leaves no trace.

### Session JSONL format

Each session file is a series of newline-delimited JSON objects. The first line is a `meta` record; a new `meta` line is appended when the session title updates.

```jsonl
{"type":"meta","id":"session_20260221_001","created_at":"ISO8601","updated_at":"ISO8601","title":"New session","tags":[]}
{"type":"message","role":"user","content":"string","timestamp":"ISO8601"}
{"type":"message","role":"assistant","content":"string","timestamp":"ISO8601"}
```

## Project Structure

```
minichat/
├── workspace/
│   ├── context/
│   │   ├── SYSTEM.md              # System prompt and behavior instructions
│   │   ├── USER.md                # Static user profile
│   │   └── MEMORY.md              # Synced copy of active memories
│   ├── sessions/                  # Append-only JSONL session files
│   └── minichat.db                # SQLite database (created on first run)
└── src/
    ├── components/
    │   ├── App.tsx                 # Root component, slash command dispatch
    │   ├── Header.tsx              # ASCII "MINICHAT" banner
    │   ├── InputBox.tsx            # Input field with loading state
    │   └── MessageList.tsx         # Chat history renderer
    └── lib/
        ├── __tests__/              # Test suite (see Testing below)
        ├── anthropic.ts            # Anthropic API client + tool use loop
        ├── config.ts               # ~/.config/minichat/.env loader
        ├── context.ts              # System prompt assembly
        ├── db.ts                   # SQLite schema, migrations, CRUD, FTS
        ├── memory.ts               # [MEMORY] extraction and persistence
        ├── migrate.ts              # JSONL/Markdown → SQLite migration
        ├── session.ts              # Session lifecycle management
        ├── tools.ts                # Tool definitions and execution
        └── vector.ts               # Upstash Vector integration
```

| File                          | Purpose                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `workspace/context/SYSTEM.md` | Base system prompt: behavior rules, memory instructions, tool access |
| `workspace/context/USER.md`   | Static profile: name, location, preferences, communication style |
| `workspace/context/MEMORY.md` | Auto-synced copy of active memories from SQLite                  |
| `workspace/minichat.db`       | SQLite database: sessions, messages, memories, FTS indexes       |
| `workspace/sessions/*.jsonl`  | Append-only session logs (also stored in SQLite)                 |

## Testing

MiniChat uses Bun's built-in test runner with in-memory SQLite for full isolation -- no external test dependencies required.

```bash
bun test
```

| Test file          | What it covers                                                            |
| ------------------ | ------------------------------------------------------------------------- |
| `db.test.ts`       | Session, message, and memory CRUD; superseding; FTS search across tables  |
| `memory.test.ts`   | `[MEMORY]` tag parsing (single-line, multi-line bullets, dedup, prefixes) |
| `session.test.ts`  | `initSession`, `appendMessage` auto-titling, `loadSession`, `resumeSession` |
| `tools.test.ts`    | `read_file`, `write_file`, `run_command` execution and error handling     |
| `context.test.ts`  | `buildSystemPrompt` with memories, session summaries, and empty state     |

Each test file resets to a fresh in-memory database via `_resetForTesting()` in `beforeEach`, so tests never touch the production `minichat.db`.
