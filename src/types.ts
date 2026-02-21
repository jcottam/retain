export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  tags: string[];
  messages: Message[];
}
