import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";

interface Props {
  value: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export default function InputBox({ value, isLoading, onChange, onSubmit }: Props) {
  if (isLoading) {
    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text dimColor> Thinking…</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">{"› "}</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="Type a message and press Enter…"
        focus={!isLoading}
      />
    </Box>
  );
}
