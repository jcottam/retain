import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import MessageList from "./MessageList";
import InputBox from "./InputBox";
import { chat } from "../lib/anthropic";
import { appendMessage } from "../lib/session";
import { extractAndSaveMemories } from "../lib/memory";
import type { Message } from "../types";

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

  useInput((_, key) => {
    if (key.escape || (key.ctrl && _.toLowerCase() === "c")) {
      exit();
    }
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isLoading) return;

      const userMsg: Message = {
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setIsLoading(true);
      setError(null);
      appendMessage(userMsg);

      try {
        const responseText = await chat(systemPrompt, nextMessages);
        const assistantMsg: Message = {
          role: "assistant",
          content: responseText,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        appendMessage(assistantMsg);

        const memories = extractAndSaveMemories(responseText);
        if (memories.length > 0) setSavedMemories(memories);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, systemPrompt]
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">
          Retain
        </Text>
        <Text dimColor>  claude-3-5-sonnet  •  Ctrl+C to quit</Text>
      </Box>

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

      <InputBox
        value={input}
        isLoading={isLoading}
        onChange={setInput}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
