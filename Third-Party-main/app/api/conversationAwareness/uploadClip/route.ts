import { NextResponse } from "next/server";
import { UploadRecordedClipSchema } from "@/lib/schemas";
import { attachRecordedClip } from "@/lib/conversationAwareness";
import { resolveRecordedClipPath } from "@/lib/awarenessStorage";
import * as voiceStorage from "@/lib/voice/speakerStorage";
import { processConversation } from "@/lib/voice/processConversation";
import { toWav16kMono } from "@/lib/voice/audioConvert";
import { randomUUID } from "crypto";
import fs from "fs";
import { saveTimelineBubbleFromSession } from "@/lib/timelineStorage";
import { classifyRealConversation } from "@/services/claudeService";

export async function POST(request: Request) {
  try {
    const body = UploadRecordedClipSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid request", details: body.error.flatten() },
        { status: 400 }
      );
    }

    const session = await attachRecordedClip(
      body.data.sessionId,
      body.data.audioBase64,
      body.data.mimeType
    );

    if (!session) {
      return NextResponse.json({ error: "Recording session not found" }, { status: 404 });
    }

    // Use the same OpenAI + speaker-memory pipeline as the old Voice tab.
    let voicePipeline: {
      conversationId: string;
      segmentCount: number;
      speakersCreated: number;
      fullTranscript?: string;
      transcriptSnippet?: string;
      highlights?: Array<{
        id: string;
        timestampSec: number;
        label: string;
        type: "observation" | "missed_bid" | "pattern" | "positive" | "neutral";
      }>;
    } | null = null;
    try {
      const latestClip = session.clipPaths[session.clipPaths.length - 1];
      if (latestClip && process.env.OPENAI_API_KEY) {
        const clipAbs = resolveRecordedClipPath(latestClip);
        if (fs.existsSync(clipAbs)) {
          const raw = fs.readFileSync(clipAbs);
          const wav = await toWav16kMono(raw);
          const finalBuffer = wav ?? raw;
          const now = new Date();
          const chunkId = randomUUID();
          const audioPath = voiceStorage.saveChunkAudio(chunkId, finalBuffer);
          const durationMs = wav
            ? Math.max(1, Math.round(((finalBuffer.length - 44) / (16000 * 2)) * 1000))
            : Math.max(1, Math.round((finalBuffer.length / 32000) * 1000));
          const startedAt = new Date(now.getTime() - durationMs).toISOString();
          const endedAt = now.toISOString();

          voiceStorage.saveAudioChunk({
            id: chunkId,
            user_id: "default",
            source: "upload",
            started_at: startedAt,
            ended_at: endedAt,
            duration_ms: durationMs,
            storage_path: audioPath,
            created_at: now.toISOString(),
          });
          const convo = voiceStorage.saveConversation({
            user_id: "default",
            started_at: startedAt,
            ended_at: endedAt,
            chunk_ids: [chunkId],
            created_at: now.toISOString(),
          });

          const processed = await processConversation(convo.id, "default", {
            preferredPartnerName: session.faceIdentification?.personName,
          });
          const namedSpeakers = voiceStorage.loadSpeakers("default");
          const speakerLabel = (speakerId: string | null, fallback: string) => {
            if (!speakerId) return fallback;
            return namedSpeakers.find((s) => s.id === speakerId)?.display_name ?? fallback;
          };
          const transcriptSnippet = processed.segments
            .slice(0, 6)
            .map((seg) => `${speakerLabel(seg.speaker_global_id, seg.speaker_local)}: ${seg.text}`)
            .join(" ")
            .slice(0, 420);
          const fullTranscript = processed.segments
            .map((seg) => `${speakerLabel(seg.speaker_global_id, seg.speaker_local)}: ${seg.text}`)
            .join("\n")
            .slice(0, 8000);
          const highlights = processed.segments
            .filter((seg) => seg.text.trim().length >= 25)
            .slice(0, 5)
            .map((seg, index) => ({
              id: `seg-${index}-${seg.start_ms}`,
              timestampSec: Math.max(0, Math.round(seg.start_ms / 1000)),
              label: `${speakerLabel(seg.speaker_global_id, seg.speaker_local)}: ${seg.text.slice(0, 120)}`,
              type: "neutral" as const,
            }));
          voicePipeline = {
            conversationId: convo.id,
            segmentCount: processed.segments.length,
            speakersCreated: processed.speakersCreated,
            fullTranscript,
            transcriptSnippet,
            highlights,
          };
        }
      }
    } catch (e) {
      console.warn("Voice pipeline parse failed for clip:", e);
    }

    const transcriptForDecision =
      voicePipeline?.fullTranscript
      ?? voicePipeline?.transcriptSnippet
      ?? "";
    const classification = await classifyRealConversation(transcriptForDecision);
    const qualifiesConversation = classification.isConversation && classification.confidence >= 0.45;

    const bubble = session.endedAt && qualifiesConversation
      ? await saveTimelineBubbleFromSession(session, {
          voiceConversationId: voicePipeline?.conversationId,
          audioClipPath: session.clipPaths[session.clipPaths.length - 1],
          transcriptSnippet: voicePipeline?.transcriptSnippet,
          highlightPoints: voicePipeline?.highlights,
        })
      : null;

    return NextResponse.json({
      session,
      voicePipeline,
      classification: {
        ...classification,
        qualifiesConversation,
      },
      bubble,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
