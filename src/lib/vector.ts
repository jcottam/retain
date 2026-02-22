import { Index } from "@upstash/vector";

type VectorMeta = {
  type: "session" | "memory" | "message_chunk";
  sessionId?: string;
  sessionTitle?: string;
  fact?: string;
  category?: string;
  date?: string;
};

let _index: Index<VectorMeta> | null = null;

function getIndex(): Index<VectorMeta> | null {
  if (_index) return _index;

  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) return null;

  _index = new Index<VectorMeta>({ url, token });
  return _index;
}

export function isVectorEnabled(): boolean {
  return !!(process.env.UPSTASH_VECTOR_REST_URL && process.env.UPSTASH_VECTOR_REST_TOKEN);
}

export async function upsertSessionSummary(
  sessionId: string,
  title: string,
  summary: string,
  date: string,
): Promise<void> {
  const index = getIndex();
  if (!index) return;

  await index.upsert({
    id: `session:${sessionId}`,
    data: summary,
    metadata: {
      type: "session",
      sessionId,
      sessionTitle: title,
      date,
    },
  });
}

export async function upsertMemory(
  memoryId: number,
  fact: string,
  category: string,
): Promise<void> {
  const index = getIndex();
  if (!index) return;

  await index.upsert({
    id: `memory:${memoryId}`,
    data: fact,
    metadata: {
      type: "memory",
      fact,
      category,
    },
  });
}

export async function upsertMessageChunk(
  sessionId: string,
  chunkId: string,
  content: string,
  date: string,
): Promise<void> {
  const index = getIndex();
  if (!index) return;

  await index.upsert({
    id: `chunk:${chunkId}`,
    data: content,
    metadata: {
      type: "message_chunk",
      sessionId,
      date,
    },
  });
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: VectorMeta;
}

export async function queryRelevantContext(
  query: string,
  topK = 5,
  typeFilter?: "session" | "memory" | "message_chunk",
): Promise<VectorSearchResult[]> {
  const index = getIndex();
  if (!index) return [];

  const filter = typeFilter ? `type = '${typeFilter}'` : undefined;

  const results = await index.query<VectorMeta>({
    data: query,
    topK,
    includeMetadata: true,
    filter,
  });

  return results.map((r) => ({
    id: String(r.id),
    score: r.score,
    metadata: r.metadata!,
  }));
}

export async function queryRelevantMemories(query: string, topK = 10): Promise<VectorSearchResult[]> {
  return queryRelevantContext(query, topK, "memory");
}

export async function queryRelevantSessions(query: string, topK = 5): Promise<VectorSearchResult[]> {
  return queryRelevantContext(query, topK, "session");
}

export async function deleteVector(id: string): Promise<void> {
  const index = getIndex();
  if (!index) return;

  await index.delete(id);
}
