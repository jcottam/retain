import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "../types";
import { TOOL_DEFINITIONS, executeTool } from "./tools";

export const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 10;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
    process.exit(1);
  }
  return new Anthropic({ apiKey });
}

export async function chat(
  systemPrompt: string,
  messages: Message[]
): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected response type: ${block.type}`);
  }
  return block.text;
}

export async function chatStream(
  systemPrompt: string,
  messages: Message[],
  onToken: (token: string) => void
): Promise<string> {
  const client = getClient();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  let fullText = "";

  stream.on("text", (text) => {
    fullText += text;
    onToken(text);
  });

  await stream.finalMessage();
  return fullText;
}

type ToolCallback = (toolName: string, toolInput: Record<string, unknown>) => void;

/**
 * Chat with tool use support. Handles the agent loop: if the model
 * requests tool calls, executes them and feeds results back until
 * the model produces a final text response.
 */
export async function chatWithTools(
  systemPrompt: string,
  messages: Message[],
  onToken: (token: string) => void,
  onToolUse?: ToolCallback,
): Promise<string> {
  const client = getClient();
  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let rounds = 0;
  let finalText = "";

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages: apiMessages,
    });

    let roundText = "";

    stream.on("text", (text) => {
      roundText += text;
      onToken(text);
    });

    const response = await stream.finalMessage();

    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolUseBlocks.push(block);
      }
    }

    if (toolUseBlocks.length === 0) {
      finalText = roundText;
      break;
    }

    apiMessages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolBlock of toolUseBlocks) {
      onToolUse?.(toolBlock.name, toolBlock.input as Record<string, unknown>);

      const result = executeTool(toolBlock.name, toolBlock.input as Record<string, unknown>);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolBlock.id,
        content: result,
      });
    }

    apiMessages.push({ role: "user", content: toolResults });
  }

  return finalText;
}

export async function summarize(
  systemPrompt: string,
  content: string
): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected response type: ${block.type}`);
  }
  return block.text;
}
