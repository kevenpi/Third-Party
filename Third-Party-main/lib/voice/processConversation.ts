/**
 * Pipeline: transcribe + diarize (OpenAI) → speaker embedding → match/create global speaker → persist segments.
 */

import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { transcribeDiarize } from "./openaiTranscribe";
import { computeSpeakerEmbedding } from "./speakerEmbedding";
import { matchSpeaker, updateCentroid } from "./speakerClustering";
import { extractSpeakerBuffersBySegmentMs } from "./audioSlice";
import * as storage from "./speakerStorage";
import type { DiarizedSegment, TranscriptSegment } from "./types";

const SPEAKER_MATCH_THRESHOLD = Number(process.env.SPEAKER_MATCH_THRESHOLD ?? "0.72");

function getChunkAudioPath(storagePath: string): string {
  if (path.isAbsolute(storagePath)) return storagePath;
  return path.join(process.cwd(), storagePath);
}

function groupBy<T>(arr: T[], keyFn: (t: T) => string): Record<string, T[]> {
  const m: Record<string, T[]> = {};
  for (const item of arr) {
    const k = keyFn(item);
    (m[k] ??= []).push(item);
  }
  return m;
}

/**
 * Process one conversation: for each chunk, transcribe+diarize, then for each local speaker
 * extract audio, compute embedding, match or create global speaker, backfill segment speaker_global_id.
 */
export async function processConversation(
  conversationId: string,
  userId: string = "default",
  options?: { preferredPartnerName?: string }
): Promise<{ segments: TranscriptSegment[]; speakersCreated: number }> {
  const convo = storage.getConversation(conversationId, userId);
  if (!convo) throw new Error("Conversation not found");

  let speakersCreated = 0;
  const speakerCandidates = storage.getSpeakerCandidates(userId);

  for (const chunkId of convo.chunk_ids) {
    const chunk = storage.getAudioChunk(chunkId);
    if (!chunk) continue;

    const audioPath = getChunkAudioPath(chunk.storage_path);
    if (!fs.existsSync(audioPath)) continue;

    const buffer = fs.readFileSync(audioPath);
    const { segments } = await transcribeDiarize(buffer, { language: "en" });

    const byLocalSpeaker = groupBy(segments, (s) => s.speaker);
    const segmentRecords: TranscriptSegment[] = segments.map((s) => ({
      id: randomUUID(),
      conversation_id: conversationId,
      chunk_id: chunkId,
      speaker_local: s.speaker,
      speaker_global_id: null,
      start_ms: s.start_ms,
      end_ms: s.end_ms,
      text: s.text,
      confidence: s.confidence,
      created_at: new Date().toISOString(),
    }));

    for (const [speakerLocal, segs] of Object.entries(byLocalSpeaker)) {
      const speakerBuffers = extractSpeakerBuffersBySegmentMs(buffer, segs);
      const wav = speakerBuffers.get(speakerLocal);
      if (!wav || wav.length < 8000) continue; // need at least ~0.25s for placeholder embed

      const embedding = await computeSpeakerEmbedding(wav);
      const match = matchSpeaker(embedding, speakerCandidates, SPEAKER_MATCH_THRESHOLD);

      let speakerGlobalId: string;
      if (!match.speakerId) {
        const speaker = storage.createSpeaker(userId, embedding, null);
        speakerGlobalId = speaker.id;
        speakerCandidates.push({ speakerId: speaker.id, centroid: speaker.centroid });
        speakersCreated++;
      } else {
        speakerGlobalId = match.speakerId;
        const old = speakerCandidates.find((c) => c.speakerId === speakerGlobalId)!.centroid;
        const updated = updateCentroid(old, embedding);
        storage.updateSpeakerCentroid(userId, speakerGlobalId, updated);
        const idx = speakerCandidates.findIndex((c) => c.speakerId === speakerGlobalId);
        if (idx >= 0) speakerCandidates[idx].centroid = updated;
      }

      for (const rec of segmentRecords) {
        if (rec.speaker_local === speakerLocal) rec.speaker_global_id = speakerGlobalId;
      }
    }

    storage.saveTranscriptSegments(conversationId, chunkId, segmentRecords);
  }

  const allSegments = storage.getConversationSegments(conversationId);
  if (options?.preferredPartnerName) {
    const speakers = storage.loadSpeakers(userId);
    const speakingDurations = new Map<string, number>();
    for (const seg of allSegments) {
      if (!seg.speaker_global_id) continue;
      const duration = Math.max(1, seg.end_ms - seg.start_ms);
      speakingDurations.set(
        seg.speaker_global_id,
        (speakingDurations.get(seg.speaker_global_id) ?? 0) + duration
      );
    }
    const preferredSpeakerId = [...speakingDurations.entries()]
      .sort((a, b) => b[1] - a[1])
      .find(([speakerId]) => {
        const display = (speakers.find((s) => s.id === speakerId)?.display_name ?? "").toLowerCase();
        return display !== "me" && display !== "self";
      })?.[0];
    if (preferredSpeakerId) {
      const speaker = speakers.find((s) => s.id === preferredSpeakerId);
      if (speaker && !speaker.display_name) {
        speaker.display_name = options.preferredPartnerName.trim();
        storage.saveSpeakers(userId, speakers);
      }
    }
  }
  return { segments: allSegments, speakersCreated };
}
