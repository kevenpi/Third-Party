/**
 * Domain types for the voice pipeline:
 * OpenAI diarization → speaker embeddings → global speaker clustering.
 */

export type DiarizedSegment = {
  speaker: string; // local label: "S0", "S1", "A", "B", ...
  start_ms: number;
  end_ms: number;
  text: string;
  confidence?: number;
};

export type Embedding = number[];

export type AudioChunk = {
  id: string;
  user_id: string;
  source: "mic" | "call" | "upload";
  started_at: string; // ISO
  ended_at: string;
  duration_ms: number;
  storage_path: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  chunk_ids: string[];
  title?: string;
  created_at: string;
};

export type TranscriptSegment = {
  id: string;
  conversation_id: string;
  chunk_id: string;
  speaker_local: string;
  speaker_global_id: string | null;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence?: number;
  created_at: string;
};

export type Speaker = {
  id: string;
  user_id: string;
  display_name: string | null;
  centroid: Embedding;
  created_at: string;
  last_seen_at: string;
};

export type SpeakerEmbeddingRecord = {
  id: string;
  speaker_id: string;
  model: string;
  embedding: Embedding;
  created_at: string;
  source_segment_id?: string;
};
