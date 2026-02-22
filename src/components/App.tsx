import React, { useState, useCallback, useMemo, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import MessageList from "./MessageList";
import InputBox from "./InputBox";
import Header from "./Header";
import { chatWithTools, summarize } from "../lib/anthropic";
import { appendMessage, listRecentSessions, resumeSession, embedCurrentSession, embedSessionWithSummary } from "../lib/session";
import { extractAndSaveMemories, readMemoryFile } from "../lib/memory";
import { dbSearch } from "../lib/db";
import { buildAugmentedPrompt, getInstalledSkills } from "../lib/context";
import { isVectorEnabled } from "../lib/vector";
import type { Message } from "../types";

interface SlashCommand {
  name: string;
  description: string;
  handler: (args?: string) => string | Promise<string>;
  takesArgs?: boolean;
}

const SLASH_COMMAND_LIST: SlashCommand[] = [
  {
    name: "/memories",
    description: "Display saved facts",
    handler: () => readMemoryFile("MEMORY.md"),
  },
  {
    name: "/profile",
    description: "Display user profile",
    handler: () => readMemoryFile("USER.md"),
  },
  {
    name: "/skills",
    description: "List installed skills",
    handler: () => {
      const skills = getInstalledSkills();
      if (skills.length === 0) return "No skills installed.\n\nAdd a skill by creating workspace/skills/<name>/SKILL.md";
      const lines = ["Installed skills:\n"];
      for (const s of skills) {
        lines.push(`  ${s.name}  ${s.description}`);
      }
      return lines.join("\n");
    },
  },
  {
    name: "/search",
    description: "Search across sessions and memories",
    takesArgs: true,
    handler: (query?: string) => {
      if (!query) return "Usage: /search <query>";
      const results = dbSearch(query, 10);
      if (results.length === 0) return `No results found for "${query}".`;
      const lines = [`Search results for "${query}":\n`];
      for (const r of results) {
        const prefix = r.source === "memory" ? "[memory]" : `[session: ${r.sessionTitle ?? r.sessionId}]`;
        const excerpt = r.content.length > 200 ? r.content.slice(0, 200) + "…" : r.content;
        lines.push(`${prefix} ${excerpt}`);
      }
      return lines.join("\n");
    },
  },
  {
    name: "/sessions",
    description: "List recent sessions",
    handler: () => {
      const sessions = listRecentSessions(15);
      if (sessions.length === 0) return "No sessions found.";
      const lines = ["Recent sessions:\n"];
      for (const s of sessions) {
        const msgCount = s.messages.length;
        const date = new Date(s.created_at).toLocaleDateString();
        lines.push(`  ${s.id}  ${date}  "${s.title}"  (${msgCount} messages)`);
      }
      lines.push("\nUse /resume <session_id> to reload a session.");
      return lines.join("\n");
    },
  },
  {
    name: "/resume",
    description: "Resume a past session",
    takesArgs: true,
    handler: () => "Handled separately",
  },
  {
    name: "/compact",
    description: "Summarize and compress current session",
    handler: () => "Handled separately",
  },
  {
    name: "/cancel",
    description: "Dismiss this menu",
    handler: () => "",
  },
];

interface Props {
  systemPrompt: string;
  initialMessages: Message[];
}

export default function App({ systemPrompt, initialMessages }: Props) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMemories, setSavedMemories] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const streamingRef = useRef("");

  const suggestions = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const lower = input.toLowerCase();
    const base = lower.split(" ")[0];
    return SLASH_COMMAND_LIST.filter((c) => c.name.startsWith(base));
  }, [input]);

  const handleChange = useCallback((value: string) => {
    setInput(value);
    setSelectedSuggestion(0);
  }, []);

  useInput((ch, key) => {
    if (key.escape || (key.ctrl && ch.toLowerCase() === "c")) {
      exit();
      return;
    }

    if (suggestions.length === 0) return;

    if (key.upArrow) {
      setSelectedSuggestion((prev) =>
        prev === 0 ? suggestions.length - 1 : prev - 1,
      );
    } else if (key.downArrow) {
      setSelectedSuggestion((prev) =>
        prev === suggestions.length - 1 ? 0 : prev + 1,
      );
    } else if (key.tab) {
      const cmd = suggestions[selectedSuggestion];
      setInput(cmd?.takesArgs ? cmd.name + " " : cmd?.name ?? input);
      setSelectedSuggestion(0);
    }
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      const raw = value.trim();
      if (!raw || isLoading) return;

      if (raw.startsWith("/")) {
        const spaceIdx = raw.indexOf(" ");
        const cmdName = spaceIdx === -1 ? raw.toLowerCase() : raw.slice(0, spaceIdx).toLowerCase();
        const cmdArgs = spaceIdx === -1 ? undefined : raw.slice(spaceIdx + 1).trim();

        const resolved =
          SLASH_COMMAND_LIST.find((c) => c.name === cmdName)
            ? cmdName
            : (suggestions[selectedSuggestion]?.name ?? cmdName);

        if (resolved === "/cancel") {
          setInput("");
          return;
        }

        setInput("");

        // /resume needs special handling to swap messages state
        if (resolved === "/resume") {
          if (!cmdArgs) {
            setMessages((prev) => [
              ...prev,
              { role: "user", content: raw, timestamp: new Date().toISOString() },
              { role: "assistant", content: "Usage: /resume <session_id>", timestamp: new Date().toISOString() },
            ]);
            return;
          }
          const session = resumeSession(cmdArgs);
          if (!session) {
            setMessages((prev) => [
              ...prev,
              { role: "user", content: raw, timestamp: new Date().toISOString() },
              { role: "assistant", content: `Session "${cmdArgs}" not found.`, timestamp: new Date().toISOString() },
            ]);
            return;
          }
          setMessages(session.messages);
          return;
        }

        // /compact needs async handling
        if (resolved === "/compact") {
          setInput("");
          setIsLoading(true);
          try {
            const transcript = messages
              .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
              .join("\n\n");
            const summary = await summarize(
              "Summarize this conversation in 3-5 bullet points, preserving key facts, decisions, and action items. Be concise.",
              transcript,
            );
            const compactMsg: Message = {
              role: "assistant",
              content: `Session compacted:\n\n${summary}`,
              timestamp: new Date().toISOString(),
            };
            setMessages([compactMsg]);
            embedSessionWithSummary(summary);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setIsLoading(false);
          }
          return;
        }

        const slashCmd = SLASH_COMMAND_LIST.find((c) => c.name === resolved);
        const userMsg: Message = { role: "user", content: raw, timestamp: new Date().toISOString() };
        const responseText = slashCmd
          ? await slashCmd.handler(cmdArgs)
          : `Unknown command: ${resolved}`;
        const cmdResponse: Message = { role: "assistant", content: responseText, timestamp: new Date().toISOString() };
        setMessages((prev) => [...prev, userMsg, cmdResponse]);
        return;
      }

      const userMsg: Message = {
        role: "user",
        content: raw,
        timestamp: new Date().toISOString(),
      };
      const nextMessages = [...messages, userMsg];
      setInput("");
      setMessages(nextMessages);
      setIsLoading(true);
      setError(null);
      appendMessage(userMsg);

      try {
        streamingRef.current = "";

        const placeholderMsg: Message = {
          role: "assistant",
          content: "",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, placeholderMsg]);

        const activePrompt = isVectorEnabled()
          ? await buildAugmentedPrompt(raw)
          : systemPrompt;

        const responseText = await chatWithTools(
          activePrompt,
          nextMessages,
          (token) => {
            streamingRef.current += token;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: streamingRef.current,
              };
              return updated;
            });
          },
          (toolName) => {
            streamingRef.current += `\n\n🔧 Using ${toolName}...\n`;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: streamingRef.current,
              };
              return updated;
            });
          },
        );

        const finalMsg: Message = {
          role: "assistant",
          content: responseText,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = finalMsg;
          return updated;
        });
        appendMessage(finalMsg);
        embedCurrentSession();

        const memories = extractAndSaveMemories(responseText);
        if (memories.length > 0) setSavedMemories(memories);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, systemPrompt, suggestions, selectedSuggestion],
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Header />

      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        <MessageList messages={messages} />
      </Box>

      {savedMemories.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          {savedMemories.map((m, i) => (
            <Text key={i} color="yellow">
              ✦ Memory saved: {m}
            </Text>
          ))}
        </Box>
      )}

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {suggestions.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
          marginBottom={0}
        >
          {suggestions.map((cmd, i) => {
            const isSelected = i === selectedSuggestion;
            const isCancel = cmd.name === "/cancel";
            return (
              <Box key={cmd.name} gap={1}>
                <Text bold={isSelected} color={isSelected ? (isCancel ? "red" : "cyan") : undefined}>
                  {isSelected ? "›" : " "}
                </Text>
                <Text bold={isSelected} color={isSelected ? (isCancel ? "red" : "cyan") : undefined} dimColor={!isSelected && isCancel}>
                  {cmd.name}
                </Text>
                <Text dimColor>{cmd.description}</Text>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>↑↓ navigate • Tab complete • Enter run</Text>
          </Box>
        </Box>
      )}

      <InputBox
        value={input}
        isLoading={isLoading}
        onChange={handleChange}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
