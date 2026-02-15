/**
 * Group raw audio chunks into conversations by silence gap.
 * Start new conversation when gap > gapMs between chunk end and next start.
 */

export type ChunkForGrouping = {
  id: string;
  started_at: number; // ms or unix
  ended_at: number;
};

export function groupChunksIntoConversations(
  chunks: ChunkForGrouping[],
  gapMs: number
): string[][] {
  const sorted = [...chunks].sort((a, b) => a.started_at - b.started_at);
  const conversations: string[][] = [];
  let cur: string[] = [];
  let lastEnd = -Infinity;

  for (const c of sorted) {
    if (cur.length === 0) {
      cur.push(c.id);
      lastEnd = c.ended_at;
      continue;
    }
    const gap = c.started_at - lastEnd;
    if (gap > gapMs) {
      conversations.push(cur);
      cur = [c.id];
    } else {
      cur.push(c.id);
    }
    lastEnd = Math.max(lastEnd, c.ended_at);
  }
  if (cur.length) conversations.push(cur);
  return conversations;
}
