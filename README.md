```
 ██████╗ ███████╗████████╗ █████╗ ██╗███╗   ██╗
 ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██║████╗  ██║
 ██████╔╝█████╗     ██║   ███████║██║██╔██╗ ██║
 ██╔══██╗██╔══╝     ██║   ██╔══██║██║██║╚██╗██║
 ██║  ██║███████╗   ██║   ██║  ██║██║██║ ╚████║
 ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
```

Handcrafted CLI chat with persistent memory. Retain reads your notes, preferences, and past sessions before every conversation, so it always knows where you left off.

## Getting Started

**Prerequisites:** [Bun](https://bun.sh) and an [Anthropic API key](https://console.anthropic.com/).

**1. Clone and install dependencies**

```bash
git clone https://github.com/your-username/retain.git
cd retain
bun install
```

**2. Set your API key**

Retain loads environment variables from `~/.config/retain/.env` at startup, so you don't need to export anything in your shell profile.

```bash
mkdir -p ~/.config/retain
echo "ANTHROPIC_API_KEY=sk-ant-..." > ~/.config/retain/.env
chmod 600 ~/.config/retain/.env
```

Add any other environment variables to that file using `KEY=value` format. Values already set in your shell environment are never overwritten.

**3. Register the global command**

```bash
bun link
```

This registers `retain` in `~/.bun/bin/retain`. Make sure `~/.bun/bin` is on your `PATH`.

**4. Start chatting**

```bash
retain
```

That's it. Retain will assemble your context from `workspace/` and open an interactive chat session.

## Structure

```
retain/
├── workspace/
│   ├── context/
│   │   └── system_prompt.md      # Base instructions + assembly rules
│   ├── memories/
│   │   ├── MEMORY.md             # Persistent facts learned during sessions
│   │   ├── PREFERENCES.md        # Coding style, workflow, communication prefs
│   │   └── USER.md               # Static profile info about the user
│   └── sessions/
│       ├── session_20260218_001.jsonl
│       └── session_20260219_001.jsonl
└── src/
    ├── components/
    │   ├── App.tsx               # Root component, slash command dispatch
    │   ├── Header.tsx            # ASCII "RETAIN" banner
    │   ├── InputBox.tsx          # Input field with loading state
    │   └── MessageList.tsx       # Chat history renderer
    └── lib/
        ├── anthropic.ts          # Anthropic API client
        ├── config.ts             # ~/.config/retain/.env loader
        ├── context.ts            # System prompt assembly
        ├── memory.ts             # Memory extraction and file helpers
        └── session.ts            # Session JSONL management
```

## File Roles

| File                                 | Format     | Purpose                                                  |
| ------------------------------------ | ---------- | -------------------------------------------------------- |
| `workspace/context/system_prompt.md` | Markdown   | Base system prompt template                              |
| `workspace/memories/USER.md`         | Markdown   | Static profile: name, location, timezone, preferences    |
| `workspace/memories/MEMORY.md`       | Markdown   | Dynamic facts appended automatically via `[MEMORY]` tags |
| `workspace/memories/PREFERENCES.md`  | Markdown   | Coding style, workflow, and communication preferences    |
| `workspace/sessions/*.jsonl`         | JSON Lines | Append-only chat history; one JSON object per line       |

## Session JSONL Schema

Each session file is a series of newline-delimited JSON objects. The first line is always a `meta` record; a new `meta` line is appended whenever the session title is updated. Each message is its own line.

```jsonl
{"type":"meta","id":"session_20260221_001","created_at":"ISO8601","updated_at":"ISO8601","title":"New session","tags":[]}
{"type":"meta","id":"session_20260221_001","created_at":"ISO8601","updated_at":"ISO8601","title":"First user message up to 60 chars","tags":[]}
{"type":"message","role":"user","content":"string","timestamp":"ISO8601"}
{"type":"message","role":"assistant","content":"string","timestamp":"ISO8601"}
```

When reading, the **last `meta` line** is used for session metadata; all `message` lines are collected in order.

## CLI Setup

The CLI lives in `retain/` and is registered as a global `retain` command via `bun link`.

```bash
cd retain
bun link   # registers `retain` globally (~/.bun/bin/retain)
```

## CLI Usage

```bash
retain
```

When launched, Retain displays an ASCII banner and drops you into an interactive chat session. The input box accepts free-form messages or slash commands.

### Slash Commands

Type `/` to trigger the command palette. A suggestion panel appears above the input box, filtered in real time as you type. Navigate and run commands without lifting your hands from the keyboard:

| Key       | Action                                 |
| --------- | -------------------------------------- |
| `↑` / `↓` | Move through suggestions               |
| `Tab`     | Auto-complete the highlighted command  |
| `Enter`   | Run the highlighted (or typed) command |

| Command        | Description                                 |
| -------------- | ------------------------------------------- |
| `/memories`    | Display saved facts (`MEMORY.md`)           |
| `/preferences` | Display user preferences (`PREFERENCES.md`) |
| `/profile`     | Display user profile (`USER.md`)            |
| `/cancel`      | Dismiss the command palette                 |

Any input beginning with `/` is handled locally and never sent to the LLM. Unknown commands display an inline error message.

## Memory Flow

### Retrieval — on startup

Every time `retain` launches it assembles a system prompt from three sources, in order:

1. **Base instructions** — `workspace/context/system_prompt.md`
2. **Memory files** — all `workspace/memories/*.md` (`USER.md`, `MEMORY.md`, `PREFERENCES.md`)
3. **Recent sessions** — the last 3 session files from `workspace/sessions/`, each summarized as a compact title + message excerpts

All parts are joined with `---` separators and sent as the system prompt before the first user message. The model therefore enters every conversation already aware of your past context.

### Retention — during a session

The model is instructed to flag new persistent information with a `[MEMORY]` tag in its response. Two formats are supported:

```
[MEMORY] Jamie prefers TypeScript over JavaScript

[MEMORY] Updated facts:
- Uses Bun as the JS runtime
- Prefers concise responses
```

After each assistant reply, the CLI scans the response for `[MEMORY]` blocks, deduplicates against the existing content of `MEMORY.md`, and appends any new facts as bullet points. A confirmation is shown in the TUI when facts are saved.

```
✦ Memory saved: Uses Bun as the JS runtime
```

Memory files are plain Markdown — you can read, edit, or prune them at any time.

## Context Assembly (pseudo-code)

```python
def build_system_prompt(n_recent_sessions=3):
    parts = [read("workspace/context/system_prompt.md")]
    for f in glob("workspace/memories/*.md"):
        parts.append(read(f))
    for session in recent_sessions(n=n_recent_sessions):
        parts.append(summarize(session))
    return "\n\n---\n\n".join(parts)
```
