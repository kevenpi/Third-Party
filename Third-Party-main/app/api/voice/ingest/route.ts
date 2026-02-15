import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as storage from "@/lib/voice/speakerStorage";
import { toWav16kMono } from "@/lib/voice/audioConvert";

export const runtime = "nodejs";
export const maxDuration = 30;

const CONVO_GAP_MS = Number(process.env.CONVO_GAP_MS ?? "600000"); // 10 min
const userId = "default";

/**
 * POST: upload audio chunk. Creates chunk record and saves file.
 * Body: formData with "audio" file.
 * Returns: { chunkId, conversationId? } (conversationId if grouped with previous).
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("audio") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing 'audio' file" }, { status: 400 });
    }

    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    const wav = await toWav16kMono(buffer);
    if (wav) buffer = wav as Buffer;
    const now = new Date();
    const duration_ms = buffer[0] === 0x52 && buffer[1] === 0x49
      ? Math.max(1, Math.round(((buffer.length - 44) / (16000 * 2)) * 1000))
      : Math.max(1, Math.round((buffer.length / 32) * 1000));
    const started_at = now.getTime() - duration_ms;
    const ended_at = now.getTime();

    const chunkId = randomUUID();
    const audioPath = storage.saveChunkAudio(chunkId, buffer);
    const chunk = storage.saveAudioChunk({
      id: chunkId,
      user_id: userId,
      source: "upload",
      started_at: new Date(started_at).toISOString(),
      ended_at: new Date(ended_at).toISOString(),
      duration_ms,
      storage_path: audioPath,
      created_at: now.toISOString(),
    });

    // Optional: group with recent chunks into conversation (simplified: one chunk = one convo for now)
    const convo = storage.saveConversation({
      user_id: userId,
      started_at: chunk.started_at,
      ended_at: chunk.ended_at,
      chunk_ids: [chunk.id],
      created_at: now.toISOString(),
    });

    return NextResponse.json({
      chunkId: chunk.id,
      conversationId: convo.id,
      duration_ms,
    });
  } catch (err) {
    console.error("Ingest error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingest failed" },
      { status: 500 }
    );
  }
}
