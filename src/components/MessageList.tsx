import React from "react";
import { Box, Text } from "ink";
import type { Message } from "../types";

interface Props {
  messages: Message[];
}

export default function MessageList({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text dimColor>No messages yet. Type something to begin.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {messages.map((msg, i) => (
        <Box key={`${msg.role}-${i}-${msg.timestamp}`} flexDirection="column">
          <Text color={msg.role === "user" ? "cyan" : "green"} bold>
            {msg.role === "user" ? "[you]" : "[claude]"}
          </Text>
          <Text wrap="wrap">{msg.content}</Text>
        </Box>
      ))}
    </Box>
  );
}
