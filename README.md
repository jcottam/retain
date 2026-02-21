# Retain

Handcrafted CLI chat with knowledge retention to Markdown. Retain reads file-based context and assembles a system prompt before each session, so every conversation builds on what came before.

## Structure

```
retain/
├── workspace/
│   ├── context/
│   │   └── system_prompt.md      # Base instructions + assembly rules
│   ├── memories/
│   │   ├── facts.md              # Persistent facts about the user
│   │   ├── projects.md           # Active project details
│   │   └── user_preferences.md  # Coding style, workflow, communication prefs
│   └── sessions/
│       ├── session_20260218_001.json
│       └── session_20260219_001.json
└── src/                          # CLI source
```

## File Roles

| File | Format | Purpose |
|------|--------|---------|
| `workspace/context/system_prompt.md` | Markdown | Base system prompt template |
| `workspace/memories/*.md` | Markdown | Human-editable persistent memory |
| `workspace/sessions/*.json` | JSON | Structured chat history with metadata |

## Session JSON Schema

```json
{
  "id": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "title": "string",
  "tags": ["string"],
  "messages": [
    { "role": "user|assistant", "content": "string", "timestamp": "ISO8601" }
  ]
}
```

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

