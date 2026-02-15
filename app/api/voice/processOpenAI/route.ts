import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as storage from "@/lib/voice/speakerStorage";
import { processConversation } from "@/lib/voice/processConversation";
import { toWav16kMono } from "@/lib/voice/audioConvert";
import { hasOpenAIApiKey } from "@/lib/openaiKey";

export const runtime = "nodejs";
export const maxDuration = 120;

const userId = "default";

/**
 * POST: run full pipeline (OpenAI transcribe+diarize → embeddings → speaker clustering).
 * Body (JSON): { conversationId: string } OR formData with "audio" file (then we create chunk+convo and process).
 * Returns: { segments, speakers, speakersCreated } with global speaker IDs and optional display_name.
 */
export async function POST(request: NextRequest) {
  try {
    if (!hasOpenAIApiKey()) {
      return NextResponse.json(
        { error: "OpenAI key not set. Required for transcription + diarization." },
        { status: 503 }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    let conversationId: string | null = null;
    let audioBuffer: Buffer | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("audio") as File | null;
      if (file) {
        audioBuffer = Buffer.from(await file.arrayBuffer());
      }
    } else {
      const body = await request.json().catch(() => ({}));
      conversationId = (body.conversationId as string) || null;
    }

    if (!conversationId && !audioBuffer) {
      return NextResponse.json(
        { error: "Provide conversationId (JSON) or audio file (formData)." },
        { status: 400 }
      );
    }

    if (audioBuffer && !conversationId) {
      const now = new Date();
      const chunkId = randomUUID();
      const wav = await toWav16kMono(audioBuffer);
      const finalBuffer = wav ?? audioBuffer;
      const audioPath = storage.saveChunkAudio(chunkId, finalBuffer);
      const duration_ms = wav
        ? Math.round((finalBuffer.length - 44) / (16000 * 2)) * 1000
        : Math.round((finalBuffer.length / 32000) * 1000);
      const started_at = new Date(now.getTime() - duration_ms).toISOString();
      const ended_at = now.toISOString();
      storage.saveAudioChunk({
        id: chunkId,
        user_id: userId,
        source: "upload",
        started_at,
        ended_at,
        duration_ms,
        storage_path: audioPath,
        created_at: now.toISOString(),
      });
      const convo = storage.saveConversation({
        user_id: userId,
        started_at,
        ended_at,
        chunk_ids: [chunkId],
        created_at: now.toISOString(),
      });
      conversationId = convo.id;
    }

    const { segments, speakersCreated } = await processConversation(conversationId!, userId);
    const speakers = storage.loadSpeakers(userId);
    const speakerMap = new Map(speakers.map((s) => [s.id, s]));

    const segmentsWithName = segments.map((s) => ({
      ...s,
      speaker_display_name: s.speaker_global_id ? speakerMap.get(s.speaker_global_id)?.display_name ?? null : null,
    }));

    return NextResponse.json({
      conversationId,
      segments: segmentsWithName,
      speakers: speakers.map((s) => ({ id: s.id, display_name: s.display_name, last_seen_at: s.last_seen_at })),
      speakersCreated,
    });
  } catch (err) {
    console.error("Process error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Process failed" },
      { status: 500 }
    );
  }
}
