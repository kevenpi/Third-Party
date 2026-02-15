/**
 * File-based storage for the voice pipeline (no Postgres).
 * Data lives under data/voice/ in JSON files.
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { AudioChunk, Conversation, DiarizedSegment, Embedding, Speaker, TranscriptSegment } from "./types";
import { getDataRoot } from "@/lib/runtimePaths";

const DATA_ROOT = path.join(getDataRoot(), "voice");
const CHUNKS_DIR = path.join(DATA_ROOT, "chunks");
const CHUNKS_AUDIO_DIR = path.join(CHUNKS_DIR, "audio");
const CONVOS_DIR = path.join(DATA_ROOT, "conversations");
const SEGMENTS_DIR = path.join(DATA_ROOT, "segments");
const SPEAKERS_DIR = path.join(DATA_ROOT, "speakers");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function initDirs() {
  ensureDir(DATA_ROOT);
  ensureDir(CHUNKS_DIR);
  ensureDir(CHUNKS_AUDIO_DIR);
  ensureDir(CONVOS_DIR);
  ensureDir(SEGMENTS_DIR);
  ensureDir(SPEAKERS_DIR);
}

const userId = () => "default"; // single-user for now

export function getAudioChunkMetaPath(chunkId: string): string {
  return path.join(CHUNKS_DIR, `${chunkId}.json`);
}

/** Path where chunk audio is stored (wav). */
export function getChunkAudioFilePath(chunkId: string): string {
  return path.join(CHUNKS_AUDIO_DIR, `${chunkId}.wav`);
}

/** Save raw audio bytes for a chunk. Returns absolute path. */
export function saveChunkAudio(chunkId: string, buffer: Buffer): string {
  initDirs();
  const p = getChunkAudioFilePath(chunkId);
  fs.writeFileSync(p, buffer);
  return p;
}

export function getAudioChunkPath(chunkId: string): string {
  return getAudioChunkMetaPath(chunkId);
}

export function saveAudioChunk(chunk: Omit<AudioChunk, "id"> & { id?: string }): AudioChunk {
  initDirs();
  const id = chunk.id ?? randomUUID();
  const full: AudioChunk = {
    ...chunk,
    id,
    created_at: chunk.created_at ?? new Date().toISOString(),
  };
  fs.writeFileSync(getAudioChunkMetaPath(id), JSON.stringify(full, null, 2));
  return full;
}

export function getAudioChunk(chunkId: string): AudioChunk | null {
  const p = getAudioChunkMetaPath(chunkId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function saveConversation(
  convo: Omit<Conversation, "id"> & { id?: string }
): Conversation {
  initDirs();
  const id = convo.id ?? randomUUID();
  const full: Conversation = {
    ...convo,
    id,
    created_at: convo.created_at ?? new Date().toISOString(),
  };
  const userDir = path.join(CONVOS_DIR, convo.user_id);
  ensureDir(userDir);
  fs.writeFileSync(path.join(userDir, `${id}.json`), JSON.stringify(full, null, 2));
  return full;
}

export function getConversation(conversationId: string, uid?: string): Conversation | null {
  initDirs();
  const u = uid ?? userId();
  const p = path.join(CONVOS_DIR, u, `${conversationId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function listConversations(uid?: string): Conversation[] {
  initDirs();
  const u = uid ?? userId();
  const userDir = path.join(CONVOS_DIR, u);
  if (!fs.existsSync(userDir)) return [];
  const files = fs.readdirSync(userDir).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(userDir, f), "utf-8")) as Conversation;
      } catch {
        return null;
      }
    })
    .filter((c): c is Conversation => c !== null)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
}

export function getSpeakerCandidates(uid: string): { speakerId: string; centroid: Embedding }[] {
  initDirs();
  const userFile = path.join(SPEAKERS_DIR, `${uid}.json`);
  if (!fs.existsSync(userFile)) return [];
  const data = JSON.parse(fs.readFileSync(userFile, "utf-8")) as {
    speakers: Speaker[];
  };
  return (data.speakers ?? []).map((s) => ({ speakerId: s.id, centroid: s.centroid }));
}

export function loadSpeakers(uid: string): Speaker[] {
  initDirs();
  const userFile = path.join(SPEAKERS_DIR, `${uid}.json`);
  if (!fs.existsSync(userFile)) return [];
  const data = JSON.parse(fs.readFileSync(userFile, "utf-8")) as { speakers: Speaker[] };
  return data.speakers ?? [];
}

export function saveSpeakers(uid: string, speakers: Speaker[]): void {
  initDirs();
  fs.writeFileSync(
    path.join(SPEAKERS_DIR, `${uid}.json`),
    JSON.stringify({ speakers }, null, 2)
  );
}

export function createSpeaker(uid: string, centroid: Embedding, displayName?: string | null): Speaker {
  const speakers = loadSpeakers(uid);
  const now = new Date().toISOString();
  const speaker: Speaker = {
    id: randomUUID(),
    user_id: uid,
    display_name: displayName ?? null,
    centroid,
    created_at: now,
    last_seen_at: now,
  };
  speakers.push(speaker);
  saveSpeakers(uid, speakers);
  return speaker;
}

export function updateSpeakerCentroid(uid: string, speakerId: string, centroid: Embedding): void {
  const speakers = loadSpeakers(uid);
  const s = speakers.find((x) => x.id === speakerId);
  if (!s) return;
  s.centroid = centroid;
  s.last_seen_at = new Date().toISOString();
  saveSpeakers(uid, speakers);
}

export function saveTranscriptSegments(
  conversationId: string,
  chunkId: string,
  segments: TranscriptSegment[]
): void {
  initDirs();
  const file = path.join(SEGMENTS_DIR, `${conversationId}_${chunkId}.json`);
  fs.writeFileSync(file, JSON.stringify(segments, null, 2));
}

export function getTranscriptSegments(conversationId: string, chunkId: string): TranscriptSegment[] {
  const file = path.join(SEGMENTS_DIR, `${conversationId}_${chunkId}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function getConversationSegments(conversationId: string): TranscriptSegment[] {
  const convo = getConversation(conversationId);
  if (!convo) return [];
  const all: TranscriptSegment[] = [];
  for (const cid of convo.chunk_ids) {
    const segs = getTranscriptSegments(conversationId, cid);
    all.push(...segs);
  }
  all.sort((a, b) => a.start_ms - b.start_ms);
  return all;
}

/** List conversation IDs that contain at least one segment from this speaker. */
export function getConversationIdsBySpeaker(uid: string, speakerId: string): string[] {
  initDirs();
  const userConvosDir = path.join(CONVOS_DIR, uid);
  if (!fs.existsSync(userConvosDir)) return [];
  const convoIds = fs.readdirSync(userConvosDir).map((f) => path.basename(f, ".json"));
  const out: string[] = [];
  for (const cid of convoIds) {
    const segs = getConversationSegments(cid);
    if (segs.some((s) => s.speaker_global_id === speakerId)) out.push(cid);
  }
  return out;
}
