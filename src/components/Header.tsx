import React from "react";
import { Box, Text } from "ink";
import { MODEL } from "../lib/anthropic";

// const LOGO_LINES = [
//   " ███╗   ███╗██╗███╗   ██╗██╗ ██████╗██╗  ██╗ █████╗ ████████╗",
//   " ████╗ ████║██║████╗  ██║██║██╔════╝██║  ██║██╔══██╗╚══██╔══╝",
//   " ██╔████╔██║██║██╔██╗ ██║██║██║     ███████║███████║   ██║   ",
//   " ██║╚██╔╝██║██║██║╚██╗██║██║██║     ██╔══██║██╔══██║   ██║   ",
//   " ██║ ╚═╝ ██║██║██║ ╚████║██║╚██████╗██║  ██║██║  ██║   ██║   ",
//   " ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ",
// ];

export default function Header() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* {LOGO_LINES.map((line, i) => (
        <Text key={i} bold color="cyan">
          {line}
        </Text>
      ))} */}
      <Text bold color="cyan">MiniChat</Text>
      <Box marginTop={1}>
        <Text dimColor>Terminal AI Chat</Text>
        <Text dimColor> • {MODEL} • </Text>
        <Text color="cyan">/help</Text>
        <Text dimColor> for commands • built by John Ryan Cottam</Text>
      </Box>
    </Box>
  );
}
